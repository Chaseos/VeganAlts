# VeganAlts

**Community-ranked vegan alternatives.**

VeganAlts helps people find vegan products that come closest to the foods they already know, ranked by the experience of people who have tried them.

## Status and scope

[Milestone 1: Foundation & Data Model](https://github.com/Chaseos/VeganAlts/milestone/1) covers issues #1–#6: the application foundation, database, development catalog, authentication/profiles, ranking services, and admin image ingestion. The public website is a coming-soon page at [veganalts.com](https://veganalts.com).

Public search, category rankings, product pages, rating controls, and My Ratings belong to milestone 2. The older “core ranking loop” milestone description has been superseded by this split. See the [milestone scope](docs/MILESTONE_1_PLAN.md) and [verification record](docs/operations/milestone-one-evidence.md) for completed checks and remaining gates.

## Development

`develop` is the default integration branch. Start feature branches from it and target pull requests at `develop`. Retain `main` for production release history; deployments remain explicit operations.

Use Node 24 LTS (`.nvmrc`) and npm. Commit the lockfile when dependencies change.

```sh
nvm use
npm ci
cp .env.example .dev.vars
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Generate a local session secret with `node -e 'console.log(require("node:crypto").randomBytes(48).toString("base64url"))'` and put it in `.dev.vars`. Provider credentials are needed only to exercise actual sign-in. The public landing page does not read sessions or require credentials. Local bindings are simulated; local tests never contact production resources.

```sh
npm run check                 # strict types, unit/integration tests, Worker build
npm run test:e2e              # Chromium desktop/mobile and accessibility checks
npm run db:reset:local -- --confirm-local-reset
npm run rankings:rebuild:local
```

Install the browser used by the end-to-end tests with `npx playwright install chromium` if it is missing. Reset deletes only the local D1 state and recreates the development catalog; it does not reset staging or production.

## Architecture

React Router v8, React, strict TypeScript, and Vite run as one Cloudflare Worker. D1 holds relational records through Drizzle/repositories; R2 holds media bytes. Better Auth owns its generated authentication schema. Cloudflare Images transforms accepted uploads once; subsequent reads serve stored WebP derivatives.

```text
app/                       Route handlers, SSR screens, shared styles
server/auth/               Session boundary and Better Auth adapter
server/profiles/           Handle policies, profile service, repository
server/ranking/            Pure ranking policy and aggregate reader
server/ratings/            Internal rating/Tried services and atomic D1 adapter
server/media/              Upload/recovery services and Images/R2/D1 adapters
server/shared/             Errors, bounded request parsing, response policy
workers/                   Request handling, cache, schedules, platform composition
db/schema/                 Auth-owned and application-owned schemas
db/migrations/             One ordered append-only migration history
db/seed/                   Deterministic development catalog and source links
scripts/                   Migration-adjacent development/operations commands
tests/                     Domain, persistence, browser, and image fixtures
```

Thin handlers call application services, which depend on domain policies and repository interfaces. Domain calculations do not import React, Cloudflare bindings, authentication APIs, or SQL. Raw ratings remain canonical; aggregate rows are rebuildable. Anonymous HTML is shared and independent of cookies. Account/admin/write responses are private and never cached.

The landing page uses system fonts, a small stylesheet, and no application JavaScript. Native forms keep the initial account and admin workflows usable without hydration.

## Documentation

| Document                                                         | Purpose                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Product Master](docs/PRODUCT_MASTER.md)                         | Product intent and behavior                                        |
| [Architecture](docs/ARCHITECTURE.md)                             | Boundaries, request flows, and caching                             |
| [Tech Stack](docs/TECH_STACK.md)                                 | Technology choices and upgrade triggers                            |
| [Database Baseline](docs/DATABASE_BASELINE.md)                   | Relational model and invariants                                    |
| [Ranking](docs/RANKING.md)                                       | Ranking semantics and derived data                                 |
| [Moderation](docs/MODERATION.md)                                 | Contribution, trust, and moderation rules                          |
| [API](docs/API.md)                                               | API conventions and future client compatibility                    |
| [Milestone 1](docs/MILESTONE_1_PLAN.md)                          | Current scope and completion gates                                 |
| [Operations](docs/operations/deployment.md)                      | Environments, migrations, secrets, deployment, rollback, and costs |
| [Verification record](docs/operations/milestone-one-evidence.md) | Evidence and outstanding acceptance criteria                       |
| [Reference SQL](db/0001_app_baseline.sql)                        | Original design reference, not an executable migration             |

Read [AGENTS.md](AGENTS.md) before changing architecture or product rules. Commit, push, and pull-request creation each require explicit authorization.
