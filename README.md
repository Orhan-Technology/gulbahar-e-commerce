# Gulbahar Online Shopping — Demo MVP

Multi-vendor marketplace digitizing Gulbahar Center (Malik Azghar Square, Kabul). Three surfaces
in one Next.js 16 app: customer storefront, shopkeeper dashboard, mall admin.

Full specification: [`docs/PRD.md`](docs/PRD.md) · build plan: [`docs/BUILD-PROMPTS.md`](docs/BUILD-PROMPTS.md)

## Prerequisites

- Node.js 20+ (developed on 24)
- Docker with Compose

## Setup

```bash
cp .env.example .env      # already done if .env exists
docker compose up -d      # start Postgres
npm install
npm run db:setup          # generate seed imagery, then create and seed the database
npm run dev               # http://localhost:3005
```

`db:setup` runs the image generator once and then `db:reset`. Afterwards use
`npm run db:reset` on its own — it rebuilds the data in about 3 seconds and leaves
the generated imagery alone, which is what the demo control panel's reset needs.

Catalogue imagery is real photography: every product and shop banner is mapped to a
hand-picked Unsplash photo in `content/seed/photos.json`, fetched into the committed
`content/seed/photo-cache/` and cropped locally by `npm run db:seed:images` (two
gallery angles per product, wide banner crop). Because the cache is in the repo, the
generator never needs the network; if a cache file is missing and the machine is
offline, that one item falls back to the old SVG placeholder and the run continues.
Shop logos stay as generated monograms deliberately — a photo makes a poor 40px mark.

The seed is **deterministic**: every reset produces byte-identical data, so a
rehearsed walkthrough still matches after resetting mid-demo.

Fonts are committed to the repo (`assets/fonts/`) and loaded with `next/font/local`:
**Vazirmatn** (variable) for Dari and Pashto — its Arabic-script coverage includes the
Pashto letters — and **InterVariable** for English. Nothing is fetched at build or run
time, so a fresh clone builds and demos fully offline, per PRD §1.3.

## Ports

This machine already had services on the conventional ports, so Gulbahar uses:

| Service  | Port   | Note                                       |
| -------- | ------ | ------------------------------------------ |
| Web app  | `3005` | 3000 is taken by another local project     |
| Postgres | `5435` | 5432/5433/5434 are taken by other Postgres |

Both are set in `.env` and `package.json`; change them together if you want different ones.

## Demo sign-in

Sign-in is phone + OTP with no password. The code is never sent anywhere — it is
written to the notification log, which is where the presenter reads it (PRD §9.2).

| Role       | Phone        | Notes                            |
| ---------- | ------------ | -------------------------------- |
| Admin      | `0700000001` | Mall management, all surfaces    |
| Shopkeeper | `0700000002` | Owner of الکترونیک کابل          |
| Staff      | `0700000004` | Same shop, staff role            |
| Customer   | `0700000003` | Has order history and a wishlist |

## Seeded world

| Data      | Amount                                                   |
| --------- | -------------------------------------------------------- |
| Shops     | 14 — 13 approved, 1 pending for the live approval moment |
| Products  | 75 (69 published, 6 draft under the pending shop)        |
| Orders    | 220 across 90 days, weighted to recent weeks             |
| Reviews   | 90 verified-purchase, 10 shop replies, 2 reported        |
| Offers    | 5 active, 2 expired                                      |
| Campaigns | 8 active, 1 awaiting approval, 2 ended                   |
| Users     | 1 admin, 14 shopkeepers, 1 staff, 25 customers           |

## Locales

| Path  | Language | Direction | Status                                    |
| ----- | -------- | --------- | ----------------------------------------- |
| `/fa` | Dari     | RTL       | Primary — the design default (PRD §10.3)  |
| `/en` | English  | LTR       | Secondary, verified                       |
| `/ps` | Pashto   | RTL       | Structure only; strings fall back to Dari |

`/` redirects to `/fa`.

## Demo mode

`DEMO_MODE=true` in `.env` enables the presenter tools (PRD §9.2, §9.3). With it off
they are absent from the page, not merely hidden, and every one of their server
actions refuses.

**Notification log** — the round button in the bottom trailing corner, on all three
surfaces. Every SMS the system would send, appearing as it is written: recipient,
role, the language the template rendered in, and the body. Polls every two seconds,
so a message lands on screen while the presenter is still talking. This is where the
OTP is read at sign-in.

**Control panel** — `Ctrl/Cmd + Shift + D` from any page. No visible trigger, so it
cannot be opened by accident on stage.

| Tab       | What it does                                                                   |
| --------- | ------------------------------------------------------------------------------ |
| Roles     | One-click session swap between admin, any shopkeeper and any customer          |
| Orders    | Step any live order forward or back, writing real events and messages          |
| Scenarios | Create a realistic incoming order, or land a new shop application in the queue |
| Links     | The four quality-bar screens                                                   |

Data reset lives on the Scenarios tab behind a double confirm. It runs `db:reset`, so
it signs you out — the users table is rebuilt.

Stepping an order **back** deletes the event and the notification it is undoing, so
the log and the customer's timeline never contradict each other.

## The 15-minute walkthrough

Full presenter cue card, pre-demo checklist and the five hardest client questions:
[`docs/DEMO-RUNBOOK.md`](docs/DEMO-RUNBOOK.md). Summary:

Driven entirely from the control panel — no login form, no terminal (PRD §9.5).

**1 · Storefront (4 min)** — `/fa`. Home, search a Dari term, open a product, add to
cart, checkout with the HesabPay sheet. Open the notification log: the OTP is there,
then the order confirmation.

