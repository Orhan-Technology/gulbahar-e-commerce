# Gulbahar Online Shopping — Demo MVP

Multi-vendor marketplace digitizing Gulbahar Center (Kabul mall). Three surfaces in ONE Next.js 16 app via route groups: (shop) customer storefront, (dashboard) shopkeeper panel, (admin) mall management. Full spec: docs/PRD.md — consult it before implementing any feature.

## Hard rules

- Demo MVP: everything runs locally. NO external services — no CDN, no object storage, no real SMS, no analytics SDKs, no Redis. Postgres runs in Docker Compose. Images on local filesystem. SMS renders to an in-app notification log.
- UI/UX is the primary success criterion. Every screen ships with designed loading (skeleton), empty, and error states. No spinners on content, no blank flashes, no unstyled intermediate states.
- RTL-first: default locale is Dari (fa). Design and verify every screen in RTL first, then check English LTR. CSS logical properties ONLY (inline-start/end, never left/right). Directional icons mirror in RTL.
- i18n: next-intl. Locales fa (default) and en; ps structure present, strings deferred. Every user-facing string goes through translations — zero hardcoded strings.
- Typography: Vazirmatn (fa/ps), Inter (en). Persian digits in fa UI. Currency: Afghani (AFN / ؋).
- Design tokens are CSS variables in the app/globals.css `@theme` block. Never use arbitrary Tailwind values for color, spacing, radius, or shadow — tokens only. Spacing scale: 4/8/12/16/24/32/48/64.
- Components: shadcn/ui restyled with our tokens. Custom components in components/custom/.
- Skeletons are NAMED exports (ProductCardSkeleton), not `Component.Skeleton` statics. A static attached to a 'use client' component is LOST across the RSC boundary — a server component importing it gets a client reference proxy and the property reads as undefined at runtime with a useless "Element type is invalid" error. The statics remain only as aliases for client call sites.
- Tailwind gradients are physical (bg-linear-to-r/l) with no logical variant; use `ltr:bg-linear-to-r rtl:bg-linear-to-l` for direction-aware gradients.
- Stack: Next.js 16 App Router (Turbopack), React 19, TypeScript 6 strict, Tailwind v4, Drizzle + Postgres, Zod 4, Auth.js v5 (phone+OTP credentials), Recharts, sharp for image variants.
- Next 16 specifics: `params`/`searchParams` are Promises — always await them. Every page AND route-group layout must call `setRequestLocale(locale)`, or next-intl reads headers and drops the group from static rendering. Locale routing lives in `proxy.ts` (Next 16 renamed the middleware convention).
- Tailwind v4 is CSS-first: there is NO tailwind.config.ts. The `@theme` block in app/globals.css IS the theme. `--color-*`, `--text-*` and `--shadow-*` are reset to `initial` there, so Tailwind default colours, text-4xl and shadow-2xl genuinely do not exist — use our tokens only.
- React 19 lint rules are enforced: no setState synchronously inside an effect, and no impure calls (Date.now(), Math.random()) during render.
- Server components for reads, server actions for mutations. Zod-validate every action input. No API routes unless technically required.
- Permission model (PRD §3.1): admin owns the platform, shops own their content. Admin can unpublish but NEVER edit shop content. Enforce in every action. The boundary is kept by the SHAPE of the action files — lib/actions/admin-*.ts has no product or profile writer at all, so no future edit can widen it by accident.
- A `[slug]` route param arrives PERCENT-ENCODED when it contains non-ASCII characters. Dari slugs are real (products get slugs from their Dari title), so every lookup-by-slug page must run the param through `decodeSlug()` from lib/utils. The failure is nasty: the page 404s while `generateMetadata` — which resolves params separately — still finds the row, so the response carries the correct `<title>` and only the body is missing.
- A messages key may be a string OR a namespace, never both. Reusing one key for a label and for a group of nested keys silently makes the object win, and `t('thatKey')` renders the raw key path. Bitten twice (`checkout.hesabpay`, `shopProducts.import`). `npm run check:messages` now catches this, plus missing keys and fa/en drift.
- A function exported from a `'use client'` module cannot be CALLED from a server component — only rendered as a component or passed as a prop. Doing so is a runtime 500 ("Attempted to call X from the server"), not a type error.
- …and a plain `export const NUMBER = 6` in a `'use client'` module is no safer: a server component importing it gets a client reference, so `rows.length - VISIBLE_ROWS` is NaN and the UI renders "NaN more items". No type error, no runtime error, just a wrong string. Shared constants belong in a module with no `'use client'`, or are owned by the server file and passed down as a prop. Same failure as the skeleton-statics rule above, different shape.
- Clock reads belong on the server. A client component may not call `Date.now()`/`new Date()` during render (React 19 purity), so pass `now` down as an ISO string; in a query module, take a day count and derive the window inside the query.
- A JS `Date` interpolated into a RAW `sql` fragment has no column to infer a type from, so postgres.js rejects it with `The "string" argument must be of type string or an instance of Buffer` — nowhere near the real cause. Pass `date.toISOString()` with an explicit `::timestamptz`.
- Drizzle wraps driver errors in `DrizzleQueryError`, whose own `code` is undefined — the PostgresError with the SQLSTATE is at `.cause`. Checking `error.code` for a unique violation (23505) makes the catch dead code and the action 500s.
- next-intl ships the WHOLE message tree to the client on every page, so any translated string is present in the HTML of every other page too. A test that asserts a screen rendered by grepping for one of its strings will also pass on a redirect — assert the status code with redirects unfollowed instead.
- `/dashboard/register-shop` lives in its own `(onboarding)` route group, NOT in `(dashboard)`. The dashboard layout guard redirects a shopkeeper without a shop to that path, so putting the page inside the guarded group makes it redirect to itself forever. Route groups do not appear in the URL, so the path is unchanged.
- `shops.hours` is free text, stored canonically as ASCII `HH:MM-HH:MM` and localised by `formatOpeningHours()`. Storing the display string freezes one language's digits into the column — which the first seed did, leaving English visitors reading Persian numerals.
- Anything the BROWSER holds outlives the row it names, and `db:reset` reissues every uuid. Two carriers, both fixed, both worth remembering before adding a third: the session JWT (a user id) and the cart cookie (product ids, 30-day life). Each must be validated against the database at the point it re-enters the system, or a foreign key fails and drizzle reports it as an unreadable `Failed query`.
- A JWT outlives the row it names. `db:reset` gives every user a new uuid, so a browser signed in beforehand keeps asserting a dead id: pages render, the header shows a name, and every write fails on a foreign key. The `jwt` callback returns null when the subject no longer exists, which signs them out instead. Never remove that check — the failure it prevents surfaces as an unreadable `Failed query`.
- The postgres.js pool sets `idle_timeout`, `max_lifetime` and `connect_timeout` (lib/db/index.ts). Without them a socket is held indefinitely, and when the network or a Docker restart drops it the next request fails once with a bare `Failed query` carrying no SQLSTATE — impossible to diagnose from the message. Never remove them.
- `bis_skin_checked`, `bis_register` and `__processed_<uuid>__` in a hydration mismatch are Bitdefender's browser extension, not our markup. `<body>` carries `suppressHydrationWarning` for the two it puts there; the ones on inner divs cannot be suppressed — demo in a clean profile.
- Catalogue photos: content/seed/photos.json maps every product slug and shop banner to a hand-verified Unsplash id; scripts/seed-images.ts crops from the COMMITTED content/seed/photo-cache/ so db:reset stays offline. Photo URLs need `fm=jpg` — without it the CDN content-negotiates and can hand Node AVIF. Never trust an Unsplash id by its label: of 105 candidates, 6 were 404 and ~25 were mislabeled (the "pistachio" was broccoli) — validate with HTTP codes AND a contact-sheet eyeball before mapping.
- Seeded basenames are deterministic (`seedBasename`), so regenerating imagery changes bytes on disk but no database row — after `db:seed:images` nothing else needs to run.
- …but the URL does not change either, so **Next's image optimiser keeps serving the OLD picture forever**. After `db:seed:images`, delete `.next/dev/cache/images` and restart dev. Note the path: Next 16 moved it out of `.next/cache/`, and deleting the Next 15 location succeeds silently while changing nothing. Diagnosing this has a trap of its own — `curl` without an `Accept` header MISSES the cache and re-optimises, so it happily reports the new image while the browser is still being handed the old one. Send `Accept: image/avif,image/webp,…` and check for `X-Nextjs-Cache: HIT`, or ask the browser itself by drawing the img to a canvas and reading a pixel.
- Tailwind v4 compiles `scale-*` to the standalone **`scale`** property, not to `transform`. A `transition-[transform]` therefore animates nothing and the element snaps — which looks like a deliberate design choice, not a bug.
- Headless Chrome reports **no hover-capable pointer**, and Tailwind v4 wraps every `hover:` utility in `@media (hover: hover)`. Every hover state renders dead in a screenshot while the page otherwise looks perfect. Launch with `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4`; CDP's `Emulation.setEmulatedMedia` does not cover those two features.
- Every seeded timestamp must be clamped to the past. `daysAgo(0)` plus a forward chain (order events, reviews, notification offsets) can land in the future, which reads as "notifications are not ordered / not real-time" in the UI. The clamps in scripts/seed.ts preserve the PRNG draw sequence — reordering or adding draws renumbers every order reference the runbook and checks name (GC-24788, GC-24338).
- All monetary values stored as integers (afghanis, no decimals needed). All timestamps UTC.
- Order status flow: placed → accepted → ready → fulfilled; rejected is terminal from placed. Status changes append to order_events and create notifications.
- The presenter tools (notification log, control panel, role swap) are gated on `DEMO_MODE` in THREE places, each load-bearing: the layout so they are absent not hidden, every demo server action because an action is reachable without its button, and the `demo` auth provider's authorize() which is the last gate before a session is minted.

