'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  LayoutGrid,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { HeaderSearch } from '@/components/shop/search/header-search';
import { LocaleSwitcher } from '@/components/shop/locale-switcher';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import type { AppLocale } from '@/lib/i18n/routing';
import { cn } from '@/lib/utils';

export type SiteHeaderProps = {
  cartCount: number;
  /**
   * The notification bell, rendered by the LAYOUT and handed in.
   *
   * A node, not a component reference: this file is `'use client'`, and a
   * server component cannot be imported into one — only passed through as
   * children or a prop (CLAUDE.md).
   */
  bell?: React.ReactNode;
  /** Null when nobody is signed in. */
  user: { name?: string | null; role: string } | null;
  categories: Array<{ slug: string; label: string }>;
  /**
   * True while a flash offer is actually running, which lights the live badge.
   *
   * The reference design carries a permanently-lit "Live" entry for a
   * live-shopping feature. We have no such feature, and a badge that pulses at
   * every visitor forever while pointing at nothing is the kind of detail that
   * gets noticed in a demo. This one is wired to real state — the soonest
   * offer's countdown — and is simply ABSENT when nothing is expiring.
   */
  liveOffer?: boolean;
  /** The locales the admin has published (A4) — passed to the switcher. */
  locales?: readonly AppLocale[];
};

/**
 * Storefront header (PRD §5.1), built to the approved mockup: two rows on
 * desktop — brand, a wide search capsule and the account cluster on top, the
 * category bar beneath — collapsing to a single row with a drawer on mobile.
 *
 * Sticky, and it gains its border and shadow only once the page has scrolled.
 * The scroll listener is passive and toggles a boolean once per threshold
 * crossing, so it never becomes the reason a long listing page feels heavy.
 *
 * The reference draws a location picker and a pulsing "Live" entry. Delivery is
 * Kabul-wide at one flat fee (PRD §5.5), so the location reads as the statement
 * of fact it actually is, with no change affordance that would lead nowhere.
 * The live badge is real but CONDITIONAL — see `liveOffer`.
 */
