# Milestone 3: Community Catalog & Moderation

Approved on 2026-10-07. Complete [milestone 3](https://github.com/Chaseos/VeganAlts/milestone/3), issues #13, #14, #17, #19, #20 and #22, through real staging verification. The starting milestone 2 baseline passes 48 tests in 17 files. Work starts from updated `develop` on `feature/milestone-three-community-catalog`.

## Agreed boundaries

- Require a front photo and an ingredient-panel photo or manufacturer ingredient source for automatic publication. Do not require typed ingredients.
- Automatic publication uses a provisional evidence-based classification. **Vegan** requires operator review; evidence submission does not imply verification or certification.
- An authorized operator assesses an ingredient concern before applying **Under Review**.
- Duplicate consolidation leaves the survivor's ratings and metadata unchanged. Archive the donor and its contributions without transferring them; preserve recoverable history and redirect old URLs.
- Deliver product/photo report UI and test comment-target reporting support. Visible comment reporting is deferred to #15. This is the approved amendment to #17.
- The donor-archival policy supersedes #22's expectation that donor contributions are combined with the survivor. Preservation means recoverability, not transfer or inclusion in the survivor's score.
- Retain the US public catalog and green-and-cream visual identity. Improve contribution/moderation UX while preserving ranking prominence.
- No external AI moderation, contributor trust, full comments, general photo management, Trending, or production launch. No automated community confirmation thresholds.
- Completion means staging verification and documented evidence. Commits, pushes, PRs, issue changes, merging, production deployment, and CI investigation require separate authorization.

## Implementation sequence

### 1. Specification and persistence

Update product, moderation, architecture, database, API and agent guidance intentionally before changing behavior. Keep the modular monolith, thin handlers, services, domain policy and repositories. Use append-only migrations and the existing application/auth boundary.

Add pending submissions; operational upload/idempotency receipts; quota counters and expiring leases; formula-specific classifications/evidence/certifications and date precision; canonical brand/retailer lookup and aliases; duplicate consolidations and reversible redirects; and necessary constraints, indexes and revision fencing. Reuse existing proposals, reports, confirmations and audit tables. Current product classification fields project the current formula. Never infer historical classifications from current status.

### 2. Product submission and temporary media (#13)

Add entry points in navigation, category pages and search empty states. The signed-in guided flow identifies product/brand/country/categories, shows duplicate/relationship candidates, collects photos and ingredient evidence, reviews, and returns publication, corrections or a private review receipt. Reuse existing brands; validate proposed brands within the submission. One product may belong to multiple appropriate categories.

Expose a provider-neutral decision contract: `READY`, `NEEDS_CHANGES`, `NEEDS_REVIEW`. Authenticate, apply limits, validate and check duplicates before expensive processing; repeat identity checks at finalization. Never create canonical products, versions, memberships or images before READY. Operational receipts contain ownership, hashes, quotas, leases and result IDs; only held submissions persist a proposed catalog payload.

Reuse existing validation, transformations, evidence resolution and R2 adapters. Deduplicate by content hash/transformation policy across idempotency keys. Stage private media, copy approved derivatives to canonical keys, then publish through a guarded atomic D1 batch. Recover failures and unreferenced promotion objects. Contributor/operator authorization governs staged media. New products enter search and unranked category sections with a 30-day New label measured from publication.

### 3. Manual review and reporting (#17)

Use the existing administrator allowlist for a cursor-paginated review area covering submissions, reports, retailer proposals and required product changes. Show evidence, before/after previews and reasons. Support accept, reject, resolve, dismiss and follow-up where appropriate; contributors can see their own outcomes.

Deduplicate active reports by reporter/target/reason, updating evidence instead of inflating confidence. Prioritize ingredient concerns. Reports never directly alter canonical facts. Every material operator action rechecks authorization/current state, commits resolution/canonical changes/audit atomically, rejects stale conflicts, retains recoverable prior states, maintains search, and invalidates material public changes including removed media. General community proposal voting/automatic acceptance remains deferred.

### 4. Formula, lifecycle and classification (#19, #20)

Provide focused proposals for reformulation, packaging, discontinuation, reintroduction and classification evidence. Material reformulation creates a new current formula under the same product; previous ratings, comments and evidence remain with their original formula. Packaging does not reset ratings. Discontinuation removes active discovery/ranking but preserves readable history. Reintroduction reuses a formula only with explicit equivalence evidence; otherwise it creates a new formula.

Preserve date precision. Distinguish classification, manufacturer wording, certification and evidence in persistence/UI. Operator-confirmed Under Review removes active ranking eligibility and disallows new ratings. Use revision fencing against competing decisions and simultaneous ratings. Reversal preserves contributions created after the original action.

### 5. Retailers (#14)

Provide canonical search with normalized names/aliases and deliberate retailer proposals. Authenticated users add/confirm country-valid product-retailer relationships; one current stance per user prevents vote inflation while allowing recency refresh. Show Commonly found at, independent counts and last confirmation. Confirmations older than 180 days are stale/uncertain. Negative reports supply evidence; an operator sets `not_current`.

### 6. Duplicates and relationships (#22)

Check normalized brand/name, aliases and package-size equivalence before uploads and at commit. Preserve meaningful flavor/formula distinctions and hold ambiguity. Operator previews identify survivor/donor and explain archival without transfer. Consolidation hides the donor, rejects contributions, preserves private personal ratings with an archived-duplicate label, and redirects donor URLs without donor-only formula selectors. Preserve an audited reversal; prevent redirect cycles and cross-country consolidation. Redirects are reversible and uncached. Product families can span markets without shared ratings; specialty variants remain separate and may be ineligible for base rankings.

## Interfaces and defaults

Add typed `/api/v1` submission preflight/uploads/finalization, personal contribution status, retailer lookup/proposals/confirmation, reports, product-change proposals and `/admin/moderation/*` interfaces. Extend public product data additively with formula evidence/classification, retailer summaries, relationships, publication state and redirects. Preserve existing rating contracts, session-free shared public reads, and private/no-store personal/write responses.

Use stable IDs, strict shared validation, bounded request bodies, same-origin checks, idempotency, opaque cursors and Problem Details. URLs are validated evidence references, not arbitrary server-side fetch targets.

| Control               | Configurable default                                |
| --------------------- | --------------------------------------------------- |
| Submission images     | 3                                                   |
| Image bytes/pixels    | Existing 10 MiB / 40 megapixels                     |
| Staged bytes          | 30 MiB/submission, 100 MiB/account/day              |
| New submissions       | 5/account/day; retries reuse receipts               |
| Concurrent processing | 2 uploads/account                                   |
| Processing attempts   | Preserve 50/day/environment, 3/key                  |
| Abandoned staging     | 24 hours                                            |
| Pending-review media  | 30 days, then expire submission                     |
| Recovery              | Existing hourly schedule, bounded resumable batches |

Use edge burst limits and selective Turnstile, with atomic D1 quotas/leases for exact accounting. Edge limits are location-local and eventually consistent.

## Verification and staging delivery

Complete real services, APIs, UI entry points and affected readers in each checkpoint. No stubs or acceptance by declaration.

- Submission: publication, missing evidence, package-size/duplicate checks, concurrent finalization, held privacy, actionable errors and no premature canonical rows.
- Media/abuse: cross-key hash reuse, byte/concurrency budgets, challenges, interrupted promotion, expired leases, late writes, cleanup and referenced evidence preservation.
- Moderation: unauthorized access, duplicate reports, priority, stale decisions, idempotent resolution, audit and reversal.
- Ranking/history: formula isolation, packaging preservation, lifecycle/reintroduction, Under Review, simultaneous writes and aggregate rebuild equivalence.
- Duplicates/retailers: unchanged survivor scores, donor preservation, redirects/reversal, countries/variants, aliases, unique confirmations and staleness.
- Browser: desktop/mobile submission, review, reports, retailers, formula changes and consolidation; keyboard/focus/errors and axe.
- Regression: discovery, auth, ratings, private history, cache isolation, CSP and production coming-soon.

Run `npm run check`, `npm run test:e2e` and staging builds. Verify fresh/upgrade migrations, foreign keys and seed preservation of real contributions and accepted changes. Before staging migration, capture recovery evidence and verify environment bindings. Deploy staging only; verify genuine contributor/operator flows, actual R2 processing, visibility, redirects and invalidation without auth bypasses. Record issue evidence, commands, deployment version, screenshots, limitations and recovery instructions in `docs/verification/milestone-3.md`. Do not inspect/wait for CI.

## Execution contract

Continue through implementation, verification, fixes, staging deployment and acceptance evidence. Preserve ranking integrity, historical data, privacy/cache separation, existing contributions and production. Complete only after all agreed gates have evidence. If access or a material conflict blocks a gate, finish independent work and report the exact required input without claiming completion.