**2 · Shop dashboard (4 min)** — swap to the shopkeeper. The order is in the action
queue. Accept it and watch the customer's SMS appear in the log. Show products,
create an offer, book a featured slot. Do this at a phone viewport.

**3 · Admin (4 min)** — swap to admin. Approve the pending shop and open its public
page. Approve the campaign request. Then the revenue view — the screen to linger on.

**4 · Close (3 min)** — swap back to the customer and open their order tracking while
stepping the order forward from the panel: the timeline advances, each SMS appears in
the log in the right language.

## Styleguide

`/fa/styleguide` and `/en/styleguide` render the full design system: palette,
type scale, numerals, spacing, radii, elevation, every shadcn primitive, and all
12 custom components beside their skeletons. It is the visual regression
reference for the build — check it in Dari first (PRD §10.3).

## Scripts

| Command                    | Purpose                                                       |
| -------------------------- | ------------------------------------------------------------- |
| `npm run dev`              | Dev server on port 3005                                       |
| `npm run build`            | Production build (stop `dev` first — they share `.next`)      |
| `npm run start`            | Serve the production build on 3005                            |
| `npm run typecheck`        | `tsc --noEmit`                                                |
| `npm run lint`             | ESLint                                                        |
| `npm run format`           | Prettier write                                                |
| `npm run db:setup`         | Generate seed imagery, then create and seed the database      |
| `npm run db:reset`         | Drop schema, re-push, re-seed (~3s, deterministic)            |
| `npm run db:push`          | Push the Drizzle schema to Postgres                           |
| `npm run db:seed`          | Seed demo data                                                |
| `npm run db:extensions`    | Apply pg_trgm, unaccent and the trigram indexes               |
| `npm run audit`            | Static sweep: physical CSS, hardcoded strings, motion, images |
| `npm run check:messages`   | Translation audit: missing keys, shadowed keys, fa/en drift   |
| `npm run check:phase3`     | Data layer — OTP, queries, search                             |
| `npm run check:phase4`     | Seeded world                                                  |
| `npm run check:phase5`     | Storefront                                                    |
| `npm run check:phase6`     | Shopkeeper catalogue and bulk import                          |
| `npm run check:phase6c`    | Shopkeeper orders, promotions, reviews, profile, settings     |
| `npm run check:phase7`     | Admin shops, taxonomy, catalogue governance                   |
| `npm run check:phase7b`    | Promotions, revenue, reporting, orders, users                 |
| `npm run check:phase8`     | Demo apparatus                                                |
| `npm run check:phase9`     | States, motion, RTL and i18n                                  |
| `npm run check:journey`    | Checkout and order rules                                      |
| `npm run check:signin`     | Every demo account signs in                                   |
| `scripts/login.sh <phone>` | Sign an account in and print a cookie jar, for curl           |

Every `check:*` script needs `npm run dev` running — they drive the real server
actions over HTTP, and the action ids come from the **dev** build's manifest. They
also restore whatever they change, so the seeded demo moments survive repeated runs.

## Troubleshooting

### "A tree hydrated but some attributes… didn't match" with `bis_skin_checked`

Bitdefender's browser extension (Anti-tracker / Online Threat Prevention) writes
`bis_skin_checked`, `bis_register` and `__processed_<uuid>__` into the DOM before
React hydrates. Every diff line in the warning is one of those attributes with a `-`
prefix — present on the client, absent from the server HTML — which is the signature
of something injected after delivery. Confirmed: the string appears nowhere in this
repository or in `node_modules`, and the server response contains 165 `<div>`s and
zero occurrences.

It is console noise, not breakage: React keeps the DOM node and the page works. It
will not appear on a machine without the extension.

To silence it while developing, do one of:

- Add `localhost` to Bitdefender's exceptions (Protection → Online Threat Prevention
  → Settings → Manage exceptions → `http://localhost:3005`).
- Use a browser profile with no extensions — which the demo checklist already calls
  for, so the client never sees this.
- Open the app in a private window with extensions disabled.

`<body>` carries `suppressHydrationWarning` for the two attributes the extension puts
there. The ones on inner `<div>`s cannot be suppressed without putting
`suppressHydrationWarning` on every element in the tree — which would also hide
genuine mismatches in our own markup, and is not worth trading away.

## Build progress

| Phase | Scope                                    | Status  |
| ----- | ---------------------------------------- | ------- |
| 0     | Project memory (`CLAUDE.md`)             | ✅ done |
| 1     | Scaffold, i18n/RTL base, Docker Postgres | ✅ done |
| 2     | Design system + component library        | ✅ done |
| 3     | Schema, queries, auth, notify            | ✅ done |
| 4     | Seeded world                             | ✅ done |
| 5     | Customer storefront                      | ✅ done |
| 6     | Shop dashboard                           | ✅ done |
| 7     | Admin                                    | ✅ done |
| 8     | Demo apparatus                           | ✅ done |
| 9     | Polish + audits                          | ✅ done |
| 10    | Rehearsal (no code)                      | —       |

### Deliberate omissions

**Payouts.** PRD §9.1 lists "Payouts: read-only seeded table", but §2 names
"commission accounting, payouts, or reconciliation" a non-goal and open question
§17.2 leaves the revenue model — the thing a payout ledger would settle — explicitly
undecided. The build follows the non-goal: the revenue screen reports promotion
income (the one revenue stream the PRD does commit to) and no payout table is
seeded, rather than inventing per-shop payout figures the model doesn't support.
