# VeganAlts API v1.0

## 1. Purpose

The web app and future native clients should share stable application services. Public web loaders may call those services directly server-side; native/external clients use the HTTP API.

Base namespace:

```text
/api/v1
```

Better Auth routes may live separately under:

```text
/api/auth/*
```

## 2. Principles

- JSON for application API payloads.
- Stable IDs in payloads; human-readable slugs are presentation/routing concerns.
- Cursor pagination for large collections.
- Server-side authorization on every write.
- Public endpoints are cacheable only where explicitly safe.
- Private endpoints return `private, no-store` unless a narrower policy is proven safe.
- Version breaking HTTP contracts by API namespace, not hidden behavior changes.

## 3. Response shape

Typical success:

```json
{
  "data": {},
  "meta": {}
}
```

Collections:

```json
{
  "data": [],
  "meta": {
    "nextCursor": "opaque-token-or-null"
  }
}
```

Errors should use a consistent Problem Details-style structure:

```json
{
  "type": "about:blank",
  "title": "Invalid request",
  "status": 400,
  "code": "INVALID_RATING",
  "requestId": "generated-request-id"
}
```

## 4. Authentication

Initial web authentication uses Better Auth session cookies.

Public read endpoints do not require a session.

Authenticated application handlers use a single auth abstraction such as:

```text
requireUser(request)
getOptionalUser(request)
```

Do not let each feature independently parse Better Auth cookies/tokens.

Future native clients may use Better Auth-supported token/social-ID-token mechanisms, but native auth transport should be designed when a native client is actually planned.

## 5. Public endpoint families

The following public routes are implemented in milestone 2. Slugs select public discovery resources; responses and write payloads retain stable IDs. Only the United States catalog (`country=US`, or omitted) is supported. Public loaders use these same application services directly.

### Discovery and rankings

```text
GET /api/v1/categories
GET /api/v1/categories/:categorySlug?page=1&unrankedPage=1
GET /api/v1/products/:productSlug?version=productVersionId
GET /api/v1/search?q=ground+beef&country=US
GET /api/v1/profiles/:handle
```

Categories return all active rankable categories and configured featured categories. Category detail returns category/child metadata, separate ranked and unranked lists, page numbers and `hasNext` flags. Public pages use bounded 20-item pages, at most 100 pages. Search returns grouped categories (up to 12) and products (up to 20), matching canonical names, aliases, brands and ancestry. Query text is normalized, capped at 80 characters and compiled into at most eight literal prefix tokens for FTS5.

Products have one canonical slug independent of category. An optional validated `version` selects an existing historical formula belonging to that product. History remains readable and cannot receive new current-formula ratings. Historical product responses retain inactive categories and their aggregate scores with `isActive: 0` and `canRate: 0`; current product responses and category discovery include only active categories. Profile responses contain only chosen handle/display name and rating/Tried counts. Individual rating history is private.

## 6. Authenticated endpoints

### Rating

```text
PUT /api/v1/ratings
```

```json
{
  "productVersionId": "...",
  "categoryId": "...",
  "overallSimilarity": 5
}
```

The strict schema rejects extra ownership fields and non-integer scores. A challenged request may additionally send `challengeToken` (at most 2048 characters). The actual JSON stream is limited to 4096 bytes. The server checks origin, active session/account, integer 1–5 score, current formula, country and category eligibility, and configured rate limits. Authorization always derives the user from the server session.

The atomic write upserts one canonical user/formula/category rating, marks that formula Tried, and updates rebuildable aggregates. The response is `{data: {rating: {id, productVersionId, categoryId, overallSimilarity, updatedAt}, tried: true, outcome: "created" | "updated" | "unchanged"}, meta: {}}`. Outcomes come from the successfully committed snapshot, so identical retries neither duplicate records nor emit a second created/updated event. All write responses are private/no-store.

### Personal state and history

```text
GET /api/v1/me/rating-state?versionIds=id1,id2
GET /api/v1/me/ratings?cursor=...
```

Batched state accepts up to 40 unique formula IDs and returns `{user: {handle, displayName} | null, ratings, triedVersionIds, turnstileSiteKey}`. Anonymous state is neutral. All responses are private/no-store. My Ratings requires an active session, returns 20 records per page in `data`, and a nullable `meta.nextCursor`. Cursors encode the last `(updatedAt,id)` pair with descending stable ordering. Every row includes product/category, personal score/date and current or historical formula context; no other user's records are returned.

