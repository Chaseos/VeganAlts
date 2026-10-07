# Community catalog operations

The [milestone 3 specification](../MILESTONE_3_PLAN.md) defines publication, moderation and duplicate policy. Contribution pages are `/add-product`, `/contribute/:productId` and `/my-contributions`. Allowlisted operators use `/admin/moderation`. The server rechecks administrator authorization on every operator request; browser controls do not grant privileges.

## Review and recovery

Review ingredient concerns first. Reports preserve established catalog facts until an operator accepts a proposal or resolves a report with an assessed effect. Current and proposed fields, evidence, source references and catalog revisions are shown before saving. A stale decision must be refreshed; do not work around its revision check. Follow-up notes remain visible to the contributor. Rejected proposals and resolved reports retain their audit history.

Product decision history offers reversal for material catalog changes. A reversal restores only the fields affected by that action and rejects overlapping later changes. Reformulation reversal restores the current formula pointer while preserving the later formula and its ratings, comments and evidence. Duplicate consolidation hides the donor and redirects its URLs without transferring any data. Its reversal restores the original donor identity and removes the redirect. Survivor scores and metadata are never rewritten.

Removed and duplicate-archived photos are unavailable through public media URLs. Operators can inspect preserved bytes through the private moderation media endpoint. Replaced packaging photos remain historical evidence. Do not delete canonical `product_images` rows or referenced R2 objects to resolve a moderation case.

## Limits and temporary media

`COMMUNITY_LIMITS` accepts positive integer JSON overrides. An empty object uses the approved defaults: 3 images, 30 MiB per submission, 100 MiB staged bytes per contributor/UTC day, 5 new submissions per contributor/UTC day, 2 concurrent transformations, 50 processing attempts per environment/UTC day, 3 attempts per processing content/policy key, 24-hour abandoned staging retention, and 30-day held-review retention. Retention values are milliseconds. Individual images retain the existing 10 MiB/40-megapixel validation. Legacy operator uploads share the environment processing budget. Edge rate bindings and managed Turnstile are additional burst/abuse controls, not exact global quotas.

A processing key is contributor + SHA-256 content + transformation policy. Changing an HTTP idempotency key cannot multiply the transformation allowance or bypass a processing lease. Completed publication switches the processing receipt to durable canonical derivatives, allowing safe cross-key reuse after temporary cleanup. An interrupted promotion uses distinct R2 keys on its next lease; a late writer cannot overwrite a successful publication. Canonical database rows appear only after the derivatives have been promoted and the guarded D1 batch succeeds.

Hourly recovery expires at most 100 records per database cleanup statement and scans at most 100 R2 objects per known prefix (`uploads/`, `tmp/submissions/`, `products/`). Durable cursors resume later passes. Live leases, held evidence and every canonical image reference are checked before deletion. Unknown objects are retained for investigation. Delayed writes are discovered when the scan returns to their prefix. Large backlogs require successive bounded passes; do not replace this with a broad bucket deletion.

For a failed submission, inspect its private receipt and Problem Details code. `EVIDENCE_REQUIRED` needs the missing upload; `UPLOAD_BUSY_OR_LIMITED` needs a retry after the active lease or quota window; `UPLOAD_LIMIT_OR_CONFLICT` needs the correction stated in its message. The browser can revise a submission with a fresh receipt while preserving its form fields. `SUBMISSION_CHANGED`, `STALE_PRODUCT` and `STALE_DECISION` require fresh context. A saved result remains authoritative if a later cache purge fails.

## Safe diagnostics

Use the staging binding explicitly. The following aggregate queries avoid private payloads and authentication data:

```sql
SELECT purpose,state,COUNT(*) AS count FROM submission_receipts GROUP BY purpose,state;
SELECT state,COUNT(*) AS count FROM staged_attempts GROUP BY state;
SELECT state,MIN(lease_expires_at) AS oldest_lease,COUNT(*) AS count
FROM staged_attempts WHERE state='processing' GROUP BY state;
SELECT status,change_type,COUNT(*) AS count FROM edit_proposals GROUP BY status,change_type;
SELECT status,reason_code,COUNT(*) AS count FROM reports GROUP BY status,reason_code;
SELECT prefix,CASE WHEN cursor IS NULL THEN 'start' ELSE 'continuing' END AS progress FROM community_recovery;
PRAGMA foreign_key_check;
```

Filter request logs by request ID and coarse failure codes. `community_invalidation_failed` means persistence succeeded but invalidation scheduling failed; `catalog_invalidation_failed` means a native purge failed. Public TTL expiry remains a backstop. Do not print authentication tables, session cookies, private evidence, full request payloads or signed provider URLs in diagnostic reports.

## Staging rollout and rollback

Before migrations, verify the staging Worker/domain, `DB`, `MEDIA_BUCKET`, `IMAGES`, administrator allowlist and provider bindings. Capture a D1 Time Travel bookmark and the currently deployed Worker version using explicit `--config wrangler.jsonc --env staging` flags. Record them in the verification evidence. Apply append-only migrations before deploying a Worker that reads the new schema.

```sh
npx wrangler d1 time-travel info DB --config wrangler.jsonc --env staging --json
npx wrangler deployments list --config wrangler.jsonc --env staging
npm run db:migrate:staging
npm run deploy:staging
```

If the new Worker needs to be rolled back, use the recorded compatible Worker version; the additive schema can remain. A Worker rollback does not revert D1. Prefer a forward repair for data problems. Time Travel restoration requires an explicit operator decision because it would also discard contributions written after the bookmark. Preserve the current database first, inspect the exact recovery interval and reconcile later contributions before any restore. Keep R2 and canonical evidence intact. Never restore or deploy production as part of milestone 3 acceptance.
