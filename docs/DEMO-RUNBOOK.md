# Demo runbook

Everything needed to drive the 15-minute client walkthrough (PRD §9.5) without a
login form or a terminal. Written against the seeded data, so the names, prices and
counts below are what will actually be on screen.

---

## Pre-demo checklist

Run through this once, ten minutes before. It takes about two.

| #   | Step                             | How to confirm                                                                        |
| --- | -------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Postgres is up                   | `docker compose up -d` — then `docker exec gulbahar-postgres pg_isready -U gulbahar`  |
| 2   | `DEMO_MODE=true` in `.env`       | The round log button appears bottom-trailing on `/fa`                                 |
| 3   | Data is at the seeded baseline   | `npm run db:reset` (~3s, deterministic)                                               |
| 4   | Dev server running               | `npm run dev`, then `/fa` returns the home page                                       |
| 5   | The pending shop exists          | `/fa/admin/shops?status=pending` shows **خشکبار و شیرینی کابل** with 6 draft products |
| 6   | The hero campaign is live        | `/fa` shows a «تبلیغ شده» badge on the hero (الکترونیک کابل)                          |
| 7   | The campaign request is waiting  | `/fa/admin/promotions` shows 1 request — لوازم خانه سلام, ؋ ۱۴٬۰۰۰                    |
| 8   | The action queue has work        | `/fa/dashboard` shows 10 orders awaiting acceptance                                   |
| 9   | Browser is ready                 | Dari (`/fa`), zoom 100%, a clean profile with no extensions, no other tabs            |
| 10  | Second window for the phone view | 390 × 844 for the shop dashboard segment                                              |

The seed is deterministic: every reset produces the same data, so the order and shop
references named in this document stay valid after resetting mid-demo.

If step 3 is skipped because a previous rehearsal left things changed, run
`npm run check:phase7 && npm run check:phase7b && npm run check:phase8` — each
restores the demo moments it uses, so they double as a repair.

**Do not** run `npm run build` while `npm run dev` is running; they share `.next`.

---

## Presenter cue card

Locale is `/fa` throughout. `⌘⇧D` / `Ctrl+Shift+D` opens the control panel.

### 1 · Storefront — 4 minutes

| Do this                                                      | Say this                                                                                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open `/fa`                                                   | "This is what a Kabul customer sees. Dari first, right to left — not a translated English site. The banner at the top is a paid placement; note the «تبلیغ شده» label. That label is deliberate." |
| Scroll: categories → featured shops → offers strip           | "Fourteen of your tenants, each with their own page. The featured carousel is inventory you sell."                                                                                                |
| Search «سامسونگ»                                             | "Search handles Dari spelling variants and Arabic-keyboard input, because that is how people actually type here."                                                                                 |
| Open **تلویزیون ال‌جی ۴۳ اینچ اسمارت** (؋ ۳۸٬۵۰۰ → ؋ ۳۴٬۹۰۰) | "Gallery, variants, the shop's floor and unit — a customer can find the physical shop from the page. Reviews are verified-purchase only: a review requires a real order line."                    |
| Add to cart, open cart, go to checkout                       | "Delivery or collect from the shop. Cash on delivery or HesabPay."                                                                                                                                |
| Choose HesabPay, complete the sheet                          | "The payment sheet is styled but not integrated — that is phase 2. Everything around it is real."                                                                                                 |
| **⌘⇧D → Roles → عبدالله احمدی** if not already signed in     | —                                                                                                                                                                                                 |
| Open the notification log (round button)                     | "Every SMS the system would send, in the recipient's own language. This is the OTP the customer just used to sign in, and their order confirmation."                                              |

**Talking point for the segment:** the customer never has to phone a shop to ask what
is in stock — that is the trust problem this solves.

### 2 · Shop dashboard — 4 minutes

Move to the 390px window for this segment.

