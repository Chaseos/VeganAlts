# Core ranking operations

The milestone 2 application runs at **https://staging.veganalts.com**. Production retains the coming-soon experience. Read [deployment operations](deployment.md) before changing environments, providers or data. The accepted scope and fixture policy are in [the milestone specification](../MILESTONE_2_PLAN.md).

## Public reads and caching

The gateway records request metrics and delivers fresh CSP nonces. Its `PublicCatalog` loopback entrypoint alone enables native Workers Cache. That entrypoint receives a normalized GET without cookies, authorization, personal validators or a client-provided nonce. SSR loaders call catalog services directly; leaderboards read rebuildable aggregates, never all canonical ratings.

| Surface                  | Freshness  | Background refresh | Maximum stale after expiry on error |
| ------------------------ | ---------- | ------------------ | ----------------------------------- |
| Home/category discovery  | 30 minutes | 60 seconds         | 24 hours                            |
| Category/search          | 10 minutes | 60 seconds         | 24 hours                            |
| Product/formula          | 15 minutes | 60 seconds         | 24 hours                            |
| Public profile           | 10 minutes | 60 seconds         | 24 hours                            |
| Immutable image variants | 24 hours   | 60 seconds         | 24 hours                            |

Catalog browser responses use `Cache-Control: public, max-age=0`. The inner entrypoint separately uses `Cloudflare-CDN-Cache-Control: public, max-age=…, stale-while-revalidate=60, stale-if-error=86400`. Do not add `s-maxage` or `must-revalidate`: those alter Cloudflare's stale behavior. Private, cookie-setting, redirect, error and write responses are not stored. A cold dependency failure returns a useful error rather than caching an empty result.

Accepted and archived images have stable IDs. Milestone 3 changes browser freshness to `max-age=0` so assessed photo removals take effect on revalidation. Their full/thumbnail/evidence variants now share the same public cache boundary with a one-day edge lifetime, avoiding a D1/R2 lookup for every new visitor. Pending, rejected and missing bytes still return uncached errors through the existing media reader. The gateway evaluates `If-None-Match` after shared delivery so a visitor's 304 cannot become a cached representation. Replacing an image creates a different immutable ID; the prior accepted image remains readable under the established history policy.

Cache identity includes deployment, US market, route, representation and relevant query parameters. Documents, React Router `.data` and APIs have distinct keys. Product `version`, category pagination and normalized search terms are meaningful; tracking parameters are not. Nonce-bearing HTML is stored as a template, then rewritten at delivery before a restrictive CSP is attached. Framework scripts use that same fresh nonce.

Inspect `X-Public-Cache`, `Age`, `Server-Timing`, `Cache-Control`, `X-Request-ID` and CSP. Normal cache outcomes include MISS, HIT, UPDATING, EXPIRED, STALE and BYPASS. Native caching is disabled locally. See Cloudflare's [configuration](https://developers.cloudflare.com/workers/cache/configuration/), [debugging](https://developers.cloudflare.com/workers/cache/debugging/) and [purge semantics](https://developers.cloudflare.com/workers/cache/purge/).

Material changes call `scheduleCatalogInvalidation` after persistence, which invokes the internal `PublicCatalog.invalidate` RPC. Product changes include affected category slugs; category changes also invalidate product summaries; profile handle changes invalidate both old and new handles. Accepted image uploads and account edits are wired to these hooks. There is no public maintenance endpoint. Purges can take time to reach a location; failures are logged and TTL expiry remains the backstop. A future catalog editor must invoke the same hook after its transaction commits. Ordinary rating saves deliberately do not purge or revalidate public loaders.

To exercise actual native hit/refresh/stale/collapse/purge behavior without changing application data:

```sh
npx tsx scripts/verify-cache-staging.ts --staging
```

This deploys a disposable Worker with no D1, R2, auth or production bindings, tests shortened freshness/stale windows and a ten-minute purge target, then removes it. Production durations are asserted in unit tests. Allow time for a new workers.dev hostname to propagate. Evidence is written under ignored `test-results/milestone-2/`.

