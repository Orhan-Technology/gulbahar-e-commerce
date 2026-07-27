'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { formatNumber, formatRelative } from '@/lib/format';

export type BellNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

/**
 * Notification bell for the shop panel (PRD §6.1).
 *
 * Reads only this shopkeeper's in-app notifications — distinct from the demo
 * notification LOG (PRD §9.2), which shows every message across every role and is
 * a presenter tool rather than something a real shopkeeper would see.
 */
export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: BellNotification[];
  unreadCount: number;
}) {
  const t = useTranslations('dashboardNav');
  const locale = useLocale();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('notifications')}>
          <Bell />
          {unreadCount > 0 && (
            <span
              className="rounded-pill bg-danger text-danger-fg absolute end-0 -top-0.5 flex h-5 min-w-5 items-center justify-center px-1 text-xs font-bold"
              aria-hidden
            >
              {formatNumber(unreadCount, locale)}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{t('notifications')}</SheetTitle>
        </SheetHeader>

        {notifications.length === 0 ? (
          <p className="text-muted-foreground mt-6 text-sm">{t('noNotifications')}</p>
        ) : (
          <ul className="mt-6 space-y-2">
            {notifications.map((item) => (
              <li
                key={item.id}
                className={
                  item.read
                    ? 'rounded-control border-border border p-3'
                    : 'rounded-control border-primary-200 bg-primary-50 border p-3'
                }
              >
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">{item.body}</p>
                <time dateTime={item.createdAt} className="mt-1 block text-xs text-neutral-500">
                  {formatRelative(item.createdAt, locale)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
