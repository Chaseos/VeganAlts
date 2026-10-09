# Backup and recovery

VeganAlts keeps canonical data in D1 and media bytes in R2. Everything else (rating aggregates, daily statistics, Trending, search documents) is derived and can be rebuilt from canonical rows.

## What protects what

| Asset                                          | Primary protection                                                                 | Restore path                                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| D1 (catalog, contributions, audit, moderation) | Cloudflare D1 Time Travel (point-in-time, 30 days on Workers Paid; 7 days on Free) | `wrangler d1 time-travel restore` to a bookmark, or import an export into a new database                                    |
| D1 exports                                     | `wrangler d1 export` before every migration and on a regular schedule              | Import into a fresh database, rebuild derived data                                                                          |
| R2 media                                       | Immutable, content-addressed keys; nothing referenced is ever deleted by cleanup   | Re-upload only if an object is lost; the drill reports missing referenced keys                                              |
| Derived data                                   | Not backed up                                                                      | `npm run rankings:rebuild:<env>` (aggregates, daily statistics, Trending); search is rebuilt by the seed/rebuild statements |

## Before every migration

1. `npx wrangler d1 time-travel info DB --env <env> --config wrangler.jsonc --json` and record the bookmark in the verification record.
2. Run the backup drill (staging) or take an export (production): `npx wrangler d1 export DB --remote --env production --config wrangler.jsonc --output <private path>`. Exports contain personal data; store them encrypted outside the repository and delete them when no longer needed.
3. Apply migrations with `npm run db:migrate:<env>` (runs the preflights), then deploy compatible code.

## Restore drill

`npx tsx scripts/verify-backup-staging.ts --staging` exercises the full path read-only against staging:

1. Lists every real table (skipping the FTS5 index and its shadow tables, which are derived).
2. Exports the schema of all tables, then their rows, with foreign-key checks deferred so tables can load in any order.
3. Restores into a throwaway local database and compares every table's row count with staging.
4. Recreates the FTS5 table and rebuilds search documents from the restored rows.
5. Checks that every R2 object referenced by accepted or archived images exists.

The export lives only in a temporary directory that is always deleted. Evidence (counts only) is written to `test-results/milestone-4/backup-drill.json`. Run it after each staging migration and before any production cutover.

## Choosing a recovery

- **A wrong catalog decision** (bad merge, rename, photo, proposal): use the audited reversal in the moderation or taxonomy workspace. It preserves contributions made afterwards. This is the normal path.
- **A faulty deployment**: roll back the Worker version (`npx wrangler rollback VERSION_ID --config wrangler.jsonc --env <env>`). Migrations are additive, so the previous code runs against the newer schema.
- **Data corruption or a destructive mistake**: restore D1 with Time Travel to the bookmark taken before the change. This discards every write after the bookmark, so first export the current database, list contributions made since the bookmark (ratings, comments, proposals, submissions) and plan to re-apply them. A Time Travel restore requires an explicit operator decision.
- **After any restore**: run `npm run rankings:rebuild:<env>`, re-run the seed's search statements (or the drill's rebuild) and the launch dataset audit, then verify public pages.

## R2

Accepted and archived image derivatives are written once under immutable keys and are never removed by cleanup; only unreferenced staging objects expire. Consider enabling R2 bucket replication or periodic `rclone` copies to a second account before launch if media loss would be costly; this is listed as a launch checklist decision.
