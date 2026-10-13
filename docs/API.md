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

| Method | Path beneath `/api/v1`                                   | Contract                                                                                                                           |
| ------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/community/options?q=…`                                 | Authenticated canonical brand, category, family, product and retailer lookup; bounded results.                                     |
| GET    | `/community/session`                                     | Current contributor capability, including the operator capability.                                                                 |
| GET    | `/community/products/:id`                                | Current contribution context and revision for a visible US product, without reviewer identities or non-public photos.              |
| POST   | `/submissions/check-identity`                            | Product/brand/country/categories; returns duplicate candidates before collecting or processing media.                              |
| POST   | `/submissions/preflight`                                 | Validated `SubmissionInput`; returns a decision, reasons, candidates and an operational receipt when eligible.                     |
| POST   | `/submissions/evidence`                                  | `{productId}`; reserves private evidence for a change proposal.                                                                    |
| POST   | `/submissions/:receipt/uploads`                          | Bounded multipart `slot` and `image`; owner only.                                                                                  |
| POST   | `/submissions/:receipt/finalize`                         | Same normalized `SubmissionInput` as preflight; returns publication, corrections or private review receipt.                        |
| GET    | `/submissions/:receipt/media/:image/:variant`            | Owner/operator evidence, private/no-store. Published evidence remains available through its canonical storage references.          |
| GET    | `/me/contributions?cursor=…`                             | Contributor-owned submissions, proposals and reports, 30 per page.                                                                 |
| GET    | `/me/contributions/:kind/:id`                            | Owned status, proposed details, evidence and resolution; operators may inspect the same record.                                    |
| POST   | `/reports`                                               | Target-specific `ReportInput`; active reports deduplicate by reporter/target/reason and accumulate evidence.                       |
| POST   | `/proposals`                                             | Discriminated `ProductChange`, expected catalog revision and evidence.                                                             |
| POST   | `/retailers/proposals`                                   | Canonical identity proposal, US market, official HTTPS URL, aliases and reason.                                                    |
| POST   | `/retailer-confirmations`                                | Product, canonical retailer and `confirm`/`not_current` stance. Negative stances queue operator review.                            |
| GET    | `/admin/moderation/inbox?cursor=…`                       | Allowlisted inbox, ingredient priority, 30 per page.                                                                               |
| GET    | `/admin/moderation/:kind/:id`                            | Review detail with current catalog values, proposed changes and evidence.                                                          |
| GET    | `/admin/moderation/products/:id`                         | Catalog snapshot, revision and the latest 50 audit actions.                                                                        |
| GET    | `/admin/moderation/media/:image/:variant`                | Allowlisted private inspection of preserved images, including removed/archived media.                                              |
| POST   | `/admin/moderation/:kind/:id/decide`                     | `ReviewDecision`: expected record and product revisions, decision, reason, optional assessed effect or reviewed submission status. |
| GET    | `/admin/moderation/duplicate-preview?donor=…&survivor=…` | Both products and counts of donor contributions to archive.                                                                        |
| POST   | `/admin/moderation/consolidations`                       | Both IDs/revisions and reason; survivor data is unchanged.                                                                         |
| POST   | `/admin/moderation/actions/:id/reverse`                  | Expected current catalog revision and reason; restores affected fields without deleting later contributions.                       |

Every POST above requires an `Idempotency-Key` of 16–100 letters, digits, underscores or hyphens. Reusing a key with different normalized details returns `IDEMPOTENCY_CONFLICT`; same-key retries return the saved result. JSON bodies are limited to 32 KiB. Upload bodies are limited to the existing 10 MiB image limit plus bounded multipart overhead. A challenged POST supplies `X-Turnstile-Token` for action `community`; expired/rejected challenges do not reserve or publish catalog data. Cursor contents are positions, not authorization credentials.

`SubmissionInput.followUp` optionally supplies `{submissionId, expectedRevision}` to respond to an operator's unresolved follow-up. The source must belong to the active contributor and remain unexpired at finalization. Preflight reserves a fresh receipt, uploads use the same endpoints, and finalization always holds the corrected payload for review. It atomically links and closes the original pending record without overwriting its evidence. Submission status reads add `canFollowUp`, `followUpOf` and `supersededBy`; replaced submissions display `superseded`. Repeated finalization returns the saved receipt, and stale/competing responses return `SUBMISSION_CHANGED`.

A retried preflight key reports the receipt's real outcome: the stored review reasons for a held submission, a fresh decision for an open receipt, or the publication. A closed or expired receipt returns `SUBMISSION_CLOSED`.

A proposal records the catalog facts it depends on when it is created. It stays acceptable while those facts are unchanged, regardless of unrelated activity such as retailer confirmations, other photo slots or other decisions; a change to its own facts returns `STALE_PRODUCT` and requires a fresh proposal. The operator's `expectedProductRevision` fences a decision to the product state shown in the review. Accepting a held submission whose contributor could not confirm the ingredients requires `veganStatus`; otherwise it returns `CLASSIFICATION_REQUIRED`. A chosen status is recorded as operator-reviewed. Evidence already attached to another proposal returns `EVIDENCE_CHANGED`.

Turnstile tokens are consumed once per request. Multi-request contribution forms remount the challenge after consumption, including rejection, so a subsequent upload or finalization can obtain a fresh token while retaining its idempotency key and completed uploads.

Shared runtime schemas and TypeScript contracts live in `server/community/domain/contracts.ts`. Public product additions are `classification`, `retailers`, `relatedProducts`, `revision`, `publicationState`, `canonicalRedirect` and publication/date-precision fields. Historical formulas without recorded classification return `not_recorded`/unknown presentation instead of inheriting current classification. Consolidated product document/API URLs return an uncached 302 to the survivor, dropping donor formula selectors; framework data requests carry the redirect in an uncached 202 response. Redirect detection runs inside the public cache entrypoint on a miss. The gateway uses manual redirect handling and performs no D1 redirect lookup before a cache hit.

## Milestone 4 contract additions

The approved [milestone 4 specification](MILESTONE_4_PLAN.md) extends the milestone 3 contracts additively. Every POST keeps the same-origin, active-account, strict-schema, bounded-body, `Idempotency-Key`, Turnstile and Problem Details rules above. Public reads stay session-free and shared-cacheable; personal state is private/no-store.

`BLOCKED` joins `READY`, `NEEDS_CHANGES` and `NEEDS_REVIEW` as a server decision. It is returned only for explicit abuse rules and stores no catalog data. Contributors receive decisions and actionable reasons, not model probabilities; operators can inspect the structured automated answers in review detail. An unavailable or over-budget provider yields `NEEDS_REVIEW`, never `READY`.

| Method | Path beneath `/api/v1`                                                                | Contract                                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/products/:productSlug/comments?sort=best\|newest&formula=current\|earlier&cursor=…` | Public, cookie-free, shared cache for 60 seconds under the product tag. Visible comments with author handle, formula label, counts, collapse flag and edit time; 20 per page with an opaque keyset cursor.    |
| GET    | `/me/comment-state?productId=…&ids=…`                                                 | Private. The viewer's votes and own comments for that product: every listed comment ID (up to 100, the comments on screen), plus their latest votes and 50 latest comments, including pending or hidden ones. |
| POST   | `/comments`                                                                           | `{productId, body, categoryId?}` for the current formula. Returns the comment with `visible`, `pending` or a `BLOCKED` problem.                                                                               |
| POST   | `/comments/:id/edit`                                                                  | `{body, expectedUpdatedAt}`; author only; re-evaluated.                                                                                                                                                       |
| POST   | `/comments/:id/delete`                                                                | Author soft delete; purges the product tag.                                                                                                                                                                   |
| POST   | `/comments/:id/vote`                                                                  | `{value: 1 \| -1 \| 0}`; `0` removes the vote. Own and non-visible comments are rejected. Returns counts and the stored vote.                                                                                 |
| GET    | `/community/products/:id/proposals`                                                   | Signed-in contributors. Pending community-confirmable proposals with change summary, response counts, the viewer's stance and evidence references.                                                            |
| POST   | `/proposals/:id/responses`                                                            | `{stance: confirm \| disagree \| evidence, note?, evidence?}`; one current stance per account; the proposer is rejected.                                                                                      |
| POST   | `/category-proposals`                                                                 | `{name, parentId?, country, explanation, exampleProducts[], aliases[]}`; operator-reviewed. Milestone 5 replaced `parentId` with a required `shelfId`; milestone 6 makes `explanation` optional.              |
| GET    | `/admin/taxonomy`                                                                     | Allowlisted category list with revisions, aliases, homepage features, active merges and recent taxonomy actions.                                                                                              |
| POST   | `/admin/taxonomy/categories`                                                          | Create a category (`name`, optional `slug`, `parentId`, `isRankable`, `aliases`, `note`).                                                                                                                     |
| POST   | `/admin/taxonomy/categories/:id`                                                      | Fenced by `expectedRevision`: rename, re-slug (old slug redirects), re-parent, rankability, retire/restore and replace aliases.                                                                               |
| POST   | `/admin/taxonomy/features`                                                            | Replace the ordered homepage category features.                                                                                                                                                               |
| POST   | `/admin/taxonomy/merges`                                                              | `{donorId, survivorId, donorRevision, survivorRevision, note}`; starts a transfer merge and processes bounded pages.                                                                                          |
| POST   | `/admin/taxonomy/merges/:id/continue`                                                 | Idempotently processes further pages of a transferring or reversing merge.                                                                                                                                    |
| POST   | `/admin/taxonomy/merges/:id/reverse`                                                  | `{note}`; reverses the most recent merge involving its categories once later edits to either category are reversed.                                                                                           |
| POST   | `/admin/taxonomy/actions/:id/reverse`                                                 | `{note}`; restores the fields recorded by a category update or features action.                                                                                                                               |
| GET    | `/admin/moderation/category/:id`                                                      | Category proposal review detail.                                                                                                                                                                              |
| POST   | `/admin/moderation/category/:id/decide`                                               | `{decision: accept \| alias \| reject, expectedRevision, note, slug?, parentId?, isRankable?, aliasOf?}`.                                                                                                     |

