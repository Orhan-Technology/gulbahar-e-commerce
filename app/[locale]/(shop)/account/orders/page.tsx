import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Package } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { Badge } from '@/components/ui/badge';
import { requireUser } from '@/lib/auth/guards';
import { customerOrders } from '@/lib/db/queries/orders';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

const STATUS_VARIANT = {
  placed: 'secondary',
  accepted: 'default',
  ready: 'warning',
  fulfilled: 'success',
  rejected: 'destructive',
} as const;

/** Order history (PRD §5.4). */
export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('orders');
  const tStatus = await getTranslations('order.status');

  const session = await requireUser(locale);
  const orders = await customerOrders(session.id);

  if (orders.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          illustration={<Package className="h-7 w-7" />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={{ label: t('startShopping'), href: '/products' }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 sm:py-6">
      <h1 className="text-xl font-bold">{t('title')}</h1>

      <ul className="space-y-3">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              href={`/account/orders/${order.reference}`}
              className="rounded-card border-border bg-card shadow-card hover:shadow-overlay block border p-4 transition-shadow duration-150"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-sm font-bold tabular-nums">{order.reference}</span>
                <Badge variant={STATUS_VARIANT[order.status]}>{tStatus(order.status)}</Badge>
                <span className="ms-auto text-sm font-semibold tabular-nums">
                  {formatCurrency(order.total, locale)}
                </span>
              </div>
              <p className="text-muted-foreground mt-1.5 text-xs">
                {formatDate(order.createdAt, locale)} ·{' '}
                {t('itemCount', { count: formatNumber(order.itemCount, locale) })} ·{' '}
                {t(order.fulfillment)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
