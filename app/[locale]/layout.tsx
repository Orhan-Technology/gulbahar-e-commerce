import type { Metadata } from 'next';
import localFont from 'next/font/local';
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

/*
 * Self-hosted variable fonts (PRD §1.3 — the demo must run with no network at
 * all). next/font/google downloads at BUILD time, which made the first build
 * fail on an offline or restricted machine; these files are committed to the
 * repo, so a fresh clone builds and runs fully offline.
 *
 * Vazirmatn covers Dari AND Pashto (its Arabic-script set includes the Pashto
 * letters ټ ډ ړ ږ ښ ڼ ۍ ې) plus Persian digits, so one face serves both RTL
 * locales — which is also why numerals and weights stay consistent when a
 * Pashto string falls back to a Dari one (PRD §11).
 */
const vazirmatn = localFont({
  src: '../../assets/fonts/Vazirmatn[wght].woff2',
  weight: '100 900',
  variable: '--font-vazirmatn',
  display: 'swap',
});

const inter = localFont({
  src: '../../assets/fonts/InterVariable.woff2',
  weight: '100 900',
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
      {/*
        suppressHydrationWarning is for ATTRIBUTES INJECTED BY BROWSER EXTENSIONS, not
        for anything this app renders. Bitdefender's anti-tracker adds `bis_register`
        and `__processed_<uuid>__` to <body> before React hydrates, and React reports
        the mismatch it cannot reconcile. It suppresses one level only — a genuine
        mismatch in our own markup inside <body> is still reported.

        The same extension adds `bis_skin_checked` to arbitrary <div>s deeper in the
        tree, which nothing here can suppress. Present the demo in a clean profile
        (docs/DEMO-RUNBOOK.md, checklist item 9) and those disappear too.
      */}
      <body suppressHydrationWarning>
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
