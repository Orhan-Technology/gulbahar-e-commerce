# Gulbahar Online Shopping — Demo MVP Product Requirements

**Version:** 0.2 (demo MVP, design-led rewrite)
**Status:** Draft for review
**Date:** July 2026

---

## 1. Overview

Gulbahar Online Shopping is an online marketplace that brings Gulbahar Center — the shopping mall at Malik Azghar Square, Kabul — onto the web. Shops in the mall register on the platform, list their products, and receive orders from customers across Kabul. Gulbahar operates the platform.

The mall's tenants are already established merchants with existing stock, pricing, and customers. The platform does not create a marketplace; it digitizes one that already exists physically. Supply, brand trust, and merchant relationships are already in place.

### 1.1 Purpose of this document

This PRD defines a **demo MVP**: a complete, polished, locally runnable system built to win the client in a 15-minute walkthrough. It is not a production specification. The build optimises for two things, in this order:

1. **Interface quality** — the demo must look and feel like a finished commercial product
2. **A complete story** — one order travelling through all three roles, end to end

Everything that does not serve those two goals is simulated, seeded, or deferred (see §9 and §15).

### 1.2 Success criteria

The demo succeeds if the client:

1. Reacts to the storefront as a finished product, not a prototype
2. Can follow a customer order from browse to fulfilment
3. Sees a shopkeeper run their shop from a phone
4. Sees themselves in control — approving shops, managing the platform
5. Recognises paid promotion as their revenue stream
6. Asks "when can we launch?" rather than "what will it look like?"

### 1.3 Guiding constraint

**The demo runs entirely locally.** No external services, no hosted infrastructure, no third-party accounts. One machine, one command, everything works — including offline. This removes every external failure mode from the presentation.

---

## 2. Goals and non-goals

### 2.1 Goals

- A visually excellent, Dari-first, RTL-native interface across all three surfaces
- A complete multi-vendor loop: shop onboarding → listing → order → fulfilment
- Shop self-registration with admin approval as the controlled onboarding path
- Paid promotion presented as the mall's revenue stream
- Reviews, wishlists, offers, and search — the features customers expect from a real shopping platform
- A presenter-controlled demo that cannot fail on stage

### 2.2 Non-goals

- Real payments, SMS delivery, or courier dispatch
- Production security hardening, scale, or search relevance
- Commission accounting, payouts, or reconciliation
- Native mobile applications
- Any dependency on an external service

---

## 3. Users and roles

| Role       | Who                      | Primary need                                                                                     |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| Customer   | Kabul residents          | Find products, order, track                                                                      |
| Shopkeeper | Gulbahar Center tenants  | List products, receive and fulfil orders, grow visibility                                        |
| Admin      | Gulbahar mall management | Control who is on the platform, manage taxonomy and promotion inventory, see overall performance |

### 3.1 Permission boundaries

The governing principle: **admin owns the platform, shops own their content.**

| Capability    | Shopkeeper                                         | Admin                                        |
| ------------- | -------------------------------------------------- | -------------------------------------------- |
| Products      | Full control — create, edit, price, stock, publish | Unpublish / flag only. Cannot edit.          |
| Shop profile  | Edit own                                           | Edit any, approve, suspend, close            |
| Orders        | Own shop's orders only                             | View all                                     |
| Promotions    | Request placement                                  | Define slots, set pricing, approve or reject |
| Categories    | Assign products to existing categories             | Create and manage the taxonomy               |
| Reports       | Own shop only                                      | Platform-wide                                |
| User accounts | Own shop staff                                     | All accounts                                 |

Admin does not edit shop content; moderation is limited to unpublishing. Categories are admin-owned — shops select from a fixed taxonomy.

---

## 4. Information architecture

The customer experience is **product-first**. Shops are a separate browsing dimension, not the primary one.

