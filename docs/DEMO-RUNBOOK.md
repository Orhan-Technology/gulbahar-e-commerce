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

**Two-minute PDP beat — the depth question.** Do this if anyone asks "is there
anything behind the pretty pages", or before the dashboard leg if the room is
technical.

| Do this                                                                     | Say this                                                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Open **آیفون ۱۳ ۱۲۸ گیگابایت** and scroll slowly to the specifications      | "Watch the buy box. It follows you down and condenses — the price and the button never leave, which is where carts are won." |
| Point at **مشخصات**, then at **مقایسه با محصولات مشابه**                    | "Real specifications, in both languages, on every one of seventy-five products. And because every shop describes a phone with the same keys, the platform can line four of them up and highlight what differs." |
| Scroll to **پرسش و پاسخ** and read the answered question                    | "Customers ask, the shop answers, and the answer is public with the shop's name on it."                               |
| **⌘⇧D → Roles → عبدالله احمدی**, ask a question on a **الکترونیک کابل** product | "So — I am a customer, and I want to know something before I buy."                                                    |
| **⌘⇧D → Roles → the electronics shopkeeper**, `/fa/dashboard`               | "And it is already in their queue, above the stock warnings, with the answer box open."                               |
| Answer it there, then reload the product page                               | "Answered from the queue, live on the page. That loop is the whole product in one minute."                            |

**If asked about the sponsored card:** "A paid placement buys position among
RELEVANT products, never an appearance among irrelevant ones. There is a
promoted watch in this demo — you will find it beside jewellery, and never on
the school-shoes page."

### 2 · Shop dashboard — 4 minutes

Move to the 390px window for this segment.

| Do this                                            | Say this                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **⌘⇧D → Roles → بلال پوپل** (الکترونیک کابل)       | "Same browser, no logout. This is the shopkeeper's view — designed for a phone behind the counter, because that is where it will be used." |
| Point at the action queue                          | "Two questions answered in three seconds: did I make money, and what needs me now."                                                        |
| **⌘⇧D → Scenarios → new order** for الکترونیک کابل | "An order just came in." — it appears without a reload                                                                                     |
| Press **تایید سفارش** on the queue row itself      | "One tap, without leaving this screen — a shopkeeper with a customer at the counter should not have to open the order to say yes. Now watch the log." |
| Open the notification log                          | "The customer's SMS, in Dari, sent the moment he accepted. The customer's tracking screen has already moved."                              |
| `محصولات` → tap a stock number, change it          | "Stock is the number that costs a shopkeeper money when it is stale, so it is editable in place."                                          |
| `تبلیغات` → Offers tab → create a 20% offer        | "A discount the shop funds itself. It goes live immediately — no approval, because it is their margin."                                    |
| Featured tab → book a slot                         | "This is different: this is visibility bought from you. It needs your approval, and the total is shown before they commit."                |

**Talking point:** a tenant can run their whole shop from the phone in their pocket —
that is what makes adoption realistic.

**Reserve & collect — 90 seconds.** The beat that separates this from a delivery
marketplace. Do it on the phone window, still as بلال پوپل.

| Do this                                                        | Say this                                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `سفارش‌ها` → open **GC-25142**                                 | "This customer did not want delivery. They reserved it and are coming to unit ۲۱۴ to collect."                                                        |
| Point at the code field on the row                             | "When they walk up they read out five characters. He types them in — he does not press a button that says 'done', because then nobody checks anything." |
| **⌘⇧D → Roles → عبدالله احمدی**, open `/fa/account/orders/GC-25142` | "And this is what the customer is holding. The code, the floor, the unit, the mall's hours, and when the hold runs out."                          |
| Back to the shopkeeper, type the code, press **تحویل بده**     | "Matched. Collected."                                                                                                                                 |
| Return to `/fa/dashboard` and point at the amber panel          | "And this is the other half: a reservation nobody came for. Releasing it puts the stock back on the shelf and tells the customer. His phone number is on the row, because ringing first is the better move." |

**Talking point:** "Delivery is the hard half of e-commerce in Kabul. This is the half
you already have — a building people are walking through anyway."

**Reports that say what to fix — 60 seconds.** Only if the room is a shopkeeper or a
sceptic about whether any of this is useful after launch week.

