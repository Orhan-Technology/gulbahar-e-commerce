# Gulbahar Online Shopping — Build Prompt Library

**Companion to:** PRD v0.2 (demo MVP, design-led)
**Tool:** Claude Code CLI
**Method:** phased, sequential prompts. Run in order. Each phase ends with verification before moving on. Do not batch phases into one prompt — the sequence is the quality control.

---

## How to use this document

1. Place the PRD in the repo as `docs/PRD.md` before starting — prompts reference it by section.
2. Run **Prompt 0** first; it creates `CLAUDE.md`, which every later session inherits automatically.
3. Run one prompt at a time. After each, run the verification step yourself before continuing.
4. If a prompt's output is wrong, fix it with a follow-up in the same session before starting the next prompt — later prompts assume earlier ones landed correctly.
5. Prompts are written to be pasted verbatim. Text in `[square brackets]` is a placeholder for you to fill.

---

# PHASE 0 — Project memory

### Prompt 0.1 — Create CLAUDE.md

```
Create a CLAUDE.md file at the repo root. This is the persistent project context for every future session. Content:

# Gulbahar Online Shopping — Demo MVP

Multi-vendor marketplace digitizing Gulbahar Center (Kabul mall). Three surfaces in ONE Next.js 14 app via route groups: (shop) customer storefront, (dashboard) shopkeeper panel, (admin) mall management. Full spec: docs/PRD.md — consult it before implementing any feature.

## Hard rules
- Demo MVP: everything runs locally. NO external services — no CDN, no object storage, no real SMS, no analytics SDKs, no Redis. Postgres runs in Docker Compose. Images on local filesystem. SMS renders to an in-app notification log.
- UI/UX is the primary success criterion. Every screen ships with designed loading (skeleton), empty, and error states. No spinners on content, no blank flashes, no unstyled intermediate states.
- RTL-first: default locale is Dari (fa). Design and verify every screen in RTL first, then check English LTR. CSS logical properties ONLY (inline-start/end, never left/right). Directional icons mirror in RTL.
- i18n: next-intl. Locales fa (default) and en; ps structure present, strings deferred. Every user-facing string goes through translations — zero hardcoded strings.
- Typography: Vazirmatn (fa/ps), Inter (en). Persian digits in fa UI. Currency: Afghani (AFN / ؋).
- Design tokens are CSS variables defined in app/globals.css. Never use arbitrary Tailwind values for color, spacing, radius, or shadow — tokens only. Spacing scale: 4/8/12/16/24/32/48/64.
- Components: shadcn/ui restyled with our tokens. Custom components in components/custom/.
- Stack: Next.js 14 App Router, TypeScript strict, Tailwind, Drizzle + Postgres, Zod, Auth.js (phone+OTP credentials), Recharts, sharp for image variants.
- Server components for reads, server actions for mutations. Zod-validate every action input. No API routes unless technically required.
- Permission model (PRD §3.1): admin owns the platform, shops own their content. Admin can unpublish but NEVER edit shop content. Enforce in every action.
- All monetary values stored as integers (afghanis, no decimals needed). All timestamps UTC.
- Order status flow: placed → accepted → ready → fulfilled; rejected is terminal from placed. Status changes append to order_events and create notifications.

## Commands
- docker compose up -d — start Postgres
- npm run dev — dev server
- npm run db:push / db:seed / db:reset — schema, seed, full reset
- npm run typecheck && npm run lint — must pass before any phase is considered done

## Definition of done for every screen
Renders correctly in fa (RTL) and en (LTR) · skeleton + empty + error states present · mobile viewport verified for (shop) and (dashboard) · no hardcoded strings · typecheck and lint clean
```

**Verify:** `CLAUDE.md` exists and matches. Commit.

---

# PHASE 1 — Scaffold

### Prompt 1.1 — Project skeleton

