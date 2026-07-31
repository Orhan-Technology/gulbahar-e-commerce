import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ScrollText } from 'lucide-react';

import { ConsolePageHeader } from '@/components/console/page-header';
import { EmptyState } from '@/components/custom/empty-state';
import { requireAdmin } from '@/lib/auth/guards';
import { auditActivity, auditEntries, auditTargetCounts } from '@/lib/db/queries/audit';
import { formatDateTime, formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

type Query = { type?: string; before?: string };

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
 * READ-ONLY, with no export and no delete. A log the people it logs can edit is
 * decoration, and there is no code path anywhere in this build that updates or
 * removes a row from it.
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

  const [{ entries, nextCursor }, counts, activity] = await Promise.all([
    auditEntries({ targetType: query.type, before: query.before }),
    auditTargetCounts(),
    auditActivity(ACTIVITY_DAYS),
  ]);

  const total = counts.reduce((sum, row) => sum + row.total, 0);
  const chips = [
    { key: 'all', href: '/admin/audit', count: total, active: !query.type },
    ...counts.map((row) => ({
      key: row.targetType,
      href: `/admin/audit?type=${row.targetType}`,
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
      />

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
          {entries.map((entry) => (
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
                  {entry.targetLabel && (
                    <span className="text-muted-foreground"> — {entry.targetLabel}</span>
                  )}
                </p>

                {entry.reason && (
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    «{entry.reason}»
                  </p>
                )}

                {entry.detail && Object.keys(entry.detail).length > 0 && (
                  <p className="text-2xs text-neutral-500">
                    {Object.entries(entry.detail)
                      .map(([key, value]) => `${key}: ${value ?? '—'}`)
                      .join(' · ')}
                  </p>
                )}
              </div>

              <div className="shrink-0 text-end">
                <p className="text-xs font-medium">{entry.actorName}</p>
                <p className="text-muted-foreground text-2xs">
                  {formatDateTime(entry.createdAt, locale)}
                </p>
              </div>
            </li>
          ))}
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
            href={`/admin/audit?${query.type ? `type=${query.type}&` : ''}before=${encodeURIComponent(nextCursor)}`}
            className="rounded-control border-border bg-card hover:border-primary border px-4 py-2 text-sm font-medium"
          >
            {t('older')}
          </Link>
        </div>
      )}
    </div>
  );
}
