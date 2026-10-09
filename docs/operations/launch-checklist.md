# Production launch checklist

Milestone 4 delivered launch readiness on staging. Production still serves the coming-soon page. Cutover is a separately approved operation; every step below needs the operator's explicit go-ahead.

## 1. Accounts and plans

- [ ] Workers Paid (higher limits, longer D1 Time Travel). See [Tech Stack §7](../TECH_STACK.md).
- [ ] Cloudflare Images Paid if transformations exceed the free allowance.
- [ ] Workers AI available on the account; confirm the daily evaluation budget (`MODERATION_POLICY`) and spend alerts.
- [ ] Billing alert at or below the $10/month early-cost target.

## 2. Production configuration (`wrangler.jsonc` → `env.production`)

- [ ] `ADMIN_USER_IDS`: real operator user IDs after their first production sign-in.
- [ ] `TURNSTILE_SITE_KEY` and the `TURNSTILE_SECRET_KEY` secret for the production hostname.
- [ ] `WEB_ANALYTICS_TOKEN` for production.
- [ ] `SUPPORT_CONTACT`: the reviewed support address shown on the policy pages.
- [ ] `MODERATION_PROVIDER`: switch from `disabled` to `clef` once budgets are confirmed; keep `MODERATION_POLICY` thresholds from the staging calibration.
- [ ] `PROPOSAL_AUTO_APPLY`: keep the default (24 hours minimum age).
- [ ] Rate-limit namespaces reviewed (auth, ratings, comments, votes, uploads, search, events).
- [ ] Secrets present without printing values: `BETTER_AUTH_SECRET`, Google and Apple credentials, `TURNSTILE_SECRET_KEY` (see [deployment](deployment.md)).
- [ ] OAuth callbacks registered for `https://veganalts.com/api/auth/callback/{google,apple}`.

## 3. Database

Production has applied migrations through `0004`. Pending: `0005`–`0015`.

- [ ] Time Travel bookmark recorded; production export stored privately.
- [ ] `npm run db:migrate:production` (runs the legacy-report and comment-rebuild preflights).
- [ ] `PRAGMA foreign_key_check` returns no rows.
- [ ] `npm run taxonomy:seed:production -- --confirm-taxonomy-only` after reviewing `db/seed/taxonomy.ts`. Never run the development seed in production.
- [ ] `npm run rankings:rebuild:production`.

## 4. Launch catalog

- [ ] Operators add the initial real products through the normal submission and review flow (front photo plus ingredient evidence).
- [ ] `npx tsx scripts/audit-launch-dataset.ts production` reports `readyForLaunch: true` (no development products, demo accounts, missing evidence, unreviewed Vegan classifications or likely duplicates).
- [ ] Homepage features configured in the taxonomy workspace.

## 5. Policy and trust surfaces

- [ ] Legal review of `/about/privacy` and `/about/terms` (drafted to match actual behavior, including Workers AI moderation).
- [ ] `/about/moderation`, `/about/rankings`, `/about/vegan-status` and `/about/contact` reviewed.

## 6. Release and deployment

- [ ] Merge `develop` into `main`. `origin/main` carries four documentation commits that `develop` does not (`2e04609`, `c3a48c4`, `40ef6ce`, `0e0a938`); `develop` already contains their current content, so resolve `docs/MODERATION.md` and README conflicts in favor of `develop`.
- [ ] Set `PUBLIC_LAUNCH` to `"true"` in `env.production`, then `npm run deploy:production`. Record the Worker version and the previous version for rollback.
- [ ] DNS: confirm `veganalts.com` and `www.veganalts.com` custom domains (read-only check; already routed).

## 7. Post-launch verification

- [ ] `TEST_BASE_URL=https://veganalts.com npx tsx scripts/verify-staging-public.ts` adapted for production (robots must list the sitemap; pages must not carry `X-Robots-Tag: noindex`).
- [ ] Real Google and Apple sign-in, a rating, a comment and a photo proposal with an operator account.
- [ ] `/robots.txt` lists the sitemap; `/sitemap.xml` contains categories and products.
- [ ] Workers Logs show `automation` passes every hour without `failed` steps.
- [ ] Alerting: watch `request_error` 5xx counts, `automation_failed`, `community_recovery_failed`, `media_recovery_failed` and Workers AI spend daily during the first week.

## Rollback

`npx wrangler rollback VERSION_ID --config wrangler.jsonc --env production` with the recorded previous version. Migrations are additive; the coming-soon page returns by setting `PUBLIC_LAUNCH` back to `"false"` and deploying. See [backup and recovery](backup-recovery.md) for data restores.
