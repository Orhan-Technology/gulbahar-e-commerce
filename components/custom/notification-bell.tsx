'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Bell, CheckCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { markAllMineRead, markNotificationRead } from '@/lib/actions/notifications';
import { formatNumber, formatRelative } from '@/lib/format';
import { Link, useRouter as useLocaleRouter } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type BellNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  /** Where this notification is about, or null when there is nowhere to go. */
  href: string | null;
};

/**
 * The notification bell, shared by all three surfaces (Prompt C12).
 *
 * ONE COMPONENT, not one per console. The storefront, the shop panel and the
 * mall console differ in exactly one thing — whether the header behind it is
 * dark — and three copies of a panel with read state and deep links in it would
 * be three places to fix the next bug.
 *
 * EVERY ROW IS A LINK, and opening one marks it read on the way. A notification
 * centre where you read a fact and then go and find the thing it is about is a
 * list of chores; the deep link is what makes it a way of working.
 *
 * MARKING READ IS OPTIMISTIC. The row's tint is a courtesy — nothing depends on
 * it — and waiting for a round trip before dimming it makes the panel feel
 * broken on a mall's wifi. The count follows the same state so they cannot
 * disagree on screen.
 *
 * DISTINCT FROM THE DEMO LOG (PRD §9.2), which shows every message across every
 * role and is a presenter tool. They read the same table and must never
 * contradict each other, which is why the query behind this one no longer
 * filters by channel.
 */
export function NotificationBell({
  notifications,
  unreadCount,
  onDark = false,
}: {
  notifications: BellNotification[];
  unreadCount: number;
  /**
   * The shop panel's header is deep green. Red on green is the one badge
   * pairing that goes muddy, so the count switches to gold there — the same
   * choice the header's own accents make.
   */
  onDark?: boolean;
}) {
  const t = useTranslations('notificationCentre');
  const locale = useLocale();
  const router = useRouter();
  const localeRouter = useLocaleRouter();

  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState(notifications);
  const [count, setCount] = React.useState(unreadCount);
  const [, startTransition] = React.useTransition();

  // Re-sync when the server sends new data, adjusted during render rather than
  // in an effect (which would cascade) — the same pattern the stock editor uses.
  const [lastServer, setLastServer] = React.useState(notifications);
  if (lastServer !== notifications) {
    setLastServer(notifications);
    setItems(notifications);
    setCount(unreadCount);
  }

  function read(id: string, wasRead: boolean) {
    if (wasRead) return;
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, read: true } : item)),
    );
    setCount((current) => Math.max(0, current - 1));
    startTransition(async () => {
      await markNotificationRead(id);
      router.refresh();
    });
  }

  function readAll() {
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    setCount(0);
    startTransition(async () => {
      await markAllMineRead();
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'relative',
            onDark && 'text-primary-foreground hover:bg-primary-600 hover:text-primary-foreground',
          )}
          aria-label={t('title')}
          data-notification-bell={count}
        >
          <Bell />
          {count > 0 && (
            <span
              className={cn(
                'rounded-pill absolute end-0 -top-0.5 flex h-5 min-w-5 items-center justify-center px-1 text-xs font-bold',
                onDark ? 'bg-accent-500 text-accent-foreground' : 'bg-danger text-danger-fg',
              )}
              aria-hidden
            >
              {formatNumber(count, locale)}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader className="flex-row items-center justify-between gap-2">
          <SheetTitle>{t('title')}</SheetTitle>
          {count > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={readAll}>
              <CheckCheck />
              {t('markAllRead')}
            </Button>
          )}
        </SheetHeader>

        {items.length === 0 ? (
          <p className="text-muted-foreground mt-6 text-sm">{t('empty')}</p>
        ) : (
          <ul className="mt-6 space-y-2">
            {items.map((item) => {
              const body = (
                <>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                    {item.body}
                  </p>
                  <time
                    dateTime={item.createdAt}
                    className="mt-1 block text-xs text-neutral-500"
                  >
                    {formatRelative(item.createdAt, locale)}
                  </time>
                </>
              );

              const className = cn(
                'rounded-control block border p-3 transition-colors duration-150',
                item.read
                  ? 'border-border bg-card'
                  : 'border-primary-200 bg-primary-50 font-medium',
              );

              return (
                <li key={item.id} data-notification={item.read ? 'read' : 'unread'}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className={cn(className, 'hover:border-primary')}
                      onClick={() => {
                        read(item.id, item.read);
                        setOpen(false);
                      }}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={className}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(false);
              localeRouter.push('/notifications');
            }}
          >
            {t('seeAll')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
