# Store Photo Importer Plan

Written on 2026-10-16 from the owner's decisions of 2026-10-15 and 2026-10-16. Built and rehearsed locally the same day ([verification](verification/catalog-import.md), [runbook](operations/catalog-import.md)); staging waits for the owner.

The importer turns the owner's three reviewed store-photo batches into real catalog data, on a local database first and then on staging. The owner answered its four [questions](#owner-answers) on 2026-10-16, so nothing blocks the first run.

## Goal

- **Done:** every in-scope product of the three batches is published on staging. Each has its food, recipe line, photos, package label and stores. No demo data remains, and nothing went through the review queue.
- **Proof:** the [verification](#verification) passes locally, then on staging, and a second run of the importer writes nothing.
- **Not in this importer:**
  - ratings, allergens and ingredient lists;
  - barcodes (owner answer 1);
  - the shelf-stable tag (owner decision 5);
  - production.

## Decisions it follows

**The photo-batch rules** ([milestone 7](MILESTONE_7_PLAN.md), owner decisions 2026-10-15/16):

- No ingredient transcription.
- The package label is vegan, plant-based or "appears plant-based". Only "appears" products have a risk level, and only high-risk ones had their ingredient photo checked.
- Any plant-based alternative is in scope, and a food exists only when it has products.
- A product photographed again in a later batch carries its stores to the earlier product.

**The owner's import decisions** (2026-10-16):

1. Imported products skip the moderation review queue. They are the owner's own contributions.
2. Risk levels and ingredient checks stay internal and never reach the site.
3. Barcodes are left out of this importer ([owner answer 1](#owner-answers)).
4. The 38 demo products on staging are fake.
   - Every imported product is new, even when its name matches a demo product.
   - The demo data is cleared before the import.
5. A shelf-stable tag for products such as milk and creamer comes later, outside this importer.

## What gets imported

These were counted with `loadRun` on 2026-10-16, after the Oatly fix in owner answer 3:

| Item         | Count                                                            |
| ------------ | ---------------------------------------------------------------- |
| Products     | 824: 751 from batch 1, 72 from batch 2, 1 from batch 3           |
| Recipe lines | 520; 355 have one product, and 3 span two batches                |
| Brands       | 160                                                              |
| Foods        | 103, every US food in the taxonomy seed                          |
| Stores       | 7 retailers and 1,005 "commonly found at" links                  |
| Photos       | 1,652: 824 front, 820 ingredients, 5 nutrition and 3 back        |
| R2 objects   | 3,304 (a full and a thumbnail copy of each photo), about 0.45 GB |

Four products have no ingredients photo. No product has any of these:

- a review flag;
- a suggested food;
- a moved slot photo;
- an identity-key collision;
- an ingredient check that found animal ingredients. All 91 checked products came back clean.

## How it works

- **A Node script** in `scripts/catalog-import/` reads the batches through [`loadRun`](../scripts/photo-review/view.ts). It builds one [manifest](#the-manifest), which is the same for every environment.
- **It works against one environment at a time,** local or staging. It connects through the platform proxy that [`seed-images.ts`](../scripts/seed-images.ts) already uses ([`withCatalogPlatform`](../scripts/catalog-platform.ts)), with D1 and R2 bound remotely for staging.
- **A dry run is the default.** It checks the manifest against the database and reports what it would write. `--apply` writes.
- **Each product is one D1 transaction,** written after its photos are in R2.
  - The transaction reuses the statements that publish a community submission.
  - So an imported product has the same catalog rows as one added on the site. It has import audit rows instead of a submission's receipt, staged photos and review records.

**Why not the Add a product endpoints.** They would hold or slow the import in four ways, and each would need a bypass in the community safety rules:

- **Daily limits** ([`policy.ts`](../server/community/domain/policy.ts)): 5 submissions per account a day, 100 MiB of photos per account a day, and 50 photo-processing attempts per environment a day.
- **Near-duplicate holds** between a brand's flavors.
- **The automated photo check** on every submission.
- **Re-encoding** every photo through Cloudflare Images. That is about 4,100 transformations a staging run, against the free allowance of 5,000 a month ([TECH_STACK](TECH_STACK.md)).

Owner decision 1 already removes the review, so the importer writes the publication's rows directly.

## The manifest

- **Per batch:** `loadRun` applies the owner's corrections, late duplicates, cross-batch repeats and carried stores. The importer takes the `views` that are neither skipped nor out of scope.
- **Batch order matters.** The batches are passed earliest first, as `repeats --earlier` expects. That order decides a brand's spelling and which product founds a line.
- **Lines across batches.**
  - Within a batch, the line id decides the line.
  - Across batches, lines join when brand, line name and food all match after `normalizeName`.
  - Three lines join this way: Oatly Oatmilk, Elmhurst Milked Cashews and SmartSweets Gummy Candy.
- **Brands across batches** join by `normalizeName`, the key of the `ux_brands_normalized` index.
- **Each product has a source key,** `<batch folder name>/<product id>`, for example `VeganAlts Product Photos - Web/PXL_20261011_181202708.MP`. Every id the importer writes derives from it.
- **Each product holds two sets of facts.**
  - **Site facts:**
    - brand, line, flavor, name and food slug;
    - the package label, with the manufacturer label and classification it gives;
    - the evidence note, which quotes the label evidence;
    - store names;
    - for each slot, the full and thumbnail files, with their SHA-256, byte size and dimensions.
  - **An `internal` section,** which never reaches the database:
    - the risk level and reason;
    - the ingredient check;
    - sizes, confidence and notes.
- **The manifest hash** covers everything except `internal`.
  - A dry run prints it, and `--apply` requires `--expect=<hash>`. The run then writes exactly what the owner reviewed, and the same hash applies to local and staging.
  - Changing a risk level or a note doesn't change the hash.
- **Location.** The manifest and reports go to `--out`, a folder that must be outside the repository (the same check `openBatch` makes). They hold internal data and photo names, so they are never committed.

## Checks before writing

**Blocking checks** stop the run before anything is written.

- **In the run folders:**
  - `loadRun` reports a problem, for example a correction naming no product.
  - `products.csv` no longer matches `loadRun`. That means corrections changed after the review sheet was rendered: render again (`photos:review -- render`) and review.
  - A product has a review flag:
    - no front photo, or not placed in a line;
    - risk not set;
    - a high-risk check missing, unclear or without a photo;
    - animal ingredients found.
  - A product is in a suggested food (`newFood`).
- **Against the site's rules:**
  - Each product's facts, built as a submission, fail [`submissionInput`](../server/community/domain/contracts.ts). The contract limits names to 2–160 characters and flavors to 40, requires a front photo and allows at most 10 stores.
  - A joined line has two originals, or the same flavor twice. The Oatly case was one ([owner answer 3](#owner-answers)).
  - Two products share a site identity key. `identityKey` is the brand plus the name without package sizes; flavor words count only through the name.
  - A store name maps to no retailer, or to more than one.
- **Photos.** A slot photo fails if it:
  - is missing;
  - is not WebP, or is larger than 10 MiB or 40 megapixels;
  - is longer than 1,800 px for the full copy or 500 px for the thumbnail;
  - has full and thumbnail copies of different shapes;
  - carries EXIF, XMP or IPTC metadata. GPS lives there, and `prepare-photos` strips it.
- **In the target database:**
  - The operator is not an active profile. On staging, the operator must also be in `ADMIN_USER_IDS`.
  - Demo data is present: products with `development_only=1`, or the demo seed's tasters (handles `demo_taster_NN`).
  - The United States is not active.
  - A food is missing, inactive, not rankable or not switched on in the United States.
  - An identity key belongs to a product this import didn't create.

**Per-product refusals.** A product imported earlier whose facts have changed since is listed and skipped (see [Reruns](#reruns-and-failures)); the run goes on.

**Warnings** are listed in the report for the owner and don't stop the run:

- **Possible missed repeats or split lines:** the same brand and food in two batches, with similar names in different lines. They are found with the photo-review helpers `tokenOverlap` and `brandsMayMatch` ([`identity.ts`](../scripts/photo-review/identity.ts)).
- **Names that start with their brand** (26). The site shows the brand separately.
- **Names that carry a pack count:** Publix's cookies ("6ct") and Oatly's "6 Pack". Sizes never belong in a name.
- **Lines with mixed package labels** (8). These are allowed.
- **Two lines of one batch with the same brand, line name and food** (none today). They stay separate lines, because within a batch the line id decides.
- **Unaccounted photos** from `loadRun` (none today).

## Field mapping

### As a submission

Each product's site facts are first built as a [`SubmissionInput`](../server/community/domain/contracts.ts) and parsed by `submissionInput`, so the importer accepts exactly what Add a product accepts.

| Field                                                                      | Value                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `name`, `brand`                                                            | the product's name and brand                                                         |
| `country`                                                                  | `US`                                                                                 |
| `categoryIds`                                                              | the food's id in the target database                                                 |
| `imageSlots`                                                               | the slots that have a photo, always including `front`                                |
| `manufacturerLabel`                                                        | `MANUFACTURER_LABEL`: `vegan`, `plant_based`, or `unknown` for "appears plant-based" |
| `noKnownAnimalIngredients`                                                 | not set, because nobody read the ingredient lists                                    |
| `statusBasis`                                                              | the evidence note                                                                    |
| `retailerIds`                                                              | the stores' retailer ids                                                             |
| `flavor`                                                                   | the flavor; none for the line's original                                             |
| `lineName` or `lineId`                                                     | `lineName` for a line's first product, `lineId` for the rest                         |
| `seasonal`                                                                 | not set, so the product follows its food's season (Eggnog and Turkey Roast)          |
| `ingredientUrl`, `rating`, `enjoyment`, `allergens`, `newFood`, `followUp` | not set                                                                              |

### Rows

The rows are the ones `SubmissionRepository.publish` writes ([`submission-repository.ts`](../server/community/infrastructure/submission-repository.ts)), with these values.

- **Country.** The target database's id for `US`. Country ids differ by environment, so the identity key and line slug use it.
- **Brands.** A brand that already exists by `normalizeName` is reused. Otherwise:
  - **id:** derived from the normalized name;
  - **name:** its first spelling in batch order;
  - **slug:** `<slug(name)>-<last 8 of id>`, the publication's rule;
  - no website;
  - `brand_search` is filled by its triggers.
- **Recipe lines** (`product_families`), written with the line's first product:
  - **id:** `line-<first product id>`;
  - **name** (`canonical_name`): the line name;
  - **slug:** `us-<first product slug>`;
  - **brand and country:** the products'.

  The first product is the line's original, or else its earliest product in batch and id order. The later products join it.

- **Products:**

  | Column                                                | Value                                                     |
  | ----------------------------------------------------- | --------------------------------------------------------- |
  | `id`                                                  | derived from the source key                               |
  | `name`, `flavor`                                      | the product's; `flavor` is null for the line's original   |
  | `slug`                                                | `<slug(brand name)>-<last 8 of id>`, the publication rule |
  | `brand_id`, `product_family_id`                       | the brand and line above                                  |
  | `product_type`, `lifecycle_status`                    | `packaged_food`, `active`                                 |
  | `vegan_status`, `manufacturer_label`                  | see [Classification](#classification)                     |
  | `seasonal`                                            | the food's season (4 products: Eggnog and Turkey Roast)   |
  | `created_by`                                          | the operator, the owner's account                         |
  | `published_at`, `created_at`, `updated_at`            | the run's clock                                           |
  | `development_only`                                    | `0`                                                       |
  | `manufacturer_url`, `data_notes`, `source_checked_at` | null                                                      |

- **Identity key.** `identityKey(country id, brand, name)`, in `product_identity_keys`. Its primary key refuses an exact duplicate.
- **Formula** (`product_versions`):
  - id derived from the source key;
  - labelled "Original formula" and current;
  - summary "Added from VeganAlts store photos";
  - created by the operator.
- **Food** (`product_categories`). The food, ranking-eligible, created by the operator. The `category_countries` trigger keeps the food switched on in the United States.
- **Classification** (`formula_classifications`). See [Classification](#classification). Its evidence:
  - **urls:** none;
  - **imageIds:** the ingredients photo, when there is one;
  - **note** (shown on the product page under "Ingredient evidence"):
    - "Added from VeganAlts store photos. The ingredient list is in the photo and has not been typed out.";
    - followed by "Package: <label evidence>." when the package says vegan or plant-based.

    The label evidence describes where the claim sits on the package, for example "Certified Vegan (vegan.org) logo on the right side of the front". It is never ingredient text, a risk level or a check result.

  `reviewed_by` stays empty.

- **Photos.** See [Photos](#photos).
- **Stores.** Each store is a `product_retailers` row and the operator's `confirm` stance, through `retailerConfirmationStatements` ([`contribution-repository.ts`](../server/community/infrastructure/contribution-repository.ts)), as publication writes them.
- **Derived rows,** as publication writes them:
  - the product's search document and its food's search document;
  - the line's statistics and first publication (`LineRefresh.statements`);
  - `catalog_revisions` and `formula_revisions` by trigger.

### Classification

| Package label       | Ingredients photo | Products | Status                  | `ingredients_checked` | Manufacturer label |
| ------------------- | ----------------- | -------- | ----------------------- | --------------------- | ------------------ |
| Vegan               | yes               | 376      | Ingredients not checked | 0                     | vegan              |
| Vegan               | no                | 3        | Ingredients not checked | 0                     | vegan              |
| Plant-based         | yes               | 153      | Plant-based             | 1                     | plant_based        |
| Plant-based         | no                | 1        | Ingredients not checked | 0                     | plant_based        |
| Appears plant-based | yes               | 291      | Ingredients not checked | 0                     | unknown            |

"Ingredients not checked" is stored as `appears_vegan` with `ingredients_checked = 0`, and reads "Ingredients not checked yet".

- **Why:** this is the documented provisional classification ([MODERATION](MODERATION.md), milestone 6 policy; `provisionalClassification`). It is what a contributor gets who attaches an ingredients photo without ticking "nothing animal-derived". Nobody read these ingredient lists, so the tick is never set.
- **Checks stay hidden.** The 91 products' check results are not used, so no status shows which products were checked (owner decision 2).
- **No Vegan without review.** `reviewed_by` stays empty and no product is stored as Vegan. The launch audit's "Vegan without review" count therefore stays at zero.
- **Vegan-labelled packages** read the same way: the manufacturer label shows Vegan beside "Ingredients not checked yet" ([owner answer 2](#owner-answers)).

### Stores

The seven stores are new on every database: the seed has no retailers. Each is created once through the site's own path:

1. a retailer proposal by the operator (`ContributionService.proposeRetailer`);
2. its acceptance by the operator, through the retailer branch of the moderation decision. That is `CatalogDecisionRepository.acceptRetailer`, as `ModerationService.decide` calls it (`moderation-service.ts:611-616`).

This writes the same proposal, retailer, other names, US market, `proposal_accept` action and audit row as an acceptance on the site.

| Batch name   | Retailer     | Other names            | Website                          | Links |
| ------------ | ------------ | ---------------------- | -------------------------------- | ----- |
| Sprouts      | Sprouts      | Sprouts Farmers Market | https://www.sprouts.com          | 475   |
| Publix       | Publix       | Publix Super Markets   | https://www.publix.com           | 210   |
| Walmart      | Walmart      | —                      | https://www.walmart.com          | 153   |
| Target       | Target       | —                      | https://www.target.com           | 113   |
| Trader Joe's | Trader Joe's | —                      | https://www.traderjoes.com       | 43    |
| Aldi         | Aldi         | —                      | https://www.aldi.us              | 10    |
| Whole Foods  | Whole Foods  | Whole Foods Market     | https://www.wholefoodsmarket.com | 1     |

- **Names.** Shoppers' names, as the batches record them, with the official names as other names. "ALDI" and "Trader Joes" are not other names, because they normalize to the same key.
- **Matching.** A batch's store name maps to a retailer through its name or other names, the way `retailerExists` matches.
- **The list** lives in `scripts/catalog-import/retailers.ts`.

### Not imported

| Not imported                           | Why                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Sizes                                  | No size field exists. The identity key ignores sizes ("8 oz vs. 16 oz: same product", [PRODUCT_MASTER](PRODUCT_MASTER.md)) |
| Risk levels, reasons and checks        | Owner decision 2                                                                                                           |
| Confidence, notes, visits and times    | Review data                                                                                                                |
| Alternate and extra photos             | One photo per slot; product pages are not galleries (AGENTS.md)                                                            |
| The `catalog` column of `products.csv` | It compared with the demo catalog (owner decision 4)                                                                       |
| Barcodes                               | Owner answer 1                                                                                                             |

## Photos

- **Files.** Each slot's photo is `<web>/full/<name>` and `<web>/thumbnail/<name>`, or where `movedPhotos` says it moved. No slot photo has moved today.
- **The bytes go up as they are.**
  - `prepare-photos` made both copies once, with the site's own full and thumbnail specs: WebP at 1,800 px and 500 px, rotated, metadata stripped. Batch 3's full copies are 1,600 px.
  - Re-encoding them would lose quality a second time and spend about 4,100 Images transformations a run.
  - The image rule "normalize once" holds: `prepare-photos` was the normalization.
- **Validation** uses the media model ([`media.ts`](../server/media/domain/media.ts)): `validateImageBytes`, `validateImageInfo`, and the long-edge caps of `derivativeSpecs`.
- **No evidence copy.**
  - The media model makes a 2,400 px evidence copy of ingredients and nutrition photos from an original. Batch 1's originals are deleted, and a copy made from the 1,800 px file would add bytes, not detail.
  - The 2026-10-15 test recorded in [`prepare-photos.ts`](../scripts/prepare-photos.ts) found that 1,800 px keeps footnote-size label text as readable as the 12 MP original.
  - So `evidence_r2_key` stays empty. Nothing that reads images requires it: the product page's `hasEvidence` is false, and the gallery links the full copy instead.
  - Batches 2 and 3 are handled the same way, so every imported label photo is alike.
  - A sharper label photo can replace one later through the normal photo proposal.
- **Keys:** `products/<product id>/<formula id>/<image id>/import/<kind>.webp`.
  - This is the layout of a promoted submission photo, with `import` in place of the publication lease token.
  - The image id derives from the source key, the slot and the full file's SHA-256. A changed photo therefore gets new keys, and bytes under a referenced key never change.
- **Writing.**
  - Photos go up through `R2MediaStorage.put`, which marks `.webp` objects immutable, before the product's transaction.
  - The transaction writes the `product_images` rows through `imageInsertStatements`: accepted, the full and thumbnail keys, the full copy's width and height, no evidence, submitted by the operator.
- **Cleanup safety.** The hourly recovery never deletes a `products/` key that `product_images` references, and it keeps `products/` keys it doesn't recognize ([`recovery.ts`](../server/community/infrastructure/recovery.ts)). Photos put before a transaction that then fails stay in R2 until a rerun uses them.
- **No upload records.** No `media_uploads`, `media_attempts`, staged blobs or promotions are written. Those track web uploads, and the import never spends the daily allowance.
- **No automated photo check.** The owner reviewed every photo on the review sheet (owner decision 1).

## One product, one transaction

**Statement order.** D1 checks foreign keys at each statement, so referenced rows come first:

1. the brand, if new;
2. the line, for its first product;
3. the product, its identity key, formula, food and classification;
4. its photos;
5. its stores;
6. its search documents and the line refresh;
7. the `product_import` moderation action and the audit rows;
8. the receipt, last. The run counts the product written only when this statement changed a row.

**The guard** on every statement requires:

- no receipt yet for this product;
- the operator's profile is active;
- the United States is active;
- the food is active and rankable;
- for a line's later products, that the line exists with the product's brand and country.

The primary keys and unique indexes refuse everything else: the product id, the identity key, the product slug, and the line's id and slug. D1 then rolls the whole batch back.

**Shared with publication.**

- **Extract a builder.** The catalog statements of `SubmissionRepository.publish`, from the brand through the line refresh, move into one exported builder, `catalogEntryStatements`, in a new `server/community/infrastructure/catalog-entry.ts`.
- **Publication keeps its own statements:** the contribution receipt, the extras marker, `product_published`, the pending submission and the receipt state. It calls the builder with its guard. The SQL text and the order of bound values stay the same.
- **`imageInsertStatements`** writes its staged-blob update only when given a blob id, so publication still writes it and the importer doesn't.

### Audit

- **Per product:**
  - **A `moderation_actions` row:**
    - kind `product_import`;
    - the operator as actor, and the new product as target and product;
    - before `{lifecycleStatus: "hidden"}`, after `{lifecycleStatus: "active"}`;
    - a note naming the batch, the source id and the run.
  - **Its `audit_log` row** with the same id, as `ModerationRepository.commit` writes for every action.
  - **A `product_published` audit row,** as publication writes. Its data holds the run, the source key, the manifest hash and the submission facts.
- **Per run:** `catalog_import_started` and `catalog_import_finished` audit rows, with entity type `catalog_import` and the run id. They record:
  - the environment, manifest hash, batch folders and git commit;
  - the counts and the outcome.
- **Per new store:** the proposal and acceptance above.

### Reversal

- **One product.**
  - Its moderation view lists the "product import" action with **Review reversal**, through the existing `ModerationService.reverse`.
  - Reversing it applies the before state, hidden. The product leaves search, rankings and its line's score, and its photos stop being served.
  - Its rows stay, as the delete policy requires.
  - It can be reversed while the product is still active. If it was discontinued or hidden since, the reversal asks for the newer change to be reviewed first.
- **Why the before state is hidden:** a product can't be un-created. Hidden is the administrative state that takes it off every public surface.
- **A whole run.**
  - Before writing to staging, the importer records the database's Time Travel bookmark in its report, as `db:reset:staging` does.
  - `npx wrangler d1 time-travel restore veganalts-staging --bookmark=<bookmark> --env staging` returns to it within the retention window.
  - Before release, resetting and importing again is just as good.
  - R2 objects stay either way. Unreferenced objects are harmless, and a rerun reuses their keys.

## Reruns and failures

- **Ids are derived, not random.**
  - They are UUIDv5 in a `veganalts:import:` namespace, the pattern the demo seed's `seedId` uses with `veganalts:development:`.
  - So a product gets the same ids, slug and photo keys in every environment and on every run.
- **Receipts make reruns safe.** Each product commits a `contribution_receipts` row: the operator, operation `catalog-import`, a key from the source key, and a hash of its site facts. This is the site's own idempotency record.
  - **Same hash:** the product is already imported and is skipped. The report checks that its R2 objects are still there.
  - **Different hash:** the product changed in its run folder since the import. It is skipped and listed. Fix it on the site with the normal edit tools, or, before release, reset and import again. The site wins after an import.
- **Failures:**
  - **A photo upload fails:** the product isn't written. Run again.
  - **A transaction fails:** none of that product is written, because the batch is one transaction. Its photos stay in R2, and the rerun puts the same keys.
  - **The process stops:** run again. Finished products replay.
- **A line's first product** is written before its other products. If it fails, they fail their guard and are listed, and a rerun writes them after it.
- **Targeted runs.**
  - `--limit=<n>` writes the first n products not yet imported, for a pilot.
  - `--only=<source key>` writes one product.
- **Concurrent use.**
  - Stop the local dev server during a local run: both use `.wrangler/state/v3`.
  - Staging can keep serving during its run.

## Environments and order

**Who runs what.** The owner runs every remote database step: the reset, migration, taxonomy seed, import and rebuild. Deploys, commits, pushes and pull requests each need the owner's go-ahead.

### 1. Build

1. **Branch.** The importer needs the photo-review tooling and taxonomy commits on `docs/milestone-seven-recipe-lines-plan`. That's four commits after PR #49 merged, which `develop` doesn't have yet. Recommended:
   - open a pull request for those four commits into `develop`;
   - then build on `feature/store-photo-import`, cut from `develop`.
2. **Specification first:** the [documentation](#documentation) changes.
3. **The publication builder extraction,** with the existing suites passing unchanged.
4. **The importer and its tests;** `npm run check`.

### 2. Local rehearsal

1. Stop the dev server.
2. `npm run db:reset:local -- --confirm-local-reset --taxonomy-only`.
   - This is a new option: it migrates and seeds the taxonomy, without the demo catalog.
   - Local R2 keeps the old demo images, unreferenced.
3. **Choose an operator** listed in `.dev.vars` `ADMIN_USER_IDS`. That can be your own local account, or the browser-test operator `ensureBrowserOperator()` creates (`tests/e2e/session-fixture.ts`, `operator@e2e.invalid`).
4. **Dry run:**

   ```sh
   npm run catalog:import:local -- "<batch 1 web>" "<batch 2 web>" "<batch 3 web>" --out "<folder>" --operator=<user id>
   ```

   Read the report. Fix blocking issues in the run folders (corrections, then render again), and repeat.

5. **Apply:** the same command with `--apply --expect=<hash>`.
6. **Rebuild and verify:**
   - `npm run rankings:rebuild:local`;
   - the importer's `--verify`;
   - `npx tsx scripts/audit-launch-dataset.ts local`.
7. **Look at the site** with the dev server:
   - a food page with a multi-flavor line, such as Coffee Creamer;
   - the Oatly and Elmhurst brand pages;
   - a product page's photos and its evidence link;
   - brand search and the store filter.

   Any screenshots go only to `test-results/captures`.

8. **Run the apply again.** It must write nothing.
9. **Reverse one product's import** and check that it leaves the food page and search.
10. **Return to the demo catalog** before browser tests: `npm run db:reset:local -- --confirm-local-reset`.

### 3. Staging (owner-run)

1. `npx wrangler whoami`, which refreshes a stale OAuth token.
2. `npm run db:reset:staging -- --confirm-reset=veganalts-staging`.
   - It prints the Time Travel bookmark first.
   - It drops every table, accounts included. That clears the demo catalog, its tasters and its ratings (owner decision 4).
   - Demo images stay in R2, unreferenced.
3. `npm run db:migrate:staging`.
4. `npm run taxonomy:seed:staging`. Do not run `db:seed:staging` or `db:seed-images:staging`.
5. Deploy the importer's commit: `npm run deploy:staging`, from a clean worktree.
6. **Set up your admin access.**
   - Sign in on staging and read your user id through a D1 read.
   - Put it in `env.staging.vars.ADMIN_USER_IDS` in `wrangler.jsonc`, and deploy again.
   - The two ids listed there date from 2026-10-04, before the staging resets of 2026-10-13 and 2026-10-16. Those resets dropped the user table, so the ids probably match no account now.
7. **Dry run** against staging. It must print the same manifest hash as the local run.
8. **Pilot:** `--apply --expect=<hash> --limit=25`, then look at the site.
9. **The rest:** `--apply --expect=<hash>`, in the background. Estimated at under an hour.
10. **Rebuild and verify:** `npm run rankings:rebuild:staging`, `--verify`, then the launch audit for staging.
11. **Deploy again.**
    - Cache keys include the deployment, so this replaces every cached page.
    - Otherwise pages refresh on their own within 30 minutes.
    - A script can't purge the cache.
12. **Final checks:** the running-app checks from step 7 of the rehearsal, then `docs/verification/catalog-import.md`.

## Verification

`--verify` is read-only. It checks:

- **Counts against the manifest:**
  - products, lines, brands, retailers and store links;
  - photos per slot.
- **Every product:** active, with one current formula and an accepted front photo.
- **Photos.** Every key is in R2 with the manifest's byte size. A sample of photos reads through `readMedia` at full and thumbnail size.
- **Search.** Every product is in search, and every brand in `brand_search`.
- **Lines.** Every line has its first publication recorded for its food.
- **Rebuild equality.**
  - The apply report keeps a digest of each imported line's derived rows.
  - `--verify` after `rankings:rebuild` recomputes the digest and requires it unchanged.
- **Foreign keys.** `PRAGMA foreign_key_check` returns no rows.
- **No internal data.** Audit rows hold no `internal` fields. The unit tests prove the database writes never see them.
- **The launch audit** ([`audit-launch-dataset.ts`](../scripts/audit-launch-dataset.ts)):
  - zero for:
    - development products and demo accounts. The local browser-test operator is the expected exception;
    - products without a front photo;
    - Vegan without review;
    - possible duplicates;
    - empty foods;
    - pending moderation;
  - "without ingredient evidence" lists the 4 known products.
- **A rerun** reports 824 replayed and 0 written.

## Code changes

- **`server/community/infrastructure/catalog-entry.ts`** (new): `catalogEntryStatements`, extracted from `publish`.
- **`server/community/infrastructure/submission-repository.ts`:** `publish` calls the builder, and `imageInsertStatements` takes an optional blob id.
- **`server/community/domain/catalog-import.ts`** (new, pure):
  - the manifest schema (zod);
  - the import ids;
  - the `SubmissionInput` for each product;
  - the classification through `provisionalClassification`;
  - the evidence note and the receipt hash.
- **`server/community/application/catalog-import-service.ts`** (new):
  - creates the stores;
  - reports what a dry run would write;
  - imports one product (photos, then its transaction);
  - writes the run's audit rows.

  It runs on Workers as well as Node, so the persistence tests exercise it.

- **`scripts/catalog-import/`** (new, Node):
  - `cli.ts`;
  - `manifest.ts`, which reads `loadRun`, the files, `sharp` metadata and hashes;
  - `target.ts`, for the environment checks;
  - `verify.ts`;
  - `retailers.ts`.
- **`scripts/reset-local.ts`:** `--taxonomy-only`.
- **`package.json`:** `catalog:import:local` and `catalog:import:staging`. Production is refused, as in `seed-images.ts`.
- **`scripts/audit-launch-dataset.ts`:** `productsWithoutIngredientEvidence` is reported, not blocking, because ingredient evidence is optional (owner answer 4). `readyForLaunch` ignores it.
- **No schema change and no migration.** Version 1 stays as it is.

## Tests

- **`tests/unit/catalog-import.test.ts`,** in the domain project. It builds the manifest from fixture run folders in a temporary directory, with corrections, a late duplicate, a repeat, carried stores and a moved photo, and covers:
  - lines joining across batches, and two originals or a repeated flavor refused;
  - identity collisions refused, and store mapping;
  - the classification table;
  - internal fields absent from the site facts;
  - ids and hash stable across runs, and unchanged by internal fields;
  - photos with metadata refused, and a stale `products.csv` refused.
- **`tests/integration/catalog-import.test.ts`,** in the persistence project with D1 and R2. It checks that:
  - a three-flavor line and a single product write the same rows as publishing them through the submission path, apart from the receipt and audit rows;
  - a rerun writes nothing, and changed facts are skipped;
  - a line's later product waits for its first;
  - the stores are created once, with `proposal_accept` actions;
  - imported photos have no evidence key, and the product read reports `hasEvidence` false;
  - reversing `product_import` hides the product, takes it out of search and the line's score, and stops serving its photos.
- **The existing suites pass unchanged:** `community-submission`, `line-contributions`, `recipe-lines`, `photo-slots`, `media`, `seed` and `empty-database`. They guard the extraction from `publish`.
- **`npm run check`.**

## Documentation

**Changed first, before the code:**

- **[MODERATION](MODERATION.md):** an "Owner imports" section. It records owner decision 1, the `product_import` action and its reversal, and that the automated photo check doesn't run.
- **[Milestone 7](MILESTONE_7_PLAN.md):** the owner's import decisions of 2026-10-16, linking here.
- **[DATABASE_BASELINE](DATABASE_BASELINE.md):** no schema change, the import ids, the empty evidence key of imported label photos, and the audit rows.

**Added once built:**

- `docs/operations/catalog-import.md`: the runbook above, moved out of this plan.
- `docs/verification/catalog-import.md`: evidence from the local and staging runs.
- The photo-batch skill (`.claude/skills/photo-batch/SKILL.md`, git-excluded) still says no importer exists. It should point to the importer.

**Conflicts resolved by the owner** (2026-10-16, owner answer 4), and the documents updated to match:

- **Sizes.** Different package sizes are the same product, as PRODUCT_MASTER and `productName` already said. [MILESTONE_4_PLAN](MILESTONE_4_PLAN.md) now says so too.
- **Missing ingredient evidence** is optional, as milestone 6 made it. The [launch checklist](operations/launch-checklist.md) no longer counts it as a blocker, and the launch audit changes to match ([code changes](#code-changes)).

## Out of scope

- **Ratings.** The owner rates through the site, so every line starts "Not rated yet".
- Allergens and ingredient lists.
- Barcodes (owner answer 1).
- The shelf-stable tag.
- Production.
- **Deleting the old demo images from R2.** They are unreferenced; deleting them is a separate, explicit cleanup.
- **The site's photo contribution flow,** in which contributors tag photos by slot.

**Known effects:**

- **Everything is new at first.** All 520 lines publish within 90 days of each other, so the New view lists every line, and each carries the New tag for 30 days.
- **My contributions.** Imported products don't appear in the owner's "My contributions", because they have no submission receipts. Their history is the import action on each product's moderation view.

## Owner answers

The owner answered the four open questions on 2026-10-16:

1. **Barcodes are left out of this importer.**
   - Barcode identifiers are a deferred table ([DATABASE_BASELINE](DATABASE_BASELINE.md) §29), and few barcode panels were photographed.
   - A later local pass can decode them from the photos, which stay in R2 and the batch folders.
2. **Vegan-labelled packages follow the documented rule.**
   - The manufacturer label is Vegan, the page reads "Ingredients not checked yet", and no reviewed "Appears vegan" classification is made.
   - Vegan classification itself still needs ingredient evidence and operator review (MODERATION §9).
3. **The Oatly Original repeat is skipped.**
   - Batch 2's `IMG_1145` is batch 1's `PXL_20261011_220200128` in another size.
   - Batch 2's `corrections/IMG_1145.json` now skips it (batch 2 has 72 products), and batch 1 already lists its store, Sprouts.
4. **The documentation conflicts are resolved:**
   - different sizes of the same product are one product;
   - ingredient evidence is optional.

   See [Documentation](#documentation).