```
Read docs/PRD.md §12 (technical stack). Scaffold the project:

1. Next.js 14 (App Router) + TypeScript strict + Tailwind. ESLint + Prettier.
2. docker-compose.yml: postgres:16 with a named volume, port 5432, credentials from .env. Provide .env.example.
3. Install and configure: drizzle-orm + drizzle-kit (postgres-js driver), zod, next-intl, @auth/core (Auth.js v5), recharts, sharp, lucide-react.
4. Initialize shadcn/ui (we restyle in Phase 2 — do not add components yet beyond the base setup).
5. Route groups with placeholder pages: app/[locale]/(shop)/page.tsx, app/[locale]/(dashboard)/dashboard/page.tsx, app/[locale]/(admin)/admin/page.tsx. Each renders a heading proving the group's layout loads.
6. next-intl setup: locales fa (default), en, ps. Middleware for locale routing. messages/fa.json, en.json, ps.json with the placeholder headings translated. html dir attribute driven by locale.
7. Fonts: next/font — Vazirmatn (fa, ps) and Inter (en), applied per-locale on the html element.
8. npm scripts: db:push, db:seed (stub), db:reset (drop + push + seed), typecheck.
9. lib/ structure: lib/db (client, schema dir), lib/actions, lib/auth, lib/i18n, lib/utils.

Acceptance: docker compose up -d && npm run dev works. / redirects to /fa. /fa renders RTL with Vazirmatn; /en renders LTR with Inter. All three route groups render. typecheck and lint pass.
```

**Verify:** run it, switch locales, confirm dir flips. Commit.

---

# PHASE 2 — Design system

This phase builds the visual foundation everything else consumes. Do not start feature work until this is right.

### Prompt 2.1 — Tokens and Tailwind theme

```
Implement the design foundations from PRD §10.2 as CSS variables in app/globals.css, wired into tailwind.config.

Palette (working direction pending client brand assets — PRD §10.1, §17.3):
- primary: deep green scale, 50–950 (base around #14532d family, tuned for a warm premium feel, not neon)
- accent: warm gold scale, 50–950 (base around #b8860b family, used sparingly: badges, highlights, the Sponsored marker)
- neutral: 10-step warm gray scale
- semantic: success (green, distinct from primary), warning (amber), danger (red), each with fg/bg/border variants
- surface tokens: --background, --card, --overlay, --border, --input, --ring

Typography tokens: 6-size type scale only (--text-xs through --text-3xl) with matching line heights. Radius: --radius-card: 8px, --radius-control: 6px, --radius-pill: 9999px. Shadows: --shadow-card (subtle), --shadow-overlay (pronounced) — exactly two.

Map ALL of these into tailwind.config theme.extend so classes like bg-primary-600, rounded-card, shadow-card, text-2xl work. Configure Tailwind for logical properties usage (ms-*, me-*, ps-*, pe-*, start-*, end-*).

Restyle the shadcn base layer (globals + components.json tokens) so shadcn components pick up our palette, radii, and shadows automatically.

Build a hidden style-guide page at /[locale]/styleguide rendering: full palette swatches, type scale in both fa and en, spacing scale, radii, shadows, and one shadcn Button/Input/Card/Badge in each variant. This page is our visual regression reference for the whole build.

Acceptance: /fa/styleguide and /en/styleguide render correctly in RTL and LTR. No shadcn default grays/blues visible anywhere.
```

### Prompt 2.2 — shadcn components, restyled

```
Add these shadcn/ui components and verify each against our tokens on the styleguide page: button, input, textarea, select, checkbox, radio-group, switch, dialog, sheet, dropdown-menu, popover, tooltip, toast (sonner), tabs, badge, card, table, skeleton, separator, avatar, command, calendar, form (react-hook-form + zod resolver), pagination.

For each: confirm RTL correctness (sheet slides from the correct side per locale, dropdown alignment, chevron mirroring, toast position swaps). Fix any component that assumes LTR with logical-property overrides in the component file — we own the code.

Extend the styleguide page with an interactive section demoing dialog, sheet, dropdown, toast, tabs, and a full form with validation errors — in both locales.
```

### Prompt 2.3 — Custom component library