| Do this                                             | Say this                                                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `گزارش‌ها` → **بازدید بدون فروش**                   | "Not 'here is your revenue'. These are products people opened and did not buy — the hard part already happened."                     |
| Point at the last column                            | "And what to try first. Photos before price, always: price is the only one that costs him money."                                     |
| **سرعت پاسخ**                                       | "This is the one he cannot work out alone. His median time to accept, against the rest of the mall — anonymised, and the mall's line excludes him so it is a fair comparison." |
| **خروجی CSV**                                       | "And any of it opens in Excel, in Dari, with the numbers still summable."                                                            |

### 3 · Admin — 4 minutes

Back to the desktop window.

| Do this                                                     | Say this                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **⌘⇧D → Roles → مدیریت گلبهار**                             | "Now your side."                                                                                                                                                                                                       |
| `/fa/admin` — point at the four queues                      | "What needs a decision, before any charts."                                                                                                                                                                            |
| `دکان‌ها` → pending → open **خشکبار و شیرینی کابل**         | "This shop registered and has already built six products with photos while invisible. You are approving a real shop, not a form."                                                                                      |
| Press **تایید دکان**, then open its public page             | "Live. One switch."                                                                                                                                                                                                    |
| `تبلیغات` → approve the request from لوازم خانه سلام        | "Their booking, your decision. They are told either way — and if you reject, they are told why."                                                                                                                       |
| `درآمد` — pause here                                        | "**؋ ۲۳۸٬۵۰۰ this month**, ؋ ۱٬۲۰۲٬۰۰۰ to date. This is your income, not the shops' sales. Occupancy is at 50% — nine of eighteen places sold." |
| Scroll: twelve-month trend, then the slot inventory          | "A year of it, growing. And this table is what you have left to sell — the vacant row is revenue on the floor. Every figure is the price snapshotted when they booked, so changing your rate card never rewrites history." |
| `گزارش‌ها` briefly                                          | "And the marketplace view — GMV, order volume, which categories move."                                                                                                                                                 |
| `تنظیمات` → **کرایه تحویل** 150 → 200, save, then open the storefront in the other tab | "Your mall, your numbers. The footer, the cart and what an order is actually charged all read this one row — nobody edits code to change a delivery fee." (Set it back to 150 before the next rehearsal.) |

**Talking point — the one to land:** "Every shop you sign up is a customer for this
page. The mall already sells physical advertising space; this is the same business with
better reporting."

**The mall modules — 3 minutes.** These are the screens no generic marketplace admin
has. If time is short, do floors and the calendar and skip the rest.

| Do this                                                     | Say this                                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `منزل‌ها`                                                    | "Your building. Three floors, every unit, who is in it, what each floor earned in thirty days."                                                                  |
| Point at a dashed unit                                      | "And the gaps. Those are unit numbers between your tenants that nobody holds — we do not have your lease list, so we do not pretend to; this is what the data actually supports." |
| Tap a unit number and change it                             | "Units are assigned here, by you. A shop cannot move itself on the map."                                                                                        |
| `تبلیغات` → **تقویم جایگاه‌ها**                              | "This is the one to look at. Every placement surface, every day of the month. The blue is sold. **The white is what you have not asked anyone to buy yet.**"    |
| Step to next month                                          | "And forward — that is your pipeline, in a month you can still sell."                                                                                            |
| `دکان‌ها` → **نیاز به توجه**                                 | "Tenants worth a phone call: slow to accept, turning orders away, rating sliding, shelf empty, paperwork lapsed. Each one with the evidence beside it, so the call is a fact and not an accusation. And the only button is 'tell them'." |
| `تصفیه حساب`                                                 | "You will ask how shops get paid. They are paid directly — cash or HesabPay, and you are not in the payment path. This screen shows the shape a settlement run would have when you want one. There are no numbers on it on purpose." |
| `سابقه تصامیم`                                               | "And every decision anyone made in this console, with who and why. The day you have two staff, this is the screen you will care about most."                     |

**Verification — 90 seconds.** Best done straight after approving the pending shop.

| Do this                                              | Say this                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `تأیید هویت` → open the waiting submission           | "A shop has sent its licence and the owner's tazkira. These are identity documents, so they are not in the public folder and they are not in any link — they stream through a route that checks who is asking." |
| Approve it, then open that shop's public page        | "And the tick appears. It is not a rating — tap it."                                                                                          |
| Tap the badge, read the popover                      | "It says exactly one thing: mall management has confirmed this is a registered business at this unit. Only a landlord can say that, which is why it is worth something." |

