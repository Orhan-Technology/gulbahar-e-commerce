import Image from 'next/image';
import { getLocale, getTranslations } from 'next-intl/server';
import { MapPin } from 'lucide-react';

import { PriceDisplay } from '@/components/custom/price-display';
import { RatingStars } from '@/components/custom/rating-stars';
import { Link } from '@/lib/i18n/navigation';
import { formatNumber, formatUnitNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export type ComparisonColumn = {
  id: string;
  slug: string;
  title: string;
  imagePath: string | null;
  blurDataUrl?: string | null;
  shopName: string;
  shopFloor: number | null;
  shopUnitNumber: string | null;
  price: number;
  discountPrice: number | null;
  rating: number;
  reviewCount: number;
  /** Spec values by key — only keys every column has are rendered. */
  values: Record<string, string>;
  /** Labels for those keys, in this product's own reading order. */
  labels: Record<string, string>;
  current?: boolean;
};

/** Below three shared rows the table compares nothing; it is a price list. */
export const MIN_SHARED_SPECS = 3;
/** One other product is not a comparison. */
export const MIN_COMPARABLES = 2;

/**
 * Compare similar products (Prompt P3).
 *
 * The current product is column one and says so. Everything else is ordered by
 * price distance, because "what else can I get for about this money" is the
 * question this table exists to answer.
 *
 * IT ONLY RENDERS WHEN IT CAN DO WORK: at least two other products, and at
 * least three specification keys that EVERY column has a value for. A table
 * with one column is not a comparison, and a table whose rows are mostly blank
 * is worse than no table — which is why the eligibility rule lives here as
 * exported constants rather than as a number buried in a page.
 *
 * Values that DIFFER from the current product are tinted. That is the entire
 * point of the exercise: four identical columns of "12 months, shop warranty"
 * tell you nothing, and the eye should land on the rows where the products
 * actually part ways.
 *
 * A server component — nothing here is interactive. The horizontal scroll is
 * the browser's, with snap points, so it behaves like every other rail in the
 * product without shipping a rail's worth of JavaScript.
 */
export async function ComparisonTable({ columns }: { columns: ComparisonColumn[] }) {
  const t = await getTranslations('product');
  const locale = await getLocale();

  const current = columns.find((column) => column.current);
  if (!current || columns.length < MIN_COMPARABLES + 1) return null;

  // Keys every column has a value for, in the CURRENT product's order — its
  // spec sheet is the one the reader has just read.
  const sharedKeys = Object.keys(current.values).filter((key) =>
    columns.every((column) => Boolean(column.values[key])),
  );

  if (sharedKeys.length < MIN_SHARED_SPECS) return null;

  return (
    <section className="space-y-4" aria-labelledby="compare-heading">
      <div>
        <h2 id="compare-heading" className="text-foreground text-xl font-bold">
          {t('compareHeading')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('compareHint')}</p>
      </div>

      {/*
        NO SCROLL SNAP on this scroller, and that is a fix rather than an
        omission. Only the product columns carried `snap-start`, so offset 0 —
        where the sticky row-label column sits — was not a snap position at all;
        Chrome snapped to the first one that was, could not reach it, and
        clamped to the maximum scroll instead. The table therefore OPENED fully
        scrolled: the "this product" column landed underneath the sticky label
        column and read as "one 13 128GB … 000 AFN", clipped mid-word, on first
        paint. A table is read row by row rather than card by card, so snapping
        earned nothing here in the first place.
      */}
      <div className="scrollbar-none overflow-x-auto pb-2">
        <table className="w-full min-w-3xl border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{t('compareHeading')}</caption>
          <thead>
            <tr>
              {/* The row-label column is empty in the header and sticky at the
                  inline start, so a spec name stays readable while the columns
                  scroll past it. */}
              <th className="bg-background border-border sticky start-0 z-10 w-28 border-e p-2 text-start sm:w-40" />
              {columns.map((column) => (
                <th key={column.id} scope="col" className="w-56 min-w-56 p-2 align-top font-normal">
                  <Link href={`/products/${column.slug}`} className="group block space-y-2">
                    <span className="rounded-card border-border relative block aspect-square w-full overflow-hidden border bg-neutral-100">
                      {column.imagePath && (
                        <Image
                          src={column.imagePath}
                          alt=""
                          fill
                          sizes="224px"
                          placeholder={column.blurDataUrl ? 'blur' : 'empty'}
                          blurDataURL={column.blurDataUrl ?? undefined}
                          className="object-cover"
                        />
                      )}
                    </span>

                    {column.current && (
                      <span className="rounded-pill bg-primary-50 text-primary text-2xs inline-block px-2 py-0.5 font-semibold">
                        {t('compareThisProduct')}
                      </span>
                    )}

                    <span className="clamp-2 group-hover:text-primary block text-start text-sm font-semibold">
                      {column.title}
                    </span>

                    <span className="text-muted-foreground block text-start text-xs">
                      {column.shopName}
                      {column.shopFloor !== null && (
                        <span className="mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                          {t('shopFloorUnit', {
                            floor: formatNumber(column.shopFloor, locale),
                            unit: formatUnitNumber(column.shopUnitNumber, locale) || '—',
                          })}
                        </span>
                      )}
                    </span>

                    <span className="block text-start">
                      <PriceDisplay price={column.price} discountPrice={column.discountPrice} size="sm" />
                    </span>

                    <span className="flex items-center gap-1.5">
                      <RatingStars value={column.rating} size="sm" count={column.reviewCount} />
                    </span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sharedKeys.map((key) => (
              <tr key={key}>
                <th
                  scope="row"
                  className="bg-background border-border sticky start-0 z-10 border-t border-e p-2 text-start text-xs font-normal text-neutral-500"
                >
                  {current.labels[key] ?? key}
                </th>
                {columns.map((column) => {
                  const differs = column.values[key] !== current.values[key];
                  return (
                    <td
                      key={column.id}
                      className={cn(
                        'border-border border-t p-2 align-top text-sm',
                        // Subtle, not a warning colour: a difference is
                        // information, not a problem.
                        differs && 'bg-primary-50/60 font-semibold',
                      )}
                    >
                      {column.values[key]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
