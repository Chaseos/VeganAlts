# Milestone 7: Recipe Lines, Tastiest and United States Launch Foods

The owner agreed the direction on 2026-10-11, revised it on 2026-10-12, and confirmed the remaining defaults the same day.

Milestone 7 changes what a ranking ranks. Each row becomes a brand's **recipe line**: one base recipe together with all its flavors, with Original treated as one more flavor.

It also:

- adds a second ranking, **Tastiest**, beside Closest to the original;
- lets search find brands, each with a page of that brand's products in the country;
- reorders Add a product around the food, the brand and that brand's existing lines;
- simplifies the taxonomy to two levels, universal aisles and the foods under them;
- sets the United States launch foods, so the owner can fill the catalog with direct replacements for meat, fish, dairy, cheese, eggs, and animal-based condiments, dips, sweets and baked goods.

The plan and the implementation share one branch, `docs/milestone-seven-recipe-lines-plan`, and one pull request (#49), at the owner's request on 2026-10-12. The launch foods can ship first on their own (checkpoint 2), so Eggnog is in place for the season.

## Why

**Market research (2026-10-11).** Six parallel checks covered:

- brand sites;
- the online catalogs of Whole Foods, Kroger, Target, Sprouts, Walmart and Trader Joe's;
- 2025–26 trade press.

US plant-based retail fell to about $7.9B in 2025, and meat and seafood fell 10%. Many brands and products have left the market since 2023.

Most of what remains is sold as a few base recipes in several flavors:

- Daring Original, Cajun and Teriyaki;
- Beyond Mild and Hot Italian;
- Silk's eleven creamers;
- Ben & Jerry's sixteen oat-based pints;
- yogurts sold mostly in fruit flavors.

**How flavors are handled today.** A "specialty flavor" is stored with `ranking_eligible = 0` for its foods (`submission-repository.ts:628`). That has three effects:

- **It can't be rated there.** The rating snapshot refuses it (`ratings/infrastructure/d1-repository.ts:68-80`).
- **It never appears on the food page.** It shows up only as "related" on another product's page.
- **Every rateable flavor has to earn its own rating sample.** Yogurt, ice cream and creamer, which are bought mostly flavored, would look thin, and each flavor would sit near the 3.5 prior until it had about ten ratings of its own.

**Families exist but go unused.** Product families are in the schema, but only the seed creates them. No application code inserts one.

**Similarity is the only ranking.** A vegan product that tastes better than the original, without tasting like it, has no way to show it.

**Adding a product misses obvious matches.** On staging, "Impossible Meat" found nothing, although Impossible Beef was listed. Three things cause this:

- **Duplicate matching compares only words in the product name** (`lookup-repository.ts` `candidates`). A two-word name needs two shared words.
- **The brand narrows the search only on an exact match.** A brand narrows the search only when the typed text exactly matches a stored brand or alias.
- **The brand field is a plain browser suggestion list** (a `datalist` in `basics-step.tsx`).

**Search cannot find a brand.** Search returns foods and products only, so "Trader Joe's" cannot show everything Trader Joe's makes.

## Owner decisions (2026-10-11)

- **Rank recipe lines, not products and not brands.**
  - A line is one brand's base recipe in one country, together with its flavors.
  - Most foods still read like a list of brands. A brand appears twice only when it sells two genuinely different recipes, such as Impossible Beef and Impossible Lite Beef.
- **The line test is "a changed base, or just a flavor on top?"**
  - **A changed base is its own line:**
    - Lite or reduced-fat versions;
    - named tiers (Ultimate, Extra Crispy, Supreme, Next-Gen);
    - soy-free or gluten-free versions;
    - a different oil or base (olive vs avocado oil, almond vs oat);
    - shapes made from different recipes (shreds vs slices).
  - **A flavor on top stays in the line:** spicy, maple, Italian herb, strawberry, chipotle.
  - **When unsure, keep them separate.** Separate lines still rank, and lines can be merged later.
  - **Reformulations stay formula versions.** A line is only for two recipes on sale at the same time.
- **Rate the flavor, rank the line.**
  - People rate the exact product they ate.
  - A flavored product is rated against the conventional food in the same flavor.
- **One vote per person per line.**
  - Someone who rates several flavors of a line counts once, as the average of their ratings.
  - The line's score uses the existing sample-size-adjusted (Bayesian) formula over people.
  - The score is never the best flavor's score.
- **Flavor scores stay visible.** Each flavor's own score is shown inside its line's card once the flavor has enough ratings.
- **Every flavor counts by default.** An operator can exclude a flavor that has no conventional equivalent, using the existing per-food eligibility switch.
- **Build lines before entering products.** Nothing is released and the catalog is demo data, so no product needs regrouping later.

## Owner decisions (2026-10-12)

**Foods**

- **Two levels: aisle › food.** Aisles such as Beef, Chicken, Milk, Cheese, Eggs and Condiments are universal.
- **Each food has exactly one aisle, and an aisle names a kind of product, not an occasion.**
  - The test is whether a food could reasonably sit in two aisles. Breakfast fails it, because bacon, sausage, eggs and yogurt already have aisles. Desserts and Bakery pass.
  - Search reaches a food from any of its names.
  - Cross-cutting lists such as "Breakfast swaps" would be curated lists, like the home page's featured foods, never aisles.
- **No minimum size for foods.** No product-count bar (owner, 2026-10-12). The foods under each aisle are specific and vary by country. Shelves are removed.
  - **Revised 2026-10-16 (owner): a food is added when its first product is found,** and the launch foods still without a product after the photo batches were removed for now: Pepper Jack, Spinach Artichoke Dip, French Onion Dip, White Chocolate, Chocolate Hazelnut Spread, Brownies, and Brioche and Rolls. They are on the watch list.
- **Butter stays one food,** covering sticks and tubs.
- **Each condiment is its own food:** Mayonnaise, Ranch Dressing, Caesar Dressing and Worcestershire Sauce.
- **Cheese is one aisle.** All its foods sit directly under it, including Cream Cheese. Swiss Cheese and Feta joined on 2026-10-15; Ricotta, Cottage Cheese and other cheeses join as products are found.
- **Aisles follow how a food is used, not what the original is made from.** Mayonnaise stays a condiment though the original is egg-based, and Tzatziki is a dip though it is made with yogurt. Every US grocery site checked shelves them this way. Search reaches a food from either side: "yogurt dip" finds Tzatziki and "egg-free mayo" finds Mayonnaise.
- **A Dips and spreads aisle** holds Queso and Tzatziki. Spinach Artichoke Dip and French Onion Dip were planned too, and wait for their first product.
  - Queso moves there from Cheese, because no store files it under cheese.
  - Ranch Dressing stays in Condiments and covers "dressing and dip" bottles.
  - The aisle stays savory. Sweet spreads belong with the sweets.
- **Sweets get two aisles, Chocolate and Candy, split by what each sweet is.**
  - Anything where chocolate comes first goes in Chocolate: Milk Chocolate, Chocolate Chips, Peanut Butter Cups, Candy Bars and Candy-Coated Chocolates. White Chocolate and Chocolate Hazelnut Spread wait for their first product.
  - Milk Chocolate and White Chocolate are separate foods.
  - The rest of the candy goes in Candy: Gummy Candy, Marshmallows and Caramels.
  - "Candy" is the US word. The UK ("sweets") and Australia ("lollies") get their own names when aisle names can differ by country (milestone 8). Until then the aisle shows only in the United States, where its foods are.
  - Gummy Candy ranks gummies made without gelatin, the swap for gelatin gummies such as gummy bears. That includes gummies that were always gelatin-free, such as US Sour Patch Kids: most gummies contain gelatin, so finding ones that don't is the value (owner decision, 2026-10-15; this replaces the earlier rule that always-vegan candy is not a swap).
  - Cookie butter is left out. Biscoff and Trader Joe's are already vegan, so there is no original to replace.
- **Desserts and Bakery are two aisles** (owner decision, 2026-10-15). They started as one Bakery and desserts aisle, because a store's bakery department holds cakes, cookies and bread together.
  - Desserts holds Cookies, Cake, Pies and Cheesecake, and Pudding Cups. Brownies wait for their first product; brownie mixes are Baking Mixes.
  - Bakery holds Muffins, Cinnamon Rolls and Baking Mixes. Brioche and Rolls waits for its first product.
  - Cookie dough is part of Cookies, not a food of its own (owner decision, 2026-10-15).
  - **Thin foods are broadened rather than held back.** A food can start with one brand when it is a distinct thing people look for. Pies and Cheesecake starts with Daiya's cheesecakes and gives the next pie or cheesecake a place to go.
  - **Format doesn't split a food.** A frozen pie and a bakery pie are the same food, as Butter covers sticks and tubs. A brand's frozen pie and a store's bakery pie are separate lines anyway.
  - Pudding Cups is a dessert, so it sits in Desserts rather than with the candy.
  - **Baking Mixes is its own food,** apart from finished goods. A mix bakes at home, so it is compared with what a regular box mix bakes. It covers cake, brownie, cookie and muffin mixes until each has enough products of its own.
    - Many regular box mixes contain no egg or milk; the baker adds those. For those mixes, the swap is Eggs for Baking.
    - Pancake and waffle mixes wait with Frozen Waffles.
  - Banana bread is an alias of Cake (a loaf cake) until it has products of its own.
  - Breads that are usually vegan already, such as sandwich bread, bagels and sourdough, are not swaps.
  - Products from a chain's own bakery count, with the store as the brand, and so do regional brands that chains carry. Independent local bakeries stay out, like restaurant menus.
- **Yogurt and Greek Yogurt are separate foods,** just as Ground Beef and Beef Burgers are.
- **Eggnog and Half-and-Half are their own foods.** Eggnog is needed before the holiday season.
- **Seafood starts with Fish Fillets,** breaded included. The fish foods need more thought once more products exist.
- **Detail questions.**
  - Milk's "In coffee" becomes "In hot drinks", because many people take milk in tea.
  - Milk and Eggs gain Baking.

**Lines and ratings**

- **A discontinued flavor leaves its line's score.**
- **Every product, and so every line, belongs to one country.** The same brand in another country is a different record, because formulas, factories and even same-named brands differ.
- **Tastiest is a second ranking.** It sits beside Closest to the original, and people can switch between the two. A vegan eggnog can be the tastiest without being the closest.
- **Detail questions stay simple.** The main foods keep their extra questions (the ten launch foods, such as Melt and Stretch for Mozzarella), and every other food asks only Taste and Texture.

**Contributing**

- **Contributing should be as hands-off as possible.**
  - Adding a flavor of an existing line needs only a front photo of the product, and does not wait for review.
  - Reports catch mistakes: "This flavor doesn't exist", "Not part of this line" or "Discontinued".
- **Adding a product starts with the food and the brand.**
  - It then shows what that brand already has there.
  - The contributor picks the product if it is listed, or adds a new flavor of one of its lines with most details already filled in.
  - Brand and product matching must tolerate loose or partial names.

**Ordering, browsing, trending and seasons**

- **Popularity orders the aisles and foods in each country.** Most ratings come first. A country without ratings falls back to a default store order.
- **Browse every food shows aisle cards.** Each card holds an aisle's three most popular foods and "See all" when there are more. A card is only as tall as its foods; a one-food aisle isn't padded out to match its row.
- **One Foods menu on desktop.** A "Foods" button in the header row opens every aisle, with the aisle under the pointer or focus showing its foods beside them, so the header stays one row with a wider search however many aisles a country has (owner decision, 2026-10-12). A mouse opens it by resting on it. Touch and the keyboard open it on press.
- **A Trending tag marks rising swaps everywhere.** A line that is trending in its food carries a Trending tag in every other list and on its product page, the way New already does.
- **Trending looks back a quarter.** People shop every week or two and may check the site every month or two, so what rose over the last 90 days is still news to them.
- **Seasonal foods and products are tagged.** Eggnog and Turkey Roast are seasonal foods with their months, and any product can carry a Seasonal tag.
- **Eggs for Baking is its own food.** Baking powders are not for scrambling. Fried and hard-boiled eggs join the watch list.
- **Deli meats sit in their animal's aisle,** named "[Animal] Deli Slices". Turkey Deli Slices starts now.

**Search and countries**

- **Search finds brands as well as foods and products.** Searching "Trader Joe's" opens the brand's page, which lists all its products in that country across every food.
- **A new food or product lands in the country being viewed.** The country is preselected from the page the contributor starts on, as milestone 6 already does.
- **Many more countries, sooner.** The main countries for vegan shoppers, judged by market and population, are planned as [milestone 8](#next-milestone-8-countries). English is used everywhere for now. Country and language become separate settings, and translations come later.
- **New aisles have a path everywhere.** Operators add an aisle for any country with the taxonomy tools, and it shows only where it holds a food. Milestone 8 lets contributors suggest new aisles and gives aisles per-country names.
- **The launch foods are a starting set, not a fixed list.** Foods grow through suggestions, and each country grows its own. Japan's foods may look nothing like the United States'. The aisles are the macro categories shared by every country.

## Agreed boundaries

- **Staging only.** No production migrations, secrets, deployment or DNS changes.
- **Ranking integrity.**
  - Canonical ratings stay `user + formula version + food`.
  - The per-flavor aggregates (`product_category_stats`, detail and familiarity statistics) stay and keep their meaning.
  - Line scores are derived data, rebuildable from canonical rows.
  - The prior mean and strength are unchanged.
  - With exactly one flavor per line, every Closest score, rank and order is identical to today's.
- **Tastiest never changes Closest.** Closest to the original stays the default ranking, the home page's ranking and the primary signal.
- **Additive data.**
  - The schema changes were built as migrations `0002_aisle_order_and_seasons.sql`, `0003_recipe_lines.sql` and `0004_line_discovery.sql`, then folded into version 1 before staging (checkpoint 10).
  - No parent table (`products`, `product_versions`, `categories`) is rebuilt; columns are added at the end of each table, as `ALTER TABLE` placed them.
  - Derived product-level trending tables may be replaced, because they are rebuildable.
- **Moderation automation stays advisory.** Deterministic checks run first, and a provider failure routes to review, never approval.
- **Not in this milestone:**
  - pages or URLs of a line's own (flavors keep their product pages);
  - store pages listing what is commonly found at a store;
  - rating a line directly;
  - foods per flavor (such as "Strawberry Yogurt");
  - new countries, translations and a language setting (milestone 8 and later);
  - seasonal scheduling of foods;
  - changes to the Bayesian constants;
  - barcode scanning;
  - production deployment.
- **Completion and approvals.** Completion means local and staging verification with documented evidence. Each verified checkpoint gets one local commit. Pushes, PRs, issue and milestone changes, staging migrations and deployments, merging and production work each need separate authorization.

## Defaults

### Lines in the data

- **A line is a product family.**
  - `product_families` keeps its table and becomes required: every product belongs to exactly one family.
  - It gains a country, so all of a family's products share its brand and its country.
- **Flavor label.**
  - `products.flavor` is new and optional: trimmed, at most 40 characters and never blank.
  - Leaving it empty marks the line's original or unflavored version, which displays as "Original".
  - The full product name (`products.name`) is unchanged.
- **Line name.**
  - A line is named by the family's `canonical_name`.
  - A line with one product displays that product's name.
- **Migration `0003_recipe_lines.sql`:**
  - adds `products.flavor`, `product_families.country_id` and `ratings.enjoyment`;
  - creates a family for every product that has none, taking the brand, country and name from the product and building the slug from the country code and the product slug;
  - splits any family whose products span countries into one family per country;
  - adds triggers that enforce:
    - a product is inserted with a family and can never lose it;
    - a product's brand and country equal its family's;
    - a family that still has products cannot be deleted;
    - flavor length and blankness;
    - enjoyment between 1 and 5;
  - adds the enjoyment count, sum and score to `product_category_stats`;
  - adds `family_category_stats`, one row per family and food:
    - for Closest: people, the sum of each person's mean, the raw mean and the Bayesian score;
    - the same four figures for Tastiest;
    - tried people, recent people and the lead product;
  - adds `family_category_dimension_stats`, one row per family, food and dimension: people who answered and the sum of their means;
  - adds the indexes for line reads and brand pages (`products(brand_id, country_id)`).
- **Migration `0004_line_discovery.sql`:**
  - adds `family_category_daily_stats` (one row per line, food, day and person over the last 180 days: the 90-day window and the baseline before it) and `family_category_trends`;
  - drops `product_category_daily_stats` and `product_category_trends`, once Trending reads lines.

### Line scores

- **Eligible flavor.** The existing rules apply unchanged (`read-policy.ts`): current formula, active, not Under Review, ranking-eligible in that food, in an active country.
- **Discontinued flavors.**
  - A discontinued flavor is not active, so marking it discontinued removes it from its line's score, card and flavor count in the same transaction.
  - Its ratings are kept, and count again if it returns with the same formula.
  - A line whose flavors are all discontinued leaves the ranking.
- **Closest score of a line in a food:**
  1. For each person, take the mean of their counted similarity ratings of the line's eligible flavors in that food.
  2. `v` is the number of such people, and `R` is the mean of their means.
  3. score = (v / (v + m)) × R + (m / (v + m)) × C, with the configured `C` and `m`.
- **Tastiest score:** the same calculation over the optional enjoyment answers. It has its own configurable `C` and `m`, which start at 3.5 and 10.
- **Other line figures:**
  - **Tried** is the number of distinct people with a trial on an eligible flavor.
  - **Recent** is the number of distinct people who rated one in the last 7 days.
- **Order.** Each ranking sorts by full-precision score descending, then people descending, then the lead flavor's product ID. With one flavor per line, Closest is exactly today's order.
- **Labels and sorts:**
  - Early applies at 1–9 people, counted separately for each ranking.
  - Most rated sorts by people.
  - "Start with these" and "Still waiting" use Closest.
- **Lead flavor.** It supplies the card photo and title link.
  - It is the eligible flavor with the most counted ratings in that food.
  - Ties go to the flavor's own Closest score, then the earliest published.
  - It is stored on the stats row.
- **Flavor scores** come from `product_category_stats`.
  - Inside a card, each flavor shows its score in the current ranking once it has 5 answers, otherwise "Too few ratings yet".
  - Flavors with a score are listed first, by score; the rest follow by ratings, then flavor name.
- **Detail questions.**
  - New foods ask Taste and Texture, the existing default.
  - The ten launch foods keep their lists, such as Melt and Stretch for Mozzarella.
  - A person's answer per dimension is the mean across the flavors they answered for.
  - A line's detail mean is shown, sorted on or awarded at 5 people.
  - Detail sorts and badges read "Closest taste" and "Closest texture", so they are not confused with Tastiest.
- **Product-page statistics stay per flavor:** familiarity, the recent-eaters score and "How people rated it".
- **Trending.** Trending looks back a quarter, and each person counts once per line and food across the whole window.
  - **Recent activity** covers the last 90 days, with each day's weight halving every 30 days.
  - **The baseline** is the mean daily activity over days 91–180.
  - **Threshold.** A line trends only with at least three people in the 90-day window.
  - **Per-person rows.** The hourly rollup keeps one row per line, food, day and person (`family_category_daily_stats`) for 180 days, so the window can be deduplicated.
  - **Counting.** A person's activity counts on the day of their latest activity in the window, as a rating, a trial or a comment, whichever weighs most. Their similarity is their mean across the line's flavors in the window.
  - One person rating three flavors on three days adds one person, not three events. The milestone 4 formula is otherwise unchanged.
  - **Trending tag.**
    - A line among the top 3 by trending score in its food (a positive score, at least three people in the window) carries a Trending tag.
    - The tag appears on its row in Closest, Tastiest, Newest, the detail sorts and Most rated, on home lists and on its product page.
    - The Trending view itself needs no tag. The tag never changes a rank or score.
- **New.** New lists lines whose first publication in that food falls within 90 days, newest first.
  - A line's first publication is the earliest `published_at` of any flavor the line has had in that food, eligible or not (discontinued, excluded or archived included). It never moves later.
  - Neither a new flavor nor a discontinued oldest flavor brings an old line back into New.
  - Lines and flavors published within 30 days carry the New tag; on a flavor it reads as a new flavor.
- **Filters** (stores and Free-from).
  - A line is shown when any eligible flavor matches.
  - Its card lists the matching flavors and says "2 more flavors don't match your filters."
  - Scores and ranks never change.
  - Store options count lines.
- **Refresh.** Line rows are recomputed in SQL from canonical rows inside the same D1 batch as:
  - rating writes and exclusions (`ratings/infrastructure/d1-repository.ts` `commit`, `RatingsService.setCounted`);
  - category-merge rebuilds (`rebuildVersions`) and the integrity rebuild (`rebuildPage`, `scripts/rebuild-rankings.ts`);
  - every catalog decision that changes a product's family, current formula, lifecycle, classification, food membership or eligibility. That includes submission publication, `patchStatements`, duplicate consolidation and its reversal.

  Because a D1 batch is one transaction, concurrent writes to two flavors of one line cannot lose each other's ratings. The hourly job only re-derives lines whose "people this week" changes as ratings turn seven days old; the integrity rebuild re-derives every line.

- **Reference implementation.** A pure function in `server/ranking/domain` defines the line math for both rankings. Tests prove that the SQL, the reference function and the integrity rebuild agree.

### Rating

- **Closest question.** Similarity stays the one required answer, saved on tap.
  - A flavored product asks "Tried it? How close is it to [food] in the same flavor?"
  - Unflavored products keep the current question.
- **Tastiest question.** "How tasty is it, whether or not it's like the original?" appears beside the similarity question.
  - It is optional and saves on tap; tapping the chosen answer again clears it.
  - Its scale runs: 1 Not for me, 2 It's OK, 3 Good, 4 Really good, 5 Delicious.
- **Detail and familiarity questions** follow, as today.
- **The same order applies** to the rating row in Add a product.
- **The ranking methodology page** explains lines, one vote per person and the two rankings.

### Public pages

- **Ranking toggle.** A food's ranking page (the list of swaps for that food, such as `/us/ground-beef`) opens on **Closest to the original**.
  - A two-option toggle above the list switches to **Tastiest** (`view=tastiest`).
  - The other sorts stay in the sort menu: Trending, Newest, Closest taste and the other details, and Most rated.
  - Each ranking has its own featured #1.
  - A line that is #1 in Tastiest but not in Closest carries a "Tastiest" badge in the Closest list.
- **Food page rows are lines:**
  - rank, line name, brand and the lead flavor's photo;
  - score, people, Early and New;
  - detail badges and stores.
- **Allergens** stay on the row for a single-flavor line. Otherwise they appear per flavor.
- **"3 flavors" disclosure.** A multi-flavor line has a disclosure button (`aria-expanded`) that lists each flavor's label, score or "Too few ratings yet", allergens and New tag.
  - Each flavor links to its product page.
  - Discontinued flavors are not listed. Their pages stay and say they are discontinued.
- **A single-flavor line has no disclosure,** and its row links to the product, as today.
- **The featured #1 and the `ItemList` structured data** use lines, linking each line's lead flavor.
- **"Not rated yet"** lists lines with no counted ratings.
- **Other surfaces read lines:** the aisle panel's first three, home modules, the food sidebar, instant answers, the search page and store counts.
  - A product found by search shows its line's rank.
- **Product page:**
  - **The rank card describes the line** in both rankings, for example "Closest #2 · 4.3 and Tastiest #1 · 4.6 of 14 in Yogurt", with people counts.
    - When the line has several flavors, it adds this flavor's own scores.
  - **"Also ranked for"** shows the line's ranks.
  - **"Other swaps"** leaves out the product's own line.
  - **"Other flavors"** lists the line's other flavors, with **Add another flavor**.
  - **Companion and successor links** stay. There is no cross-country section, because lines are per country.
- **Wording.** People see flavors and line names. "Line" and "family" stay internal terms.

### Brand search and brand pages

- **Search covers brands as well as foods and products.**
  - Instant answers add a Brands group, showing up to 3 brands with their product counts in the country.
  - The results page adds a Brands section.
  - Brand matching uses the same typo-tolerant matcher as Add a product: one shared helper on brand names and other names.
- **Brand page.** It lives at `/{country}/brand/{slug}`, and `brand` becomes a reserved food slug.
  - It shows the brand's name and "N products in [country]".
  - Its lines are grouped by aisle › food. Each line shows its flavors and its Closest and Tastiest ranks in that food, linking to the food and to each flavor.
  - It ends with **Add a product from [brand]**, which opens Add a product with the brand chosen.
  - It is shared-cacheable and tagged per brand and country. A product change purges its brand's page.
  - A brand with no products in a country renders "No [brand] products in [country] yet" with `noindex` and an add link.
  - Brand pages with active or under-review products in a country are in the sitemap, the same products the page counts.
- **One read for both uses.** The brand page and Add a product's "Already listed from [brand]" use the same read.

### Add a product

- **Step 1, "What did you find?", runs in this order:**
  1. **Food.** The existing searchable picker, with inline suggestion of a missing food.
  2. **Brand.** An accessible combobox replaces the browser suggestion list.
     - From 3 characters (owner, 2026-10-13) it suggests brands whose name or other names start with any typed word, contain the typed text, or are within two typos of it, found through a trigram index of brand names.
     - Each suggestion shows how many products the brand has in the country.
     - The last option adds the typed text as a new brand.
  3. **"Already listed from [brand]."** This appears once the food and brand are chosen.
     - It lists the brand's lines in the country, this food first. Each line shows its flavors, and each flavor has **That's it, rate it**, which opens its product page at the rating.
     - The brand's lines in other foods follow, collapsed.
     - Each line offers **Add a new flavor of [line]**, and the list ends with **Something else from [brand]**.
     - A new brand, or a brand with nothing listed, skips straight to the product fields.
  4. **Product fields.** These depend on the choice:
     - **A new flavor of a line.** The food, brand and line are fixed. It asks for:
       - the flavor (required);
       - the product name, prefilled as "[line name], [flavor]" and editable;
       - the front photo.
     - **Something else.** It asks for:
       - the product name;
       - an optional flavor ("Leave blank if it's the original or plain version");
       - the front photo.

       A flavored new product also asks for "Name without the flavor", prefilled by removing the flavor's words from the product name.
- **Looser duplicate matching.**
  - While a new product's name is typed, "Is it one of these?" lists similar products in the country from any brand. The brand matches loosely, and one shared word of three or more letters is enough (today a two-word name needs two). "Impossible Meat" therefore lists Impossible Beef.
  - The looser matching only widens what is shown while typing. The near-duplicate hold keeps the milestone 6 rule.
  - Products already in the line the contributor chose never count as near-duplicates, because a sibling flavor shares the line's words by design.
  - Exact identity still blocks publication.
- **Step 2, "Add more (optional)",** keeps its rows: rating (both questions), ingredients, allergens, stores, more photos and other foods it replaces.
  - The variants row is removed, because the line is chosen in step 1.
  - A companion or successor link moves into the product's edit proposals.
- **Two read-only lookups, on the search rate limit:**
  - brand suggestions;
  - a brand's lines and flavors in a country.
- **Add another flavor.** On a product page, this opens step 1 with the country, food, brand and line already chosen. Only the flavor, name and photo are left to fill in.
- **Country.** Every product belongs to the one country it is added in.

### Moderation

- **Hands-off by default.**
  - Joining an existing line, starting a new one and giving a flavor label never hold a submission on their own.
  - Every submission still needs its front photo, and goes through the deterministic checks and the automated photo check as today.
  - Near-duplicates, an animal-allergen declaration and a suggested food still hold, as in milestone 6. Flavors in the line the contributor chose are exempt from the near-duplicate hold.
- **Report reasons.** Product reports gain "This flavor doesn't exist" and "Not part of this line", beside the existing reasons such as discontinued, duplicate and wrong food.
- **Submissions.**
  - Submissions always write `ranking_eligible = 1`, and the specialty-flavor checkbox is removed.
  - Contributions can no longer create `variant` or `specialty_flavor` relationships.
  - Companion and successor links remain as edit proposals, limited to the product's own country.
- **Operator line tools** sit on the product's moderation view:
  - **Move to line:** an existing line of the same brand and country, or a new line with a name.
  - **Rename line.** Like a move, it is an action on the product it was made from (`/admin/moderation/products/:id/line-name`), so the existing reversal, which reverses product actions, undoes it.
  - Both are tier 3. Each is audited in `moderation_actions` with before and after, and is reversible.
  - A move refreshes both lines' scores and purges both lines' pages.
- **Proposal tiers.**
  - A `relationships` proposal that changes a product's family is tier 3.
  - `rename` gains an optional flavor and stays tier 2.
- **Exact identity** is unchanged. Flavor words are already part of a product's identity key, so two flavors of a line are never mistaken for duplicates.

## United States launch foods

### Two levels: aisle and food

The taxonomy becomes two levels below the root: **aisle › food**. It replaces the milestone 5 shape of aisle › shelf › food and removes shelves.

- **The aisles are universal.** There are 23 of them, the same in every country. On 2026-10-15 Pizza was added and Bakery and desserts split into Desserts and Bakery; on 2026-10-16 Toaster Pastries, Meals and Sauces were added.
- **Foods sit directly under an aisle.** They can be as specific as each country needs.
- **Aisles stay non-rankable groups, and foods are the rankable leaves.**
- **An aisle holding one food of its own name is silent in breadcrumbs,** so "All foods / Eggs" never reads "All foods / Eggs / Eggs".
- **Slugs.** An aisle whose name is also a food's takes `-aisle` in its slug (`milk-aisle`, `eggs-aisle`).
- **Order.** See [Aisle order, browsing and seasons](#aisle-order-browsing-and-seasons).
- **Desktop Foods menu.** Desktop opens aisles from the Foods menu in the header row; phones keep the sideways-scrolling aisle chips.

| Aisle            | Slug                     | US foods at launch                                                                                                              |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Beef             | `beef`                   | Ground Beef, Beef Burgers, Meatballs, Hot Dogs, Steak, Beef Deli Slices                                                         |
| Chicken          | `chicken`                | Chicken Nuggets, Grilled Chicken Strips, Chicken Patties, Chicken Tenders, Boneless Wings, Chicken Bites                        |
| Pork             | `pork`                   | Bacon, Breakfast Sausage, Chorizo, Italian Sausage, Dinner Sausages                                                             |
| Turkey           | `turkey-aisle`           | Turkey Roast, Turkey Deli Slices                                                                                                |
| Lamb             | `lamb-aisle`             | none yet (hidden until a food has a product)                                                                                    |
| Fish and seafood | `fish-and-seafood`       | Fish Fillets                                                                                                                    |
| Milk             | `milk-aisle`             | Milk, Chocolate Milk, Eggnog, Bottled Lattes                                                                                    |
| Cream            | `cream-aisle`            | Coffee Creamer, Half-and-Half, Sour Cream, Whipped Cream, Heavy Cream                                                           |
| Butter           | `butter-aisle`           | Butter                                                                                                                          |
| Yogurt           | `yogurt-aisle`           | Yogurt, Greek Yogurt                                                                                                            |
| Ice cream        | `ice-cream-aisle`        | Ice Cream                                                                                                                       |
| Cheese           | `cheese`                 | Cheddar, Mozzarella, Smoked Gouda, American Cheese, Mexican Blend, Parmesan, Swiss Cheese, Feta, Cream Cheese                   |
| Eggs             | `eggs-aisle`             | Eggs, Eggs for Baking                                                                                                           |
| Condiments       | `condiments`             | Mayonnaise, Ranch Dressing, Caesar Dressing, Worcestershire Sauce                                                               |
| Dips and spreads | `dips-and-spreads`       | Queso, Tzatziki                                                                                                                 |
| Chocolate        | `chocolate`              | Milk Chocolate, Chocolate Chips, Peanut Butter Cups, Candy Bars, Candy-Coated Chocolates                                        |
| Candy            | `candy`                  | Gummy Candy, Marshmallows, Caramels                                                                                             |
| Desserts         | `desserts`               | Cookies, Cake, Pies and Cheesecake, Pudding Cups                                                                                |
| Bakery           | `bakery`                 | Muffins, Cinnamon Rolls, Baking Mixes                                                                                           |
| Toaster Pastries | `toaster-pastries-aisle` | Toaster Pastries (added 2026-10-16)                                                                                             |
| Pizza            | `pizza-aisle`            | Pizza (added 2026-10-15)                                                                                                        |
| Meals            | `meals`                  | Mac and Cheese, Skillet Meals, Jamaican Beef Patties, Breakfast Burritos, Lasagna, Cheese Ravioli, Dumplings (added 2026-10-16) |
| Sauces           | `sauces`                 | Alfredo Sauce, Creamy Pasta Sauce, Pesto, Vodka Sauce, Gravy, Bouillon (added 2026-10-16)                                       |

### The 64 foods

The seed starts the United States with 64 foods: the 10 existing launch foods, which stay on in all six launch countries, and 54 new foods, switched on in the United States only. This is a starting set, not a fixed list. Foods are added through suggestions, and each country grows its own.

Counts are distinct US recipes in mainstream chains as of October 2026, excluding sizes. They are estimates, and store brands are the least confirmed.

| Aisle            | Food                      | Status                                      | ~US recipes       | Other names                                                               |
| ---------------- | ------------------------- | ------------------------------------------- | ----------------- | ------------------------------------------------------------------------- |
| Beef             | Ground Beef               | existing; gains crumbles                    | ~10               | + beef crumbles                                                           |
| Beef             | Beef Burgers              | existing                                    | largest format    | —                                                                         |
| Beef             | Meatballs                 | new                                         | ~6                | meatless meatballs                                                        |
| Beef             | Hot Dogs                  | new                                         | ~6                | franks, frankfurters, wieners, veggie dogs                                |
| Chicken          | Chicken Nuggets           | existing                                    | 8–10              | —                                                                         |
| Chicken          | Grilled Chicken Strips    | new                                         | 9–10              | chicken strips, chicken pieces, chick'n strips                            |
| Chicken          | Chicken Patties           | new                                         | 5–7               | chicken fillets, chicken sandwich patties                                 |
| Chicken          | Chicken Tenders           | new                                         | ~5                | chicken fingers, tenders                                                  |
| Chicken          | Boneless Wings            | new                                         | ~7                | buffalo wings, chicken wings, wings                                       |
| Pork             | Bacon                     | existing; thin                              | ~3–4              | —                                                                         |
| Pork             | Breakfast Sausage         | new                                         | 10+               | sausage links, sausage patties                                            |
| Pork             | Chorizo                   | new                                         | ~6                | soyrizo, Mexican chorizo                                                  |
| Pork             | Italian Sausage           | new                                         | ~5                | sweet Italian sausage, mild Italian sausage                               |
| Turkey           | Turkey Roast              | new (seasonal Oct–Dec)                      | 5–6               | holiday roast, Thanksgiving roast                                         |
| Turkey           | Turkey Deli Slices        | new                                         | 4–5               | turkey slices, deli turkey                                                |
| Fish and seafood | Fish Fillets              | new; breaded, plain and sticks              | 3 at chains + 2–3 | fish sticks, fish fingers, breaded fish                                   |
| Milk             | Milk                      | existing                                    | ~40               | + barista milk                                                            |
| Milk             | Chocolate Milk            | new                                         | ~10               | —                                                                         |
| Milk             | Eggnog                    | new (seasonal Nov–Jan)                      | 9–10              | nog, holiday nog                                                          |
| Cream            | Coffee Creamer            | new                                         | 20+               | creamer, non-dairy creamer                                                |
| Cream            | Half-and-Half             | new                                         | 8–10              | half and half                                                             |
| Cream            | Sour Cream                | new                                         | ~10               | —                                                                         |
| Cream            | Whipped Cream             | new                                         | 5–8               | whipped topping                                                           |
| Butter           | Butter                    | existing; sticks and tubs                   | 20+               | —                                                                         |
| Yogurt           | Yogurt                    | new                                         | 10+               | yoghurt, dairy-free yogurt                                                |
| Yogurt           | Greek Yogurt              | new; thin                                   | ~3                | Greek-style yogurt, Greek yoghurt                                         |
| Ice cream        | Ice Cream                 | new                                         | 10+ lines         | frozen dessert, non-dairy ice cream                                       |
| Cheese           | Cheddar                   | existing                                    | ~20               | —                                                                         |
| Cheese           | Mozzarella                | existing                                    | ~12               | —                                                                         |
| Cheese           | Smoked Gouda              | new                                         | 6–7               | gouda                                                                     |
| Cheese           | Pepper Jack               | new                                         | 5–7               | pepperjack                                                                |
| Cheese           | American Cheese           | new                                         | ~5                | American slices, American singles                                         |
| Cheese           | Mexican Blend             | new                                         | ~5                | Mexican cheese, taco cheese, Mexican shreds                               |
| Cheese           | Parmesan                  | new                                         | 9–11              | parm, parmigiano, grated parmesan                                         |
| Cheese           | Cream Cheese              | existing                                    | 9–10              | —                                                                         |
| Eggs             | Eggs                      | existing; cooked eggs                       | 5–6               | scrambled eggs (replaces egg replacer)                                    |
| Eggs             | Eggs for Baking           | new                                         | 3–5               | egg replacer, egg substitute                                              |
| Condiments       | Mayonnaise                | new                                         | 10–12             | mayo, aioli, egg-free mayo, eggless mayo                                  |
| Condiments       | Ranch Dressing            | new                                         | ~9                | ranch                                                                     |
| Condiments       | Caesar Dressing           | new                                         | ~7                | caesar                                                                    |
| Condiments       | Worcestershire Sauce      | new                                         | 4–5               | worcestershire, worcester sauce                                           |
| Dips and spreads | Queso                     | new; moved from Cheese                      | ~8 brands         | nacho cheese dip, cheese dip, cheese sauce                                |
| Dips and spreads | Spinach Artichoke Dip     | new                                         | ~5 brands         | spinach dip, artichoke dip                                                |
| Dips and spreads | French Onion Dip          | new                                         | ~4 brands         | onion dip, sour cream dip, sour cream and onion dip                       |
| Dips and spreads | Tzatziki                  | new                                         | ~4 brands         | yogurt dip, cucumber dip, tzatziki dip                                    |
| Chocolate        | Milk Chocolate            | new                                         | ~6 brands         | chocolate bar, milk chocolate bar, oat milk chocolate                     |
| Chocolate        | White Chocolate           | new; mostly online                          | ~8 brands         | white chocolate bar, white chocolate chips                                |
| Chocolate        | Chocolate Chips           | new; milk and white baking chips            | 3–4 brands        | chocolate morsels, baking chips, milk chocolate chips                     |
| Chocolate        | Peanut Butter Cups        | new                                         | 5–10 brands       | peanut butter cup, pb cups                                                |
| Chocolate        | Candy Bars                | new; mostly online                          | ~7 brands         | filled chocolate bars, wafer bars, nougat bars                            |
| Chocolate        | Candy-Coated Chocolates   | new                                         | ~4 brands         | chocolate candies, candy coated chocolate, chocolate gems                 |
| Chocolate        | Chocolate Hazelnut Spread | new                                         | ~5 brands         | hazelnut spread, chocolate spread                                         |
| Candy            | Gummy Candy               | new                                         | ~6 brands         | gummy bears, gummy worms, gummies, gelatin-free gummies                   |
| Candy            | Marshmallows              | new                                         | 4–5 brands        | marshmallow, gelatin-free marshmallows                                    |
| Candy            | Caramels                  | new                                         | ~2 brands         | caramel candy, chewy caramels, caramel chews                              |
| Desserts         | Cookies                   | new                                         | 8 brands, 20+     | cookie, chocolate chip cookies, bakery cookies                            |
| Desserts         | Cake                      | new; cakes and cupcakes                     | 6 brands, ~15     | cupcakes, chocolate cake, layer cake, pound cake, loaf cake, banana bread |
| Desserts         | Brownies                  | new                                         | 6 brands          | brownie                                                                   |
| Bakery           | Muffins                   | new                                         | 3 brands, ~8      | muffin                                                                    |
| Bakery           | Cinnamon Rolls            | new                                         | 4 brands          | cinnamon roll, cinnamon buns                                              |
| Desserts         | Pies and Cheesecake       | new; frozen and bakery                      | Daiya, ~7 flavors | pie, pumpkin pie, cheesecake, cheese cake, cheesecake bites               |
| Bakery           | Brioche and Rolls         | new; brioche, Hawaiian and dinner rolls     | 4 brands          | brioche, brioche buns, hawaiian rolls, sweet rolls, dinner rolls, challah |
| Desserts         | Pudding Cups              | new                                         | 5–6 brands        | pudding, chocolate pudding                                                |
| Bakery           | Baking Mixes              | new; cake, brownie, cookie and muffin mixes | not yet counted   | cake mix, brownie mix, cookie mix, muffin mix, box mix                    |

Existing foods keep their current names and other names unless a row says otherwise.

**Foods added from the first photo batch (owner decision, 2026-10-15).** The pilot of the owner's store photos found plant-based alternatives that no food fit, so the United States gains nine foods, bringing it to 73, and a 19th aisle:

| Aisle   | Food             | Other names                                                      |
| ------- | ---------------- | ---------------------------------------------------------------- |
| Beef    | Steak            | steak strips, steak tips, beef strips, bulgogi                   |
| Beef    | Beef Deli Slices | roast beef slices, deli beef, pastrami, deli steak               |
| Chicken | Chicken Bites    | chicken chunks, orange chicken, kung pao chicken, sesame chicken |
| Pork    | Dinner Sausages  | bratwurst, brats, kielbasa, smoked sausage                       |
| Milk    | Bottled Lattes   | iced latte, iced coffee, latte, ready-to-drink coffee            |
| Cream   | Heavy Cream      | heavy whipping cream, whipping cream, cooking cream              |
| Cheese  | Swiss Cheese     | Swiss, Swiss slices, Emmental                                    |
| Cheese  | Feta             | feta cheese, feta crumbles                                       |
| Pizza   | Pizza            | frozen pizza, cheese pizza, pepperoni pizza, flatbread pizza     |

- **A swap is any plant-based alternative to an animal product,** including dishes defined by one: mac and cheese, Alfredo sauce, bouillon and bottled lattes count. Products that were never made with animal ingredients and replace nothing, such as instant noodles and chili, stay out.
- **Foods are added as products are found,** not ahead of time. Other cheeses and deli slices wait for their first product.
- **Pizza is its own aisle,** the way stores keep a frozen pizza section.
- **Desserts and Bakery split,** and cookie dough is part of Cookies (see the foods decisions above).

**Foods added from the full photo batch (owner decision, 2026-10-16).** The full batch of 2,102 store photos found 825 products. The United States gains 37 foods, bringing it to 110, and three aisles. Removing the seven launch foods still without a product then leaves 103:

| Aisle            | Foods                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Beef             | Corn Dogs, Canned Roast Beef                                                                                 |
| Chicken          | Shredded Chicken, Chicken Breasts                                                                            |
| Pork             | Pulled Pork, Ribs, Ham Roast, Ham Deli Slices, Salami Deli Slices, Luncheon Meat                             |
| Cheese           | Ricotta, Provolone, Soft Cheese, Italian Blend, Cheddar Mozzarella Blend                                     |
| Condiments       | Green Goddess Dressing, Thousand Island Dressing, Kimchi                                                     |
| Chocolate        | Chocolate Peanut Spread, Hot Cocoa Mix, Caramel Cups                                                         |
| Candy            | Fruit Chews                                                                                                  |
| Desserts         | Gelatin Cups                                                                                                 |
| Toaster Pastries | Toaster Pastries                                                                                             |
| Meals            | Mac and Cheese, Skillet Meals, Jamaican Beef Patties, Breakfast Burritos, Lasagna, Cheese Ravioli, Dumplings |
| Sauces           | Alfredo Sauce, Creamy Pasta Sauce, Pesto, Vodka Sauce, Gravy, Bouillon                                       |

- **Meals and Sauces** hold prepared dishes and sauces whose originals are made with meat or dairy.
- **Toaster Pastries is its own aisle,** like Pizza.
- **Kimchi counts,** because traditional kimchi is made with fish sauce or shrimp. Seitan is a meat alternative (Chicken Bites, for Upton's).
- **Folded into existing foods:** veggie burgers into Beef Burgers, butter sprays into Butter.
- **Plain dark chocolate stays out,** because it is usually made without milk already.

**Detail questions.**

- **New foods ask the default detail questions, Taste and Texture.**
- **The launch foods keep their lists, with two changes:**
  - **Milk:** "In coffee" becomes **In hot drinks**, because many people take milk in tea. Milk also gains **Baking**.
  - **Eggs** gains **Baking**.
- **Butter** already asks about baking.

**Seed changes.**

- **`TAXONOMY_GROUPS`** holds the root and the 23 aisles.
- **`TAXONOMY_LEAVES`** names each food's aisle and gains an optional `countries` list (ISO codes). The list defaults to every launch country, and the new foods list `["US"]`.
- **Existing environments.** The seed stays insert-only and idempotent. For an environment that is not reset, the reshape script (`scripts/reshape-taxonomy.ts`) moves foods from shelves to aisles through the audited taxonomy path and retires the emptied shelves. The same run moves Queso from Cheese into Dips and spreads.

**Fish needs more thought.**

- Fish Fillets covers breaded fillets, plain fillets and fish sticks for now. Raters compare each product with the same style of fish.
- When one style reaches about five recipes on its own, it becomes its own food in the Fish and seafood aisle: for example Fish Sticks, plain Fish Fillets, Tuna, Smoked Salmon or Shrimp.

**Watch list.** Candidates to add next. There is no size bar: the owner adds one when it is a distinct thing people look for, broadening a thin food where that fits better:

- Cottage Cheese and Pepperoni (Heavy Cream and Feta joined, Steak Tips became Steak and Bratwurst joined Dinner Sausages on 2026-10-15; Ricotta and Pulled Pork joined on 2026-10-16);
- Fried Eggs (Yo Egg, BeLeaf, regional) and Hard-Boiled Eggs (Crafty Counter WunderEggs);
- Bologna and Chicken Deli Slices (Ham and Salami Deli Slices joined on 2026-10-16);
- Tuna, which today has two brands, both sold online;
- Fish Sauce, which is sold mostly online;
- Ranch Dip in tubs, Buffalo Dip, Blue Cheese Dip, Pimento Cheese, Cheese Spreads and Aioli (in Condiments), with two or three brands each. Dips and spreads stays savory: sweet spreads such as chocolate hazelnut belong with sweets, not dips (owner, 2026-10-12);
- Caramel Sauce, Jelly Beans and Candy Corn (Gelatin Cups joined on 2026-10-16);
- Sweetened Condensed Milk (it would join Milk) and bee-free Honey, sold mostly in specialty stores;
- Croissants (two in chains), Donuts (Whole Foods only), Naan and Tiramisu (none in stores). Cookie dough joined Cookies on 2026-10-15;
- Removed until their first product (2026-10-16): Pepper Jack, Spinach Artichoke Dip, French Onion Dip, White Chocolate, Chocolate Hazelnut Spread, Brownies, and Brioche and Rolls;
- Frozen Waffles, which have enough products but no aisle yet.

### Aisle order, browsing and seasons

- **Popularity order.**
  - In each country, aisles are ordered by the number of counted ratings across their foods there, most first. Ties go to product count, then the default order, then name.
  - Foods within an aisle follow the same rule.
  - The counts come from the rating aggregates, never raw ratings. They are all-time, so the order changes slowly.
- **Default order.** Each aisle carries a `position`, used when a country has no ratings yet: Beef, Chicken, Pork, Turkey, Lamb, Fish and seafood, Milk, Cream, Butter, Yogurt, Ice cream, Cheese, Eggs, Condiments, Dips and spreads, Chocolate, Candy, Desserts, Bakery, Toaster Pastries, Pizza, Meals, Sauces. Operators set it for aisles they add. An aisle without one sorts after those with one.
- **The same order everywhere.** The aisle bar, Browse every food, aisle pages, the footer and the food picker all use it.
- **Browse every food.**
  - Each aisle is a card holding its three most popular foods with their #1 swap.
  - When an aisle has more, a last line reads "See all 9 cheese foods".
  - Each card is as tall as its content. Cards in a row align at the top, not by stretching the shorter ones.
- **Seasonal foods.**
  - A food can carry season months, for example Eggnog in November–January and Turkey Roast in October–December.
  - Its ranking page, cards and search results show "Seasonal · Nov–Jan". It stays listed and ranked all year.
  - Operators set the months in the taxonomy tools, and the seed sets the two above.
- **Seasonal products.**
  - A product can carry a Seasonal tag, for example a pumpkin-spice creamer.
  - A product in a seasonal food has the tag by default.
  - Contributors set it when adding a product, or later as a tier 2 edit.
  - The product page and ranking rows show it. A seasonal product off the shelf is not treated as discontinued.
- **Migration `0002_aisle_order_and_seasons.sql`** adds:
  - `categories.position`;
  - `categories.season_start` and `categories.season_end` (months 1–12; a season may wrap past December);
  - `products.seasonal`.

### Confirmed defaults (2026-10-12)

1. **New foods are switched on in the United States only.** The aisles stay shared by every country.
   - Every food is shared, but each country shows only the foods switched on there.
   - If the 30 new foods were switched on in all six current countries, the UK, Canada and Australia pages would show empty foods such as Eggnog and Half-and-Half until someone there added a product.
   - Switched on in the US only, they appear in another country automatically when someone there adds a product for them.
   - This is not about which country a visitor lands on.
2. **The taxonomy ships with the rest of the milestone.** The owner chose one pull request (#49) for the whole milestone, kept as a draft until it is done.
   - Staging still needs its reset to version 1 before real data is entered, or anything entered before it is wiped.
   - Until then, photos and names collected while shopping can wait in a spreadsheet.
3. **People see the 23 groups as "aisles",** keeping the store feel of the swap aisle. Internally they remain categories.

## Implementation sequence

1. **Specification.**
   - DATABASE_BASELINE, API, ARCHITECTURE and DESIGN_DIRECTION gain milestone 7 sections.
   - PRODUCT_MASTER, RANKING and MODERATION already carry the owner decisions.
   - AGENTS.md points here.
2. **Two-level taxonomy and US launch foods.**
   - `server/taxonomy/domain/shape.ts` places foods at depth two, and the "outside depth" flag and workspace follow.
   - The aisle bar and aisle panel list foods directly. Breadcrumbs drop shelves, and a silent aisle hides a repeated name.
   - The food picker groups by aisle. Suggest a food chooses an aisle instead of a shelf (`shelf-select.tsx`, `propose-category.tsx`, `food-suggestions.ts`, submission contracts).
   - The admin taxonomy, an icon for each new aisle, and the reshape script for existing environments.
   - The 40 foods, US-only availability and the detail-question changes, with seed tests.
   - **Owner review:** screenshots of the aisle bar and an aisle panel.
3. **Aisle order, browsing and seasons.**
   - Migration `0002_aisle_order_and_seasons.sql`, the Drizzle schema and the seed (aisle positions, Eggnog and Turkey Roast seasons, Eggs for Baking and Turkey Deli Slices).
   - Popularity order in the taxonomy reads for the aisle bar, aisle pages, Browse every food, the footer and the food picker.
   - The aisle cards on the home page, and the Seasonal chip on foods.
   - Operator fields for an aisle's position and a food's season.
   - After the first review: three foods per card at their natural height, aisle menus on hover, the Dips and spreads aisle (Queso moves from Cheese), the Chocolate, Candy, and Bakery and desserts aisles.
   - **Owner review:** screenshots of the home page and an aisle.
4. **Data foundation.**
   - Migration `0003_recipe_lines.sql`, the Drizzle schema and migration tests: family backfill and per-country split, triggers, the flavor and enjoyment checks, and a database emptied and migrated back to the same schema.
5. **Line aggregates.**
   - The reference function and the SQL refresh for both rankings and detail rows.
   - Wiring into rating writes, exclusions, merges, the integrity rebuild, every eligibility-changing catalog decision and the hourly backstop.
   - Tests: Closest equivalence with one flavor per line, one vote per person, a reformulated flavor, discontinuation, eligibility changes and rebuild equality.
6. **Line discovery.**
   - Migration `0004_line_discovery.sql`.
   - People-based daily rollup and trends, New by line, and removal of the product-level trending code.
7. **Catalog reads.**
   - `rankedSet`, `unranked`, `trending`, `newest`, `topProducts`, `aisle`, `home`, `sidebar`, `answers`, `productPlacement`, `storeOptions`, `taxonomy` counts and `productInsights` move to lines and gain the Tastiest view.
   - Brand search and the brand read, with the shared brand matcher.
   - Flavor lists for the cards on a page are fetched in one query.
   - Filters apply per flavor.
8. **Public pages.**
   - The ranking toggle, line rows with the flavor disclosure, featured #1s, structured data, aisle panel, home, instant search and the search page.
   - The food page's rows take their documented API shape with the new UI: `leadProduct`, `closestRank`, and `score`, `people` and `early` for the ranking being viewed. Detail sorts and badges read "Closest …". Checkpoint 7 keeps the earlier field names so the current pages keep working.
   - Brand pages.
   - Product page with both ranks, Other flavors and Add another flavor.
   - The rating form with the Tastiest question and the flavor-aware Closest question, and the methodology page.
   - **Owner review:** phone and desktop screenshots in both themes before continuing.
9. **Add a product and moderation.**
   - Step 1 in its new order: food, the brand combobox, "Already listed from [brand]" and the product fields for each choice.
   - The brand-lines lookup and the looser similar-products matching.
   - Add another flavor.
   - Contracts and drafts, hold rules and the new report reasons.
   - The product Seasonal tag in Add a product and as a tier 2 edit.
   - Operator Move to line and Rename line, with reversal and invalidation.
   - Built (2026-10-13): step 1 shows the product's fields once the food and brand say what it is; a brand with nothing listed in the country, or a new brand, goes straight to them. Brand suggestions include brands with nothing in the country yet. Submissions add `enjoyment` with the rating and `seasonal`, which follows the food's season unless set.
   - **Owner review:** screenshots.
10. **Demo catalog, hardening and staging.**

- Demo lines with several flavors (a yogurt with three flavors, nuggets with Original and Spicy) and Tastiest answers.
- Demo ratings dated relative to the seed run, so Trending always has recent activity. The fixed 2026-10-04 dates left the 7-day window on 2026-10-12, which emptied the home page's Trending section and fails its browser test.
- **Fold the milestone's migrations into version 1** before staging (owner decision, 2026-10-12). Nothing has reached a shared database, so `0002`–`0004` join `0001_initial.sql` and the first release starts at a single version 1. The backfill that gives older products a line goes, because every database is reset.
- `npm run check` and `npm run test:e2e` after a local reset.
- axe at 390 px and desktop in both themes.
- The verification record, then staging after approval.

## Configurable defaults

| Control                          | Default                                 |
| -------------------------------- | --------------------------------------- |
| Closest prior mean / strength    | 3.5 / 10 (unchanged)                    |
| Tastiest prior mean / strength   | 3.5 / 10                                |
| Early (each ranking)             | 1–9 people                              |
| Flavor score shown in a card     | 5 answers                               |
| Line detail mean, sort and badge | 5 people answering                      |
| New view                         | Line's first publication within 90 days |
| New tag (line and flavor)        | 30 days                                 |
| Line refresh backstop            | Hourly, every line                      |
| Flavor label                     | 40 characters                           |
| New launch food availability     | United States only                      |
| Brand suggestions                | From 3 characters, up to 2 typos        |
| Similar products while typing    | One shared word of 3+ letters           |
| Brands in instant answers        | 3                                       |
| Trending window / half-life      | 90 days / 30 days                       |
| Trending baseline                | Days 91–180                             |
| Trending minimum                 | 3 people in the window                  |
| Foods per aisle card (home)      | 3, then "See all"                       |
| Trending tag                     | Top 3 trending lines in a food          |

## Verification and staging delivery

- **Each checkpoint** passes `npm run check` and its focused integration and browser suites before its local commit.
- **Final verification** covers:
  - **One-flavor equivalence.** On the seeded catalog with one flavor per line, every line's Closest score, rank and order equals the product's score, rank and order before this milestone.
  - **One vote per person.** One person rating three flavors adds one person and their mean, in both rankings.
  - **Tastiest is independent.** Tastiest answers never change a Closest score, rank or order.
  - **Trending dedupes across the window.** One person rating three flavors on three different days adds one person to the line's trend.
  - **Popularity order.** With no ratings, aisles follow the default order. Ratings in one aisle move it ahead in that country only.
  - **New never moves later.** Discontinuing a line's oldest flavor, or adding a new one, never brings the line back into New.
  - **Siblings never hold.** A new flavor of a chosen line is not held as a near-duplicate of that line's flavors; an exact duplicate is still refused.
  - **Formula versions.** A reformulated flavor drops its old ratings from the line.
  - **Eligibility.** Every eligibility-changing decision refreshes the line, including discontinuation and reintroduction, and reversals restore it.
  - **Rebuild equality.** The integrity rebuild reproduces the incremental line tables exactly.
  - **Filters.** Filters never change a line's score or rank.
  - **Database integrity.** Foreign-key checks pass, and the migrations replay cleanly.
- **The running-app pass:**
  1. Choose Ground Beef and type the brand "Impossibl". Impossible appears, and its Impossible Beef line is listed. Typing the product name "Impossible Meat" also lists Impossible Beef.
  2. Add a yogurt with three flavors through **Add another flavor**. Each one publishes without waiting for review.
  3. Rate two flavors as one person and one flavor as another, answering Tastiest on some. Check the card, both toggles, the flavor scores and the product page.
  4. Search "Trader Joe's" and open the brand page.
  5. Mark one flavor discontinued. It leaves the card and the line's score, and comes back when reintroduced.
  6. Apply the store and Free-from filters.
  7. Report a flavor as "Not part of this line", move it to a new line as an operator, then reverse the move.
  8. Check that a US-only food reads "Not in [country] yet" in the United Kingdom.
- **Staging,** after approval:
  1. Record a Time Travel bookmark.
  2. Reset the database to version 1, then migrate.
  3. Seed the taxonomy, demo catalog and images, then deploy.
  4. Repeat the running-app pass with two accounts.
- **Records.** Evidence, versions and limitations go in `docs/verification/milestone-7.md`. Screenshots are shared for review only; they are never committed or uploaded.

## Next: milestone 8, countries

This section is a proposal to plan after milestone 7.

The site supports six English-speaking countries today. The owner wants the main countries where vegan shoppers are, judged by plant-based market, vegan share and population, so people anywhere can add what their stores sell. English is used everywhere for now, and country and language become separate settings, with translations later.

**Proposed new countries (25, making 31).** The basis is:

- the largest plant-based markets in Europe;
- the countries Veganuary surveys;
- the fastest-growing markets, which include Japan, Poland and South Korea;
- large populations with vegetarian traditions or plant-based brands of their own: China, Hong Kong, India, Taiwan and Thailand;
- the Gulf, where plant-based nuggets, burgers and oat milk are now common in supermarkets.

The countries are:

- **Europe:** Germany, Austria, Switzerland, France, Netherlands, Belgium, Sweden, Denmark, Spain, Italy, Poland.
- **Asia:** China, Hong Kong, Japan, South Korea, Taiwan, Singapore, India, Thailand.
- **Middle East:** United Arab Emirates, Saudi Arabia.
- **Americas:** Brazil, Mexico, Argentina.
- **Africa:** South Africa.

Indonesia, Malaysia, the Philippines, Vietnam, Turkey, Portugal, Norway, Finland, Czechia and Chile are candidates for a second wave. Israel is excluded at the owner's request.

**Work per country:**

- **Its regulator's declared-allergen list.**
  - EU and EEA countries and Switzerland share the 14 EU allergens.
  - Each other country needs its own list. That means new allergen keys, such as buckwheat, peach, tomato and pork.
- **A starter list of major grocery chains** for "Commonly found at".
- **English display names** where a food's local name differs.

**Site work:**

- a searchable country picker grouped by region, replacing a short list;
- country-scoped search, brand pages and sitemaps for every country;
- a language setting kept separate from the country, defaulting to English until translations exist;
- **A one-time country prompt,** agreed by the owner on 2026-10-12. This amends the milestone 5 rule that nothing is inferred from IP.
  - **What it says.** When a visitor's Cloudflare country is an active country other than the one being viewed, the site offers "Looks like you're in the UK. Switch?" It never redirects.
  - **When it never shows.** It shows only while the device has no saved country choice. Choosing a country anywhere saves it: through the prompt, the switcher or dismissing the prompt. After that it never appears again, and a visitor who switches countries is never asked to switch back.
  - **How it stays cacheable.** Pages stay shared-cacheable; the prompt reads the visitor's country from a small uncached endpoint after the page loads;

**Every country starts from the shared aisles.**

- **The macro categories are shared.** The 23 aisles are the same everywhere, and an empty country's home lists them.
- **Foods start fresh in each country.**
  - A food switches on when someone there adds the first product for it.
  - Anyone can pick any existing food, or suggest a new one when the local food doesn't exist yet. Japan, for example, will grow foods the US doesn't have.
- **Suggesting aisles.** Inside Suggest a food, "None of these, suggest a new aisle" proposes an aisle with the food, reviewed by an operator. Aisles also gain per-country names, for local wording and later translations.
- **Food suggestions need a lighter review.** Today an operator reviews every suggestion. With many countries, that review needs to become lighter, for example automatic acceptance into an existing aisle after the automated checks, with reports to correct mistakes. Milestone 8 decides how.
