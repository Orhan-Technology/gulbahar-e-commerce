import { pickLocale } from '@/lib/db/localized';
import type { LocalizedText } from '@/lib/db/schema';

/**
 * The axes a product is bought along — and the spec rows that restate them.
 *
 * THE VARIANT ROWS ARE AUTHORITATIVE. They are the thing a customer actually
 * selects and the thing the cart line carries, so where a specification row
 * describes the same axis it is rewritten from the variants rather than read
 * from its own column. The seed shows why: the men's perahan sold S/M/L/XL as
 * variants while its `sizes` spec row said "M, L, XL, XXL", and its `colour`
 * row listed a grey it has no variant for. Two answers to "what sizes does this
 * come in" on one screen is a buyer's mistake waiting to happen.
 *
 * PLAIN MODULE, no `'use client'` — the product page (server) derives the spec
 * rows with it and the buy panel (client) renders the chips it produces.
 */
export type VariantAxis = 'size' | 'colour';

const AXIS_NAMES: Record<string, VariantAxis> = {
  size: 'size',
  sizes: 'size',
  colour: 'colour',
  colours: 'colour',
  color: 'colour',
  colors: 'colour',
  shade: 'colour',
  shades: 'colour',
};

/**
 * The axis an ENGLISH variant name or a spec key names, if any.
 *
 * Matched on the English side of both because that is the stable one: a spec
 * key is authored in English (`sizes`, `colour`) and a variant's English name
 * comes from the same vocabulary, while the Dari label is prose.
 */
export function variantAxis(englishName: string | null | undefined): VariantAxis | null {
  if (!englishName) return null;
  return AXIS_NAMES[englishName.trim().toLowerCase()] ?? null;
}

/*
 * S, M, L, XL — ALPHABETIC tokens only.
 *
 * Afghan retail sells clothing in the Latin letters, and the seed's Dari
 * transliterations of them («سمال»، «لارج») read as typos to a Dari speaker.
 * The English side of the same option already holds the canonical token, so no
 * transliteration table is needed.
 *
 * NUMERIC sizes are deliberately excluded: a shoe in size ۴۲ is a number in the
 * UI's own digits, and forcing "42" there would break the Persian-digits rule
 * to fix a problem it does not have.
 */
const LATIN_SIZE_TOKEN = /^[A-Za-z][A-Za-z-]{0,4}$/;

export type VariantOptionLabel = {
  label: string;
  /** Latin token in an RTL page — needs its own direction inside the chip. */
  ltr: boolean;
};

/** One variant option as it should be shown, whatever the UI language. */
export function variantOptionLabel(
  axis: VariantAxis | null,
  option: LocalizedText,
  locale: string,
): VariantOptionLabel {
  if (axis === 'size') {
    const english = pickLocale(option, 'en').trim();
    if (LATIN_SIZE_TOKEN.test(english)) return { label: english, ltr: true };
  }
  return { label: pickLocale(option, locale), ltr: false };
}