```
Build the custom components from PRD §10.4 in components/custom/, each with fa/en support, skeleton variant, and a styleguide entry:

1. ProductCard — 1:1 image, title (2-line clamp), shop name, price with PriceDisplay, rating stars + count, wishlist heart (animated pop on toggle, PRD §10.6), optional Sponsored badge, optional discount ribbon. Hover: subtle lift (shadow-card → slightly stronger), 150ms.
2. PriceDisplay — AFN formatting with locale digits (٬ separators and ؋ in fa), discount variant showing struck-through original + accent-colored current price.
3. RatingStars — display mode (fractional fill) and input mode (tap/click to rate).
4. ShopCard — banner strip, logo overlapping, name, category, rating, product count, floor/unit metadata line.
5. OrderStatusTimeline — horizontal stepper for placed→accepted→ready→fulfilled with animated progression between states (PRD §10.6); rejected renders as a terminal danger state. RTL-aware direction.
6. StatCard — label, large value (count-up animation on mount), optional delta indicator.
7. ActionQueueItem — icon, title, subtitle, timestamp, chevron; new items slide in.
8. EmptyState — slot for illustration (simple inline SVG per use), title, description, action button.
9. SponsoredBadge — accent-toned, small, reads تبلیغ شده / Sponsored per locale.
10. SectionHeader — title + optional "view all" link with mirrored chevron.
11. QuantityStepper — RTL-correct increment/decrement.
12. ImageGallery — main image + thumbnail rail, tap-to-zoom dialog.

Every component: no hardcoded strings, tokens only, skeleton variant exported (e.g. ProductCard.Skeleton).

Acceptance: styleguide shows all components in both locales, including skeleton variants side by side.
```

**Verify Phase 2:** review /fa/styleguide top to bottom. This is the quality gate for everything downstream — do not proceed if anything reads as default-shadcn or breaks in RTL.

---

# PHASE 3 — Data layer

### Prompt 3.1 — Schema

```
Read docs/PRD.md §14 and §3.1. Implement the full Drizzle schema in lib/db/schema/:

- users: id, phone (unique), name, role enum (customer/shopkeeper/admin), locale, created_at
- shops: id, slug, status enum (pending/approved/suspended/closed), name jsonb {fa,en,ps}, description jsonb, category_id, floor, unit_number, phone, hours, logo_path, banner_path, rejection_reason, created_at
- shop_members: shop_id, user_id, role enum (owner/staff) — composite pk
- categories: id, slug, name jsonb, parent_id nullable, sort
- products: id, shop_id, slug, title jsonb, description jsonb, category_id, price int, discount_price int nullable, stock int, status enum (draft/published/unpublished), created_at
- product_images: id, product_id, path, sort, alt jsonb
- product_variants: id, product_id, name jsonb, options jsonb
- orders: id, reference (human-readable e.g. GC-24815), user_id, status enum (placed/accepted/ready/fulfilled/rejected), fulfillment enum (delivery/pickup), payment_method enum (cod/hesabpay), address_id nullable, subtotal, discount_total, delivery_fee, total, created_at
- order_items: id, order_id, shop_id, product_id, title_snapshot jsonb, price_snapshot, quantity
- order_events: id, order_id, from_status, to_status, actor_user_id, note, created_at — append-only
- reviews: id, product_id, user_id, order_item_id (unique — verified purchase), rating 1–5, body, status enum (visible/reported/removed), created_at
- review_responses: id, review_id (unique), shop_id, body, created_at
- wishlist_items: user_id, product_id, created_at — composite pk
- offers: id, shop_id, name jsonb, type enum (percent/fixed), value, scope enum (shop/products), product_ids jsonb, starts_at, ends_at, active
- promotion_slots: id, key (home_hero/featured_shops/search_top/category_top/product_related/directory_top), name jsonb, capacity, price_per_week
- campaigns: id, slot_id, shop_id, product_id nullable, status enum (requested/approved/rejected/active/ended), starts_at, ends_at, impressions int, clicks int
- notifications: id, recipient_role, recipient_user_id nullable, channel (sms/inapp), locale, title, body, event_key, read, created_at
- addresses: id, user_id, label, district, street_details, phone

Indexes: products (shop_id, status), (category_id, status); orders (user_id), (status); order_items (shop_id); reviews (product_id, status); campaigns (slot_id, status); notifications (recipient_user_id, read).

Relations defined for all. Export inferred types. npm run db:push works against the Docker Postgres.
```

### Prompt 3.2 — Data access + auth foundation

