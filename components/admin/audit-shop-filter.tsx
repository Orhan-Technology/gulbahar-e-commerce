'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Store } from 'lucide-react';

export type AuditShopOption = { id: string; label: string; count: string };

/**
 * "Everything we ever decided about پوشاک آریانا" (Prompt C12).
 *
 * THE DISPUTE-RESOLUTION QUERY, and the data was already there. Every admin
 * action writes its target id (lib/audit.ts), and the log page could only
 * filter by target TYPE — «همهٔ تصمیم‌های مربوط به دکان‌ها», which is a question
 * nobody has. The question people actually arrive with is about ONE tenant,
 * standing at the counter asking why they were suspended in Jawza, and the only
 * way to answer it was to scroll.
 *
 * A NATIVE `<select>`, not the styled one. Fourteen tenants today and every
 * shop the mall ever signs tomorrow; a chip row does not survive that, and the
 * platform select would pull a popover, a portal and a focus trap onto a page
 * whose whole character is a plain readable record. The native control also
 * gets the OS picker on a phone for free.
 *
 * The URL is the state, exactly as `RangeControl` has it: the filtered log is a
 * link someone can send, and the cursor is dropped on change because page two
 * of the unfiltered log means nothing in the filtered one.
 */
export function AuditShopFilter({
  shops,
  current,
}: {
  shops: AuditShopOption[];
  current?: string;
}) {
  const t = useTranslations('adminAudit');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set('shop', value);
    else next.delete('shop');
    // A keyset cursor from the previous view would page into the wrong list.
    next.delete('before');
    const search = next.toString();
    router.push(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }

  return (
    <label
      data-audit-shop-filter=""
      className="rounded-pill border-border bg-card inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs"
    >
      <Store className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{t('shopFilterLabel')}</span>
      <select
        value={current ?? ''}
        onChange={(event) => select(event.target.value)}
        // `bg-transparent` and no ring: the pill IS the control's chrome, and a
        // second border inside it is the tell of a select dropped into a
        // container that was already styled.
        className="max-w-56 bg-transparent font-medium focus:outline-none"
      >
        <option value="">{t('shopFilterAll')}</option>
        {shops.map((shop) => (
          <option key={shop.id} value={shop.id}>
            {shop.label} ({shop.count})
          </option>
        ))}
      </select>
    </label>
  );
}
