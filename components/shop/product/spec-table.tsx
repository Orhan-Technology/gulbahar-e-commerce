import { getLocale, getTranslations } from 'next-intl/server';

import { pickLocale } from '@/lib/db/localized';
import type { ProductSpec } from '@/lib/db/schema';

/**
 * The product's spec table (PRD §5.2).
 *
 * Two columns on desktop, one on mobile, with the rows in the order the shop
 * entered them — screen, storage, memory, battery reads as a spec sheet;
 * alphabetical reads as a database dump.
 *
 * Labels come from the `product.specs` namespace rather than the row, so a
 * shopkeeper picking "storage" gets «حافظه» and "Storage" for free, and only the
 * value has to be written twice. An unknown key falls back to the key itself,
 * which is visible enough to get fixed but never blanks the row.
 */
export async function SpecTable({ specs }: { specs: ProductSpec[] }) {
  const t = await getTranslations('product');
  const locale = await getLocale();

  if (specs.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-foreground text-xl font-bold">{t('specsHeading')}</h2>

      <dl className="rounded-card border-border grid gap-x-8 border p-2 sm:grid-cols-2">
        {specs.map((spec) => (
          <div
            key={spec.key}
            className="border-border flex items-baseline justify-between gap-4 border-b px-3 py-3 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
          >
            <dt className="text-sm text-neutral-500">
              {t.has(`specs.${spec.key}` as never)
                ? t(`specs.${spec.key}` as never)
                : spec.key}
            </dt>
            <dd className="text-foreground text-end text-sm font-semibold">
              {pickLocale(spec.value, locale)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
