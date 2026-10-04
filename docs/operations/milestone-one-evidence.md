# Milestone 1 verification record

Checked 2026-10-04. **Milestone remains open** until the pending real authentication, uploader, and GitHub CI gates below pass. Implemented code alone is not acceptance evidence for a live integration.

## Current evidence

| Requirement                                     | Evidence                                                                                                                                                                                                                                                             | State                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| #1: clean install / strict types / Worker build | `npm ci && npm run check` passes on Node 24.21.0; 21 tests across nine unit/integration files; dependency audit reports zero vulnerabilities                                                                                                                         | Passed locally                                                  |
| #1: local/development/production environments   | Wrangler isolated bindings; staging and production Workers deployed; `/healthz` responds 200                                                                                                                                                                         | Passed                                                          |
| #1: CI                                          | GitHub Actions workflow prepared; publishing authorized; `develop` created and made the default PR base, with `main` retained                                                                                                                                        | Pending live CI                                                 |
| #2: migrations                                  | Ordered 0000–0004 migrations applied to local, real staging D1, and production D1; staging foreign-key check empty                                                                                                                                                   | Passed                                                          |
| #2: invariants                                  | Persistence tests cover auth/profile linkage, case-insensitive handle uniqueness, one current formula, one rating per user/formula/category, integer score bounds, relational integrity                                                                              | Passed                                                          |
| #3: development catalog                         | 31 products, ten rankable categories with at least three each, aliases/ancestry, category overlap, related variants, 32 current/historical formula records; deterministic reseed test                                                                                | Passed                                                          |
| #3: data provenance                             | Manufacturer identity references in `db/seed/catalog.ts`; incomplete claims and illustrative formula history explicitly marked; no production seed or synthetic production ratings/identities                                                                        | Passed                                                          |
| #4: local auth/profile/session behavior         | Real Better Auth/D1 session and sign-out test, profile collision/idempotency tests, authorization checks, Apple JWT renewal test                                                                                                                                     | Passed locally                                                  |
| #4: provider login                              | Separate Google web clients and Apple website Services IDs configured; credentials stored as Cloudflare secrets; real Google staging sign-in, profile save/navigation persistence, denied admin access, and sign-out passed; Apple password/passkey step awaits user | Pending                                                         |
| #4: Better Auth dashboard                       | Production server connected at `https://veganalts.com/api/auth`; dashboard reports online v1.7.7; free Starter plan selected, activity tracking disabled                                                                                                             | Passed                                                          |
| #5: ranking                                     | Pure policy tests cover priors, established 4.7 average versus tiny perfect samples, zero ratings, ties; integration tests cover concurrent edits/deletions, exclusions, Tried state, formula/country/category isolation, rebuild equivalence                        | Passed                                                          |
| #5: operational rebuild                         | `npm run rankings:rebuild:staging` rebuilt 32 formula records through real D1 using the same policy/service                                                                                                                                                          | Passed                                                          |
| #6: processing and recovery                     | JPEG/PNG/WebP tests cover no enlargement, idempotency, failed attempts/retry, lease fencing, delayed writes, preserved accepted/archived objects, stream/file/pixel limits, atomic attempt budgets                                                                   | Passed locally                                                  |
| #6: real Images                                 | `scripts/verify-images-staging.ts --staging` transformed seven derivatives via the real Images binding; full 1800×1350, thumbnail 500×375, evidence 2400×1800; small JPEG stayed 300×225                                                                             | Passed                                                          |
| #6: real authenticated upload/read flow         | Awaiting provider sign-in and administrator allowlist; real HTTP uploader and stored R2 URL reuse still to verify                                                                                                                                                    | Pending                                                         |
| Landing layout and accessibility                | Playwright desktop/mobile checks pass locally and at production; axe reports no WCAG 2 A/AA or 2.1 AA violations; Chrome screenshots inspected at normal desktop and 390px mobile                                                                                    | Passed                                                          |
| Landing performance                             | Mobile Lighthouse production: performance **99**, accessibility **100**, FCP/LCP 1.6s, CLS 0                                                                                                                                                                         | Passed                                                          |
| Public HTML                                     | Production HTML identical with/without an untrusted auth cookie, public cache headers, no Set-Cookie; later repeat with real session cookie                                                                                                                          | Preliminary pass                                                |
| HTTPS and canonical redirects                   | Normal DNS apex HTTPS 200; HTTP apex, HTTP www, and HTTPS www return 308 to HTTPS apex preserving `/verify/path?keep=yes`                                                                                                                                            | Passed                                                          |
| DNS and mail                                    | .com registry delegates to alexa/rene Cloudflare NS; authoritative MX 10 fwd1 / 20 fwd2.porkbun.com and original SPF retained; original zone inventory saved; no DS at cutover                                                                                       | Passed; Cloudflare reports domain active                        |
| Cost monitoring                                 | Free DNS/Workers/D1, R2 Standard, Better Auth Starter; upload/attempt/rate safeguards implemented                                                                                                                                                                    | Passed; existing enabled account billing alert at $10 confirmed |

## Deployed source versions

- Staging foundation/media/auth code: `a71b4a0b-7492-44eb-8ad0-eddc65f2a311`.
- Production verified landing/media/auth code: `d150f0cb-40f6-4f12-9198-8f65285f2d6e`.
- Secret updates create subsequent Worker versions; inspect `wrangler deployments list` before rollback.
- Account forms have bounded request bodies and visible staging/error states. Cache-hit responses retain browser revalidation and a 30-minute shared TTL. Staging cache MISS → HIT was verified through response headers.

## Local artifacts

Generated reports and screenshots are intentionally ignored under `test-results/`:

- `lighthouse-mobile.report.html` and `.json`: mobile performance/accessibility run.
- `landing-desktop.jpg`, `landing-mobile.jpg`: published website layouts.
- `live-images/results.json` and WebP derivatives: real image outputs and dimensions.
- `better-auth-connected.jpg`: connected cloud dashboard.
- `cloudflare-active.jpg`: Cloudflare confirms the domain is active.

Avoid committing screenshots containing personal account details or credentials. Test fixture images contain clearly synthetic label text and are not product evidence.

## Remaining completion work

1. Finish real Apple sign-in on staging; provider credentials are created and deployed.
2. Perform real staging sign-ins, session/settings/sign-out/authorization checks, and compare public HTML using the actual session cookie.
3. Set the real staging administrator ID and verify the authenticated admin uploader, immutable R2 reads, malformed rejection, and evidence readability.
4. Keep the existing $10 account budget alert enabled and monitor shared-account usage; the alert is not a spending cap.
5. Finish the authorized commit/push and pull request into `develop`, and verify GitHub CI. `develop` is now the default branch; `main` is retained.
