# VeganAlts

**Community-ranked vegan alternatives.**

VeganAlts helps people find vegan products that come closest to the foods they already know, ranked by the experience of people who have tried them.

## Status and scope

[Milestones 1–3](https://github.com/Chaseos/VeganAlts/milestones?state=closed) are implemented on [staging](https://staging.veganalts.com): discovery and ranking, sign-in and ratings, community submissions, retailers, reporting, formula history and manual moderation. [Milestone 4: Trust, Lifecycle & Discovery](https://github.com/Chaseos/VeganAlts/milestone/4) is in progress: comments, canonical photo slots, Clef-assisted moderation and community confirmation, category proposals, Top / Trending / New and launch hardening. The public production website retains its coming-soon page at [veganalts.com](https://veganalts.com).

The staging catalog contains explicitly labeled fictional development products, illustrations and sample ratings. See the [milestone 4 specification](docs/MILESTONE_4_PLAN.md), the [milestone 3 verification record](docs/verification/milestone-3.md) and the [community catalog runbook](docs/operations/community-catalog.md). Earlier specifications and verification records remain under `docs/`.

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

Generate a local session secret with `node -e 'console.log(require("node:crypto").randomBytes(48).toString("base64url"))'` and put it in `.dev.vars`. Provider credentials are needed only to exercise actual sign-in. Public catalog loaders do not read sessions or require credentials. Local bindings are simulated; local tests never contact production resources.

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
server/catalog/            Bounded public catalog, FTS5 and aggregate queries
server/ranking/            Pure ranking policy and aggregate reader
server/ratings/            Rating/Tried writes, private state and cursor history
server/media/              Upload/recovery services and Images/R2/D1 adapters
server/abuse/              Environment limits and server Turnstile verification
server/observability/      Allowlisted events and safe dependency diagnostics
server/shared/             Errors, bounded request parsing, response policy
workers/                   Request handling, cache, schedules, platform composition
db/schema/                 Auth-owned and application-owned schemas
db/migrations/             One ordered append-only migration history
db/seed/                   Deterministic development catalog and source links
scripts/                   Migration-adjacent development/operations commands
tests/                     Domain, persistence, browser, and image fixtures
```

Thin handlers call application services, which depend on domain policies and repository interfaces. Domain calculations do not import React, Cloudflare bindings, authentication APIs, or SQL. Raw ratings remain canonical; aggregate rows are rebuildable. Anonymous HTML is shared and independent of cookies. Account/admin/write responses are private and never cached.

Public pages render useful SSR content with system fonts, a shared stylesheet and standard React Router hydration with route splitting. Personal state loads privately after hydration. The dedicated public Worker entrypoint provides shared caching; the gateway delivers fresh CSP nonces. Native forms keep account and admin workflows usable without hydration.

## Documentation

| Document                                                              | Purpose                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Product Master](docs/PRODUCT_MASTER.md)                              | Product intent and behavior                                         |
| [Architecture](docs/ARCHITECTURE.md)                                  | Boundaries, request flows, and caching                              |
| [Tech Stack](docs/TECH_STACK.md)                                      | Technology choices and upgrade triggers                             |
| [Database Baseline](docs/DATABASE_BASELINE.md)                        | Relational model and invariants                                     |
| [Ranking](docs/RANKING.md)                                            | Ranking semantics and derived data                                  |
| [Moderation](docs/MODERATION.md)                                      | Contribution, trust, and moderation rules                           |
| [API](docs/API.md)                                                    | API conventions and future client compatibility                     |
| [Milestone 1](docs/MILESTONE_1_PLAN.md)                               | Historical foundation scope                                         |
| [Milestone 2](docs/MILESTONE_2_PLAN.md)                               | Core ranking scope and acceptance checklist                         |
| [Milestone 3](docs/MILESTONE_3_PLAN.md)                               | Community catalog and moderation scope                              |
| [Milestone 4](docs/MILESTONE_4_PLAN.md)                               | Trust, lifecycle and discovery scope                                |
| [Operations](docs/operations/deployment.md)                           | Environments, migrations, secrets, deployment, rollback, and costs  |
| [Core ranking operations](docs/operations/core-ranking.md)            | Caching, analytics, abuse controls, diagnostics and resource checks |
| [Milestone 2 verification](docs/verification/milestone-2.md)          | Staging evidence against issues #7–#12                              |
| [Milestone 1 verification](docs/operations/milestone-one-evidence.md) | Historical foundation evidence                                      |
| [Reference SQL](db/0001_app_baseline.sql)                             | Original design reference, not an executable migration              |

Read [AGENTS.md](AGENTS.md) before changing architecture or product rules. Commit, push, and pull-request creation each require explicit authorization.
