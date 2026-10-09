# Milestone 5 verification

Recorded on 2026-10-09 against the approved [Milestone 5 specification](../MILESTONE_5_PLAN.md) and the "VeganAlts Directory" canvas (Round 4 · Foundations, Round 5 · Screens). Implementation, local verification and the staging rollout are complete for #36–#45. **Interactive acceptance on staging with two genuine accounts is still pending** (see [interactive acceptance](#interactive-acceptance)); the issues stay open until it is recorded here. Production was not changed.

## Delivery and scope

- Branch: `feature/milestone-five-swap-aisle-redesign`, based on `develop` at `cd19cd7`. One local commit per checkpoint (`9250b20` specification through `9851e23` hardening, plus `7e5da34`). Not yet pushed or opened for review.
- Staging: [staging.veganalts.com](https://staging.veganalts.com). Final Worker version: **`45f510d0-1681-426f-b37d-9a328afff592`**, Worker `veganalts-staging`. Previous version (Milestone 4): `52030423-4aed-4ea3-85f4-db3c8bcd4878`.
- Applied append-only migrations `0016`–`0018` to staging. None were applied to production, which still has migrations through `0004`.
- Owner decisions (2026-10-09): the launch tree as specified; the proposed detail dimensions; aisles and shelves may share a food's name; theme labels "System / Light / Dark"; ratings keep tap-to-save; every screen follows the canvas patterns, including screens without a board. These are recorded in the [specification](../MILESTONE_5_PLAN.md) and PRODUCT_MASTER.

## Issue-by-issue acceptance

| Issue                                                                                         | Implemented behavior                                                                                                                                                                                                                                                  | Supporting evidence                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#36](https://github.com/Chaseos/VeganAlts/issues/36) Design foundations                      | Light and dark tokens (the only color literals), self-hosted variable Archivo with a metric-matched fallback, shared components, header and footer, System / Light / Dark applied before first paint                                                                  | Contrast for every token pair in both themes, no literal colors outside `tokens.css` and no inline styles: `design-tokens.test.ts`. No theme flash, persistence, System follows the device, font preloaded: `theme.spec.ts`. Every browser test runs axe in light and dark at 390 px and desktop. [Captures](#captures).                                  |
| [#37](https://github.com/Chaseos/VeganAlts/issues/37) Countries and the store filter          | `/{country}` routes for six launch countries, `/us` → `/`, country switcher, empty-country home, normalized `stores` and `freeFrom` parameters, device preferences applied after hydration                                                                            | Staging: every country home and food page is a shared-cache `HIT`; `/us` returns `301 /`; `?freeFrom=SOY,milk` returns `301 ?freeFrom=milk%2Csoy`; an unknown store returns `302 private, no-store` to the unfiltered page; `/xx` is `404`. Tests: `filters.test.ts` (unit and integration), `discovery.test.ts`, `countries.spec.ts`, `filters.spec.ts`. |
| [#38](https://github.com/Chaseos/VeganAlts/issues/38) Taxonomy and aisles                     | Food → aisle → shelf → food, scoped name rule, depth flags, shelves as `?shelf=`, desktop aisle menu and phone aisle pages, per-country display names and homepage features                                                                                           | Staging reshape: 11 audited, reversible moves; a second run planned none; the audit reports 0 categories outside depth three. `/us/beef` returns `302 /us/meat?shelf=beef`. Tests: `taxonomy.test.ts`, `seed.test.ts`, `m5-migrations.test.ts`, `aisles.spec.ts` (keyboard, Escape returns focus, no-JS links).                                           |
| [#39](https://github.com/Chaseos/VeganAlts/issues/39) Home and search                         | Instant answers (combobox, 150 ms debounce, live count), cached `/api/v1/suggest`, Start with these, Browse every food, Trending now, New and needs ratings, Still waiting                                                                                            | Staging: `/api/v1/suggest?country=us&q=beef` is a `HIT`. Tests: `home-search.test.ts`, `home.test.ts`, `instant-search.test.ts`, `search.spec.ts`.                                                                                                                                                                                                        |
| [#40](https://github.com/Chaseos/VeganAlts/issues/40) Category ranking                        | "Vegan alternatives to …" with a summary sentence, sort (Closest match, Trending, New, Most rated, each detail), store and Free-from filters, the #1 card, detail cells and badges, unrated products, aisle sidebar                                                   | Top rank and score are identical under every sort and filter: `filters.test.ts`, `ranking-view.test.ts`. Staging: `view=trending`, `new`, `most-rated` and `freeFrom` are `HIT`s; an unknown `detail-` view returns `302`; hreflang alternates for all six countries plus `x-default`. Tests: `filters.spec.ts`, `discovery-views.spec.ts`.               |
| [#41](https://github.com/Chaseos/VeganAlts/issues/41) Product page                            | One food per page (`?food=`), score card, "How people rated it", recent eaters, CSS-only photo gallery, notes with Best/Newest, Also ranked for, other swaps, product facts                                                                                           | Staging: `?food=ground-beef` is a `HIT`; the gallery switches photos without script and with no CSP violations. Tests: `product-view.test.ts`, `photos.spec.ts`, `comments.spec.ts`, `proposals.spec.ts`.                                                                                                                                                 |
| [#42](https://github.com/Chaseos/VeganAlts/issues/42) Allergens                               | Declarations from each country's list, tier 2 only with the current formula's accepted ingredients or nutrition photo, "Contains" milk, egg, fish, crustacean or mollusc always reviewed and filed as a classification-review report, reformulations start undeclared | Tests: `confidence.test.ts`, `proposal-confirmations.test.ts`, `community-submission.test.ts`, `proposals.spec.ts`. The staging audit reports every country has an allergen list. Two-account acceptance pending.                                                                                                                                         |
| [#43](https://github.com/Chaseos/VeganAlts/issues/43) Detail scores and last ate the original | Optional detail questions and last-ate answers after an overall score, each saved on tap through the rating queue; dimension and familiarity statistics rebuilt from canonical ratings; merges add retired parity questions and reverse exactly                       | Rebuild equivalence and unchanged Top: `ratings.test.ts`, `rating-http.test.ts`. Merge parity and reversal: `taxonomy.test.ts`. Upgrade backfill: `m5-migrations.test.ts`; staging backfilled 83 familiarity rows. Tests: `ratings.spec.ts`, `rating-recovery.spec.ts`. Two-account acceptance pending.                                                   |
| [#44](https://github.com/Chaseos/VeganAlts/issues/44) Hardening                               | Legacy stylesheet removed, forced-colors outlines, keyboard paths, layout stability, upgrade proof, visual comparison                                                                                                                                                 | See [accessibility](#accessibility), [captures](#captures) and [performance and caching](#performance-and-caching). Tests: `layout-shift.spec.ts` (CLS below 0.1 on five pages at both widths), `m5-migrations.test.ts`.                                                                                                                                  |
| [#45](https://github.com/Chaseos/VeganAlts/issues/45) Contributions in every launch country   | Add product, contribute and suggest a food take the page's country; retailer market proposals; country on moderation items; sitemap for every country                                                                                                                 | A Canadian submission lands in Canada and never appears in the United States: `community-submission.test.ts`. A product added in Ireland and rated by a second account ranks there: `countries.spec.ts`. Two-account acceptance pending.                                                                                                                  |

## Local verification

The Milestone 4 baseline was 158 tests in 36 files and 40 browser tests. The final branch has **224 passing tests in 48 files** and **84 passing desktop and mobile browser tests**. Of the 14 skipped, 12 are opt-in screenshot captures and 2 apply to one width only. `npm run check` covers type generation, strict TypeScript, unit and integration tests and the build. The final browser run followed a local database reset with no edits during the run (`test-results/milestone-5/final-e2e.log`).

`m5-migrations.test.ts` upgrades a Milestone 4 database with a completed category merge through `0016`–`0018`. It then checks four things:

- The merge ledger is unchanged, the familiarity backfill is correct, and the merge still reverses.
- Seeding and reshaping move the old foods under their shelves and report foods outside the launch tree without moving them; a second reshape does nothing.
- Each move reverses.
- Rebuilding derived data twice gives identical results, and `PRAGMA foreign_key_check` is empty.

## Staging rollout

1. Pre-migration Time Travel bookmark: `000000c2-00000000-000050ff-08ebe84a8de66ba3239d585a11f47810`.
2. `npm run db:migrate:staging` applied `0016`–`0018`. `PRAGMA foreign_key_check` returned no rows. The merge ledger kept its 38 rows, 83 familiarity rows were backfilled, and the allergen vocabulary has 15 entries.
3. `npm run taxonomy:seed:staging` added the aisles, shelves, questions, display names, allergen lists and homepage features for six countries.
4. `npm run taxonomy:reshape:staging -- --operator=<staging operator>`: the dry run reported no problems and 11 moves (Cheese under Food, and each launch food under its shelf). `--apply` recorded 11 reversible taxonomy actions. A second dry run planned no moves.
5. `npm run deploy:staging` (`20a2b741`), then `7e5da34` as `45f510d0`.
6. `npm run rankings:rebuild:staging`: 37 formulas, 15 days of Trending across 10 categories. `PRAGMA foreign_key_check` still returned no rows.
7. `npx tsx scripts/audit-launch-dataset.ts staging` reports `readyForLaunch: false`, as expected. The blockers are the staging fixtures: 31 development products, 28 demo accounts, missing ingredient evidence and unreviewed Vegan classifications. The new checks all report zero: foods without questions, countries without an allergen list or homepage features, categories outside depth three, and empty rankable categories.
8. `TEST_BASE_URL=https://staging.veganalts.com npx playwright test`: 46 public browser tests passed, including axe in both themes. The 52 that need the local session fixture, or are captures, were skipped (`test-results/milestone-5/staging-e2e.log`).

## Performance and caching

`npx tsx scripts/verify-staging-public.ts --load` (anonymous, read-only) found all 24 checked URLs served from the shared cache (`HIT`):

- home and each country's home;
- food pages in every country, and Trending, New, Most rated and Free-from views;
- aisle and shelf pages, product pages with and without `?food=`;
- the suggest and comments APIs, a policy page and the sitemap.

Private reads returned `401 private, no-store`.

The load test ran two minutes at about 20 requests per second: **2,370 requests, 0 errors, 99.96% cache hits, p50 52 ms, p95 76 ms, max 246 ms**. The check was repeated on the final version: 24 of 24 were `HIT`s.

A CSP smoke test drove two passes, desktop in light and phone in dark. It covered instant search, the aisle menu, a shelf, a detail sort, Free-from, a product's photo tabs, two other countries, search and sign-in, listening for `securitypolicyviolation`. It found **no violations and no page errors**.

Mobile Lighthouse 13.5.0 (simulated throttling, warm cache):

| Page     | Performance | Accessibility | Best practices | CLS |
| -------- | ----------- | ------------- | -------------- | --- |
| Home     | 100         | 100           | 100            | 0   |
| Category | 72–95       | 100           | 100            | 0   |
| Product  | 83–87       | 100           | 100            | 0   |

Simulated performance is below Milestone 4's 98–100. Observed loads were fast: first paint 240–320 ms and the product's front photo loaded by 164 ms. The simulated first paint now includes the preloaded Archivo font (89 KB) and more client modules. The spread between runs follows the measured round-trip time (40–180 ms). Dropping the font preload would trade a visible font swap on first paint for a better simulated score; this is left as an owner decision.

## Accessibility

- **Automated checks.** axe runs in light and dark at 390 px and desktop in every browser test, alongside checks for horizontal scroll and inline styles.
- **Theme-change bug.** Hardening found that the reduced-motion rule gave every element a tiny transition, so colors briefly faded on a theme change. Reduced motion now removes transitions entirely.
- **Contrast.** Every token pair in use meets WCAG 2.2 AA in both themes (`design-tokens.test.ts`).
- **Keyboard paths.** These are driven from the keyboard in browser tests:
  - the aisle menu (Enter opens it, shelves filter it, Escape closes it and returns focus);
  - instant search (arrow keys, Escape and Enter, with a live count);
  - the sort menu (Enter, and Escape returns focus).

  The store and Free-from checklists, rating buttons and photo tabs are native checkboxes, buttons and radios. axe covers them, but no test drives them from the keyboard; they are part of the interactive pass.

- **Forced colors.** Checked by emulation on staging. Scores, flags, labels, chips, cards and controls keep system-color borders. The current shelf, pressed and current states, and the selected photo tab get a Highlight outline. Detail and distribution bars use system colors.
- **Rating controls.** The overall and detail scores are groups of pressed/unpressed buttons rather than radio groups, so a second tap clears a choice and each tap saves. Each button's name includes its number and meaning.
- **Not done: screen reader.** A manual screen-reader pass (VoiceOver or NVDA) was not done by automation. It is part of the interactive acceptance.

## Captures

Light and dark captures at 390 px and 1440 px were compared by eye with the Round 5 boards. They were taken from a freshly reset local catalog (`CAPTURE=1 npx playwright test tests/e2e/visual.spec.ts`).

The comparison found and fixed:

- unstyled fields without a `type` on add product, contribute and suggest a food;
- the moderation filter chips' alignment and spacing;
- a lone paging link on an empty My contributions page.

A representative set is committed:

| Page      | Captures                                                                                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home      | [desktop light](milestone-5/home-desktop-light.jpg), [desktop dark](milestone-5/home-desktop-dark.jpg), [phone light](milestone-5/home-phone-light.jpg)                                                                                                                              |
| Aisle     | [desktop light](milestone-5/aisle-desktop-light.jpg), [phone dark](milestone-5/aisle-phone-dark.jpg)                                                                                                                                                                                 |
| Category  | [desktop light](milestone-5/category-desktop-light.jpg), [desktop dark](milestone-5/category-desktop-dark.jpg), [phone light](milestone-5/category-phone-light.jpg)                                                                                                                  |
| Product   | [desktop light](milestone-5/product-desktop-light.jpg), [phone dark](milestone-5/product-phone-dark.jpg)                                                                                                                                                                             |
| Search    | [desktop light](milestone-5/search-desktop-light.jpg)                                                                                                                                                                                                                                |
| Workflows | [add product (phone light)](milestone-5/add-product-phone-light.jpg), [contribute (desktop dark)](milestone-5/contribute-desktop-dark.jpg), [moderation (desktop light)](milestone-5/moderation-desktop-light.jpg), [my ratings (phone dark)](milestone-5/my-ratings-phone-dark.jpg) |

Canvas data is illustrative; captures show the development catalog.

## Interactive acceptance

**Pending.** As in Milestone 4, the owner signs in on staging with two genuine accounts; automation never handles credentials. Flows to exercise and record here:

- [ ] **Rating with details.** Rate a product overall, answer its detail questions and "last ate the original", change and clear an answer, and confirm each tap saves. Confirm the food's detail cells and "How people rated it" update after the cache refresh.
- [ ] **Allergens.** Account A proposes a declaration citing the ingredients photo, and account B confirms it. Then propose "Contains milk" and confirm it goes to an operator with a classification-review report. Reverse both.
- [ ] **Country, store and Free-from.** Switch country from a food page and a product page. Choose stores and Free-from, confirm they persist on this device and that the URL stays shareable. Confirm a new country shows "Any store".
- [ ] **Second country.** Add a product in a second launch country (for example Canada). Account B rates it, and it ranks only there. Reverse or reject it afterwards.
- [ ] **Screen reader and keyboard.** VoiceOver pass through the aisle menu, search, sort and filters, and the rating form; operate the store and Free-from checklists, rating buttons and photo tabs from the keyboard.

All test data is reversed or rejected afterwards, and the moderation inbox is left empty.

## Recovery references and limits

- Rollback: `npx wrangler rollback 52030423-4aed-4ea3-85f4-db3c8bcd4878 --env staging` returns the Milestone 4 Worker. The migrations are additive, but that Worker does not maintain the detail and familiarity statistics, so run `npm run rankings:rebuild:staging` after rolling forward again.
- Taxonomy moves are ordinary audited actions and reverse from the taxonomy workspace. Prefer reversals to a Time Travel restore, which would discard later contributions.
- Thresholds remain configurable defaults (see the specification), including Early, detail answers, recent eaters and Still waiting.
- Lighthouse performance on category and product pages is below Milestone 4 (see above).

## Follow-ups

- [#31](https://github.com/Chaseos/VeganAlts/issues/31) Production cutover: production now needs `0005`–`0018`, and the taxonomy seed carries the full launch shape (no reshape). Comment drafted, not posted.
- [#33](https://github.com/Chaseos/VeganAlts/issues/33) Production taxonomy seed: now includes aisles, shelves, questions, display names, allergen lists and features for six countries. Comment drafted, not posted.
- [#46](https://github.com/Chaseos/VeganAlts/issues/46) Countries and languages beyond the launch set.
