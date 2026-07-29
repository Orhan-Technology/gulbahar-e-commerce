import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { Package, Store, Truck } from 'lucide-react';

import { pressable } from '@/components/motion/pressable';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Status colour is SEMANTIC, not decorative.
 *
 * `placed` is deliberately neutral rather than warning-coloured: from the
 * customer's side nothing has gone wrong, the shop simply has not answered yet.
 * Amber there would make every fresh order look like a problem.
 */
const STATUS_VARIANT = {
  placed: 'secondary',
  accepted: 'default',
  ready: 'warning',
  fulfilled: 'success',
  rejected: 'destructive',
} as const;

export type CustomerOrderRow = {
  id: string;
  reference: string;
  status: keyof typeof STATUS_VARIANT;
  fulfillment: 'delivery' | 'pickup';
  total: number;
  createdAt: Date;
  itemCount: number;
  thumbnails: string[];
  shopCount: number;
};

/**
 * One order, as a CARD (PRD §5.4).
 *
 * It was a row: reference, status pill, amount, one muted line. Accurate, and
 * indistinguishable from a bank statement. What makes an order recognisable is
 * what was IN it, so the photographs lead — a stacked strip of the first four
 * with an overflow chip, which is how anyone actually identifies "the order with
 * the shoes" among six.
 */
export async function OrderCard({ order }: { order: CustomerOrderRow }) {
  const locale = await getLocale();
  const t = await getTranslations('orders');
  const tStatus = await getTranslations('order.status');

  const shown = order.thumbnails.slice(0, 4);
  const overflow = order.itemCount - shown.length;

  return (
    <Link
      href={`/account/orders/${order.reference}`}
      className={cn(
        pressable,
        'rounded-card border-border bg-card shadow-card hover:shadow-overlay block border p-4 transition-[box-shadow,translate,scale] duration-150 ease-out hover:-translate-y-0.5',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* `dir="ltr"`: a reference is an identifier, not prose, and GC-24788
            reads backwards if it inherits an RTL paragraph. */}
        <span className="font-mono text-sm font-bold tabular-nums" dir="ltr">
          {order.reference}
        </span>
        <Badge variant={STATUS_VARIANT[order.status]}>{tStatus(order.status)}</Badge>
        <span className="ms-auto text-sm font-bold tabular-nums">
          {formatCurrency(order.total, locale)}
        </span>
      </div>

      {shown.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          {shown.map((path, index) => (
            <span
              key={path + index}
              className="rounded-media border-card relative h-14 w-14 overflow-hidden border-2 bg-neutral-100"
            >
              <Image src={path} alt="" fill sizes="56px" className="object-cover" />
            </span>
          ))}
          {overflow > 0 && (
            <span className="rounded-media text-2xs flex h-14 w-14 items-center justify-center bg-neutral-100 font-bold text-neutral-600 tabular-nums">
              +{formatNumber(overflow, locale)}
            </span>
          )}
        </div>
      )}

      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {/* Relative for scanning, absolute on hover for anyone who needs it. */}
        <time dateTime={order.createdAt.toISOString()} title={formatDateTime(order.createdAt, locale)}>
          {formatRelative(order.createdAt, locale)}
        </time>
        <span className="inline-flex items-center gap-1">
          <Package className="h-3 w-3" aria-hidden />
          {t('itemCount', { count: formatNumber(order.itemCount, locale) })}
        </span>
        <span className="inline-flex items-center gap-1">
          {order.fulfillment === 'delivery' ? (
            <Truck className="h-3 w-3" aria-hidden />
          ) : (
            <Store className="h-3 w-3" aria-hidden />
          )}
          {t(order.fulfillment)}
        </span>
        {/* An order spanning two shops arrives in two parts (PRD §5.3), which
            is a fact the customer needs before they wonder where the rest is. */}
        {order.shopCount > 1 && (
          <Badge variant="outline">
            {t('shopCount', {
              n: order.shopCount,
              count: formatNumber(order.shopCount, locale),
            })}
          </Badge>
        )}
      </div>
    </Link>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="rounded-card border-border bg-card space-y-3 border p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="rounded-pill h-5 w-16" />
        <Skeleton className="ms-auto h-4 w-20" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="rounded-media h-14 w-14" />
        ))}
      </div>
      <Skeleton className="h-3 w-48" />
    </div>
  );
}
