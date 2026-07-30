import type { LocalizedText } from './db/schema';

/**
 * What each category's specification table SHOULD carry (Prompt P1).
 *
 * The point is not to constrain a shopkeeper — they can add any row they like —
 * it is that two mobile phones from two different shops describe themselves
 * with the SAME keys. That is the whole reason the comparison table in P3 can
 * line four products up row by row; without a shared vocabulary, "screen" in
 * one shop and "display size" in another are two rows that never meet.
 *
 * So this module is the vocabulary, and it is used in three places: the seed
 * fills it, the product editor pre-fills the keys from it, and the CSV import
 * maps its columns by key.
 *
 * NO `'use client'`, deliberately. The editor is a client component and the
 * seed is a node script, and a constant exported from a client module reaches a
 * server component as a reference rather than a value (CLAUDE.md). Same shape
 * as lib/account-sections.ts and lib/admin-sections.ts.
 */

export type SpecTemplateRow = {
  key: string;
  label: LocalizedText;
  /** Optional grouping, used once a category has enough rows to need it. */
  group?: string;
  /** A hint of the expected shape, shown as the editor's placeholder. */
  example?: string;
};

/**
 * Keyed by CATEGORY SLUG, and only for leaf categories — a product belongs to
 * one, and a parent-level template would put "storage" on a pair of shoes.
 */