The browser stores anonymous intent in tab-scoped storage for 30 minutes, with a validated same-origin return destination. After `/auth/return` it automatically submits the original formula/category selection. Recoverable errors retain the selection for retry; a formula/eligibility conflict requires an explicit fresh score.

### Analytics

```text
POST /api/v1/events
```

The same-origin endpoint accepts at most 512 bytes and only `{event,route}` from fixed allowlists. Client events are `page_view`, `rating_save_failed`, and `sign_in_cancelled`; route values are coarse surface names. Successful write and auth events are emitted authoritatively on the server. Cookies, raw search text, URLs, user IDs and provider material are not event fields.

### Media and later scope

`POST /api/v1/media/uploads` remains the administrator-only multipart upload API described in [deployment operations](operations/deployment.md). Standalone Tried/deletion controls, detailed dimensions, comments, retailers, product submissions, public individual rating lists, image proposals and moderation APIs are deferred; the schema's future capabilities do not imply exposed endpoints.

## 7. Admin/moderation routes

Admin API should be explicitly separated, for example:

```text
/api/v1/admin/moderation/*
```

Admin authorization is server-side role/permission-based; hiding the route in the UI is not authorization.

Examples:

```text
GET  /api/v1/admin/moderation/queue
POST /api/v1/admin/moderation/proposals/:id/accept
POST /api/v1/admin/moderation/proposals/:id/reject
POST /api/v1/admin/moderation/products/:id/merge
POST /api/v1/admin/moderation/products/:id/set-review-status
```

## 8. Pagination

My Ratings uses cursor pagination now. Future comments, moderation queues and large product lists must also use cursors. Public ranking pagination is deliberately capped at 100 pages of 20 records for this milestone.

Do not rely on large OFFSET pagination for growing datasets.

Cursors are opaque to clients and may encode stable sort keys/IDs.

## 9. Idempotency

For writes vulnerable to retries/duplicate submissions, support an idempotency key or stable client request ID.

High-value examples:

- new product submission;
- image upload finalization;
- edit proposal creation;
- moderation accept/merge operations.

Rating writes are naturally idempotent as an upsert on the unique user/version/category key.

## 10. Caching

### Public category/product GET

Can return shared-cache headers according to architecture policy.

### Private endpoints

Return private/no-store unless explicitly justified.

### Writes

Never cache write responses.

### Important invalidation

A write may enqueue/request immediate invalidation only for material factual changes. Routine rating writes rely on normal cache expiry.

## 11. Validation

Use a single schema validation approach (for example Zod or equivalent) shared where practical between client forms and server boundaries, but server validation is authoritative.

Validate:

- enums;
- ID formats;
- country/category/product relationships;
- score ranges;
- text length;
- URLs;
- image metadata;
- rate limits;
- permissions.

## 12. Rate-limit categories

Exact limits remain configurable, but separate namespaces should exist for:

- auth/sign-up;
- ratings;
- comments;
- product submissions;
- reports;
- edit proposals;
- image uploads;
- search abuse.

Use user ID when authenticated and IP/device/risk signals where appropriate.

## 13. Security headers / CSRF

Follow Better Auth's recommended CSRF/origin/session protections for web cookie auth.

Sensitive writes must require same-origin/valid CSRF protections as appropriate; do not assume CORS alone is protection.

Set modern security headers at the Worker/application boundary and test them in production-like preview environments.

## 14. API observability

For dynamic endpoints capture:

- route template;
- status class;
- duration;
- authenticated/anonymous classification (not identity in general logs);
- domain error code;
- D1/Images/R2 failure class;
- rate-limit decision;
- request ID/correlation ID.

Do not log OAuth tokens, session tokens, raw passwords or unnecessary personal information.

## 15. Backwards compatibility

For `/api/v1`:

- additive response fields are allowed;
- clients must ignore unknown fields;
- do not rename/remove fields without versioning;
- enum additions must be considered carefully for older clients;
- breaking changes require `/api/v2` or a documented migration strategy.

## 16. API vs server loaders

React Router loaders/actions that run in the same Worker should call the underlying service layer directly:

```text
loader → categoryService.getRanking(...)
```

not:

```text
loader → fetch("https://veganalts.com/api/v1/categories/...")
```

The HTTP API is an adapter around the same application services, not a mandatory network hop inside the monolith.

## Milestone 3 contract additions

