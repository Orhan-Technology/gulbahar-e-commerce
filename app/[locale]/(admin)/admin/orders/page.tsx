import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ShoppingBag, Store, Truck } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { allOrders } from '@/lib/db/queries/orders';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import type { OrderStatus } from '@/lib/db/schema';

type Query = { status?: OrderStatus };

const STATUS_BADGE: Record<
  OrderStatus,
  'default' | 'success' | 'warning' | 'secondary' | 'destructive'
> = {
  placed: 'warning',
  accepted: 'default',
  ready: 'default',
  fulfilled: 'success',
  rejected: 'destructive',
};

/**
 * All-orders view (PRD §7.4).
 *
 * READ-ONLY, deliberately: fulfilment is the shop's job, so there is no accept or
 * reject here even though admin can see every order. Admin's role is oversight, and
 * a status button on this screen would let mall management fulfil on a tenant's
 * behalf — which is not what the permission model says (PRD §3.1).
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

  const chips = [
    { key: 'all', href: '/admin/orders', active: !query.status },
    ...(['placed', 'accepted', 'ready', 'fulfilled', 'rejected'] as const).map((status) => ({
      key: status,
      href: `/admin/orders?status=${status}`,
      active: query.status === status,
    })),
  ];

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`rounded-pill border px-3 py-1.5 text-xs font-medium ${
              chip.active
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-card hover:border-primary'
            }`}
          >
            {t(`filters.${chip.key}`)}
          </Link>
        ))}
      </div>

      <Suspense key={query.status ?? 'all'} fallback={<TableSkeleton />}>
        <OrderTable locale={locale} query={query} />
      </Suspense>
    </div>
  );
}

async function OrderTable({ locale, query }: { locale: string; query: Query }) {
  const t = await getTranslations('adminOrders');
  const rows = await allOrders(query.status ? [query.status] : undefined, 200);

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<ShoppingBag className="h-7 w-7" />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
      />
    );
  }

  return (
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
