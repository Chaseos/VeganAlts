# Milestone 3 verification

Verified on 2026-10-07 against the approved [Milestone 3 specification](../MILESTONE_3_PLAN.md). Implementation, local verification and staging acceptance are complete for #13, #14, #17, #19, #20 and #22.

## Delivery and scope

- Branch: `feature/milestone-three-community-catalog`, based on updated `origin/develop` at `c30b750`.
- Staging: [staging.veganalts.com](https://staging.veganalts.com). Final Worker version: **`571b9295-b59e-4a2e-8694-fe709e5eb0ea`**, Worker `veganalts-staging`.
- Applied append-only migrations `0006_community_catalog.sql` and `0007_staged_byte_accounting.sql` to staging. Neither was applied to production.
- Product/photo reporting is visible now. Comment-target validation is implemented and tested; visible comment reporting remains deferred to #15, as agreed for #17.
- #22 follows the approved donor-archival policy: no contribution transfer or survivor score/metadata changes.
- Git publication is separate from staging acceptance. GitHub issue and milestone states remain unchanged; no merges, CI investigation or production deployment were performed.

## Issue-by-issue acceptance

| Issue                                                 | Implemented behavior                                                                                                                                                       | Supporting evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#13](https://github.com/Chaseos/VeganAlts/issues/13) | Guided multi-category submission, duplicate checks, provisional publication, actionable corrections, private held evidence, leased media processing and atomic publication | Automatic staging publication used real front/ingredient uploads through Images and R2. A related submission was held with **zero canonical products, formulas and images** until operator approval. Anonymous evidence returned `401 private, no-store`. Reused photos across both products and a packaging proposal used **two transformation attempts total**. [Publication](milestone-3/staging-publication.jpg), [held receipt](milestone-3/staging-held-submission.jpg), [mobile outcome](milestone-3/staging-mobile-receipt.jpg); submission/recovery/HTTP tests.                                                                                                                                                                        |
| [#14](https://github.com/Chaseos/VeganAlts/issues/14) | Canonical retailers and aliases, deliberate proposals, country checks, unique contributor stances, recency and operator-controlled removal                                 | Proposed and accepted the explicitly synthetic US retailer “Milestone Three Staging Market,” including website and “M3 Staging Market” alias. Searching `M3.Staging Market` found it. Two confirmations displayed **one contributor**, one recent confirmation and the last-confirmed date. [Review](milestone-3/staging-retailer-review.jpg), [public summary](milestone-3/staging-retailers.jpg). Integration tests cover 180-day staleness, negative evidence, withdrawal, stale operator decisions and country isolation.                                                                                                                                                                                                                   |
| [#17](https://github.com/Chaseos/VeganAlts/issues/17) | Allowlisted review inbox, private outcomes/evidence, product/photo reports, priority, atomic decisions/audits and reversals                                                | Genuine authenticated operator approved a held submission, retailer and product changes, resolved photo/product reports and reversed decisions. Removed cached media changed from **200 HIT to 404 private/no-store**, disappeared from public JSON and remained privately readable to the operator; reversal restored it. Anonymous inbox access returned 401. [Photo resolution](milestone-3/staging-photo-resolution.jpg). Tests cover non-operator 403, report deduplication, comment targets, cursor pagination, priority, stale/repeated decisions and audit preservation.                                                                                                                                                                |
| [#19](https://github.com/Chaseos/VeganAlts/issues/19) | Formula/lifecycle proposals, packaging-only updates, approximate dates, historical isolation and reversible changes                                                        | Accepted a material reformulation with **2026-09/month precision**. The previous formula retained its 3/5 rating; the new formula received an independent 2/5 rating. A packaging proposal kept the current formula and score. Discontinuation removed rating controls; evidence-backed equivalent reintroduction restored the same formula and rating. [Formula history](milestone-3/staging-formula-history.jpg), [discontinued](milestone-3/staging-discontinued.jpg), [reintroduced](milestone-3/staging-reintroduced.jpg). Tests cover both reintroduction paths, concurrent rating fences, later contributions through reversal and rebuild equivalence.                                                                                  |
| [#20](https://github.com/Chaseos/VeganAlts/issues/20) | Formula-specific classification, manufacturer wording, certification/evidence separation and assessed Under Review                                                         | Automatic staging publication displayed provisional Appears Vegan separately from manufacturer vegan wording and absent certification. A product report alone left classification unchanged. Operator assessment applied Under Review, invalidated public output and removed rating controls while retaining history. [Under Review](milestone-3/staging-under-review.jpg). Tests cover reversal, verified classification, formula isolation and current-only migration backfill.                                                                                                                                                                                                                                                               |
| [#22](https://github.com/Chaseos/VeganAlts/issues/22) | Identity/package-size checks, relationships, specialty eligibility, audited duplicate archival and uncached reversible redirects                                           | Preview identified **2 donor ratings, 2 formulas and 3 photos** to archive. Consolidation preserved all donor records and left survivor product/formula/classification/category/image/retailer/rating/aggregate hashes unchanged. The 302/private/no-store redirect stripped the donor formula selector. Private history displayed both archived ratings. Reversal restored the donor URL/history and left survivor hashes unchanged again. [Preview](milestone-3/staging-duplicate-preview.jpg), [private archived history](milestone-3/staging-archived-history.jpg), [sanitized integrity record](milestone-3/staging-evidence.json). Tests cover country/cycle isolation, hidden-product write rejection and specialty-category exclusions. |

## Local verification

The original baseline was 48 tests across 17 files. The final implementation has **74 passing tests across 24 files**. `npm run check` passes type generation, strict TypeScript, unit/integration tests and the application build. Its final log is `test-results/milestone-3-final-check.log`.

The final `npm run test:e2e` passed all **22 tests** across desktop and mobile, including packaging-photo correction recovery (`test-results/milestone-3-final-e2e.log`, 2.7 minutes). The four affected community journeys also passed independently after the final corrections. They exercise real local UI/API/service/repository paths, keyboard activation, focused validation errors, invalid-photo replacement, authenticated review, reporting, reformulation, packaging, consolidation/reversal, retailer proposals/confirmation, axe checks and viewport overflow checks. Existing authentication/rating recovery, private history and discovery journeys pass in the same suite.

| Gate                                                                                                                                                                                           | Test evidence                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Publication, missing evidence, package-size/identity checks, private review, no premature canonical rows                                                                                       | `tests/integration/community-submission.test.ts`, `tests/unit/community-policy.test.ts`                                   |
| Hash reuse across keys; byte, account, concurrency and shared environment limits; exhausted processing keys; interrupted promotion; expired leases; late writes; cleanup and retained evidence | `tests/integration/community-recovery.test.ts`, existing `tests/integration/media.test.ts`                                |
| Auth/allowlist, bounded bodies, same-origin requests, strict validation, rejected challenges and private cache policy                                                                          | `tests/integration/community-http.test.ts`, existing abuse/auth tests                                                     |
| Deduplicated reports, ingredient priority, stale/idempotent decisions, audit/reversal, comment validation, retailer aliases/recency/stances                                                    | `tests/integration/community-moderation.test.ts`                                                                          |
| Packaging, lifecycle/reintroduction, formula/rating concurrency, reversible history, ranking rebuild equivalence, country/cycle isolation, specialty eligibility, inbox cursors                | `tests/integration/community-lifecycle.test.ts` and moderation tests                                                      |
| Fresh migrations and milestone 2 upgrades, preserved raw history, historical classifications not inferred                                                                                      | `tests/integration/community-migrations.test.ts`; the shared integration setup applies the complete fresh migration chain |
| Reseeding preserves accepted formulas/classifications, real ratings and audit records                                                                                                          | `tests/integration/seed.test.ts`; actual staging seed comparison below                                                    |
| Public cache/nonce/session isolation and removal/redirect behavior                                                                                                                             | `tests/unit/public-cache.test.ts`, media/community integration tests and discovery browser tests                          |

D1's runtime does not expose `PRAGMA integrity_check`. Supported `PRAGMA foreign_key_check` and explicit canonical-record comparisons passed on fresh/upgraded test databases and staging. Fault injection, time advancement, concurrency and destructive cleanup cases run in isolated D1/R2/Images integration environments; staging data and clocks were not manipulated to simulate them.

Local screenshots: [desktop submission](milestone-3/desktop-submission.png), [mobile review](milestone-3/mobile-review.png), [consolidation](milestone-3/desktop-consolidation.png), [mobile retailers](milestone-3/mobile-retailers.png).

## Staging rollout and genuine-account verification

Before applying migrations, verified the following bindings against the staging configuration and deployment artifact:

- Worker/domain: `veganalts-staging` / `staging.veganalts.com`.
- D1: `veganalts-staging`, ID `398b7461-5ad0-48fe-aaa9-332922dad93b`.
- R2: `veganalts-media-staging`; Images binding: `IMAGES`.
- Existing two-user administrator allowlist; Google/Apple/Better Auth and Turnstile secret binding names, without exposing values.
- The built Worker contains no local browser-session fixture or test authentication harness.

Pre-migration counts were **31 products, 406 ratings and 32 images**, with no open reports, duplicate active report groups or foreign-key violations. Both additive migrations succeeded. Initial acceptance used Worker `3e404671-e2cb-4b15-9f6b-793f771fb4d5`; evidence-display and photo-validation fixes were deployed and retested. Final acceptance version is **`571b9295-b59e-4a2e-8694-fe709e5eb0ea`**.

The existing genuine signed-in, allowlisted account exercised both ordinary contributor forms and operator actions. No staging synthetic accounts, forged sessions or deployed authentication bypasses were used. Catalog entries and retailer names were explicitly marked as synthetic staging fixtures, with repository development-image fixtures as evidence.

| Acceptance reference                                      | ID                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Automatically published original / consolidation survivor | `01a1183f-5fd9-755f-bcfa-e1863f96e455`                                          |
| Reviewed product / consolidation donor                    | `01a11848-4679-71bb-9285-fcaf6b236bf2`                                          |
| Held submission receipt                                   | `01a11848-4679-71bb-9285-f976ef3d49b5`                                          |
| Retailer proposal                                         | `01a11840-9645-74da-834f-78382f384d4b`                                          |
| Photo report                                              | `01a1184a-93a3-7754-b1fb-7719d59d4f6d`                                          |
| Ingredient report                                         | `01a1184d-cc7d-777e-b5f3-1740d10d086d`                                          |
| Reformulation proposal                                    | `01a1184f-2931-762d-b2c7-7e49055ee0fd`                                          |
| Packaging proposal                                        | `01a11853-0038-706b-bbc2-86b00a095894`                                          |
| Discontinuation / equivalent reintroduction               | `01a11856-797c-751c-a510-2dd052a0f912` / `01a11856-d28b-7778-9f57-4e20a71a413c` |

Both synthetic products were subsequently discontinued through separate, audited proposals to remove them from active discovery. Their raw ratings, formula history and evidence remain recoverable. The donor redirect is reversed/inactive. The final moderation inbox is clear. The synthetic retailer and one confirmation remain as retained verification records. The survivor was unchanged during consolidation and reversal; its later retirement is a separate documented lifecycle change.

The final remote browser regression passed **6 public tests across desktop/mobile**. The 16 tests requiring the local provider fixture deliberately skip remote targets; their staging equivalents were exercised interactively with the genuine account. These are not reported as 22 remote passes. The 390-pixel staging contribution receipt had no horizontal overflow and loaded both private evidence images. Public discovery, rankings, aliases, historical pages, canonical URLs, cache/session separation, fresh CSP nonces and axe checks passed.

Actual R2 inspection found all five canonical acceptance images, with WebP full variants of 6,824 or 60,864 bytes, and zero missing referenced objects. Only two staged transformation attempts were needed because cross-key reuse also served the packaging update. Post-acceptance foreign-key violations: **0**.

`npx tsx scripts/verify-seed-staging.ts --staging` ran the actual staging seed and compared pre/post hashes. It preserved real accounts, all five non-demo rating/trial records (including the three new synthetic-product ratings), 33 product records, current/historical formulas, 34 formula classifications, category/relationship data, the retailer and confirmation, seven proposals, two reports, 12 moderation actions, the reversed consolidation and 16 audit entries. No protected record changed. Full sanitized hashes are retained in [staging evidence](milestone-3/staging-evidence.json).

Production remains the coming-soon page with its original behavior and restrictive CSP. Read-only before/after HTML comparison matched after excluding optional Cloudflare-injected analytics markup. No production bindings, migrations or deployment were changed.

## Commands and evidence locations

Run from the repository root:

```sh
npm run check
npm run test:e2e
npm run build:staging
npm run db:migrate:staging
npm run deploy:staging
npx vitest run tests/integration/community-lifecycle.test.ts
npx playwright test tests/e2e/community.spec.ts
npx tsx scripts/verify-seed-staging.ts --staging
TEST_BASE_URL=https://staging.veganalts.com npm run test:e2e
```

Local command logs are under ignored `test-results/`: `milestone-3-final-check.log`, `milestone-3-final-e2e.log`, `milestone-3-packaging-integration.log`, `milestone-3-packaging-recovery.log`, `milestone-3-staging-migrations.log`, `milestone-3-staging-deploy-final.log`, `milestone-3-staging-e2e.log` and `milestone-3-seed-preservation.log`. Read-only HTTP headers, recovery records and hashed D1/R2 snapshots are under `test-results/milestone-3/`. Durable screenshots and the sanitized evidence summary are in this document's adjacent `milestone-3/` directory.

Acceptance found and fixed missing retailer website/alias evidence in review, a publication-outcome navigation omission, proposal image validation's ambiguous SQL column, and photo-correction recovery after failed uploads. Regression tests use explicit staged/canonical image IDs and retry invalid photos through the UI. Browser tests submit proposals as the contributor and review as the operator, keeping actor roles and burst limits realistic.

## Recovery and operational limits

- Pre-migration D1 recovery bookmark: `00000077-00000000-000050fd-02311e67ff98260c72759ef5bf7e0ac6`.
- Previous Worker version: `16ceafbe-e468-46cb-99e7-2ea111902772`.
- Recovery records: ignored `test-results/milestone-3/recovery/`.
- Prefer audited action reversal for catalog corrections and a forward repair for data issues. A compatible Worker rollback can leave the additive schema intact. Time Travel restoration requires a deliberate operator decision and reconciliation of contributions after the bookmark; it is not a routine rollback step. Preserve R2 evidence.
- See [community catalog operations](../operations/community-catalog.md) for staging-only recovery commands, exact quotas, cleanup cursors, lease behavior, review/reversal semantics and privacy-preserving diagnostics.

No required milestone acceptance gap remains. The agreed deferrals remain: visible comment reporting/full comments, community voting and automated acceptance, contributor trust, external AI moderation, general photo management, Trending and production launch. The 24-hour/30-day cleanup windows and 180-day retailer staleness are verified with controlled integration clocks rather than waiting those intervals in staging.

## PR 29 review fixes — 2026-10-07

The fixes below follow the initial staging acceptance above. They require additive migration `0008_submission_followups.sql`; applied migrations `0006` and `0007` remain unchanged.

| Review finding | Fix and regression evidence |
| --- | --- |
| [Renew consumed Turnstile tokens](https://github.com/Chaseos/VeganAlts/pull/29#discussion_r4212499159) | Contribution forms remount the challenge after each consumed token, including rejected tokens. The browser test requires separate solves for preflight, upload and finalization, rejects the first solve, and asserts stable idempotency keys and one publication. |
| [Keep redirect lookup behind the cache](https://github.com/Chaseos/VeganAlts/pull/29#discussion_r4212499179) | The gateway dispatches directly to the isolated public entrypoint with manual redirect handling. The gateway regression supplies native-cache HIT responses for document/data/API reads and makes any gateway D1 access fail. Cache policy excludes 302 and framework 202 redirects. |
| [Make submission follow-ups actionable](https://github.com/Chaseos/VeganAlts/pull/29#discussion_r4212499185) | Owners reopen the guided form, correct details and reattach photos. Finalization atomically supersedes the old queue item and audits the response without overwriting evidence. Integration coverage verifies ownership, missing evidence, cross-receipt hash reuse, competing responses, intervening operator decisions, replay, queue/history links, no premature canonical rows and mandatory review. |
| [Upgrade legacy duplicate reports safely](https://github.com/Chaseos/VeganAlts/pull/29#discussion_r4212499193) | Migration commands normalize old active-report groups before immutable migration `0006`. Upgrade fixtures include open/reviewing duplicates, separate reporters/reasons and resolved rows; every original record/note survives, the audit is complete, repeat runs are inert, the unique index rejects new duplicates, historical ratings survive, and foreign keys remain valid. |

`npm run check` passed **77 tests across 25 files**, type checking and the application build. The local migration command also applied the new migration successfully during browser preparation. Regression sources: `tests/e2e/community-challenge.spec.ts`, `tests/e2e/community.spec.ts`, `tests/integration/public-gateway.test.ts`, `tests/integration/community-submission.test.ts`, `tests/integration/community-migrations.test.ts` and `tests/unit/public-cache.test.ts`.

`npm run test:e2e` passed **24 desktop/mobile tests**. Both sizes exercised the requested correction, revised receipt, preserved original photos, operator approval, reports, formula history, duplicate document/data/API redirects and reversal. Axe checks and overflow assertions passed on the follow-up form. [Desktop evidence](milestone-3/desktop-follow-up.png) and [mobile evidence](milestone-3/mobile-follow-up.png) were visually inspected. The challenge test simulated the provider only at the local browser boundary; authenticated API validation, persistence and publication remained real. The existing provider-outage test now explicitly blocks the provider script instead of relying on an empty local site key. A cold development dependency reload interrupted the first desktop run; the subsequent complete suite passed. Final `npx tsc --noEmit` also passed. Local logs are retained under ignored `test-results/milestone-3-review-{check,e2e,types}.log`.

`npm run build:staging` passed; its local log is `test-results/milestone-3-review-staging-build.log`.

These review fixes have not been deployed or reaccepted on staging. The deployment version and genuine-provider evidence above apply to the original milestone implementation. Before rollout, use the [documented migration preflight and recovery procedure](../operations/deployment.md), apply `0008`, and repeat affected contributor/operator and native-cache checks on staging. No production operation or CI inspection was performed for these fixes.
