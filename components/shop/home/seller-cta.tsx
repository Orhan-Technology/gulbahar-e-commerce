import { getTranslations } from 'next-intl/server';
import { ArrowRight, Store } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Link } from '@/lib/i18n/navigation';

/**
 * Closing band: the pitch to Gulbahar's own tenants (PRD §5.1, §6.0).
 *
 * Points at /dashboard rather than the registration route directly, because the
 * dashboard guard is what decides where a given visitor belongs — a shopkeeper
 * with a shop lands on their panel, one without lands on registration, and a
 * customer is asked to sign in. Linking past that guard would send a signed-in
 * shopkeeper to a form they have already completed.
 */
export async function SellerCta() {
  const t = await getTranslations('home');

  return (
    <section className="rounded-card bg-primary-50 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:gap-8 sm:p-10">
      <span className="rounded-pill bg-primary text-primary-foreground flex h-12 w-12 shrink-0 items-center justify-center">
        <Store className="h-5 w-5" aria-hidden />
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="text-foreground text-xl leading-tight font-extrabold">
          {t('sellerCtaTitle')}
        </h2>
        <p className="max-w-prose text-base text-neutral-600">{t('sellerCtaBody')}</p>
      </div>

      <Button asChild size="lg" className="shrink-0">
        <Link href="/dashboard">
          {t('sellerCtaAction')}
          <ArrowRight className="rtl:rotate-180" />
        </Link>
      </Button>
    </section>
  );
}
