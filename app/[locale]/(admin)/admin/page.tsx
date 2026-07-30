import { Suspense } from 'react';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';

import { AdminActionQueue } from '@/components/admin/admin-action-queue';
import { PlatformHealth, PlatformHealthSkeleton } from '@/components/admin/platform-health';
import { RevenueBlock, RevenueBlockSkeleton } from '@/components/admin/revenue-block';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { adminActionQueue } from '@/lib/db/queries/admin-overview';
import { parseConsoleRange } from '@/lib/console-range';
import { ConsolePageHeader } from '@/components/console/page-header';
import { RangeControl } from '@/components/console/range-control';

/**
 * Admin overview — quality-bar screen #4 (PRD §7, §10.8).
 *
 * Two questions, in the order the mall owner asks them: is anything waiting on
 * me, and what is the platform earning. Everything else is third.
 *
 * The previous version led with four counter tiles and then a row of stats,
 * which answered neither well: a count of pending shops says there is work
 * without letting you do any of it, and the platform's own income — the number
 * this whole product exists to produce — was one cell in a four-up grid of
 * order metrics. Now the queue carries its decisions on the rows, and revenue
 * is a headline on solid blue that cannot be mistaken for merchandise volume.
 *
 * DENSITY RULE for this surface: at most three cards to a row, and no tables.
 * It is desktop-leaning and could hold far more; a mall manager scanning it for
 * five seconds could not.
 */
export default async function AdminOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { range: rangeKey } = await searchParams;
  await requireAdmin(locale);
  const t = await getTranslations('adminOverview');
  const range = parseConsoleRange(rangeKey);

  return (
    <div className="mx-auto max-w-[100rem] space-y-6 p-4 sm:p-6">
      {/*
        THE HEADING IS THE HEADING (Prompt C3). It used to be followed by
        "۵ مورد منتظر شماست" — directly above a card titled «کارهای منتظر ۵».
        The same count twice in eighty pixels is what makes a console read as a
        template; the card owns that number, so the page just says where you
        are.
      */}
      <ConsolePageHeader title={t('title')} actions={<RangeControl current={range.key} />} />

      {/*
        Two regions from `xl`, the same shape as the shopkeeper's (Prompt C3):
        decisions and money down the main column, platform health in the rail.
        The old page centred a 1152px column and ended with a grid of links to
        the sections already listed in the sidebar beside it — that grid is gone
        rather than moved, because nothing replaces navigation that is already
        on screen.
      */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
        <div className="space-y-6">
          <Suspense fallback={<QueueSkeleton />}>
            <QueueSection />
          </Suspense>

          {/*
            Revenue sits directly under the queue. It is the client's slide, and
            burying it under order counts is how a marketplace demo turns into a
            logistics demo.
          */}
          <Suspense fallback={<RevenueBlockSkeleton />}>
            <RevenueBlock />
          </Suspense>
        </div>

        <Suspense fallback={<PlatformHealthSkeleton />}>
          <PlatformHealth range={range} />
        </Suspense>
      </div>
    </div>
  );
}

async function QueueSection() {
  const locale = await getLocale();
  const entries = await adminActionQueue(locale);
  return <AdminActionQueue entries={entries} />;
}

function QueueSkeleton() {
  return (
    <section className="rounded-card border-border bg-card overflow-hidden border">
      <div className="border-border border-b p-4">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="divide-border divide-y">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex gap-3 p-4">
            <Skeleton className="rounded-pill h-10 w-[3px] shrink-0" />
            <Skeleton className="rounded-control h-10 w-10 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
