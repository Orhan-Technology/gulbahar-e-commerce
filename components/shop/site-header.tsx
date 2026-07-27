'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Menu, Search, ShoppingCart, Store, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { HeaderSearch } from '@/components/shop/search/header-search';
import { LocaleSwitcher } from '@/components/shop/locale-switcher';
import { formatNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type SiteHeaderProps = {
  cartCount: number;
  /** Null when nobody is signed in. */
  user: { name?: string | null; role: string } | null;
  categories: Array<{ slug: string; label: string }>;
};

/**
 * Storefront header (PRD §5.1).
 *
 * Sticky and translucent on scroll. The scroll listener is passive and only
 * toggles a boolean once per threshold crossing, so it never becomes the reason a
 * long listing page feels heavy.
 */
export function SiteHeader({ cartCount, user, categories }: SiteHeaderProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-colors duration-200',
        scrolled
          ? 'border-border bg-background/85 shadow-card backdrop-blur-md'
          : 'bg-background border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        {/* Mobile: category drawer. Opens from the inline start, so it comes from
            the right in Dari. */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('nav.menu')}>
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="start" className="w-72">
            <SheetHeader>
              <SheetTitle>{t('nav.categories')}</SheetTitle>
            </SheetHeader>
            <nav className="mt-6 flex flex-col gap-1">
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
            </nav>
          </SheetContent>
        </Sheet>

        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="rounded-control bg-primary text-primary-foreground flex h-9 w-9 items-center justify-center text-sm font-bold">
            گ
          </span>
          <span className="text-foreground hidden text-base font-bold sm:block">
            {t('brand.shortName')}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          <Link
            href="/products"
            className="rounded-control px-3 py-2 text-sm font-medium hover:bg-neutral-100"
          >
            {t('nav.products')}
          </Link>
          <Link
            href="/shops"
            className="rounded-control px-3 py-2 text-sm font-medium hover:bg-neutral-100"
          >
            {t('nav.shops')}
          </Link>
          <Link
            href="/offers"
            className="rounded-control text-accent-700 hover:bg-accent-50 px-3 py-2 text-sm font-medium"
          >
            {t('nav.offers')}
          </Link>
        </nav>

        <HeaderSearch className="ms-auto hidden max-w-sm flex-1 sm:block" />

        <div className="ms-auto flex shrink-0 items-center gap-1 sm:ms-0">
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

          <LocaleSwitcher />

          <Button
            variant="ghost"
            size="icon"
            asChild
            className="relative"
            aria-label={t('nav.cart')}
          >
            <Link href="/cart">
              <ShoppingCart />
              {cartCount > 0 && (
                <span
                  className="rounded-pill bg-accent text-accent-foreground absolute end-0 -top-0.5 flex h-5 min-w-5 items-center justify-center px-1 text-xs font-bold"
                  aria-hidden
                >
                  {formatNumber(cartCount, locale)}
                </span>
              )}
              <span className="sr-only">
                {t('nav.cartWithCount', { count: formatNumber(cartCount, locale) })}
              </span>
            </Link>
          </Button>

          <Button variant="ghost" size="icon" asChild aria-label={t('nav.account')}>
            <Link href={user ? '/account' : '/account/sign-in'}>
              <User />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
