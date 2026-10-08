# VeganAlts Architecture v1.0

## 1. Architectural goals

VeganAlts should be inexpensive to operate, easy for AI coding agents and humans to reason about, fast for anonymous visitors, indexable by search engines, and structurally capable of growing into a large community dataset without a premature distributed architecture.

The system should optimize for:

- **read-heavy public traffic**;
- **shared CDN caching**;
- **low-friction authenticated contributions**;
- **strong relational integrity**;
- **rebuildable ranking aggregates**;
- **versioned product history**;
- **evidence-backed moderation**;
- **clean domain boundaries inside one deployable application**.

## 2. System topology

```text
                                  ┌────────────────────────────┐
                                  │        VeganAlts.com       │
                                  └─────────────┬──────────────┘
                                                │
                                    Cloudflare edge / cache
                                                │
                    ┌───────────────────────────┴───────────────────────────┐
                    │                                                       │
              Cache hit                                                Cache miss /
          (normal public read)                                         API action
                    │                                                       │
                    │                                            React Router Worker
                    │                                                       │
                    │                                    ┌──────────────────┼─────────────────┐
                    │                                    │                  │                 │
                    │                                   D1                 R2              Images
                    │                                    │                  │                 │
                    │                            relational data       optimized media   upload transforms
                    │
                    └── cached HTML/assets

Authenticated actions:
Browser → Worker API → Better Auth → domain service → D1/R2 → response

Background work when required:
Worker → Queue / Cron → ranking/moderation/cleanup services → D1/R2
```

## 3. Modular monolith

The application is one deployable system but divided into explicit modules.

Suggested modules:

- **categories** — taxonomy, aliases, discovery;
- **products** — brands, families, country records, versions, relationships;
- **ratings** — similarity ratings, detailed dimensions, tried state;
- **ranking** — aggregates, Bayesian scores, Top/Trending/New;
- **profiles** — public contributor identity and contribution summaries;
- **retailers** — canonical retailers and availability confirmations;
- **comments** — product discussions and reactions;
- **media** — uploads, transformations, canonical image slots;
- **moderation** — edit proposals, confirmations, reports, audit history;
- **search** — FTS index and search orchestration;
- **auth** — Better Auth integration and application profile binding.

### Rule

A logical module is **not** a separate Worker/service by default.

Separate deployment is justified only when there is measurable operational value that cannot be achieved cleanly in the monolith.

## 4. Layering and dependency direction

Prefer:

```text
Route / API handler
       ↓
Application service
       ↓
Domain policy / calculation
       ↓
Repository / infrastructure adapter
       ↓
D1 / R2 / Cloudflare service
```

Rules:

- Route components must not contain ranking formulas.
- Ranking code must not depend on React.
- Domain policies must not construct SQL strings.
- Repository code must not decide user-facing copy.
- Cloudflare-specific code belongs at infrastructure boundaries.
- Derived data may be rebuilt; canonical domain data may not depend on caches.

## 5. Public read flow

Public rankings and product pages are shared content and must not require session lookup.

```text
GET /us/ground-beef
        ↓
Cloudflare cache
        ↓
  ┌─────┴─────┐
  │           │
 HIT        MISS/STALE
  │           │
HTML       Worker
              ↓
      query small aggregate/read model
              ↓
         render HTML
              ↓
          cache result
```

### Critical rule

**Public page loaders must not read the user's auth session.**

This keeps one shared representation cacheable for anonymous and signed-in visitors alike.

If the browser needs personalized state such as “your rating,” load that after page load through a private endpoint.

Example:

```text
Public HTML: #1 Impossible, #2 Beyond...
                   +
Client request: GET /api/v1/me/rating-state?versionIds=...
                   ↓
Authenticated private response
```

## 6. Public caching policy

Initial target freshness:

