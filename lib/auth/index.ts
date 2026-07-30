import NextAuth, { type DefaultSession } from 'next-auth';
import { eq } from 'drizzle-orm';
import Credentials from 'next-auth/providers/credentials';

import { db } from '../db';
import { users } from '../db/schema';
import { shopForUser } from '../db/queries/shops';
import type { DbLocale, UserRole } from '../db/schema';
import { isDemoMode } from '../demo';
import { findUserByEmail, normalizeEmail } from './email';
import { findUserByPhone, verifyOtp } from './otp';
import { passwordAttemptAllowed, verifyPassword } from './password';

/**
 * Auth.js v5 with a phone + OTP credentials provider (PRD §5.7, §12.2).
 *
 * There is no password anywhere in the system. The provider's only job is to
 * hand the submitted code to verifyOtp, which owns the hashing, expiry, attempt
 * limit, and find-or-create.
 *
 * Session strategy is JWT rather than a database session table: sessions are
 * per-browser and disposable, and the demo control panel swaps roles by reissuing
 * a token rather than by mutating rows (PRD §9.3).
 *
 * NOTE ON RUNTIME: this module imports the database, so it must never be pulled
 * into proxy.ts (the locale middleware), which runs on the edge runtime. Route
 * protection therefore happens in server-component layouts — see ./guards.
 */

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      phone: string;
      locale: DbLocale;
      /** Present only for shopkeepers who belong to a shop. */
      shopId: string | null;
      shopSlug: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    role: UserRole;
    phone: string;
    locale: DbLocale;
    shopId: string | null;
    shopSlug: string | null;
  }
}

// v5 re-exports its JWT types from @auth/core; 'next-auth/jwt' is not a module here.
declare module '@auth/core/jwt' {
  interface JWT {
    role: UserRole;
    phone: string;
    locale: DbLocale;
    shopId: string | null;
    shopSlug: string | null;
  }
}

/** Does this user row still exist? See the jwt callback for why this matters. */
async function userExists(id: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  return Boolean(row);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // The demo runs on localhost with no proxy in front of it.
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      id: 'otp',
      name: 'Phone and OTP',
      credentials: {
        phone: { label: 'Phone', type: 'tel' },
        code: { label: 'Code', type: 'text' },
        name: { label: 'Name', type: 'text' },
      },
      async authorize(credentials) {
        const phone = typeof credentials?.phone === 'string' ? credentials.phone : '';
        const code = typeof credentials?.code === 'string' ? credentials.code : '';
        const name = typeof credentials?.name === 'string' ? credentials.name : undefined;

        const result = await verifyOtp(phone, code, { name });
        // Returning null surfaces as CredentialsSignin; the caller maps the
        // specific reason from its own verifyOtp call for a useful message.
        if (!result.ok) return null;

        const shop = await shopForUser(result.user.id);

        return {
          id: result.user.id,
          name: result.user.name,
          phone: result.user.phone,
          role: result.user.role,
          locale: result.user.locale,
          shopId: shop?.shopId ?? null,
          shopSlug: shop?.slug ?? null,
        };
      },
    }),

    /**
     * Email + password (Prompt A1) — a second, faster way into an account the
     * phone already created, never a second identity. Refuses uniformly for
     * "no such email", "email not verified", "no password set" and "wrong
     * password": authorize() returns null in every one of those cases, so the
     * caller sees a single indistinguishable failure and cannot use sign-in
     * attempts to discover which emails exist (see verifyPassword's comment
     * on the dummy-hash timing match for the same reason).
     */
    Credentials({
      id: 'email',
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? normalizeEmail(credentials.email) : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';

        if (!email || !password || !passwordAttemptAllowed(email)) return null;

        const found = await findUserByEmail(email);
        const eligible = found && found.emailVerifiedAt && found.passwordHash && found.active;

        // Always call verifyPassword, whether or not an eligible account was
        // found — passing null takes the same argon2-shaped time as a real
        // mismatch, which is the whole point of the dummy hash.
        const passwordOk = await verifyPassword(eligible ? found.passwordHash : null, password);
        if (!eligible || !passwordOk) return null;

        const shop = await shopForUser(found.id);

        return {
          id: found.id,
          name: found.name,
          phone: found.phone,
          role: found.role,
          locale: found.locale,
          shopId: shop?.shopId ?? null,
          shopSlug: shop?.slug ?? null,
        };
      },
    }),

    /**
     * DEMO ONLY — signs in as any existing account from a phone number alone, with
     * no code (PRD §9.3). This is what lets the presenter move between admin,
     * shopkeeper and customer mid-sentence instead of running the OTP dance three
     * times on stage.
     *
     * It is obviously a back door, so authorize() refuses unless DEMO_MODE is
     * literally 'true' AND the account already exists. It cannot create a user, and
     * it never touches otp_codes — so the real flow's attempt limits and expiry are
     * unaffected by anything that happens here.
     */
    Credentials({
      id: 'demo',
      name: 'Demo role switch',
      credentials: { phone: { label: 'Phone', type: 'tel' } },
      async authorize(credentials) {
        if (!isDemoMode()) return null;

        const phone = typeof credentials?.phone === 'string' ? credentials.phone : '';
        const user = await findUserByPhone(phone);
        // No find-or-create: the switcher only ever moves between seeded accounts.
        if (!user || !user.active) return null;

        const shop = await shopForUser(user.id);
        return {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          locale: user.locale,
          shopId: shop?.shopId ?? null,
          shopSlug: shop?.slug ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.sub = user.id;
        token.name = user.name;
        token.role = user.role;
        token.phone = user.phone;
        token.locale = user.locale;
        token.shopId = user.shopId;
        token.shopSlug = user.shopSlug;
      }

      /*
       * Re-resolve the shop link on an explicit session update. A shopkeeper who
       * registers a shop mid-session, or whose shop is approved live during the
       * demo, must not have to sign out and back in to see the dashboard.
       */
      if (trigger === 'update' && token.sub) {
        const shop = await shopForUser(token.sub);
        token.shopId = shop?.shopId ?? null;
        token.shopSlug = shop?.slug ?? null;
      }

      /*
       * A JWT is self-contained, so it keeps asserting a user id long after that row
       * has gone — and `npm run db:reset` (which the demo control panel runs, and the
       * README documents) gives every user a NEW uuid. The browser then looks signed
       * in, pages render, and every write fails on a foreign key to a user that no
       * longer exists. That surfaced as an unreadable "Failed query" on add-to-cart.
       *
       * So the token is only trusted while its subject still exists. Returning null
       * invalidates the session, and the visitor is simply signed out — which is the
       * honest outcome after the database was rebuilt underneath them.
       *
       * One primary-key lookup per session read is the price of not lying about who
       * is signed in.
       */
      if (token.sub && !(await userExists(token.sub))) return null;

      return token;
    },

    async session({ session, token }) {
      session.user.id = token.sub ?? '';
      session.user.role = token.role;
      session.user.phone = token.phone;
      session.user.locale = token.locale;
      session.user.shopId = token.shopId;
      session.user.shopSlug = token.shopSlug;
      return session;
    },
  },
});
