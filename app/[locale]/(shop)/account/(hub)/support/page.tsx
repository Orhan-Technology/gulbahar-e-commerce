import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Clock, MapPin, Package, Phone, Store } from 'lucide-react';

import { AccountSectionHeader } from '@/components/shop/account/section-header';
import { pressable } from '@/components/motion/pressable';
import { requireUser } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { siteSettings } from '@/lib/db/queries/settings';
import { formatOpeningHours, formatPhone } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Support (Prompts A2, A3) — real contact details, and nothing else.
 *
 * Every fact here comes from `platform_settings`, which the admin edits, so the
 * number a customer is asked to ring is the one the mall actually answers. The
 * phone is a `tel:` link because this section is read on a phone.
 *
 * There is NO CHAT and no ticket form. Both would be a widget that swallows a
 * message nobody receives, which is worse than an unanswered page — so what
 * this offers instead are the two doors that do lead somewhere: your own orders,
 * and the shop that sold you the thing, who is the person to ask about it.
 */
export default async function AccountSupportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account');

  await requireUser(locale);
  const settings = await siteSettings();

  return (
    <div className="space-y-4">
      <AccountSectionHeader
        title={t('sections.support.title')}
        description={t('sections.support.body')}
      />

      <section className="rounded-card border-border bg-card divide-border divide-y border">
        <a
          href={`tel:${settings.supportPhone}`}
          className="hover:bg-neutral-50 flex items-center gap-3 p-4 transition-colors duration-150"
        >
          <span className="rounded-control bg-primary-50 text-primary flex h-10 w-10 shrink-0 items-center justify-center">
            <Phone className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{t('support.phoneLabel')}</span>
            <span className="block text-sm tabular-nums" dir="ltr">
              {formatPhone(settings.supportPhone, locale)}
            </span>
          </span>
        </a>

        <InfoRow
          icon={<Clock className="h-5 w-5" aria-hidden />}
          label={t('support.hoursLabel')}
          value={formatOpeningHours(settings.hours, locale)}
        />

        <InfoRow
          icon={<MapPin className="h-5 w-5" aria-hidden />}
          label={t('support.addressLabel')}
          value={`${pickLocale(settings.mallName, locale)} — ${pickLocale(settings.address, locale)}`}
        />
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <HelpLink
          href="/account/orders"
          icon={<Package className="h-5 w-5" aria-hidden />}
          title={t('support.orderHelpTitle')}
          body={t('support.orderHelpBody')}
        />
        <HelpLink
          href="/shops"
          icon={<Store className="h-5 w-5" aria-hidden />}
          title={t('support.shopHelpTitle')}
          body={t('support.shopHelpBody')}
        />
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="rounded-control flex h-10 w-10 shrink-0 items-center justify-center bg-neutral-100 text-neutral-600">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="text-muted-foreground block text-sm">{value}</span>
      </span>
    </div>
  );
}

function HelpLink({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        pressable,
        'rounded-card border-border bg-card shadow-card hover:shadow-overlay flex h-full items-start gap-3 border p-4 transition-[box-shadow,scale] duration-150 ease-out',
      )}
    >
      <span className="rounded-control bg-primary-50 text-primary-700 flex h-10 w-10 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground block text-xs">{body}</span>
      </span>
    </Link>
  );
}
