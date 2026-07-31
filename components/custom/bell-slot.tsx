import { NotificationBell } from '@/components/custom/notification-bell';
import { currentUser } from '@/lib/auth/guards';
import { unreadNotificationCount, userNotifications } from '@/lib/db/queries/notifications';
import { notificationHref } from '@/lib/notification-links';

/**
 * The bell, wired to whoever is signed in (Prompt C12).
 *
 * ONE SERVER COMPONENT feeding one client component, used by all three
 * layouts. The three surfaces were each building the same props object by
 * hand, which is how the storefront ended up without a bell at all — nobody
 * fancied writing it a fourth time.
 *
 * Renders NOTHING when signed out. A bell that always shows zero is an empty
 * promise in the header of a page most visitors read without an account.
 */
export async function BellSlot({ onDark = false }: { onDark?: boolean }) {
  const user = await currentUser();
  if (!user?.id) return null;

  const [notifications, unread] = await Promise.all([
    userNotifications(user.id, user.role, 20),
    unreadNotificationCount(user.id, user.role),
  ]);

  return (
    <NotificationBell
      onDark={onDark}
      unreadCount={unread}
      notifications={notifications.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        read: item.read,
        createdAt: item.createdAt.toISOString(),
        // Resolved on the SERVER: the mapping needs the viewer's role, and
        // shipping the role to the client to compute a href would be a second
        // copy of the same table (lib/notification-links.ts).
        href: notificationHref(item.eventKey, item.payload, user.role),
      }))}
    />
  );
}
