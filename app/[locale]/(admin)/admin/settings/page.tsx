import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight, FolderTree, ShieldCheck } from 'lucide-react';

import { DangerZone } from '@/components/admin/danger-zone';
import { LocaleSettings } from '@/components/admin/locale-settings';
import { MarketplaceSettingsForm } from '@/components/admin/marketplace-settings-form';
import { SlotManager } from '@/components/admin/slot-manager';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { revenueBySlot } from '@/lib/db/queries/admin-revenue';
import { siteSettings } from '@/lib/db/queries/settings';
import { isDemoMode } from '@/lib/demo';
import { Link } from '@/lib/i18n/navigation';
import { routing } from '@/lib/i18n/routing';

/**
 * Admin settings (Prompt A4) — the platform's own control surface.
 *
 * The overview answers "is anything waiting on me". This answers "how does this
 * marketplace behave", which is the question an owner asks second and which the
 * console previously could not answer at all: the delivery fee lived in a
 * constant, the mall's address in a translation string, and neither was
 * reachable without a developer.
 *
 * Sections are ordered by how often they are touched, not by how interesting
 * they are to build. Marketplace details first — they are what a client edits
 * live in the room — then slot pricing, then the taxonomy, then locales, then
 * the danger zone, which is last because nothing above it is destructive.
 */
export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale);
  const t = await getTranslations('adminSettings');

  const [settings, slots] = await Promise.all([siteSettings(), revenueBySlot()]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>
      </div>

      <section className="rounded-card border-border bg-card space-y-4 border p-4">
        <div>
          <h2 className="text-sm font-bold">{t('marketplaceHeading')}</h2>
          <p className="text-muted-foreground text-xs">{t('marketplaceHint')}</p>
        </div>
        <MarketplaceSettingsForm
          settings={{
            mallName: settings.mallName,
            address: settings.address,
            hours: settings.hours,
            supportPhone: settings.supportPhone,
            deliveryFee: settings.deliveryFee,
            pickupHoldHours: settings.pickupHoldHours,
            freeDeliveryThreshold: settings.freeDeliveryThreshold,
            currencyLabel: settings.currencyLabel,
          }}
        />
      </section>

      {/* The same editor as /admin/promotions, not a copy: a second slot form
          would eventually price a slot differently from the one the campaign
          queue reads. */}
      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <div>
          <h2 className="text-sm font-bold">{t('slotsHeading')}</h2>
          <p className="text-muted-foreground text-xs">{t('slotsHint')}</p>
        </div>
        <SlotManager
          slots={slots.map((slot) => ({
            id: slot.id,
            key: slot.key,
            name: pickLocale(slot.name, locale),
            capacity: slot.capacity,
            pricePerWeek: slot.pricePerWeek,
            occupied: slot.occupied,
            occupancy: slot.occupancy,
          }))}
        />
      </section>

      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <h2 className="text-sm font-bold">{t('localesHeading')}</h2>
        <LocaleSettings
          published={[...settings.publishedLocales]}
          defaultLocale={settings.defaultLocale}
          all={routing.locales}
        />
      </section>

      {/* Categories are a whole manager of their own; duplicating it here would
          be a second place to edit the same taxonomy. */}
      <Link
        href="/admin/categories"
        className="rounded-card border-border bg-card hover:border-primary flex items-center gap-3 border p-4 transition-colors duration-150"
      >
        <span className="rounded-control bg-primary-50 text-primary flex h-10 w-10 shrink-0 items-center justify-center">
          <FolderTree className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t('categoriesHeading')}</span>
          <span className="text-muted-foreground block text-xs">{t('categoriesHint')}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 rtl:rotate-180" aria-hidden />
      </Link>

      {/* An admin especially should have a password (A1/A4) — the same security
          surface every account uses, not a second implementation. */}
      <Link
        href="/account/security"
        className="rounded-card border-border bg-card hover:border-primary flex items-center gap-3 border p-4 transition-colors duration-150"
      >
        <span className="rounded-control bg-primary-50 text-primary flex h-10 w-10 shrink-0 items-center justify-center">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t('accountHeading')}</span>
          <span className="text-muted-foreground block text-xs">{t('accountHint')}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 rtl:rotate-180" aria-hidden />
      </Link>

      {/* ABSENT outside DEMO_MODE, not disabled: the reset drops every table. */}
      {isDemoMode() && <DangerZone confirmWord={t('danger.confirmWord')} />}
    </div>
  );
}
