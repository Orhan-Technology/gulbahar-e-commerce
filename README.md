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
npm run db:push           # apply schema
npm run dev               # http://localhost:3005
```

The first `npm run dev` or `npm run build` downloads the Vazirmatn and Inter webfonts from Google
Fonts and self-hosts them under `.next/static/media`. After that first run everything — including
the demo — works fully offline, per PRD §1.3.

## Ports

This machine already had services on the conventional ports, so Gulbahar uses:

| Service  | Port   | Note                                       |
| -------- | ------ | ------------------------------------------ |
| Web app  | `3005` | 3000 is taken by another local project     |
| Postgres | `5435` | 5432/5433/5434 are taken by other Postgres |

Both are set in `.env` and `package.json`; change them together if you want different ones.

## Locales

| Path  | Language | Direction | Status                                    |
| ----- | -------- | --------- | ----------------------------------------- |
| `/fa` | Dari     | RTL       | Primary — the design default (PRD §10.3)  |
| `/en` | English  | LTR       | Secondary, verified                       |
| `/ps` | Pashto   | RTL       | Structure only; strings fall back to Dari |

`/` redirects to `/fa`.

## Styleguide

`/fa/styleguide` and `/en/styleguide` render the full design system: palette,
type scale, numerals, spacing, radii, elevation, every shadcn primitive, and all
12 custom components beside their skeletons. It is the visual regression
reference for the build — check it in Dari first (PRD §10.3).

## Scripts

| Command                 | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `npm run dev`           | Dev server on port 3005                             |
| `npm run build`         | Production build                                    |
| `npm run typecheck`     | `tsc --noEmit`                                      |
| `npm run lint`          | ESLint                                              |
| `npm run format`        | Prettier write                                      |
| `npm run db:push`       | Push Drizzle schema to Postgres                     |
| `npm run db:seed`       | Seed demo data (implemented in Phase 4)             |
| `npm run db:reset`      | Drop schema, re-push, re-seed                       |
| `npm run db:extensions` | Apply pg_trgm, unaccent and trigram indexes         |
| `npm run check:phase3`  | Data-layer acceptance checks (OTP, queries, search) |

## Build progress

| Phase | Scope                                    | Status  |
| ----- | ---------------------------------------- | ------- |
| 0     | Project memory (`CLAUDE.md`)             | ✅ done |
| 1     | Scaffold, i18n/RTL base, Docker Postgres | ✅ done |
| 2     | Design system + component library        | ✅ done |
| 3     | Schema, queries, auth, notify            | ✅ done |
| 4     | Seeded world                             | next    |
| 5     | Customer storefront                      | —       |
| 6     | Shop dashboard                           | —       |
| 7     | Admin                                    | —       |
| 8     | Demo apparatus                           | —       |
| 9     | Polish + audits                          | —       |
