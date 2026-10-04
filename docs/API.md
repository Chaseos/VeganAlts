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
  "type": "https://veganalts.com/problems/validation-error",
  "title": "Invalid request",
  "status": 400,
  "code": "VALIDATION_ERROR",
  "detail": "Overall similarity must be between 1 and 5.",
  "fields": {
    "overallSimilarity": "Must be an integer from 1 to 5."
  }
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

Conceptual routes; exact names may evolve during implementation.

### Countries/categories

```text
GET /api/v1/countries
GET /api/v1/categories?country=US&query=beef
GET /api/v1/categories/:categoryId
GET /api/v1/categories/:categoryId/ranking?country=US&sort=top
```

### Products

```text
GET /api/v1/products/:productId
GET /api/v1/products/:productId/comments
GET /api/v1/products/:productId/retailers
GET /api/v1/products/:productId/history
```

### Search

```text
GET /api/v1/search?q=ground+beef&country=US
```

### Public profiles

```text
GET /api/v1/profiles/:handle
GET /api/v1/profiles/:handle/ratings?cursor=...
```

## 6. Authenticated endpoint families

### Rating

```text
PUT /api/v1/ratings
DELETE /api/v1/ratings/:ratingId
```

Payload concept:

```json
{
  "productVersionId": "...",
  "categoryId": "...",
  "overallSimilarity": 5,
  "conventionalRecency": "within_month",
  "dimensions": [
    { "dimensionId": "...", "score": 4 }
  ]
}
```

The server validates that:

- version belongs to product;
- product is eligible for category/country;
- category dimension belongs to that category;
- score is valid;
- the current user is allowed to rate;
- moderation/rate-limit conditions pass.

### Personal state

```text
GET /api/v1/me/rating-state?categoryId=...&productIds=...
GET /api/v1/me/ratings?cursor=...
```

This is how signed-in UI hydrates personal markers without making the shared public page personalized.

### Product submission

```text
POST /api/v1/products
```

### Comments

```text
POST /api/v1/products/:productId/comments
PATCH /api/v1/comments/:commentId
DELETE /api/v1/comments/:commentId
```

### Retailers

```text
POST /api/v1/products/:productId/retailer-confirmations
POST /api/v1/retailers/proposals
```

### Edit proposals

```text
POST /api/v1/edit-proposals
POST /api/v1/edit-proposals/:proposalId/responses
```

### Reports

```text
POST /api/v1/reports
```

### Media

```text
POST /api/v1/media/uploads
POST /api/v1/products/:productId/image-proposals
```

Implementation can use direct/signed upload patterns if server-side validation/security remains equivalent.

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

Use cursor pagination for comments, profiles, moderation queues and large product lists.

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