```
1. lib/db/queries/: typed query modules per domain (products, shops, orders, reviews, campaigns, notifications) with the read patterns the UI needs — e.g. productList({categoryId, shopId, priceMin, priceMax, minRating, sort, promotedFirst, locale, page}), productDetail(slug, locale), shopDirectory, orderWithTimeline, shopDashboardStats(shopId) computing today/week sales, pending counts, 30-day series, top products.
2. Localized-field helper: pickLocale(jsonb, locale) with the fallback chain ps→fa, en→fa (PRD §11), used consistently.
3. Search: pg_trgm + unaccent extensions (add via drizzle migration SQL). searchProducts(q, locale) and searchShops(q, locale) using trigram similarity across all locale values in the title jsonb, ranked by similarity then rating. Promoted items handled at the query composition level with a promoted flag, never silently reordering organic results (PRD §8.4).
4. Auth.js credentials provider: phone + OTP. requestOtp(phone) generates a 6-digit code, stores hashed with 5-min expiry, and writes a notification row (channel sms, event_key otp) — this is how the code reaches the notification log. verifyOtp creates/finds the user and signs in. Session carries user id, role, shopId (via shop_members) if any.
5. Route-group protection: (dashboard) requires shopkeeper with a shop; (admin) requires admin; redirects preserve locale.
6. lib/notify.ts: notify(eventKey, params) — central helper that renders a template (Dari + English strings in messages/) and inserts notification rows. All order/status/review/campaign events flow through this ONE function.

Acceptance: typecheck passes; a scratch script can create a user via OTP flow and read back dashboard stats.
```

---

# PHASE 4 — Seed data

PRD §9.4 treats seeding as a deliverable. Do it now, before feature UI — every screen from here on is built against realistic data, which is how UI problems surface early.

### Prompt 4.1 — Seed images

```
Create scripts/seed-images.ts and a content manifest.

1. content/seed/shops.json: 14 shops with plausible Gulbahar Center names in Dari + English (electronics, mobile phones, cosmetics, perfume, watches, clothing, shoes, home appliances, toys, stationery, jewelry, bags, sportswear, dried fruit & sweets), floors 1–3, unit numbers, categories, hours, short descriptions in both languages.
2. content/seed/products.json: 75 products spread across those shops — real product names (e.g. actual phone models, common cosmetic brands, generic-but-specific home goods), Dari + English titles and descriptions, realistic Kabul retail prices in AFN, stock levels, 8–10 with discount prices, 2–3 variants where natural (size/color).
3. Image pipeline: for the demo we self-generate consistent product imagery — scripts/seed-images.ts renders 1:1 1200px images per product: token-palette gradient background, centered product name, shop name small, using sharp SVG composition. Uniform, clean, clearly placeholder-professional (per PRD §10.7 consistency beats realism). Same approach for shop logos (monogram on primary color) and banners (wide gradient + name). Output to public/uploads/seed/.
   NOTE to builder: these are stand-ins with perfect consistency; real photography can replace files 1:1 later without code changes.
4. lib/images.ts: storeImage(buffer) used by real uploads later — writes original + 800w + 240w WebP variants via sharp to public/uploads/, returns paths. Seed pipeline uses the same function so seeded and uploaded images are indistinguishable to the UI.
```

### Prompt 4.2 — Seed database

```
Implement npm run db:seed fully (scripts/seed.ts), idempotent via db:reset:

1. Users: 1 admin, 14 shopkeepers (one per shop, as owners in shop_members), 25 customers with Afghan names, all with fa locale, a few en. Fixed demo phone numbers documented in README (admin 0700000001, first shopkeeper 0700000002, first customer 0700000003).
2. Categories: two-level taxonomy matching the shops (Electronics > Mobile Phones etc.), trilingual names.
3. Shops: 13 approved + 1 pending (products ready, awaiting the live approval moment — PRD §9.4). One approved shop also has a staff member besides the owner.
4. Products: all 75 published (pending shop's products in draft), images from Phase 4.1 linked.
5. Orders: ~220 orders across the past 90 days, weighted toward recent weeks and toward the top 5 shops, mixed statuses (mostly fulfilled; a realistic tail of placed/accepted/ready today), mixed delivery/pickup and cod/hesabpay, full order_events chains with believable timestamps.
6. Reviews: ~90 reviews on fulfilled order items — varied ratings skewing 4–5 with honest 2–3s sprinkled, natural Dari bodies (short, colloquial), several English, 10 shopkeeper responses, 2 in reported status for the admin moderation queue.
7. Wishlists: scattered so several products show meaningful save counts.
8. Offers: 5 active (mix of percent/fixed, one shop-wide), 2 expired.
9. Promotion slots seeded per PRD §8.2 with prices; campaigns: home hero occupied, 4 featured shops, 2 search_top, 1 category_top, all active with plausible impressions/clicks; 1 in requested status for the admin approval moment; 2 ended.
10. Notifications: recent history so the log panel isn't empty at demo start.

Acceptance: db:reset completes clean in one command; row counts printed; spot-check queries show dashboards will have real shape.
```

