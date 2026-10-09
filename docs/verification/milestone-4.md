# Milestone 4 verification

Verified on 2026-10-09 against the approved [Milestone 4 specification](../MILESTONE_4_PLAN.md). Implementation, local verification and staging acceptance are complete for #15, #16, #18, #21, #23 and #24. As agreed, launch readiness was verified on staging; production was not changed.

## Delivery and scope

- Branch: `feature/milestone-four-trust-lifecycle-discovery`, based on `develop` at `580498f`. One commit per checkpoint, published for review as [Chaseos/VeganAlts#30](https://github.com/Chaseos/VeganAlts/pull/30).
- Staging: [staging.veganalts.com](https://staging.veganalts.com). Final Worker version: **`27de9525-e1c7-497a-8ecd-41117d51a261`**, Worker `veganalts-staging`.
- Applied append-only migrations `0010`–`0015` to staging. None were applied to production, which still has migrations through `0004`.
- Automated moderation uses Cloudflare Workers AI Clef on staging (`MODERATION_PROVIDER=clef`). Production is configured with the `AI` binding and `MODERATION_PROVIDER=disabled`.
- Production still serves the coming-soon page. `PUBLIC_LAUNCH` is `"false"` everywhere; cutover steps are in the [launch checklist](../operations/launch-checklist.md).

## Issue-by-issue acceptance

| Issue                                                                                          | Implemented behavior                                                                                                                                                                                                 | Supporting evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#15](https://github.com/Chaseos/VeganAlts/issues/15) Comments                                 | Formula-anchored product comments, edit and delete, usefulness up/down votes, Wilson-bound Best ordering, collapse, reporting, held comments and operator hide with reversal                                         | One genuine account posted and edited a comment; real `clef-flash` returned READY (634 input tokens, 565 ms). The second account voted Useful, switched to Not useful and back (counts 1/0 → 0/1 → 1/0) and reported it. Resolving the report with "hide comment" purged caches: the public API and product HTML returned no comment (`MISS`). Reversal restored it with its vote. [Comments](milestone-4/staging-comments.jpg). Tests: `comments.test.ts`, `comments.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [#16](https://github.com/Chaseos/VeganAlts/issues/16) Photo slots                              | Five canonical slots, add-to-empty and replacement proposals with reasons, duplicate folding, Clef identity and type checks, archived prior photos                                                                   | A deliberately wrong "development image" proposed for Beyond Beef's empty nutrition slot was held: Clef flagged identity and image type ("matches product: unclear"). The operator saw the private thumbnail and rejected it, so the canonical slot stayed empty. Tests: `photo-slots.test.ts`, `photos.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [#18](https://github.com/Chaseos/VeganAlts/issues/18) AI-assisted moderation and confirmations | Provider-neutral decisions (READY, NEEDS_CHANGES, NEEDS_REVIEW, BLOCKED) after deterministic gates; budgets and leases in D1; risk tiers; confirmations; automatic acceptance by the audited system actor; reversals | A tier-1 alias was applied immediately after READY and found by search, then reversed. A tier-2 category addition with inconclusive evidence got NEEDS_REVIEW; a second account confirmed it and an operator accepted it and then reversed it. A better-evidenced proposal (Impossible Beef also replaces Beef Burgers) got READY, was confirmed by the other account, and was **accepted automatically by `veganalts-system` in the 02:17 UTC hourly run** (action `01a11e74-2526-74f7-b93f-909737d13587`). That run also purged the cached Beef Burgers listing: a copy cached at 02:14, with a 10-minute TTL, was a `MISS` listing the product at 02:21. An operator then reversed the change, and the listing dropped the product immediately. Calibration matched **20/20** labeled cases across all six decision kinds ([results](milestone-4/clef-calibration.json)). Tests: `moderation-decisions.test.ts`, `proposal-confirmations.test.ts`, `policy-engine`, `confidence` unit tests. |
| [#21](https://github.com/Chaseos/VeganAlts/issues/21) Hardening and launch readiness           | `PUBLIC_LAUNCH` gate, environment-aware robots.txt, sitemap, BreadcrumbList/ItemList JSON-LD, policy pages, security matrix, backup drill, dataset audit, load and Lighthouse checks                                 | See [performance and caching](#performance-and-caching), [recovery](#recovery-and-backups) and [launch readiness](#launch-readiness). Tests: `security.test.ts`, `launch.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [#23](https://github.com/Chaseos/VeganAlts/issues/23) Category proposals and taxonomy          | Operator-reviewed category proposals with Clef relevance checks, slug history and redirects, taxonomy workspace, homepage features, reversible transfer merges                                                       | A "Sour Cream" proposal from the first account got clef-flash answers shown on the review page, and was rejected with a reason. Merging Mozzarella into Cheddar made `/us/mozzarella` a `302 private, no-store` redirect, combined the rankings and folded the aliases. Reversal restored **ratings (74), memberships, stats, categories and aliases to hashes identical to the pre-merge snapshot**. Tests: `taxonomy.test.ts`, `taxonomy.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [#24](https://github.com/Chaseos/VeganAlts/issues/24) Top, Trending and New                    | Daily rollups from canonical rows, decayed Trending read model, New by publication date, `view` cache key, homepage sections                                                                                         | Top, Trending and New tabs render on staging and are served from the shared cache. [Trending](milestone-4/staging-trending.jpg). Tests show that Trending and New leave Top scores and order unchanged. Tests: `discovery.test.ts`, `discovery-views.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

| Acceptance reference                               | ID                                     |
| -------------------------------------------------- | -------------------------------------- |
| Comment                                            | `01a11e1a-7883-703c-895f-5bb2ae4ab418` |
| Comment report                                     | `01a11e24-7945-757d-92da-ca0b7049a398` |
| Alias proposal (tier 1, applied then reversed)     | `01a11e1b-b8db-703a-92c3-b6853078f8ed` |
| Category addition, operator accepted then reversed | `01a11e1c-7c81-71a5-b5ed-f02ba9d3c932` |
| Category addition, automatic acceptance            | `01a11e25-50e4-75b8-bfdc-2e0db9c187d7` |
| Photo proposal (held, rejected)                    | `01a11e1e-9a27-77e8-9ecb-ddc24eb2f7cc` |
| Category proposal (rejected)                       | `01a11e1d-8e7b-7373-9563-40b886abb248` |

Staging Clef usage during acceptance: **8 decisions, 5,145 input tokens**, 253–633 ms each, which is well under one cent. Calibration used 24,342 input tokens.

## Local verification

The Milestone 3 baseline was 77 tests in 25 files and 24 browser tests. The final branch has **154 passing tests in 36 files** and **38 passing desktop and mobile browser tests**. `npm run check` covers type generation, strict TypeScript, unit and integration tests and the build. Logs: `test-results/milestone-4-review-check-6.log` and `test-results/milestone-4-final-e2e.log`.

Browser tests cover comments, votes, held comments and collapse; photo proposals; confirmations and automatic acceptance; automated outcomes through the fake provider; category proposals, merge and redirect; Top, Trending and New; policy pages, robots, sitemap and structured data. Each runs axe checks at 390 px and desktop widths.

## Staging rollout

- Read-only pre-checks: no `veganalts-system` user or `system` handle; `comments`, `comment_reactions` and comment reports all empty, as migration `0011` requires.
- Pre-migration Time Travel bookmark: `000000ab-00000000-000050ff-feeddc904d2ef605effb849b447d8049`.
- `npm run db:migrate:staging` applied `0010`–`0015`; `PRAGMA foreign_key_check` returned no rows. The system actor has no `account` row, so it cannot sign in.
- `npm run taxonomy:seed:staging`, `npm run rankings:rebuild:staging` (37 formulas, 15 days of Trending) and `npx tsx scripts/verify-seed-staging.ts --staging` (verified, protected records unchanged).
- Two genuine accounts (Google and Apple) carried out the flows above. Neither account's credentials were handled by automation, and no test authentication or synthetic accounts were used.
- After acceptance, every test change was reversed or rejected. The moderation inbox is empty (no pending proposals, category proposals, open reports or held comments), and `PRAGMA foreign_key_check` returns no rows. The test comment remains, labeled as a staging acceptance test.
- `TEST_BASE_URL=https://staging.veganalts.com npm run test:e2e`: 12 public tests passed; 26 that need the local session fixture were skipped and were exercised interactively instead.

Acceptance found and fixed these issues (commit `0c1ebc9`):

- A product leaving a category, or an hourly automatic acceptance, did not purge the affected cached listings. A new integration assertion fails without the fix.
- Automated-check panels showed Clef's confidence margin instead of the chosen option's probability.
- Switching the proposal type kept the previous field's value.
- The photo slot selector showed raw keys.
- Authors could not see their own new comment until the 15-minute product cache expired.
- Category reviews did not show automated answers.
- The reversal form did not name the decision it targets.
- Zod's eval probe produced a CSP violation.
- The photo note and the merge-reversal layout were wrong.

Pull request review found twenty more issues, fixed in `481c3cb`, `5d84296`, `8dbfab6`, `a37cff5`, `204af1d` and `0ffbed9` and covered by tests:

- Category merges and reversals now re-derive the full Trending window for both categories, so moved activity is no longer missing until the nightly pass.
- Catalog New views now honor a configured `newDays`.
- The homepage New list now requires an eligible membership in an active, rankable category.
- Category edits keep each alias's market scope.
- Category edits reject new aliases that already name another category.
- A category addition can no longer be accepted after its category is retired.
- Merges carry market-scoped donor aliases to the survivor.
- Discovery labels show the configured New window.
- Authors keep edit controls on older paginated comments.
- Accepting a category proposal rechecks its proposed names and fences them in the commit.
- A merge is reversed only after later edits to either category, so the reversal stays exact.
- The hourly automation pass rotates past proposals that stay ineligible.
- Automatic acceptance recounts confirmations from active accounts and fences that count in the commit.
- The category proposal allowance is checked before any Clef call.
- Operator category creation and edits fence new names against concurrent claims.
- An accepted rename must own its new identity key.
- Comments check the daily allowance before any Clef call.
- Homepage feature sets, and their reversals, require every category to be active.
- Reversing a category edit rechecks the names it restores.
- An edit made before a merge can only be reversed after that merge is reversed.

## Performance and caching

`npx tsx scripts/verify-staging-public.ts --load` (anonymous, read-only):

- Home, category Top, Trending and New, product, comments API, policy page and sitemap were all served from the shared cache (`HIT`). A session-like cookie neither bypassed nor changed the cached copy.
- Private reads returned `401 private, no-store`. Every staging response carried `X-Robots-Tag: noindex, nofollow`.
- Two minutes at about 20 requests per second: **2,370 requests, 0 errors, 99.9% cache hits, p50 51 ms, p95 82 ms, max 337 ms**.

Mobile Lighthouse 13.5.0 (simulated throttling):

| Page                 | Performance | Accessibility | Best practices |
| -------------------- | ----------- | ------------- | -------------- |
| Home                 | 100         | 100           | 100            |
| Category             | 100         | 100           | 100            |
| Product (warm cache) | 98–99       | 100           | 100            |

SEO scores 69 on staging only because staging deliberately blocks indexing. The first product view after a deploy scored 86–88: caches are keyed by deployment version, so that view renders uncached.

## Recovery and backups

`npx tsx scripts/verify-backup-staging.ts --staging` exported staging D1 (schema, then data with deferred foreign keys), restored it into a scratch database and compared every table. After the migrations, **59 tables and 1,557 rows matched with no mismatches**. The FTS index rebuilt 49 search documents, and all **84 R2 objects referenced** by accepted or archived images exist. The export lived only in a deleted temporary directory. See [backup and recovery](../operations/backup-recovery.md).

## Launch readiness

- Production (`veganalts.com`) still shows the coming-soon page. Catalog routes and `/sitemap.xml` return 404.
- `npx tsx scripts/audit-launch-dataset.ts staging` reports `readyForLaunch: false`, as expected. It flags the 31 development products, 28 demo accounts, missing ingredient evidence and unreviewed Vegan classifications in the staging fixtures. It reports no duplicates, empty rankable categories or categories without aliases.
- The taxonomy list in `db/seed/taxonomy.ts` and the policy drafts were reviewed and approved. The support contact is `chaseosapps@gmail.com` in every environment.

## Recovery references and limits

- Previous staging Worker version (Milestone 3): see `wrangler deployments list --env staging`. Milestone 4 versions: `44cebbae` (initial), `62185f75`, `11687dd7`, `9abdccd1`, `5a996db3`, `a1ff7d34`, `406a03ad`, `e3dc9b05` and `27de9525` (final).
- Prefer audited reversals for catalog and taxonomy corrections. A Time Travel restore discards later contributions and needs an explicit operator decision.
- Clef thresholds are provisional, calibrated on 20 labeled cases. Trending weights are provisional (RANKING §14). Both need recalibration with real traffic.

## Follow-ups

- [#31](https://github.com/Chaseos/VeganAlts/issues/31) Production cutover, following the [launch checklist](../operations/launch-checklist.md).
- [#32](https://github.com/Chaseos/VeganAlts/issues/32) Launch catalog entry through the normal submission and review flow.
- [#33](https://github.com/Chaseos/VeganAlts/issues/33) Production taxonomy seed (`--confirm-taxonomy-only`).
- [#34](https://github.com/Chaseos/VeganAlts/issues/34) Trending and Clef threshold recalibration with real traffic.
- Existing [#26](https://github.com/Chaseos/VeganAlts/issues/26) (contributor trust) and [#28](https://github.com/Chaseos/VeganAlts/issues/28) (alternative moderation benchmark).
