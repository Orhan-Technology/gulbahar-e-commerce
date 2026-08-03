import {
  Baby,
  Cookie,
  Dumbbell,
  Footprints,
  Gem,
  Headphones,
  type LucideIcon,
  Nut,
  PencilRuler,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  SprayCan,
  UtensilsCrossed,
  Watch,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The mark a category wears when it has no photograph.
 *
 * Category imagery is DERIVED — it is borrowed from the most-viewed product
 * filed under the category (queries/fragments.ts) — so a category with nothing
 * published in it has no picture and never will until a shop lists something.
 * That is a real and permanent state for «خوراکه» until the pending grocer is
 * approved on stage, and rendering it as an empty grey square says "this failed
 * to load" about a taxonomy that is working correctly.
 *
 * ONE MAP, shared by the three surfaces that draw a category — the home circles,
 * the subcategory tiles above a listing, and the category index — because three
 * copies of it is how the same department ends up with two different icons on
 * two screens. It lives in a module with no `'use client'` so a server component
 * can render it (CLAUDE.md).
 *
 * An unmapped slug falls back to a generic mark rather than to nothing: a new
 * category added by admin should look unremarkable, not broken.
 */
const ICONS: Record<string, LucideIcon> = {
  // Roots
  electronics: Smartphone,
  beauty: Sparkles,
  clothing: Shirt,
  'home-kitchen': UtensilsCrossed,
  'watches-jewellery': Gem,
  'kids-hobby': Baby,
  sports: Dumbbell,
  food: Nut,
  // Children
  'mobiles-tablets': Smartphone,
  'home-electronics': Zap,
  'audio-video': Headphones,
  cosmetics: Sparkles,
  perfume: SprayCan,
  menswear: Shirt,
  womenswear: Shirt,
  shoes: Footprints,
  bags: ShoppingBag,
  'kitchen-appliances': UtensilsCrossed,
  watches: Watch,
  jewellery: Gem,
  toys: Baby,
  stationery: PencilRuler,
  sportswear: Dumbbell,
  'dried-fruit-sweets': Cookie,
};

export function CategoryMark({ slug, className }: { slug: string; className?: string }) {
  const Icon = ICONS[slug] ?? Sparkles;
  return <Icon className={cn('h-[38%] w-[38%]', className)} aria-hidden />;
}

/**
 * The tinted disc/panel the mark sits on.
 *
 * A FILLED surface, not a pale one: the fallback has to hold its own beside a
 * photograph, and a near-white tile with a small glyph in it is the exact thing
 * that reads as breakage.
 */
export const categoryMarkSurface =
  'bg-primary-100 text-primary-600 ring-primary-200 flex h-full w-full items-center justify-center ring-1 ring-inset';
