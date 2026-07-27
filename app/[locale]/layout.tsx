import type { Metadata } from 'next';
import { Inter, Vazirmatn } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Toaster } from '@/components/ui/sonner';
import { DemoControlPanel } from '@/components/demo/control-panel';
import { NotificationLog } from '@/components/demo/notification-log';
import { currentUser } from '@/lib/auth/guards';
import { isDemoMode } from '@/lib/demo';
import { localeDirection, routing } from '@/lib/i18n/routing';
import '../globals.css';

const vazirmatn = Vazirmatn({
  subsets: ['arabic', 'latin'],
  variable: '--font-vazirmatn',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * `params` is a Promise as of Next 15 and required to be awaited in Next 16.
 */
type LocaleParams = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'brand' });
  return {
    title: t('name'),
    description: t('tagline'),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleParams & { children: React.ReactNode }) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enables static rendering for this locale segment.
  setRequestLocale(locale);

  const messages = await getMessages();

  /*
   * The presenter tools are mounted here so they exist on ALL THREE surfaces
   * (PRD §9.2) — the log has to be openable during checkout, on the shop dashboard
   * and in admin without three separate integrations.
   *
   * Gated on DEMO_MODE at the LAYOUT level, so outside a demo build the components
   * are absent from the tree rather than merely hidden. Their server actions check
   * the same flag independently, because an action is reachable without its button.
   */
  const demo = isDemoMode();
  const demoUser = demo ? await currentUser() : null;

  return (
    <html
      lang={locale}
      dir={localeDirection(locale)}
      className={`${vazirmatn.variable} ${inter.variable}`}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
          {/* Toast position follows document direction — see components/ui/sonner.tsx */}
          <Toaster />
          {demo && (
            <>
              <NotificationLog />
              <DemoControlPanel currentShopId={demoUser?.shopId ?? null} />
            </>
          )}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
