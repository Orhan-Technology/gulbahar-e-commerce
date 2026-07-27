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
