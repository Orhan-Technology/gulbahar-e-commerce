import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ShoppingBag, Store, Truck } from 'lucide-react';

import { ListCapNotice } from '@/components/admin/list-cap-notice';
import { EmptyState } from '@/components/custom/empty-state';
import { SearchBox } from '@/components/custom/search-box';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { adminOrderList, adminOrderStatusCounts, adminShopOptions } from '@/lib/db/queries/admin';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import type { OrderStatus } from '@/lib/db/schema';

type Query = { status?: OrderStatus; q?: string; shop?: string; days?: string };

/**
 * The status filters, in lifecycle order.
 *
 * Both terminal endings are here: `cancelled` is an order ENDED after it was
 * placed — by the shop, the customer or the mall — and is not the same event as
 * a rejection at the door, so folding them into one chip would hide which of
 * the two happened to a given order.
 */
const STATUSES = [
  'placed',
  'accepted',
  'ready',
  'fulfilled',
  'rejected',
  'cancelled',
] as const satisfies readonly OrderStatus[];

/**
 * A `Record<OrderStatus, …>` on purpose, so a new status in the enum is a
 * COMPILE error here rather than a chip that renders unstyled. That is exactly
 * what caught this map when `cancelled` landed.
 */
const STATUS_BADGE: Record<
  OrderStatus,
  'default' | 'success' | 'warning' | 'secondary' | 'destructive'
> = {
  placed: 'warning',
  accepted: 'default',
  ready: 'default',
  fulfilled: 'success',
  rejected: 'destructive',
  // Ended rather than refused — grey, because nobody did anything wrong.
  cancelled: 'secondary',
};

/**
 * Date windows, as chips. `all` is the DEFAULT: an orders list that quietly
 * showed only the last thirty days would be the same silent lie as an
 * unannounced row cap.
 */
const DAY_WINDOWS = [7, 30, 90] as const;

const ROW_LIMIT = 200;

/**
 * All-orders view (PRD §7.4).
 *
 * READ-ONLY ABOUT FULFILMENT, deliberately: accepting, readying and fulfilling
 * are the shop's job, so there is no status control here even though admin sees
 * every order (PRD §3.1). The one write that IS admin's — ending a dead order —
 * lives on the detail page, because ending a transaction the platform hosts is
 * a platform decision rather than a fulfilment one.
 *
 * IT CAN NOW BE SEARCHED. The screen offered five status chips and nothing else
 * against two hundred rows, so "where is GC-24788" and "what has Pamir Shoes
 * been doing this week" both meant scrolling. Three axes now — who (reference,
 * name or phone), which shop, and when — and the list says when it is capped.
 */
export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  await requireAdmin(locale);
  const t = await getTranslations('adminOrders');

  const [counts, shops] = await Promise.all([adminOrderStatusCounts(), adminShopOptions(locale)]);

  // Every filter carries every other one, so narrowing on a second axis does
  // not silently discard the first.
  const hrefWith = (patch: Partial<Record<keyof Query, string | undefined>>) => {
    const merged = { ...query, ...patch };
    const next = new URLSearchParams();
    for (const key of ['status', 'q', 'shop', 'days'] as const) {
      const value = merged[key];
      if (value) next.set(key, String(value));
    }
    const search = next.toString();
    return search ? `/admin/orders?${search}` : '/admin/orders';
  };

  const statusChips = [
    { key: 'all', href: hrefWith({ status: undefined }), count: counts.all, active: !query.status },
    ...STATUSES.map((status) => ({
      key: status,
      href: hrefWith({ status }),
      count: counts[status],
      active: query.status === status,
    })),
  ];

  const activeDays = query.days ? Number(query.days) : undefined;

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>
      </div>

      <SearchBox placeholder={t('searchPlaceholder')} />

      <div className="flex flex-wrap gap-2">
        {statusChips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`rounded-pill flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium ${
              chip.active
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-card hover:border-primary'
            }`}
          >
            {t(`filters.${chip.key}`)}
            <Badge variant={chip.active ? 'default' : 'secondary'}>
              {formatNumber(chip.count, locale)}
            </Badge>
          </Link>
        ))}
      </div>

      {/* Two different axes from the statuses, so they sit behind a divider —
          the same separation the shops directory uses for its health view. */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={hrefWith({ days: undefined })}
          className={`rounded-pill shrink-0 border px-3 py-1 text-xs ${
            !activeDays
              ? 'border-primary bg-primary-50 text-primary'
              : 'border-border bg-card hover:border-primary'
          }`}
        >
          {t('windows.all')}
        </Link>
        {DAY_WINDOWS.map((days) => (
          <Link
            key={days}
            href={hrefWith({ days: String(days) })}
            className={`rounded-pill shrink-0 border px-3 py-1 text-xs ${
              activeDays === days
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-card hover:border-primary'
            }`}
          >
            {t('windows.days', { count: formatNumber(days, locale) })}
          </Link>
        ))}

        <span className="bg-border mx-1 hidden w-px self-stretch sm:block" aria-hidden />

        <div className="flex scrollbar-none min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          <Link
            href={hrefWith({ shop: undefined })}
            className={`rounded-pill shrink-0 border px-3 py-1 text-xs ${
              !query.shop
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-card hover:border-primary'
            }`}
          >
            {t('allShops')}
          </Link>
          {shops.map((shop) => (
            <Link
              key={shop.id}
              href={hrefWith({ shop: shop.id })}
              className={`rounded-pill shrink-0 border px-3 py-1 text-xs ${
                query.shop === shop.id
                  ? 'border-primary bg-primary-50 text-primary'
                  : 'border-border bg-card hover:border-primary'
              }`}
            >
              {pickLocale(shop.name, locale)}
            </Link>
          ))}
        </div>
      </div>

      <Suspense
        key={`${query.status ?? 'all'}-${query.q ?? ''}-${query.shop ?? ''}-${query.days ?? ''}`}
        fallback={<TableSkeleton />}
      >
        <OrderTable locale={locale} query={query} />
      </Suspense>
    </div>
  );
}

