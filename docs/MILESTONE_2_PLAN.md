# Milestone 2: core ranking experience

Approved scope: issues [#7–#12](https://github.com/Chaseos/VeganAlts/milestone/2), delivered on staging. Production keeps its coming-soon page. The core journey is discovery → category → product → choose a score → sign in → automatic save → My Ratings → edit.

## Product decisions

- Evolve the green-and-cream identity with prominent search, compact ordered rankings, visible United States context, and one canonical product URL per market.
- Display the full-precision Bayesian score rounded to one decimal as **4.2/5**, with rating count; no attached “Match” label. Use “Early” below ten counted ratings. Unrated products are a separate, unordered section.
- A score selection saves immediately. A short-lived, tab-scoped selection resumes automatically after Google or Apple sign-in. A changed formula or category requires a fresh selection. Ordinary saves do not reorder cached public results.
- Public profiles expose only chosen identity and contribution counts. Individual rating history stays private. Historical formulas and their aggregate scores remain readable and cannot receive current-formula ratings.
- All development catalog entries, sample identities, ratings, and illustrations are approved fictional fixtures. They may be revised for demonstrations. Labels must distinguish them from verified manufacturer claims and organic community feedback. Production seed refusal remains mandatory; reseeding must preserve real staging accounts and contributions.

## Architecture and delivery

Keep the modular monolith, pure ranking policy, formula history, atomic canonical/aggregate transaction, and existing image processing budgets. Public loaders call catalog services directly and never authenticate requests. Private state is fetched once for the visible formula IDs after hydration. API responses use typed success envelopes and Problem Details.

Use a dedicated public Worker entrypoint with native Workers Cache, separate document/data/API representations, deployment and country identity, request collapsing, background refresh, and at most 24 hours stale on error. Home/category/product/profile freshness is 30/10/15/10 minutes. Deliver a new CSP nonce for every document while caching only nonce-bearing templates. Cookies, authentication, private responses, and writes never enter shared cache. Material catalog changes have internal invalidation hooks; ratings rely on expiry.

Observe cache outcomes, route timings, dependency failures, page views, searches, sign-in outcomes, and authoritative post-commit rating outcomes without sensitive values. Use separate environment bindings, configurable rate limits, and selectively verified Turnstile challenges. On 2026-10-05, the user approved Cloudflare Workers structured event logs as the staging application-event backend after Cloudflare rejected Analytics Engine with error 10089 despite dashboard setup. Activation subsequently propagated, the binding deployed successfully, and live event ingestion was verified in Studio. The Analytics Engine follow-up is complete; keep the tested event-log fallback for availability. Web Analytics remains enabled for staging traffic. Analytics failure cannot fail a committed contribution.

## Acceptance checklist

Evidence is recorded in [milestone 2 verification](verification/milestone-2.md). A checkbox is complete only when the recorded checks support it.

- [x] #7: SSR home/search/category/product/history; aliases, brands and ancestry in FTS5; accessible mobile/desktop states, canonical metadata, images, unranked/early states.
- [x] #8: standard hydration and route splitting; neutral public HTML, batched private state; cache isolation, representation keys, expiry, refresh, stale/cold failure, fresh nonces and internal purge coverage.
- [x] #9: one-tap rating, serialized/coalesced changes, retries, authoritative Tried state, safe OAuth return, automatic resume, expiry and formula conflicts; real Google and Apple staging returns.
- [x] #10: public identity/count privacy, private cursor-paginated My Ratings, stable ties, current and historical links, consistent account navigation.
- [x] #11: environment-separated traffic/events, cache-hit views, safe structured diagnostics, post-commit outcomes, limits, server-verified elevated-risk challenges, cost/runbook documentation.
- [x] #12: strict types, domain/persistence/browser suites and Worker builds; fresh/upgrade migration and seed preservation checks; real media smoke; screenshots, keyboard/axe/CSP/metadata; mobile Lighthouse performance and accessibility target ≥95; deployed staging evidence with no core-loop blockers.

Deferred: Trending, standalone Tried, detailed rating inputs, comments, retailers, community submission/moderation workflows, and final public-launch hardening. Commits, pushes, pull requests, merges, and production deployment require their separate explicit authorization.
