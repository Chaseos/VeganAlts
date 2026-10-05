# Milestone 2 — Core Ranking Experience

Milestone 2 covers GitHub issues #7–#12.

## Outcome

Turn the Milestone 1 foundation into the first complete VeganAlts product experience:

```text
anonymous visitor
    ↓
discover/search category
    ↓
view ranked alternatives
    ↓
open product
    ↓
sign in when contributing
    ↓
submit/update similarity rating
    ↓
personal state updates
    ↓
aggregate ranking updates
    ↓
shared public page refreshes through cache
```

At the end of this milestone, VeganAlts should be useful as a curated beta even before open community product submissions and advanced moderation exist.

## Milestone issues

### #7 — Build public homepage, search, category ranking, and product pages

Build the anonymous consumer-facing experience.

Key requirements:

- homepage with clear product proposition;
- US country context initially;
- D1 FTS5-backed category/product search;
- aliases/synonyms;
- stable human-readable routes;
- category leaderboard from precomputed ranking aggregates;
- product detail pages;
- crawlable SSR HTML;
- titles/descriptions/canonicals/social metadata.

Do not require auth for public reads.

### #8 — Add shared caching and separate private personalization from public HTML

Implement the public-read architecture:

```text
visitor → Cloudflare shared cache → HTML
```

Public documents must not vary by auth cookie.

Personal state loads separately through private/authenticated endpoints.

Initial cache targets remain approximately:

- category: 10 minutes;
- product: 15 minutes;
- homepage: 30 minutes.

Routine ratings should not trigger immediate full-page regeneration.

### #9 — Implement authenticated similarity rating flow

Complete the central contribution action.

- Overall Similarity is required, 1–5.
- Anonymous contribution intent returns through sign-in.
- One rating per user + formula version + category.
- Rating write updates Tried state and affected aggregate.
- Personal UI updates immediately.
- Shared public output can wait for normal cache refresh.

### #10 — Build user profile basics and My Ratings

Provide persistent contributor utility without building a social network.

- public handle/profile shell;
- My Ratings list;
- product/category/formula context;
- recent sort;
- route back to edit a rating.

No follows, feeds, DMs, or category-specific profile sections.

### #11 — Add product analytics, observability, Turnstile, and rate limiting

Provide operational visibility and basic abuse protection for the core loop.

Track:

- page/category/product views;
- search;
- auth funnel;
- rating create/update/failure.

Add:

- Worker error observability;
- request correlation on writes;
- configurable rate limits;
- Turnstile only where justified;
- sensitive-data/log redaction.

This is not the final launch-security audit.

### #12 — Validate core ranking loop with end-to-end tests

Validate the entire Milestone 2 vertical slice and lock in regression coverage.

This issue is the milestone gate, not the final public-release hardening issue.

## Recommended implementation order

### First
**#7 Public experience**

This establishes the real routes and consumer-facing data requirements.

### Then / partially parallel
**#8 Caching**

Once the public route shape exists, make shared caching an architectural property rather than bolting it on later.

### Then
**#9 Rating flow**

Connect the Milestone 1 auth/ranking/database foundation to the real UI.

### Then
**#10 Profiles / My Ratings**

Build on the completed rating flow.

### Parallel once dynamic routes exist
**#11 Analytics / observability / abuse controls**

Do not wait until the very end to make writes observable.

### Last
**#12 Core-loop E2E validation**

Close the milestone only when the whole vertical slice works together.

## Milestone 1 dependencies

Milestone 2 assumes the Milestone 1 foundation remains authoritative:

- React Router / Cloudflare Worker application foundation;
- D1 + Drizzle schema/migrations;
- US seed catalog/taxonomy;
- Better Auth + profiles;
- similarity ranking/aggregate engine;
- R2 image ingestion/derivatives.

If implementation exposes a flaw in a foundation decision, fix the underlying source-of-truth rather than working around it in UI code.

## Explicitly out of scope

Do not expand Milestone 2 into:

- open community product submissions;
- retailer confirmation;
- comments;
- community photo replacement;
- reports/moderation queues;
- Clef moderation;
- formula-change operator workflows beyond displaying existing model state;
- community category proposals;
- Trending/New;
- contributor trust;
- creator/influencer collections;
- recipes;
- restaurants/HappyCow;
- non-food alternatives;
- sponsorship/ads;
- final public launch hardening.

## Milestone completion criteria

Milestone 2 is complete when:

- anonymous visitors can discover, search, browse rankings, and open products;
- public pages are crawlable and share-cacheable;
- signed-in state does not contaminate shared HTML;
- Google/Apple sign-in can return a user to a rating action;
- users can create and update similarity ratings;
- ranking aggregates update correctly;
- My Ratings reflects contributions;
- core funnel/events and errors are observable;
- basic abuse controls exist;
- the complete core loop passes end-to-end/regression testing.

## What comes next

Milestone 3 focuses on **Catalog Growth & Product Integrity**:

- vegan-status model;
- formula/discontinuation history;
- duplicate/product-family/variant management;
- community product submission;
- canonical retailer availability;
- contextual reporting + basic manual review.

Heavy automated moderation is intentionally deferred until the catalog/community workflows exist.
