# Milestone 6: Simpler Contributions and Country Foods

Approved on 2026-10-10. Milestone 6 makes contributing feel like the rest of the swap aisle: ask for the few things a product needs, let people add the rest if they know it, and submit once. It also makes foods belong to the countries that actually sell them, while aisles and shelves stay the same everywhere. Work starts on `feature/milestone-six-simpler-contributions`, based on the unmerged milestone 5 branch (`66805be`), and is rebased onto `develop` once milestone 5 merges.

## Why

A walkthrough of staging and the code on 2026-10-10 found:

- **Adding a product took four screens** (Identify → Check matches → Add evidence → Review).
  - The required fields were split across the first and third screens.
  - "Check matches" was an empty click when nothing matched, and "Review" only repeated what had been typed.
  - A written classification note was required even with an ingredients photo attached.
  - A reload lost everything.
- **The food picker was a flat list of up to 100 checkboxes using the base names.** It had no search, no grouping and no country names.
- **Suggesting a missing food was a separate page.** Opening it discarded the product draft and the country. After the food was accepted, the contributor started again.
- **Foods appeared in every country,** and an accepted suggestion ignored the country it came from.
- **Names repeated in navigation** ("Eggs › Eggs › Eggs"), and the wording mixed "category", "food", "conventional food" and "replacement category".

