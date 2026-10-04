# VeganAlts Tech Stack v1.0

**Status:** Locked baseline unless a documented architecture decision changes it.

## 1. Recommended stack

| Layer | Choice | Initial role |
|---|---|---|
| Language | TypeScript | Shared language across web, Worker and domain code. |
| UI | React | Component model and broad ecosystem. |
| Full-stack framework | React Router v8 + Vite | SSR-capable public pages and application routes on Workers. |
| Runtime/hosting | Cloudflare Workers | Full-stack Worker + static assets in one deployment. |
| Relational database | Cloudflare D1 | Canonical product/community data. |
| ORM/schema | Drizzle ORM | Typed schema/query layer over D1/SQLite. |
| Authentication | Better Auth | Self-hosted auth/session layer in D1. |
| Social login | Google + Apple initially | Low-friction contribution accounts. |
| Object storage | Cloudflare R2 Standard | Optimized images and temporary upload objects. |
| Image processing | Cloudflare Images | One-time normalization/transcoding on upload. |
| Search | D1 FTS5 | Initial product/category/alias search. |
| Bot protection | Cloudflare Turnstile | Selective protection for abusive/high-risk actions. |
| Rate limiting | Workers Rate Limiting API | Per-user/IP/route protection. |
| Async jobs | Cloudflare Queues | Deferred recalculation/cleanup/notifications when needed. |
| Scheduled jobs | Cron Triggers | Periodic trending, cleanup and integrity jobs. |
| Web traffic analytics | Cloudflare Web Analytics | Privacy-oriented traffic measurement. |
| Product events | Workers Analytics Engine | Category views, ratings, submissions and contribution metrics. |
| Testing | Vitest + Playwright | Domain/integration + browser E2E. |
| CI/CD | GitHub + Cloudflare Workers Builds or GitHub Actions | Preview/test/deploy pipeline. |

## 2. Why React Router v8

React Router v8 currently has first-class Cloudflare Workers support through the Cloudflare Vite plugin and runs as an SSR-capable full-stack framework on Workers.

VeganAlts benefits from SSR because category and product pages should be crawlable and shareable, but it should **not** SSR every public page for every request. SSR exists as the mechanism that creates a fresh cached page when the CDN copy needs refresh.

Current Cloudflare documentation notes that prerendering is not supported in its React Router + Vite integration. Therefore the architecture should not depend on “rebuild the entire site every few minutes.” Public data pages use SSR-on-refresh plus shared CDN caching instead.

## 3. Why D1 instead of Firestore

VeganAlts is strongly relational:

```text
Country
  ↓
Product ↔ Category
  ↓         ↓
Formula   Rating
  ↓
Images

Product ↔ Retailer
Product ↔ Edit Proposal ↔ Confirmations
User ↔ Ratings / Comments / Contributions
```

D1 supports SQLite semantics, foreign keys, JSON functions and FTS5. Those capabilities map directly to the product model.

Firestore could technically store this data, but it would require more denormalization, duplicate data, application-managed joins and more complex consistency rules. Firebase Authentication remains an acceptable fallback, but Firestore should not be introduced solely because Firebase Auth is used.

## 4. Better Auth vs Firebase Authentication

### Recommendation: Better Auth + D1

Benefits:

- One primary infrastructure provider.
- Users, sessions and application profiles remain close to D1 domain data.
- Framework itself is free/open source.
- Google and Apple social providers are supported.
- Better Auth supports Cloudflare D1 directly and can also use the Drizzle adapter.
- Avoids long-term per-MAU identity pricing.

Costs/trade-offs:

- VeganAlts owns dependency updates and auth migrations.
- OAuth provider setup is still required.
- Sign in with Apple requires Apple Developer credentials and client-secret handling.

### Firebase Authentication fallback

Use Firebase Auth instead if operational delegation becomes more important than Cloudflare consolidation. If used, Firebase handles authentication only; D1 remains the application database.

Application profiles would store the external Firebase UID and all VeganAlts-specific profile/trust data remains in D1.

## 5. Image strategy

### Canonical approach

```text
User upload
   ↓
validate MIME / size / dimensions
   ↓
temporary source bytes
   ↓
Cloudflare Images
   ├── full.webp
   └── thumbnail.webp
   ↓
R2 Standard
   ↓
D1 stores object keys + dimensions + slot metadata
```

For ingredient/nutrition evidence, preserve a larger high-quality derivative than ordinary product-front images so label text remains readable.

### Recommended initial derivatives

| Slot | Long edge | Format | Quality target | Notes |
|---|---:|---|---:|---|
| Product full | ~1800 px | WebP | 88–90 | Main product/detail usage. |
| Thumbnail/card | ~500 px | WebP | 78–82 | Lists/search cards. |
| Ingredient evidence | ~2200–2400 px | WebP | 90–92 | Prioritize text readability. |

