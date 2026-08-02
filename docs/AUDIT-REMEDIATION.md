# Audit remediation — what changed, what did not

Companion to the deep audit. Everything below was implemented and verified
against the running app; the closing section is the honest list of what was
deliberately left alone.

## Verification at time of writing

`typecheck` 0 errors · `lint` 0 · `npm run audit` clean · `check:messages` clean
(2924 keys, fa/en parity) · `check:product` 31/31 · `check:design` 61/61 ·
`check:shop` 27/27 · `check:account` 52/52 · `check:admin` 24/24 ·
`check:reports` 35/35 · `check:journey` pass.

## Not done, and why

- **Payments, refunds and settlements.** Still a `payment_method` enum. A real
  payment model has to be designed together with per-shop suborders (below), and
  the settlements screen's honest stub is a better placeholder than a fake ledger.
- **Per-shop suborders.** `orders.status` is still order-level, so on a
  multi-shop basket either shop's action advances the shared order. This is the
  keystone schema change for production and was too large to land safely
  alongside everything else.
- **Real product variants.** Variants remain display-only labels; there is still
  no per-variant SKU, stock or price.
- **Caching layer and keyset pagination.** Rendering is still fully dynamic with
  offset pagination. Correct, and the first thing to fall over under real load.
- **Catalogue photography.** Two mismatched photos were re-mapped (pressure
  cooker, TV) after validating candidates against a contact sheet. The cricket
  bat and the solar panel have no honest replacement in a key-free Unsplash
  fetch — every candidate was a stadium, a ball or a solar farm. This remains the
  hard blocker the audit named: it needs an API key or client photography, and
  substituting equally-wrong imagery would have been worse than leaving it.
- **`loading.tsx` sweep is partial.** The (shop) routes and five admin routes
  have one; most dashboard and admin list routes still do not. Anything added
  must follow the `(index)` route-group rule below.

## The trap worth knowing before continuing that sweep

A `loading.tsx` applies to its segment AND every segment nested under it, and a
streaming route has already committed HTTP 200 before the page body runs. A
`loading.tsx` at `products/` therefore turned every `products/[slug]` that calls
`notFound()` into a soft 404 — not-found body, 200 status. It was caught by
`check:product` reporting `a pending shop's product 404s ← 200`, and the same
bug had been live at `categories/` since phase 9 with nothing noticing.

Listing routes with a dynamic child keep their loading state in an `(index)`
route group (`products/(index)/loading.tsx`) — no URL change, boundary scoped to
the listing. Fixed for products, shops, categories and checkout.
