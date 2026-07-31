import 'server-only';

import { currentUser } from './auth/guards';

/**
 * The admin gate every admin action opens with (Prompt C9).
 *
 * It existed already, copied identically into four action files. C9 gave it a
 * second job — carrying the actor's NAME for the audit log — and four copies of
 * a thing with two jobs is where they start to differ. One definition, and the
 * name comes from the session rather than a second query on every write.
 *
 * Falls back to the phone number when a staff account has no name set, because
 * an audit line reading "— suspended Pamir Shoes" names nobody.
 */
/**
 * `actorId` rather than `userId`, so the whole context spreads straight into
 * an audit entry: `recordAdminAction({ ...context, action, … })`. A name that
 * needed remapping at twenty call sites would eventually be remapped wrongly at
 * one of them.
 */
export type AdminContext = { actorId: string; actorName: string };

export async function requireAdminContext(): Promise<AdminContext | null> {
  const user = await currentUser();
  if (!user?.id || user.role !== 'admin') return null;

  return { actorId: user.id, actorName: user.name?.trim() || user.phone };
}