```
Home
├── Search (products by default, tab to switch to shops)
├── Products      — browse all, filter by category / price / shop / rating
├── Shops         — directory, filter by category, promoted shops surfaced first
│   └── Shop page — profile, own product list, own search
├── Offers        — active discounts and flash sales
├── Cart / Checkout
└── Account       — orders, wishlist, addresses, profile
```

Floor and shop number appear as metadata on the shop page and order confirmations (relevant for in-store pickup), not as a browsing axis.

---

## 5. Functional requirements — Customer

### 5.1 Discovery

- Home: hero banner, category tiles, active offers, featured shops carousel, trending products
- Product listing with filters (category, price range, shop, rating, availability) and sort
- Shop directory with search and category filter; shop rating visible on cards
- Shop page: banner, logo, rating, floor and unit number, hours, own catalogue with search
- Unified search: products by default, tab for shops; sponsored results badged (§8.4)

### 5.2 Product page

- Image gallery with zoom; title, description, price, discount price with strikethrough
- Variants (size, colour); stock status
- Rating summary, distribution bars, and reviews
- Shop attribution linking to the shop page
- Add to cart with quantity; add to wishlist
- Related products from the same shop and category

### 5.3 Cart and checkout

- Multi-shop cart, grouped by shop
- Delivery address entry or **in-store pickup** at Gulbahar Center
- Payment selection: Cash on Delivery or HesabPay (simulated, §9)
- Itemised summary: subtotal, discounts, delivery fee, total
- Confirmation screen with order reference

### 5.4 Post-order

- Order tracking with a visual status progression
- Order history and one-tap reorder
- Account: profile, saved addresses, language preference

### 5.5 Reviews and ratings

- 1–5 star rating plus optional written review
- **Verified purchase only** — reviewable once the order is fulfilled. Without this rule the system fills with noise and shops rating each other.
- One review per customer per product, editable
- Product page: average, count, distribution
- Shop rating derived from product reviews, shown in the directory
- Shopkeeper may respond publicly, once

### 5.6 Wishlist

- Save from listing or product page; heart animation on save
- Wishlist view with current price and stock; move to cart
- Aggregate save counts exposed to the shopkeeper as a demand signal

### 5.7 Authentication

Phone number plus OTP. In the demo build, the OTP appears in the on-screen notification log (§9.2) rather than being sent.

---

## 6. Functional requirements — Shopkeeper

The shop dashboard is the shopkeeper's entire experience of the platform. **Mobile-first** — tenants will run their shop from a phone behind the counter — and fully in Dari.

### 6.1 Dashboard

Answers two questions in three seconds: did I make money, and what needs my attention?

- Stat cards: today's sales, this week's sales, orders awaiting action, live products
- **Action queue**: new orders, orders to mark ready, out-of-stock products, expiring promotions
- Sales chart, last 30 days
- Top products with views, orders, revenue

### 6.2 Products

- List with search, filters, inline stock editing, low-stock badges
- Bulk publish / unpublish
- Add/edit: title, description, category, price, discount price, stock, images, variants; per-language fields (§11)
- Draft and published states
- **Bulk import**: downloadable template, upload with row-by-row validation preview, imports land as drafts. Happy path only for the demo; import history is phase 2.

### 6.3 Orders

- Filterable list; detail with items, customer contact, delivery or pickup, payment method
- Actions: accept, reject with reason, mark ready, mark fulfilled

### 6.4 Promotions

Two tabs, two mechanisms (§8):

- **Offers** — percentage or fixed discounts, flash sales with dates, per-product or shop-wide
- **Featured** — browse slots, see price, book duration, view running campaigns with impressions and clicks

### 6.5 Reviews

- Reviews across the shop's products, filterable by rating; respond publicly; flag for admin

### 6.6 Shop profile

Logo, banner, description, category, hours, floor and unit number, contact.

### 6.7 Reports

Sales by period and product, order count, average order value, status breakdown, promotion performance, rating trend, wishlist saves.

### 6.8 Settings

Notification preferences, staff users, language.

---

## 7. Functional requirements — Admin

### 7.1 Shop management

