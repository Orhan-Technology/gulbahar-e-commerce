import { getTranslations } from 'next-intl/server';
import { ChevronRight } from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';

/**
 * The heading every account section shares (Prompt A2).
 *
 * One component rather than an `<h1>` per page so the sections cannot drift
 * apart in type scale or spacing — the desktop nav keeps the reader on one
 * surface while only the main column swaps, and a heading that moves two pixels
 * between sections reads as a page reload.
 *
 * The back link is `lg:hidden` on purpose: on desktop the nav is on screen with
 * the current section marked, so a second way back is noise. On a phone the hub
 * IS the nav, and there is nothing else to return to.
 */
export async function AccountSectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const t = await getTranslations('account');

  return (
    <div className="space-y-1">
      <Link
        href="/account"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs lg:hidden"
      >
        {/* Points back the way the reader came, which is the inline START —
            left in English, right in Dari. */}
        <ChevronRight className="h-3.5 w-3.5 rotate-180 rtl:rotate-0" aria-hidden />
        {t('overview')}
      </Link>
      <h1 className="text-xl font-bold">{title}</h1>
      {description && <p className="text-muted-foreground text-sm">{description}</p>}
    </div>
  );
}
