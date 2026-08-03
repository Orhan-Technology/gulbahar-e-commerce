import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MessageCircleQuestion, ShieldCheck } from 'lucide-react';

import { ModerationCard } from '@/components/admin/moderation-card';
import { QuestionModerationCard } from '@/components/admin/question-moderation-card';
import { EmptyState } from '@/components/custom/empty-state';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { adminReviewCounts, adminReviewQueue } from '@/lib/db/queries/admin';
import { adminQuestions } from '@/lib/db/queries/questions';
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
                reportReasonCode: row.reportReasonCode,
                reportReason: row.reportReason,
                reportNote: row.reportNote,
                reportedAt: row.reportedAt,
                authorVisibleReviews: row.authorVisibleReviews,
                authorRemovedReviews: row.authorRemovedReviews,
              }}
            />
          ))}
        </ul>
      )}

      {/*
        Questions share this screen rather than getting their own (Prompt P4).
        Moderation is one job — "is this text acceptable on the platform" — and
        splitting it across two routes means an admin has to remember to check
        both. The queue above is the one with decisions attached; this is the
        same job on a different kind of row.
      */}
      <Suspense fallback={<QuestionsSkeleton />}>
        <QuestionModerationList locale={locale} />
      </Suspense>
    </div>
  );
}

async function QuestionModerationList({ locale }: { locale: string }) {
  const t = await getTranslations('adminQuestions');
  const rows = await adminQuestions();

  return (
    <section className="space-y-3 pt-4">
      <div>
        <h2 className="text-base font-bold">{t('title')}</h2>
        <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          illustration={<MessageCircleQuestion className="h-7 w-7" />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <QuestionModerationCard
              key={row.id}
              question={{
                id: row.id,
                body: row.body,
                status: row.status,
                createdAt: row.createdAt.toISOString(),
                askerName: row.askerName,
                productSlug: row.productSlug,
                productTitle: pickLocale(row.productTitle, locale),
                shopName: pickLocale(row.shopName, locale),
                answerBody: row.answerBody,
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestionsSkeleton() {
  return (
    <div className="space-y-3 pt-4" aria-busy>
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="rounded-card h-28 w-full" />
      ))}
    </div>
  );
}