### 4 · Close — 3 minutes

| Do this                                                                          | Say this                                                                                                                                 |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **⌘⇧D → Roles → عبدالله احمدی**, open `/fa/account/orders/GC-24788`              | "Back to the customer. This order is still waiting on the shop."                                                                         |
| Keep the tracking page visible. **⌘⇧D → Orders → GC-24788 → step forward** twice | "The shop accepts, then marks it ready. The customer's timeline moves as it happens."                                                    |
| Open the notification log                                                        | "And every message that went out, in the language each person reads. Dari here, English for a customer who prefers it — same templates." |
| Switch to `/en` from the header                                                  | "The whole thing in English, left to right, same data."                                                                                  |

**Two-minute optional beat — "is this a real platform?"** Worth doing if the room is
technical, or if anyone asks how people sign in. It answers both in one pass.

| Do this                                                                     | Say this                                                                                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/fa/account` → **امنیت و ورود** → **افزودن ایمیل**, enter any address       | "The phone number IS the account here — it registers you, it recovers you. Email is an extra way in, never a second identity." |
| Open the notification log, read the six-digit code, enter it                 | "Same channel as the sign-in code. Today it renders in this panel; behind it is where an Afghan SMS gateway drops in."         |
| **تنظیم رمز عبور**, set one, watch "به‌روزرسانی‌شده در …" appear             | "Stored hashed with argon2 — the password itself is never written anywhere, not to the database, not to that log."             |
| Sign out from the bottom of the account page                                | "And out."                                                                                                                    |
| Sign in again on the **ایمیل** tab with the email and password              | "Same account, same eleven orders, same history. Two doors, one person."                                                       |
| Optional: try the same email with a wrong password                          | "And a wrong password and an unknown email give the identical message — nothing here tells an attacker which one they got right." |

**Ninety seconds if the room is quiet — the mall as a place.**

| Do this                                                       | Say this                                                                                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/fa/floors`                                                  | "Somebody who is already in the building, or about to drive over. Which floor sells shoes, and is the shop open right now."          |
| Filter by a category                                          | "Filtering dims — it never removes. A map that changes shape when you filter it stops being a map."                                  |
| Tap a unit → the shop page → `درباره`                         | "And the same plan on the shop's own page, with their unit lit up and the neighbours still visible."                                 |
| `نظرات` on the same shop                                      | "These are about the SERVICE — the phone, the wait, the packing — not about a product. Only a customer whose order that shop actually fulfilled can write one." |
| The bell in the header                                        | "And whatever you saw in the notification log, the person it was addressed to sees here, with a link straight to the thing it is about." |

**Closing line:** "Nothing here talks to an external service. It runs on this laptop.
That is deliberate — it means what you have seen is what exists."

---

## Seeded facts worth knowing on stage

| Thing                            | Value                                                       |
| -------------------------------- | ----------------------------------------------------------- |
| Pending shop                     | خشکبار و شیرینی کابل — floor 1, unit ۱۴۱, 6 draft products  |
| Live hero placement              | الکترونیک کابل, ؋ ۹۶٬۰۰۰                                    |
| Campaign awaiting approval       | لوازم خانه سلام — بالای فهرست دکان‌ها, ؋ ۱۴٬۰۰۰             |
| Placement revenue                | ؋ ۲۳۸٬۵۰۰ this month · ؋ ۱٬۲۰۲٬۰۰۰ across 12 months          |
| Orders                           | 221 over 90 days · 10 awaiting acceptance                   |
| Reported reviews                 | 2, in the admin moderation queue                            |
| Demo customer                    | عبدالله احمدی · `0700000003` · Dari · 11 orders             |
| Their order for the closing beat | **GC-24788** — the one still `placed`, stable across resets |
| Demo shopkeeper                  | بلال پوپل · `0700000002` · owner of الکترونیک کابل          |
| Admin                            | مدیریت گلبهار · `0700000001`                                |
| Reserve & collect, live hold     | **GC-25142** — demo customer, الکترونیک کابل, code on screen |
| Reserve & collect, expired hold  | **GC-25025** — same shop, past its window, releasable        |
| Verification waiting             | مرکز موبایل — documents submitted, undecided                 |
| Verification rejected            | آرایشی بهار — illegible licence, with the reason on file     |
| Audit entries                    | 32, every one derived from a decision the seed actually made |
| Vacant units                     | 73 gaps in `/admin/floors`, 65 on the public map — derived from real numbering, never a fixed list |

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

