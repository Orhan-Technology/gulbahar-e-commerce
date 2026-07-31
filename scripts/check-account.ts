import 'dotenv/config';
import { desc, eq } from 'drizzle-orm';

import { ActionClient, BASE, createReporter, html, signIn, status } from './lib/action-client';
import { db, sql as pg } from '../lib/db';
import {
  emailVerificationCodes,
  notifications,
  platformSettings,
  users,
} from '../lib/db/schema';

/**
 * Acceptance check for the account/auth set (Prompts A1–A5).
 *
 * Drives the SHIPPED server actions over HTTP rather than re-implementing them,
 * which is the only way to check authorization and validation as they actually
 * run (see scripts/lib/action-client.ts).
 *
 * EVERYTHING IT CHANGES, IT PUTS BACK. This edits the platform settings row —
 * the one that decides what every storefront page says about delivery — and a
 * check that left a 999 afghani delivery fee behind would poison the next
 * rehearsal. The restore is scoped by ID captured before anything runs, never by
 * "recent", because seeded rows carry timestamps spread across the current day.
 */

/**
 * Signs in through the real Auth.js credentials endpoint.
 *
 * Not a call into authorize(): the point is to exercise the same POST the
 * browser makes, csrf token and all, so the provider's own rejection path is
 * what gets measured rather than a function called directly.
 *
 * Returns the resolved user id, or null with the error Auth.js reported — the
 * two failure messages have to be compared, so the error is data here.
 */
async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ userId: string | null; error: string | null }> {
  const csrfResponse = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  const jar = (csrfResponse.headers.getSetCookie() ?? [])
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

  const signIn = await fetch(`${BASE}/api/auth/callback/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: jar },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/fa`, json: 'true' }),
    redirect: 'manual',
  });

  const session = (signIn.headers.getSetCookie() ?? [])
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

  const location = `${signIn.headers.get('location') ?? ''} ${await signIn.text()}`;
  const error = /error=([A-Za-z]+)/.exec(location)?.[1] ?? null;

  const sessionResponse = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: [jar, session].filter(Boolean).join('; ') },
  });
  // Unauthenticated returns `null`, not `{}` — optional chaining is load-bearing.
  const body = (await sessionResponse.json()) as { user?: { id?: string } } | null;

  return { userId: body?.user?.id ?? null, error };
}

async function countByEvent(eventKey: string): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(eq(notifications.eventKey, eventKey));
  return rows.length;
}

const roleNoteCount = () => countByEvent('user.roleChanged');
const verifyNoteCount = () => countByEvent('email.verify');

const CUSTOMER = '0700000003';
const ADMIN = '0700000001';

const ACCOUNT_ROUTES = [
  '/account',
  '/account/orders',
  '/account/wishlist',
  '/account/addresses',
  '/account/reviews',
  '/account/security',
  '/account/settings',
  '/account/support',
];