- Pending queue with review interface; approve, or reject with a visible reason
- Create a shop directly and invite the owner to claim it
- Edit, suspend, close any shop; directory with status filters

A pending shop can build everything — products, prices, profile — but is not public. Approval flips one switch. This keeps the review meaningful and the shopkeeper engaged during the wait.

Shop lifecycle: `pending → approved → suspended → closed`

### 7.2 Catalogue governance

- Category taxonomy management (trilingual names, §11)
- Product review and unpublish
- Review moderation: reported reviews, remove or uphold (seeded queue for the demo)

### 7.3 Promotions

- Slot inventory and pricing
- Approve or reject campaign requests; booking calendar
- Create campaigns manually for shops sold offline
- **Revenue view** — the screen to linger on in the demo

### 7.4 Orders and reporting

- All-orders view with filters
- Platform reporting: GMV, order volume, active shops, top shops and categories, promotion revenue

### 7.5 Users

Manage customer, shopkeeper, and admin accounts.

---

## 8. Promotions model

Two mechanisms, named differently in the product because they are different things.

### 8.1 Offers

Discounts funded by the shop: percentage, fixed amount, flash sales with countdown. Cost the shop margin. No approval required.

### 8.2 Featured (paid placement)

Visibility purchased from Gulbahar. **This is the platform's revenue mechanism** — foreground it in the demo.

| Slot                             | Quantity |
| -------------------------------- | -------- |
| Home hero banner                 | 1        |
| Featured shops carousel          | 6        |
| Top of search results            | 2–3      |
| Top of category listing          | 2–3      |
| Related products on product page | 2        |
| Top of shop directory            | 3        |

### 8.3 Pricing

Flat fee per slot per week or month. Not CPC, not auction. Mall tenants already understand paying for a good position — it mirrors physical mall advertising. Auctions are correct at scale and wrong now.

### 8.4 Guardrails

- Every promoted result carries a visible «تبلیغ شده» / "Sponsored" badge
- Promoted slots per listing are capped so organic results dominate
- Paid placement never overrides ratings in organic ranking — a shop can buy the top slot, not a better score

---

## 9. Demo strategy

### 9.1 Simulated subsystems

| Subsystem        | Demo treatment                                               |
| ---------------- | ------------------------------------------------------------ |
| HesabPay         | Styled payment sheet with success animation; no integration  |
| Cash on delivery | "Pay on delivery" selection; no cash handling                |
| SMS / OTP        | All messages render in the on-screen notification log (§9.2) |
| Delivery         | Status advanced from the demo control panel                  |
| Analytics        | Seeded 90-day history so charts have genuine shape           |
| Payouts          | Read-only seeded table                                       |

### 9.2 Notification log panel

A slide-out panel, available in the demo build, showing every SMS the system _would_ send — recipient, message, language — appearing in real time. This demos better than real SMS: the client watches the message appear on screen the moment the order is accepted. Templates are authored in Dari and English so the panel itself demonstrates the multilingual capability.

### 9.3 Demo control panel

A presenter-only panel providing:

- Advance / rewind any order's status
- Switch role and user in one click, no logout
- Reset all data to the seeded state
- Trigger scenario moments: a new order arriving on the shop dashboard, a registration landing in the admin queue

This converts a fragile live demo into a controlled performance.

### 9.4 Seeded content — a deliverable, not an afterthought

- 12–15 shops with plausible Gulbahar Center names, real floors and unit numbers, logos and banners
- 60–80 products with **consistent, high-quality photography** (§10.7), Dari names, genuine Kabul market prices in AFN
- 90 days of order history across shops so dashboards and charts read as real
- Reviews seeded with authentic-sounding Dari text, varied ratings, a few shopkeeper responses
- Active offers and running featured campaigns, so promoted slots are visibly occupied
- One shop pre-staged in the pending queue for the live approval moment

Placeholder content undermines the demo more than any missing feature. Budget seeding as its own workstream.

### 9.5 The 15-minute walkthrough