**Verify:** reset, open a DB client, sanity-check a few shops/orders. Commit. From here on, never build against empty tables.

---

# PHASE 5 — Customer storefront

The highest-polish surface (PRD §10.8: home and product page are quality-bar screens). Mobile-first.

### Prompt 5.1 — Storefront shell + home

```
Build the (shop) layout and home page per PRD §5.1 and §10.

Layout: header with logo, locale-aware search bar (goes to /search), language switcher, cart button with badge, account menu; mobile bottom tab bar (Home, Categories, Search, Wishlist, Account); footer with mall address and floors info. Sticky header, translucent on scroll.

Home page (server component, seeded data):
1. Hero banner — the active home_hero campaign renders the promoted shop/product with imagery and SponsoredBadge; graceful default banner if slot empty.
2. Category tiles — first-level categories, icon + name, horizontal scroll on mobile.
3. Active offers strip — offers with countdown chips for flash-style ones.
4. Featured shops carousel — the featured_shops campaigns as ShopCards with SponsoredBadge, then organic top-rated shops to fill.
5. Trending products — two rows of ProductCard from a seeded-metrics query.
6. New arrivals — latest published products.

Every section: SectionHeader with view-all, skeleton via Suspense fallbacks matching final layout exactly, RTL-correct carousels (scroll direction, snap). Wishlist hearts work (server action, optimistic).

Acceptance: /fa is visually complete and feels like a commercial marketplace home. Lighthouse-style pass: no layout shift between skeleton and content.
```

### Prompt 5.2 — Listing, search, categories

```
Build per PRD §5.1:

1. /products — filter rail (sheet on mobile): category tree, price range slider, shop multi-select, min rating, in-stock toggle; sort (newest, price asc/desc, rating). URL-driven state (searchParams), server-rendered results grid of ProductCard, pagination. Promoted items: up to the slot cap at top with badges, then organic (PRD §8.4).
2. /categories and /categories/[slug] — tiles then filtered listing reusing the products grid.
3. /search?q= — tabs Products | Shops. Trigram search from Phase 3.2. Search-as-you-type suggestions in the header (command component, debounced, top 5 products + 2 shops with thumbnails). search_top campaigns render first with badges.
4. /shops — directory: search, category filter; directory_top campaigns first, then organic by rating. ShopCards.
5. /shops/[slug] — shop page: banner, logo, rating, floor/unit + hours metadata block, about, and the shop's own product grid with its own search box and category chips.

All: skeletons, EmptyState with helpful actions ("No results for X — try..."), zero-result search shows popular products. Filters fully usable in RTL on a phone.
```

### Prompt 5.3 — Product page

```
Build /products/[slug] per PRD §5.2 — quality-bar screen #2.

- ImageGallery (Phase 2.3) with variants switching images where applicable
- Title, shop attribution (logo + name + rating, links to shop), category breadcrumb
- PriceDisplay with discount treatment; stock status chip (in stock / only N left / out of stock)
- Variant selectors (pills), QuantityStepper, add-to-cart (primary, full-width on mobile) with the §10.6 acknowledgement animation + cart badge increment; wishlist toggle
- Rating summary: average, count, distribution bars; reviews list (paginated) with verified-purchase tick, shopkeeper responses nested; "write a review" appears ONLY for the signed-in customer with a fulfilled order item for this product (PRD §5.5) — dialog with RatingStars input + textarea
- Related: from this shop + from this category; product_related campaign items badged
- Sticky mobile action bar: price + add to cart

Acceptance: gorgeous on a 390px viewport in Dari. Review gating verified: seeded customer with a fulfilled order can review; others see no form.
```

### Prompt 5.4 — Cart, checkout, orders, account

