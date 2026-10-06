# Milestone 1 — Foundation & Data Model

This scope follows [GitHub milestone 1](https://github.com/Chaseos/VeganAlts/milestone/1), issues #1–#6. It replaces the earlier local document that included a complete public ranking loop. That user experience is milestone 2.

## Outcome

Establish a verified foundation for community-ranked vegan alternatives, and publish a fast coming-soon page at https://veganalts.com. Porkbun retains registration and renewals; Cloudflare provides DNS and hosting. Incremental infrastructure should remain at or below $10/month at foundation-stage usage.

## Implementation scope

| Issue                                               | Deliverable                                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#1](https://github.com/Chaseos/VeganAlts/issues/1) | React Router v8, React, strict TypeScript, Vite/Workers integration, modular monolith, environments, health route, request IDs, safe logs, tests, CI                |
| [#2](https://github.com/Chaseos/VeganAlts/issues/2) | Authoritative Drizzle schema, separate auth ownership, append-only D1 migrations, foreign keys, partial indexes, FTS5, deterministic local reset/migration workflow |
| [#3](https://github.com/Chaseos/VeganAlts/issues/3) | US development catalog with ten rankable categories, at least three products each, aliases/ancestry, category overlap, variants, and illustrative formula history   |
| [#4](https://github.com/Chaseos/VeganAlts/issues/4) | Better Auth Google/Apple website sign-in, persistent sessions, sign-out, profile linkage, collision-safe handles, profile settings, shared auth helpers             |
| [#5](https://github.com/Chaseos/VeganAlts/issues/5) | Pure authoritative ranking policy, internal rating/Tried services, atomic canonical/aggregate updates, aggregate ranking reads, full rebuild command                |
| [#6](https://github.com/Chaseos/VeganAlts/issues/6) | Authenticated admin uploads, validated JPEG/PNG/WebP, stored derivatives in R2, metadata in D1, retry safety, abandoned-upload recovery                             |

The ten seed categories are Ground Beef, Beef Burgers, Chicken Nuggets, Bacon, Milk, Butter, Cheddar, Mozzarella, Cream Cheese, and Eggs. All seed products are explicitly marked as development records with manufacturer references. In milestone 1, synthetic identities/ratings were limited to isolated automated tests. The approved milestone 2 development-data policy now permits clearly labeled deterministic demo accounts and ratings in local/staging; this does not revise the historical milestone 1 verification record. Seed tooling refuses production.

## Decisions

- Route handlers call application services; domain policies depend on neither React nor persistence/platform APIs.
- Bayesian ranking starts with prior mean **3.5** and prior strength **10**. These are initial calibration values. Eligible current formulas sort by adjusted score, rating count, and stable product ID; zero-rating products remain unranked. Trust and sponsorship do not change votes.
- Ratings belong to a user, formula version, and category. Country, formula, and category isolation survive edits and aggregate rebuilds.
- Upload limits are **10 MiB** and **40 megapixels**. Full images use a maximum edge of 1800px at quality 90; thumbnails 500px at 80; ingredient/nutrition evidence 2400px at 92. Small originals are never enlarged.
- Media URLs are immutable. Ordinary reads never transform an image. Failed attempts can be retried with the same idempotency key; cleanup preserves every referenced derivative.
- Staging and production have separate D1 databases, R2 buckets, session secrets, origins, and OAuth callbacks. Staging is explicitly marked as development and non-indexable.
- Google/Apple developer registrations are for website authentication. No native application or app-store submission is part of this work.
- The landing page is responsive and accessible, uses system fonts/lightweight CSS, includes canonical/social metadata, and has no waitlist.

## Completion gates

1. Clean install, strict types, meaningful domain/persistence tests, Worker build, browser tests, and GitHub CI pass.
2. Fresh local and real staging migrations pass; foreign keys, uniqueness, repeatable seeds, and formula history are verified.
3. Ranking tests cover tiny perfect samples versus established 4.7 averages, concurrent writes, edits/deletes, exclusions, ties, transitions, multiple categories, country isolation, and rebuild equivalence.
4. Google and Apple sign-in both succeed on staging, with session persistence, profile linkage, settings, authorization, and sign-out. Local provider-boundary simulations alone are insufficient.
5. Real Cloudflare transformations and authenticated uploads pass, including evidence readability, repeated derivative reads, malformed/oversized rejection, partial failure, interrupted processing, and cleanup safety.
6. HTTPS, HTTP/www redirects preserving paths and queries, mail records, delegation, DNSSEC state, keyboard/mobile layout, and cookie-independent public HTML are verified. Mobile Lighthouse performance and accessibility target at least 95.
7. Deployment, migration ordering, Worker rollback, DNS recovery, usage safeguards, and remaining limitations are documented.

The [verification record](operations/milestone-one-evidence.md) distinguishes implemented code from checks performed against live services. Required live integrations or CI remain open gates until verified.

## Deferred to milestone 2 and later

Milestone 2 provides public search, category rankings, product pages, rating controls, and My Ratings. Later work includes community uploads, moderation UI, trust automation, comments, retailer confirmations, Trending, and catalog expansion. There are no native apps, live inventory, social graph, microservices, or public maintenance endpoints in milestone 1.