1. **Storefront** (4 min) — home, search, product page, add to cart, checkout with HesabPay sheet, order confirmation
2. **Shop dashboard** (4 min) — the order arrives in the action queue; accept it; show products, offers, booking a featured slot; all on a phone-sized viewport
3. **Admin** (4 min) — approve the pre-staged shop live; campaign approvals; the revenue view; platform reporting
4. **Close** (3 min) — customer's tracking screen updating as the order advances; the notification log showing each SMS; questions

---

## 10. Design system

Interface quality is the primary success criterion (§1.1), so design is specified here with the same weight as features.

### 10.1 Design direction

**Reference points:** Noon, Daraz, and the better regional marketplaces — not Amazon's density and not a minimal Western aesthetic. Warm, commercial, trustworthy, generous with imagery.

**Brand:** colours derived from Gulbahar Center's own branding and signage, so the client sees their identity, not a template. Confirm the exact palette from their materials; the working direction is a deep green primary with a warm gold accent — premium, and distinct from competitors' orange and blue.

**Tone:** this is a shopping destination, not a utility. Product photography does the visual heavy lifting; the interface frames it and stays out of the way.

### 10.2 Foundations

| Token group | Direction                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour      | Primary (deep green), accent (gold), semantic success / warning / danger, 10-step neutral scale. All defined as CSS variables; light mode only for the MVP. |
| Typography  | **Vazirmatn** for Dari and Pashto; **Inter** for Latin, weight-matched. Type scale of 6 sizes; no more. Numerals follow locale (Persian digits in Dari UI). |
| Spacing     | 4px base scale (4, 8, 12, 16, 24, 32, 48, 64). No arbitrary values.                                                                                         |
| Radius      | One radius family (e.g. 8px cards, 6px controls, full for pills) applied consistently.                                                                      |
| Elevation   | Two shadow levels only: card and overlay.                                                                                                                   |
| Iconography | Lucide, single stroke weight, mirrored where directional in RTL.                                                                                            |

### 10.3 RTL as the design default

Every screen is **designed in Dari first**, then verified in English — the reverse of the usual workflow, and the single biggest determinant of whether the product feels native or translated.

- CSS logical properties throughout (`margin-inline-start`, never `margin-left`)
- Directional icons (chevrons, arrows, back) mirror automatically
- Numerals, currency position, and dates follow locale
- Charts and progress bars flow right-to-left in RTL
- Layout mirrors; it is never duplicated per language

### 10.4 Component library

**shadcn/ui**, restyled with the tokens above — not stock. This provides accessible, keyboard-navigable primitives (dialogs, dropdowns, toasts, sheets, command menu) without weeks of component work, while full ownership of the code allows RTL adjustments where needed.

Custom components on top: product card, shop card, rating display, price with discount, order status timeline, stat card, action-queue item, promotion slot card, empty states.

### 10.5 States are the polish

Every list and every async action has designed states. This is where demos are won:

- **Loading:** skeleton screens matching final layout — never spinners on content, never a blank flash
- **Empty:** illustrated, with a next action ("No products yet — add your first")
- **Error:** friendly, in Dari, with retry
- **Success:** confirmation moments — order placed gets a celebratory beat, not a redirect

### 10.6 Motion

Restraint, applied where it signals life:

- Add to cart: item-to-cart acknowledgement, cart badge increments
- Wishlist heart: single satisfying pop
- Order status: animated progression on the tracking screen
- Dashboard: numbers count up on first load; new action-queue items slide in
- Page transitions: fast fades only, 150–200ms; nothing that delays the presenter
- Press feedback: every tappable surface gives under contact and returns in 120ms