| Surface                      | Shared cache target | Notes                                                                  |
| ---------------------------- | ------------------: | ---------------------------------------------------------------------- |
| Category ranking             |         ~10 minutes | Rankings do not need second-by-second updates.                         |
| Product detail               |          15 minutes | Current and historical formulas have separate cache identities.        |
| Homepage featured categories |          30 minutes | Configured features plus Trending/New sections from precomputed data.  |
| Public profile               |          10 minutes | Chosen public identity and contribution counts only.                   |
| Immutable image variants     |            24 hours | Stored derivatives; browser revalidation supports moderation removals. |
| Static policies/about        |          Long-lived | Prefer static assets or very long caching.                             |
| Private/account pages        |     No shared cache | Personalized.                                                          |

Use `stale-while-revalidate` and `stale-if-error` where appropriate so a previously valid page can remain available while refresh occurs or a transient backend error happens.

Avoid `Set-Cookie` on shared public responses because it can make caching unsafe or force bypass behavior.

### Cache invalidation philosophy

Do **not** purge a category page after every rating.

Normal ratings update canonical/aggregate data; the public page catches up at its normal refresh interval.

Immediate purge/refresh is reserved for important factual events, for example:

- a product is removed from ranking eligibility;
- vegan status enters Under Review;
- a duplicate merge changes canonical identity;
- a confirmed formula transition changes the current version;
- a moderation action removes inappropriate content.

## 7. Ranking write flow

```text
PUT similarity rating
       ↓
Authenticate contributor
       ↓
Validate product/category/current formula
       ↓
Upsert rating
       ↓
Upsert tried state
       ↓
Recalculate affected aggregate row
       ↓
Commit using D1 batch where atomicity is needed
       ↓
Return private confirmation
```

The public category HTML does not need to be regenerated immediately.

## 8. Aggregate/read-model strategy

Raw `ratings` are canonical.

`product_category_stats` is a rebuildable read model containing values such as:

- rating count;
- rating sum;
- raw mean;
- Bayesian score;
- tried count;
- recent rating count;
- trending score;
- last recalculation time.

Category pages query this compact table rather than scanning the raw rating set.

If aggregates become corrupted, rebuild them from canonical ratings.

## 9. Background work

Do not require Queues/Cron to launch the first useful loop unless they simplify a concrete operation.

Good later uses:

- recompute daily trending inputs;
- rebuild aggregate rows in bulk;
- prune temporary uploads;
- process moderation notifications;
- update contribution counters;
- refresh search documents;
- run integrity checks;
- send email notifications if/when added.

Ranking writes that need an immediately correct Top score should update their affected aggregate synchronously; broad analytics/trending work can be deferred.

## 10. Database placement and read replication

Use one primary D1 database initially, with country IDs/records rather than one database per country.

Reasons:

- profiles span countries;
- moderation spans countries;
- product families may link markets;
- one schema/migration history is easier to operate;
- cross-market admin reporting remains possible.

D1 global read replication may be enabled later when useful. Current Cloudflare behavior requires the D1 Sessions API to use read replicas correctly. Do not introduce read replication until query patterns are understood and tested.

## 11. Authentication architecture

Better Auth owns authentication/session records. VeganAlts owns product/community profile information.

Conceptually:

```text
Better Auth user
      ↓ 1:1
VeganAlts profile
      ├── handle
      ├── public display fields
      ├── moderation trust metadata
      └── contribution counters/read models
```

Initial social providers:

- Google;
- Apple.

Authentication is required for contributions but not browsing.

The auth module must expose a small application-facing abstraction (for example `requireUser()` / `getOptionalUser()`), so domain modules are not coupled directly to Better Auth APIs.

## 12. Image/media architecture

### Canonical slots

Product versions may hold canonical images for:

- front;
- back;
- ingredients;
- nutrition/allergen;
- prepared/unpacked.

### Upload flow

```text
Browser upload
   ↓
Worker validates type/size/basic dimensions
   ↓
Cloudflare Images binding transforms raw bytes
   ├── optimized full WebP
   └── thumbnail WebP
   ↓
R2 writes
   ↓
D1 stores image metadata/object keys
   ↓
temporary source removed after success
```

The preferred raw-byte Images-binding workflow may require enabling Cloudflare Images Paid even when transformation usage remains within the included allowance. Verify account billing configuration when implementation begins.

### Media rules

