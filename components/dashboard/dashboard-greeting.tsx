import { getTranslations } from 'next-intl/server';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * The one warm line on the dashboard (PRD §6.1, Prompt C3).
 *
 * A GREETING, and nothing else. It used to restate the shop name, the floor,
 * the unit and the approval status — all four of which the console chrome
 * already shows, two centimetres above, on every screen. Three copies of
 * «الکترونیک کابل · طبقه دوم · دکان ۲۱۴ · فعال» on one page is what made this
 * console read as a template rather than as a tool.
 *
 * Identity belongs to the chrome; this says whose morning it is and gets out of
 * the way of the queue beneath it. It also no longer queries anything, so it
 * needs no Suspense boundary of its own — the skeleton survives for the
 * styleguide and for the header row while the rest of the page streams.
 */
export async function DashboardGreeting({ name }: { name: string }) {
  const t = await getTranslations('dashboard');

  return <h1 className="text-xl font-bold">{t('greeting', { name: name.split(' ')[0] })}</h1>;
}

export function DashboardGreetingSkeleton() {
  return <Skeleton className="h-6 w-40" />;
}
