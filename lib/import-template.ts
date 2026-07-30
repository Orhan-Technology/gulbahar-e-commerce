/**
 * The import file's column contract, shared by the parser and the template the
 * shopkeeper downloads.
 *
 * Deliberately NOT in lib/actions/product-import.ts: a 'use server' module may only
 * export async functions, so a plain const array there fails at request time with
 * "A 'use server' file can only export async functions, found object."
 */
export const IMPORT_COLUMNS = [
  'slug',
  'title_fa',
  'title_en',
  'description_fa',
  'description_en',
  'category_slug',
  'price',
  'discount_price',
  'stock',
  'brand',
  'model',
] as const;

/**
 * Specifications arrive as OPTIONAL extra columns named `spec_<key>_fa` and
 * `spec_<key>_en` (Prompt P1) — for example `spec_storage_fa`.
 *
 * They are not in IMPORT_COLUMNS because the set of valid keys depends on the
 * row's category: `storage` belongs to a phone and not to a pair of shoes, and
 * a template listing every key from every category would be forty columns wide
 * and mostly blank. The key must exist in the category's template
 * (lib/product-templates.ts), which is what keeps two shops describing the same
 * kind of product with the same vocabulary.
 */
export const SPEC_COLUMN_PATTERN = /^spec_([a-zA-Z][a-zA-Z0-9]*)_(fa|en)$/;

/** Only these two are required; everything else may be blank. */
export const IMPORT_REQUIRED_COLUMNS = ['title_fa', 'price'] as const;