- D1 never stores image bytes.
- R2 Standard is the default storage class for active product imagery.
- Image filenames/keys are opaque IDs, not user-controlled strings.
- Strip unnecessary metadata where practical.
- Ingredient evidence receives higher-resolution treatment.
- Accepted old formula images remain linked to their historical version.
- A replacement image proposal does not destroy the current accepted image until approved.

## 13. Search architecture

Initial search uses D1 FTS5.

Use a denormalized search document/index that can contain:

- entity type;
- entity ID;
- country;
- title;
- brand;
- aliases;
- category ancestry/aliases;
- searchable supporting text.

Search is not the canonical product store. Search entries are derived and rebuildable.

## 14. Moderation architecture

Moderation is confidence-based and risk-sensitive.

Normal opinions publish quickly; canonical fact changes accumulate evidence and confidence.

The system must preserve:

- who proposed a change;
- what was proposed;
- confirmations/disagreements;
- supporting evidence;
- final resolution;
- before/after values for applied material changes.

See `MODERATION.md` for policy.

## 15. SEO and URL architecture

URLs should be human-readable and market-aware while database relationships use stable IDs.

Conceptual examples:

```text
/us/ground-beef
/us/ground-beef/impossible-beef
/us/brands/impossible-foods
/users/examplehandle
```

Slugs can change without changing IDs. Maintain redirect/alias support when canonical slugs change.

Pages should emit canonical URLs and structured metadata appropriate to the content, but schema.org markup must reflect what the page genuinely represents rather than being added solely for SEO manipulation.

## 16. API architecture

All app APIs live under:

```text
/api/v1/*
```

Better Auth may use its standard auth route namespace, for example:

```text
/api/auth/*
```

The website's server-side loaders/services should call application services directly rather than making HTTP requests back into its own `/api/v1` endpoints.

Future native clients use the same `/api/v1` surface.

## 17. Environments

Minimum environments:

- local;
- preview/staging;
- production.

Use separate D1 databases and R2 buckets for non-production vs production. Never point local automated tests at production resources.

Suggested bindings:

```text
DB
MEDIA_BUCKET
IMAGES
RATE_LIMIT_*
ANALYTICS
QUEUE (when introduced)
```

Secrets are managed through Cloudflare secrets/environment configuration, never committed to the repository.

## 18. Observability

Log enough to debug failures without logging sensitive auth tokens or unnecessary personal data.

At minimum measure:

- Worker exceptions;
- request latency for dynamic endpoints;
- D1 error rate;
- auth failures by category (not token contents);
- image-processing failures;
- rating-write failures;
- queue failures/dead letters when queues exist;
- moderation workflow errors;
- cache hit/miss effectiveness where available.

Product analytics should separately capture intentional events such as category views, product views, rating submissions and product contributions.

## 19. Abuse and security baseline

- Turnstile selectively on registration/high-abuse flows.
- Rate limit rating, comment, report, submission and image endpoints.
- Validate ownership/authorization server-side for every write.
- Validate MIME using server-side inspection where feasible; do not trust filename extensions.
- Limit upload bytes and image area.
- Sanitize/escape all user-generated text on rendering.
- Use parameterized Drizzle/SQL access.
- Do not expose private R2 write credentials to clients.
- Use signed/direct upload only if the design maintains equivalent validation and authorization.
- Store public profile identity separately from OAuth provider-specific personal data.

## 20. Clean-architecture rules for AI coding agents

AI-generated changes must follow these rules:

1. Do not add a new infrastructure product without documenting why existing stack components cannot solve the problem.
2. Do not put database queries directly in UI components.
3. Do not duplicate ranking formulas in multiple modules.
4. Do not bypass service authorization checks from admin routes.
5. Do not add generic “utility” modules when a domain-specific module is clearer.
6. Prefer explicit types/enums over unvalidated string conventions.
7. Add database migrations for schema changes; never mutate production schema manually.
8. Preserve backwards compatibility for `/api/v1` unless a documented version change is made.
9. Keep cache behavior explicit on every public/private route family.
10. Add tests around ranking math, formula transitions and moderation state changes before relying on generated code.

