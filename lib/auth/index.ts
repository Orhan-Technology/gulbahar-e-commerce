import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { shopForUser } from '../db/queries/shops';
import type { DbLocale, UserRole } from '../db/schema';
import { verifyOtp } from './otp';

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
