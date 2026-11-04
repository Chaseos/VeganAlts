# Store photo import

How to load the owner's reviewed store-photo batches into an environment. The [importer plan](../IMPORTER_PLAN.md) explains the design and the owner's decisions.

## What it does

- Reads each batch through the photo-review helper's `loadRun` and builds one manifest, the same for every environment.
- Writes each product in one D1 transaction, after its photos are in R2, with the rows a published submission has. Each product records a reversible `product_import` action. A confirmed repeat with a changed formula adds a current formula version and its label photos and transcription to the earlier product, with its own reversible action.
- Adds the eight US stores through the retailer proposal path.
- Writes nothing without `--apply`. Production requires the reviewed release overlay and the additional safeguards below.

This is the owner's reviewed catalog-import path, separate from public user product submissions and comments. It writes the reviewed catalog facts and photos directly with reversible audit actions; it does not call the automated content-safety or Clef moderation providers. Those providers continue to govern user-submitted products and comments. The import's audit action records who imported the reviewed package evidence; it is not a live provider safety result.

## Commands

```sh
npm run catalog:import:local -- "<batch 1 web>" "<batch 2 web>" "<batch 3 web>" --out "<folder>" --operator=<user id>
```

- **Batches go earliest first:** the order decides a brand's spelling and which product starts a line.
- **`--out`** must be outside the repository. It receives:
  - `manifest.json`: every product's facts, later formula updates, plus review-only data (risk, checks, sizes, notes), which never reach the database;
  - `plan-*.json`: the counts, blocking problems and warnings;
  - `dry-run-*.json`, `progress-*.jsonl` and `report-*.json` for each run;
  - `digest-<environment>.json`: the imported lines' derived rows after an apply;
  - `verify-*.json` for each verification.
- **`--operator`** is the owner's account in that environment. It must be active and listed in `ADMIN_USER_IDS`: `.dev.vars` locally, the selected environment’s `vars` in `wrangler.jsonc` remotely.
- **`--apply --expect=<hash>`** writes. The hash is the manifest hash a dry run printed, so a run writes what was reviewed.
- **`--limit=<n>`** writes at most n products not yet imported (a pilot); it skips later formula updates and full-manifest verification. The subsequent full run applies formula updates after all products. **`--only=<source key>`** writes one product.
- **`--verify`** checks the environment against the manifest without writing.

`npm run catalog:import:staging -- …` takes the same arguments. The owner runs it.

## Before a run

- **Blocking problems stop everything,** before the database is opened:
  - review flags, suggested foods, a stale `products.csv`, two originals or a repeated flavor in a line;
  - identity-key duplicates, unknown stores, unreadable or oversized photos, and photos with metadata.

  Fix them in the run folders (corrections, then `photos:review -- render`) and run again.

- **The environment must be ready:**
  - no demo products or demo tasters;
  - the United States active;
  - every food active, rankable and switched on there.

  Locally, `npm run db:reset:local -- --confirm-local-reset --taxonomy-only` recreates the database without the demo catalog.

## Local rehearsal

1. Stop the dev server, then `npm run db:reset:local -- --confirm-local-reset --taxonomy-only`.
2. Create the local operator. The browser tests' `ensureBrowserOperator()` (`tests/e2e/session-fixture.ts`) adds `operator@e2e.invalid` and lists it in `.dev.vars`.
3. Dry run, then `--apply --expect=<hash>`.
4. `npm run rankings:rebuild:local`, then `--verify`. Verification compares the derived rows with the apply's digest.
5. `npx tsx scripts/audit-launch-dataset.ts local`.
6. Run the apply again: every product replays and nothing is written.
7. Before browser tests, `npm run db:reset:local -- --confirm-local-reset` restores the demo catalog.

## Staging

