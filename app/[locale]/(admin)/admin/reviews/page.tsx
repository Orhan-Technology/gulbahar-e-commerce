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

type Query = { status?: 'reported' | 'removed' | 'visible'; tab?: string };

/**
 * Review moderation queue (PRD §7.2).
 *
 * QUESTIONS ARE A SEPARATE TAB NOW, and that is a correction (Prompt C12).
 * They used to render underneath the reported reviews on the same scroll, on
 * the argument that moderation is one job. The consequence was that the
 * admin's urgent work — three reported reviews, each of which somebody is
 * waiting on — sat above an endless list of answered questions, and the queue
 * could never reach zero: there was always something below the fold.
 *
 * And most of that list is not the admin's work at all. A pending question is
 * the SHOP's to-do; the mall only intervenes when the text itself is a problem.
 * A tab says that: reports here, questions there, each able to be finished.
 */
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

  const questionsTab = query.tab === 'questions';
  const status = query.status ?? 'reported';

  const [counts, questionCount] = await Promise.all([
    adminReviewCounts(),
    adminQuestions().then((rows) => rows.length),
  ]);

  const chips = (['reported', 'removed', 'visible'] as const).map((key) => ({
    key,
    href: `/admin/reviews?status=${key}`,
    count: counts[key],
    active: !questionsTab && status === key,
  }));

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <p className="text-muted-foreground max-w-prose text-sm">
          {questionsTab ? t('questionsIntro') : t('intro')}
        </p>
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

        {/* Separated by a divider: questions are a different KIND of row, not a
            fourth review status, and sitting flush against the three would read
            as one. The same treatment the shops directory gives its health view. */}
        <span className="bg-border mx-1 w-px self-stretch" aria-hidden />

        <Link
          href="/admin/reviews?tab=questions"
          data-reviews-tab="questions"
          className={`rounded-pill flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium ${
            questionsTab
              ? 'border-primary bg-primary-50 text-primary'
              : 'border-border bg-card hover:border-primary'
          }`}
        >
          <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden />
          {t('questionsTab')}
          <Badge variant={questionsTab ? 'default' : 'secondary'}>
            {formatNumber(questionCount, locale)}
          </Badge>
        </Link>
      </div>

      <Suspense
        key={questionsTab ? 'questions' : status}
        fallback={<QueueSkeleton />}
      >
        {questionsTab ? (
          <QuestionModerationList locale={locale} />
        ) : (
          <ReviewQueue locale={locale} status={status} />
        )}
      </Suspense>
    </div>
  );
}

async function ReviewQueue({
  locale,
  status,
}: {
  locale: string;
  status: 'reported' | 'removed' | 'visible';
}) {
  const t = await getTranslations('adminReviews');
  const rows = await adminReviewQueue(status);

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<ShieldCheck className="h-7 w-7" />}
        title={status === 'reported' ? t('emptyQueueTitle') : t('emptyTitle')}
        description={status === 'reported' ? t('emptyQueueBody') : t('emptyBody')}
      />
    );
  }

  return (
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
            // The benchmark this score is being judged against.
            shopAverageRating:
              row.shopAverageRating === null ? null : Number(row.shopAverageRating),
            shopReviewCount: Number(row.shopReviewCount),
          }}
        />
      ))}
    </ul>
  );
}

async function QuestionModerationList({ locale }: { locale: string }) {
  const t = await getTranslations('adminQuestions');
  const rows = await adminQuestions();

  return (
    <section className="space-y-3">
      {/*
        The tab states whose job this is. Pending questions belong to the SHOP;
        the mall reads this list for text that should not be on the platform,
        which is a much rarer thing than an unanswered question.
      */}
      <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>

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

function QueueSkeleton() {
  return (
    <div className="space-y-3" aria-busy>
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="rounded-card h-36 w-full" />
      ))}
    </div>
  );
}