export function SiteHeader({
  cartCount,
  user,
  categories,
  liveOffer = false,
  locales,
  bell,
}: SiteHeaderProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const cartLabel = t('nav.cartWithCount', { count: formatNumber(cartCount, locale) });

  return (
    <header
      className={cn(
        'bg-background sticky top-0 z-40 border-b transition-shadow duration-200',
        scrolled ? 'border-border shadow-card' : 'border-transparent',
      )}
    >
      {/* ---------------------------------------------------------------- */}
      {/* Row 1 — brand, search, account cluster                           */}
      <div className="max-w-page mx-auto flex items-center gap-4 px-4 pt-3 pb-2 sm:gap-7 sm:px-7 sm:pt-4">
        {/* Mobile: category drawer. Opens from the inline start, so it comes
            from the right in Dari. */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t('nav.menu')}>
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="start" className="w-72">
            <SheetHeader>
              <SheetTitle>{t('nav.categories')}</SheetTitle>
            </SheetHeader>
            <nav className="mt-6 flex flex-col gap-1 px-4">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/categories/${category.slug}`}
                  className="rounded-control px-3 py-2 text-sm hover:bg-neutral-100"
                >
                  {category.label}
                </Link>
              ))}
              <Link
                href="/shops"
                className="rounded-control text-primary hover:bg-primary-50 mt-2 flex items-center gap-2 px-3 py-2 text-sm font-medium"
              >
                <Store className="h-4 w-4" />
                {t('nav.shops')}
              </Link>
              <Link
                href="/offers"
                className="rounded-control text-primary-600 hover:bg-primary-50 flex items-center gap-2 px-3 py-2 text-sm font-medium"
              >
                <Sparkles className="h-4 w-4" />
                {t('nav.bestDeals')}
              </Link>
            </nav>
          </SheetContent>
        </Sheet>

        {/* Brand. The dot is the blue's smallest possible appearance and the
            only place it touches the wordmark. */}
        <Link href="/" className="flex shrink-0 items-baseline gap-1">
          <span className="text-foreground text-xl leading-none font-extrabold tracking-tight sm:text-2xl">
            {t('brand.shortName')}
          </span>
          <span className="rounded-pill bg-primary h-1.5 w-1.5" aria-hidden />
        </Link>

        <HeaderSearch variant="pill" className="hidden max-w-[700px] flex-1 sm:block" />

        <div className="ms-auto flex shrink-0 items-center gap-3 sm:gap-6">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="sm:hidden"
            aria-label={t('common.search')}
          >
            <Link href="/search">
              <Search />
            </Link>
          </Button>

          {/* Statement of fact, not a control: one flat Kabul delivery fee. */}
          <span className="hidden items-center gap-2 lg:flex">
            <MapPin className="h-4 w-4 shrink-0 text-neutral-600" aria-hidden />
            <span className="flex flex-col leading-tight">
              <span className="text-2xs text-neutral-500">{t('nav.deliverTo')}</span>
              {/* The pickup point, not the full postal address: the tagline is
                  three clauses long and shoved the account cluster off the row. */}
              <span className="text-foreground text-xs font-semibold">{t('brand.mallShort')}</span>
            </span>
          </span>

          <LocaleSwitcher locales={locales} />

          {/*
            The storefront was the one surface without a bell (Prompt C12) —
            which is the surface where an order's own customer reads about it.
            Passed IN as a node rather than imported: this header is a client
            component, and a server component that touches the database cannot
            be imported into one. Doing so pulls postgres into the browser
            bundle and the page 500s on `Can't resolve 'perf_hooks'`
            (CLAUDE.md's RSC-boundary rule, third variation).
          */}
          {bell}

          <Link
            href="/cart"
            aria-label={cartLabel}
            className="rounded-control hover:text-primary relative flex items-center gap-2 transition-colors duration-150"
          >
            <ShoppingCart className="h-5 w-5" aria-hidden />
            <span className="hidden text-sm font-semibold sm:inline">{t('nav.cart')}</span>
            {cartCount > 0 && (
              <span
                className="rounded-pill bg-primary text-primary-foreground animate-badge-pop text-2xs absolute end-full -top-2 flex h-5 min-w-5 items-center justify-center px-1 font-bold"
                aria-hidden
              >
                {formatNumber(cartCount, locale)}
              </span>
            )}
          </Link>

          {/* Role-aware workspace link: the single most-requested wayfinding fix.
              A shopkeeper sees their shop, an admin sees the admin panel, and a
              customer sees nothing extra. Icon-only on mobile, labelled from sm up. */}
          {user?.role === 'shopkeeper' && (
            <Link
              href="/dashboard"
              className="rounded-control hover:text-primary text-primary-700 flex items-center gap-2 font-semibold transition-colors duration-150"
            >
              <Store className="h-5 w-5" aria-hidden />
              <span className="hidden text-sm sm:inline">{t('nav.myShop')}</span>
            </Link>
          )}
          {user?.role === 'admin' && (
            <Link
              href="/admin"
              className="rounded-control hover:text-primary text-primary-700 flex items-center gap-2 font-semibold transition-colors duration-150"
            >
              <ShieldCheck className="h-5 w-5" aria-hidden />
              <span className="hidden text-sm sm:inline">{t('nav.adminPanel')}</span>
            </Link>
          )}

          <Link
            href={user ? '/account' : '/account/sign-in'}
            className="rounded-control hover:text-primary flex items-center gap-2 transition-colors duration-150"
          >
            <User className="h-5 w-5" aria-hidden />
            <span className="hidden text-sm font-semibold sm:inline">
              {user
                ? /*
                     FIRST NAME only, and never the phone. A full name overflows
                     the control at 13px and a phone number in the account slot
                     reads as a debug value someone forgot to replace — which is
                     what it looked like before a name was seeded.
                  */
                  (user.name?.trim().split(' ')[0] ?? t('nav.account'))
                : t('auth.signIn')}
            </span>
          </Link>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Row 2 — category bar. Desktop only; mobile reaches these through   */}
      {/* the drawer above and the bottom tab bar.                          */}
      <nav className="max-w-page mx-auto hidden items-center gap-5 px-7 pb-3 lg:flex">
        <Link
          href="/categories"
          className="text-foreground hover:text-primary flex shrink-0 items-center gap-2 text-sm font-bold transition-colors duration-150"
        >
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
          {t('nav.allCategories')}
        </Link>

        <span className="h-4 w-px shrink-0 bg-neutral-300" aria-hidden />

        {categories.slice(0, 7).map((category) => (
          <Link
            key={category.slug}
            href={`/categories/${category.slug}`}
            className="hover:text-primary truncate text-sm font-medium text-neutral-700 transition-colors duration-150"
          >
            {category.label}
          </Link>
        ))}

        <span className="flex-1" aria-hidden />

        <Link
          href="/offers"
          className="text-primary hover:text-primary-600 flex shrink-0 items-center gap-2 text-sm font-bold transition-colors duration-150"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {t('nav.bestDeals')}
        </Link>

        {liveOffer && (
          <>
            <span className="h-4 w-px shrink-0 bg-neutral-300" aria-hidden />
            <Link
              href="/offers"
              className="text-foreground hover:text-primary flex shrink-0 items-center gap-2 text-sm font-bold transition-colors duration-150"
            >
              {t('nav.liveNow')}
              {/*
                The ring expands OUT of the dot rather than the dot itself
                pulsing: a growing-and-shrinking dot at 6px reads as a
                rendering glitch, an expanding ring reads as a broadcast.
                Indefinite, and stopped entirely by the global
                prefers-reduced-motion rule in globals.css.
              */}
              <span
                className="rounded-pill bg-accent animate-pulse-ring h-1.5 w-1.5 shrink-0"
                aria-hidden
              />
            </Link>
          </>
        )}

        <span className="h-4 w-px shrink-0 bg-neutral-300" aria-hidden />

        {/* Role-aware trailing link: a signed-out visitor or customer is invited
            to register a shop; a shopkeeper goes to their dashboard; an admin
            goes to the admin panel. Previously this was "register shop" for
            everyone, which dumped the ADMIN into the registration form. */}
        {user?.role === 'shopkeeper' ? (
          <Link
            href="/dashboard"
            className="hover:text-primary shrink-0 text-sm font-medium text-neutral-700 transition-colors duration-150"
          >
            {t('nav.myShop')}
          </Link>
        ) : user?.role === 'admin' ? (
          <Link
            href="/admin"
            className="hover:text-primary shrink-0 text-sm font-medium text-neutral-700 transition-colors duration-150"
          >
            {t('nav.adminPanel')}
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="hover:text-primary shrink-0 text-sm font-medium text-neutral-700 transition-colors duration-150"
          >
            {t('nav.registerShop')}
          </Link>
        )}
      </nav>
    </header>
  );
}
