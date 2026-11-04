# Deployment and recovery

## Environments

| Environment | Origin                        | D1                   | R2                         |
| ----------- | ----------------------------- | -------------------- | -------------------------- |
| Local       | http://127.0.0.1:5173         | Local simulation     | Local simulation           |
| Staging     | https://staging.veganalts.com | veganalts-staging    | veganalts-media-staging    |
| Production  | https://veganalts.com         | veganalts-production | veganalts-media-production |

Resource IDs and routes are in `wrangler.jsonc`. The account is `8340b60c3253a7302b19a878a095cfda`. Staging returns `X-Robots-Tag: noindex, nofollow` and shows a development banner. Local tests use isolated simulated resources; remote resources are an explicit operations choice.

Use Node 24 LTS and the committed npm lockfile. Wrangler authentication is required for remote operations. Do not put access tokens in commands, URLs, logs, screenshots, or repository files.

## Database ordering and seeds

`db/0001_app_baseline.sql` remains a design reference. Only `db/migrations/` is executable migration history, and it starts at version 1:

1. `0001_initial.sql` — the complete schema (Better Auth tables, catalog, ratings, community, moderation, taxonomy, per-country foods, search and their triggers), the `veganalts-system` account used for audited automatic decisions (it has no sign-in method) and the shared allergen list.

Before the first release, the owner folded the pre-release migrations (`0000`–`0020`) into this baseline (2026-10-10). Every database is created from it, never upgraded from the old history; the legacy upgrade preflights were removed with it. A database still carrying the old history is reset with `npm run db:reset:<env>` (below) and migrated again.

Check exact filenames in the directory before operating. Until the first release, fold schema changes into version 1 and reset affected databases as AGENTS.md requires; add no new migrations. After the first release, migrations are append-only: generate changes with `npm run db:generate`, inspect generated SQL, and add reviewed custom SQL for unsupported constructs. Better Auth schema generation uses `npm run auth:schema`; diff its output before creating any migration. Never run the reference baseline in addition to the migration history.

The owner approved one staging exception on 2026-10-20 for independent ratings: recreate only the empty `ratings` and `rating_dimension_values` tables in one atomic batch, with a guard that aborts if either has rows. Take a fresh Time Travel bookmark and table export, verify the live schema against the reviewed plan, restore related triggers/indexes and check foreign keys and unchanged catalog/account counts afterward. This exception was applied successfully; see [verification](../verification/independent-ratings.md). Other pre-release schema changes still use the full-reset rule.

```sh
npm run db:migrate:local
npm run db:seed:local
npm run db:migrate:staging
npm run db:seed:staging
npm run db:seed-images:staging
npx wrangler d1 execute DB --remote --config wrangler.jsonc --env staging --command 'PRAGMA foreign_key_check'
```

To recreate a remote database from version 1 (for example one still carrying the pre-release history), stop writers, then reset, migrate and seed it. The reset prints the database's current Time Travel bookmark before dropping every table, trigger and the migration ledger in one transaction; `npx wrangler d1 time-travel restore <database> --bookmark=<bookmark>` returns to it within the retention window. R2 objects are not touched. Never seed production with the demo catalog.

```sh
npm run db:reset:staging -- --confirm-reset=veganalts-staging
npm run db:migrate:staging
npm run db:seed:staging
npm run db:seed-images:staging
```

The approved milestone 2 seed uses deterministic IDs for 31 products, ten categories, 28 explicitly labeled demo tasters and sample contributions. Re-running it inserts missing fixtures and updates only approved development classification/notice fields and the old development formula label. It preserves real accounts/contributions, formula transitions and historical verification records, and rebuilds aggregates and FTS after seeding. Demo images use stable upload keys through the normal processing pipeline, so completed retries do not transform again. Every catalog record is development-only; images/formula history/sample ratings are illustrative, not verified manufacturer claims or organic community feedback. Never seed production. Product names/source references are in `db/seed/catalog.ts`; verify labels and market/formula data before promoting records into a public catalog.

