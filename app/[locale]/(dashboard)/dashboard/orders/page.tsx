import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Package, Printer, ShoppingBag, Store, Truck, X } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { SearchBox } from '@/components/custom/search-box';
import { LiveRefresh } from '@/components/dashboard/live-refresh';
import { BulkOrderSelection } from '@/components/dashboard/orders/bulk-order-bar';
import { OrderActions } from '@/components/dashboard/orders/order-actions';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireShopkeeper } from '@/lib/auth/guards';
import {
  isOrderRange,
  shopOrderCounts,
  shopOrderList,
  type OrderRange,
} from '@/lib/db/queries/shop-orders';
import { formatCurrency, formatNumber, formatRelative } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { pressable } from '@/components/motion/pressable';
import { cn } from '@/lib/utils';
import type { OrderStatus } from '@/lib/db/schema';

type Query = { status?: OrderStatus; range?: string; q?: string; order?: string };

const STATUS_BADGE: Record<
  OrderStatus,
  'default' | 'success' | 'warning' | 'secondary' | 'destructive'
> = {
  placed: 'warning',
  accepted: 'default',
  ready: 'default',
  fulfilled: 'success',
  rejected: 'destructive',
  // Not destructive: an order the customer withdrew, or one the shop ended for
  // a stated reason, is not an alarm on this screen — it is closed business.
  cancelled: 'secondary',
};

/** Shopkeeper order list (PRD §6.3). */
export default async function ShopOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopOrders');

  const counts = await shopOrderCounts(user.shopId);

  /*
   * A range arrives from a dashboard KPI tile ("orders this week"). It is shown
   * as a removable chip above the list rather than silently applied: a filtered
   * list that does not say it is filtered is how a shopkeeper concludes their
   * orders have disappeared.
   */
  const range: OrderRange | undefined = isOrderRange(query.range) ? query.range : undefined;

  const chips = [
    {
      key: 'actionable',
      href: '/dashboard/orders',
      count: counts.actionable,
      // A range is a different axis, so it must not leave the default chip
      // looking selected while the list below is something else entirely.
      active: !query.status && !range,
    },
    {
      key: 'placed',
      href: '/dashboard/orders?status=placed',
      count: counts.placed,
      active: query.status === 'placed',
    },
    {
      key: 'accepted',
      href: '/dashboard/orders?status=accepted',
      count: counts.accepted,
      active: query.status === 'accepted',
    },
    {
      key: 'ready',
      href: '/dashboard/orders?status=ready',
      count: counts.ready,
      active: query.status === 'ready',
    },
    {
      key: 'fulfilled',
      href: '/dashboard/orders?status=fulfilled',
      count: counts.fulfilled,
      active: query.status === 'fulfilled',
    },
    {
      key: 'rejected',
      href: '/dashboard/orders?status=rejected',
      count: counts.rejected,
      active: query.status === 'rejected',
    },
    {
      key: 'cancelled',
      href: '/dashboard/orders?status=cancelled',
      count: counts.cancelled,
      active: query.status === 'cancelled',
    },
  ];

  return (
    <div className="space-y-4 p-4">
      {/* New orders appear without the shopkeeper reloading (PRD §6.3 acceptance). */}
      <LiveRefresh />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-bold">{t('title')}</h1>
        {counts.placed > 0 && (
          <Badge variant="warning">
            {t('needsAction', { count: formatNumber(counts.placed, locale) })}
          </Badge>
        )}
      </div>

      {range && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-500">{t('filteredBy')}</span>
          <Link
            href="/dashboard/orders"
            className={cn(
              pressable,
              'rounded-pill border-primary bg-primary-50 text-primary hover:bg-primary-100 inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold transition-[background-color,scale] duration-150 ease-out',
            )}
          >
            {t(`ranges.${range}`)}
            <X className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">{t('clearFilter')}</span>
          </Link>
        </div>
      )}

      <SearchBox placeholder={t('searchPlaceholder')} />

      <div className="flex scrollbar-none gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`rounded-pill flex shrink-0 items-center gap-1.5 border px-3 py-1.5 text-xs font-medium ${
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

      <Suspense fallback={<OrderListSkeleton />}>
        <OrderList shopId={user.shopId} locale={locale} query={query} range={range} />
      </Suspense>
    </div>
  );
}