The approved [milestone 3 specification](MILESTONE_3_PLAN.md) adds authenticated submission preflight/upload/finalization, personal contribution history, retailers, reports and focused product-change proposals, with allowlisted `/api/v1/admin/moderation/*` review operations. These supersede the milestone 2 deferrals only for the approved scope. Writes require same-origin requests, active accounts, strict schemas, bounded bodies and idempotency. Protected decisions require an expected revision and resolution reason. `READY`, `NEEDS_CHANGES` and `NEEDS_REVIEW` are server decisions, never client authorization to publish. Public product fields extend additively; ratings and anonymous shared-cache isolation retain their existing contracts. Evidence URLs are references and are never fetched server-side.

| Method | Path beneath `/api/v1`                                   | Contract                                                                                                                      |
| ------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/community/options?q=…`                                 | Authenticated canonical brand, category, family, product and retailer lookup; bounded results.                                |
| GET    | `/community/session`                                     | Current contributor capability, including the operator capability.                                                            |
| GET    | `/community/products/:id`                                | Current contribution context and revision for a visible US product.                                                           |
| POST   | `/submissions/check-identity`                            | Product/brand/country/categories; returns duplicate candidates before collecting or processing media.                         |
| POST   | `/submissions/preflight`                                 | Validated `SubmissionInput`; returns a decision, reasons, candidates and an operational receipt when eligible.                |
| POST   | `/submissions/evidence`                                  | `{productId}`; reserves private evidence for a change proposal.                                                               |
| POST   | `/submissions/:receipt/uploads`                          | Bounded multipart `slot` and `image`; owner only.                                                                             |
| POST   | `/submissions/:receipt/finalize`                         | Same normalized `SubmissionInput` as preflight; returns publication, corrections or private review receipt.                   |
| GET    | `/submissions/:receipt/media/:image/:variant`            | Owner/operator evidence, private/no-store. Published evidence remains available through its canonical storage references.     |
| GET    | `/me/contributions?cursor=…`                             | Contributor-owned submissions, proposals and reports, 30 per page.                                                            |
| GET    | `/me/contributions/:kind/:id`                            | Owned status, proposed details, evidence and resolution; operators may inspect the same record.                               |
| POST   | `/reports`                                               | Target-specific `ReportInput`; active reports deduplicate by reporter/target/reason and accumulate evidence.                  |
| POST   | `/proposals`                                             | Discriminated `ProductChange`, expected catalog revision and evidence.                                                        |
| POST   | `/retailers/proposals`                                   | Canonical identity proposal, US market, official HTTPS URL, aliases and reason.                                               |
| POST   | `/retailer-confirmations`                                | Product, canonical retailer and `confirm`/`not_current` stance. Negative stances queue operator review.                       |
| GET    | `/admin/moderation/inbox?cursor=…`                       | Allowlisted inbox, ingredient priority, 30 per page.                                                                          |
| GET    | `/admin/moderation/:kind/:id`                            | Review detail with current catalog values, proposed changes and evidence.                                                     |
| GET    | `/admin/moderation/products/:id`                         | Catalog snapshot, revision and the latest 50 audit actions.                                                                   |
| GET    | `/admin/moderation/media/:image/:variant`                | Allowlisted private inspection of preserved images, including removed/archived media.                                         |
| POST   | `/admin/moderation/:kind/:id/decide`                     | `ReviewDecision`: expected record revision, decision, reason, optional assessed catalog effect and expected product revision. |
| GET    | `/admin/moderation/duplicate-preview?donor=…&survivor=…` | Both products and counts of donor contributions to archive.                                                                   |
| POST   | `/admin/moderation/consolidations`                       | Both IDs/revisions and reason; survivor data is unchanged.                                                                    |
| POST   | `/admin/moderation/actions/:id/reverse`                  | Expected current catalog revision and reason; restores affected fields without deleting later contributions.                  |

Every POST above requires an `Idempotency-Key` of 16–100 letters, digits, underscores or hyphens. Reusing a key with different normalized details returns `IDEMPOTENCY_CONFLICT`; same-key retries return the saved result. JSON bodies are limited to 32 KiB. Upload bodies are limited to the existing 10 MiB image limit plus bounded multipart overhead. A challenged POST supplies `X-Turnstile-Token` for action `community`; expired/rejected challenges do not reserve or publish catalog data. Cursor contents are positions, not authorization credentials.

Shared runtime schemas and TypeScript contracts live in `server/community/domain/contracts.ts`. Public product additions are `classification`, `retailers`, `relatedProducts`, `revision`, `publicationState`, `canonicalRedirect` and publication/date-precision fields. Historical formulas without recorded classification return `not_recorded`/unknown presentation instead of inheriting current classification. Consolidated product document/data/API URLs return an uncached 302 to the survivor, dropping donor formula selectors.