## Commands

- docker compose up -d — start Postgres
- npm run dev — dev server
- npm run db:push / db:seed / db:reset — schema, seed, full reset
- npm run typecheck && npm run lint — must pass before any phase is considered done (lint is the eslint CLI; `next lint` was removed in Next 16)
- npm run check:phase3 … check:phase9, check:journey, check:signin — acceptance checks per phase; they need the DEV server up (the action ids come from the dev manifest, so `npm run start` cannot drive them)
- npm run audit — static sweep for physical CSS, hardcoded Dari, motion over 300ms, images without dimensions, missing error boundaries. `// audit-allow <rule> — reason` exempts the next non-comment line
- npm run check:messages — static audit of t() usage: missing keys, keys shadowed by a namespace, fa/en drift. No dev server needed
- npm run check:design — the seams BETWEEN surfaces: one listing toolbar everywhere, every KPI drill-down resolving AND arriving filtered, press feedback present on all three panels, Persian numerals in visible fa text, no Suspense falling back to a spinner, no number formatted outside lib/format. Needs the dev server
- scripts/login.sh &lt;phone&gt; — signs a seeded account in and prints a cookie jar path, so authenticated screens can be curl'd
- Never run `npm run build` while `npm run dev` is running — they share .next and the dev chunk manifest gets clobbered

