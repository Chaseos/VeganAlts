# Milestone 7 verification

Recorded on 2026-10-13 against the approved [Milestone 7 specification](../MILESTONE_7_PLAN.md). Implementation and local verification are complete. **Staging has not been reset, migrated, seeded or deployed**; those steps wait for the owner (see [Staging and production](#staging-and-production)).

## Delivery and scope

- Branch: `docs/milestone-seven-recipe-lines-plan`, pull request Chaseos/VeganAlts#49 into `develop`. One local commit per checkpoint, `30e0906` (specification) through `68cd670` (Add a product by line), then this record with the demo catalog and the version 1 fold.
- Owner decisions (2026-10-11 to 2026-10-13) are recorded in the specification:
  - rank recipe lines, one vote per person, with an independent Tastiest ranking beside Closest to the original;
  - lines and products belong to one country;
  - search finds brands, with brand pages;
  - a two-level taxonomy of 18 universal aisles and 64 United States foods;
  - aisles ordered by popularity, aisle cards with three foods, seasons and a Trending tag;
  - Add a product by food, brand, then line; flavors join their line without review;
  - one Foods menu in the desktop header;
  - the milestone's migrations folded into version 1 before staging.

## What changed for visitors and contributors

| Area          | Behavior                                                                                                                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rankings      | A food ranks recipe lines (a brand's base recipe and its flavors in one country). Each person counts once, with the mean of their flavors. A line with several flavors lists them, each with its own score from five answers.                            |
| Tastiest      | An optional "How tasty is it?" answer feeds a second ranking with its own featured #1. A toggle switches between Closest to the original and Tastiest; Tastiest never changes Closest.                                                                   |
| Discovery     | Trending looks back 90 days (30-day half-life) against the quarter before, counting each person once per line; the top three lines carry a Trending tag. New follows a line's first publication in a food and never moves later.                         |
| Brands        | Search and instant answers find brands loosely; each brand has a page per country listing its lines by aisle and food with both ranks.                                                                                                                   |
| Browsing      | 18 aisles with foods directly beneath them, in each country's popularity order. Home shows aisle cards with three foods; desktop opens aisles from one Foods menu; seasonal foods show their months.                                                     |
| Product pages | The line's place in both rankings, the flavor's own score, other flavors with "Add another flavor", the Tastiest question and a Seasonal tag.                                                                                                            |
| Add a product | Food, then a brand combobox, then "Already listed from [brand]": rate a listed flavor, add a new flavor of a line, or add something else. A new flavor publishes without review; exact duplicates are still refused. Seasonal and Tastiest are optional. |
| Moderation    | Reports gain "This flavor doesn't exist" and "Not part of this line". Operators move a product to another or a new line and rename a line, audited and reversible. A rename can set a flavor; Seasonal is a tier 2 change.                               |

## Local verification

- `npm run check` (types, Vitest, build): **295 tests in 63 files passed.**
- The owner ran `npm run db:reset:local -- --confirm-local-reset`, which recreated the local database from version 1 and the new demo seed (39 formulas in 32 lines). `d1_migrations` lists one row, `0001_initial.sql` (id 1), and `PRAGMA foreign_key_check` returns no rows.
- Full browser run (`npm run test:e2e`: the preparation step, then Playwright with its own dev server and no edits during the run): **95 passed, 34 skipped, 1 failed.** The skipped tests are opt-in captures and tests for one width.
  - The failure was a phone-only race: the aisle page's filter was typed into before the page hydrated. The test now types again until the filter applies; the aisle tests then passed twice in a row at both widths.
  - An earlier run's four failures are fixed: two tests assumed demo order (Beef first among aisles, and a single-flavor Beyond Beef line that another test had given a flavor), and two phone uploads ran out of the local daily processing allowance (see [Limits](#limits-and-follow-ups)).
- Accessibility: axe passes on every browser-tested page at 390 px and desktop widths in both themes, including the open Foods menu, line rows with their flavors open, brand pages, the brand combobox and "Already listed from [brand]".

## Final verification items

| Item                    | Where it's proven                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One-flavor equivalence  | `line-aggregates.test.ts`: "ranks one-flavor lines exactly as their products"; `lines.test.ts`: "scores one flavor exactly as the product".                            |
| One vote per person     | `lines.test.ts`: "gives each person one vote"; `line-aggregates.test.ts`: "counts each person once, keeps Tastiest apart and rebuilds to the same rows".               |
| Tastiest is independent | `lines.test.ts`: "keeps Tastiest apart from Closest"; the same `line-aggregates.test.ts` test.                                                                         |
| Trending dedupes        | `line-discovery.test.ts`: "counts a person once per line across the Trending window"; `trending.test.ts`: "counts each person once across the window".                 |
| Popularity order        | `aisle-order-seasons.test.ts`: "seeds default positions and seasons, fills only what an operator never set, and orders by popularity".                                 |
| New never moves later   | `line-discovery.test.ts`: "keeps a line's New date fixed when flavors come and go".                                                                                    |
| Siblings never hold     | `line-contributions.test.ts`: "adds a new flavor to its line without a hold" (an exact duplicate is still refused); `lines.spec.ts` publishes a flavor without review. |
| Formula versions        | `line-aggregates.test.ts`: "stores what the reference function computes for a line of several flavors", where a reformulated flavor's old ratings leave the line.      |
| Eligibility             | `community-lifecycle.test.ts`: "refreshes a line when a food's eligibility changes and when the decision is reversed", including discontinuation.                      |
| Rebuild equality        | `line-aggregates.test.ts`: "counts each person once, keeps Tastiest apart and rebuilds to the same rows".                                                              |
| Filters                 | `line-catalog.test.ts`: "shows a line when any flavor passes a filter"; filters never change a line's rank or score.                                                   |
| Database integrity      | `empty-database.test.ts` replays version 1 onto an emptied database and checks foreign keys; the local reset's ledger and foreign-key check below.                     |
| Line moves              | `line-contributions.test.ts`: "moves a flavor to a new line, renames a line and reverses both, rescoring each line".                                                   |

## Version 1 baseline

- **How it was built:** the four migrations were applied to an empty SQLite database. The tables the later migrations altered (`categories`, `products`, `product_families`, `ratings`, `product_category_stats`) took their final definitions from `sqlite_master`, exactly as SQLite rewrote them. The tables and indexes `0004` dropped were removed. The later migrations' tables, indexes and triggers were appended; their backfills, `ALTER`s and drops were left out, because every database is reset.
- **Proof it matches:** the folded `0001_initial.sql` applied to a second empty database matched the four-migration result in every table, index and trigger, 240 objects, definitions included. `drizzle-kit generate` reports no schema changes, so the single snapshot matches the TypeScript schema; the journal has one entry.
- **What was removed:** `0002_aisle_order_and_seasons.sql`, `0003_recipe_lines.sql`, `0004_line_discovery.sql`, their snapshots, and the test of the `0003` backfill.

## Demo catalog

- New lines in several flavors: Kite Hill Greek Style Yogurt (Plain, Vanilla, Strawberry), Simulate Nuggs (Original, Spicy) and Silk Soymilk (Original, Vanilla). The same demo tasters rate across a line's flavors, so each counts once there.
- About two in three demo ratings include a Tastiest answer.
- Ratings, tries and publication dates are dated back from the seed run, so Trending, New and Early read as on a live site whenever it's seeded. Unrated demo products were added in the last three weeks; rated ones 200 days ago.
- The demo's "variant" relationships are gone; flavors are lines now.

## Staging and production

Remote databases were not touched; remote reads and writes need the owner's own approval.

- **Staging** still has the milestone 5 history and waits for its version 1 reset. With the owner's approval:

  ```sh
  npm run db:reset:staging -- --confirm-reset=veganalts-staging
  npm run db:migrate:staging
  npm run db:seed:staging
  npm run db:seed-images:staging
  npm run deploy:staging
  ```

  The reset prints the Time Travel bookmark first. Then repeat the running-app pass with two accounts.

- **Production** needs the same reset to version 1 before release, then migrate, the taxonomy seed and a rankings rebuild. It never gets the demo seed.

## Limits and follow-ups

- **Rename line** is an action on a product (`/admin/moderation/products/:id/line-name`), not `/admin/lines/:id`, so the existing reversal undoes it. The API document records this.
- **Lookups scan in memory.** Brand suggestions match up to 5,000 brands, and loose "Is it one of these?" matching scans the country's products, both on the instant-answer rate limit. A search index will be worth it once the catalog is large.
- **Demo Oatly line.** Original and Full Fat stay one line in the demo to show how unlabeled flavors are named, although by the line test Full Fat is its own base.
- **Add a product has no Foods menu,** as before: pages outside a country have no aisles in the header.
- **Local processing allowance.** Seeding the demo's 39 images spends most of the default 50 processing attempts a UTC day, so a full browser run after a reset ran out. Local development now allows 200 (`wrangler.jsonc`, top-level `COMMUNITY_LIMITS`); staging and production keep the default. On staging, the day of a reseed leaves about 11 uploads for the running-app pass.
- **One dev server at a time.** A browser run starts its own dev server; a second one running beside it rebuilds Vite's shared dependency cache and turns every page into a 500. Stop other dev servers before `npm run test:e2e`.
