'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Menu } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ADMIN_SECTIONS } from '@/lib/admin-sections';
import { Link, usePathname } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type AdminBadgeCounts = {
  shops: string | null;
  verifications: string | null;
  reviews: string | null;
  promotions: string | null;
  orders: string | null;
};

/**
 * Admin sidebar (PRD §7).
 *
 * Desktop-oriented, unlike the shop dashboard: mall management works at a desk. It
 * stays a fixed rail at lg and collapses to a horizontal scroller below that, so
 * the surface is still usable on a tablet during the walkthrough without pretending
 * to be a phone-first design.
 *
 * Dark, where every other surface in the product is light. That is the point:
 * this is the only place in the system where someone can unpublish a tenant's
 * shop, and the rail should not be mistakable for the shopkeeper's own panel at
 * a glance across a room.
 *
 * Counts are passed in as pre-FORMATTED strings, so the numerals are Persian in
 * Dari without this component needing the locale.
 */
export function AdminNav({ counts }: { counts: AdminBadgeCounts }) {
  return (
    <>
      {/* Desktop rail. */}
      <div className="hidden lg:block">
        <AdminNavList counts={counts} />
      </div>

      {/*
        MOBILE IS A DRAWER, not a scroller (Prompt C3).
        
        Eleven sections in a horizontal strip means the last four are off-screen
        with nothing to say they exist, and the strip eats a band of every page
        on the surface where vertical space is scarcest. A drawer costs one tap
        and shows the whole console at once.
      */}
      <AdminNavDrawer counts={counts} />
    </>
  );
}

function AdminNavList({
  counts,
  onNavigate,
}: {
  counts: AdminBadgeCounts;
  onNavigate?: () => void;
}) {
  const t = useTranslations('adminNav');
  const pathname = usePathname();

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label={t('label')}
      className="bg-neutral-900 lg:min-h-screen lg:w-56 lg:shrink-0"
    >
      <div className="hidden px-5 pt-5 pb-6 lg:block">
        <p className="text-primary-foreground text-sm font-bold">{t('brand')}</p>
        <p className="text-2xs text-neutral-600">{t('subtitle')}</p>
      </div>

      <ul className="flex flex-col gap-1 p-2 lg:px-3 lg:pb-6">
        {ADMIN_SECTIONS.map((item) => {
          const active = isActive(item.href, item.exact);
          const badge = item.badge ? counts[item.badge] : null;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-control flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors duration-150',
                  active
                    ? 'bg-primary-700 text-primary-foreground font-bold'
                    : 'hover:text-primary-foreground text-neutral-400 hover:bg-neutral-800',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">{t(item.key as never)}</span>
                {/* Only shown when there is something to act on, so the sidebar is
                    quiet when the queues are clear. */}
                {badge && (
                  <Badge variant="destructive" className="ms-auto">
                    {badge}
                  </Badge>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The mobile drawer (Prompt C3).
 *
 * A Sheet rather than a modal dialog: it slides from the inline START, which
 * is the right edge in Dari and the left in English, and next-intl's direction
 * on <html> is what Radix reads to decide — so this needs no `ltr:`/`rtl:`
 * handling of its own.
 *
 * Closing on navigation is explicit (`onNavigate`) because the drawer would
 * otherwise stay open over the page it just took you to.
 */
function AdminNavDrawer({ counts }: { counts: AdminBadgeCounts }) {
  const t = useTranslations('adminNav');
  const [open, setOpen] = React.useState(false);

  return (
    <div className="border-border bg-background border-b p-2 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            <Menu />
            {t('label')}
          </Button>
        </SheetTrigger>
        <SheetContent side="start" className="w-64 border-0 bg-neutral-900 p-0">
          <SheetHeader className="px-5 pt-5 pb-2">
            <SheetTitle className="text-primary-foreground text-sm font-bold">
              {t('brand')}
            </SheetTitle>
            <p className="text-2xs text-neutral-500">{t('subtitle')}</p>
          </SheetHeader>
          <AdminNavList counts={counts} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