`ProductChange` adds `rename`, `alias`, `source_url`, `category_add` and `photo` (`{slot, reason, evidence}`), alongside the milestone 3 kinds; category removal remains the `relationships` eligibility change. A proposal whose automated evidence check returns `NEEDS_CHANGES` or `BLOCKED` is refused with Problem Details code `PROPOSAL_NEEDS_CHANGES` or `PROPOSAL_BLOCKED` (422) and reserves nothing. `GET /admin/moderation/inbox` accepts `filter=all|confirmation|high_risk|comments|flagged`. Review decisions accept the `category` and `comment` inbox kinds; category proposals can also be resolved as an alias of an existing category.

`GET /categories/:categorySlug` accepts `view=top|trending|new`; `view` and `page` are part of the cache key. Renamed or merged category slugs return an uncached 302 to the current slug, like consolidated products.

## Milestone 5 contract additions

The approved [milestone 5 specification](MILESTONE_5_PLAN.md) extends the v1 contracts additively. Every POST keeps the milestone 3 and 4 rules.

**Countries.** Every active country is supported. Public documents use lowercase ISO codes in the path (`/ca`, `/ca/ground-beef`, `/ca/products/:slug`, `/ca/search`); `/` is the United States home and `/us` redirects there permanently. Public API reads take `country` as a query parameter (either case, default `us`); it is normalized into the cache key. Unknown or inactive countries return 404. Product slugs are unique only within a country.