Exact values should be benchmarked with real package photography before being locked.

### Original retention

Temporary originals may be retained until transforms are successfully written to R2, then deleted. Permanent original storage is not required by default. Keep an original only when a future evidence/compliance requirement justifies it.

## 6. Search strategy

Use D1 FTS5 initially. Search documents should include:

- canonical product name;
- brand;
- product aliases;
- category name;
- category aliases;
- country/market filters;
- retailer names only where retailer search is intentionally supported.

Do not add Algolia/Typesense/Elasticsearch at launch. Revisit if typo tolerance, multilingual semantic search or very large search indexes materially exceed FTS5's usefulness.

## 7. Workers Free vs Paid

### Free is suitable for development and small beta

As of 2026-10-03, Workers Free includes 100,000 Worker requests/day and a 10 ms CPU limit per invocation. D1 Free includes 5 million rows read/day, 100,000 rows written/day and 5 GB storage total.

### Paid is recommended for public launch

Workers Paid has a $5/month account minimum and currently includes 10 million Worker requests/month and 30 million CPU milliseconds/month; extra usage is inexpensive. D1 Paid includes 25 billion rows read/month, 50 million rows written/month and 5 GB storage before overage.

The reason to pay is **headroom**, not because every public page requires a Worker. Correctly cached public pages should usually avoid dynamic work. Paid mainly removes the tight 10 ms CPU ceiling from authentication, submissions, moderation, cache refreshes and background operations.

## 8. Approximate infrastructure cost model

Current Cloudflare pricing can change; treat this as planning guidance, not a permanent quote.

| Component | Early cost | Current scaling model |
|---|---:|---|
| Workers Free | $0 | 100k requests/day, 10 ms CPU/invocation. |
| Workers Paid | $5/mo account minimum | 10M requests + 30M CPU-ms included; then $0.30/M requests and $0.02/M CPU-ms. |
| D1 on Paid | Usually included early | 25B rows read + 50M rows written + 5 GB included. |
| R2 Standard | Usually $0 early | 10 GB-month free; then $0.015/GB-month; no Internet egress charge. |
| R2 operations | Usually $0 early | 1M Class A + 10M Class B free monthly. |
| Images transforms | $0 up to allowance | First 5k unique transformations/month included; then $0.50/1k on Images Paid. |
| Better Auth framework | $0 | Managed Better Auth infrastructure is optional. |
| Turnstile | $0 | Free plan supports unlimited verification requests. |
| Queues | $0 early | Free: 10k ops/day. Paid: 1M ops/month then $0.40/M. |
| Analytics Engine | Effectively $0 early | Published allowance is large; verify billing status before launch. |

### Image-specific note

Cloudflare's Images pricing page says remote transformations are available on Free up to 5,000 unique transformations/month, while Cloudflare's tutorial for transforming raw user-upload bytes through the Images binding requires enabling an Images Paid subscription. For the preferred one-time upload pipeline, plan to enable Images Paid at production launch; if usage stays within the included transformation allowance and R2 is used for storage, transformation charges can still remain near $0.

## 9. Alternatives intentionally not selected

### Next.js

Viable, but React Router has a more direct first-class Workers integration and VeganAlts does not require the Next.js ecosystem enough to justify the adapter layer.

### Firestore

Not selected because the core domain is relational.

### PostgreSQL from day one

Not necessary. D1 should comfortably serve the initial product and keeps infrastructure simpler. Keep repositories/domain services isolated so a future move to PostgreSQL + Hyperdrive remains possible if database size/query needs demand it.

### Redis/KV as a ranking source

Not selected. D1 aggregate tables plus CDN caching are sufficient initially. KV may later be useful for narrow cache/config use cases, but it is not canonical storage.

### Dedicated search SaaS

Not selected until FTS5 becomes inadequate.

### Microservices

Explicitly rejected for initial architecture.

## 10. Versioning policy

The documentation specifies product-level technology choices, not exact npm versions. At implementation time:

1. Use current stable releases.
2. Pin lockfiles.
3. Verify Cloudflare compatibility.
4. Record material framework/runtime changes in an Architecture Decision Record or document revision.
5. Do not silently replace a major platform component because an AI coding agent prefers another library.

## Official references checked for v1.0

- https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/sql-api/sql-statements/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/images/pricing/
- https://developers.cloudflare.com/images/optimization/binding/
- https://developers.cloudflare.com/turnstile/plans/
- https://developers.cloudflare.com/queues/platform/pricing/
- https://better-auth.com/docs/adapters/drizzle
- https://better-auth.com/docs/authentication/apple
- https://better-auth.com/docs/concepts/oauth