**Two budgets, not one** (revised against the client's reference recording):

| Class | Ceiling | What it covers |
| --- | --- | --- |
| Feedback | 300ms | Taps, toggles, focus, badges. Duration here reads as latency — the user has already acted. |
| Decorative | 500ms | Hover transforms, section reveals, carousel slides. Nothing is waiting on these, and the reference's unhurried hover is most of why it feels considered rather than twitchy. |

`npm run audit` enforces both separately; the looser budget has to be claimed
deliberately, by a `hover:`/`reveal` on an adjacent line or an explicit
`// motion-decorative:` marker.

No parallax. Scroll-linked motion is limited to two things, both modelled on
native list behaviour rather than on web scroll effects:

- **Section reveal** — a band rises into place once, the first time it enters
  the viewport, and never re-animates on the way back up.
- **Overscroll stretch** — pulling past either end of a scroller stretches the
  content away from the anchored edge and springs it back, as Android 12 does.
  Purely a transform over native scroll: passive listeners only, nothing
  intercepted or delayed.

Every one of these stops entirely under `prefers-reduced-motion`, guaranteed by
one base-layer rule rather than a check per component.

### 10.7 Photography standard

Seeded catalogue photography follows one rule set: consistent background (white or a single neutral), consistent aspect ratio (1:1 for cards, 4:5 on product pages), no watermarks, no mixed lighting. Thirty uniform products look better than eighty inconsistent ones; aim for both quantity and uniformity.

### 10.8 Screen-level quality bar

Four screens receive disproportionate polish, in priority order:

1. **Home** — the first impression; hero, categories, featured shops, offers
2. **Product page** — where buying happens
3. **Shop dashboard (phone viewport)** — the "your tenants run this from their counter" moment
4. **Admin revenue view** — the "this is your new income" moment

Admin elsewhere may be clean-but-plain; these four may not.

---

## 11. Multi-language

Three languages: **Dari** (primary), **English** (secondary), **Pashto** (structure in place, strings deferred to phase 2).

**Interface layer** — every string across all three surfaces via next-intl, including the shop dashboard and admin. Leaving internal tools in English would exclude the intended shopkeeper users.

**Content layer** — per-language fields on product title/description, shop name/description, category names, stored as JSONB keyed by locale. Only the primary language is required; a fallback chain (ps → fa, en → fa) prevents blanks. The dashboard indicates missing translations without blocking publication. Category names are admin-maintained in all languages.

Afghani currency formatting and Persian numeral display follow locale throughout.

---

## 12. Technical stack

### 12.1 Principle

**Everything runs on one machine with no external dependencies.** `docker compose up` starts the database; `npm run dev` (or one production build) serves the entire system. The demo works offline. Nothing can fail on stage except our own code — and the demo control panel exists to manage even that.

### 12.2 Core

| Layer      | Choice                        | Notes                                                                                 |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router)       | One app; route groups `(shop)`, `(dashboard)`, `(admin)` sharing types and components |
| Language   | TypeScript, strict            | TS 6 — see the build note below                                                       |
| Styling    | Tailwind CSS v4               | CSS-first `@theme`; logical properties for RTL; design tokens as CSS variables        |
| Components | shadcn/ui, restyled           | §10.4                                                                                 |
| Database   | PostgreSQL via Docker Compose | Single container, volume-persisted                                                    |
| ORM        | Drizzle                       | Fast migrations, transparent SQL                                                      |
| Validation | Zod                           | Shared between forms and server actions                                               |
| Auth       | Auth.js, credentials provider | Phone + OTP; OTP surfaces in the notification log                                     |
| Charts     | Recharts                      | RTL-verified                                                                          |
| i18n       | next-intl                     | §11                                                                                   |

**Version note (deviation from PRD v0.2, decided July 2026).** The original draft
specified Next.js 14. The build runs on the current releases instead: Next 16.2,
React 19.2, Tailwind v4.3, ESLint 10, TypeScript 6.0.