Milestone 4 adds a taxonomy-only seed that is safe outside development: `npm run taxonomy:seed:<env>` inserts the reviewed categories, aliases and homepage features from `db/seed/taxonomy.ts` and leaves existing rows alone. Production additionally requires `-- --confirm-taxonomy-only`. After any seed or repair, `npm run rankings:rebuild:<env>` rebuilds aggregates, daily statistics and Trending.

To add one reviewed food without seeding other new foods, pass `--only-food=<slug>` (for example, `npm run taxonomy:seed:staging -- --only-food=beef-jerky`). This seeds only that food, its aliases, rating dimensions and launch-country availability, then refreshes search indexes. It leaves other taxonomy foods and homepage features untouched. Take a fresh Time Travel recovery bookmark before a staging seed.

Production migrations precede deployment of code requiring them:

```sh
npm run db:migrate:production
npm run deploy:production
```

Before every staging migration, first obtain a D1 Time Travel recovery bookmark/export and plan a compatible rollout. Worker rollback does not undo database migrations. Prefer additive schema changes and a forward repair migration to rewriting history.

## Secrets and providers

Local secrets go in ignored `.dev.vars`; `.dev.vars.staging` and `.dev.vars.production` can be used for local environment builds but are not the deployed secret store. Keep these files mode 0600. Apple signing-key backups are held in ignored `.secrets/` with directory mode 0700 and file mode 0600; `*.p8` files are also ignored. Use Wrangler secret input or a secret manager to populate deployed values separately:

```sh
npx wrangler secret put BETTER_AUTH_SECRET --config wrangler.jsonc --env staging
npx wrangler secret put GOOGLE_CLIENT_ID --config wrangler.jsonc --env staging
npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.jsonc --env staging
```

Repeat for the production environment with different session/provider credentials. Apple needs `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY`. Never echo secret values. A 48-byte random base64url session secret is suitable. `.env.example` lists all names.

Google clients must be type **Web application**. Apple uses a primary identifier enabled for Sign in with Apple, a website Services ID per environment, and an associated signing key. Callback URLs are exact:

| Provider | Staging callback                                       | Production callback                            |
| -------- | ------------------------------------------------------ | ---------------------------------------------- |
| Google   | https://staging.veganalts.com/api/auth/callback/google | https://veganalts.com/api/auth/callback/google |
| Apple    | https://staging.veganalts.com/api/auth/callback/apple  | https://veganalts.com/api/auth/callback/apple  |

Do not use temporary workers.dev URLs as provider callbacks. `APP_URL` supplies the fixed allowed origin. Apple client-secret JWTs are generated from the signing key for 30 days and renewed automatically with at least one day remaining. The key itself still needs deliberate rotation if revoked or exposed. OAuth state cookies and verification records both expire after ten minutes; state signatures and cookie checks stay enabled, and session cookies retain SameSite=Lax.

`BETTER_AUTH_API_KEY` enables the optional Better Auth cloud dashboard. Leaving it unset disables the dashboard plugin. Its user/session administration is separate from website administrator privileges. Activity tracking and managed directory synchronization are disabled.

After a real sign-in, obtain that user's exact auth ID through an authorized D1/dashboard read. Set `ADMIN_USER_IDS` to a comma-separated allowlist in the environment configuration. Do not grant admin by email address, display name, client-side state, or provider claim. Both the upload page and API enforce the allowlist on the server.

Verify both providers on staging with real accounts, profile linkage, session persistence across reloads, settings validation, sign-out, and denied non-admin access. Do not treat the local provider-boundary test as OAuth validation.

## Verification and deploy

```sh
npm ci
npm run check
npm run test:e2e
npm run deploy:staging
TEST_BASE_URL=https://staging.veganalts.com npm run test:e2e
```

The deployment commands build the selected environment before deploying its generated Worker configuration. Review Wrangler's printed Worker name, D1/R2 bindings, and domains. Record the deployed version ID in the verification record. Start feature work from `develop`, the default branch, and target pull requests at `develop`. Keep `main` for production release history. Commit/push/PR are separate approval checkpoints; CI runs on pull requests and pushes to `develop` or `main`.

