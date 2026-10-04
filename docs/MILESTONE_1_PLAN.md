# VeganAlts Milestone 1 — Core Ranking Loop

**Purpose:** Prove that VeganAlts is useful before building the full community-maintenance system.

## Outcome

At the end of Milestone 1, a visitor can:

1. open VeganAlts without an account;
2. discover/search a seeded replacement category;
3. see a country-specific community ranking;
4. open a product detail page;
5. sign in with Google or Apple when they decide to contribute;
6. submit or update an Overall Similarity rating;
7. see that rating reflected in their personal state/history;
8. have the category aggregate update correctly and appear publicly after cache refresh.

If this loop is not compelling, advanced moderation, comments, creator collaborations and broad catalog growth should not distract from fixing it.

## Scope

### A. Project foundation

- React Router v8 + TypeScript + Cloudflare Vite plugin.
- Cloudflare Worker deployment.
- Environment configuration for local/preview/production.
- D1 database + Drizzle.
- Better Auth with Google and Apple.
- R2 media bucket.
- Cloudflare Images upload transform integration.
- Vitest + Playwright.
- Basic CI checks: typecheck, tests, build.

### B. Baseline database

Implement/review the v1.0 baseline for the subset required by the core loop:

- countries;
- profiles/auth linkage;
- categories + aliases;
- brands/product families/products;
- product versions;
- product-category memberships;
- rating dimensions;
- ratings + dimension values;
- product trials;
- product-category aggregate stats;
- product images;
- search index.

Moderation tables may be migrated now from the baseline even if their UI is not built yet, provided they do not slow implementation materially.

### C. Seed dataset

Launch development with one market, recommended **United States**, and a deliberately small useful catalog.

Initial development seed should be enough to test hierarchy and ranking, not the full public launch catalog.

Example categories:

- Ground Beef
- Beef Burgers
- Chicken Nuggets
- Bacon
- Milk
- Butter
- Cheddar
- Mozzarella
- Cream Cheese
- Eggs

Seed several representative products per category, including at least one product participating in multiple categories and at least one product family/variant example.

Before actual public launch, expand toward the Product Master's broader 10–20 category / 5–15 products-per-category cold-start target.

### D. Public discovery

Implement:

- homepage/search entry;
- country context (US initially, architecture ready for more);
- category search with aliases;
- category ranking page;
- product detail page;
- basic product images;
- ranking explanation.

The taxonomy must not force users through every parent level. Searching `beef`, `ground beef`, `meat`, or relevant aliases should lead to useful destination categories.

### E. Ranking engine

Implement one authoritative ranking module.

Requirements:

- Overall Similarity 1–5;
- one rating per user + formula version + category;
- raw mean/count;
- Bayesian score using configurable prior parameters;
- deterministic Top ordering;
- `product_category_stats` update/rebuild path;
- formula-version isolation;
- tests for one-rating vs high-volume scenarios;
- tests proving previous formula ratings do not affect current formula ranking.

Trending does **not** need a production algorithm in Milestone 1.

### F. Caching

Public category/product pages must be shared-cacheable and must not read auth state on the server.

Initial targets:

- category: ~10 min;
- product: ~15 min;
- homepage: ~30 min.

Personal rating state loads through a separate private/authenticated endpoint.

Test that a signed-in user's cookie does not cause the public ranking HTML to become user-specific.

### G. Authentication and profiles

Implement:

- Google sign-in;
- Apple sign-in;
- profile creation/linkage after first auth;
- unique public handle creation;
- sign out;
- `/me` or profile settings basics;
- public profile shell if useful for routing.

No social graph/follow system.

### H. Rating UX

From category or product detail, user can select:

```text
1 Not close
2 Slightly similar
3 Fairly close
4 Very close
5 Extremely close
```

If anonymous, contribution action starts sign-in and returns the user to the intended rating flow.

After save:

- rating persists;
- Tried state is upserted;
- aggregate is updated;
- personal UI reflects the current score immediately;
- public shared page can wait for normal cache refresh.

Optional detailed dimensions can be included if they do not compromise the simplicity of the primary flow; Overall Similarity remains the only required score.

### I. My Ratings

Implement the initial profile utility promised in the Product Master:

- one list of ratings the user has submitted;
- product/category context;
- current score;
- recent sort;
- ability to revisit/edit a rating.

Do not create category-specific profile sub-navigation yet.

### J. Image handling

Implement canonical upload processing needed for seeded/admin-managed product imagery:

- validation;
- WebP full derivative;
- WebP thumbnail derivative;
- higher-quality evidence derivative where applicable;
- R2 storage;
- D1 metadata.

Community image replacement proposals are later moderation work.

### K. Analytics / observability

Track at least:

- category view;
- product view;
- search;
- sign-in start/success;
- rating created/updated;
- rating save failure.

Enable Worker error logging and enough request correlation to diagnose failed writes.

## Explicitly out of scope for Milestone 1

- open community product submissions;
- full edit proposal/confirmation UI;
- contributor trust automation;
- report/moderation queue UI;
- comments;
- retailer confirmations;
- Trending algorithm;
- New discovery beyond seeded/catalog timestamps;
- creator/influencer collections;
- recipes;
- restaurant menu items;
- HappyCow integration;
- non-food alternatives;
- sponsorship/ads;
- native apps;
- live inventory;
- notifications.

These are intentionally deferred so the first milestone validates the core ranking loop.

## Acceptance criteria

Milestone 1 is complete when all of the following are true:

- Anonymous visitor can load seeded category/product pages without auth.
- Search finds a rankable category through canonical name and at least one alias.
- Category page orders current formula versions through the ranking module, not raw hard-coded sort order.
- Product with a tiny perfect sample does not automatically beat a well-rated established product when Bayesian confidence says otherwise.
- User can sign in with Google and Apple in the production-like environment.
- User can create/update exactly one rating per formula version/category.
- Updating a rating changes aggregate data correctly.
- Old-formula ratings are demonstrably isolated from the current formula.
- Public HTML is cacheable and does not include personal rating state.
- Signed-in personal rating state loads separately.
- My Ratings shows the user's submitted ratings.
- Image derivatives are stored in R2 rather than D1.
- Core ranking/domain tests pass.
- Playwright covers the anonymous browse → sign-in → rating loop.

## What should happen immediately after Milestone 1

Plan the next milestone from real usage/testing, with the likely focus on **community catalog growth and moderation**:

- add product;
- canonical retailers;
- edit proposals;
- confirmations;
- reports;
- formula-change workflow;
- canonical photo replacement;
- comments if they still appear valuable.

Do not generate a large backlog of implementation issues for later features until the Milestone 1 loop and schema are validated in code.
