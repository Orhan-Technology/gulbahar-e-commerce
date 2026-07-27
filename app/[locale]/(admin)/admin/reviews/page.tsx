import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';

import { ModerationCard } from '@/components/admin/moderation-card';
import { EmptyState } from '@/components/custom/empty-state';
import { Badge } from '@/components/ui/badge';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { adminReviewCounts, adminReviewQueue } from '@/lib/db/queries/admin';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

type Query = { status?: 'reported' | 'removed' | 'visible' };

/** Review moderation queue (PRD §7.2). */
export default async function AdminReviewsPage({
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
  const t = await getTranslations('adminReviews');

  const status = query.status ?? 'reported';
  const [counts, rows] = await Promise.all([adminReviewCounts(), adminReviewQueue(status)]);

  const chips = (['reported', 'removed', 'visible'] as const).map((key) => ({
    key,
    href: `/admin/reviews?status=${key}`,
    count: counts[key],
    active: status === key,
  }));

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
            className={`rounded-pill flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium ${
              chip.active
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-card hover:border-primary'
            }`}
          >
            {t(`status.${chip.key}`)}
            <Badge variant={chip.active ? 'default' : 'secondary'}>
              {formatNumber(chip.count, locale)}
            </Badge>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          illustration={<ShieldCheck className="h-7 w-7" />}
          title={status === 'reported' ? t('emptyQueueTitle') : t('emptyTitle')}
          description={status === 'reported' ? t('emptyQueueBody') : t('emptyBody')}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <ModerationCard
              key={row.id}
              review={{
                id: row.id,
                rating: row.rating,
                body: row.body,
                status: row.status,
                createdAt: row.createdAt.toISOString(),
                authorName: row.authorName,
                authorPhone: row.authorPhone,
                productSlug: row.productSlug,
                productTitle: pickLocale(row.productTitle, locale),
                shopName: pickLocale(row.shopName, locale),
                shopSlug: row.shopSlug,
                responseBody: row.responseBody,
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