## Contribution and authentication diagnostics

The client batches visible formula IDs into `/api/v1/me/rating-state` after hydration. This response, My Ratings, settings and authentication are private/no-store. A selected score serializes writes per formula/category and coalesces rapid changes. `PUT /api/v1/ratings` atomically returns the authoritative rating, Tried state and created/updated/unchanged outcome. A retry after a lost response reuses the same canonical rating.

Anonymous intent lives only in the current tab's session storage for 30 minutes. Google/Apple return through `/auth/return` to a validated application path, then the client automatically submits the original formula/category selection. OAuth state has its own ten-minute expiry. Success clears the pending intent; a recoverable failure offers retry; `NOT_RATEABLE` requires a fresh selection. Do not “repair” an old formula by silently applying its rating to a new one.

For a failed save, use the returned request ID and Problem Details code. `UNAUTHENTICATED` starts the sign-in return flow; `NOT_RATEABLE` is an eligibility conflict; `RATE_LIMITED` has a 60-second Retry-After; `CHALLENGE_REQUIRED` loads Turnstile only for that interaction. Analytics cannot make a committed contribution fail. My Ratings uses a 20-item cursor page, ordered by updated time and ID; its cursor is a position, not an authorization credential.

## Events and privacy

`APP_EVENTS` uses separate Analytics Engine datasets (`veganalts_staging`, `veganalts_production`). The event index is the environment. `blob1` is event name, `blob2` is coarse route, `blob3` is outcome, and `double1` is count. No search text, user IDs, handles, email, cookies, tokens or callback query values are included. Successful rating events occur only after commit; unchanged retries do not count as new contributions.

The gateway records public document views even on cache hits. The bounded, same-origin `/api/v1/events` allowlist records client navigations, cancellation and network save failures. Search events record only the route/representation. Request logs contain generated request ID, coarse route, status, cache result and duration. Error logs add a domain code and D1/R2/Images/application classification. Automatic invocation logs remain disabled to avoid full authentication URLs.

Use Analytics Engine Studio on the staging dataset:

```sql
SELECT blob1 AS event, blob2 AS route, blob3 AS outcome,
       SUM(_sample_interval * double1) AS events
FROM veganalts_staging
WHERE timestamp > NOW() - INTERVAL '1' DAY
GROUP BY event, route, outcome
ORDER BY events DESC
LIMIT 100
```

```sql
SELECT blob3 AS code, SUM(_sample_interval * double1) AS failures
FROM veganalts_staging
WHERE blob1 = 'rating_save_failed'
  AND timestamp > NOW() - INTERVAL '1' DAY
GROUP BY code
ORDER BY failures DESC
```

Compare `rating_created`, `rating_updated`, `rating_save_failed`, `sign_in_started`, `sign_in_succeeded`, `sign_in_failed`, `sign_in_cancelled`, `search` and `page_view`. Account for sampling with `_sample_interval`. Client events are operational estimates, not canonical contribution counts; use D1 for reconciliation. Logs can be inspected with `npx wrangler tail --config wrangler.jsonc --env staging --format json` or Workers Observability. Filter `event=request_error`, `dependency_failed`, `catalog_invalidation_failed`, `analytics_failed` and the corresponding request ID; never paste private payloads into diagnostics.

### Analytics Engine follow-up and approved fallback

On 2026-10-05 Cloudflare initially rejected the Analytics Engine binding with error 10089 even after dashboard activation. The user approved deployment with structured Workers event logs and an Analytics Engine follow-up. Activation subsequently propagated: deployment accepted `APP_EVENTS`, and Studio verified real cache-hit views, searches, sign-in success and committed rating create/update events. **The activation and ingestion follow-up is complete.** The tested fallback remains available if the binding is absent or throws: one `application_event` JSON log with environment, event name, coarse route, outcome, value and `backend=workers_logs`. No successful contribution depends on either backend.