**Public reads.**

| Method | Path beneath `/api/v1`                                                   | Contract                                                                                                                                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/suggest?country=us&q=…`                                                | Instant answers. Queries normalize like search; fewer than two letters or digits return empty lists. Up to 5 foods (aisle, product and ranked counts, #1 product with score and Early flag, top 3 for the preview) and 5 products (food, rank, score). Shared cache for 300 seconds; separate rate limit.                              |
| GET    | `/categories/:slug?country=&view=&stores=&freeFrom=&page=&unrankedPage=` | `view` is `top`, `trending`, `new`, `most-rated` or `detail-<key>` for an active dimension of that food. `stores` lists retailer slugs active in the country's markets (at most 10, combined with OR); `freeFrom` lists keys from the country's allergen list. Rows add `topRank`, detail means, allergen summary and matching stores. |
| GET    | `/products/:slug?country=&version=&food=`                                | `food` selects the food the page is about (one of the product's active foods). Adds per-food ranks, detail scores, the recent-eaters score when above its minimum, the score distribution, the allergen declaration and active retailers only.                                                                                         |

**Filter URLs.** `stores` and `freeFrom` accept comma-separated or repeated values. The server lowercases, de-duplicates, sorts and syntax-checks them. A public document in another form redirects permanently to the normalized URL; API and framework data requests are normalized silently. Values not valid for the country (an unknown store or allergen) cause an uncached 302 to the URL without them. Aisle pages accept `shelf`. Filtered and shelf pages declare the unfiltered page canonical. Each normalized combination is cached once; cookies never vary it.

**Ratings.** `PUT /ratings` adds two optional fields.

```json
{
  "productVersionId": "...",
  "categoryId": "...",
  "overallSimilarity": 4,
  "dimensions": { "taste": 4, "texture": null },
  "conventionalRecency": "within_month"
}
```

- `overallSimilarity` stays required. An absent field leaves its stored value unchanged.
- In `dimensions`, a key with `null` clears that answer, and keys left out are unchanged.
- `conventionalRecency` is `current_or_week`, `within_month`, `within_year`, `over_year`, `prefer_not_to_say` or `null` to clear.
- Unknown dimension keys return 422 `INVALID_DIMENSION`; retired ones return 409 `STALE_DIMENSIONS`.
- The response's `rating` and `GET /me/rating-state` include `dimensions` and `conventionalRecency`. Rating-state also reports `administrator` so operator navigation can appear privately.

**Contributions.**

- Submissions, identity checks, retailer proposals and category proposals take any active `country` code.
- Category proposals require `shelfId`.
- `ProductChange` adds kind `allergens`: `{declaration: {status: "none_declared"} | {status: "declared", contains: key[], mayContain: key[]}, citedImageId?, evidence}`. Keys must be on the product country's list and appear once. `citedImageId` names the current formula's accepted ingredients or nutrition photo; without it the declaration is tier 3. A declaration that contains milk, egg, fish, crustacean or mollusc is tier 3 and opens a system `ingredient_concern` report (`concern-<proposal id>`).
- A retailer proposal whose name matches a retailer without a market in that country proposes the market instead of failing. It is stored as a `retailer_market` proposal on that retailer; accepting it adds (or reactivates) the market.
- `GET /community/options` takes `country` and lists retailers with an active market there.

**Administration.**

- `POST /admin/taxonomy/categories/:id/dimensions` takes `{expectedRevision, dimensions: [{key, label, description, active}], note}`, the full ordered list. Keys are immutable and never removed; `active: false` retires a dimension.
- Category aliases accept `{alias, country, displayName}`.
- `POST /admin/taxonomy/features` takes `country`.
- The moderation inbox and detail add each item's `country`.

**Caching.** Cache tags gain the country: `catalog:<cc>`, `surface:<kind>:<cc>`, `category:<cc>:<slug>` and `product:<cc>:<slug>`. Taxonomy changes purge every country's listings because the aisle bar appears on every page. Retailer confirmations now purge the product and its foods' listings, because the store filter reads them. Ratings still never purge.

## Milestone 6 contract additions

The approved [milestone 6 specification](MILESTONE_6_PLAN.md) extends the v1 contracts additively. Every POST keeps the milestone 3 and 4 rules.

**Submissions.** `SubmissionInput` changes:

- `statusBasis` (up to 2,000 characters), `noKnownAnimalIngredients` and `manufacturerLabel` are optional; absent values read as no note, unticked and `unknown`.
- Ingredient evidence is optional: the rule "add an ingredient-panel photo or a manufacturer ingredient source" is removed.
- `imageSlots` takes 1–4 distinct slots and must include `front`; the offered slots are `front`, `ingredients`, `back` and `nutrition`.
- `categoryIds` takes 0–5 existing foods. `newFood` optionally suggests one food: `{name, shelfId, aliases[]}` (up to 10 other names). At least one food is required and at most five in total. The primary food is `newFood` when present, otherwise the first of `categoryIds`.
- Optional extras: `rating` (1–5, for the primary food), `retailerIds` (up to 10 retailers with an active market in the country) and `allergens` (the milestone 5 declaration shape).
- New fields have no defaults, so an earlier payload normalizes and fingerprints exactly as before.

Decisions follow the milestone 6 moderation policy. A submission with `newFood` is always held, and its review detail adds `pendingFood: {id, name, status}`. A suggested food that cannot be added (its name already names a food, the shelf is wrong, the country is closed or the daily allowance is used) returns `NEEDS_CHANGES` with that reason, at preflight and again at finalization. Approving a submission whose suggested food is undecided returns 409 `FOOD_PENDING`; accepting that food as non-rankable while products wait returns 409 `FOOD_HAS_WAITING_PRODUCTS`.

| Method | Path beneath `/api/v1`                              | Contract                                                                                                                                                                                                                                                                            |
| ------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/community/options?country=&q=`                    | Adds `foods` (every active food with `id`, `slug`, display `name` in the country, `otherNames`, `aisle`, `shelf` with a `silent` flag, and `inCountry`), `shelves` (every active shelf grouped by aisle, empty ones included) and the country's `allergens`.                        |
| GET    | `/community/identity-matches?country=&brand=&name=` | Read-only duplicate candidates while typing (`id`, `slug`, `name`, `brand`, `countryId`, `exact`). Authenticated, private/no-store, on the instant-answer rate limit; never challenged. Brand and name need two characters each; a name that is only a package size has no matches. |
| POST   | `/submissions/check-identity`                       | `categoryIds` is optional.                                                                                                                                                                                                                                                          |
| POST   | `/category-proposals`                               | `{name, shelfId, country, explanation?, exampleProducts[], aliases[]}`. `CATEGORY_EXISTS` names the existing food in its message.                                                                                                                                                   |
| POST   | `/admin/taxonomy/categories/:id/countries`          | `{expectedRevision, countries: iso2[], note}`: the full list of countries where a food is on. Removing a country where the food has visible products returns 409 `FOOD_HAS_PRODUCTS`. Audited and reversible.                                                                       |