export const SPEC_TEMPLATES: Record<string, SpecTemplateRow[]> = {
  'mobiles-tablets': [
    { key: 'brand', label: { fa: 'برند', en: 'Brand' }, group: 'general' },
    { key: 'model', label: { fa: 'مدل', en: 'Model' }, group: 'general' },
    { key: 'storage', label: { fa: 'حافظه', en: 'Storage' }, group: 'general', example: '128 GB' },
    { key: 'ram', label: { fa: 'رم', en: 'RAM' }, group: 'general', example: '4 GB' },
    { key: 'screen', label: { fa: 'صفحه', en: 'Screen' }, group: 'design' },
    { key: 'battery', label: { fa: 'باتری', en: 'Battery' }, group: 'design' },
    { key: 'camera', label: { fa: 'کمره', en: 'Camera' }, group: 'design' },
    // Accessories live in this category too — a pair of earbuds has no screen
    // but it does have a radio, and dropping the key would leave the one spec
    // that matters for it unsayable.
    { key: 'connectivity', label: { fa: 'اتصال', en: 'Connectivity' }, group: 'general' },
    { key: 'warranty', label: { fa: 'گرانتی', en: 'Warranty' }, group: 'general' },
  ],
  'home-electronics': [
    { key: 'brand', label: { fa: 'برند', en: 'Brand' }, group: 'general' },
    { key: 'model', label: { fa: 'مدل', en: 'Model' }, group: 'general' },
    { key: 'capacity', label: { fa: 'ظرفیت', en: 'Capacity' }, group: 'general' },
    { key: 'power', label: { fa: 'مصرف برق', en: 'Power' }, group: 'general' },
    { key: 'size', label: { fa: 'اندازه', en: 'Dimensions' }, group: 'design' },
    { key: 'warranty', label: { fa: 'گرانتی', en: 'Warranty' }, group: 'general' },
  ],
  'audio-video': [
    { key: 'brand', label: { fa: 'برند', en: 'Brand' }, group: 'general' },
    { key: 'model', label: { fa: 'مدل', en: 'Model' }, group: 'general' },
    { key: 'battery', label: { fa: 'باتری', en: 'Battery' }, group: 'general' },
    { key: 'connectivity', label: { fa: 'اتصال', en: 'Connectivity' }, group: 'general' },
    { key: 'power', label: { fa: 'توان', en: 'Output' }, group: 'design' },
    { key: 'warranty', label: { fa: 'گرانتی', en: 'Warranty' }, group: 'general' },
  ],
  cosmetics: [
    { key: 'brand', label: { fa: 'برند', en: 'Brand' } },
    { key: 'volume', label: { fa: 'حجم', en: 'Volume' } },
    { key: 'type', label: { fa: 'نوع', en: 'Type' } },
    { key: 'skinType', label: { fa: 'نوع پوست', en: 'Skin type' } },
    { key: 'origin', label: { fa: 'کشور سازنده', en: 'Origin' } },
  ],
  perfume: [
    { key: 'brand', label: { fa: 'برند', en: 'Brand' } },
    { key: 'volume', label: { fa: 'حجم', en: 'Volume' } },
    { key: 'concentration', label: { fa: 'غلظت', en: 'Concentration' } },
    { key: 'family', label: { fa: 'خانواده بویایی', en: 'Scent family' } },
    { key: 'gender', label: { fa: 'مناسب برای', en: 'Suited to' } },
    { key: 'origin', label: { fa: 'کشور سازنده', en: 'Origin' } },
  ],
  watches: [
    { key: 'brand', label: { fa: 'برند', en: 'Brand' }, group: 'general' },
    { key: 'model', label: { fa: 'مدل', en: 'Model' }, group: 'general' },
    { key: 'movement', label: { fa: 'مکانیزم', en: 'Movement' }, group: 'general' },
    { key: 'caseMaterial', label: { fa: 'جنس قاب', en: 'Case material' }, group: 'design' },
    { key: 'strap', label: { fa: 'بند', en: 'Strap' }, group: 'design' },
    { key: 'waterResistance', label: { fa: 'مقاومت در برابر آب', en: 'Water resistance' } },
    { key: 'warranty', label: { fa: 'گرانتی', en: 'Warranty' }, group: 'general' },
  ],
  menswear: clothingTemplate(),
  womenswear: clothingTemplate(),
  sportswear: clothingTemplate(),
  shoes: [
    { key: 'brand', label: { fa: 'برند', en: 'Brand' } },
    { key: 'material', label: { fa: 'جنس', en: 'Material' } },
    { key: 'sole', label: { fa: 'کف', en: 'Sole' } },
    { key: 'sizes', label: { fa: 'سایزها', en: 'Sizes' } },
    { key: 'colour', label: { fa: 'رنگ', en: 'Colour' } },
    { key: 'gender', label: { fa: 'مناسب برای', en: 'Suited to' } },
    { key: 'care', label: { fa: 'نگهداری', en: 'Care' } },
  ],
  'kitchen-appliances': [
    { key: 'brand', label: { fa: 'برند', en: 'Brand' }, group: 'general' },
    { key: 'capacity', label: { fa: 'ظرفیت', en: 'Capacity' }, group: 'general' },
    { key: 'power', label: { fa: 'توان', en: 'Power' }, group: 'general' },
    { key: 'material', label: { fa: 'جنس', en: 'Material' }, group: 'design' },
    { key: 'contents', label: { fa: 'محتویات', en: 'In the box' }, group: 'design' },
    { key: 'care', label: { fa: 'نگهداری', en: 'Care' }, group: 'design' },
    { key: 'warranty', label: { fa: 'گرانتی', en: 'Warranty' }, group: 'general' },
  ],
  toys: [
    { key: 'brand', label: { fa: 'برند', en: 'Brand' } },
    { key: 'ageRange', label: { fa: 'رده سنی', en: 'Age range' } },
    { key: 'material', label: { fa: 'جنس', en: 'Material' } },
    { key: 'contents', label: { fa: 'محتویات', en: 'In the box' } },
    { key: 'safety', label: { fa: 'ایمنی', en: 'Safety' } },
  ],
  stationery: [
    { key: 'brand', label: { fa: 'برند', en: 'Brand' } },
    { key: 'size', label: { fa: 'اندازه', en: 'Size' } },
    { key: 'material', label: { fa: 'جنس', en: 'Material' } },
    { key: 'contents', label: { fa: 'محتویات', en: 'In the box' } },
    { key: 'ageRange', label: { fa: 'رده سنی', en: 'Age range' } },
  ],
  jewellery: [
    { key: 'material', label: { fa: 'جنس', en: 'Material' } },
    { key: 'purity', label: { fa: 'عیار', en: 'Purity' } },
    { key: 'stone', label: { fa: 'سنگ', en: 'Stone' } },
    { key: 'weight', label: { fa: 'وزن', en: 'Weight' } },
    { key: 'origin', label: { fa: 'ساخت', en: 'Made in' } },
    { key: 'warranty', label: { fa: 'ضمانت', en: 'Guarantee' } },
  ],
  bags: [
    { key: 'brand', label: { fa: 'برند', en: 'Brand' } },
    { key: 'material', label: { fa: 'جنس', en: 'Material' } },
    { key: 'size', label: { fa: 'اندازه', en: 'Size' } },
    { key: 'capacity', label: { fa: 'ظرفیت', en: 'Capacity' } },
    { key: 'colour', label: { fa: 'رنگ', en: 'Colour' } },
    { key: 'care', label: { fa: 'نگهداری', en: 'Care' } },
  ],
  'dried-fruit-sweets': [
    { key: 'weight', label: { fa: 'وزن', en: 'Weight' } },
    { key: 'origin', label: { fa: 'منطقه', en: 'Origin' } },
    { key: 'ingredients', label: { fa: 'ترکیبات', en: 'Ingredients' } },
    { key: 'shelfLife', label: { fa: 'ماندگاری', en: 'Shelf life' } },
    { key: 'storage', label: { fa: 'نگهداری', en: 'Storage' } },
  ],
};

/**
 * Clothing and sportswear share one template.
 *
 * A function rather than a shared constant so each category gets its own array
 * instance — the editor reorders rows in place, and three categories pointing
 * at one array would reorder each other.
 */
function clothingTemplate(): SpecTemplateRow[] {
  return [
    { key: 'brand', label: { fa: 'برند', en: 'Brand' } },
    { key: 'material', label: { fa: 'جنس', en: 'Material' } },
    { key: 'sizes', label: { fa: 'سایزها', en: 'Sizes' } },
    { key: 'colour', label: { fa: 'رنگ', en: 'Colour' } },
    { key: 'gender', label: { fa: 'مناسب برای', en: 'Suited to' } },
    { key: 'care', label: { fa: 'نگهداری', en: 'Care' } },
  ];
}

/** The template for a category, or an empty list for one with no vocabulary yet. */
export function specTemplateFor(categorySlug: string | null | undefined): SpecTemplateRow[] {
  if (!categorySlug) return [];
  return SPEC_TEMPLATES[categorySlug] ?? [];
}

/** Group labels, for the chips above a grouped spec table. */
export const SPEC_GROUPS: Record<string, LocalizedText> = {
  general: { fa: 'عمومی', en: 'General' },
  design: { fa: 'ظاهر و ابعاد', en: 'Design' },
};