TypeScript is the one place where "latest" is not achievable: TS 7.0 is published
as `latest` on npm, but both Next 16 and `typescript-eslint` refuse it outright —
TS 7 is the native compiler rewrite and does not expose the compiler API they
depend on. Both tools' error messages direct you to TypeScript 6. Revisit once
`typescript-eslint` ships TS 7 support (their issue #10940).

### 12.3 Deliberately local

| Concern         | Demo approach                                                                     | Production path (phase 2)                                                 |
| --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Search          | Postgres `pg_trgm` + `unaccent` — indistinguishable at 80 products                | Meilisearch when the catalogue is real (no Dari stemming in Postgres FTS) |
| Images          | Local filesystem volume; `sharp` generates WebP variants and thumbnails at upload | Object storage + CDN                                                      |
| Background work | None — everything synchronous at demo scale                                       | pg-boss when real notifications and imports arrive                        |
| SMS             | Console/log driver rendering to the notification panel                            | Afghan gateway behind the same provider interface                         |
| Email           | None                                                                              | Optional later                                                            |

The SMS provider interface is written now with only the log driver implemented — the production gateway becomes a drop-in.

### 12.4 Explicitly absent

No Redis, no queue, no search cluster, no CDN, no object storage, no external APIs, no analytics SDKs, no microservices. Each has a defined phase-2 entry point; none belongs in the demo.

---

## 13. Core flows

### 13.1 Shop onboarding

```
Shopkeeper registers → shop details + licence → pending
    → Admin approves → public
    → Admin rejects with reason → amend and resubmit
```

Alternative: admin creates the shop (auto-approved) and invites the owner to claim it — many tenants will ask mall management to set things up for them.

### 13.2 Order

```
Placed → shop accepts → ready → fulfilled (delivery or pickup)
       → shop rejects → customer notified, order cancelled
```

### 13.3 Promotion

```
Shop books slot + duration → admin approves → runs → performance visible → renew
```

---

## 14. Data model outline

- `User` — phone identity, role
- `Shop` — profile, status, floor, unit
- `ShopMember` — user↔shop join (owner plus staff; cheap now, painful later)
- `Category` — admin taxonomy, trilingual
- `Product`, `ProductVariant` — JSONB translated fields
- `Order`, `OrderItem` — orders may span shops
- `OrderEvent` — append-only status log driving tracking and the notification panel
- `Review`, `ReviewResponse` — verified-purchase link to an order item
- `WishlistItem`
- `Offer` — shop-funded discounts
- `PromotionSlot`, `Campaign` — placement inventory and bookings
- `Notification` — the on-screen log's source of truth
- `Address`

---

## 15. Demo cut vs phase 2

Features retained in this PRD but consciously staged:

| Feature       | Demo build                                | Phase 2                                        |
| ------------- | ----------------------------------------- | ---------------------------------------------- |
| Reviews       | Write flow + seeded data + shop responses | Moderation queue live, reporting flows         |
| Wishlist      | Full                                      | Price-drop / restock notifications             |
| Bulk import   | Template + validated upload, happy path   | Import history, image matching by SKU          |
| Notifications | On-screen log, Dari + English templates   | Real SMS gateway, preferences, delivery status |
| Languages     | Dari + English complete                   | Pashto strings                                 |
| Search        | pg_trgm                                   | Meilisearch, facets at scale                   |
| Promotions    | Booking + approval + seeded metrics       | Real impression/click tracking, billing        |
| Payments      | Simulated HesabPay sheet, COD selection   | Real HesabPay integration, cash reconciliation |

---

## 16. Out of scope entirely

Returns and refunds, promo codes, disputes, personalisation, loyalty programmes, buyer–seller messaging, native apps, dark mode.

---

## 17. Open questions

Non-blocking for the demo; required before production.

1. **Delivery operation** — mall-operated courier, third party, or per-shop? Determines who marks delivery and how fees are set.
2. **Revenue beyond promotions** — commission per order, subscription, or placement only? Determines whether a payout ledger is required.
3. **Gulbahar brand assets** — obtain the actual logo, colours, and signage references early; §10.1 depends on them.
4. **Production hosting** — the demo is local by design; the deployment target (previously Dokploy on Hetzner with Cloudflare) is a phase-2 decision.
