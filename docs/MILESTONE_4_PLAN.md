# Milestone 4: Trust, Lifecycle & Discovery

Approved on 2026-10-08. Complete [milestone 4](https://github.com/Chaseos/VeganAlts/milestone/4), issues #15, #16, #18, #21, #23 and #24, through real staging verification. The starting milestone 3 baseline passes 91 tests in 25 files and 22 browser tests. Work starts from updated `develop` (`580498f`) on `feature/milestone-four-trust-lifecycle-discovery`.

## Agreed boundaries

- **Staging only.** #21 hardening is verified on staging as the production-like environment. No production migrations, secrets, deployment or DNS changes. Production configuration and a cutover checklist are prepared, not executed.
- **Launch data.** Provide a production-safe taxonomy-only seed (real categories and aliases; no products or ratings) and a read-only launch-dataset audit, verified locally and on staging. Real products enter later through normal submission and review.
- **Cloudflare Workers AI Clef / Clef-flash** is the single automated decision provider, behind a provider-neutral `ModerationDecisionService`. Real Clef runs on staging behind a per-environment kill switch and a configurable daily evaluation budget. Errors, timeouts, 429s and exhausted budgets route to review; they never approve. Tests use a deterministic fake provider that is refused outside local development. Production configuration includes the binding with the provider disabled.
- **Category merge transfers ratings.** A merged donor category's memberships and ratings move to the survivor because both represent the same conventional reference product. When one user rated the same formula in both, the most recently updated rating stays counted and the other is retained with `is_counted=0`. The donor slug redirects. The merge is audited and exactly reversible. Product duplicate consolidation keeps milestone 3's archival, no-transfer policy.
- **Policy pages** are drafted in plain language to match actual behavior, including Workers AI moderation, and require operator review of the text and support contact.
- No OpenAI/Jev provider, contributor trust (#26), threads/feeds/DMs, hot/controversial sorting, live inventory or external search.
- Completion means staging verification and documented evidence. Local commits are made per verified checkpoint. Pushes, PRs, issue/milestone changes, merging and production work require separate authorization.

## Defaults

- **Provider modes:** `MODERATION_PROVIDER` is `clef`, `fake` (local only) or `disabled`. Disabled is an explicit operator choice that restores milestone 3 deterministic behavior: comments publish as ordinary opinions and submissions follow the deterministic decision. An enabled provider that fails never approves.
- **Decisions:** `READY`, `NEEDS_CHANGES`, `NEEDS_REVIEW`, `BLOCKED`. The automated layer can only make a deterministic decision more restrictive. BLOCKED is reserved for explicit high-confidence abuse rules.
- **Comments** belong to a formula. The product page shows the current formula's comments with earlier formulas available and labeled. Best ordering uses the Wilson lower bound of upvote share; Newest is chronological. Heavily downvoted comments collapse behind **Show**. Votes measure usefulness, never agreement, and never affect rankings.
- **Risk tiers** are domain configuration. Auto-application uses an explicit allow-list rather than a stored tier:
  - Tier 1, immediate after deterministic checks and an automated READY: alias/search term, manufacturer source URL, filling an empty photo slot.
  - Tier 2, community-confirmable and eligible for automatic acceptance: packaging photos, rename with package evidence, replacing an existing manufacturer source, variant relationship without eligibility change, discontinuation and same-formula reintroduction of non-established products, category membership addition, front/back/prepared photo replacement.
  - Tier 3, operator only: classification, reformulation, category removal or eligibility change, brand/identity change, ingredient or nutrition photo replacement, merges, category proposals and discontinuation of established products.
- **Confidence** is the Wilson lower bound of distinct independent confirmations against disagreements from active accounts, excluding the proposer; it orders review and is derived from stored response counts. Automatic acceptance of tier 2 requires an enabled provider's latest READY evidence decision, no disagreement, a minimum age and a minimum number of confirmations that rises for established products (product importance). Any disagreement sends the proposal to an operator. No contributor-trust score exists. Products have no canonical package-size field (package sizes are distinct products under the identity rules), and category removal remains the tier 3 eligibility change.
- **Trending** uses canonical daily activity: counted ratings, trials and distinct commenters over seven days with a three-day half-life, relative to the preceding week's baseline and weighted by recent similarity quality. All constants are configurable and provisional until real traffic calibrates them. **New** lists eligible products published within 90 days, newest first.
- **Structured data** uses breadcrumbs and item lists only. Similarity scores are not product-quality reviews, so no aggregate-rating markup is emitted.
- **Launch gate:** one `PUBLIC_LAUNCH` variable replaces the hard-coded production checks and remains disabled in production.

## Implementation sequence

### 1. Specification

Amend product, moderation, ranking, database, API, architecture and technology documentation before behavior changes. Port the Clef automation policy recorded on `main` (`0e0a938`) and reconcile it with milestone 3.

### 2. Decision layer and submission preflight (#18)

Add `server/moderation/` with narrow finite question sets, a pure policy engine, the Clef provider, a local fake provider and persisted decision records. Records keep schema/policy versions, model, input hash, structured probabilities, outcome, status, tokens and latency, never prompts or prose. Atomic D1 accounting enforces environment, account and concurrency budgets before any call. Identical recent payloads reuse prior decisions. Submission finalization calls the decision service only after every deterministic gate; READY is required for canonical insertion while the provider is enabled. Calibrate provisional thresholds against a labeled local fixture set.

### 3. Comments (#15)

Rebuild the empty `comments` table with moderation states, vote counts and a Best rank, and replace the unused helpful-only reactions with one active up/down vote per account. Public reads are cookie-free and shared-cacheable; personal vote state is private. Authenticated authors create, edit and delete; others vote, change or remove votes and report. Comment-specific rate limits and quotas precede Clef-flash relevance/spam evaluation. Uncertain results hold the comment for review; low-detail opinions are never rejected.

### 4. Edit proposals, confirmations and queue (#18)

Add proposals for established facts, community Confirm/Disagree/Add evidence responses de-duplicated by user, confidence, tier correction, an hourly automatic-acceptance sweep through the existing fenced decision path and a dedicated non-sign-in system actor. Extend the inbox for confirmation, high-risk, held-comment and automated-signal work. All accepted changes remain audited and reversible.

### 5. Canonical photo slots (#16)

Show five canonical slots with Add photo or Suggest a better photo. Replacement proposals reuse staged media, hashes, quotas and cleanup; duplicate proposals become confirmations. Accepted replacements archive the prior image under its formula.

### 6. Category proposals and taxonomy (#23)

Add semi-moderated category proposals, admin create/rename/alias/re-parent/retire, reversible transfer merges executed in bounded resumable pages, slug history redirects, reserved slugs and homepage features separate from hierarchy. Add the production-safe taxonomy seed.

### 7. Trending and New (#24)

Derive daily statistics and a separate trends read model on the hourly schedule, expose Top / Trending / New views and homepage sections, and prove neither changes Top.

### 8. Hardening and launch readiness (#21)

Expand cross-milestone browser coverage, authorization and abuse tests, migration/rebuild/reversal integrity, backup/export recovery, cache and load verification, SEO (robots, sitemap, canonical, structured data), accessibility, policy surfaces, the launch gate, production configuration, a cutover checklist, the dataset audit and drafted follow-up issues.

## Configurable defaults

| Control                  | Default                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Clef daily evaluations   | 300 per environment; 30 per account; 2 concurrent per account                                                                                |
| Decision reuse           | Identical kind/policy/model/input hash within 30 days                                                                                        |
| Comment length           | 2–2,000 characters, plain text                                                                                                               |
| Comments                 | 10 per minute and 30 per day per account                                                                                                     |
| Comment votes            | 60 per minute per account                                                                                                                    |
| Collapse                 | At least 5 downvotes and a 95% upper bound on upvote share below 0.4                                                                         |
| Comment re-evaluation    | 20 held comments per hourly pass                                                                                                             |
| Proposal auto-acceptance | Provider READY, at least 24 hours old (1 hour on staging), no disagreement; 1 confirmation on products under 25 counted ratings, 3 otherwise |
| Established product      | 25 counted ratings                                                                                                                           |
| Category proposals       | 3 per account per day                                                                                                                        |
| Merge page               | 500 moved ratings and 50 conflicts                                                                                                           |
| Trending                 | 7-day window, 3-day half-life, 7-day baseline, at least 3 events, top 200 per category                                                       |
| New                      | 90 days                                                                                                                                      |

## Verification and staging delivery

Each checkpoint passes `npm run check` and focused integration and browser suites before its local commit. Final verification runs `npm run check`, `npm run test:e2e`, fresh and upgrade migrations, foreign-key checks, ranking/trend/comment rebuild equivalence and every reversal path. Before staging migration, capture a Time Travel bookmark and verify bindings. Deploy staging only. Exercise real Clef decisions and genuine contributor, confirmer and operator flows with two distinct accounts without authentication bypasses. Record evidence, versions, screenshots, calibration, recovery references and limitations in `docs/verification/milestone-4.md`.

## Execution contract

Continue through implementation, verification, fixes, staging deployment and acceptance evidence. Preserve ranking integrity, raw ratings, formula history, privacy/cache separation, existing contributions and production. If access or a material conflict blocks a gate, finish independent work and report the exact required input without claiming completion.