### Automatic staging deployment

On the owner's instruction (2026-10-20), Cloudflare Workers Builds connects `Chaseos/VeganAlts` to the existing `veganalts-staging` Worker and deploys pushes to `develop`. The connection uses `develop` as its production branch (the live branch of this staging Worker), build command `npm run build:staging`, deploy command `npx wrangler deploy --keep-vars`, and repository root `/`. Preview builds are disabled. Node follows the committed `.nvmrc`.

The staging build selects the staging configuration and its D1/R2 bindings. Deployment retains existing secrets and dashboard variables absent from the configuration; variables specified in `wrangler.jsonc` remain authoritative. Keep the staging administrator allowlist in sync with authorized account changes before deploying. This pipeline deploys Worker code and assets only; it does not migrate, reset, or seed D1, or modify R2 data. Schema operations still require explicit authorization and the recovery steps above. GitHub Application checks run separately from Cloudflare Builds. Production deployment remains an explicit operation.

`/healthz` confirms the Worker can respond; it intentionally does not probe D1 or authentication. For data availability, run a bounded D1 read and the staging integration flows. Logging records generated request IDs, coarse route names, status, and duration, without full URLs, cookies, user emails, or provider responses. Invocation logs are disabled to avoid recording callback query strings.

Public home/search/category/product/profile documents, framework data and APIs use the isolated native `PublicCatalog` cache entrypoint, keyed by deployment version, country, route and representation. HTML does not read sessions and does not set cookies. See [core ranking operations](core-ranking.md) for TTLs, invalidation, diagnostics and analytics. Account, admin, errors, authentication, and write responses use private/no-store. Public assets use their content hashes; accepted and archived media derivatives use immutable URLs.

For Worker rollback:

```sh
npx wrangler deployments list --config wrangler.jsonc --env production
npx wrangler rollback VERSION_ID --config wrangler.jsonc --env production
```

Choose a previously verified version compatible with the current schema. Then verify `/healthz`, the landing page, redirects, and any affected authenticated workflow. Retain D1 and R2 when rolling back the Worker; media references and formula history are durable.

## Images and recovery

The admin interface is **Manage photos** on a product page, which replaces, adds or rotates its current formula's photos; the API is `POST /api/v1/media/uploads`. Both require a real authenticated allowlisted user and the exact same-origin request. Use multipart fields `productVersionId`, `slot`, `idempotencyKey`, and `image`. The server bounds the actual request stream, checks format signatures, decodes metadata, and rejects images above 10 MiB or 40 megapixels.

Each upload has one idempotency key and independent attempt IDs. A D1 atomic batch claims an attempt with a five-minute lease. Processing writes original/derivatives under its attempt prefix, then commits metadata and accepted-slot replacement atomically. An expired attempt cannot later commit. A repeated completed request reuses the same image ID; no re-transformation occurs.

Hourly recovery runs at minute 17 in staging and 37 in production. It expires abandoned leases and removes only objects known to be safe. Every derivative referenced by a product-image record, including archived media, is preserved. It checks abandoned prefixes on every pass so delayed R2 writes are recovered later. An original left after a successful commit is safe to delete.

```sh
npx tsx scripts/verify-images-staging.ts --staging
```

This explicit live check consumes real Cloudflare Images transformations and writes results under ignored `test-results/live-images/`. It does not create users or modify production data. It supplements, rather than replaces, the real authenticated uploader and R2 URL checks.

Use `npm run rankings:rebuild:staging` or `npm run rankings:rebuild:production` after changing prior calibration or repairing derived data. The script uses the same domain policy and atomic repository as normal writes. It requires Wrangler access and exposes no public maintenance endpoint. Initial priors are mean 3.5/strength 10; zero-rating formulas remain unranked.

## DNS and mail recovery

