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

`db/0001_app_baseline.sql` remains a design reference. Only `db/migrations/` is executable migration history:

1. `0000_auth.sql` — generated Better Auth tables.
2. `0001_application.sql` — application baseline and search support.
3. `0002_operational_state.sql` — formula revisions, upload/attempt state, evidence derivatives.
4. `0003_integrity_and_search.sql` — reviewed integrity/search triggers.
5. `0004_media_lookup_indexes.sql` — derivative-key and recovery lookup indexes.
6. `0005_core_ranking_reads.sql` — private rating cursor index.
7. `0006_community_catalog.sql` — community receipts, identities, evidence, moderation and duplicate history.
8. `0007_staged_byte_accounting.sql` — per-upload staged byte accounting.
9. `0008_submission_followups.sql` — durable links between an original submission and its revised receipt.
10. `0009_proposal_baselines.sql` — the catalog facts each proposal was drafted against.

Check exact filenames in the directory before operating. Applied migrations are append-only. Generate future schema changes with `npm run db:generate`, inspect generated SQL, and add reviewed custom SQL for unsupported constructs. Better Auth schema generation uses `npm run auth:schema`; diff its output before creating any migration. Never run the reference baseline in addition to the migration history.

Use the `npm run db:migrate:*` commands below, which run the legacy-report preflight before Wrangler applies migrations. Do not apply `0006` directly to an older database: duplicate active reports from earlier releases would prevent its unique index from being created. Before that upgrade, capture a recovery reference and pause legacy report writers until the migration completes. The preflight archives duplicates without deleting rows, combines notes on the earliest active report, retains reviewing priority, and records original fields under `audit_log.action='legacy_report_deduplication'`. It prints counts only. A failed or interrupted run can be repeated; completed groups are skipped. Already-upgraded databases and fresh installations need no normalization. For recovery, inspect the recorded audit privately or use the pre-upgrade recovery reference; do not reopen duplicate reports while the unique constraint is in place.

After a successful apply, the same commands recompute legacy brand/retailer normalized names and product identity keys with the application normalization (`db/upgrades/catalog-identity.ts`). It prints counts of corrected names, keys and conflicts only, and is safe to repeat. A non-zero conflict count names legacy brands or retailers whose corrected keys collide; consolidate them deliberately rather than editing keys by hand.

```sh
npm run db:migrate:local
npm run db:seed:local
npm run db:migrate:staging
npm run db:seed:staging
npm run db:seed-images:staging
npx wrangler d1 execute DB --remote --config wrangler.jsonc --env staging --command 'PRAGMA foreign_key_check'
```

The approved milestone 2 seed uses deterministic IDs for 31 products, ten categories, 28 explicitly labeled demo tasters and sample contributions. Re-running it inserts missing fixtures and updates only approved development classification/notice fields and the old development formula label. It preserves real accounts/contributions, formula transitions and historical verification records, and rebuilds aggregates and FTS after seeding. Demo images use stable upload keys through the normal processing pipeline, so completed retries do not transform again. Every catalog record is development-only; images/formula history/sample ratings are illustrative, not verified manufacturer claims or organic community feedback. Never seed production. Product names/source references are in `db/seed/catalog.ts`; verify labels and market/formula data before promoting records into a public catalog.

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

The deployment commands build the selected environment before deploying its generated Worker configuration. Review Wrangler's printed Worker name, D1/R2 bindings, and domains. Record the deployed version ID in the verification record. Start feature work from `develop`, the default branch, and target pull requests at `develop`. Keep `main` for production release history. Commit/push/PR are separate approval checkpoints; CI runs on pull requests and pushes to `develop` or `main`. Deployments remain explicit operations.

`/healthz` confirms the Worker can respond; it intentionally does not probe D1 or authentication. For data availability, run a bounded D1 read and the staging integration flows. Logging records generated request IDs, coarse route names, status, and duration, without full URLs, cookies, user emails, or provider responses. Invocation logs are disabled to avoid recording callback query strings.

Public home/search/category/product/profile documents, framework data and APIs use the isolated native `PublicCatalog` cache entrypoint, keyed by deployment version, country, route and representation. HTML does not read sessions and does not set cookies. See [core ranking operations](core-ranking.md) for TTLs, invalidation, diagnostics and analytics. Account, admin, errors, authentication, and write responses use private/no-store. Public assets use their content hashes; accepted and archived media derivatives use immutable URLs.

For Worker rollback:

```sh
npx wrangler deployments list --config wrangler.jsonc --env production
npx wrangler rollback VERSION_ID --config wrangler.jsonc --env production
```

Choose a previously verified version compatible with the current schema. Then verify `/healthz`, the landing page, redirects, and any affected authenticated workflow. Retain D1 and R2 when rolling back the Worker; media references and formula history are durable.

## Images and recovery

The admin interface is `/admin/media`; the API is `POST /api/v1/media/uploads`. Both require a real authenticated allowlisted user and the exact same-origin request. Use multipart fields `productVersionId`, `slot`, `idempotencyKey`, and `image`. The server bounds the actual request stream, checks format signatures, decodes metadata, and rejects images above 10 MiB or 40 megapixels.

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