```
Build per PRD §5.3, §5.4, §5.6, §5.7:

1. Cart (route + header sheet): items grouped by shop with shop headers, QuantityStepper, remove with undo toast, per-shop and grand totals, active-offer discounts applied and itemized. Persist: DB for signed-in, cookie for guests, merged at login.
2. Checkout (requires auth — inline OTP sign-in step if guest, PRD §5.7; the OTP visibly arrives in the notification log): fulfillment choice — delivery (address form or saved addresses; district select + details) or pickup at Gulbahar Center (shows floor/unit per shop in the order); payment — COD or HesabPay. HesabPay opens the simulated branded payment sheet (PRD §9.1): amount, fake confirm, success animation. Itemized summary throughout. Place order → creates order(s), order_events, notifications to shopkeeper.
3. Confirmation page: celebratory beat (§10.5), reference number, OrderStatusTimeline at 'placed', what-happens-next in plain Dari, links to tracking.
4. /account/orders + detail: OrderStatusTimeline animating on status change, items, totals, fulfillment info; reorder (re-adds to cart).
5. /account/wishlist: grid with price/stock, move-to-cart.
6. /account: profile (name, locale), saved addresses CRUD, sign out.

Acceptance: full journey works — browse → cart → OTP login via notification log → checkout with HesabPay sheet → confirmation → order visible in account. In fa, on mobile, beautifully.
```

**Verify Phase 5:** run the entire customer journey yourself in fa and en. Fix everything you notice before Phase 6 — this surface is 40% of the demo.

---

# PHASE 6 — Shop dashboard

Quality-bar screen #3 is this dashboard on a phone viewport. Mobile-first throughout; Dari throughout.

### Prompt 6.1 — Dashboard shell + home

```
Build the (dashboard) layout and dashboard home per PRD §6.1.

Layout: mobile-first — bottom tabs (Dashboard, Orders, Products, Promotions, More); desktop gets a sidebar. Header: shop switcher (future-proof, single shop now), notification bell reading this shopkeeper's inapp notifications, language switch.

Dashboard home:
1. Four StatCards (count-up on mount): today's sales, week's sales, orders awaiting action, live products
2. ACTION QUEUE — the centerpiece (PRD §6.1): new orders to accept, orders to mark ready, out-of-stock products, promotions expiring within 7 days. ActionQueueItem list, each deep-links to the exact screen+item. New items slide in. Empty queue gets a positive EmptyState ("همه چیز مرتب است — all caught up").
3. 30-day sales chart (Recharts area, tokens, RTL axis, Persian digits in fa, skeleton first)
4. Top products table: thumbnail, views, orders, revenue, wishlist saves

Acceptance: seeded shopkeeper (0700000002) sees genuinely shaped data at 390px width in Dari, and it looks like a product a bank would ship.
```

### Prompt 6.2 — Products + bulk import

```
Per PRD §6.2:

1. Product list: search, status + category filters, low-stock/out-of-stock badges, INLINE stock editing (tap → stepper → autosave with toast), bulk select → publish/unpublish.
2. Add/edit form: per-language title/description fields (fa required, en/ps optional with a "missing translation" chip — PRD §11), category select from admin taxonomy, price + discount with live PriceDisplay preview, stock, variants editor, multi-image upload (drag-reorder; through lib/images.ts storeImage), draft/publish. Zod both sides; ownership enforced in the action.
3. Bulk import (demo happy path, PRD §6.2.1): downloadable template (columns + category slug list), upload → parse → validation preview table with per-row create/update/error + reason → confirm → rows land as DRAFTS. Import history deferred.

Acceptance: shopkeeper creates a product with images and publishes; it appears on the storefront immediately. Import of a 10-row file works; bad rows show clear reasons.
```

### Prompt 6.3 — Orders, promotions, reviews, profile, reports

