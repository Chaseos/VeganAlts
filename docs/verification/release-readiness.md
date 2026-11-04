# Production-readiness implementation — 2026-10-23

The contribution/moderation fixes and reviewed catalog cleanup are implemented. Staging’s cleaned dataset passes its launch audit. **Production is not ready for cutover:** its deployed Worker and database predate the current baseline and provider setup. Application code is saved in this checkout and has not been deployed by this review. Catalog changes below are already applied to staging.

## Application changes

- Correction forms offer every active rankable food; current and retired memberships resolve by ID independently of search limits.
- Moderation product lookup searches product names, brands and both kinds of aliases. Options show brand, product and country. Hidden products stay out of choices.
- Reversal review shows recorded before/after values and affected foods, lines, products, formulas and photos. Conflict checks, the required reason and durable history remain intact. Food-membership reversals explain what happens to later ratings.
- Ingredient audit accepts usable transcription records tied to accepted photos on the current formula, including front/back slots, and dated matching online ingredient sources. Empty, invalid, rejected, wrong-formula and missing evidence still fail.
- The production importer requires a cleaned review tied to the exact source hash, a successful full production dry run from the last 24 hours, matching target/operator/review hashes, explicit database confirmation, a saved Time Travel recovery point, idempotency receipts and full post-import verification. See [catalog operations](../operations/catalog-import.md).
- Submission guidance, policy text and automated category-fit criteria use the owner’s imitation-only and manufacturer-supported vegan-preparation rules. A policy version bump prevents reusing prior-scope decisions.
- Navigation groups and aisles remain. The new food categories reuse existing icons. Profile design remains unchanged.

The later owner-requested admin controls are implemented locally: product-only **Doesn’t belong on VeganAlts** reports, report resolution with reversible removal, **Manage product → Remove from catalog**, and direct **Hide comment** confirmations. Each retains history and uses the existing reversal path. These controls require deployment; the staging catalog cleanup below was a separate operation.

## Applied staging catalog decisions

The public catalog now contains **1,109 active products across 698 recipe lines**, down from 1,149 products across 718 lines. After reviewing the initial reversible cleanup, the owner explicitly requested permanent deletion of the omitted products and brownie mixes. **Forty records were deleted from staging:** 37 excluded products and three verified duplicates. No held or hidden products remain. Storage contains **1,109 products, 1,113 formulas, 2,242 photos, one comment and zero ratings or tried records**. A full catalog snapshot and D1 recovery bookmark were saved before deletion; foreign-key checks pass. All unrelated product rows and user activity are unchanged.

| Outcome | Count | Detail |
| --- | ---: | --- |
| Excluded and deleted | 37 | Twelve brownie mixes, nine vegetable-focused burgers, six ordinary/sugar-reduced chocolate chips, Trader Joe’s Thai Green Curry, eight Actual Veggies burgers and the whey-containing UNREAL caramel peanut nougat. |
| Duplicate records deleted | 3 | Later Silk Protein Soymilk, Original CocoWhip and the mislabeled Silk Vanilla shelf-stable multipack. Packaging and ingredients match retained entries. Their additional store locations were preserved on the survivors. |
| Reclassified | 18 | Seven brownies/blondies/banana bread, five cheesecake/fruit-pie entries, five Daring meals and Amy’s chili. Each Daring meal has its own recipe line. |
| Yogurt representation corrected | 1 | The held Cocojune variety-pack record now represents Raspberry only. Vanilla Cinnamon already had its own record; it remains separate, with Costco added from the pack evidence. |
| Explicitly retained | 6 | Chocolate alternatives with an explicit dairy/allergen-free replacement role, including the reviewed carob product. |

