import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ScrollText } from 'lucide-react';

import { AuditDetail, auditTargetHref } from '@/components/admin/audit-detail';
import { AuditShopFilter } from '@/components/admin/audit-shop-filter';
import { ExportCsvLink } from '@/components/admin/export-csv-link';
import { ConsolePageHeader } from '@/components/console/page-header';
import { EmptyState } from '@/components/custom/empty-state';
import { requireAdmin } from '@/lib/auth/guards';
import {
  auditActivity,
  auditEntries,
  auditShopOptions,
  auditTargetCounts,
} from '@/lib/db/queries/audit';
import { formatDateTime, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

type Query = { type?: string; before?: string; shop?: string };

const ACTIVITY_DAYS = 30;

/** Tone per target type, so a page of grey rows has some shape to scan. */
const TONE: Record<string, string> = {
  shop: 'bg-primary-50 text-primary-800',
  product: 'bg-neutral-100 text-neutral-700',
  review: 'bg-accent-warm/15 text-neutral-800',
  category: 'bg-neutral-100 text-neutral-700',
  user: 'bg-accent-50 text-accent-900',
  campaign: 'bg-accent-50 text-accent-900',
  slot: 'bg-accent-50 text-accent-900',
  order: 'bg-neutral-100 text-neutral-700',
  settings: 'bg-neutral-100 text-neutral-700',
};

/**
 * The admin audit log (Prompt C9).
 *
 * WHO DID WHAT, TO WHAT, AND WHY. A mall has staff, and the day a second person
 * can approve a tenant or change the delivery fee is the day "who did this"
 * stops being a curiosity. Nothing here is generated for the demo — every row
 * was written by an admin action as it ran (lib/audit.ts).
 *
 * THE REASON IS THE COLUMN THAT MATTERS. A log of what happened is a list; a
 * log of why is a record. Rejections, suspensions and role changes all already
 * demand a written reason from the admin, and this is where that text stops
 * being a one-time notification and becomes something anyone can go back to.
 *
 * READ-ONLY AND APPEND-ONLY: a log the people it logs can edit is decoration,
 * and there is no code path anywhere in this build that updates or removes a
 * row from it. It IS downloadable, which is not a contradiction — a record
 * nobody can take out of the building is a record only its owner can produce,
 * and reading is exactly the right permission to have on it.
 */
export default async function AdminAuditPage({
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
  const t = await getTranslations('adminAudit');

  const [{ entries, nextCursor }, counts, activity, shopOptions] = await Promise.all([
    auditEntries({ targetType: query.type, targetId: query.shop, before: query.before }),
    auditTargetCounts(),
    auditActivity(ACTIVITY_DAYS),
    auditShopOptions(),
  ]);

  // The tenant the filter is currently narrowed to, for the "clear" line — the
  // options carry the label recorded at decision time, so a renamed shop still
  // reads as it did in the entry.
  const selectedShop = query.shop
    ? (shopOptions.find((shop) => shop.id === query.shop) ?? null)
    : null;

  const total = counts.reduce((sum, row) => sum + row.total, 0);
  // The two filters compose: narrowing to one tenant and then to one KIND of
  // decision about them is the second question a dispute produces. The cursor
  // is dropped, because a keyset from the wider list pages into nothing.
  const chipHref = (type?: string) => {
    const next = new URLSearchParams();
    if (type) next.set('type', type);
    if (query.shop) next.set('shop', query.shop);
    const search = next.toString();
    return search ? `/admin/audit?${search}` : '/admin/audit';
  };
  const chips = [
    { key: 'all', href: chipHref(), count: total, active: !query.type },
    ...counts.map((row) => ({
      key: row.targetType,
      href: chipHref(row.targetType),
      count: row.total,
      active: query.type === row.targetType,
    })),
  ];

  return (
    <div className="space-y-4 p-6">
      <ConsolePageHeader
        title={t('title')}
        description={t('subtitle', {
          count: formatNumber(activity.total, locale),
          days: formatNumber(ACTIVITY_DAYS, locale),
          actors: formatNumber(activity.actors, locale),
        })}
        actions={
          <>
            {/*
              THE SUBJECT FILTER (Prompt C12). Rendered whenever the log has
              said anything about a shop at all — an empty control on an empty
              log would be furniture.
            */}
            {shopOptions.length > 0 && (
              <AuditShopFilter
                shops={shopOptions.map((shop) => ({
                  id: shop.id,
                  label: shop.label,
                  // Persian digits, through lib/format like every other number
                  // on this surface — the option text is not exempt.
                  count: formatNumber(shop.total, locale),
                }))}
                current={query.shop}
              />
            )}
            {total > 0 ? <ExportCsvLink report="audit" params={{ type: query.type }} /> : undefined}
          </>
        }
      />

      {/*
        WHAT THE LIST IS NARROWED TO, and the way out of it. A filtered log that
        looks like the whole log is how somebody concludes a tenant was never
        suspended.
      */}
      {selectedShop && (
        <p
          className="rounded-card border-primary-200 bg-primary-50 flex flex-wrap items-center gap-2 border p-3 text-xs"
          data-audit-shop-scope
        >
          <span className="font-semibold">
            {t('shopScope', {
              shop: selectedShop.label,
              count: formatNumber(selectedShop.total, locale),
            })}
          </span>
          <Link href="/admin/audit" className="text-primary font-medium">
            {t('shopScopeClear')}
          </Link>
        </p>
      )}

      {total > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={chip.href}
              className={cn(
                'rounded-pill flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                chip.active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card hover:border-primary',
              )}
            >
              {chip.key === 'all' ? t('all') : t(`targets.${chip.key}` as never)}
              <span className="tabular-nums opacity-70">{formatNumber(chip.count, locale)}</span>
            </Link>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          illustration={<ScrollText className="h-7 w-7" aria-hidden />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
        />
      ) : (
        <ol className="rounded-card border-border bg-card divide-border divide-y overflow-hidden border">
          {entries.map((entry) => {
            const href = auditTargetHref(entry.targetType, entry.targetId, entry.targetLabel);
            return (
            <li key={entry.id} className="flex flex-wrap items-start gap-3 p-3.5 text-sm">
              <span
                className={cn(
                  'rounded-control shrink-0 px-2 py-1 text-2xs font-semibold',
                  TONE[entry.targetType] ?? 'bg-neutral-100 text-neutral-700',
                )}
              >
                {t(`targets.${entry.targetType}` as never)}
              </span>

              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium">
                  {/* `shop.approve` reads as NESTING to next-intl, which is
                      why the messages mirror the dotted action key as a nested
                      object rather than a flat key containing a dot — a flat
                      one throws INVALID_KEY at render (CLAUDE.md). */}
                  {t(`actions.${entry.action}` as never)}
                  {entry.targetLabel &&
                    /*
                      THE ROW POINTS AT WHAT IT IS ABOUT. Every line named a shop
                      or a product and none of them linked to it, so following up
                      on an entry meant retyping the name into another screen's
                      search box — on the one page whose value is that somebody
                      can go back and check.
                    */
                    (href ? (
                      <Link href={href} className="hover:text-primary text-muted-foreground">
                        {' '}
                        — {entry.targetLabel}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground"> — {entry.targetLabel}</span>
                    ))}
                </p>

                {entry.reason && (
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    «{entry.reason}»
                  </p>
                )}

                {/* Humanised per event type — see components/admin/audit-detail. */}
                <AuditDetail action={entry.action} detail={entry.detail} />
              </div>

              <div className="shrink-0 text-end">
                <p className="text-xs font-medium">{entry.actorName}</p>
                <p className="text-muted-foreground text-2xs">
                  {formatDateTime(entry.createdAt, locale)}
                </p>
              </div>
            </li>
            );
          })}
        </ol>
      )}

      {nextCursor && (
        <div className="flex justify-center">
          {/*
            A LINK, not a button. Paging by cursor in the URL keeps every page
            of the log addressable — the thing an auditor is most likely to want
            to send to somebody else.
          */}
          <Link
            href={`/admin/audit?${query.type ? `type=${query.type}&` : ''}${query.shop ? `shop=${query.shop}&` : ''}before=${encodeURIComponent(nextCursor)}`}
            className="rounded-control border-border bg-card hover:border-primary border px-4 py-2 text-sm font-medium"
          >
            {t('older')}
          </Link>
        </div>
      )}
    </div>
  );
}
