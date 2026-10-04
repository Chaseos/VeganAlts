# VeganAlts

**Community-ranked vegan alternatives.**

VeganAlts helps people find the vegan products that come closest to the non-vegan products they already know. Choose a reference product such as ground beef, mozzarella, butter, or chicken nuggets, then see country-specific alternatives ranked by the collective experience of people who have actually tried them.

> **The ranking is the product.**

## Status

VeganAlts is currently in **product definition / technical foundation**. Implementation has not started yet.

The first implementation milestone is intentionally narrow:

**discover category → view ranking → view product → sign in → rate similarity → aggregate ranking updates → cached public page refreshes**

## Planned stack

- TypeScript
- React + React Router v8 + Vite
- Cloudflare Workers
- Cloudflare D1 + Drizzle ORM
- Better Auth
- Cloudflare R2
- Cloudflare Images for one-time upload normalization
- D1 FTS5 for initial search
- Cloudflare Queues / Cron when background work is justified
- Turnstile + rate limiting
- Vitest + Playwright

See [TECH_STACK.md](docs/TECH_STACK.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the authoritative technical decisions.

## Source of truth

Product behavior is governed by the Product Master:

- [Product Master — Markdown](docs/PRODUCT_MASTER.md)
- [Product Master — formatted DOCX](docs/VeganAlts_Product_Master_v1.0.docx)

Technical implementation is governed by the documents below. If implementation and product intent conflict, stop and reconcile the documents rather than silently changing behavior in code.

## Technical documentation

| Document | Purpose |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | System topology, caching, request flows, modules, images, environments, observability and deployment rules |
| [Tech Stack](docs/TECH_STACK.md) | Locked technology choices, cost model, alternatives and upgrade triggers |
| [Database Baseline](docs/DATABASE_BASELINE.md) | Relational model, invariants, indexes and migration rules |
| [Ranking](docs/RANKING.md) | Similarity scoring, Bayesian ranking, version behavior, aggregates and Top / Trending / New |
| [Moderation](docs/MODERATION.md) | Product additions, edit proposals, confirmations, trust, reports and revision history |
| [API](docs/API.md) | /api/v1 conventions, authentication, caching, pagination and future native-client compatibility |
| [Milestone 1 Plan](docs/MILESTONE_1_PLAN.md) | Smallest complete public ranking and rating loop |
| [SQL Baseline](db/0001_app_baseline.sql) | Reference D1 application schema; Better Auth tables are generated separately |

## Core architectural rules

1. VeganAlts is a **modular monolith**, not a collection of microservices.
2. Public ranking/product pages should normally be served as **cached shared HTML**.
3. Anonymous public reads should **not require authentication**.
4. Raw ratings are canonical; leaderboard pages read **precomputed aggregate rows**, not every raw rating.
5. Ratings are specific to a **product formula version + replacement category**.
6. Material formula changes preserve history rather than creating duplicate public products.
7. Moderation trust never gives a user extra ranking weight.
8. Images live in R2; image bytes do not belong in D1.
9. Retailer data means **commonly found at**, not live stock.
10. Every derived ranking/statistic must be rebuildable from canonical data.

See [AGENTS.md](AGENTS.md) before making structural changes.

## Repository structure

The implementation is expected to grow toward:

```text
VeganAlts/
├── app/
│   ├── routes/
│   ├── components/
│   ├── features/
│   └── styles/
├── server/
│   ├── auth/
│   ├── db/
│   ├── ranking/
│   ├── search/
│   ├── images/
│   ├── moderation/
│   └── services/
├── db/
│   ├── schema/
│   ├── migrations/
│   └── seed/
├── workers/
├── tests/
├── docs/
├── AGENTS.md
└── wrangler.jsonc
```

Directories should be created as implementation actually begins rather than maintained as empty placeholders.

## Next step

Implement the foundation described in [Milestone 1](docs/MILESTONE_1_PLAN.md), beginning with the Cloudflare/React Router project skeleton and validating the D1 baseline in the real Cloudflare development environment.