If a future account/environment rejects the binding, remove only that environment's `analytics_engine_datasets` entry, build and deploy it explicitly, and verify `application_event` in Worker logs. Restore the binding after account enablement and verify actual ingestion before treating Analytics Engine as active. A successful deployment alone is not ingestion evidence. Logs have their own retention and volume limits and are not an analytics archive.

### Web Analytics setup

The staging property is `staging.veganalts.com`, installed manually with its public beacon token in `WEB_ANALYTICS_TOKEN`. The application injects it only into successful public documents and sets `spa:false`; coarse client navigation events are handled separately. Turnstile and Web Analytics origins are explicitly allowed by CSP.

Cloudflare's zone-wide production automatic beacon also matched staging. Configuration rule **Staging uses its dedicated analytics beacon** (`aac90f0af040471c804ef3e3d6ab34c6`) sets Disable RUM for exactly `(http.host eq "staging.veganalts.com")`. This disables the automatic injection on staging while the application supplies the staging beacon. The production hostname retains its existing setting. Verify using a browser-like request with `Accept: text/html` and compression; a default curl request can miss automatic injection. Public staging HTML must contain one staging beacon; private documents must contain none. See [Cloudflare analytics rules](https://developers.cloudflare.com/web-analytics/configuration-options/rules/).

## Abuse controls and resource budgets

| Binding/control           | Current threshold | Key/scope                     |
| ------------------------- | ----------------- | ----------------------------- |
| Authentication hard limit | 60/minute         | Source IP                     |
| Sign-in risk threshold    | 5/minute          | Anonymous actor + IP          |
| Rating hard limit         | 60/minute         | Both account and IP           |
| Rating risk threshold     | 20/minute         | Account + IP                  |
| Search limit              | 90/minute         | IP                            |
| Client event endpoint     | 120/minute        | IP                            |
| Upload edge limit         | 5/minute          | Account                       |
| Image processing budget   | 50/day            | Environment, atomic D1 budget |
| Upload retry budget       | 3 attempts        | Idempotency key               |

Rate-limit namespaces are separate per environment in `wrangler.jsonc`. Edge limits are approximate abuse controls, not a strict global billing cap. Ordinary browsing receives no challenge. Elevated contribution attempts use a managed Turnstile site key restricted to the staging hostname and the corresponding secret stored with Wrangler. Server verification checks success, hostname and action with an eight-second timeout. Never put `TURNSTILE_SECRET_KEY` in a public variable. Expired/unavailable checks retain the selection and offer recovery.

Keep the existing target of at most $10/month incremental infrastructure at development usage. No paid plan or external search service was added. Watch Workers requests/CPU and log volume, D1 rows read/written and storage, R2 operations/storage, Images transformations and Analytics Engine events/queries; account allowances are shared. The existing $10 billing alert is a monitor, not a hard cap. Review [current Analytics Engine limits/pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/) and the provider pricing links in [deployment operations](deployment.md#costs-and-safeguards) before increasing traffic or quotas.

```sh
npx tsx scripts/inspect-catalog-staging.ts --staging
npx tsx scripts/verify-seed-staging.ts --staging
```

The first command performs bounded read-only query-plan/resource checks and a foreign-key audit. The second reseeds approved development fixtures, rebuilds derived data and verifies hashes of real accounts/ratings/Tried records and durable formula records. It never prints those records. There are 31 demo products, ten rankable categories plus four ancestry categories, and 32 formula versions. Fixture image uploads go through the established validate → transform → R2 → atomic metadata pipeline; repeat image seeds reuse completed idempotency keys.

The milestone measurements read 73 rows for a three-result aggregate leaderboard, 27 for six broad-term FTS matches and 21 for a 21-row private cursor page, each under 1.3 ms SQL execution on the measured staging catalog. The cursor uses `ix_ratings_user_updated_id`; search uses FTS5; category ordering uses full-precision aggregate scores. These small-catalog measurements are not a load test. Revisit plans and p95 resource data as the catalog grows before adding infrastructure or speculative indexes.