```
Per PRD §6.3–6.8:

1. Orders: status-filterable list (chips), detail with items/customer/fulfillment/payment; actions accept, reject (reason dialog), mark ready, mark fulfilled — each appends order_events + fires notify() (customer sees SMS in the log; their tracking timeline animates).
2. Promotions — two tabs (PRD §6.4):
   Offers: create/edit — type, value, scope (whole shop or picked products), dates; active/scheduled/expired sections; countdown preview for flash-style.
   Featured: slot cards showing name, price/week, availability from capacity; book → pick product if slot needs one → duration → summary → submit (requested status, admin notified). Running campaigns show impressions/clicks (seeded) and days remaining; renew shortcut.
3. Reviews: list across products, rating filter, respond once (dialog), flag for admin.
4. Shop profile: logo/banner upload, per-language name/description, hours editor, floor/unit, contact.
5. Reports: period selector (7/30/90d) — sales series, sales by product, AOV, status breakdown donut, promotion performance, rating trend, top wishlisted. All Recharts, tokens, RTL, skeletons.
6. Settings: notification prefs (UI state), staff list (owner can add staff by phone — creates user + shop_members), language.

Acceptance: an order placed on the storefront lands in the action queue in real time (poll or router.refresh on interval is fine for the demo); accepting it updates the customer's timeline and writes an SMS to the log.
```

---

# PHASE 7 — Admin

