import 'dotenv/config';
import { desc, eq } from 'drizzle-orm';

import { db, sql as pg } from '../lib/db';
import { notifications, users } from '../lib/db/schema';
import { requestOtp, verifyOtp } from '../lib/auth/otp';
import { shopForUser } from '../lib/db/queries/shops';
import { pickLocale } from '../lib/db/localized';

/**
 * Drives the real sign-in path for each seeded demo account, the way the
 * presenter will during the walkthrough: request a code, read it out of the
 * notification log, verify.
 *
 * Guards the failure that would be worst on stage — a returning privileged user
 * being reset to 'customer' by the find-or-create branch and losing access to
 * their own panel.
 */
const ACCOUNTS = [
  { phone: '0700000001', label: 'admin', expectRole: 'admin', expectShop: false },
  { phone: '0700000002', label: 'shopkeeper (owner)', expectRole: 'shopkeeper', expectShop: true },
  { phone: '0700000004', label: 'shopkeeper (staff)', expectRole: 'shopkeeper', expectShop: true },
  { phone: '0700000003', label: 'customer', expectRole: 'customer', expectShop: false },
] as const;

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}${detail !== undefined ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}

async function main() {
  console.log('\n── sign-in for every seeded demo account ──\n');

  for (const account of ACCOUNTS) {
    const [before] = await db.select().from(users).where(eq(users.phone, account.phone)).limit(1);
    if (!before) {
      check(`${account.label} exists`, false, `${account.phone} not seeded`);
      continue;
    }

    const requested = await requestOtp(account.phone);
    if (!requested.ok) {
      check(`${account.label}: code issued`, false, requested.error);
      continue;
    }

    // The code is only reachable through the log — exactly as on stage.
    const [row] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.eventKey, 'otp'))
      .orderBy(desc(notifications.createdAt))
      .limit(1);

    const code = row?.body.match(/(\d{6})/)?.[1] ?? '';
    const verified = await verifyOtp(account.phone, code);

    if (!verified.ok) {
      check(`${account.label}: verified`, false, verified.error);
      continue;
    }

    const shop = await shopForUser(verified.user.id);

    check(
      `${account.label.padEnd(20)} ${account.phone}`,
      verified.user.role === account.expectRole &&
        verified.isNewUser === false &&
        Boolean(shop) === account.expectShop,
      `role=${verified.user.role} shop=${shop ? pickLocale(shop.name, 'fa') : '—'}` +
        `${shop ? ` (${shop.memberRole})` : ''}`,
    );
  }

  // Housekeeping: the OTP rows this check created are noise in the demo log.
  await db.delete(notifications).where(eq(notifications.eventKey, 'otp'));
  console.log('\n  ✓ test OTP rows removed from the log');

  console.log(
    failures === 0 ? '\n✅ every demo account signs in correctly\n' : `\n❌ ${failures} failed\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.end();
  });
