import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Package } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { OrderCard, type CustomerOrderRow } from '@/components/shop/account/order-card';
import { pressable } from '@/components/motion/pressable';
import { requireUser } from '@/lib/auth/guards';
import { customerOrders } from '@/lib/db/queries/orders';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

type Query = { status?: string };

/**
 * Filter buckets, not raw statuses.
 *
 * A customer does not think "accepted or ready"; they think "still coming" or
 * "done". Five status chips would be the order state machine leaking into the
 * account area, which is a shop's vocabulary rather than a shopper's.
 */
const BUCKETS = {
  active: ['placed', 'accepted', 'ready'],
  fulfilled: ['fulfilled'],
  rejected: ['rejected'],
} as const;

/** Order history (PRD §5.4). */
export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations('orders');

  const session = await requireUser(locale);
  const orders = (await customerOrders(session.id)) as CustomerOrderRow[];

  if (orders.length === 0) {
    return (
      <div className="py-6">
        <EmptyState
          illustration={<Package className="h-7 w-7" />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={{ label: t('startShopping'), href: '/products' }}
        />
      </div>
    );
  }

  const bucket = query.status && query.status in BUCKETS ? (query.status as keyof typeof BUCKETS) : undefined;
  const visible = bucket
    ? orders.filter((order) => (BUCKETS[bucket] as readonly string[]).includes(order.status))
    : orders;

  const chips = [
    { key: 'all', href: '/account/orders', count: orders.length, active: !bucket },
    ...(Object.keys(BUCKETS) as Array<keyof typeof BUCKETS>).map((key) => ({
      key,
      href: `/account/orders?status=${key}`,
      count: orders.filter((order) => (BUCKETS[key] as readonly string[]).includes(order.status))
        .length,
      active: bucket === key,
    })),
  ].filter((chip) => chip.count > 0 || chip.key === 'all');

  // The hub layout owns the page frame — max width, gutters and vertical
  // rhythm — so a section only lays out its own column (Prompt A2).
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">{t('title')}</h1>

      <nav className="flex scrollbar-none snap-x gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            aria-current={chip.active ? 'page' : undefined}
            className={cn(
              pressable,
              'rounded-pill flex shrink-0 snap-start items-center gap-1.5 border px-3.5 py-1.5 text-xs font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out',
              chip.active
                ? 'border-primary bg-primary text-primary-foreground font-semibold'
                : 'border-border bg-card hover:border-primary',
            )}
          >
            {t(`filters.${chip.key}`)}
            <span className="tabular-nums opacity-70">{formatNumber(chip.count, locale)}</span>
          </Link>
        ))}
      </nav>

      {visible.length === 0 ? (
        <EmptyState
          illustration={<Package className="h-7 w-7" />}
          title={t('emptyFilteredTitle')}
          description={t('emptyFilteredBody')}
          action={{ label: t('filters.all'), href: '/account/orders' }}
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
