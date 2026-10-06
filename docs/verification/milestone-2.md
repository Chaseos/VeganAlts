# Milestone 2 staging verification

Verified on **2026-10-05** against the [approved specification](../MILESTONE_2_PLAN.md) and [GitHub milestone 2](https://github.com/Chaseos/VeganAlts/milestone/2), issues #7–#12. The implemented journey is available at **https://staging.veganalts.com**. No core contribution-loop blocker remains in the checks below. Production still serves its coming-soon page.

## Deployment and data

- Branch: `feature/milestone-two-core-ranking`, based on updated `develop` at `dbf54ce`. At the 2026-10-05 staging verification, changes awaited source-control authorization. The user authorized committing, pushing and a ready-for-review pull request to `develop` on 2026-10-06. No merge or production deployment was performed.
- Staging Worker: `veganalts-staging`; custom domain `staging.veganalts.com`.
- Latest application version: `16ceafbe-e468-46cb-99e7-2ea111902772`. This includes stylesheet priority, immutable media caching and accessible rating-label/landmark refinements, following the verified core-flow deployment `14acae7a-4200-4265-beb5-500d1c39d1a1`.
- Applied append-only migration: `0005_core_ranking_reads.sql`. Fresh test databases apply the complete ordered migration history. The existing staging database upgraded in place; remote foreign-key check returned zero violations.
- Staging catalog: 31 development products, ten rankable categories plus four ancestry categories, 32 formulas, 28 demo tasters, and 406 ratings at verification time. This includes two real staging contributions; counts may change through later use.
- All 31 front illustrations passed the actual upload service, Cloudflare Images transforms, D1 metadata commit and R2 full/thumbnail reads. The existing evidence image remains available, giving 32 accepted images. Fixture labels explicitly distinguish them from verified manufacturer claims.
- Repeat staging seed and aggregate rebuild preserved hashes of two real accounts, two real ratings, two Tried records and the historical formula. The staging catalog currently has no verified formulas; integration coverage separately verifies that non-null verification timestamps survive reseeding. Production seed refusal remains enforced.

## Issue-by-issue acceptance

| Issue                                                                         | Implemented and verified evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#7 Public browsing](https://github.com/Chaseos/VeganAlts/issues/7)           | SSR home, grouped FTS5 search, category rankings, canonical product pages and read-only formula history. Alias `mince`, broad `beef`/`cheese`, brands and category ancestry find useful results. Scores use the approved `4.2/5` presentation, full-precision Bayesian ordering, rating counts, Early labels and separate unranked products. Public metadata, noindex, image fallback, unavailable/empty/not-found/error states and responsive layouts are implemented. Browser discovery and catalog integration checks pass. The older issue wording “Match score” is superseded by the approved specification. |
| [#8 Public/private caching](https://github.com/Chaseos/VeganAlts/issues/8)    | Public loaders call services directly without session reads; hydrated controls use a private batched request. Document/data/API keys, deployment and country separation, cookie/write/private exclusions, fresh delivery nonces and material invalidation are covered. Native Workers Cache was exercised remotely for hit, refresh, stale/cold failure, bounded stale lifetime, request collapsing and purge. Actual rating writes left public content unchanged until expiry.                                                                                                                                   |
| [#9 Rating and authentication](https://github.com/Chaseos/VeganAlts/issues/9) | Real Google and Apple returns automatically saved the original selected score on staging. One-tap create/update, authoritative rating and Tried state, serialized/coalesced changes, lost-response retry, expiry, cancellation/session loss and formula-conflict recovery pass automated checks. Ownership, active account, origin, integer score, formula/category eligibility and rate limits are enforced at the server boundary.                                                                                                                                                                              |
| [#10 Profiles and My Ratings](https://github.com/Chaseos/VeganAlts/issues/10) | Public profile output is limited to chosen identity and contribution summaries. Private My Ratings shows product/category/score/formula/date, returns to the exact current control or historical formula, and uses a stable updated-time/ID cursor. Privacy, tied timestamps, pagination, actual saved ratings and edit navigation pass. Settings, profile, My Ratings and sign-out are connected through account navigation.                                                                                                                                                                                     |
| [#11 Operations and abuse](https://github.com/Chaseos/VeganAlts/issues/11)    | Separate staging Web Analytics and Analytics Engine events are active. Studio showed real cache-hit page views, searches, sign-in success, rating-created and rating-updated events. Safe event-log fallback is tested. Request IDs, coarse routes/timings, cache results, structured errors and dependency classification are available. Real elevated-risk sign-in triggered Turnstile and successfully recovered after managed verification. Configured rating/search/auth/upload limits and upload processing budgets remain enforced.                                                                        |
| [#12 Integrated verification](https://github.com/Chaseos/VeganAlts/issues/12) | Strict types, unit/integration coverage, Worker builds, desktop/mobile journeys, actual provider returns, native cache verification, media smoke, migration/seed preservation and query measurements pass. Screenshots, keyboard checks, axe, metadata and restrictive CSP were inspected. Performance evidence and explicit limits are recorded below. Final public-launch hardening remains deferred.                                                                                                                                                                                                           |

## Real contribution journey

1. Anonymous discovery led to the demo Beyond Burger product. A selection of **4/5** initiated Google sign-in. The return preserved the intended product/control and displayed **Saved 4/5** without another confirmation.
2. My Ratings displayed the saved current-formula rating. Following its edit link and choosing **5/5** displayed **Saved 5/5**. Sign-out completed.
3. An anonymous selection of **3/5** initiated Apple sign-in. The user completed Apple's credential step; the return displayed **Saved 3/5** automatically. My Ratings displayed that account's separate score and rating date.
4. The previously cached public document remained unchanged after both contributions. After its 15-minute lifetime, a request at **22:51:31 UTC** returned `X-Public-Cache: EXPIRED`, **3.6/5**, and **2 ratings** without a rating-triggered purge. Canonical sum 8 gives `(8 + 3.5 × 10) / (2 + 10) = 3.5833333333333335`; only presentation rounds it.
5. Reseeding and rebuilding after these checks preserved both accounts and their contributions exactly.

Provider simulation exists only in the local browser harness. No staging authentication bypass or test login endpoint was deployed. OAuth secrets, session cookies and provider identity are not included in this record.

## Automated checks

| Check                                                            | Result                                                                                                               |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript, Wrangler binding types and React Router types | Passed                                                                                                               |
| Vitest unit/integration suite                                    | **46 tests passed in 17 files**                                                                                      |
| Local Playwright Chromium desktop/mobile                         | **14 checks passed**                                                                                                 |
| Staging public Playwright Chromium desktop/mobile                | **4 checks passed on the final deployment**, including all default axe rules and the experimental visible-label rule |
| Worker build and staging deployment                              | Passed                                                                                                               |
| Remote native cache fixture                                      | Passed; disposable Worker removed                                                                                    |
| Staging seed preservation and rebuild                            | Passed                                                                                                               |
| Remote catalog plans and foreign-key audit                       | Passed; zero foreign-key violations                                                                                  |

The rating suite exercises concurrent writes, atomic canonical/Tried/aggregate updates, exclusions, duplicate retries, stale snapshots, rebuild equivalence, formula transitions and country isolation. HTTP tests use genuine signed local Better Auth sessions, including an expired persisted session, and verify that failed or unchanged writes do not emit a successful contribution event. Analytics failure cannot fail a committed rating.

Browser recovery checks cover rapid changes, a committed write whose response is lost, explicit retry, interrupted/cancelled sign-in, lost sessions, automatic resume only once, eligibility conflict and recoverable rate-limit/security-check failure. Contract tests cover pending-action expiry, original formula/category binding, malformed search, unsafe return destinations and cursor validation. The provider harness refuses remote use.

## Native cache and isolation evidence

`scripts/verify-cache-staging.ts --staging` deployed an isolated, disposable Worker without application data, auth or production bindings. At the ATL location it verified:

- MISS → HIT returned the same template body with a different delivery nonce.
- Expiry returned UPDATING, followed by the refreshed revision.
- A refresh failure returned STALE, then 503 after the bounded stale allowance ended. A cold failure returned 503 immediately.
- Cookie-setting responses stayed BYPASS and were regenerated on repeated requests.
- Eight concurrent reads of a cold key returned one generated body.
- A material cache-tag purge caused MISS and a new revision before the ten-minute target's natural expiry.

The fixture uses shortened five-second freshness, two-second background refresh and six-second error-stale windows. Production route durations and the 86,400-second error-stale bound are asserted separately. Purge propagation is asynchronous and was allowed to complete. Fixture cleanup succeeded, including earlier failed verification attempts.

Public browser checks compare normalized anonymous and cookie-bearing HTML, verify fresh nonces, distinguish React Router data from HTML/API output and assert private/no-store responses. Integration checks ensure delivery does not bless untrusted script nonces or widen explicitly private cache directives. The gateway records page views for cache hits without putting private state in the shared entrypoint.

## Analytics and abuse evidence

The user approved deployment with the Workers event-log fallback when Analytics Engine initially rejected activation with error 10089. Activation later propagated, deployment accepted the binding, and live Studio queries returned cache-hit views, search activity, two successful sign-ins, two rating creations and one update. **The Analytics Engine activation/ingestion follow-up is complete.** The fallback remains implemented and tested for an absent or failing binding.

Cloudflare's production zone beacon initially also appeared on staging in browser-like requests. A hostname-specific configuration rule now disables automatic RUM injection only for `staging.veganalts.com`; the application supplies exactly one staging beacon on public documents and none on private documents. Production retains its existing analytics configuration. Rule details, event queries, privacy constraints and failure diagnostics are in the [runbook](../operations/core-ranking.md).

An actual staging sign-in reached the elevated-risk threshold and displayed the security-check recovery UI. The managed Turnstile widget completed, enabled the provider buttons and the verified request reached Google's account chooser. No challenge was manually solved or bypassed. Server tests cover failed, expired, unavailable, wrong-host and wrong-action verification, as well as hard limits. Ordinary public browsing remained unchallenged.

## Responsive, accessibility and performance evidence

Desktop and mobile screenshots were visually inspected for the homepage, category rankings and product controls/history. Keyboard skip-link navigation, responsive overflow, save announcements, metadata and script nonces passed browser checks. The expanded axe run includes default best-practice rules and the experimental visible-label rule; no violations remain in the tested home/product journey. Rating labels preserve their visible wording, and the development banner is a named landmark.

Mobile Lighthouse 13.5.0 used its standard simulated mobile throttling, with a fresh browser profile against staging:

| Page                 | Performance | Accessibility |   LCP |  TBT | CLS | Report                                |
| -------------------- | ----------: | ------------: | ----: | ---: | --: | ------------------------------------- |
| Home                 |      **99** |       **100** | 1.7 s | 0 ms |   0 | `lighthouse-home-final.json`          |
| Ground Beef category |      **99** |       **100** | 1.7 s | 0 ms |   0 | `lighthouse-category-final.json`      |
| Beyond Beef product  |      **97** |       **100** | 2.1 s | 0 ms |   0 | `lighthouse-product-media-cache.json` |

Home/category reports were captured on version `14acae7a-4200-4265-beb5-500d1c39d1a1`; the product report was captured on final version `16ceafbe-e468-46cb-99e7-2ea111902772`, after the shared stylesheet/image refinements. The final deployment also passed the full public browser checks. These are lab samples with shared caches populated by normal verification traffic, not a guarantee for every cold location or real device. Earlier product samples of 78–90 exposed stylesheet ordering and uncached image reads; those reports remain available rather than being discarded.

React's [stylesheet precedence support](https://react.dev/reference/react-dom/components/link) places the stylesheet before module preloads. Product hero images have high fetch priority. Immutable image variants now use the existing native shared cache; a real read changed from a **480 ms MISS to 3 ms HIT**, with identical 10,644-byte content for anonymous and cookie-bearing requests. Conditional GET returned **304** with an empty body, and HEAD returned the same public metadata without bytes. This avoids repeat D1/R2 work while preserving the accepted/archived-only media policy, unchanged URLs and browser caching. `media-cache.json` records the check.

## Query and resource measurements

Read-only measurements on the staging demonstration catalog:

| Query                         | Results | D1 rows read | Rows written | SQL duration | Plan                                                                      |
| ----------------------------- | ------: | -----------: | -----------: | -----------: | ------------------------------------------------------------------------- |
| Aggregate leaderboard         |       3 |           73 |            0 |    1.2079 ms | Country/status/current-formula/aggregate/membership indexes; bounded sort |
| Broad-term FTS product lookup |       6 |           27 |            0 |    0.6785 ms | FTS5 virtual index and current-formula index                              |
| Private ratings cursor        |      21 |           21 |            0 |    0.5455 ms | `ix_ratings_user_updated_id`                                              |

The leaderboard never reads all raw ratings. These are representative bounded-query measurements on a small catalog, not a production load test. No speculative index, external search service or additional paid infrastructure was introduced. The existing $10/month development target and upload budgets remain documented; billing alerts are monitoring, not hard spending caps.

## Artifacts and reproduction

Local evidence is retained under ignored `test-results/milestone-2/` rather than committed with credentials or browser artifacts:

- `google-auto-save.jpg`, `rating-edited.jpg`, `apple-auto-save.jpg`, `apple-my-ratings.jpg` — actual provider returns and contributions.
- `staging-home.jpg` — finished public homepage.
- `aggregate-refresh.txt`, `native-cache.json`, `media-cache.json` — real expiry and native cache behavior.
- `seed-preservation.json`, `query-plans.json` — protected-record hashes and measured reads.
- `analytics-events.jpg`, `staging-analytics-isolation.jpg`, `turnstile-completed.jpg` — operational evidence.
- `lighthouse-*.json` — raw mobile performance reports, including earlier measurements that motivated fixes.
- `test-results/staging-final/` — desktop/mobile home, category and product screenshots from public journey checks.

```sh
npm run check
npm run test:e2e
TEST_BASE_URL=https://staging.veganalts.com npx playwright test tests/e2e/discovery.spec.ts --output=test-results/staging-final
npx tsx scripts/inspect-catalog-staging.ts --staging
npx tsx scripts/verify-seed-staging.ts --staging
npx tsx scripts/verify-cache-staging.ts --staging
```

The last two commands intentionally mutate only approved staging fixtures or deploy/remove an isolated verification Worker. Real provider returns require the account holder's normal sign-in. They are not replaced by the automated provider harness.

Deferred scope remains Trending, standalone Tried, detailed-rating UI, community submissions/moderation, retailers and final public-launch hardening. GitHub issue closure follows pull-request review and integration; this record reports implementation and staging verification rather than claiming a merge or release.

## Review follow-up: 2026-10-06

[PR #27](https://github.com/Chaseos/VeganAlts/pull/27) feedback is covered by regressions for the latest queued score surviving reauthentication, inactive categories retaining read-only historical scores, and repeated seeds preserving product-specific notes. Each regression reproduced its reported failure before the fix. Browser checks also cover hydration-safe sign-in links that retain fragments and the visitor's full return URL.

Local verification passed: strict types, **48 unit/integration tests in 17 files**, **18 desktop/mobile browser checks**, and the Worker build. Browser evidence is under ignored `test-results/pr-comment-fixes-final/`. These source changes were verified locally; the staging deployment evidence above remains the 2026-10-05 record.
