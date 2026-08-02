'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Archive, ArchiveRestore, Eye, Heart, ImageOff, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PriceDisplay } from '@/components/custom/price-display';
import {
  archiveProduct,
  bulkSetProductStatus,
  restoreProduct,
} from '@/lib/actions/shop-products';
import { StockEditor } from '@/components/dashboard/products/stock-editor';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type ShopProductRow = {
  id: string;
  slug: string;
  title: string;
  categoryName: string | null;
  price: number;
  discountPrice: number | null;
  stock: number;
  status: 'draft' | 'published' | 'unpublished' | 'archived';
  /**
   * ADMIN's stated reason for taking the product down (PRD §3.1). Read-only for
   * the shop — they may republish once they have fixed it, but they may not
   * rewrite what the mall said about it.
   */
  unpublishReason: string | null;
  viewCount: number;
  /** Views over the last seven days — see `viewWindow`. */
  weekViews: number;
  wishlistCount: number;
  imagePath: string | null;
  /** True when the fa title exists but en does not (PRD §11). */
  missingEnglish: boolean;
};

const LOW_STOCK = 5;

/**
 * Product list with inline stock editing and bulk status changes (PRD §6.2).
 *
 * Stock is the field a shopkeeper changes most and the one that costs them money
 * when stale, so it is editable in place — tap the number, adjust, autosave —
 * rather than requiring a trip through the full edit form.
 *
 * Rows rather than a real table: a six-column table is unusable at 390px, and this
 * panel is phone-first by requirement (PRD §6).
 */
