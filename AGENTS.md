# AGENTS.md

This repository is expected to be developed substantially with AI coding agents. This file defines the rules agents must follow before changing architecture, schema, ranking behavior, moderation behavior, or infrastructure.

## Read first

Before substantial implementation work, read:

1. `docs/PRODUCT_MASTER.md` — product intent and behavior.
2. `docs/ARCHITECTURE.md` — system boundaries and request flows.
3. `docs/DATABASE_BASELINE.md` — relational model and invariants.
4. `docs/RANKING.md` — ranking semantics and derived data.
5. `docs/MODERATION.md` — contribution and trust rules.
6. `docs/API.md` — API conventions.
7. `docs/MILESTONE_2_PLAN.md` — current implementation scope.
8. `docs/MILESTONE_1_PLAN.md` — completed foundation scope/context when needed.

If these documents conflict, do not guess. Preserve existing behavior and surface the conflict for an explicit documentation decision.

## Architectural constraints

- Keep VeganAlts a **modular monolith**. Do not introduce microservices merely to create separation of concerns.
- Keep domain logic independent of React/UI code.
- Keep route handlers thin: route/action → service/domain logic → repository/data access.
- Public ranking and product pages should normally be shared-cacheable. Do not authenticate anonymous page reads.
- Do not query all raw ratings to render leaderboards. Read rebuildable aggregate data.
- Raw ratings remain canonical and must never be discarded solely because an aggregate exists.
- A rating is scoped to a user, product formula version, and replacement category.
- Material formula changes preserve the same product identity and create historical versions.
- Never let contributor/moderator reputation increase the weight of that user's similarity rating.
- Store image bytes in R2, not D1.
- Treat retailer data as "commonly found at," not live inventory.
- Derived scores and statistics must be reproducible from canonical records.

## Scope discipline

Implement the current milestone. Do not opportunistically add future-scope features such as:

- native apps;
- recipes;
- restaurant-menu rankings;
- influencer/creator collections;
- social feeds or follows;
- live retailer inventory;
- advanced recommendation AI;
- microservices;
- external search infrastructure while D1 FTS5 is sufficient.

Future-ready schema abstractions are allowed only when they materially avoid a known migration problem and do not complicate current behavior.

## Database rules

- Use D1/SQLite-compatible migrations.
- Prefer explicit foreign keys, unique constraints, and indexes over application-only assumptions.
- Migrations are append-only once applied to a shared environment. Never silently rewrite an applied migration.
- Better Auth owns its auth tables; application migrations should not manually duplicate them unless the auth strategy is intentionally revised.
- Formula/version history and revision/audit history are durable product requirements.

## Ranking rules

- Overall similarity is the primary ranking signal.
- Detailed dimensions explain similarity; they do not replace the explicit overall similarity rating.
- Top ranking must account for sample size rather than sorting raw averages alone.
- Top, Trending, and New are separate concepts.
- Brands, sponsorships, advertising, moderation status, contributor trust, and payment must never directly increase organic ranking score.

## Public performance rules

- Prefer CDN/shared cache for anonymous public output.
- Category/product pages may be several minutes stale; do not build real-time infrastructure without a demonstrated need.
- A contribution write may update canonical/aggregate data without forcing an immediate full-page rebuild.
- Avoid expensive work on normal page views when it can be precomputed, cached, queued, or performed on write.

## Images

Default upload model:

1. validate upload;
2. temporarily retain original only as needed for successful processing;
3. normalize/transform once;
4. store optimized full-size and thumbnail variants in R2;
5. retain higher readability for ingredient/nutrition evidence;
6. store only metadata and R2 object keys in D1.

Do not add unlimited social-gallery-style uploads to product pages.

## Code quality

- TypeScript should use strict typing.
- Avoid `any` unless an integration boundary genuinely requires it and it is documented.
- Add unit tests for ranking/domain logic and integration tests for persistence behavior.
- Add Playwright coverage for critical end-to-end flows as they are implemented.
- Prefer clear names and small modules over clever abstractions.
- Comment decisions and non-obvious invariants, not line-by-line mechanics.

## Changing a locked decision

If implementation pressure suggests changing a locked product or architecture rule:

1. identify the conflicting source-of-truth section;
2. explain why the existing decision is no longer appropriate;
3. propose the smallest revision;
4. update the relevant documentation intentionally;
5. then change code/schema.

Do not let implementation silently become the new specification.