**Public reads.**

- Product and ranking reads may return the classification status `unchecked` ("Ingredients not checked yet"), alongside `vegan`, `appears_vegan`, `plant_based` and `under_review`. It never appears in a write.
- `GET /categories/:slug?country=` for a food that is not on in that country returns 200 with `availability: {here: false, countries: [iso2…]}` and no rows; for a food that is on, `availability.countries` lists every country where it is on. Both are shared-cacheable. The document page for a not-here food is `noindex`.
- Aisle, home, search, suggest and sitemap results include only foods that are on in the requested country.

**Changes and review.**

- `ProductChange` kind `classification` accepts `citedImageId`. On an unchecked formula, Appears vegan or Plant-based citing the formula's accepted ingredients or nutrition photo is tier 2; everything else stays tier 3.
- `GET /admin/taxonomy` lists each food's `countries`; `POST /admin/taxonomy/categories` accepts `countries` (default: every active country).
- Category proposal review detail adds `country`, the shelf path and `waitingProducts`. Submission review detail adds `pendingFood`. Inbox items add `waitingFor: "food"`.

**Caching.** Switching a food on in a country (by publication, operator change or proposal decision) purges that country's listings, because the aisle bar appears on every page.

## Milestone 7 contract additions

The [milestone 7 specification](MILESTONE_7_PLAN.md) extends the v1 contracts. Every POST keeps the milestone 3 and 4 rules. Nothing is released, so fields that milestone 7 retires are removed rather than deprecated.

