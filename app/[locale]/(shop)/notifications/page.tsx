import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BellOff, CheckCheck } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { MarkAllReadButton } from '@/components/shop/account/mark-all-read-button';
import { requireUser } from '@/lib/auth/guards';
import {
  notificationCategoryCounts,
  notificationHistory,
} from '@/lib/db/queries/notifications';
import { formatDateTime, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { notificationCategory, notificationHref } from '@/lib/notification-links';
import { cn } from '@/lib/utils';

type Query = { type?: string };

/**
 * Notification history, for every role (Prompt C12).
 *
 * ONE ROUTE, not one per surface. A shopkeeper's notifications and a
 * customer's are the same rows read by the same person — the roles are a
 * property of the account, not of the page — and three copies of this screen
 * would be three places for the read state to drift.
 *
 * It lives in the (shop) group because that group has no role guard: an admin
 * opening it gets their own history, not a redirect to the storefront.
 *
 * FILTERS ARE DERIVED FROM THE EVENT KEY, not stored on the row. No migration,
 * no backfill, and the same mapping the bell's deep links and the preference
 * switches use — the alternative is a filter that quietly disagrees with the
 * switch that was supposed to control it.
 */
export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const session = await requireUser(locale);
  const t = await getTranslations('notificationCentre');

  const [rows, counts] = await Promise.all([
    notificationHistory(session.id, session.role, { category: query.type }),
    notificationCategoryCounts(session.id, session.role),
  ]);

  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const unread = rows.filter((row) => !row.read).length;

  const chips = [
    { key: 'all', href: '/notifications', count: total, active: !query.type },
    ...[...counts.entries()].map(([category, count]) => ({
      key: category,
      href: `/notifications?type=${category}`,
      count,
      active: query.type === category,
    })),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('subtitle', { count: formatNumber(total, locale) })}
          </p>
        </div>
        {unread > 0 && <MarkAllReadButton />}
      </header>

      {total > 0 && (
        <nav className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={chip.href}
              aria-current={chip.active ? 'page' : undefined}
              data-notification-filter={chip.key}
              className={cn(
                'rounded-pill shrink-0 border px-3.5 py-1.5 text-xs font-medium transition-colors duration-150',
                chip.active
                  ? 'border-primary bg-primary text-primary-foreground font-semibold'
                  : 'border-border bg-card hover:border-primary',
              )}
            >
              {chip.key === 'all' ? t('all') : t(`categories.${chip.key}` as never)}
              <span className="ms-1.5 tabular-nums opacity-70">
                {formatNumber(chip.count, locale)}
              </span>
            </Link>
          ))}
        </nav>
      )}

      {rows.length === 0 ? (
        <EmptyState
          illustration={<BellOff className="h-7 w-7" aria-hidden />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const href = notificationHref(row.eventKey, row.payload, session.role);
            const inner = (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{row.title}</p>
                  <span className="rounded-pill bg-neutral-100 px-2 py-0.5 text-2xs text-neutral-600">
                    {t(`categories.${notificationCategory(row.eventKey)}` as never)}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{row.body}</p>
                <time
                  dateTime={row.createdAt.toISOString()}
                  className="mt-1 block text-xs text-neutral-500"
                >
                  {formatDateTime(row.createdAt, locale)}
                </time>
              </>
            );

            const className = cn(
              'rounded-card block border p-4',
              row.read ? 'border-border bg-card' : 'border-primary-200 bg-primary-50',
            );

            return (
              <li key={row.id} data-notification={row.read ? 'read' : 'unread'}>
                {href ? (
                  <Link href={href} className={cn(className, 'hover:border-primary')}>
                    {inner}
                  </Link>
                ) : (
                  <div className={className}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 0 && (
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 pt-2 text-xs">
          <CheckCheck className="h-3.5 w-3.5" aria-hidden />
          {t('preferencesHint')}{' '}
          <Link href="/account/settings" className="text-primary font-medium hover:underline">
            {t('preferencesLink')}
          </Link>
        </p>
      )}
    </div>
  );
}