Comparable products (Untappd, Google Maps' "add a missing place", Goodreads, Open Food Facts, Amazon and eBay listings), together with NN/g and Baymard guidance, follow one pattern:

- a short required set;
- duplicates shown while typing;
- category search with an inline "suggest a new one";
- optional details afterwards, then one submit.

Multi-country catalogs keep one shared category list with localized names and per-country availability, not separate trees.

## Agreed boundaries

- **Staging only.** No production migrations, secrets, deployment or DNS changes.
- **Ranking integrity.** Top remains the Bayesian overall-similarity order. Availability per country, the "Ingredients not checked yet" state and the contribution extras never change a Top score, eligibility rule or rating weight. They only add products to, or remove them from, rankings through the existing canonical records.
- **Additive data.** Migrations are append-only and additive. No parent table (`products`, `product_versions`, `categories`) is rebuilt, because D1 cannot disable foreign keys and a rebuild would cascade into ratings.
- **Version 1 baseline (owner, 2026-10-10).** Nothing has been released, so every migration, including this milestone's, is folded into one baseline, `db/migrations/0001_initial.sql`. Local and staging databases are recreated from it, and production starts from it at release. Append-only applies from version 1 on.
- **Moderation automation stays advisory.** Deterministic checks run first. A provider failure routes to review, never approval. "Vegan" classification stays operator-only.
- **Not in this milestone:**
  - barcode scanning;
  - OCR or AI pre-fill of product details;
  - contributor-created aisles or shelves;
  - separate taxonomies per country;
  - renaming the `/propose-category` URL;
  - changes to ranking formulas;
  - production deployment.
- **Completion and approvals.** Completion means local and staging verification with documented evidence. Local commits are made per verified checkpoint. Pushes, PRs, issue and milestone changes, staging migrations and deployments, merging and production work each need separate authorization.

## Owner decisions (2026-10-10)

- **Shared macros, per-country foods.** Aisles and shelves are global and identical in every country. A food appears in a country only once it is switched on there:
  - the launch foods in all six launch countries;
  - an accepted suggestion in the country it was suggested from;
  - automatically in another country when a product for it is published there.

  Operators can switch countries on and off for a food.

- **The add-product minimum** is product name, brand, food and a front photo. The country is prefilled from the page and can be changed.
  - Ingredient evidence (an ingredients photo or a manufacturer link) is optional.
  - A product published without it shows **"Ingredients not checked yet"**, and still ranks and can be rated.
- **A missing food is suggested inline inside Add a product.** The product and the new food are reviewed together, and the product goes live when the food is accepted.
- **The optional step offers:**
  - the contributor's overall rating;
  - stores where it is commonly found;
  - an allergen declaration;
  - more photos (back, nutrition);
  - variant details;
  - other foods it replaces.
- **No canvas boards for milestone 6 screens.** They follow the milestone 5 design patterns. Phone and desktop screenshots in both themes are reviewed by the owner at each UI checkpoint before work continues; they are never committed.
- **Adding ingredient evidence later is community-confirmed (tier 2),** the same way allergen declarations are, and any disagreement goes to an operator.
- **Starter shelves.** Meat gains Turkey and Lamb. A new Fish and seafood aisle holds Fish and Shellfish. Dairy gains Cream, Yogurt and Ice cream. Cheese gains Hard and grated. Empty shelves stay hidden from browsing until they hold a food that is on in that country, but they are offered when suggesting a food.

## Defaults

### Adding a product

- **Two steps and one submit.**
  - Step 1, **The basics**: country, food, brand, product name and front photo, all required. "Is it one of these?" matches appear while typing.
  - Step 2, **Add more (optional)**: a summary of the basics with Edit, then optional rows and Submit.
  - Step 2 is `?step=more`, so the browser Back button returns to step 1.
  - The text draft is kept in session storage for 24 hours; photos are added to the draft in checkpoint 10.
  - Errors appear in a focused summary that links to each field; Continue is never silently disabled.
- **Food picker.**
  - A searchable list of the country's foods by their display names and other names, grouped as "Meat › Chicken".
  - Foods not yet on in the country are listed and tagged "Not in [country] yet". Adding a product brings them there.
  - The last option, "Suggest '[name]' as a new food", opens the new food's shelf and other names in place.
- **Live duplicate matching** uses a read-only endpoint on the search rate limit, so typing never triggers a challenge. An exact match offers "Already on VeganAlts · Rate it", and publication still refuses exact duplicates.
- **Photos.** At most four per submission (front, ingredients, back, nutrition) and 40 MiB in total. Four is the automated photo check's limit.
- **Foods.** A product names one primary food (existing or new) and up to four more existing foods.
- **Rating.** The contributor's rating applies to the primary food. It is saved when the product goes live, and only if the contributor has not rated that food already. This is the one rating that does not save on tap.
- **Result.** Publication opens the product page with "Your product is live" and a prompt to rate it. A held submission shows what happens next, including "waiting on your new food".

### Classification on submission

| Ingredient evidence | "Nothing animal-derived" ticked | Manufacturer label        | Result                      | Decision |
| ------------------- | ------------------------------- | ------------------------- | --------------------------- | -------- |
| none                | any                             | any                       | Ingredients not checked yet | READY    |
| given               | yes                             | any                       | Appears vegan               | READY    |
| given               | no                              | plant-based               | Plant-based                 | READY    |
| given               | no                              | vegan, neither or unknown | Ingredients not checked yet | READY    |

- **Outcomes.**
  - Giving more evidence never produces a worse outcome than giving less.
  - An ingredients photo the automated check cannot read downgrades the result to "Ingredients not checked yet" instead of holding the submission.
  - A declaration that the product contains milk, egg, fish, crustacean or mollusc holds the submission for review.
  - Near-duplicate candidates, variant relationships, specialty flavors and follow-ups still hold for review, as before.
- **How it is stored.** "Ingredients not checked yet" is a flag on the formula's classification, not a fifth stored status. The stored status of an unchecked formula is a placeholder (`appears_vegan`) that one shared read helper always replaces with the public value `unchecked`.

### Countries and browsing

- **Per-country foods.** A `category_countries` record switches a food on in a country.
  - Aisles and shelves are never country-scoped. Aisles and shelves with no food on in a country are hidden there.
  - A food stays on wherever it has a visible product.
  - Publishing a product, adding a product to another food, merging foods or restoring a hidden product each switch the food on in the product's country.
  - Activating a new country switches no foods on.
  - An alias decision on a suggested food switches the existing food on in the suggestion's country.
- **A food that is not on in a country.**
  - Its URL there renders a shared-cacheable "Not in [country] yet. Know one sold here? Add it" page with `noindex`.
  - It is left out of the aisle bar, home, search, sitemap and `hreflang`.
  - The country switcher keeps the food and lands on this page when the food is not on there.
- **Silent shelves.** A shelf is not shown as its own level when:
  - its name matches its aisle's;
  - it is its aisle's only shelf; or
  - it holds exactly one food with the same name.

  Breadcrumbs then read "All foods / Eggs aisle / Eggs". URLs are unchanged.

- **Empty-country home.** An empty country's home lists the shared aisles with "Be the first to add one" links.
- **Ranking pages** link "Suggest a food".
- **Vocabulary.** Aisle › shelf › food. "Suggest a food" replaces "Propose a category" everywhere people read it.

### Suggesting a food

- **Inline suggestion.**
  - Preflight checks the name, shelf, open country and daily limit.
  - Finalize holds the product and records the suggestion together.
  - Accepting the food (or aliasing it to an existing food) re-checks the product with the resolved food and publishes it when nothing else needs review.
  - Rejecting the food sends the contributor a follow-up to choose an existing food. That revision always returns to an operator.
- **The standalone page** stays for search and aisle links. It asks for the food name, shelf, optional other names and an optional note, and links "Have a product for it? Add it with the product".

### Later ingredient check

On a product whose ingredients are not checked, a contributor can cite its accepted ingredients or nutrition photo and choose Appears vegan or Plant-based. That change is tier 2: community-confirmable and automatically acceptable under the milestone 4 rule. Choosing Vegan, or citing no photo, stays tier 3.

## Implementation sequence

1. **Specification.**
   - PRODUCT_MASTER, MODERATION, DATABASE_BASELINE, API, RANKING, ARCHITECTURE and DESIGN_DIRECTION gain milestone 6 sections.
   - AGENTS.md points here.
2. **Data foundation.**
   - Migrations `0019_country_foods` and `0020_quick_additions`, later folded into the version 1 baseline.
   - Schema, the insert-only seed (launch availability and starter shelves) and migration tests.
3. **Per-country catalog and browsing.**
   - Country-scoped reads, search, sitemap and alternates.
   - The not-here-yet page, operator country toggles, proposal acceptance switching the country on, silent shelves, the empty-country home and the ranking page's Suggest link.
4. **Ingredients not checked yet.**
   - The flag's reads and writes, the classification rules, the downgrade rule, the status chip and the tier 2 ingredient check.
5. **Submission contract and lookups.**
   - Optional evidence, new optional fields, four photos, country-scoped food choices and live identity matches.
6. **Add-product rebuild.**
   - The two-step flow, food picker, matches, optional rows, results and the wording pass.
7. **Inline food suggestion.**
   - Linking the suggestion and the submission, continuation on accept or alias, follow-up on reject, operator views and the picker option.
8. **Extras at publication.**
   - Stores in the publication batch; rating and allergen declaration applied after publication with hourly retry.
9. **Suggest a food page.**
   - Simplified fields and the prefill link into Add a product.
10. **Photo drafts.**
    - Picked photos kept in IndexedDB for 24 hours.
    - `blob:` thumbnails, which needs `blob:` added to the image source policy.
11. **Hardening and staging.**
    - Full checks and browser tests, accessibility at 390 px and desktop in both themes, and local captures, which are never committed.
    - Every migration folded into the version 1 baseline, with a reset command for remote databases.
    - The verification record, then staging after approval.

## Configurable defaults

| Control                       | Default                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------- |
| Photos per submission         | 4 (front required; ingredients, back, nutrition optional)                        |
| Bytes per submission          | 40 MiB                                                                           |
| Foods per submission          | 1 primary + 4 more                                                               |
| Stores per submission         | 10                                                                               |
| Submissions per day           | 5 (unchanged)                                                                    |
| Food suggestions per day      | 3, shared by inline and standalone suggestions                                   |
| Identity matches while typing | From 2 characters each in brand and name, 600 ms debounce, search rate limit     |
| Draft lifetime                | 24 hours (session storage for text; IndexedDB for photos)                        |
| Launch food availability      | All six launch countries                                                         |
| New food availability         | The suggestion's country; operator-created foods default to every active country |

## Verification and staging delivery

- **Each checkpoint** passes `npm run check` and its focused integration and browser suites before its local commit.
- **Final verification** covers:
  - `npm run check` and `npm run test:e2e` after a local reset;
  - the version 1 baseline producing exactly the schema of the folded history, and an emptied database migrating back to it;
  - foreign-key checks;
  - proof that Top order and scores are unchanged on the seeded catalog;
  - a sweep proving "Ingredients not checked yet" never reads as "Appears vegan";
  - axe at 390 px and desktop in both themes.
- **The running-app pass**:
  1. adds a front-photo-only product in the United Kingdom;
  2. suggests a food inline and has an operator accept it;
  3. checks Canada's empty-country home;
  4. checks a food that is not on in the United States;
  5. adds rating, store and allergen extras.
- **Staging,** after approval: record a Time Travel bookmark, reset the database to version 1, migrate, seed the demo catalog and images, deploy, and repeat the running-app pass with two accounts.
- **Records.** Evidence, versions and limitations go in `docs/verification/milestone-6.md`. Screenshots are shared for review only; they are never committed or uploaded.
