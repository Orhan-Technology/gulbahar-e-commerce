# Gulbahar — Design System

**Status:** the single source of truth for colour, type, spacing, elevation and
component anatomy. If this document and the code disagree, one of them is a bug.

**Enforced by:** `app/globals.css` (the `@theme static` block IS the theme —
there is no `tailwind.config.ts`), `npm run audit`, `npm run check:design`, and
`/styleguide`, which renders from the tokens rather than describing them.

---

## 1. Colour is a set of ROLES, not a palette

The palette is small on purpose. Every colour below has one job, and the test
for adding a use is not "does it look good" but "is this that job".

| Role | Token | Job | Never |
| --- | --- | --- | --- |
| **Action** | `primary-*` (blue) | Buttons, links, active nav, selected chips, focus rings, the cart badge | Decoration. If a blue thing cannot be pressed, it is the wrong colour. |
| **Saving** | `accent-*` (red) | A price coming down: discount badge, sale overlay, flash countdown, live dot | Emphasis in general. Spending red on anything else devalues the one place it has to work. |
| **Opinion** | `accent-warm-*` (amber) | Rating stars, and nothing else without an argument | Actions, states, or "warm" decoration. |
| **State** | `success` / `warning` / `danger` | Stock, KPI deltas, order status, destructive confirms | Branding. |
| **Surface** | `background`, `card`, `neutral-100` | Page, card, and THE tint | A third surface tone. |
| **Ink** | `foreground`, `neutral-500` | Strong text, muted text | Anything between them. |
| **Line** | `border` (= `neutral-200`) | Every hairline | A second border colour. |

Two rules that are easy to break and expensive to unpick:

- **Stars are amber, everywhere.** They were blue, which made the loudest object
  on a product card the one thing you cannot press. The check is narrower than
  `grep 'fill-primary'`, because blue *is* the right fill for two things that are
  not stars — the radio dot and the active tab icon. `check:design` asserts it
  precisely: no class list containing `lucide-star` may also contain
  `fill-primary`.
- **One red signal per price.** The discount is an image-corner badge; the
  original price is struck and muted. A third red mark on the price line is
  three ways of saying the same thing, and it makes a 14px card shout.

The five neutrals in the table are the only ones a component may reach for by
role. The remaining steps in `neutral-*` exist for hairlines and struck prices;
if a new surface needs a tone that is not `background`, `card` or `neutral-100`,
the design is wrong, not the palette.

## 2. Type — a closed scale, named by role

`--text-*` is reset to `initial`, so Tailwind's sizes genuinely do not exist.
Eight steps remain and no more can be added without editing the theme.

| Token | Size | Role |
| --- | --- | --- |
| `text-2xs` | 11px | Micro labels: unit suffixes, sponsored marks, badge text |
| `text-xs` | 12px | Meta: review counts, timestamps, hints |
| `text-sm` | 13px | Navigation, form labels, buttons, table text |
| `text-base` | 14px | Body copy and card titles |
| `text-lg` | 18px | Card price, sub-headings |
| `text-xl` | 20px | Page titles, panel headings |
| `text-2xl` | 28px | Section headings on the storefront |
| `text-3xl` | 38px | Hero copy and KPI figures |

**Section headings are all `text-2xl` on the storefront and all `text-sm
font-bold` inside a panel.** Hierarchy below that comes from spacing and weight,
never from reaching for another size.

> **Deviation from the brief, stated deliberately.** S1 asks for six sizes at
> 12/14/16/18/22/28. This scale is eight, and it is the one measured off the
> client's reference recording — 14px body, 13px navigation, 11px micro labels,
> a 38px hero. Collapsing to six would mean re-tuning every screen away from the
> reference the client chose. The *intent* of the rule — a closed, named scale
> with no ad-hoc sizes — is met and enforced.

## 3. Spacing

4px base. The scale is 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 and nothing between.

- **Between sections:** one token — 24px on mobile, 32px from `sm`.
- **Inside a card:** one token, 16px, or 20–24px on a panel that holds a whole
  band.
- Arbitrary values (`p-[13px]`) are an audit failure, not a judgement call.

## 4. Elevation — three levels

| Level | Token | When |
| --- | --- | --- |
| Flat | `border` only | Anything sitting on the page: panels, list rows, the facet rail |
| Card | `shadow-card` | A card that lifts off a tinted surface, or a sticky header once scrolled |
| Overlay | `shadow-overlay` | Only things that float over content: dialogs, sheets, popovers, the product card's hover pop-out |

`--shadow-*` is reset to `initial`, so there is no third shadow to reach for.
`shadow-xs`…`shadow-xl` are aliases onto these two so vendored shadcn markup
lands on the system.

## 5. Motion

Two budgets, and they are enforced separately by `npm run audit`:

- **Feedback ≤ 300ms** — taps, toggles, focus, badges. Duration reads as lag.
- **Decorative ≤ 500ms** — hover transforms, reveals, carousel slides.

Press feedback is 120ms and universal: add `pressable` (see
`components/motion/pressable.tsx`) to anything tappable. Overscroll stretch is
applied once per surface in the layout, never per component. Everything stops
under `prefers-reduced-motion`, guaranteed by one base-layer rule.

---

## 6. Component recipes

### SectionHeader

**Anatomy:** title (`text-2xl font-bold`), optional description
(`text-sm text-muted-foreground`), optional "view all" link at the inline end.
**RTL:** the chevron is `ChevronRight` with `rtl:rotate-180` — the project
convention, checked by `check:phase9`. Never `ChevronLeft` with `ltr:rotate-180`.
**Don't:** vary the title size per band. Every storefront band uses the same one.

