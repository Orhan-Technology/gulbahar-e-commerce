import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BadgeCheck, MapPin } from 'lucide-react';

import { ConsolePageHeader } from '@/components/console/page-header';
import { VerificationReview } from '@/components/admin/verification-review';
import { EmptyState } from '@/components/custom/empty-state';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { verificationCounts, verificationDetail, verificationQueue } from '@/lib/db/queries/verification';
import { formatDate, formatNumber, formatUnitNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

type Query = { status?: 'submitted' | 'under_review' | 'verified' | 'rejected' | 'expired' };

/**
 * The verification review queue (Prompt C7).
 *
 * The default view is WORK — submitted and under review — rather than
 * everything ever decided. An admin opening this screen is here to decide
 * something; the history is one chip away.
 *
 * Each row carries its documents inline rather than linking to a detail page.
 * The decision needs the papers and the shop's own details side by side, and a
 * navigation between them is a decision made from memory.
 */
export default async function AdminVerificationsPage({
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
  const t = await getTranslations('adminVerifications');

  const counts = await verificationCounts();

  const chips = [
    { key: 'waiting', href: '/admin/verifications', count: counts.waiting, active: !query.status },
    {
      key: 'verified',
      href: '/admin/verifications?status=verified',
      count: counts.verified,
      active: query.status === 'verified',
    },
    {
      key: 'rejected',
      href: '/admin/verifications?status=rejected',
      count: counts.rejected,
      active: query.status === 'rejected',
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <ConsolePageHeader title={t('title')} description={t('intro')} />

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
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

      <Suspense key={query.status ?? 'waiting'} fallback={<QueueSkeleton />}>
        <Queue locale={locale} status={query.status} />
      </Suspense>
    </div>
  );
}

async function Queue({
  locale,
  status,
}: {
  locale: string;
  status?: Query['status'];
}) {
  const t = await getTranslations('adminVerifications');
  const rows = await verificationQueue(status);

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<BadgeCheck className="h-7 w-7" />}
        title={status ? t('emptyTitle') : t('emptyQueueTitle')}
        description={status ? t('emptyBody') : t('emptyQueueBody')}
      />
    );
  }

  // The documents come from a second read per row: the queue query counts them
  // for the list, and only the rows on screen need the full set.
  const details = await Promise.all(rows.map((row) => verificationDetail(row.id)));

  return (
    <ul className="space-y-3">
      {details.filter(Boolean).map((record) => (
        <li key={record!.id} className="rounded-card border-border bg-card space-y-3 border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/shops/${record!.shopSlug}`}
                className="hover:text-primary text-sm font-bold"
              >
                {pickLocale(record!.shopName, locale)}
              </Link>
              <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                {record!.shopFloor !== null && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {t('floorUnit', {
                      floor: formatNumber(record!.shopFloor, locale),
                      unit: formatUnitNumber(record!.shopUnitNumber, locale) || '—',
                    })}
                  </span>
                )}
                {record!.submittedAt && (
                  <span>{t('submittedOn', { date: formatDate(record!.submittedAt, locale) })}</span>
                )}
              </p>
            </div>

            <Badge variant={record!.status === 'under_review' ? 'warning' : 'secondary'}>
              {t(`status.${record!.status}` as never)}
            </Badge>
          </div>

          {record!.note && (
            <p className="rounded-control bg-neutral-50 p-2 text-xs text-neutral-700">
              {record!.note}
            </p>
          )}

          <VerificationReview
            verificationId={record!.id}
            status={record!.status}
            documents={record!.documents}
          />
        </li>
      ))}
    </ul>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-3" aria-busy>
      {Array.from({ length: 2 }, (_, index) => (
        <Skeleton key={index} className="rounded-card h-72 w-full" />
      ))}
    </div>
  );
}