| Symptom                              | Fix                                                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hydration warnings in the console    | Bitdefender writing `bis_skin_checked` into the DOM — not this app. Present the demo in a clean browser profile (checklist item 9) and they disappear. See the README troubleshooting section. |
| A screen errors                      | Every route group has a friendly error page with a retry — press it. It re-renders the segment without losing your place.                                                                      |
| Data looks wrong                     | **⌘⇧D → Scenarios → Reset data** (double confirm). It signs you out, because the users table is rebuilt; sign back in via the log.                                                             |
| The pending shop is already approved | `npm run check:phase7` restores it.                                                                                                                                                            |
| The campaign request is gone         | `npm run check:phase7b` restores it.                                                                                                                                                           |
| No orders left awaiting acceptance   | **⌘⇧D → Scenarios → new order**, as many times as needed.                                                                                                                                      |
| The notification log is empty        | Expected right after a reset of the log only; trigger any action and it repopulates. `npm run db:reset` restores the seeded 23.                                                                |
| Postgres died                        | `docker compose up -d` and wait for `pg_isready`. The app recovers on its own — the pool closes idle sockets, so it reconnects without restarting `npm run dev`.                               |

---

## What changed in the D-series (dashboard, listing and directory)

**Shop dashboard.** Leads with the action centre instead of four numbers: the
queue is the hero, and accept / mark-ready happen on the row with a five-second
undo window that sits *before* the commit, so undo means nothing was ever sent.
Unanswered reviews joined the queue and deep-link with the reply box open. Below
it, four KPIs — today's sales, orders this week, product views this week, shop
rating — each a link that lands pre-filtered, then a 30-day line chart and the
week's best sellers ranked by units. Bottom tabs are Dashboard / Orders (badged
with the count awaiting acceptance) / Products / More.

**Admin overview.** Same two-question shape: what needs a decision, then what
the platform earns. One action centre across four tables — pending shops,
requested placements, reported reviews and orders stalled past 48 hours — with
approve and reject on the row for the first two. Promotion income for the
calendar month is a headline on solid blue with slot occupancy and the top three
placements; platform health (orders/day, active shops, new customers, GMV chart,
top-five shops) sits underneath.

**Listing system.** Category pages, search results, offers and a shop's own
catalogue are now one component: sticky toolbar with the result count and sort
(popularity by default, relevance once a term narrows it), facets in a desktop
rail or a mobile bottom sheet, removable applied-filter chips above the grid,
and load-more that appends while keeping the URL pageable. Every filter state is
a URL.

**Shop directory.** A listing in its own right — shop count as the subtitle,
snap-scrolling category chips, and a featured strip of shops holding a live
directory placement above the organic grid. Shop cards carry a floor/unit badge
and lift on hover.

Demo notes: the queue on both panels shows all of its row types at seed time,
and the directory's featured strip has two live placements with one slot still
unsold — which is the number the admin revenue view is showing.

---

## What changed in the A-series (account hub, credentials, admin console)

**Two ways in, one identity.** The phone number is still the account: it
registers you, it is never editable, and it stays the recovery path and the OTP
target. Email and password are an optional second credential added from the
account area — an unverified email cannot sign in, and an account with no
password cannot either. A wrong password and an unknown email produce the
identical message, and the check compares them character for character.

**The account hub.** `/account` was a heading over three forms; it is now a
landing surface with a profile header, seven real routes, and a persistent
section nav on desktop. On a phone the hub IS the nav — every section is its own
URL, so it is linkable and survives the back button. The end column is the
per-field profile panel: name edits in place, the phone shows a lock and the
sentence explaining why, and any row with nothing in it shows the ACTION that
would fill it rather than an empty value.

**Reviews you wrote.** `/account/reviews` is entirely built from data that was
already there — the product page has shown these reviews to everyone else since
S5. The author can now edit or withdraw one, and the shop's reply travels with
it.

**Honest about what is not built.** Payment methods and the SMS/push toggles
render as visibly disabled surfaces that say what they will do and why they are
not here. Loyalty points, membership tiers and subscriptions were omitted
outright. If asked: "we would rather show you a smaller thing that is real."

