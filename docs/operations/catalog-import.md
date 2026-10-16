# Store photo import

How to load the owner's reviewed store-photo batches into an environment. The [importer plan](../IMPORTER_PLAN.md) explains the design and the owner's decisions.

## What it does

- Reads each batch through the photo-review helper's `loadRun` and builds one manifest, the same for every environment.
- Writes each product in one D1 transaction, after its photos are in R2, with the rows a published submission has. Each product records a `product_import` action that the moderation view can reverse.
- Adds the seven US stores through the retailer proposal path.
- Writes nothing without `--apply`. It never runs against production.

## Commands

```sh
npm run catalog:import:local -- "<batch 1 web>" "<batch 2 web>" "<batch 3 web>" --out "<folder>" --operator=<user id>
```

- **Batches go earliest first:** the order decides a brand's spelling and which product starts a line.
- **`--out`** must be outside the repository. It receives:
  - `manifest.json`: every product's facts, plus the review's internal data (risk, checks, sizes, notes), which never reach the database;
  - `plan-*.json`: the counts, blocking problems and warnings;
  - `dry-run-*.json`, `progress-*.jsonl` and `report-*.json` for each run;
  - `digest-<environment>.json`: the imported lines' derived rows after an apply;
  - `verify-*.json` for each verification.
- **`--operator`** is the owner's account in that environment. It must be active and listed in `ADMIN_USER_IDS`: `.dev.vars` locally, `env.staging.vars` in `wrangler.jsonc` for staging.
- **`--apply --expect=<hash>`** writes. The hash is the manifest hash a dry run printed, so a run writes what was reviewed.
- **`--limit=<n>`** writes at most n products not yet imported (a pilot). **`--only=<source key>`** writes one product.
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