Clean-but-plain is acceptable EXCEPT the revenue view (quality-bar screen #4). Desktop-oriented.

### Prompt 7.1 — Admin shell, shops, taxonomy

```
Per PRD §7.1–7.2:

1. (admin) layout: sidebar (Overview, Shops, Products, Categories, Reviews, Promotions, Orders, Users), header with pending-counts badges.
2. Shops: directory with status filters; PENDING QUEUE — review screen showing everything the shop built (profile, draft products with images) + approve (→ notify, shop and products go live) / reject with written reason (visible to the shopkeeper, who can amend and resubmit). Suspend/close with confirm dialogs on any shop. "Create shop" flow: admin enters details + owner phone → shop approved + invitation notification (claim flow can be simulated via the control panel).
3. Categories: tree manager — add/rename (trilingual fields)/reorder/nest; block deletion when products reference.
4. Products: cross-platform list with shop filter; unpublish/flag ONLY — no edit affordance anywhere (PRD §3.1).
5. Reviews: moderation queue of reported reviews (2 seeded) — view in context, remove or uphold, decision recorded.
```

### Prompt 7.2 — Promotions, revenue, reporting, users

```
Per PRD §7.3–7.5:

1. Promotion slots: manage capacity + price per slot.
2. Campaign requests: approve/reject queue (1 seeded pending); booking calendar per slot showing occupied/free weeks; manual campaign creation on behalf of a shop (offline sales path).
3. REVENUE VIEW — the demo centerpiece, polish like the storefront: total promotion revenue (count-up), revenue by slot type (bar), occupancy rate per slot, active campaigns table with shop, slot, dates, price; monthly trend from seeded history. This screen answers "where's our money" in five seconds.
4. Platform reporting: GMV, order volume, active shops, orders by status, top shops, top categories — charts + tables, period selector.
5. All orders: filterable table, read-only detail with full timeline.
6. Users: list, role filter, search by phone; deactivate.

Acceptance: the live demo moment works end to end — register a shop as a new shopkeeper, see it in the pending queue, approve it, watch it appear on the storefront.
```

---

# PHASE 8 — Demo apparatus

### Prompt 8.1 — Notification log panel

```
Per PRD §9.2: a slide-out panel (sheet, correct side per locale) available on ALL surfaces in the demo build via a subtle floating button.

- Streams notification rows newest-first (poll every 2s): channel icon (SMS/in-app), recipient (name + role), language flag, title, rendered body, relative timestamp
- New entries animate in; unread dot on the floating button
- Filter by channel and role; clear-read action
- Every notify() event appears here: OTPs, order lifecycle, review responses, campaign decisions, shop approval — the panel demonstrates the multilingual templates live (fa + en bodies per PRD §9.2)

Acceptance: during a checkout, the presenter can open the panel and watch the OTP arrive, then the shopkeeper's new-order SMS, then the customer's acceptance SMS — in sequence, in the right languages.
```

### Prompt 8.2 — Demo control panel

```
Per PRD §9.3: presenter-only control panel, enabled by DEMO_MODE=true, opened with a keyboard shortcut (ctrl/cmd+shift+D) as an overlay dialog:

1. Role switcher: one-click session swap between admin / any shopkeeper / any customer, preserving current locale, no logout dance
2. Order scrubber: pick any active order → advance or rewind status (writes proper order_events + notifications so every surface stays consistent)
3. Scenario triggers: "new incoming order" (creates a realistic order for the currently-viewed shop → action queue slides in live), "new shop registration" (lands in admin pending queue)
4. Data reset: runs db:reset behind a double-confirm, with progress state
5. Quick links: the four quality-bar screens, one click each

Guard rails: everything behind DEMO_MODE; panel never appears otherwise. Session swap uses a server-side demo-only endpoint that refuses when DEMO_MODE is false.

Acceptance: the full 15-minute walkthrough (PRD §9.5) can be driven from this panel without ever touching a login form or a terminal.
```

---

# PHASE 9 — Polish and hardening

### Prompt 9.1 — Motion and states audit

```
Sweep every route against PRD §10.5 and §10.6:

1. States: list every page in a checklist and verify skeleton (matches layout, no shift), empty (EmptyState with action), error (error.tsx per group — friendly, Dari, retry). Fix all gaps.
2. Motion inventory — confirm implemented, nothing over 300ms: add-to-cart acknowledgement + badge increment, wishlist heart pop, order timeline progression, dashboard count-ups, action-queue slide-in, page-level fast fades. Remove any incidental animation outside this list.
3. Toasts: consistent voice, correct position per direction, no stacking storms.
4. Focus states visible on every interactive element; dialogs trap focus; escape closes.
```

### Prompt 9.2 — RTL and i18n audit

```
1. Walk every screen in fa: hunt physical-property CSS (grep for -left/-right utilities and properties), unmirrored directional icons, LTR-leaking numerals, misaligned inputs, carousel/scroll direction, chart axes, table alignment. Fix with logical properties.
2. Verify fallback chain rendering: temporarily blank an en title and confirm fa shows, no raw keys or blanks anywhere.
3. Grep for hardcoded user-facing strings across app/ and components/; move every hit into messages/. Confirm en parity, ps falls back cleanly.
4. Currency and dates: AFN + Persian digits in fa everywhere money or numbers render; relative timestamps localized.
```

### Prompt 9.3 — Performance and final QA

```
1. Images: verify every <img> uses the sharp-generated variants with correct sizes; explicit dimensions everywhere (zero CLS); lazy-load below the fold.
2. Queries: check the heavy pages (home, listings, both dashboards) for N+1s; add missing indexes; production build target: home and product page interactive fast on throttled mid-range mobile.
3. Full walkthrough test in production build (npm run build && start): the complete §9.5 script — storefront journey, shop acceptance, admin approval, revenue view, closing tracking shot — in fa, driven via the demo control panel. Log every rough edge as a checklist and fix.
4. README: prerequisites, three-command setup (compose up, db:reset, dev), demo phone numbers table, DEMO_MODE explanation, control panel shortcut, the 15-minute script summary.
```

---

# PHASE 10 — Demo rehearsal (no code)

### Prompt 10.1 — Dry-run assistance

```
Read docs/PRD.md §9.5. I'm rehearsing the client demo. Generate: (1) a presenter cue card — screen-by-screen script with the exact clicks, which demo-control actions to trigger and when, and one client-facing talking point per screen tying what's visible to their business (tenant value, customer trust, THEIR revenue); (2) a pre-demo checklist (reset data, verify pending shop exists, verify hero campaign active, browser zoom/profile, DEMO_MODE on); (3) the five hardest questions the client may ask (delivery, payments timeline, real photos, onboarding effort, launch timeline) with honest suggested answers grounded in the PRD's phase-2 sections.
```

---

## Sequencing summary

| Phase | Output                            | Rough effort share       |
| ----- | --------------------------------- | ------------------------ |
| 0–1   | Repo, scaffold, i18n/RTL base     | 5%                       |
| 2     | Design system + component library | 15%                      |
| 3     | Schema, queries, auth, notify     | 10%                      |
| 4     | Seeded world                      | 10%                      |
| 5     | Customer storefront               | 25%                      |
| 6     | Shop dashboard                    | 15%                      |
| 7     | Admin                             | 10%                      |
| 8     | Demo apparatus                    | 5%                       |
| 9     | Polish + audits                   | 5% + everything you find |
| 10    | Rehearsal                         | —                        |

The share matches PRD §10.8: half the effort lands on the two surfaces the client will judge.