Nine specific foods were created; the empty combined Pies and Cheesecake and Skillet Meals foods were retired. Old memberships and actions remain. Bitchin’ Sauce stays in Creamy Dips. The five Daring products now occupy five separate recipe lines; their two pasta dishes appear in [Chicken Pasta on staging](https://staging.veganalts.com/us/chicken-pasta).

All six photographed Silk almondmilk records were checked against their front and ingredient panels. The later record labeled Original is the same **Vanilla 6 × 8 fl oz shelf-stable pack** already represented in the catalog, with matching ingredients and nutrition. That duplicate was deleted; refrigerated Original remains. The five retained entries have matching product/flavor photos. Two transcription errors were corrected: Dark Chocolate lists **sunflower oil**, and shelf-stable Unsweet Vanilla lists **water**. The latter’s incorrect refrigerated online supplement was removed. Photo replacements were unnecessary.

The former Chicken Chili food is now **Chili**, with its old URL redirecting to the new one. Amy’s Light in Sodium Organic Chili Medium and Daring Smoky Veggie Chili appear together while keeping separate recipe lines. Cocojune Raspberry reuses the pack photos and only its Raspberry ingredient panel; Vanilla Cinnamon retains its existing individual photos and ingredient list. Both have individual product pages and rating controls.

## Verification

- The later admin-control additions pass **36 targeted tests across six files**, including real authenticated HTTP checks for operator access, origin validation, required reasons, stale revisions, safe retries, preserved records and reversal. **Ten desktop/mobile browser journeys across three files** pass, including report-target switching, report resolution/removal, direct removal/cancellation, direct comment hiding/restoration, author editing/deletion and existing comment/report flows. New controls pass keyboard-focus checks and automated accessibility checks in both themes. TypeScript, the build and whitespace checks pass; the existing CSS sourcemap warning remains. Browser mutations used a separate temporary database. Captures and logs are in ignored `test-results/admin-tools/`; no live catalog writes or deployment were performed for these additions.
- 423 unit/integration tests across 80 files pass, covering >100 food options, retired labels, brand/product aliases, identical names, evidence variants, release approval guards, cleanup idempotency and preservation/reversal.
- 12 desktop/mobile browser journeys pass: submission, photo upload and retry, follow-up, acceptance/rejection, ingredient report, reformulation, packaging, duplicate archival/reversal, retailer confirmation, saved profiles, reserved/occupied handles and moderation-provider failures. Keyboard focus and Enter submission are exercised; automated accessibility checks run in both themes and check horizontal overflow. This is not a manual screen-reader certification.
- The initial isolated local import wrote **1,107 products plus four later formulas**. All 1,111 operations replayed without duplicating records. Ranking rebuild produced the same verification digest. A separate browser rehearsal reversed an actual imported product, returned 404 publicly, removed it from search and retained its formula/photo rows. This rehearsal predates the owner’s final decisions; rehearse the updated 1,109-product manifest before production import.
- The staging launch dataset audit reports `readyForLaunch: true`, no blocking issues, no missing front/ingredient evidence, no duplicate names and no pending moderation. One empty rankable food and three foods without aliases remain nonblocking; empty foods are allowed by product policy.
- TypeScript and the production build pass. The existing CSS sourcemap warning remains.
- After the final owner decisions, **68 targeted tests across six files and TypeScript checking pass**. All four corrected source batches render without review errors. The guarded deletion was rehearsed against the catalog snapshot, including rollback/no-op behavior on stale revisions. Read-only staging verification checks all 1,109 identities, markets, food memberships, recipe-line groupings, classifications, formula history, ingredient transcriptions, retailer links, photo metadata and search entries against the updated manifest; all pass. The 32 full/thumbnail objects for the eight corrected products also match their source hashes. Staging’s five assigned Daring line IDs are retained, with identical grouping to the new-import manifest. The post-cleanup launch audit has no blocking issues.
- Chrome confirms the old chili URL redirects, both chili entries are present, Raspberry and Vanilla Cinnamon have separate flavor-specific pages and ingredient text, and Silk Vanilla’s retained entry has the correct packaging and added Whole Foods availability. No ratings were submitted during verification.
- The original local catalog/dev server was preserved; comparison with the pre-test database copy found only internal runtime metadata changed. Browser and import rehearsals ran in separate temporary checkouts/databases. No commits, pushes, pull requests, production writes or deployments were made.

## Production cutover requirements

Read-only checks found that the deployed production version dates from **2026-10-04**. Its runtime has no operator IDs and predates the current moderation/public-launch settings. The repository’s production configuration leaves both moderation providers disabled and public launch off. The production launch audit cannot run because `formula_classifications` is absent. Auth secrets for Google/Apple exist; their values were not read. Production has no recorded OpenAI safety secret or Turnstile configuration.

1. Review/back up production data and perform the separately authorized baseline preparation required by repository policy. Do not apply a fresh seed over an incompatible old schema.
2. Verify real Google/Apple callbacks for `https://veganalts.com`, sign-in/session behavior and the intended production operator account. Configure its exact user ID; staging user IDs are not assumed valid in production.
3. Configure production Clef, content safety and required secrets/abuse controls. Verify provider success, failure and private retry behavior in the deployed environment.
4. Deploy the tested application, run the guarded full dry run/import using the cleaned manifest and review, rebuild/verify, and repeat the production dataset audit.
5. Verify public/authenticated production paths before enabling public launch. A live production Time Travel restore and real provider callbacks were not exercised. Whole-database restore is a separately authorized operation because it would replace later writes.

The current application changes still need a staging deployment to exercise these new screens against the live providers. Staging catalog writes rebuild derived data; a deployment also refreshes the shared cache namespace. The new public Chicken Pasta page was checked directly in Chrome after cleanup.

## Evidence and recovery

Private source/review/cleanup/recovery artifacts are retained outside the repository in `assets/catalog-release-2026-10-23/` at the workspace root. The original manifests, snapshots, reversible-cleanup action IDs and local rehearsal reports remain as historical evidence. **The current release files are in `owner-decisions/`: `source-manifest.json`, `release-review.json` and `release-manifest.json`.** The cleaned manifest hash is **`f46eb3aca20adb1fcf69e181bdf62eaaf46a5c90080b3feae6b5ff44ef118008`**, containing 1,109 products, 698 lines and four later formulas. Earlier manifests and dry-run approvals are obsolete for cutover.

That folder also contains the pre-deletion catalog snapshot, whole-database Time Travel bookmark, guarded purge plan and result, correction action IDs, verified final state, and backups of each edited source file. The deletion required exactly the 40 reviewed hidden records with unchanged revisions and no ratings, comments, tried records or pending work; it retained moderation/import audit records. R2 objects and original photo bytes remain available. This bounded owner exception is documented in [moderation policy](../MODERATION.md); ordinary moderation still preserves durable history.

The importer keeps package-claim/uncertain-origin warnings in its reports; these retain the existing classification policy and are not silently upgraded to verified ingredient origins. The release overlay itself does not rewrite photo batches. The owner’s final decisions were also saved through the existing photo-review correction/transcription files so rebuilding from those batches excludes deleted products and preserves the corrected facts. Prior source files are backed up separately.

Screenshots and test logs are ignored under `test-results/release-readiness/`: `browser-tests.log`, `all-tests-final.log`, `production-build.log`, `staging-verification.log`, `reversal-impact-mobile.png`, `silk-consolidated.png`, `cocowhip-consolidated.png`, `chicken-pasta-staging.png` and `import-reversal.png`.

Final-decision evidence is ignored under `test-results/owner-decisions/`: targeted test and typecheck logs, launch audit and manifest verification logs, plus `chili-staging.png`, `raspberry-staging.png`, `vanilla-cinnamon-staging.png` and `silk-vanilla-staging.png`. Operational scripts and their results are also archived in the private `owner-decisions/` folder.

## Product-level review ledger

The following ledger records the final owner decisions. Deleted records are excluded in the source corrections; retained/reclassified records are represented in the current release overlay. There are no outstanding evidence holds in this release catalog.

| Brand and product | Decision | Comparison / reason |
| --- | --- | --- |
| Ghirardelli — Premium Brownie Mix Dark Chocolate | deleted | No package or manufacturer vegan preparation has been verified for this exact mix. Owner requested deletion of all 12 brownie mixes. |
| Great Value — Fudge Brownie Mix | deleted | No package or manufacturer vegan preparation has been verified for this exact mix. Owner requested deletion of all 12 brownie mixes. |
| Duncan Hines — 13x9 Family Size Chewy Fudge Brownie Mix | deleted | No package or manufacturer vegan preparation has been verified for this exact mix. Owner requested deletion of all 12 brownie mixes. |
| Duncan Hines — 13x9 Family Size Milk Chocolate Brownie Mix | deleted | No package or manufacturer vegan preparation has been verified for this exact mix. Owner requested deletion of all 12 brownie mixes. |
| Duncan Hines — 13x9 Family Size Dark Chocolate Fudge Brownie Mix | deleted | No package or manufacturer vegan preparation has been verified for this exact mix. Owner requested deletion of all 12 brownie mixes. |
| Betty Crocker — Fudge Brownie Mix | deleted | No package or manufacturer vegan preparation has been verified for this exact mix. Owner requested deletion of all 12 brownie mixes. |
| Betty Crocker — Favorites Fudge Brownie Mix | deleted | No package or manufacturer vegan preparation has been verified for this exact mix. Owner requested deletion of all 12 brownie mixes. |
| bettergoods — Premium Blend Double Chocolate Brownie Mix | deleted | No package or manufacturer vegan preparation has been verified for this exact mix. Owner requested deletion of all 12 brownie mixes. |
| Betty Crocker — Delights Supreme Triple Chunk Brownie Mix | deleted | No package or manufacturer vegan preparation has been verified for this exact mix. Owner requested deletion of all 12 brownie mixes. |
| Betty Crocker — Supreme Chocolate Chunk Brownie Mix | deleted | No package or manufacturer vegan preparation has been verified for this exact mix. Owner requested deletion of all 12 brownie mixes. |
| Betty Crocker — Delights Supreme Walnut Brownie Mix | deleted | No package or manufacturer vegan preparation has been verified for this exact mix. Owner requested deletion of all 12 brownie mixes. |
| Betty Crocker — Reese's Brownie Mix with Reese's Peanut Butter Chips | deleted | No package or manufacturer vegan preparation has been verified for this exact mix. Owner requested deletion of all 12 brownie mixes. |
| Toll House — Organic Allergen Free Semi-Sweet Morsels | retain | Explicit dairy-free/allergen-free chocolate substitute or carob imitation in the reviewed product identity; retain the chocolate-chip comparison. |
| Toll House — Organic Allergen Free Dark Chocolate Morsels | retain | Explicit dairy-free/allergen-free chocolate substitute or carob imitation in the reviewed product identity; retain the chocolate-chip comparison. |
| Bake Believe — Semi-Sweet Chocolate Flavored No Sugar Added Baking Chips | deleted | Ordinary dark/semisweet chocolate or sugar-reduced chips lack verified intent to imitate a normally animal-based original. Owner approved exclusion and deletion. |
| Bake Believe — Dark Chocolate Flavored No Sugar Added Baking Chips | deleted | Ordinary dark/semisweet chocolate or sugar-reduced chips lack verified intent to imitate a normally animal-based original. Owner approved exclusion and deletion. |
| Lily's — Dark Chocolate Style Baking Chips | deleted | Ordinary dark/semisweet chocolate or sugar-reduced chips lack verified intent to imitate a normally animal-based original. Owner approved exclusion and deletion. |
| Enjoy Life — Dairy Free Semi-Sweet Mini Chips | retain | Explicit dairy-free/allergen-free chocolate substitute or carob imitation in the reviewed product identity; retain the chocolate-chip comparison. |
| Enjoy Life — Dairy Free Dark Morsels 69% Cacao | retain | Explicit dairy-free/allergen-free chocolate substitute or carob imitation in the reviewed product identity; retain the chocolate-chip comparison. |
| Enjoy Life — Dairy Free Semi-Sweet Mega Chunks | retain | Explicit dairy-free/allergen-free chocolate substitute or carob imitation in the reviewed product identity; retain the chocolate-chip comparison. |
| Dr. Praeger's — Black Bean Quinoa Veggie Burgers | deleted | Vegetable-focused product; meat-imitation intent has not been established from the reviewed package or manufacturer description. Owner approved exclusion and deletion. |
| Dr. Praeger's — California Veggie Burgers | deleted | Vegetable-focused product; meat-imitation intent has not been established from the reviewed package or manufacturer description. Owner approved exclusion and deletion. |
| MorningStar Farms — Garden Veggie Burgers | deleted | Vegetable-focused product; meat-imitation intent has not been established from the reviewed package or manufacturer description. Owner approved exclusion and deletion. |
| Daiya — Cheesecake Bites Dipped in a Dark Chocolatey Shell Original | reclassify | cheesecake |
| Daiya — Cheesecake Bites Dipped in a Dark Chocolatey Shell Strawberry Flavored | reclassify | cheesecake |
| Daiya — Cheesecake Bites Dipped in a Dark Chocolatey Shell Chocolate | reclassify | cheesecake |
| Actual Veggies — Chickpea Masala Veggie Burger with Cauliflower, Peas, Quinoa & Potato | deleted | Manufacturer explicitly says these vegetable burgers do not try to taste like meat; outside the approved imitation scope. |
| Actual Veggies — Mushroom Quinoa Veggie Burger with Shiitake Mushroom, Spinach & Black Bean | deleted | Manufacturer explicitly says these vegetable burgers do not try to taste like meat; outside the approved imitation scope. |
| Actual Veggies — California Garden Veggie Burger with Mixed Veggies & Quinoa | deleted | Manufacturer explicitly says these vegetable burgers do not try to taste like meat; outside the approved imitation scope. |
| Actual Veggies — Black Bean Veggie Burger with Red Pepper & Carrot | deleted | Manufacturer explicitly says these vegetable burgers do not try to taste like meat; outside the approved imitation scope. |
| Daring — Skillet Meal Smoky Veggie Chili | reclassify | chili |
| Daring — Skillet Meal Teriyaki Veggie Stir-Fry | reclassify | chicken-stir-fry |
| Daring — Skillet Meal Penne Pomodoro | reclassify | chicken-pasta |
| Daring — Skillet Meal Lemon & Garlic Rotini | reclassify | chicken-pasta |
| Daring — Skillet Meal Mediterranean-Spiced Chickpeas & Veggies | reclassify | chicken-and-chickpeas |
| Trader Joe's — Vegan Banana Bread with Walnuts | reclassify | banana-bread |
| Missy J's — Carob Chips | retain | Explicit dairy-free/allergen-free chocolate substitute or carob imitation in the reviewed product identity; retain the chocolate-chip comparison. |
| Amy’s — Light in Sodium Organic Chili Medium | reclassify | Owner retained it in Chili alongside Daring, with its own recipe line. |
| JP's — Gluten-Free Vegan Brownie | reclassify | brownies |
| Raised Gluten Free — Berry Peach Pie | reclassify | fruit-pies |
| Raised Gluten Free — Dutch Apple Pie | reclassify | fruit-pies |
| Dolci di Maria — Gluten Free No Sugar Added Brownie | reclassify | brownies |
| Abe's — Chocolate Brownies | reclassify | brownies |
| Actual Veggies — Super Greens Veggie Burger | deleted | Manufacturer explicitly says these vegetable burgers do not try to taste like meat; outside the approved imitation scope. |
| Actual Veggies — Black Bean Veggie Burger with Red Pepper & Caramelized Onion | deleted | Manufacturer explicitly says these vegetable burgers do not try to taste like meat; outside the approved imitation scope. |
| Dr. Praeger's — Mushroom Risotto Veggie Burgers | deleted | Vegetable-focused product; meat-imitation intent has not been established from the reviewed package or manufacturer description. Owner approved exclusion and deletion. |
| Dr. Praeger's — Crunchy Cauliflower Veggie Burgers | deleted | Vegetable-focused product; meat-imitation intent has not been established from the reviewed package or manufacturer description. Owner approved exclusion and deletion. |
| Amy’s — Organic Veggie Burgers California | deleted | Vegetable-focused product; meat-imitation intent has not been established from the reviewed package or manufacturer description. Owner approved exclusion and deletion. |
| 365 — Falafel Burgers | deleted | Vegetable-focused product; meat-imitation intent has not been established from the reviewed package or manufacturer description. Owner approved exclusion and deletion. |
| 365 — Mushroom Burger with Quinoa & Brown Rice | deleted | Vegetable-focused product; meat-imitation intent has not been established from the reviewed package or manufacturer description. Owner approved exclusion and deletion. |
| Greyston Bakery — Vegan Birthday Cake Blondie | reclassify | blondies |
| Greyston Bakery — Vegan Fudge Brownie | reclassify | brownies |
| Greyston Bakery — Vegan Cinnamon Roll Blondie | reclassify | blondies |
| Actual Veggies — Black Bean Veggie Burger | deleted | Manufacturer explicitly says these vegetable burgers do not try to taste like meat; outside the approved imitation scope. |
| Actual Veggies — Mushroom Quinoa Veggie Burger | deleted | Manufacturer explicitly says these vegetable burgers do not try to taste like meat; outside the approved imitation scope. |
| Cocojune — former Greek-Style Yogurt Variety Pack | correct | Converted to Raspberry Greek-Style Cultured Coconut with Raspberry-only ingredients and the existing pack photos. Vanilla Cinnamon already has a separate record. |
| Trader Joe's — Dark Chocolate Chips No Sugar Added | deleted | Ordinary dark/semisweet chocolate or sugar-reduced chips lack verified intent to imitate a normally animal-based original. Owner approved exclusion and deletion. |
| Trader Joe's — 72% Cacao Dark Chocolate Chips | deleted | Ordinary dark/semisweet chocolate or sugar-reduced chips lack verified intent to imitate a normally animal-based original. Owner approved exclusion and deletion. |
| Trader Joe's — Semi-Sweet Chocolate Chips | deleted | Ordinary dark/semisweet chocolate or sugar-reduced chips lack verified intent to imitate a normally animal-based original. Owner approved exclusion and deletion. |
| Trader Joe's — Vegetable Masala Burger | deleted | Vegetable-focused product; meat-imitation intent has not been established from the reviewed package or manufacturer description. Owner approved exclusion and deletion. |
| Trader Joe's — Vegan Thai Green Curry with Tofu Sheets, Vegetables and Jasmine Rice | deleted | Animal-based original and imitation intent were not established; owner approved exclusion and deletion. |
| Silk — mislabeled Original Almondmilk multipack | deleted duplicate | Package is Vanilla 6 × 8 fl oz and matches the existing Vanilla record’s ingredients and nutrition. Retained Vanilla and its store locations; refrigerated Original is distinct. |
| Silk — Protein Soymilk Original | deleted duplicate | Both bottles are 48 fl oz, with the same 13 g protein label and matching ingredients. Retained the earlier entry and the later entry’s additional store location. |
| So Delicious — Original CocoWhip | deleted duplicate | Both 9 oz tubs have lid print code 10493809 and matching ingredients. Retained the earlier entry and the later entry’s additional store location. |
| UNREAL — Dark Chocolate Caramel Peanut Nougat Bars | deleted | Package lists grass-fed whey protein and Contains Milk; matches the existing owner source correction. |
