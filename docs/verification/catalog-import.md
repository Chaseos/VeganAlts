# Store photo import verification

Evidence for the [store photo importer](../IMPORTER_PLAN.md). The local rehearsal ran on 2026-10-16. Staging waits for the owner (plan step 3).

## Build

- **Shared publication statements.** `catalogEntryStatements` (`server/community/infrastructure/catalog-entry.ts`) now writes a new product's catalog rows for both submission publication and the import. The submission, line, photo-slot, media and moderation suites pass unchanged.
- **The importer:** the domain rules (`server/community/domain/catalog-import.ts`), the service (`server/community/application/catalog-import-service.ts`) and the command (`scripts/catalog-import/`).
- **Supporting changes:**
  - `scripts/reset-local.ts --taxonomy-only`;
  - the launch audit reports missing ingredient evidence without blocking launch.
- **Tests:**
  - `tests/unit/catalog-import.test.ts` (8): the manifest from fixture batches, classification, ids and hashes;
  - `tests/integration/catalog-import.test.ts` (5): import against D1 and R2, compared with a product published through Add a product.
- **`npm run check` passes:** typecheck, every unit and persistence suite, and the build.

## Local rehearsal (2026-10-16)

**Setup.** The owner reset the local database with `--taxonomy-only`: version 1, 127 categories (103 US foods), no products and no accounts but the system account. The browser-test operator (`operator@e2e.invalid`) was created and listed in `.dev.vars`.

**Manifest.**

- **Hash:** `d332babcd3ef457e0c55a335de954466231c5baa09c6e0628db8958a94fd247e`. It was the same on every build.
- **Blocking problems:** none.
- **48 warnings for the owner:**
  - 26 names that start with their brand;
  - 8 names with a size, pack count or nutrition claim the identity key strips ("6ct", "6 Pack", "0g Added Sugar", "12G Protein");
  - 8 lines that mix package labels, which is allowed;
  - 2 brand pairs that may be one brand: JUST and Justin's, Unreal Deli and Unreal;
  - 4 possible missed repeats between batches 2 and 1. All four look like different bases, for example oat milk beside coconut milk of one brand.

**Dry run.** All 824 products were ready, and all 7 stores were still to be added.

**Apply.** 824 written in about 33 seconds, and the 7 stores added through accepted retailer proposals. Against the plan:

| Item                                         | Plan                   | Local                  |
| -------------------------------------------- | ---------------------- | ---------------------- |
| Products (active)                            | 824                    | 824                    |
| Recipe lines                                 | 520                    | 520                    |
| Brands                                       | 160                    | 160                    |
| Photos (front, ingredients, nutrition, back) | 1,652 (824, 820, 5, 3) | 1,652 (824, 820, 5, 3) |
| R2 objects under `products/…/import/`        | 3,304                  | 3,304                  |
| Stores and store links                       | 7 and 1,005            | 7 and 1,005            |
| Vegan label, ingredients not checked         | 379                    | 379                    |
| Plant-based, checked                         | 153                    | 153                    |
| Plant-based, no ingredients photo            | 1                      | 1                      |
| Appears plant-based, ingredients not checked | 291                    | 291                    |

**Verification** (`--verify`):

- every product is in search, every brand in brand search, and every line has its first publication;
- 824 `product_import` actions and 824 `product_published` entries;
- no internal review data in the audit log;
- no foreign-key problems.

**Rebuild equality.** After `npm run rankings:rebuild:local` (824 formulas, 520 lines), the imported lines' derived rows had the same digest as when the import wrote them.

**Launch audit** (local):

- **Zero for:** development products, products without a front photo, Vegan without review, possible duplicates, empty foods and pending moderation.
- **Reported, not blocking:** the 4 known products without ingredient evidence.
- **The only blocker** is the local browser-test operator, counted as a demo account, as expected locally.
- **3 foods have no other names.** This is a taxonomy-seed matter, not the import.

**Rerun.**

- The same apply replayed all 824 products and added no store.
- No catalog table and no R2 object changed.
- Two audit entries recorded the rerun's own start and end.

**Running site** (local dev server):

- **Coffee Creamer** lists the imported lines with their flavors (nutpods' Dairy-Free Coffee Creamer, 11 flavors) under "Not rated yet".
- **The Oatly brand page** has 11 products, and its Oatmilk line, joined across batches 1 and 2, shows Original, Unsweetened and Vanilla.
- **The Elmhurst brand page** has 23 products, with Milked Cashews joined across batches.
- **The Vanilla Oatmilk Creamer page:**
  - shows its front and ingredients photos, the evidence note with the package claim, "Ingredients not checked yet" and Sprouts;
  - every photo serves at full and thumbnail size, and `/evidence` is 404 by design, so the gallery links the full copy.
- **Searching "Oatly"** finds the brand and its 11 products.
- **The Trader Joe's store filter** narrows Coffee Creamer to Trader Joe's three creamers.

**Reversal.** Reversing the import of Elmhurst's Dairy-Free Cashew Creamer Sweet Cream (`ModerationService.reverse`):

- hid it, and removed its search entry and line row;
- made its photo return 404;
- took it off the Coffee Creamer page, search and the Elmhurst brand page (22 products).

That product stays hidden in the local database. A taxonomy-only reset and a fresh import restore all 824.

## Staging

Not run; it waits for the owner (plan step 3).