**Taxonomy shape.**

- **Aisles replace shelves.** Foods sit directly under aisles, so every `shelf`/`shelfId` becomes `aisle`/`aisleId`:
  - category proposals: `{name, aisleId, country, explanation?, exampleProducts[], aliases[]}`;
  - `newFood` in submissions: `{name, aisleId, aliases[]}`;
  - `GET /community/options`: `foods[].aisle` and the list `aisles`.
- **No shelf parameter.** Aisle pages no longer accept `shelf`.
- **Reserved slug.** `brand` is a reserved food slug.

**Order and seasons.**

- **Order.** Aisle lists (the country chrome, home, aisle pages, `/community/options`) come in the country's popularity order: counted ratings, then products, then the aisle's `position`, then name. Foods within an aisle follow the same order.
- **Seasonal foods.** Food reads add `season: {start, end} | null` (months 1–12).
- **Seasonal products.** Product reads and ranking rows add `seasonal`. `SubmissionInput` adds an optional `seasonal` boolean, which defaults to the food's season. `ProductChange` adds kind `seasonal` (tier 2).
- **Administration.** `POST /admin/taxonomy/categories/:id` accepts `position` for an aisle and `season` for a food.

**Ratings.** `PUT /ratings` adds an optional `enjoyment`: an integer 1–5, or `null` to clear it. As with the other optional fields, leaving it out leaves the stored value unchanged. `overallSimilarity` stays required. The response's `rating` and `GET /me/rating-state` include `enjoyment`.

