# Milestone 5: Swap Aisle Redesign

Approved on 2026-10-08. Turn the agreed [design direction](DESIGN_DIRECTION.md) and the canvas's "Round 5 · Screens" page into the public site, through real staging verification, before the production cutover (#31). The starting milestone 4 baseline passes 158 tests in 36 files and 40 desktop and mobile browser tests. Work starts from updated `develop` (`a10dbc9`) on `feature/milestone-five-swap-aisle-redesign`.

## Agreed boundaries

- **Before launch.** This milestone ships before the cutover (#31), which gains it as a prerequisite. The production taxonomy seed (#33) is reshaped to three levels before it runs. Launch catalog entry (#32) continues through the existing submission flow in parallel and is not blocked.
- **Staging only.** No production migrations, secrets, deployment or DNS changes.
- **Design and behavior sources.** Presentation follows the design direction. Behavior follows the amended specification documents. Canvas content (aisles, shelves, foods, products, scores, counts, stores, allergens) is illustrative and never becomes seed or fixture data.
- **Ranking integrity.** Top remains the Bayesian overall-similarity order. Detail sorts, familiarity statistics and the store and Free-from filters only reorder or narrow a view. They never change a Top score, eligibility or rating weight.
- **Cache-safe personalization.** Public pages stay cookie-free and shared-cacheable. Country lives in the URL path. Chosen stores, Free-from allergens and theme are device storage. Stores and allergens reach the server only as normalized query parameters.
- **Not in this milestone:** meal swaps, a "my swaps" list, account-saved avoid lists, illustration or food photography, catalogs for countries other than the United States, store locations or live inventory, structured ingredient transcription and contributor trust (#26).
- Completion means staging verification and documented evidence. Local commits are made per verified checkpoint. Pushes, PRs, issue/milestone changes, merging and production work require separate authorization.

## Defaults

- **Taxonomy shape.** Food → aisle → shelf → food. Aisles and shelves are non-rankable groups; rankable foods are leaves at depth three. Category URLs stay flat (`/us/ground-beef`), so reshaping changes no public URL. A rankable category outside depth three stays reachable by URL and search but is left out of the aisle bar, and the taxonomy workspace flags it. Category proposals choose a shelf. An aisle with one shelf hides the shelf rail.
- **Launch tree** (owner confirms before #33 runs): Meat → Beef (Ground Beef, Beef Burgers), Chicken (Chicken Nuggets), Pork (Bacon); Dairy → Milk (Milk), Butter (Butter); Cheese → Block and shredded (Cheddar, Mozzarella), Soft and spreadable (Cream Cheese); Eggs → Eggs (Eggs). Existing aliases and homepage features carry over. Local and staging data are re-parented with the audited taxonomy tools; production receives the new shape from the seed.
- **Aisle menu.** Each food card shows its first three products in Top order from the existing statistics read model, Early products included with their badge. Foods with fewer than three products say so.
- **Home.** Search with instant answers beside Start with these; Browse every food; Trending now; New and needs ratings; Still waiting for a great swap. Start with these lists the foods whose #1 has the highest Top score among foods whose #1 is past Early, filled from the operator's homepage features while too few qualify. Still waiting lists foods whose best eligible product is below the threshold, then foods with no eligible product. Both are derived from data and never brand-curated or paid.
- **Instant answers.** A public JSON search endpoint over the existing D1 FTS5 index returns matching foods with their #1 product and score, and matching products with their rank. Responses are shared-cacheable per normalized query. The preview beside the results renders from the same response with no extra request.
- **Sort menu.** The existing `view` parameter gains `most-rated` and `detail-<key>` values beside Top, Trending and New. The #1 flag and card appear only for Closest match.
- **Detail scores.** Activate `category_rating_dimensions` and `rating_dimension_values`. A new food starts with Taste and Texture; operators add, rename, reorder and retire dimensions in the taxonomy workspace, and retiring keeps stored answers. Answers are optional, 1–5, edited with their rating and counted only when the rating is counted. A rebuildable `product_category_dimension_stats` table holds answer count and sum per product version, category and dimension. A detail sort orders by mean, puts products under the minimum answers after the rest in Top order and says so. A detail badge ("Best taste") goes to the highest mean above the minimum when that product is not the #1.
- **Last ate the original.** Use the existing `ratings.conventional_recency` column and its five buckets: this week, this month, this year, over a year ago, prefer not to say. People who ate it within a year form the recent-eaters group. Its average appears on product pages only above the minimum, from a rebuildable `product_category_familiarity_stats` table. It never changes rating weight.
- **Allergens.** A `product_version_allergen_declarations` record per formula version (declared, or none declared on the label) with `product_version_allergens` rows (allergen key; Contains or May contain). Declarations are edit proposals of a new kind: tier 2 when they cite the formula's current ingredients or nutrition photo, confirmable by the community, and any disagreement sends them to an operator. A declaration with Contains milk, egg, fish or shellfish is never auto-accepted and opens a classification review. Reformulation starts the new version undeclared. Ingredient and nutrition photo replacement remains tier 3.
- **Free-from filter.** `freeFrom` lists allergen keys from the country's allergen list. A product qualifies only with a confirmed declaration listing none of them as Contains or May contain. Products without a confirmed declaration are left out and counted in a "not confirmed yet" link. Every allergen surface says "Always check the package."
- **Store filter.** `stores` lists retailer slugs active in the country's `retailer_markets`. Several stores combine with OR through `product_retailers`. Each option shows its number of ranked swaps in the current food. Rows name which chosen stores carry the product. Device storage keeps the choice per country. After hydration, a page without parameters applies the saved choice by replacing the URL, and links the client renders carry it forward.
- **Filter URLs.** The server lowercases, de-duplicates, sorts and validates `stores` and `freeFrom`, drops unknown values and redirects non-normalized forms, so cache variants stay bounded. Filtered pages declare the unfiltered page canonical.
- **Countries.** Routes generalize from `us/` to `:country/` using lowercase ISO codes from `countries`; existing `/us/` URLs are unchanged. `/{country}` is each country's home and `/` remains the United States home. The switcher lists every row in `countries` (launch: United States, Canada, United Kingdom, Australia). Switching keeps the current food where it exists, and a product page moves to its food. Countries without rankings say "No rankings in [country] yet" and invite submissions. The device remembers the country, and `/` sends returning visitors to it after hydration. Nothing is inferred from IP.
- **Theme.** System preference by default, with a System / Light / Dark choice in the header stored on the device. A small inline script sets `data-theme` before first paint, with no cookie.
- **Type, icons and logo.** Archivo is self-hosted as a variable woff2 with a metric-compatible fallback. Aisle and food line icons are inline SVG components mapped by category slug, with a generic fallback for new foods. The logo is the tagged wordmark component, and the favicon is the "VA" yellow tile.
- **Site-wide tokens.** `app/styles/site.css` moves to the `--va-*` tokens. Account, contribution, moderation and admin pages adopt the tokens, header and themes and stay readable in dark mode, but keep their current layouts.

## Implementation sequence

### 1. Specification

Amend the documents before behavior changes: PRODUCT_MASTER (§03 navigation and homepage, §05 detail and familiarity display, §08 allergens, §09 store preference), RANKING (§5 dimension aggregates, sorts and badges; §18 the recent-eaters threshold; ranking views), MODERATION (§6 the allergen proposal tier and the classification conflict), DATABASE_BASELINE (allergen, dimension and familiarity tables; the depth-three rule), API (the search endpoint, rating fields, filter parameters and caching) and ARCHITECTURE (device preferences and cache variants). Mark the design direction's §9 items resolved.

### 2. Design foundations

Tokens in both themes, Archivo, the logo, line icons, the theme switch and core components: score label, #1 flag, Early, New and detail badges, vegan status chip, allergen label, chips, sort menu and buttons. Restyle shared layout so every existing page adopts the system before page-level work.

### 3. Countries, the store filter and Free-from parameters

Generalize routes to `:country/`, add country homes and the header switcher with empty-market states, and add the normalized `stores` and `freeFrom` parameter contract with device storage. Free-from options stay hidden until step 8 provides confirmed declarations.

### 4. Taxonomy and aisles

Reshape the seed and local/staging data to three levels, add the depth flag and shelf choice to the taxonomy workspace and category proposals, and build the aisle bar, the desktop aisle menu and the phone aisle page with each food's top three.

### 5. Home

Search with instant answers and preview, Start with these, Browse every food, Trending now, New and needs ratings, and Still waiting, on desktop and phone.

### 6. Category ranking

Summary sentence, sort menu, Sold at and Free-from filters, the #1 card, ranked rows with badges, detail mini-scores and allergen line, unrated products and the aisle sidebar.

### 7. Product page

Five photo slots, name, vegan status and allergen label, the score card with rating count, recent-eaters score and detail scores, Commonly found at with store toggles, the rating form, notes, Also ranked for, other swaps and product facts.

### 8. Allergens

Declaration tables and migration, the proposal kind and confirmation flow, operator review and the classification conflict, product display and the Free-from filter.

### 9. Detail scores and last ate the original

Dimension management, the optional rating-form follow-ups including pending-rating recovery, the API fields, aggregate tables in the ranking rebuild, detail sorts and badges, and the recent-eaters score.

### 10. Hardening

Visual comparison against the canvas at 390 px and desktop in both themes, contrast checks for every token pair, keyboard and screen-reader paths through the aisle menu, search, sort and filters, cache behavior of filtered URLs, and updates to #31, #33 and the launch checklist.

## Configurable defaults

| Control                  | Default                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Start with these         | 6 foods; the #1 must be past Early (10+ counted ratings)                                      |
| Still waiting            | 6 foods; best eligible product below 3.5/5, then foods with no eligible product               |
| Aisle menu               | 3 products per food                                                                           |
| Instant answers          | From 2 characters, 150 ms debounce, 5 foods and 5 products                                    |
| Detail sort and badge    | 5 answers per dimension                                                                       |
| Recent-eaters score      | 10 counted ratings from people who ate the original within a year                             |
| Stores per filter        | 10                                                                                            |
| Free-from list (US)      | Milk, egg, fish, crustacean shellfish, tree nuts, peanuts, wheat, soy, sesame                 |
| Allergen auto-acceptance | The milestone 4 tier 2 rule; Contains milk, egg, fish or shellfish always goes to an operator |
| New food dimensions      | Taste, Texture                                                                                |
| Launch countries         | United States, Canada, United Kingdom, Australia                                              |

## Verification and staging delivery

Each checkpoint passes `npm run check` and focused integration and browser suites before its local commit. Browser tests run axe at 390 px and desktop widths in both themes. Final verification runs `npm run check`, `npm run test:e2e`, fresh and upgrade migrations, foreign-key checks, ranking/dimension/familiarity rebuild equivalence, proof that detail sorts, familiarity and filters leave Top unchanged, and shared-cache HITs for filtered and unfiltered URLs. Before staging migration, capture a Time Travel bookmark. Deploy staging only and exercise rating with details, allergen proposal and confirmation, and country, store and Free-from flows with two distinct accounts. Record evidence, versions, screenshots in both themes and sizes, and limitations in `docs/verification/milestone-5.md`.

## Execution contract

Continue through implementation, verification, fixes, staging deployment and acceptance evidence. Preserve ranking integrity, raw ratings, formula history, privacy/cache separation, existing contributions and production. If access or a material conflict blocks a gate, finish independent work and report the exact required input without claiming completion.