async function main() {
  const report = createReporter();

  const customerCookie = signIn(CUSTOMER);
  const adminCookie = signIn(ADMIN);

  /* ---------------------------------------------------------------- routes */
  report.section('The hub is reachable, in both locales, and only when signed in');

  for (const route of ACCOUNT_ROUTES) {
    for (const locale of ['fa', 'en']) {
      const code = await status(`/${locale}${route}`, customerCookie);
      report.check(`${locale}${route} renders for a customer`, code === 200, code);
    }
  }

  /*
   * The guard trap this route group exists to avoid: /account/sign-in lives
   * OUTSIDE the (hub) group, so a signed-out visitor must reach it rather than
   * be redirected from it to itself forever.
   */
  const signInCode = await status('/fa/account/sign-in');
  report.check('signed out: the sign-in page is not itself guarded', signInCode === 200, signInCode);

  const guarded = await status('/fa/account/security');
  report.check('signed out: a hub section redirects', guarded === 307, guarded);

  /* ------------------------------------------------------------- A1 wiring */
  report.section('Email + password is a second way in, never a second identity');

  const [customer] = await db
    .select({ id: users.id, phone: users.phone })
    .from(users)
    .where(eq(users.phone, CUSTOMER))
    .limit(1);

  /*
   * next-intl ships the whole message tree to the client on every page, so
   * grepping the HTML for a string proves nothing about which screen rendered
   * (CLAUDE.md). These assertions read the DATABASE and the status code instead.
   */
  report.check('the customer account exists and is keyed by phone', Boolean(customer), customer?.id);

  const securityPage = await html('/fa/account/security', customerCookie);
  report.check(
    'the security page never renders a password hash',
    !/\$argon2|password_hash/.test(securityPage),
  );

  const hubPage = await html('/fa/account', customerCookie);
  /*
   * Asserted on THIS phone number rather than by scanning the page for a
   * grouped Persian number: the footer legitimately renders "۲۰٬۰۰۰ افغانی" for
   * the free-delivery threshold, so a page-wide test for a group separator
   * fails on correct output. formatPhone maps digits and never groups, so the
   * A1 bug — a phone through formatNumber — would read "۰۷۰۰٬۰۰۰٬۰۰۳" and this
   * exact string would be absent.
   */
  const persianPhone = CUSTOMER.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
  report.check(
    'the hub renders the phone ungrouped, with Persian digits',
    hubPage.includes(persianPhone),
    persianPhone,
  );

  /* ------------------------------------------ A1 end to end, both doors */
  report.section('Both doors open the same account, and neither leaks which one failed');

  const securityClient = await ActionClient.create(['/fa/account/security'], customerCookie);

  /*
   * A throwaway address per run. `Date.now().toString(36)` rather than the raw
   * millisecond number: thirteen consecutive digits in the local part is
   * indistinguishable from a six-digit code to any regex that goes looking for
   * one, which is exactly how the first version of this check "failed".
   */
  const probeEmail = `a5-check-${Date.now().toString(36)}@example.com`;
  const probePassword = 'gulbahar-check-2026';
  const verifyNotesBefore = await verifyNoteCount();

  const codeSent = await securityClient.call(customerCookie, 'requestEmailVerificationAction', [
    probeEmail,
  ]);
  report.check('a verification code is issued', codeSent?.ok === true, codeSent);

  const [codeRow] = await db
    .select({ body: notifications.body })
    .from(notifications)
    .where(eq(notifications.eventKey, 'email.verify'))
    .orderBy(desc(notifications.createdAt))
    .limit(1);

  // The code is only reachable through the log — exactly as on stage.
  const emailCode = codeRow?.body.match(/(?<!\d)(\d{6})(?!\d)/)?.[1] ?? '';

  const beforeVerify = await signInWithEmail(probeEmail, probePassword);
  report.check(
    'an unverified email with no password cannot sign in',
    beforeVerify.userId === null,
    beforeVerify.error,
  );

  const verified = await securityClient.call(customerCookie, 'verifyEmailCodeAction', [emailCode]);
  report.check('the code verifies the address', verified?.ok === true, verified);

  const noPassword = await signInWithEmail(probeEmail, probePassword);
  report.check(
    'a verified email with no password still cannot sign in',
    noPassword.userId === null,
    noPassword.error,
  );

  const passwordSet = await securityClient.call(customerCookie, 'setPasswordAction', [
    { newPassword: probePassword, confirmPassword: probePassword },
  ]);
  report.check('the password is set', passwordSet?.ok === true, passwordSet);

  const emailSignIn = await signInWithEmail(probeEmail, probePassword);
  report.check(
    'email + password signs in as the SAME account the phone created',
    emailSignIn.userId === customer!.id,
    { got: emailSignIn.userId, want: customer!.id },
  );

  /*
   * The non-enumeration rule (A1): wrong password and unknown email must be
   * indistinguishable. Compared character for character, because "nearly the
   * same message" is what tells an attacker which addresses exist.
   */
  const wrongPassword = await signInWithEmail(probeEmail, 'not-the-password');
  const unknownEmail = await signInWithEmail('nobody-here@example.com', probePassword);
  report.check('a wrong password is refused', wrongPassword.userId === null);
  report.check('an unknown email is refused', unknownEmail.userId === null);
  report.check(
    'the two failures are the identical message',
    wrongPassword.error === unknownEmail.error,
    { wrongPassword: wrongPassword.error, unknownEmail: unknownEmail.error },
  );

  const [credentialRow] = await db
    .select({ hash: users.passwordHash })
    .from(users)
    .where(eq(users.id, customer!.id))
    .limit(1);
  report.check(
    'the stored credential is a hash, never the password',
    Boolean(credentialRow?.hash?.startsWith('$argon2')) &&
      !credentialRow?.hash?.includes(probePassword),
  );

  /*
   * Put the account back the way the seed left it — the credentials, the
   * verification code row, and the notification the code arrived in.
   *
   * The log cleanup is scoped to notifications this run created, captured as a
   * count beforehand, NOT to "created in the last hour": seeded notifications
   * carry timestamps spread across the current day, and a time window would eat
   * demo data (CLAUDE.md).
   */
  await db
    .update(users)
    .set({ email: null, emailVerifiedAt: null, passwordHash: null, passwordUpdatedAt: null })
    .where(eq(users.id, customer!.id));

  await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, customer!.id));

  const verifyNotes = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(eq(notifications.eventKey, 'email.verify'))
    .orderBy(desc(notifications.createdAt));

  for (const row of verifyNotes.slice(0, Math.max(0, verifyNotes.length - verifyNotesBefore))) {
    await db.delete(notifications).where(eq(notifications.id, row.id));
  }
  report.check(
    'the verification code and its log entry are cleaned up',
    (await verifyNoteCount()) === verifyNotesBefore,
  );

  const [cleaned] = await db
    .select({ email: users.email, hash: users.passwordHash })
    .from(users)
    .where(eq(users.id, customer!.id))
    .limit(1);
  report.check(
    'the probe credentials are removed',
    cleaned?.email === null && cleaned?.hash === null,
    cleaned,
  );

  /* ------------------------------------------------------- A4 admin access */
  report.section('Admin settings are admin-only and actually change the storefront');

  const nonAdmin = await status('/fa/admin/settings', customerCookie);
  report.check('a customer is bounced from /admin/settings', nonAdmin === 307, nonAdmin);

  const adminPage = await status('/fa/admin/settings', adminCookie);
  report.check('an admin reaches /admin/settings', adminPage === 200, adminPage);

  const client = await ActionClient.create(['/fa/admin/settings'], adminCookie);
  report.check('updateMarketplaceSettings is exposed on the page', client.has('updateMarketplaceSettings'));

  // Captured BEFORE anything is written, so the restore is exact.
  const [before] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1);

  if (!before) {
    report.check('the platform settings row is seeded', false, 'no row with id = 1');
  } else {
    const probeFee = 777;
    const probeThreshold = 88_888;

    const written = await client.call(adminCookie, 'updateMarketplaceSettings', [
      {
        mallName: before.mallName,
        address: before.address,
        hours: before.hours,
        supportPhone: before.supportPhone,
        deliveryFee: probeFee,
        freeDeliveryThreshold: probeThreshold,
        // Added by C11 and required, like every other field on this form: the
        // action takes the whole settings row rather than a patch, so a caller
        // omitting a field is a caller that would blank it.
        pickupHoldHours: before.pickupHoldHours,
        currencyLabel: before.currencyLabel,
      },
    ]);
    report.check('the admin write succeeds', written?.ok === true, written);

    const [after] = await db
      .select({ fee: platformSettings.deliveryFee })
      .from(platformSettings)
      .where(eq(platformSettings.id, 1))
      .limit(1);
    report.check('the row changed', Number(after?.fee) === probeFee, after?.fee);

    // The storefront reads the row, so the FOOTER's delivery promise must move.
    // English, because Persian digits would have to be un-mapped to compare.
    const storefront = await html('/en');
    report.check(
      'the storefront footer quotes the new fee',
      storefront.includes('777') && storefront.includes('88,888'),
    );

    const rejected = await client.call(adminCookie, 'updateMarketplaceSettings', [
      { ...before, hours: '8am to 7pm' },
    ]);
    report.check(
      'a display string is refused for hours',
      rejected?.ok === false && rejected?.error === 'invalid_hours',
      rejected,
    );

    const asCustomer = await client.call(customerCookie, 'updateMarketplaceSettings', [
      { ...before, deliveryFee: 1 },
    ]);
    report.check(
      'a customer calling the action directly is forbidden',
      asCustomer?.ok === false && asCustomer?.error === 'forbidden',
      asCustomer,
    );

    // Restore, by id, to exactly what was there.
    await db
      .update(platformSettings)
      .set({
        mallName: before.mallName,
        address: before.address,
        hours: before.hours,
        supportPhone: before.supportPhone,
        deliveryFee: before.deliveryFee,
        freeDeliveryThreshold: before.freeDeliveryThreshold,
        currencyLabel: before.currencyLabel,
        publishedLocales: before.publishedLocales,
      })
      .where(eq(platformSettings.id, 1));

    const [restored] = await db
      .select({ fee: platformSettings.deliveryFee })
      .from(platformSettings)
      .where(eq(platformSettings.id, 1))
      .limit(1);
    report.check('the settings row is restored', Number(restored?.fee) === before.deliveryFee);
  }

  /* --------------------------------------------------------- locale rules */
  report.section('Published locales refuse the two states that would break the storefront');

  const withoutDefault = await client.call(adminCookie, 'updatePublishedLocales', [['en']]);
  report.check(
    'the default locale cannot be unpublished',
    withoutDefault?.ok === false && withoutDefault?.error === 'default_locale_required',
    withoutDefault,
  );

  const withPashto = await client.call(adminCookie, 'updatePublishedLocales', [['fa', 'en', 'ps']]);
  report.check(
    'an untranslated locale cannot be published',
    withPashto?.ok === false && withPashto?.error === 'locale_not_translated',
    withPashto,
  );

  /* ------------------------------------------------------------ role rules */
  report.section('A role change is written down and cannot strand anyone');

  const usersClient = await ActionClient.create(['/fa/admin/users'], adminCookie);

  const [adminRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, ADMIN))
    .limit(1);

  const noNote = await usersClient.call(adminCookie, 'setUserRole', [
    { userId: customer!.id, role: 'shopkeeper', note: '' },
  ]);
  report.check('a role change without a note is refused', noNote?.ok === false, noNote);

  const self = await usersClient.call(adminCookie, 'setUserRole', [
    { userId: adminRow!.id, role: 'customer', note: 'demoting myself' },
  ]);
  report.check(
    'an admin cannot change their own role',
    self?.ok === false && self?.error === 'cannot_change_own_role',
    self,
  );

  // A real change, then put it back — and check the note reached the subject.
  const notesBefore = await roleNoteCount();

  const promoted = await usersClient.call(adminCookie, 'setUserRole', [
    { userId: customer!.id, role: 'shopkeeper', note: 'acceptance check — reverted immediately' },
  ]);
  report.check('a valid role change succeeds', promoted?.ok === true, promoted);

  const [note] = await db
    .select({ id: notifications.id, body: notifications.body })
    .from(notifications)
    .where(eq(notifications.eventKey, 'user.roleChanged'))
    .orderBy(desc(notifications.createdAt))
    .limit(1);

  report.check(
    'the admin note reaches the person it happened to',
    Boolean(note?.body.includes('acceptance check')),
    note?.body,
  );

  await usersClient.call(adminCookie, 'setUserRole', [
    { userId: customer!.id, role: 'customer', note: 'acceptance check — restoring' },
  ]);

  const [restoredUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, customer!.id))
    .limit(1);
  report.check('the customer role is restored', restoredUser?.role === 'customer', restoredUser);

  /*
   * Both notifications this section created are removed BY ID range, not by
   * timestamp: seeded notifications carry times spread across the current day,
   * so "created in the last hour" would eat demo data (CLAUDE.md).
   */
  const created = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(eq(notifications.eventKey, 'user.roleChanged'))
    .orderBy(desc(notifications.createdAt));

  for (const row of created.slice(0, Math.max(0, created.length - notesBefore))) {
    await db.delete(notifications).where(eq(notifications.id, row.id));
  }

  const notesAfter = await roleNoteCount();
  report.check('the notifications this check wrote are cleaned up', notesAfter === notesBefore, {
    notesBefore,
    notesAfter,
  });

  /* ---------------------------------------------------------- A3 honesty */
  report.section('Nothing inert pretends to be live');

  const settingsPage = await html('/fa/account/settings', customerCookie);
  report.check(
    'the disabled surface is a non-focusable region',
    settingsPage.includes('aria-disabled') && settingsPage.includes('role="group"'),
  );
  report.check(
    'no disabled surface is a button or a link',
    !/<(button|a)[^>]*aria-disabled/.test(settingsPage),
  );

  const failed = report.summary();
  await pg.end({ timeout: 5 });
  process.exit(failed > 0 ? 1 : 0);
}

void main();