async function OrderTable({ locale, query }: { locale: string; query: Query }) {
  const t = await getTranslations('adminOrders');

  const days = Number(query.days);
  const { rows, hasMore } = await adminOrderList({
    statuses: query.status ? [query.status] : undefined,
    search: query.q,
    shopId: query.shop,
    // Only the three offered windows reach the query; anything else typed into
    // the URL falls back to "all time" rather than erroring.
    days: DAY_WINDOWS.includes(days as (typeof DAY_WINDOWS)[number]) ? days : undefined,
    limit: ROW_LIMIT,
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<ShoppingBag className="h-7 w-7" />}
        title={query.q ? t('emptySearchTitle') : t('emptyTitle')}
        description={query.q ? t('emptySearchBody', { term: query.q }) : t('emptyBody')}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-card border-border bg-card overflow-x-auto border">
        <table className="w-full min-w-2xl text-sm">
          <thead>
            <tr className="text-muted-foreground border-border border-b text-xs">
              <th className="p-3 text-start font-normal">{t('colReference')}</th>
              <th className="p-3 text-start font-normal">{t('colCustomer')}</th>
              <th className="p-3 text-start font-normal">{t('colPlaced')}</th>
              <th className="p-3 text-start font-normal">{t('colFulfillment')}</th>
              <th className="p-3 text-start font-normal">{t('colStatus')}</th>
              <th className="p-3 text-end font-normal">{t('colTotal')}</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((order) => (
              <tr key={order.id} className="hover:bg-neutral-50">
                <td className="p-3">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="hover:text-primary font-medium"
                    dir="ltr"
                  >
                    {order.reference}
                  </Link>
                  {order.shopCount > 1 && (
                    <Badge variant="outline" className="ms-2">
                      {t('multiShop', { count: formatNumber(order.shopCount, locale) })}
                    </Badge>
                  )}
                </td>
                <td className="p-3">{order.customerName}</td>
                <td className="text-muted-foreground p-3 text-xs">
                  {formatDateTime(order.createdAt, locale)}
                </td>
                <td className="p-3">
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                    {order.fulfillment === 'delivery' ? (
                      <Truck className="h-3 w-3" aria-hidden />
                    ) : (
                      <Store className="h-3 w-3" aria-hidden />
                    )}
                    {t(`fulfillment.${order.fulfillment}`)}
                  </span>
                </td>
                <td className="p-3">
                  <Badge variant={STATUS_BADGE[order.status]}>{t(`status.${order.status}`)}</Badge>
                </td>
                <td className="p-3 text-end font-medium">{formatCurrency(order.total, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ListCapNotice shown={rows.length} hasMore={hasMore} />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-card border-border bg-card space-y-2 border p-3">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}
