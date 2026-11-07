# Production launch checklist

The first release is the United States only, and [the launch plan](launch-plan.md) orders the work. Milestone 4 delivered launch readiness on staging ([verification](../verification/milestone-5.md)). Production still serves the coming-soon page. Cutover is a separately approved operation; every step below needs the operator's explicit go-ahead.

## 1. Accounts and plans

- [ ] Workers Paid (higher limits, longer D1 Time Travel). See [Tech Stack §7](../TECH_STACK.md).
- [ ] Cloudflare Images Paid if transformations exceed the free allowance.
- [ ] Workers AI available on the account; confirm the daily evaluation budget (`MODERATION_POLICY`) and spend alerts.
- [ ] Billing alert at or below the $10/month early-cost target.

## 2. Production configuration (`wrangler.jsonc` → `env.production`)

- [ ] `ADMIN_USER_IDS`: real operator user IDs after their first production sign-in.
- [ ] `TURNSTILE_SITE_KEY` and the `TURNSTILE_SECRET_KEY` secret for the production hostname.
- [ ] `WEB_ANALYTICS_TOKEN` for production.
- [x] `SUPPORT_CONTACT`: `chaseosapps@gmail.com`, shown on the policy pages (set in every environment).
- [ ] `MODERATION_PROVIDER`: switch from `disabled` to `clef` once budgets are confirmed; keep `MODERATION_POLICY` thresholds from the staging calibration. Also set `CONTENT_SAFETY_PROVIDER`, `FOOD_TEXT_PROVIDER` to `claude`, and `FOOD_REVIEW` to `{"default":"queue"}`.
- [ ] `PROPOSAL_AUTO_APPLY`: keep the default (24 hours minimum age).
- [ ] Rate-limit namespaces reviewed (auth, ratings, comments, votes, uploads, search, events).
- [ ] Secrets present without printing values: `BETTER_AUTH_SECRET`, Google and Apple credentials, `TURNSTILE_SECRET_KEY` (see [deployment](deployment.md)).
- [ ] OAuth callbacks registered for `https://veganalts.com/api/auth/callback/{google,apple}`.

## 3. Database

Production last applied the pre-release migrations through `0004`, which no longer exist. Reset it and migrate it to version 1 (`0001_initial.sql`) before launch.

- [ ] Time Travel bookmark recorded; production export stored privately.
- [ ] Production D1 is on version 1: `npm run db:migrate:production` applies only `0001_initial.sql` (a database with the pre-release history is first reset with `npm run db:reset:production -- --confirm-reset=veganalts-production`).
- [ ] `PRAGMA foreign_key_check` returns no rows.
- [ ] `npm run taxonomy:seed:production -- --confirm-taxonomy-only` after reviewing `db/seed/taxonomy.ts`. It creates the aisles, foods, questions and every country's lists, and switches on only `PRODUCTION_COUNTRIES` (the United States). Rerun it after changing that list. Production needs no reshape, and the reshape script refuses production. Never run the development seed in production.
- [ ] `npm run rankings:rebuild:production`.

## 4. Launch catalog

- [ ] Operators add the initial real products, through the owner's store-photo import ([runbook](catalog-import.md)) or the normal submission and review flow. A front photo is required; ingredient evidence is optional for products explicitly marked "Ingredients not checked yet".
- [ ] `npx tsx scripts/audit-launch-dataset.ts production` reports `readyForLaunch: true` (no development products, demo accounts, missing front photos or evidence for checked classifications, unreviewed Vegan classifications or likely duplicates). `uncheckedProductsWithoutIngredientEvidence` is informational.
- [ ] Homepage features reviewed for the United States in the taxonomy workspace (seeded with Ground Beef, Beef Burgers, Milk, Cheddar, Butter and Eggs).
- [ ] US retailers present, so store filters have options.

## 5. Policy and trust surfaces

- [ ] `/about/privacy` and `/about/terms` checked by the owner against what the site really does and against reputable templates and official guidance (no lawyer, owner, 2026-11-06).
- [ ] DMCA agent registered, because users upload photos.
- [ ] `/about/moderation`, `/about/rankings`, `/about/vegan-status` and `/about/contact` reviewed.
- [ ] The US allergen list and the "Always check the package" wording checked against FDA guidance.

## 6. Release and deployment

- [ ] Merge `develop` into `main`. `origin/main` carries four documentation commits that `develop` does not (`2e04609`, `c3a48c4`, `40ef6ce`, `0e0a938`); `develop` already contains their current content, so resolve `docs/MODERATION.md` and README conflicts in favor of `develop`.
- [ ] Set `PUBLIC_LAUNCH` to `"true"` in `env.production`, then `npm run deploy:production`. Record the Worker version and the previous version for rollback.
- [ ] DNS: confirm `veganalts.com` and `www.veganalts.com` custom domains (read-only check; already routed).

## 7. Post-launch verification

- [ ] `TEST_BASE_URL=https://veganalts.com npx tsx scripts/verify-staging-public.ts` adapted for production (robots must list the sitemap; pages must not carry `X-Robots-Tag: noindex`).
- [ ] Real Google and Apple sign-in, a rating, a comment and a photo proposal with an operator account.
- [ ] `/robots.txt` lists the sitemap; `/sitemap.xml` contains US categories and products and no other country.
- [ ] `/` is the US home and `/us` redirects to `/us/en`; the home and food pages are a shared-cache `HIT`; `/ca/en`, `/de/de` and `/jp/ja` return 404.
- [ ] Workers Logs show `automation` passes every hour without `failed` steps.
- [ ] Alerting: watch `request_error` 5xx counts, `automation_failed`, `community_recovery_failed`, `media_recovery_failed` and Workers AI spend daily during the first week.

## Rollback

`npx wrangler rollback VERSION_ID --config wrangler.jsonc --env production` with the recorded previous version. Migrations are additive; the coming-soon page returns by setting `PUBLIC_LAUNCH` back to `"false"` and deploying. See [backup and recovery](backup-recovery.md) for data restores.
