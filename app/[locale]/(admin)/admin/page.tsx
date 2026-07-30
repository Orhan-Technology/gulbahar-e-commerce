import { Suspense } from 'react';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';

import { AdminActionQueue } from '@/components/admin/admin-action-queue';
import { PlatformHealth, PlatformHealthSkeleton } from '@/components/admin/platform-health';
import { RevenueBlock, RevenueBlockSkeleton } from '@/components/admin/revenue-block';
import { Skeleton } from '@/components/ui/skeleton';
import { ADMIN_SECTIONS } from '@/lib/admin-sections';
import { requireAdmin } from '@/lib/auth/guards';
import { adminActionQueue } from '@/lib/db/queries/admin-overview';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <Suspense fallback={<HeaderSkeleton />}>
        <OverviewHeader />
      </Suspense>

      <Suspense fallback={<QueueSkeleton />}>
        <QueueSection />
      </Suspense>

      {/*
        Revenue sits directly under the queue and above platform health. It is
        the client's slide, and burying it under order counts is how a
        marketplace demo turns into a logistics demo.
      */}
      <Suspense fallback={<RevenueBlockSkeleton />}>
        <RevenueBlock />
      </Suspense>

      <Suspense fallback={<PlatformHealthSkeleton />}>
        <PlatformHealth />
      </Suspense>

      {/*
        The console's own index, the same pattern as the account hub (A4): the
        rail is the navigation on a desktop, but the overview is where someone
        arrives, and a section they have never opened is invisible in a dark
        sidebar they have stopped reading. Rendered from ADMIN_SECTIONS, so this
        and the rail cannot disagree about what the console contains.
      */}
      <ConsoleSections />
    </div>
  );
}

async function ConsoleSections() {
  const t = await getTranslations('adminNav');

  return (
    <section aria-labelledby="console-sections-heading" className="space-y-3">
      <h2 id="console-sections-heading" className="text-sm font-bold">
        {t('sectionsHeading')}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_SECTIONS.filter((section) => section.href !== '/admin').map((section) => {
          const Icon = section.icon;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                className="rounded-card border-border bg-card hover:border-primary flex h-full items-center gap-3 border p-3 transition-colors duration-150"
              >
                <span className="rounded-control bg-primary-50 text-primary flex h-9 w-9 shrink-0 items-center justify-center">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {t(section.key as never)}
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-neutral-400 rtl:rotate-180"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function OverviewHeader() {
  const locale = await getLocale();
  const t = await getTranslations('adminOverview');
  const entries = await adminActionQueue(locale);

  return (
    <div>
      <h1 className="text-xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm">
        {entries.length > 0
          ? t('waitingSummary', {
              // `n` pluralises, `count` renders — see lib/db/queries/dashboard.ts.
              n: entries.length,
              count: formatNumber(entries.length, locale),
            })
          : t('nothingWaiting')}
      </p>
    </div>
  );
}

async function QueueSection() {
  const locale = await getLocale();
  const entries = await adminActionQueue(locale);
  return <AdminActionQueue entries={entries} />;
}

function HeaderSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
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