Follow the [importer plan](../IMPORTER_PLAN.md#3-staging-owner-run): reset, migrate, taxonomy seed (no demo seed), deploy, admin access, dry run, a 25-product pilot, the rest, rebuild, verify, and deploy again to replace cached pages.

## Undo

- **One product:** on its moderation view, review the reversal of its "product import" action. The product is hidden, with its photos, search entry and line score.
- **A whole staging run:** the apply report records the Time Travel bookmark taken before it wrote. Run `npx wrangler d1 time-travel restore veganalts-staging --bookmark=<bookmark> --env staging`.
- **R2 objects stay** under `products/…/import/`. A rerun reuses their keys.

## Production release import (2026-10-23)

The production path uses the same reviewed source batches plus a separate release review. Keep both source batches and their history intact. The review JSON has `version: 1`, the exact `sourceManifestHash`, scope `animal-original-imitation-with-vegan-preparation`, and decisions by `sourceKey`: `exclude`, `hold`, `retain`, `reclassify`, or `duplicate`. Every decision has a reason and may cite evidence URLs. A duplicate names its retained `survivorSourceKey`; a reclassification may supply `food` and optionally a paired `lineName` and `separateLine: true`. Excluded, held and duplicate records never enter the cleaned manifest. Remaining line starters and later formula updates are recalculated consistently. Unknown source keys, duplicate decisions and changed source hashes stop the run.

The owner's final 2026-10-23 decisions are saved in the private workspace folder `assets/catalog-release-2026-10-23/owner-decisions/`. Use its `release-review.json` with the four corrected source batches. The current cleaned manifest contains **1,109 products, 698 recipe lines and four later formulas**, hash `f46eb3aca20adb1fcf69e181bdf62eaaf46a5c90080b3feae6b5ff44ef118008`. The earlier parent-folder manifests and approvals are historical and must not be used for cutover. Source exclusions, Silk ingredient corrections, the Raspberry-only yogurt record and retained duplicate store locations are recorded through the established photo-review corrections/transcriptions; original files are backed up in that private folder. The release overlay assigns Amy’s and Daring to **Chili** and preserves the other reviewed food/line changes. Repeat the full local rehearsal and production dry run for this updated manifest.

1. Prepare the production baseline, taxonomy, auth callbacks, moderation providers and active operator allowlist using the [deployment runbook](deployment.md). These are separate release actions. Do not point the importer at an old schema or a demo catalog.
2. Rehearse the full cleaned import, replay and reversal locally. Use an isolated checkout/database so a rehearsal cannot erase an existing local catalog.
3. Run a full production dry run, supplying the four batch folders in their original order:

   ```sh
   npm run catalog:import:production -- "<batch 1 web>" "<batch 2 web>" "<batch 3 web>" "<batch 4 web>" --out "<private release folder>" --operator=<production user id> --release-review="<review.json>"
   ```

4. Review the cleaned `manifest.json`, counts, warnings and `dry-run-production-*.json`. The report must have no `notReady` entries. Apply with the same arguments plus:

   ```sh
   --apply --expect=<cleaned manifest hash> --approval="<dry-run-production-report.json>" --confirm-production=<production D1 database ID>
   ```

   Approval expires after 24 hours and is bound to the production database, media bucket, operator, manifest and review hashes. A bounded run cannot authorize production; production apply rejects `--limit` and `--only`. The apply rechecks every planned product/formula before its first write.

5. Before writing, the importer obtains a D1 Time Travel bookmark and saves `recovery-production-<run ID>.json`, including target and hashes. Failure to obtain this recovery point stops production. D1 SQL export cannot export the catalog’s FTS virtual tables, so the complete database backup is the Time Travel recovery point. Retain the recovery file even if the run fails before its final report.
6. Every full apply runs post-import verification, including product identity, market, recipe line, food eligibility, current formula/classification, history, photos and sampled R2 objects. Rebuild rankings and run `--verify` to compare the derived digest. Run the launch dataset audit before opening public launch.
7. Repeating an identical apply replays the product/formula receipts. It records a new run audit but creates no duplicate products or formulas. A changed or blocked record requires a new review rather than silently overwriting it.

## Reversible cleanup of an existing catalog

`npm run catalog:cleanup:staging -- --source="<source-manifest.json>" --review="<review.json>" --out="<private folder>" --operator=<id>` writes a dry-run plan and cleaned `release-manifest.json`. Inspect the snapshots, take a fresh D1 Time Travel bookmark, then repeat with `--apply --expect=<cleanup plan hash>`. Local cleanup uses `catalog:cleanup:local`.

The cleanup creates the reviewed foods and adjusts aliases through audited taxonomy actions. It applies `catalog_review` moderation actions with revision checks and receipts: exclusions and evidence holds hide the entry; reclassification changes eligible foods; distinct meals get separate recipe lines. Existing formula, rating, photo and contribution history stays intact. Confirmed duplicates must first be consolidated in moderation; cleanup verifies the active consolidation and its exact survivor. Reversed cleanup receipts require a new review rather than being silently applied again.

The action log records each completed change so interrupted runs can be inspected and resumed with a fresh dry-run hash. Review reversal from the product’s decision history; food memberships with ratings become ineligible instead of losing those ratings. The CLI rebuilds affected ranking/search data and trending. It records affected cache slugs; deploy staging to refresh the shared cache namespace, or allow the normal public-cache TTL to expire before checking public pages.

On 2026-10-23, the owner explicitly authorized a bounded permanent deletion after reviewing the initial reversible cleanup. Forty staging records (37 excluded products and three verified duplicates) were deleted only after a snapshot, Time Travel bookmark, exact-ID/revision guards, a local transaction rehearsal and checks for user activity or pending work. Audit/import records and R2 objects remain. Amy’s chili and Cocojune Raspberry were corrected and restored instead. The private `owner-decisions/` artifacts record this completed exception; it does not add permanent deletion to the normal cleanup CLI or change the default reversible workflow.

## Whole-run recovery

For a remote recovery, pause contributions, verify the database and recorded bookmark, then restore the named database with `wrangler d1 time-travel restore <database name> --bookmark=<recorded bookmark> --env <environment>`. This restores the whole database, including intervening writes, so prefer individual moderation reversals when later contributions must survive. Use the pre-write recovery file if the final report is absent. R2 objects are retained and use deterministic immutable keys; unused objects need no deletion for rollback. Rebuild/verify derived data and refresh public caches after recovery. Production restore is an explicit owner action.
