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
] as const;

/** Only these two are required; everything else may be blank. */
export const IMPORT_REQUIRED_COLUMNS = ['title_fa', 'price'] as const;
