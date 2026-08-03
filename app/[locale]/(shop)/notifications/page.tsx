import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  BellOff,
  Check,
  CheckCheck,
  CircleSlash,
  HelpCircle,
  Megaphone,
  MessageSquare,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Store,
  ThumbsUp,
  UserCog,
  X,
} from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { MarkAllReadButton } from '@/components/shop/account/mark-all-read-button';
import { requireUser } from '@/lib/auth/guards';
import {
  notificationCategoryCounts,
  notificationHistory,
} from '@/lib/db/queries/notifications';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { notificationHref } from '@/lib/notification-links';
import { cn } from '@/lib/utils';

type Query = { type?: string };

/**
 * WHAT HAPPENED, as a glyph (finding #16).
 *
 * Every row used to carry the same «سفارش‌ها» chip — the CATEGORY, which on a
 * filtered list is the filter you just pressed and on the unfiltered one is the
 * least distinguishing thing about the row. Nine identical chips down the page
 * told a reader nothing and made the list impossible to scan.
 *
 * The state does distinguish them: accepted, ready, refused, and refused is the
 * one you want to find. Keyed off the EVENT rather than the category, and the
 * fallback is the category's own icon so a new event key degrades to something
 * sensible rather than to nothing.
 *
 * Tone matches the order timeline's: `cancelled` is neutral rather than red,
 * because the person reading it is usually the one who asked for it.
 */
const EVENT_ICONS: Record<string, { Icon: typeof Check; tone: string }> = {
  'order.placed': { Icon: ShoppingBag, tone: 'bg-neutral-100 text-neutral-600' },
  'order.newForShop': { Icon: ShoppingBag, tone: 'bg-primary-50 text-primary-700' },
  'order.nudged': { Icon: ShoppingBag, tone: 'bg-warning-bg text-warning-fg' },
  'order.accepted': { Icon: ThumbsUp, tone: 'bg-primary-50 text-primary-700' },
  'order.ready': { Icon: PackageCheck, tone: 'bg-warning-bg text-warning-fg' },
  'order.fulfilled': { Icon: Check, tone: 'bg-success-bg text-success' },
  'order.collected': { Icon: Check, tone: 'bg-success-bg text-success' },
  'order.rejected': { Icon: X, tone: 'bg-danger-bg text-danger' },
  'order.holdExpired': { Icon: CircleSlash, tone: 'bg-warning-bg text-warning-fg' },
  'order.cancelled': { Icon: CircleSlash, tone: 'bg-neutral-100 text-neutral-600' },
  'order.cancelledForShop': { Icon: CircleSlash, tone: 'bg-neutral-100 text-neutral-600' },
  'order.cancelledByMall': { Icon: CircleSlash, tone: 'bg-danger-bg text-danger' },
  'order.cancelledByMallForShop': { Icon: CircleSlash, tone: 'bg-danger-bg text-danger' },
};

const CATEGORY_ICONS: Record<string, { Icon: typeof Check; tone: string }> = {
  review: { Icon: MessageSquare, tone: 'bg-primary-50 text-primary-700' },
  question: { Icon: HelpCircle, tone: 'bg-primary-50 text-primary-700' },
  campaign: { Icon: Megaphone, tone: 'bg-primary-50 text-primary-700' },
  shop: { Icon: Store, tone: 'bg-primary-50 text-primary-700' },
  verification: { Icon: ShieldCheck, tone: 'bg-success-bg text-success' },
  user: { Icon: UserCog, tone: 'bg-neutral-100 text-neutral-600' },
};

function notificationIcon(eventKey: string) {
  const [group] = eventKey.split('.');
  return (
    EVENT_ICONS[eventKey] ??
    CATEGORY_ICONS[group ?? ''] ?? { Icon: Check, tone: 'bg-neutral-100 text-neutral-600' }
  );
}

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
        /*
          NEW ABOVE THE LINE, EVERYTHING ELSE BELOW IT (finding #16).

          The unread rows already carried a tinted background, which answers
          "is this one new" but not "how many are" — and on a list of thirty a
          reader still has to check every card. Two labelled groups turn that
          into one glance, and give «همه را خوانده‌شده کن» a visible thing to
          act on.

          Partitioned rather than divided in place: the query is newest-first,
          and read state does not follow that order — an old notification opened
          today is read while a newer one is not, so a divider inserted at the
          first read row would leave unread ones stranded underneath it.
        */
        <div className="space-y-4">
          {(
            [
              { key: 'unread', label: t('groupNew'), items: rows.filter((row) => !row.read) },
              { key: 'read', label: t('groupEarlier'), items: rows.filter((row) => row.read) },
            ] as const
          )
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <section key={group.key} className="space-y-2">
                {/* The heading is absent, not empty, when the other group has
                    nothing — a lone «قبلی» over the whole list labels nothing. */}
                {rows.some((row) => row.read) && rows.some((row) => !row.read) && (
                  <h2 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold">
                    {group.label}
                    <span className="tabular-nums opacity-70">
                      {formatNumber(group.items.length, locale)}
                    </span>
                    <span className="bg-border h-px flex-1" aria-hidden />
                  </h2>
                )}

                <ul className="space-y-2">
                  {group.items.map((row) => {
                    const href = notificationHref(row.eventKey, row.payload, session.role);
                    const { Icon, tone } = notificationIcon(row.eventKey);

                    const inner = (
                      <>
                        <span
                          className={cn(
                            'rounded-control flex h-9 w-9 shrink-0 items-center justify-center',
                            tone,
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-semibold">{row.title}</span>
                            {!row.read && (
                              <span className="bg-primary h-1.5 w-1.5 shrink-0 rounded-pill" aria-hidden />
                            )}
                          </span>
                          <span className="text-muted-foreground mt-1 block text-sm leading-relaxed">
                            {row.body}
                          </span>
                          {/*
                            RELATIVE, with the exact moment on hover — the same
                            voice the order list uses. The two screens disagreed:
                            an order card said «۳ روز پیش» and the notification
                            about that same order said a calendar date, so a
                            reader comparing them had to do the arithmetic.
                          */}
                          <time
                            dateTime={row.createdAt.toISOString()}
                            title={formatDateTime(row.createdAt, locale)}
                            className="mt-1 block text-xs text-neutral-500"
                          >
                            {formatRelative(row.createdAt, locale)}
                          </time>
                        </span>
                      </>
                    );

                    const className = cn(
                      'rounded-card flex gap-3 border p-4',
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
              </section>
            ))}
        </div>
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