Porkbun remains registrar. Cloudflare's assigned authoritative servers are `alexa.ns.cloudflare.com` and `rene.ns.cloudflare.com`. The original inventory and nameservers are preserved in [dns-before-cutover.txt](dns-before-cutover.txt).

The cutover replaced only Cloudflare copies of the three apex parking A records and the www parking CNAME with Worker custom domains. MX, SPF, ACME verification, and the wildcard record were retained. Apex and www route to the production Worker; www and HTTP redirect to HTTPS apex with paths/queries preserved. Staging routes to its own Worker.

Verify delegation at the registry and mail at the authoritative DNS server:

```sh
dig @a.gtld-servers.net veganalts.com NS +noall +authority
dig @alexa.ns.cloudflare.com veganalts.com MX +short
dig @alexa.ns.cloudflare.com veganalts.com TXT +short
dig @a.gtld-servers.net veganalts.com DS +dnssec +noall +answer
curl -I https://veganalts.com/
curl -I 'http://www.veganalts.com/check?source=verification'
```

No registrar DS record existed at cutover. Do not install a stale DS record when switching authorities. If DNSSEC is enabled later, follow Cloudflare's documented registrar DS sequence and verify the chain before treating it as active.

For DNS recovery, first prefer repairing a Cloudflare record or rolling back the Worker. If returning authority to Porkbun is required, restore the original four Porkbun nameservers from the inventory and keep the old zone intact. A DNSSEC DS change must match the selected authority. Allow for cached NS/record TTLs; verify both old and new authorities during propagation. Reverting to the original zone restores parking, not an earlier VeganAlts deployment.

## Costs and safeguards

The target is at most $10/month incremental infrastructure at foundation-stage usage. Cloudflare Free DNS/Workers/D1 and R2 Standard are used; no paid Worker or hosted-image storage plan is required for the landing page. Existing account usage can consume shared allowances.

Upload controls are 5 attempts/minute per user at the edge, 50 processing attempts/day per environment enforced atomically in D1, and 3 attempts per idempotency key. Failed attempts count. Each attempt has at most three derivatives. Authentication is limited to 60 requests/minute per source IP. These controls reduce abuse and transform volume; they are not a guaranteed billing cap.

Review account usage before enabling public contributions or increasing these limits. Check Workers requests/CPU, D1 reads/writes/storage, R2 operations/storage, and Images transformations. An existing enabled account-wide billing budget alert at $10 was confirmed on 2026-10-04 and preserved. It covers shared-account usage, not only VeganAlts. Alerts are monitoring controls, not a spending cap; review their threshold as other account workloads change.