## 21. Current architectural non-goals

- multi-region writable database;
- Kubernetes/containers;
- microservices;
- event sourcing for the whole application;
- real-time WebSocket ranking updates;
- live retailer inventory integrations;
- semantic/vector search;
- dedicated recommendation ML;
- native mobile backend specialization.

These can be reconsidered only when a real requirement appears.

## Milestone 2 delivery boundaries

The uncached Worker gateway normalizes public requests and calls the dedicated `PublicCatalog` entrypoint in the same Worker. Native Workers Cache owns request collapsing, freshness, background refresh and stale-on-error behavior. Identity includes deployment version, country, route, meaningful query parameters and document/data/API representation. Cookies, authorization, origin and client nonce headers never enter the public renderer. SSR loaders call application services directly and read aggregates, never raw ratings or sessions.

Catalog responses use browser `Cache-Control: public, max-age=0`; the inner entrypoint uses `Cloudflare-CDN-Cache-Control` with its route TTL, `stale-while-revalidate=60` and `stale-if-error=86400`. Immutable accepted/archived image variants use the same normalized public boundary with one-day edge freshness and use browser `max-age=0` so operator removals take effect on revalidation. The gateway evaluates their conditional ETags after cache delivery; pending/rejected/missing media is never stored. Do not add `s-maxage`, `must-revalidate` or `proxy-revalidate`: those disable native stale behavior. The gateway replaces the cached template nonce with a fresh nonce in authorized framework scripts at every delivery. Errors, redirects, private data, writes and Set-Cookie responses are excluded.

## Milestone 3 contribution boundaries

Follow [milestone 3](MILESTONE_3_PLAN.md): domain contribution decisions remain provider-neutral and deterministic, with manual operator resolution. Operational leases, hash reuse and D1 quotas protect staged uploads before canonical creation. Staged media is private. Canonical derivatives are promoted before an atomic fenced D1 publication; recovery removes only unreferenced expired objects. Existing hourly recovery is extended with bounded resumable processing. New private routes do not enter PublicCatalog. Protected changes update canonical state and audit together, maintain derived search and invalidate affected products/categories/media. Duplicate redirects bypass cache; donor data is retained without affecting survivor scores. Edge rate-limit bindings supplement rather than replace atomic account-wide accounting.

React Router hydrates normally with route-level code splitting. One batched private request loads the session projection and visible formula ratings; score writes serialize per formula/category, coalesce rapid selections and never revalidate public loaders. The authoritative response contains the saved rating and Tried state. A pending anonymous selection lives in sessionStorage for 30 minutes and is bound to its original formula/category.

Material profile/media changes invoke the internal cache-invalidation RPC after persistence. Product/category changes can invalidate affected discovery and ranking tags. Purge failures are logged and bounded by normal freshness; ordinary ratings never purge. Search index rebuilds run during catalog maintenance, not page views.

## Milestone 4 boundaries

Follow [milestone 4](MILESTONE_4_PLAN.md). Automated moderation lives in `server/moderation/`: domain question sets and a pure policy engine, an application `ModerationDecisionService`, and infrastructure providers (Workers AI Clef and a local-only fake). Contribution services depend on the service interface, never on Clef response shapes. Deterministic validation, limits, staging and hash deduplication always run first; atomic D1 accounting reserves budget before a provider call. Provider output is schema-validated, and failure degrades to review.

Comments render their first page in the shared product document. Sorting and pagination use a cookie-free comments API with a short shared TTL; the viewer's own votes and pending comments load from a private endpoint after hydration. Only moderation removals and author deletions purge the product tag. Comment writes never touch rating aggregates.

The hourly schedule runs independent passes: media recovery, community recovery, trending statistics, and automation (decision lease expiry, held-comment re-evaluation, automatic proposal acceptance and resumable category-merge pages). Each pass is bounded and resumable. Category slug redirects, like product redirects, are resolved inside the public entrypoint on a cache miss and returned uncached. A `view` query parameter is part of category cache identity.

Production catalog availability is controlled by one `PUBLIC_LAUNCH` variable instead of environment-name checks.
