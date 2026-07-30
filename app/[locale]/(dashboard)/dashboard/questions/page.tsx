import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { MessageCircleQuestion } from 'lucide-react';

import { EmptyState } from '@/components/custom/empty-state';
import { QuestionCard } from '@/components/dashboard/questions/question-card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireShopkeeper } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { shopQuestionCounts, shopQuestions } from '@/lib/db/queries/questions';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import type { LocalizedText } from '@/lib/db/schema';

type Query = { status?: 'pending' | 'answered'; answer?: string };

/**
 * Customer questions across the shop's products (Prompt P4).
 *
 * PENDING FIRST and oldest first inside it, which is the opposite of the
 * storefront's newest-first: a shopkeeper is working a queue, and the question
 * that has been waiting three days is the one that matters.
 */
export default async function ShopQuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const user = await requireShopkeeper(locale);
  const t = await getTranslations('shopQuestions');

  const counts = await shopQuestionCounts(user.shopId);

  const chips = [
    {
      key: 'all',
      href: '/dashboard/questions',
      count: counts.pending + counts.answered,
      active: !query.status,
    },
    {
      key: 'pending',
      href: '/dashboard/questions?status=pending',
      count: counts.pending,
      active: query.status === 'pending',
    },
    {
      key: 'answered',
      href: '/dashboard/questions?status=answered',
      count: counts.answered,
      active: query.status === 'answered',
    },
  ];

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-base font-bold">{t('title')}</h1>
        <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>
      </div>

      <div className="flex scrollbar-none gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`rounded-pill flex shrink-0 items-center gap-1.5 border px-3 py-1.5 text-xs font-medium ${
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

      <Suspense key={query.status ?? 'all'} fallback={<QuestionListSkeleton />}>
        <QuestionList shopId={user.shopId} locale={locale} query={query} />
      </Suspense>
    </div>
  );
}

async function QuestionList({
  shopId,
  locale,
  query,
}: {
  shopId: string;
  locale: string;
  query: Query;
}) {
  const t = await getTranslations('shopQuestions');
  const rows = await shopQuestions(shopId, query.status);

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<MessageCircleQuestion className="h-7 w-7" />}
        title={query.status === 'pending' ? t('emptyPendingTitle') : t('emptyTitle')}
        description={query.status === 'pending' ? t('emptyPendingBody') : t('emptyBody')}
      />
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <QuestionCard
          key={row.id}
          autoAnswer={row.id === query.answer}
          question={{
            id: row.id,
            body: row.body,
            status: row.status,
            createdAt: row.createdAt.toISOString(),
            askerName: row.askerName,
            productSlug: row.productSlug,
            productTitle: pickLocale(row.productTitle as LocalizedText, locale),
            productImage: row.productImage,
            answer: row.answer
              ? { body: row.answer.body, createdAt: row.answer.createdAt.toISOString() }
              : null,
          }}
        />
      ))}
    </ul>
  );
}

function QuestionListSkeleton() {
  return (
    <div className="space-y-2" aria-busy>
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="rounded-card h-28 w-full" />
      ))}
    </div>
  );
}
