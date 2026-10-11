# Milestone 6 verification

Recorded on 2026-10-10 against the approved [Milestone 6 specification](../MILESTONE_6_PLAN.md). Implementation and local verification are complete. **Staging has not been reset, migrated, seeded or deployed**; those steps wait for the owner (see [Staging and production](#staging-and-production)).

## Delivery and scope

- Branch: `feature/milestone-six-simpler-contributions`, based on the milestone 5 branch at `66805be` because milestone 5 is not merged yet. One local commit per checkpoint, `41fa6b4` (specification) through `8f22d44` (photo drafts), then hardening. Not pushed or opened for review.
- Owner decisions (2026-10-10) are recorded in the specification: shared aisles and shelves with per-country foods; name, brand, food and front photo required; missing foods suggested inline; optional rating, stores, allergens, more photos and variants; no canvas boards; community-confirmed ingredient checks; the starter shelves.
- During hardening the owner asked for two more changes (2026-10-10):
  - **Version 1.** Nothing has been released, so the migration history is folded into a single baseline, `db/migrations/0001_initial.sql`, and every database is recreated from it.
  - **No captures in the repository.** Screenshots and captures are never committed or uploaded. `CAPTURE=1` now writes to the ignored `test-results/captures`, and `.gitignore` refuses images under `docs/verification/`.

## What changed for contributors and visitors

| Area                    | Behavior                                                                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a product           | Two steps: The basics (country, food, brand, name, front photo; every field required) then Add more (optional rating, ingredients, allergens, stores, more photos, variants, other foods). One submit. Back works; the draft survives a reload. |
| Food picker             | Searchable combobox using each country's food names and other names, grouped by aisle and shelf, with "Suggest '…' as a new food" as the last option.                                                                                           |
| Duplicates              | Matches appear while brand and name are typed; an exact match offers "Rate it".                                                                                                                                                                 |
| Inline food suggestion  | The new food is held with its product. Accepting the food publishes the waiting product; rejecting it sends the contributor a follow-up to choose an existing food.                                                                             |
| Ingredients not checked | A product without ingredient evidence publishes as "Ingredients not checked yet", ranks and can be rated. A later ingredients photo is confirmed by members.                                                                                    |
| Extras at publication   | Stores are confirmed in the publication batch; the rating and allergen declaration apply right after it, with an hourly retry.                                                                                                                  |
| Foods per country       | Launch foods are on in all six countries; a suggested food opens in its own country; publishing a product switches its food on there. Operators toggle countries.                                                                               |
| Browsing                | Repeated shelf levels are hidden (no more Eggs › Eggs › Eggs), empty countries show the shared aisles with "Be the first to add one", and a food not on in a country shows "Not in … yet" with `noindex`.                                       |
| Suggest a food page     | Food name, shelf, optional other names and note, plus "Add it with the product".                                                                                                                                                                |

## Local verification

- `npm run check` (types, Vitest, build): **247 tests in 53 files passed.**
- `npm run db:reset:local -- --confirm-local-reset` recreated the local database from version 1. `d1_migrations` lists one row, `0001_initial.sql` (id 1), and `PRAGMA foreign_key_check` returns no rows.
- Full browser run (`tests/e2e/prepare.ts`, then `npx playwright test`, with no edits during the run): **92 passed, 24 skipped, 0 failed.** The skipped tests are opt-in captures and tests that apply to one width.
- Accessibility: axe passes on every browser-tested page at 390 px and desktop widths in both themes, including the open food picker and both add-product steps.

## Version 1 baseline

- **How it was built:**
  - All 21 pre-release migrations were applied to an empty local D1.
  - The final schema was read from `sqlite_master` in creation order: tables, the FTS5 index, indexes and triggers. Search shadow tables and D1's internal tables were left out.
  - The three rows the migrations inserted (the `veganalts-system` user and profile, and the 15 shared allergens) were kept as their original `INSERT` statements.
  - Tables come first, then rows, then indexes and triggers, so no trigger fires on the baseline's own inserts.
- **Proof it matches:**
  - The baseline was applied to a second empty D1. Every table, index and trigger matched the 21-migration result byte for byte, as did the seeded rows and the search index's configuration rows.
  - `PRAGMA integrity_check` returned `ok`, and the foreign-key check found nothing.
  - `drizzle-kit check` passes, and `drizzle-kit generate` reports no schema changes, so the single snapshot (`meta/0001_snapshot.json`) matches the TypeScript schema. The journal's one entry has index 1, so the next generated migration is `0002_…`.
- **What was removed:**
  - The legacy upgrade code (`db/upgrades/`) and the preflight and normalization steps in `scripts/migrate.ts`. They only repaired databases from earlier releases.
  - The upgrade-only tests.
- **What became fresh-database tests:**
  - `schema-rules.test.ts`: food availability triggers and the unchecked-ingredients check.
  - `taxonomy-reshape.test.ts`: a merge still reverses, and the reshape tool moves root foods into the launch tree.
  - `empty-database.test.ts`: the new reset empties a populated database, which then migrates back to version 1.
- **Resetting a remote database:** `npm run db:reset:<staging|production> -- --confirm-reset=<database>` prints the current Time Travel bookmark, then drops every trigger, view and table, including the migration ledger, in one transaction. Tables go children first because D1 checks foreign keys when it drops a table. R2 objects are not touched.

## Staging and production

Remote databases were not touched. Remote reads and writes need the owner's own approval, and the automatic permission check blocked even read-only queries.

- **Staging** still has the milestone 5 history (migrations through `0018`) and runs the milestone 5 Worker. To recreate it from version 1 with the demo catalog:

  ```sh
  npm run db:reset:staging -- --confirm-reset=veganalts-staging
  npm run db:migrate:staging
  npm run db:seed:staging
  npm run db:seed-images:staging
  ```

  The milestone 6 additions to the schema are additive, so the milestone 5 Worker should keep working on it, but that is untested. Deploying this branch to staging (`npm run deploy:staging`) right after the reset avoids the question.

- **Production** last applied migrations through `0004` ([launch checklist](../operations/launch-checklist.md)). Before release it needs `npm run db:reset:production -- --confirm-reset=veganalts-production`, then `npm run db:migrate:production`, the taxonomy seed and a rankings rebuild. It never gets the demo seed.

## Limits and follow-ups

- **Trending in the demo seed:**
  - Every seeded rating is dated 2026-10-04, so from 2026-10-11 UTC the seven-day Trending window is empty after a reset.
  - The home page then hides "Trending now", and `discovery-views.spec.ts` fails on any branch.
  - The browser run above rebuilt Trending as of 2026-10-06 first. A separate task makes the demo activity stay recent.
- The owner has not yet commented on the checkpoint 3 and 6 screenshots shared during the work.
- Earlier milestones' committed captures (`docs/verification/milestone-3`, `-4`, `-5`) are already on GitHub and were left as they are.