async function OrderList({
  shopId,
  locale,
  query,
  range,
}: {
  shopId: string;
  locale: string;
  query: Query;
  range?: OrderRange;
}) {
  const t = await getTranslations('shopOrders');

  const orders = await shopOrderList({
    shopId,
    status: query.status,
    // A range is a window across every status, so it replaces the actionable
    // default rather than narrowing it — otherwise "orders this week" would
    // silently exclude the fulfilled ones, which are most of them.
    // A search is a different axis again: it must reach fulfilled orders too,
    // or looking up a reference from last week silently finds nothing.
    bucket: query.status || range || query.q ? undefined : 'actionable',
    range,
    search: query.q,
  });

  if (orders.length === 0) {
    return (
      <EmptyState
        illustration={<ShoppingBag className="h-7 w-7" />}
        title={query.status ? t(`empty.${query.status}`) : t('empty.actionable')}
        description={query.status ? t('emptyFilteredBody') : t('emptyActionableBody')}
      />
    );
  }

  return (
    <div className="space-y-2">
      {/*
        The rows are rendered HERE, on the server, and handed to the client
        component as nodes. A render prop would be the obvious shape and does
        not work: a function cannot cross the RSC boundary (see the note on
        SelectableOrder.content).
      */}
      <BulkOrderSelection
        orders={orders.map((order) => ({
          id: order.id,
          reference: order.reference,
          status: order.status,
          content: (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/orders/${order.id}`}
                    className="hover:text-primary text-sm font-bold"
                    dir="ltr"
                  >
                    {order.reference}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    <bdi>{order.customerName}</bdi> · {formatRelative(order.createdAt, locale)}
                  </p>
                </div>
                <Badge variant={STATUS_BADGE[order.status]}>{t(`status.${order.status}`)}</Badge>
              </div>

              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3 w-3" aria-hidden />
                  {t('itemCount', { count: formatNumber(order.shopItemCount, locale) })}
                </span>
                <span className="text-foreground font-medium">
                  {formatCurrency(order.shopSubtotal, locale)}
                </span>
                <span className="inline-flex items-center gap-1">
                  {order.fulfillment === 'delivery' ? (
                    <Truck className="h-3 w-3" aria-hidden />
                  ) : (
                    <Store className="h-3 w-3" aria-hidden />
                  )}
                  {t(`fulfillment.${order.fulfillment}`)}
                </span>
                <span>{t(`payment.${order.paymentMethod}`)}</span>
                {/* An order shared with another shop: say so, because either
                    shop's action moves the shared status. */}
                {order.shopCount > 1 && <Badge variant="outline">{t('sharedOrder')}</Badge>}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <OrderActions
                  orderId={order.id}
                  status={order.status}
                  fulfillment={order.fulfillment}
                  size="sm"
                />

                {/* Paper, for the person walking to the shelf (Prompt C6). */}
                <Link
                  href={`/dashboard/orders/${order.id}/slip`}
                  target="_blank"
                  className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-xs"
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden />
                  {t('slip.print')}
                </Link>
              </div>
            </>
          ),
        }))}
      />
    </div>
  );
}

function OrderListSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 4 }, (_, index) => (
        <li key={index} className="rounded-card border-border bg-card space-y-3 border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="rounded-pill h-5 w-16" />
          </div>
          <Skeleton className="h-3 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="rounded-control h-8 w-20" />
            <Skeleton className="rounded-control h-8 w-20" />
          </div>
        </li>
      ))}
    </ul>
  );
}