### ProductCard

**Anatomy:** tinted square media panel (no border, no resting shadow) → title
(two lines reserved) → rating row → price → shop · floor.
**States:** hover scales the *panel* to 1.4× and lifts it over neighbours
(`sm:` and up only); press scales the whole card to 0.97; out-of-stock
desaturates the photo and lays a dark chip across the bottom; ≤3 in stock shows
an amber "only N left" chip in the same place.
**Badges:** discount % at the inline start of the media panel, sponsored beneath
it, wishlist heart at the inline end — inside the panel, so it scales with it.
**Rating:** `reserveSpace` is set here and nowhere else, so an unrated product
keeps its line and the grid stays aligned without printing "(۰)".
**Don't:** put a second discount signal on the price line.

### ShopCard

**Anatomy:** banner photo → logo monogram overlapping its bottom-start edge →
name → category → amber rating + count → product count → floor/unit badge.
**States:** hover lifts (`-translate-y-0.5` + `shadow-overlay`), press scales.
**Layouts:** `card` for grids and featured strips; `row` for compact directory
lists.

### Chip

**Anatomy:** `rounded-pill`, 1px border, 12px text.
**States:** selected is a filled `primary` with `primary-foreground` text;
unselected is `card` with a `border` that tints to primary on hover.
**Behaviour:** a selected chip is a TOGGLE — tapping it clears back to the
unfiltered view rather than being a dead end.

### Badge

Four meanings, and no more: `accent` (a saving), `success` / `warning` /
`destructive` (a state), `secondary` (a neutral count), `outline` (metadata).
The sponsored badge is its own component so its wording and placement cannot
drift.

### StatCard

**Anatomy:** label + optional icon → figure (count-up on mount) → optional
delta pill → hint line.
**Rule:** an **overview** KPI that cannot be opened is a poster. On
`/dashboard` and the admin overview, pass `href` and make the destination land
**pre-filtered** on the rows behind the figure — `check:design` follows every one
and fails if it 404s or arrives unfiltered.
**Exception, and the only one:** a total on a *report* page sits directly above
the chart and table it summarises, so there is no elsewhere to go. Those four
(`/dashboard/reports`, `/admin/reports`, `/admin/revenue`) are deliberately
hrefless; anywhere else, no `href` is drift.
**Don't:** put two figures that move together in one row.

### EmptyState

**Anatomy:** illustration (a single lucide icon in a tinted disc) → one-line
title → one line of body → exactly one action.
**Rule:** the copy must match *why* it is empty. "Remove a filter" under a
search that found nothing is advice the reader cannot follow.

### RatingStars

**Geometry:** lucide `Star` SVGs, never glyphs. Fractional fill is a muted row
underneath and an amber row on top clipped by width, anchored to the inline
start — so 3.5 stars fill from the right in Dari.
**Sizes:** `sm` 14px (cards, rails), `md` 16px (listings, shop headers), `lg`
20px (product page, review composer).
**Zero reviews:** renders NOTHING. `reserveSpace` keeps the line blank where a
grid needs the alignment, which is the ProductCard and nowhere else — passing it
somewhere no unrated value can arrive (the rating facet's 4/3/2 rows) is a no-op
that reads as a rule. There is no "(۰)" anywhere in the product.

### Rail

**Anatomy:** native horizontal scroller, `snap-x`, hidden scrollbar, one card
width per breakpoint, and a deliberate PEEK — the last visible card is cut so
"there is more" is visible rather than implied.
**Desktop:** circular prev/next buttons on hover, scrolling one viewport width,
disabled at each end, mirrored in RTL.
**RTL:** scroll origin differs between engines; the component normalises it.

### Toolbar (listing)

One implementation for every listing surface: result count, sort (popularity
first, no alphabetical option), and on mobile a filter button badged with the
active count. Sticky under the header.

### UnavailableCard

**Anatomy:** dashed border, muted fill, no shadow, icon at reduced opacity,
title, one honest sentence, and a "به‌زودی / Coming soon" pill.
**Interaction:** none. `role="group"` + `aria-disabled`, nothing focusable,
no `cursor-pointer`. A greyed-out button still takes tab focus and still
invites a click; a region does neither.

**THE HONESTY RULE — applies to every surface, not just this component:**

> A disabled surface states what it will do and why it is not available. It
> never shows placeholder data, never opens a dialog, and never appears without
> a real product reason.

Anything that fails that test is DELETED rather than disabled. The test is
whether a presenter would have to say "that one doesn't do anything yet" out
loud — if so, the card is either wrong or missing its sentence.

Decided so far: payment methods KEPT-disabled (cash on delivery and HesabPay
are real rails chosen at checkout; saved instruments are not built), per-channel
notification toggles KEPT-disabled (they become real when SMS goes live), and
loyalty points, membership tiers and subscriptions OMITTED — inventing a tier
on a client demo is a lie, not a placeholder.

---

## 7. Checks

| Check | Catches |
| --- | --- |
| `npm run audit` | Physical CSS, hardcoded Dari, motion over budget, images without dimensions, missing error boundaries |
| `npm run check:messages` | Missing keys, keys shadowed by a namespace, fa/en drift |
| `npm run check:design` | One toolbar everywhere, drill-downs that resolve and arrive filtered, press feedback per surface, Latin digits in Dari text, Suspense without a skeleton, numbers formatted outside `lib/format` |
| `npm run check:phase9` | Route-group error boundaries, motion budget in the built CSS, numeral correctness per locale |