**Ranking reads.** `GET /categories/:slug?country=&view=…`

- **Views.** `view` adds `tastiest`. Detail views keep the `detail-<key>` form; their labels read "Closest …".
- **Each row is a line:**
  - `{lineId, name, brand, leadProduct: {id, slug, versionId, imageId}, flavorCount, closestRank, tastiestRank, score, people, early, isNew, trending, badges, details, matchedStores, allergens?, flavors, hiddenFlavorCount}`;
  - `trending` marks one of the food's top three trending lines, outside the Trending view;
  - `score`, `people` and `early` describe the ranking being viewed;
  - `allergens` appears only for a single-flavor line.
- **Each entry in `flavors`:**
  - `{productId, slug, name, flavor, label, score, ratingCount, isNew, allergens, matchesFilters}`;
  - `label` is the flavor, "Original" for a line's one unflavored product, or the product name when several have no flavor;
  - `ratingCount` counts answers in the ranking being viewed;
  - `score` is shown from 5 answers, otherwise `null`.
- **Discontinued flavors** are never returned.
- **Filtered views** return only lines with a matching flavor, with `hiddenFlavorCount` for the flavors that don't match.

**Product reads.** `GET /products/:slug?country=&food=` adds:

- `flavor`;
- `line: {id, name, closest: {rank, of, score, people}, tastiest: {rank, of, score, people}}` for the chosen food;
- `flavorScores` (this product's own Closest and Tastiest scores and counts);
- `otherFlavors[]`.

The `related` list keeps only companion and successor links.

**Search and brands.**

| Method | Path beneath `/api/v1`   | Contract                                                                                                                                                                                                                                                                         |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/suggest?country=&q=`   | Adds up to 3 `brands`: `{slug, name, productCount}`. Foods keep their #1 line and score; products show their line's rank.                                                                                                                                                        |
| GET    | `/search?country=&q=`    | Adds up to 10 `brands`, in the same shape.                                                                                                                                                                                                                                       |
| GET    | `/brands/:slug?country=` | The brand page: `{brand: {slug, name}, productCount, aisles: [{aisle, foods: [{food, lines: [{lineId, name, closestRank, tastiestRank, score, flavors}]}]}]}`. A brand with no visible products in the country returns 200 with `availability: {here: false}`. Shared-cacheable. |

- **Document URL.** The brand page's document URL is `/{cc}/brand/{slug}`.
- **Brand matching.** Brand matching in search, suggest and the contribution lookups uses one shared matcher:
  - names and other names;
  - a word prefix, a substring, or within two edits for names of five or more letters;
  - a brand's `productCount` is its active and under-review products in the country, counted only for the brands that match.

**Contribution lookups.** Each is authenticated, private/no-store and on the instant-answer rate limit.

| Method | Path beneath `/api/v1`                                    | Contract                                                                                                                                                                                                                                                                                                                                        |
| ------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/community/brands?country=&q=`                           | Up to 8 brand suggestions `{id, slug, name, aliases, productCount}` from 2 characters, including brands with nothing in the country yet (`productCount` 0). Text equal to a suggestion's name or alias is never offered as a new brand.                                                                                                         |
| GET    | `/community/brands/:id/lines?country=&food=`              | The brand's lines in the country, those in `food` (a food ID) first: `{lineId, name, foods: [{id, slug, name}], flavors: [{productId, slug, name, flavor, foods}]}`, where a flavor's `foods` are the slugs of the foods it's listed in. Discontinued and archived products are left out.                                                       |
| GET    | `/community/identity-matches?country=&brand=&name=&line=` | Looser: any one shared word of three or more letters qualifies a similar product, and the brand matches through the shared matcher. `exact` is unchanged. These matches are for display only; the near-duplicate hold keeps its milestone 6 rule and skips the chosen line's flavors. The optional `line` leaves that line's other flavors out. |

**Submissions.** `SubmissionInput` changes as follows.

- **Added:** `flavor` (optional, at most 40 characters); `enjoyment` (optional, 1–5, only with `rating`), saved with the rating once the product is live; `seasonal` (optional), which otherwise follows the primary food's season.
- **Choosing a line.** Either `lineId`, an existing line of the same brand and country, or optionally `lineName` for a new line, which defaults to the product name. Giving both returns 422.
- **Removed:** `productFamilyId`, `relatedProductId`, `relationship` and `specialtyFlavor`. A payload that carries them returns 422.
- **Holds.** Joining a line never holds a submission on its own.

**Changes, reports and administration.**

- **`rename`** accepts an optional `flavor` (`null` marks the line's original) and stays tier 2.
- **`seasonal`** takes `{seasonal: boolean}` and is tier 2.
- **`relationships`** no longer accepts `variant` or `specialty_flavor`. A change of `productFamilyId` is tier 3.
- **Product reports** add the reasons `flavor_not_real` and `wrong_line`.
- **`POST /admin/moderation/products/:id/line`** takes `{expectedRevision, lineId | newLineName, note}` and moves a product to another line of the same brand and country, or to a new line. A reversal moves it back and leaves a new line in place, empty.
- **`POST /admin/moderation/products/:id/line-name`** takes `{expectedRevision, name, note}` and renames the product's line. It is anchored on a product (whose revision fences it) so the existing reversal endpoint, which reverses product actions, can undo it.
- **`GET /admin/moderation/products/:id`** adds `lines: [{lineId, name, flavorCount}]`, the brand's lines in the product's country.
- **Both line actions** are audited, reversible through the existing reversal endpoint, and rescore the affected lines.

**Caching.**

- **Brand tags.** Cache tags add `brand:<cc>:<slug>`.
- **What a product change purges.** A product change purges its brand page. A line move or rename purges the products of both lines, their foods' listings and the brand page.
- **Ratings** still never purge.