| Do this                                            | Say this                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **⌘⇧D → Roles → بلال پوپل** (الکترونیک کابل)       | "Same browser, no logout. This is the shopkeeper's view — designed for a phone behind the counter, because that is where it will be used." |
| Point at the action queue                          | "Two questions answered in three seconds: did I make money, and what needs me now."                                                        |
| **⌘⇧D → Scenarios → new order** for الکترونیک کابل | "An order just came in." — it appears without a reload                                                                                     |
| Open the order, press **تایید سفارش**              | "One tap. Now watch the log."                                                                                                              |
| Open the notification log                          | "The customer's SMS, in Dari, sent the moment he accepted. The customer's tracking screen has already moved."                              |
| `محصولات` → tap a stock number, change it          | "Stock is the number that costs a shopkeeper money when it is stale, so it is editable in place."                                          |
| `تبلیغات` → Offers tab → create a 20% offer        | "A discount the shop funds itself. It goes live immediately — no approval, because it is their margin."                                    |
| Featured tab → book a slot                         | "This is different: this is visibility bought from you. It needs your approval, and the total is shown before they commit."                |

**Talking point:** a tenant can run their whole shop from the phone in their pocket —
that is what makes adoption realistic.

### 3 · Admin — 4 minutes

Back to the desktop window.

| Do this                                                     | Say this                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **⌘⇧D → Roles → مدیریت گلبهار**                             | "Now your side."                                                                                                                                                                                                       |
| `/fa/admin` — point at the four queues                      | "What needs a decision, before any charts."                                                                                                                                                                            |
| `دکان‌ها` → pending → open **خشکبار و شیرینی کابل**         | "This shop registered and has already built six products with photos while invisible. You are approving a real shop, not a form."                                                                                      |
| Press **تایید دکان**, then open its public page             | "Live. One switch."                                                                                                                                                                                                    |
| `تبلیغات` → approve the request from لوازم خانه سلام        | "Their booking, your decision. They are told either way — and if you reject, they are told why."                                                                                                                       |
| `درآمد` — pause here                                        | "**؋ ۳۶۹٬۵۰۰** from placement so far. This is your income, not the shops' sales. The bars are shaded by occupancy: the green one is sold out, which means it is underpriced. The empty ones tell you what to reprice." |
| Scroll: monthly trend, biggest spenders, running placements | "Seven tenants already paying. Every figure is the price snapshotted when they booked, so changing your rate card never rewrites history."                                                                             |
| `گزارش‌ها` briefly                                          | "And the marketplace view — GMV, order volume, which categories move."                                                                                                                                                 |

**Talking point — the one to land:** "Every shop you sign up is a customer for this
page. The mall already sells physical advertising space; this is the same business with
better reporting."

### 4 · Close — 3 minutes

| Do this                                                                          | Say this                                                                                                                                 |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **⌘⇧D → Roles → عبدالله احمدی**, open `/fa/account/orders/GC-24788`              | "Back to the customer. This order is still waiting on the shop."                                                                         |
| Keep the tracking page visible. **⌘⇧D → Orders → GC-24788 → step forward** twice | "The shop accepts, then marks it ready. The customer's timeline moves as it happens."                                                    |
| Open the notification log                                                        | "And every message that went out, in the language each person reads. Dari here, English for a customer who prefers it — same templates." |
| Switch to `/en` from the header                                                  | "The whole thing in English, left to right, same data."                                                                                  |

**Closing line:** "Nothing here talks to an external service. It runs on this laptop.
That is deliberate — it means what you have seen is what exists."

---

## Seeded facts worth knowing on stage

| Thing                            | Value                                                       |
| -------------------------------- | ----------------------------------------------------------- |
| Pending shop                     | خشکبار و شیرینی کابل — floor 1, unit ۱۴۱, 6 draft products  |
| Live hero placement              | الکترونیک کابل, ؋ ۹۶٬۰۰۰                                    |
| Campaign awaiting approval       | لوازم خانه سلام — بالای فهرست دکان‌ها, ؋ ۱۴٬۰۰۰             |
| Total placement revenue          | ؋ ۳۶۹٬۵۰۰ across 7 shops                                    |
| Orders                           | 220 over 90 days · 10 awaiting acceptance                   |
| Reported reviews                 | 2, in the admin moderation queue                            |
| Demo customer                    | عبدالله احمدی · `0700000003` · Dari · 11 orders             |
| Their order for the closing beat | **GC-24788** — the one still `placed`, stable across resets |
| Demo shopkeeper                  | بلال پوپل · `0700000002` · owner of الکترونیک کابل          |
| Admin                            | مدیریت گلبهار · `0700000001`                                |