Current provider documentation: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Images pricing](https://developers.cloudflare.com/images/pricing/), [DNS migration](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/), and [Apple authentication](https://better-auth.com/docs/authentication/apple).

Milestone 3 contribution limits, private staging, review decisions, reversals and bounded cleanup are documented in [community catalog operations](community-catalog.md).

## Milestone 4 operations

- **Automated moderation.** `MODERATION_PROVIDER` is `clef` on staging and `disabled` in production until launch. `MODERATION_POLICY` holds the daily, per-account and concurrency budgets and the Clef decision thresholds. New transient failures use private automatic retries; exhausted budgets return retry guidance without creating review items. Ambiguous evidence retains its existing review requirements. `npm run moderation:calibrate` re-runs the labeled calibration set against real Clef (it consumes Workers AI tokens).
- **Hourly automation.** The scheduled handler expires decision leases, retries private automatic-check work, re-evaluates existing held comments, auto-accepts eligible proposals, continues unfinished category merges and recomputes Trending. Each step logs `automation` with counts and fails independently.
- **Launch gate.** `PUBLIC_LAUNCH` controls whether production serves the catalog. `robots.txt` is generated per environment: staging disallows everything, production lists the sitemap once launched.
- **Checks.** `npx tsx scripts/verify-staging-public.ts` (add `--load` for a two-minute anonymous load test), `npx tsx scripts/verify-backup-staging.ts --staging` and `npx tsx scripts/audit-launch-dataset.ts <env>` are read-only and write evidence under `test-results/milestone-4/`.
- [Backup and recovery](backup-recovery.md) and the [launch checklist](launch-checklist.md) cover restores and the production cutover.

## OpenAI safety activation and limits

OpenAI safety is configured independently from `MODERATION_PROVIDER` (Clef):

- `CONTENT_SAFETY_PROVIDER`: `disabled`, `openai`, or local-only `fake`.
- `CONTENT_SAFETY_POLICY`: positive integer `timeoutMs` (15000) and `reuseDays` (30). There is no OpenAI score cutoff: built-in flags determine rejection.
- `OPENAI_API_KEY`: a secret, never a public Wrangler variable. For local use add it to ignored `.dev.vars`; for staging use `npx wrangler secret put OPENAI_API_KEY --env staging`. Configure production separately when preparing launch.

Staging selects `openai`; production remains disabled until its release is prepared. The 2026-10-23 staging rollout was deployed against the current version-1 D1 baseline. `npx wrangler d1 migrations list veganalts-staging --remote --env staging` reported no migrations to apply, and the provider-attempt, automatic-job and request-lease tables and expanded decision subjects were present. No migration or database reset was applied. The staging Worker version and live-check results are recorded in [content-safety staging verification](../verification/content-safety-staging.md).

The `OPENAI_API_KEY` secret name is present in staging, but that alone does not prove the provider is reachable or healthy. The 2026-10-23 authenticated staging requests failed at OpenAI's safety stage with a generic provider error; Clef was not called. Keep production disabled and use a separate production key and explicit production release when preparing launch. Local fake safety uses explicit `[safety:blocked]` and `[safety:unavailable]` fixture markers and makes no external request. Never enable fake providers outside local development.

Check the live staging contribution flow with benign text, an ordinary negative product opinion, an attached product photo and a flagged fixture. Confirm the structured OpenAI result in D1, preservation of an existing profile on rejection, and that safety rejection stops Clef. Outage/retry behavior must also pass the mocked tests; do not revoke or replace a shared key merely to manufacture a staging outage.

At production release, create a separate restricted OpenAI key for production and store it from the website project root:

```sh
npx wrangler secret put OPENAI_API_KEY --config wrangler.jsonc --env production
```

Paste the key at Wrangler's secret prompt. Then set only production's `CONTENT_SAFETY_PROVIDER` to `openai` in `wrangler.jsonc`, verify the production database baseline, and use the normal explicit production deployment. The secret stays in Cloudflare and is retained by subsequent deployments; it is not copied from `.dev.vars` or from staging. Production Clef configuration remains an independent setting. Verify a benign request and the recorded provider/model after release.

Launch burst limits: early contribution writes 60/minute/IP; comments 10/minute/IP and account; uploads and profile saves 5/minute/IP and account; shared AI admission 30/minute/IP and 10/minute/account. Bindings have distinct namespaces per environment. Existing Turnstile, request-body, daily contribution, image processing/storage and upload concurrency protections remain.

`MODERATION_POLICY` also controls `daily` (300), `accountDaily` (30), `concurrent` (2) and `globalConcurrent` (5). These are conservative admission caps; actual calls additionally have per-provider D1 budgets at the same daily/account limits. Every failed attempt and scheduled retry is charged to its original account. Provider adapters never retry behind this accounting. These defaults protect the site even when several accounts or endpoints are used; tune public variables intentionally when usage warrants more capacity. Native Cloudflare rate limits are approximate/regional; atomic D1 accounting is the strict quota boundary.

Hourly automation reports `retriedModeration`. At most twenty due contributions run in a sweep. Transient provider failures stay private for up to three additional attempts, due after 1, 3 and 6 hours, respecting Retry-After and a 24-hour expiry. Permanent configuration/response errors ask for resubmission; quota/capacity refusals do not enqueue new work. Inspect aggregate logs and provider attempt status for an outage rather than treating failed checks as manual content-review work. The staging rollout required no database reset; production release preparation still follows the version-1 baseline and reset rules above. Do not apply an ad hoc upgrade to a shared database.
