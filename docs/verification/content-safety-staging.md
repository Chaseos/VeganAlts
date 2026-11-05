# Content-safety staging verification — 2026-10-23

The owner authorized the version-1-preserving staging catalog refresh, Worker deployment, and authenticated live safety checks. Production was not changed and remains disabled for OpenAI safety.

## Staging state

- Worker version `9e67b39d-771b-4c05-8389-c824f1bf0c53` is active on `staging.veganalts.com` after the transport fix below.
- The staging D1 database remains on version 1. `npx wrangler d1 migrations list veganalts-staging --remote --env staging` reported no migrations to apply; no schema migration or database reset was applied.
- The required provider-attempt, automatic-job and request-lease tables and expanded moderation decision subjects are present.
- Staging selects `CONTENT_SAFETY_PROVIDER=openai`; Wrangler lists the `OPENAI_API_KEY` secret name. The secret value was not read or recorded.
- Catalog import and preservation checks passed: all 1,148 manifest products were imported, the unrelated pre-existing product was preserved, four formula updates retained history, and derived-data hashes matched. The database contains 1,149 active products total. No production data was touched.
- `/healthz`, the landing page and robots policy returned the expected staging responses. Public samples rendered the imported vegan, plant-based and appears-plant-based classifications.

## Authenticated live checks

Google sign-in completed after the owner approved use of the existing Chrome account for staging. The session was used only for the checks below.

| Scenario                                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary negative product comment                   | OpenAI returned `flagged=false` (1,177 ms), Clef completed (784 ms), and the combined decision was `READY`. The comment was posted, then removed through its author control after verification.                                                                                                                                                                                                                                             |
| Threatening profile display name                    | OpenAI flagged harassment, threatening harassment, and violence (868 ms). The form asked for another name. Reloading confirmed the original handle and empty display name were unchanged.                                                                                                                                                                                                                                                   |
| Flagged-content rejection before Clef               | A threatening comment produced a completed OpenAI safety result (582 ms) and combined `BLOCKED` decision. No evidence/Clef attempt exists for that decision, and no comment was created.                                                                                                                                                                                                                                                    |
| Normalized WebP image through the contribution flow | The existing PNG development fixture was uploaded through the photo-proposal form and normalized to 1,800 × 1,350 WebP plus a thumbnail. OpenAI completed in 471 ms with `flagged=false` and recorded both `text` and `image` input types. Clef then completed in 1,940 ms and retained the existing evidence-review requirement because the synthetic image did not establish product identity or image quality. No catalog photo changed. |
| Private evidence access                             | An unauthenticated request for the staged image returned HTTP 401. The test photo stayed private.                                                                                                                                                                                                                                                                                                                                           |

The live decisions record separate completed OpenAI and applicable Clef attempts. Safety rejection remains authoritative; no score cutoff was added.

## Initial failure and fix

The initial deployment (`af75d8a2-c925-4e32-a397-99ea803060c6`) recorded immediate `provider_error` results with 0 ms safety latency. A local workerd probe reproduced the cause: storing native `fetch` on the provider instance and invoking it as a method loses the global receiver required by Workers, producing `Illegal invocation` before an HTTP request is sent. Node tests with injected arrow-function mocks did not expose this.

The adapter now wraps `globalThis.fetch(...args)` as its default transport. A new receiver-sensitive regression test failed before the fix and passes afterward. The live checks above confirm the configured staging key has working moderation permission.

## Test cleanup

- The posted test comment (`01a16aab-e6cf-706e-a5e2-5a5bd45e5f4b`) is deleted; its database tombstone remains for history.
- The synthetic photo proposal (`01a16aae-0081-72f6-a58d-ec85e7f40881`) was rejected through the operator workflow with an explicit test-cleanup reason. Its private evidence and audit history remain; existing catalog photos were retained.
- The original failed test's automatic job (`01a16a88-20c0-71fe-bb06-130f84d3e9fa`) was retired with a guarded metadata-only update to `retry_required` / `staging_test_retired`. Its private payload was preserved, and scheduled work can no longer publish it later. This was test cleanup, not a change to the retry policy.
- All 1,149 active products remain present. No database reset, schema update, or production change was performed for this fix.

## Local verification

`npx vitest run tests/integration/content-safety.test.ts tests/unit/openai-moderation.test.ts --reporter=dot` passed: 2 test files, 18 tests, including the new default-transport regression. `npm run typecheck` passed. `npm run deploy:staging` completed its staging Worker/client build and deployed the new version using the generated Worker configuration.

These local tests use fake or mocked providers. The separate authenticated checks above used real OpenAI and Clef calls on staging. Rate-limit/budget races, retry exhaustion, stale edits, worker fencing and suspended-account recovery remain covered by mocked integration checks rather than intentionally exhausting live staging capacity or creating provider outages.

The staging deployment and separate production activation steps are documented in [deployment and recovery](../operations/deployment.md#openai-safety-activation-and-limits). OpenAI safety remains disabled in production.
