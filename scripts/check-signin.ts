import 'dotenv/config';
import { desc, eq } from 'drizzle-orm';

import { db, sql as pg } from '../lib/db';
import { notifications, users } from '../lib/db/schema';
import { requestOtp, verifyOtp } from '../lib/auth/otp';

/**
 * Exercises the real sign-in path for an EXISTING privileged user, which the
 * Phase 3 check does not cover: it only creates a new customer.
 *
 * Confirms that a returning admin keeps their role rather than being reset to
 * 'customer' by the find-or-create branch — the bug that would silently lock the
 * client out of their own admin panel mid-demo.
 */
async function main() {
  const phone = '0700000001';

  const before = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
  if (before.length === 0) {
    throw new Error(`No user with phone ${phone}. Seed one first.`);
  }
  console.log(`  existing user: role=${before[0].role} locale=${before[0].locale}`);

  const requested = await requestOtp(phone);
  console.log(`  requestOtp ok: ${requested.ok}`);

  const [row] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.eventKey, 'otp'))
    .orderBy(desc(notifications.createdAt))
    .limit(1);

  const code = row?.body.match(/(\d{6})/)?.[1] ?? '';
  console.log(`  code from notification log: ${code}`);
  console.log(`  notification locale: ${row?.locale} (should match the user's)`);
  console.log(`  addressed to user id: ${row?.recipientUserId ? 'yes' : 'no (anonymous)'}`);
  console.log(`  recipient role recorded: ${row?.recipientRole}`);

  const result = await verifyOtp(phone, code);
  if (!result.ok) throw new Error(`verify failed: ${result.error}`);

  console.log(`  verified: isNewUser=${result.isNewUser} role=${result.user.role}`);

  const roleHeld = result.user.role === 'admin';
  const notNew = result.isNewUser === false;
  console.log(
    roleHeld && notNew
      ? '\n✅ returning admin signed in with role intact\n'
      : '\n❌ role or new-user flag wrong\n',
  );
  if (!roleHeld || !notNew) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pg.end();
  });