export function ProductTable({
  rows,
  viewWindow = 'all',
}: {
  rows: ShopProductRow[];
  /**
   * Which view figure the eye icon shows. `week` when the list is ranked by
   * demand, so the number beside a row is the one the ordering used — an
   * all-time count under a seven-day ranking reads as a broken sort.
   */
  viewWindow?: 'all' | 'week';
}) {
  const t = useTranslations('shopProducts');
  const locale = useLocale();
  const router = useRouter();

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, startTransition] = React.useTransition();

  const allSelected = rows.length > 0 && selected.size === rows.length;

  /*
   * The archive view has no bulk controls. Publish and unpublish both refuse an
   * archived row (only restoreProduct leaves the archive), so offering the
   * buttons there would be offering an action that always fails — the one thing
   * worse than not offering it.
   */
  const archiveView = rows.length > 0 && rows.every((row) => row.status === 'archived');

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function bulk(status: 'published' | 'unpublished') {
    startTransition(async () => {
      const result = await bulkSetProductStatus([...selected], status);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(
        t(status === 'published' ? 'bulkPublished' : 'bulkUnpublished', {
          count: formatNumber(result.data.updated, locale),
        }),
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {/* Bulk action bar appears only with a selection, so it never occupies space
          a shopkeeper is not using. */}
      {selected.size > 0 && !archiveView && (
        <div className="rounded-card border-primary-200 bg-primary-50 sticky top-14 z-20 flex flex-wrap items-center gap-2 border p-3">
          <span className="text-primary-900 text-sm font-medium">
            {t('selectedCount', { count: formatNumber(selected.size, locale) })}
          </span>
          <div className="ms-auto flex gap-2">
            <Button size="sm" onClick={() => bulk('published')} disabled={pending}>
              {t('publishSelected')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulk('unpublished')}
              disabled={pending}
            >
              {t('unpublishSelected')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t('clearSelection')}
            </Button>
          </div>
        </div>
      )}

      {!archiveView && (
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) =>
              setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set())
            }
            aria-label={t('selectAll')}
          />
          <span className="text-muted-foreground text-xs">{t('selectAll')}</span>
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              'rounded-card bg-card flex gap-3 border p-3',
              selected.has(row.id) ? 'border-primary' : 'border-border',
            )}
          >
            {!archiveView && (
              <Checkbox
                checked={selected.has(row.id)}
                onCheckedChange={(checked) => toggle(row.id, Boolean(checked))}
                aria-label={row.title}
                className="mt-1 shrink-0"
              />
            )}

            <span className="rounded-control relative h-16 w-16 shrink-0 overflow-hidden bg-neutral-100">
              {row.imagePath ? (
                <Image src={row.imagePath} alt="" fill sizes="64px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-neutral-400">
                  <ImageOff className="h-5 w-5" aria-hidden />
                </span>
              )}
            </span>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="clamp-1 text-sm font-medium">{row.title}</span>
                <StatusBadge status={row.status} />
                {row.stock <= 0 ? (
                  <Badge variant="destructive">{t('outOfStock')}</Badge>
                ) : row.stock <= LOW_STOCK ? (
                  <Badge variant="warning">{t('lowStock')}</Badge>
                ) : null}
                {/* Missing translation is surfaced, never blocking (PRD §11). */}
                {row.missingEnglish && <Badge variant="outline">{t('missingEnglish')}</Badge>}
              </div>

              {row.categoryName && (
                <p className="text-muted-foreground text-xs">{row.categoryName}</p>
              )}

              {/*
                WHY it is down, on the row that is down. An unpublished product
                with no stated cause leaves the shopkeeper guessing at what to
                fix, and the reason is already written — by admin, on the row.
              */}
              {row.status === 'unpublished' && row.unpublishReason && (
                <p className="rounded-control border-danger-border bg-danger-bg text-danger px-2 py-1.5 text-xs">
                  <span className="font-bold">{t('unpublishReasonLabel')}</span>{' '}
                  {row.unpublishReason}
                </p>
              )}

              <PriceDisplay price={row.price} discountPrice={row.discountPrice} size="sm" />

              <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-3 w-3" aria-hidden />
                  {formatNumber(viewWindow === 'week' ? row.weekViews : row.viewCount, locale)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3 w-3" aria-hidden />
                  {formatNumber(row.wishlistCount, locale)}
                </span>
                <StockEditor productId={row.id} stock={row.stock} />
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-1">
              {row.status === 'archived' ? (
                <RestoreButton productId={row.id} />
              ) : (
                <>
                  <Button variant="ghost" size="icon" asChild aria-label={t('edit')}>
                    <Link href={`/dashboard/products/${row.id}`}>
                      <Pencil />
                    </Link>
                  </Button>
                  <ArchiveButton productId={row.id} title={row.title} />
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The delete a shopkeeper has never had (Prompt: no delete action exists).
 *
 * The dialog SAYS WHAT REALLY HAPPENS rather than asking "are you sure?". The
 * product is hidden, not erased, and the reason is worth one sentence: order
 * history has to keep naming what was bought, so a product that has ever been
 * sold cannot be removed. A shopkeeper told that once will not go hunting for a
 * harder delete, and one who is told nothing will.
 */
function ArchiveButton({ productId, title }: { productId: string; title: string }) {
  const t = useTranslations('shopProducts.archive');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('action')}
        className="hover:text-danger text-neutral-500"
        onClick={() => setOpen(true)}
      >
        <Archive />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>{t('confirmBody', { title })}</DialogDescription>
          </DialogHeader>

          {/* The way back, stated up front — this is reversible and says so. */}
          <p className="text-muted-foreground text-xs">{t('reversibleNote')}</p>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await archiveProduct(productId);
                  if (!result.ok) {
                    toast.error(t(`errors.${result.error}` as never));
                    return;
                  }
                  setOpen(false);
                  toast.success(t('archived'));
                  router.refresh();
                })
              }
            >
              <Archive />
              {pending ? t('archiving') : t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Out of the archive, as unpublished — never straight back onto the storefront. */
function RestoreButton({ productId }: { productId: string }) {
  const t = useTranslations('shopProducts.archive');
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await restoreProduct(productId);
          if (!result.ok) {
            toast.error(t(`errors.${result.error}` as never));
            return;
          }
          toast.success(t('restored'));
          router.refresh();
        })
      }
    >
      <ArchiveRestore />
      {pending ? t('restoring') : t('restore')}
    </Button>
  );
}

function StatusBadge({ status }: { status: ShopProductRow['status'] }) {
  const t = useTranslations('shopProducts.status');
  const variant =
    status === 'published'
      ? 'success'
      : status === 'draft'
        ? 'secondary'
        : status === 'archived'
          ? 'destructive'
          : 'outline';
  return <Badge variant={variant}>{t(status)}</Badge>;
}