## Verifying server actions

scripts/check-phase6.ts drives the real server actions over HTTP instead of re-implementing them, which is the only way to check authorization and validation as shipped. Two non-obvious requirements:

- Action ids come from `.next/dev/server/app/**/server-reference-manifest.json`, and an action is only callable from a page whose manifest lists it. POST to that page with a `Next-Action: <id>` header; the return value comes back as a `<row>:{…}` line in the flight stream.
- For a multipart call (any argument carrying a File), the FILE PARTS MUST BE APPENDED BEFORE the root argument part `"0"`. React resolves the root model the moment busboy emits it, so a `$K` FormData reference can only see parts that have already arrived — root-first yields a silently EMPTY FormData and the action reports "no files".

A check that drives a real state change must UNDO it (check-phase6c restores the order it accepts; check-phase7 restores the pending shop and the two reported reviews; check-phase7b restores the requested campaign; check-phase8 restores the notification log). Otherwise every run eats a seeded demo moment and the walkthrough is hollow by the third rehearsal.

Scope that cleanup BY ID, captured before anything else runs — not by timestamp and not by "recent". Seeded notifications carry timestamps spread across the current day, so `created_at > now() - interval '1 hour'` deletes seed data; and `scripts/login.sh` requests an OTP, so every `signIn()` in a check writes a notification of its own. check-phase8 got both wrong first and emptied the table.

The shared harness is `scripts/lib/action-client.ts` — use `ActionClient.create(pages, cookie)` rather than re-implementing the manifest lookup.

## Definition of done for every screen

Renders correctly in fa (RTL) and en (LTR) · skeleton + empty + error states present · mobile viewport verified for (shop) and (dashboard) · no hardcoded strings · typecheck and lint clean · `npm run audit` clean

A page whose whole body waits on one query needs a route-level `loading.tsx`, not an internal Suspense boundary — there is nothing to stream around, so without one the browser shows the PREVIOUS page until the server answers.

Two rules for the check scripts themselves, both learned the hard way:

- An assertion must not depend on "the newest row" when the script also creates rows. check-phase8 picked the newest notification to test clear-read with, which was sometimes the one a later section asserted on; the failure moved depending on insert order.
- A static auditor must strip comments before matching, or it reports its own explanatory prose — twelve of the first fourteen findings were comments containing the words "right-to-left".
