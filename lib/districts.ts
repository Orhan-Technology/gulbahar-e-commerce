/**
 * Kabul districts offered in the delivery address form (PRD §5.3).
 *
 * A fixed list rather than free text or a geocoder: there is no mapping provider
 * in the demo (PRD §12.4), and a select keeps seeded and user-entered addresses
 * consistent so the shopkeeper's order list reads uniformly.
 *
 * Kept here rather than in scripts/seed-data so both the seed and the running app
 * draw from one source.
 */
export const KABUL_DISTRICTS = [
  'کارته سه',
  'کارته چهار',
  'شهر نو',
  'تایمنی',
  'خیرخانه',
  'وزیر اکبر خان',
  'دارالامان',
  'پل سرخ',
  'قلعه فتح‌الله',
  'مکروریان کهنه',
  'مکروریان نو',
  'کوته سنگی',
  'دهبوری',
  'چهل‌ستون',
  'افشار',
];
