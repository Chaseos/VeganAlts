# USA launch plan

The first release is the USA only (owner, 2026-11-06). Other countries and languages stay built but switched off. This plan orders the work; [the launch checklist](launch-checklist.md) holds the detailed cutover steps.

## 1. Where things stand

| Area | State |
|---|---|
| Catalog | 1,170 reviewed US products on staging; none anywhere else |
| Ratings | None. Every ranking starts empty |
| Production | Coming-soon page; pre-release database that needs a reset |
| Moderation in production | Off: `MODERATION_PROVIDER`, `CONTENT_SAFETY_PROVIDER` and `FOOD_REVIEW` are unset or disabled |
| Browser tests | Last full run: 4 failures, which all passed when rerun after a fix. No full run since |
| Page speed | Not measured on a quiet machine since the language work |
| Known bug | Phone photo upload failed with "check your connection" on 2026-11-04, unexplained |

## 2. Order of work

Each stage finishes before the next starts.

### Stage 1: finish the code (Claude)

1. Done: merge the three language branches. Those countries stay inactive in production.
2. Done: the "Also sold in" structure, stage 1 of [the plan](../SHARED_RANKINGS_PLAN.md). Nothing changes for visitors.
3. **US-only switch.** `taxonomy:seed:production` creates every country as active, so production needs a list of launch countries. Countries outside it get no pages, sitemap entries or menu items. Test that `/ca/en`, `/de/de` and `/jp/ja` return 404, and that no country menu appears when one country is live.
4. Run the launch dataset audit against the staging catalog, and fix what it finds.

**Done when** the US site behaves as it does today, and everything else is off.

### Stage 2: prove it works (Claude, then the owner)

1. A clean full browser suite on a quiet machine, with the video project's port conflict out of the way.
2. Page speed against the baseline in the page speed notes, on the home, food, product and search pages. Include stage 1's new query. Decide on splitting the English dictionary by page if it matters.
3. Find the phone upload failure: reproduce it on a real phone on staging, on mobile data and Wi-Fi.
4. Empty-state pass. With no ratings, read the home, food and ranking pages as a first visitor would. They must still be useful, and invite the first rating.
5. The owner runs a real pass on a phone: sign in with Google and Apple, rate, comment, add a product with photos, save, report.
6. Update the launch checklist, which still describes six countries, and says `/us` redirects to `/`.

**Done when** the suite is clean, speed is at or near the baseline, and the owner's pass finds nothing serious.

### Stage 3: production setup (owner, with Claude)

Follow sections 1 to 3 of the checklist:

1. Accounts: billing alert, spend limits on Cloudflare, Anthropic and OpenAI, and confirm Workers AI budgets.
2. Secrets: auth, Google, Apple, Turnstile, OpenAI and Anthropic keys, and OAuth callbacks for `veganalts.com`.
3. Moderation on: `MODERATION_PROVIDER` to `clef`, `CONTENT_SAFETY_PROVIDER` on, `FOOD_TEXT_PROVIDER` to `claude`, `FOOD_REVIEW` to `{"default":"queue"}`, and real `MODERATION_POLICY` thresholds.
4. Database: take a bookmark, reset production to version 1, seed the taxonomy, and import the catalog.
5. Read replication on production once staging has run cleanly.

**Done when** production passes the audit with `readyForLaunch: true`, still behind the coming-soon page.

### Stage 4: trust (owner)

1. No lawyer (owner, 2026-11-06): check the privacy and terms pages against what the site really does, and against reputable templates and official guidance. Register a DMCA agent, because users upload photos.
2. Review the moderation, rankings, vegan status and contact pages.
3. Check the US allergen list and "Always check the package" wording against FDA guidance.
4. **First ratings (owner, 2026-11-06).** The owner and family rate the products they've tried before opening to the public.

**Done when** the policy pages are accurate and those ratings are in.

### Stage 5: launch

1. Merge `develop` into `main`, following the checklist's note on its documentation commits.
2. Set `PUBLIC_LAUNCH` to `"true"`, and deploy. Record the previous version for rollback.
3. Run the post-launch checks in section 7 of the checklist.
4. Watch errors, automation and AI spend daily for the first week.
5. Open it up: share on Reddit, Facebook and other vegan communities to bring in contributors. Check each community's rules on self-promotion first.

## 3. After launch

Open Canada and the UK when the US has steady activity: a set number of weekly raters who aren't the owner, chosen by the owner. Stage 2 of "Also sold in" comes first.

## 4. Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| 1 | First raters | Decided: the owner and family, then Reddit, Facebook and vegan communities |
| 2 | A private period | Decided: no, launch publicly |
| 3 | Food review in production | Queue-only at first, so you see what the AI would do |
| 4 | Legal review | Decided: no lawyer; the owner and Claude do the best they can. Revisit before sponsors or real revenue |
| 5 | The weekly-rater trigger for Canada and the UK | Your call; 100 is a reasonable start |

## 5. Sponsors, later

Sponsors can show a clearly labelled product beside rankings, and can never buy a position (owner, 2026-11-06). Before the first one: review the privacy page's advertising lines, and label every placement as sponsored. `PRODUCT_MASTER.md` and `docs/RANKING.md` already hold this rule.