---

## The five hardest questions

Honest answers, grounded in what the PRD actually commits to. Each names the phase-2
section so the answer is checkable rather than reassuring.

### 1 · "Who delivers, and who pays for it?"

**This is genuinely undecided and it is in the document as an open question (PRD §17.1).**
The demo shows delivery and collect-from-shop as choices, and a delivery fee on the
order — but who operates the courier is a business decision, not a technical one, and
it changes who marks an order delivered.

Three options, in order of how quickly they could start: each shop delivers its own
(works day one, inconsistent experience); the mall runs one courier for all tenants
(consistent, needs staff and a fee model); a third party (fastest to scale, least
control). The software supports all three — what changes is who presses "delivered"
and how the fee is set. **We should decide this before launch, not before the build.**

### 2 · "When is HesabPay real?"

The payment sheet you saw is styled and not connected (PRD §9.1, §15). Integrating it
is not a large piece of work — it is a payment API behind an interface that already
exists — but it is gated on things outside the code: a merchant agreement with
HesabPay, and a decision about who holds the money before it reaches a tenant.

Cash on delivery works without any of that, and honestly it is what most of your
customers will use at first. My suggestion is to launch on cash, add HesabPay once the
merchant account exists, and treat card payments as a later question.

### 3 · "Are those real product photos?"

No — the catalogue photography in the demo is generated to a consistent standard
(PRD §10.7), and that consistency is the point: thirty uniform photographs look better
than eighty inconsistent ones.

This is the single biggest piece of work between the demo and a real launch, and it is
not software work. Every tenant needs their products photographed on one background, at
one aspect ratio, in one light. **My recommendation is that the mall does this centrally
rather than asking each shop to.** If tenants shoot their own, the storefront will look
like a classifieds site within a month, and no amount of interface quality recovers
from that.

### 4 · "How much work is it for a shopkeeper to get started?"

Two paths, both in the demo. A tenant can register their own shop, and while waiting
for your approval they can add everything — products, prices, photos — invisibly. Or
your office creates the shop for them and they claim it by signing in with their phone
number (PRD §13.1).

For a shop with twenty products, expect an hour with the bulk-import template, or two
to three hours entering them by hand with photos. The realistic answer is that **most
tenants will need help with their first ten products**, and budgeting a person to sit
with them for an afternoon each is what determines whether this launches with fourteen
shops or four.

### 5 · "When can this go live?"

I will not give you a date from a demo, but I can tell you what stands between here and
there, roughly in order of size:

1. **Photography** — weeks of scheduling, not development (§10.7).
2. **Onboarding the real tenants** — see above.
3. **Hosting and a domain** — a phase-2 decision (§17.4); the demo is deliberately
   local-only.
4. **Real SMS** — an Afghan gateway behind the interface that already exists (§12.3).
   Small work, needs an account.
5. **Delivery operation** — see question 1.
6. **HesabPay** — see question 2.

What is genuinely finished is the software: three surfaces, both languages, the
permission model, the order lifecycle, the promotion revenue mechanism. What is not
finished is everything that involves people and paperwork — and that is normally the
longer half. **The honest framing is that the build is ahead of the operation, and the
next decisions are yours rather than mine.**

---

## If something goes wrong mid-demo

| Symptom                              | Fix                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| A screen errors                      | Every route group has a friendly error page with a retry — press it. It re-renders the segment without losing your place.            |
| Data looks wrong                     | **⌘⇧D → Scenarios → Reset data** (double confirm). It signs you out, because the users table is rebuilt; sign back in via the log.   |
| The pending shop is already approved | `npm run check:phase7` restores it.                                                                                                  |
| The campaign request is gone         | `npm run check:phase7b` restores it.                                                                                                 |
| No orders left awaiting acceptance   | **⌘⇧D → Scenarios → new order**, as many times as needed.                                                                            |
| The notification log is empty        | Expected right after a reset of the log only; trigger any action and it repopulates. `npm run db:reset` restores the seeded 23.      |
| Postgres died                        | `docker compose up -d`, wait for `pg_isready`, then restart `npm run dev` — the connection pool does not survive a database restart. |