**The mall's own settings.** `/admin/settings` edits the marketplace: name,
address, opening hours, support number, delivery fee, free-delivery threshold,
currency label, promotion slot pricing and which languages are published. These
are not a settings screen for their own sake — the storefront footer, the cart,
checkout and the support page all read the one row, and so does the fee an order
is actually charged. Editing the delivery fee live is the strongest two-line
demonstration on this surface that the platform is theirs.

**Users.** Role changes now require a written note, which is delivered to the
person it happened to as a notification, and every row carries an activity
summary (orders and reviews) so a promotion is an informed decision. An admin
cannot change their own role, and the last active admin cannot be demoted.

Demo notes: the danger zone on `/admin/settings` is absent unless `DEMO_MODE` is
true, and it asks you to type a word rather than press a second button — the
reset drops every table, takes minutes, and signs you out as a side effect.
`npm run check:account` verifies the whole set and puts back everything it
changes.

---

## What changed in the P-series (product page depth)

**Products that have something to say.** Every one of the seventy-five carries
specifications, three to five features, a brand and a real paragraph of
description, in Dari and English — 434 spec rows written as Kabul retail rather
than filler. Shopkeepers edit them with the category template pre-filled, so two
shops describe a phone with the same keys, which is what makes comparison
possible at all.

**A buy box that follows.** On desktop it sticks for the whole page and
condenses to thumbnail, price, quantity and button once the top scrolls past.
On a phone the price and the button still sit under the photograph, and the
bottom bar behaves as it always did. Reduced motion turns it into a plain static
column.

**Compare similar products.** Up to three others from the same category, nearest
in price, with the current product marked and every differing value tinted. It
renders only when at least two products share three specification keys — the JBL
speaker has one category peer, and the section is simply absent there.

**Questions and answers.** Customers ask on the product page; unanswered
questions land in the shopkeeper's action queue with the answer box open, above
the stock warnings. Answering publishes it publicly with the shop's badge. A
pending question is visible only to its author and the owning shop — a public
list of unanswered questions is a list of a shop's silences.

**Three rails instead of one.** More from this shop, similar products from other
shops, and the reader's own recently-viewed trail (from the browser, never the
database). A product appears in at most one of them, and a rail with fewer than
four items does not render.

Demo notes: the promoted watch now appears only where it is relevant — beside
jewellery, never on the school-shoes page — which is worth showing if anyone
asks how advertising is kept honest. `npm run check:product` verifies the whole
set (30 assertions) and puts back everything it changes.

---

## What changed in the C-series (consoles, mall modules, mall-native commerce)

The set that turned two admin panels into a landlord's console and added the two
things a delivery-only marketplace cannot do.

**Both consoles.** One shell, one date range in the URL, one page-header recipe. The
shop's identity is stated once in the chrome instead of three times above the fold, and
the admin's grid of links to its own sidebar is gone. Every metric now obeys the range,
and a value and its delta come from the same helper — which surfaced a real defect: the
admin's per-shop revenue column counted every order except rejections while the GMV tile
above it counted fulfilled only, so the column summed to more than the total it sat
under.

**Rating stars** are solid silhouettes in two tones. They were amber stars beside hollow
grey outlines, which reads as damage rather than as an unearned portion.

**The mall modules.** Floor occupancy with derived vacancies; a month-by-day calendar of
placement inventory whose empty cells are the point; shop health with the evidence on
each row; settlements designed and disabled with no invented numbers; and an audit log
every mutating admin action writes to.

**Shopkeeper reports** that say what to fix rather than how much was sold: products
people open and do not buy with a suggested fix, stock fixable in place, time-to-accept
against an anonymised mall median that excludes the viewing shop, and when orders
actually arrive. All four export to CSV that opens correctly in Excel in Dari.

**The shop page** is four shareable tabs with a story, a floor plan, live offers, and
service reviews earned by a fulfilled order. Shops can be followed.

**Reserve & collect** with a code the customer reads out at the counter, a hold window
from admin settings, stock taken off the shelf on acceptance and put back when a hold
expires. Plus a public floor map of all three floors.

**Notifications** are a real surface on all three roles, over the rows the app already
wrote. The bell used to filter to in-app messages while almost every order event is
written as SMS — so the demo log showed a customer their order being accepted while
their own bell showed nothing.

**Checks added:** `check:shop`, `check:admin`, `check:reports`, `check:collect`,
`check:notify`, plus new invariants in `check:design` (no abbreviated numbers in a
console, one h1 per console page, no physical direction utilities in the new markup).
