import { setRequestLocale } from 'next-intl/server';

import { requireUser } from '@/lib/auth/guards';

/**
 * Onboarding shell — currently just shop registration (PRD §13.1).
 *
 * A SEPARATE route group from (dashboard) on purpose. The dashboard layout guard
 * redirects any shopkeeper without a shop to /dashboard/register-shop, so putting
 * that page inside (dashboard) would make the guard redirect to itself forever.
 * Route groups do not appear in the URL, so the path stays what the guard expects.
 *
 * Requires only a signed-in user: at this point they may still be a customer, and
 * registering is what makes them a shopkeeper.
 */
export default async function OnboardingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale);

  return <div className="min-h-screen bg-neutral-50">{children}</div>;
}
