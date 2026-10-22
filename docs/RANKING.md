# VeganAlts Ranking System v1.0

## 1. Purpose

The ranking system answers one question:

> **How closely does this vegan alternative replace the specific non-vegan product represented by this category?**

It does not rank general product quality, healthfulness, price, ethics, popularity or brand reputation.

## 2. Rating identity

A primary rating belongs to:

```text
user + product_formula_version + replacement_category
```

This is essential.

A user's rating of a product as **Ground Beef** must not automatically become their rating of the same product as **Beef Burger**. A rating of an old formula must not determine the current formula's score after material reformulation.

## 3. Required primary input

A signed-in user submits one Overall Similarity score:

| Score | Meaning          |
| ----: | ---------------- |
|     1 | Not close        |
|     2 | Slightly similar |
|     3 | Fairly close     |
|     4 | Very close       |
|     5 | Extremely close  |

Exact interface copy may evolve, but the underlying 1–5 scale remains stable unless a future data migration deliberately changes it.

## 4. Optional inputs

A rating may additionally include:

- category-specific dimension scores;
- conventional-product recency/familiarity bucket;
- text comment through the product comment system;
- retailer confirmation through the retailer system.

The explicit Overall Similarity score is not calculated by averaging optional dimension scores.

## 5. Detailed rating dimensions

Dimensions are category-configured, not hard-coded into the rating table.

Example:

```text
Mozzarella
- taste
- texture
- melt
- stretch

Ground Beef
- taste
- texture
- browning/cooking
```

Each dimension is a 1–5 score unless a later product decision defines another scale.

## 6. Tried state

Submitting a similarity rating implies the contributor has tried the referenced formula version.

The database supports a standalone Tried record at the product-version level even if the first UI does not expose it. This enables future use cases where someone wants to record experience without making a confident similarity judgment.

## 7. Canonical data vs derived data

Canonical:

- individual ratings;
- rating dimension values;
- product/formula/category relationships.

Derived:

- raw average;
- rating count;
- Bayesian score;
- daily/recent counts;
- trending score;
- rank position.

Derived values must always be rebuildable from canonical records.

## 8. Top ranking

### 8.1 Why raw averages are insufficient

A product with one 5/5 rating should not automatically outrank a product with thousands of 4.8/5 ratings.

Use a Bayesian weighted score:

```text
score = (v / (v + m)) × R + (m / (v + m)) × C
```

Where:

- `R` = product's raw mean Overall Similarity;
- `v` = counted rating count;
- `C` = prior/community mean;
- `m` = prior strength / equivalent rating count.

### 8.2 Initial parameter strategy

The implementation must keep `C` and `m` configurable rather than hard-coding magic numbers throughout the codebase.

Recommended initial behavior for testing:

- use the category-country mean as `C` when the category has sufficient data;
- use a configured launch prior while the category is sparse;
- begin experimentation with `m ≈ 10` equivalent ratings;
- validate against seeded/sample datasets before public launch.

The exact production constants are an implementation calibration decision, not a permanent product truth. Milestone 1 starts with a configured prior mean of **3.5** and prior strength of **10**. Update environment configuration and run the full aggregate rebuild together when changing these initial calibration values.

### 8.3 Display behavior

The public ranking should show:

- rank position;
- the adjusted score as **4.2/5**, without an attached “Match” label;
- rating count;
- “Early” below 10 counted ratings; unrated products appear in a separate unranked section.

Avoid presenting a confidence-adjusted score as if it were literally the raw average without explanation.

One workable UI pattern is:

```text
#1 Impossible Beef
4.7/5 · 2,841 ratings
```

Product detail can separately expose raw community averages and dimension distributions if useful.

## 9. Eligibility for Top

A product/formula/category relationship must be:

- active;
- ranking eligible;
- in the user's selected country;
- tied to the current formula version for the normal current ranking;
- not excluded by moderation.

Zero-rating products remain discoverable but should not misleadingly appear as a confident ranked winner.

## 10. Formula transitions

A material reformulation creates a new `product_version` while keeping one product identity.

When the new version becomes current:

- old ratings remain attached to the old version;
- old detail/history remains viewable;
- current Top uses only ratings for the new current version;
- the new version starts with its own rating count and Bayesian confidence;
- the product can be labeled Recently Reformulated.

Historical scores must never be silently copied into the new formula's ranking.

## 11. Rating edits

A user may update their current rating for the same:

```text
user + formula version + category
```

The active row is updated and aggregate values recalculated.

The first implementation does not need to expose a full public rating-edit history, but abuse/audit requirements may retain internal change timestamps or events later.

## 12. Counted vs excluded ratings

The rating record must support moderation/integrity exclusion without deleting legitimate history.

A rating can be marked as not counted when:

- the account is determined to be fraudulent;
- coordinated manipulation is confirmed;
- the rating targets an invalid relationship/version;
- another moderation policy explicitly requires exclusion.

Do not allow brands, contributor reputation, sponsorship or account popularity to increase an individual's rating weight.

## 13. Top sort order

Primary sort:

1. Full-precision Bayesian score descending; round to one decimal only for display.
2. Counted rating count descending as a stable tie-breaker.
3. Stable deterministic ID/order as a final tie-breaker.

Do not inject recency into Top solely to help new products; Trending and New solve discoverability separately.

## 14. Trending

Trending is intentionally separate from Top.

Trending answers:

> **Which alternatives are receiving unusually strong recent community activity/support?**

Potential inputs:

- recent new rating count;
- rating velocity relative to historical baseline;
- recent similarity quality;
- recent Tried activity;
- recent comments/contribution activity;
- age/reformulation status.

Rules:

- Sponsorship must never affect Trending.
- Trending logic should be documented/testable rather than a hidden ad-hoc sort.
- A Cron/Queue job may compute it periodically; no need to calculate complex trending on every read.
- The exact formula can be deferred until the site has enough real activity to calibrate it.

## 15. New

New is primarily chronological discovery.

Sort by approved/published product creation time within market/category, with moderation eligibility filters.

A newly reformulated existing product is not necessarily a brand-new product, but may receive a “Recently Reformulated” discovery treatment.

## 16. Category-specific independence

If a product belongs to multiple categories, each has independent data:

```text
Product X → Ground Beef: 4.7/5
Product X → Beef Burger: 3.9/5
```

This is expected and meaningful.

## 17. Country independence

Country-specific product records rank inside their market. Do not merge ratings across markets simply because product branding looks similar.

A product family may connect records for discovery/history, but market/formula ratings remain independent.

## 18. Familiarity statistics

Conventional-product recency is context, not voting power.

Example product-detail breakdown:

```text
All raters: 4.6
Consumed conventional product recently: 4.5
More than one year ago: 4.7
```

These statistics should not automatically alter Top ranking weight unless a future Product Master explicitly changes the policy.

## 19. Aggregate update strategy

On rating create/update/exclusion:

1. Update canonical rating.
2. Recalculate the affected `product_version + category` aggregate.
3. Update `product_category_stats`.
4. Optionally enqueue broader daily/trending recalculation.

For early scale, recalculating one aggregate from its relevant ratings is acceptable. If rating volume grows, maintain incremental sum/count values with periodic full integrity rebuilds.

## 20. Integrity rebuild

Provide an administrative/background operation that can recompute:

- rating count;
- rating sum;
- raw average;
- Bayesian score;
- tried count;
- dimension aggregates;
- daily activity statistics;
- trending scores;

from canonical tables.

Use this after ranking-formula changes or if aggregate drift is suspected.

## 21. Ranking transparency

Public-facing explanation should be simple:

> Rankings are based primarily on community similarity ratings and account for the amount of feedback so a product with only a few ratings does not unfairly dominate an established result. Fraudulent or manipulated activity may be excluded.

Do not publish detailed anti-abuse thresholds that make manipulation easier.

## 22. Ranking invariants

- One active primary rating per user/version/category.
- Scores are 1–5 integers.
- Current ranking never mixes old formula ratings into a new formula score.
- Sponsorship has zero ranking effect.
- Moderator/editor trust has zero extra rating weight.
- Product popularity outside the category does not automatically affect similarity rank.
- Price/health/retailer availability do not affect Top.
- Raw ratings remain recoverable even when a derived score changes.

## Milestone 4 discovery decisions

The approved [milestone 4 specification](MILESTONE_4_PLAN.md) implements §14 and §15 with provisional, configurable constants. They should be recalibrated once real traffic exists.

**Daily statistics.** `product_category_daily_stats` is derived hourly from canonical rows for each UTC day, formula and active category: counted ratings created that day and their similarity sum, trials and distinct commenters on visible comments. Recent days are re-derived every hour and the full window daily and after category merges.

**Trending.** For each formula/category:

```text
activity(day) = ratings + 0.5 × trials + 0.25 × distinct commenters
recent        = Σ activity(day) × 0.5^(age_days / 3)   over the last 7 days
baseline      = mean daily activity over days 8–14
quality       = Bayesian mean of the recent similarity scores, normalized to 0–1
trending      = recent / (baseline + 1) × (0.5 + 0.5 × quality)
```

A score is zero unless the last seven days contain at least three rating or trial events. Only eligible current formulas in active rankable categories qualify. Scores live in a separate rebuildable read model, `product_category_trends`, refreshed by the hourly schedule. Sponsorship, moderation status, contributor trust and comment votes are not inputs. Trending never changes `product_category_stats` or Top ordering.

**New.** New lists eligible products in the category whose `published_at` falls within 90 days, newest first. Reformulations do not re-enter New.

**Category merges.** When an operator merges two categories describing the same reference product, the donor's ratings move to the survivor. A user who rated the same formula in both keeps their most recently updated rating counted; the other remains stored with `is_counted=0`. Aggregates and trends are rebuilt from canonical rows. Reversal restores the original categories and counted flags.

## Milestone 5 detail and familiarity decisions

The approved [milestone 5 specification](MILESTONE_5_PLAN.md) activates §5 and §18 with provisional, configurable constants. None of them change Top.

**Views.** A food's ranking has one sort menu: Closest match (`view=top`, the default and the only ranking), Trending, Newest (`view=new`), one detail sort per active dimension (`view=detail-<key>`, labeled "Best taste", "Best texture", …) and Most rated (`view=most-rated`, counted ratings descending, then Top order). The #1 card and flag appear only for Closest match. Every row shows its overall Top rank, so sorts and filters never hide where a product actually ranks.

**Early.** A ranked product with 1–9 counted ratings carries the Early badge. The threshold is one server constant shared by every surface.

**Detail aggregates.** `product_category_dimension_stats` stores, per formula, category and dimension, the number and sum of detail answers from counted ratings. It is updated in the same write as `product_category_stats` and rebuilt by the integrity rebuild. A detail mean is shown, sorted on or awarded only with at least 5 answers. A detail sort orders qualifying products by mean (ties in Top order), then lists the rest in Top order under a note that they have too few answers. A detail badge ("Best taste") goes to the qualifying product with the highest mean for that dimension when it is not the #1. Retired dimensions keep their answers but are not shown, sorted or awarded.

**Familiarity.** `product_category_familiarity_stats` stores, per formula and category, counted ratings by recency bucket (including unanswered) and overall score. People who last ate the original this week, this month or this year form the recent-eaters group; their average similarity is shown on the product page once 10 of their ratings count. The same table provides the score distribution ("How people rated it"). Familiarity is context only and never changes a rating's weight.

**Filters.** The "Commonly found at" store filter and the Free-from filter only narrow a view. Filtered rows keep their Top score and rank; nothing about eligibility, weight or `product_category_stats` changes. Trending, Newest, detail sorts and Most rated likewise only reorder.

| Control                 | Default                                                       |
| ----------------------- | ------------------------------------------------------------- |
| Early                   | 1–9 counted ratings                                           |
| Detail sort and badge   | 5 answers per dimension                                       |
| Recent-eaters score     | 10 counted ratings from people who ate the original this year |
| Start with these (home) | 6 foods whose #1 is past Early                                |
| Still waiting (home)    | 6 foods whose best ranked product is below 3.5/5              |

## Milestone 6 decisions

The approved [milestone 6 specification](MILESTONE_6_PLAN.md) changes who can contribute what, not how scores are computed.

- **Ingredients not checked yet.** A product published without confirmed ingredients is ranking-eligible like any provisionally classified product. Only Under Review removes a product from rankings.
- **Foods per country.** A food's ranking exists in a country only where the food is switched on, and every visible product's foods are on in its country, so no ranked product is ever hidden by availability. Switching a food on or off never changes a score, weight or `product_category_stats` row.
- **Contribution extras.** The rating collected with a new product is an ordinary rating written through the canonical rating path once the product is published; it counts exactly like any other rating and is never written twice.

## Milestone 7 decisions

The [milestone 7 specification](MILESTONE_7_PLAN.md) changes the ranked unit from a product formula to a **recipe line**: a product family, which belongs to one country. It also adds a second, independent ranking, Tastiest. The owner decided both on 2026-10-11 and 2026-10-12.

Rating identity (§2), the 1–5 scale, formula transitions (§10) and the Closest prior constants are unchanged.

**What is ranked.** A ranking row is a line in a food.

- **Eligible flavors.** A line's eligible flavors are its products that meet §9 in that food.
- **A line ranks** when at least one eligible flavor has a counted answer for that ranking.
- **Flavor aggregates.** `product_category_stats` and the per-formula detail and familiarity statistics still describe each flavor.
- **Discontinued flavors.**
  - A discontinued flavor is not active (§9), so it leaves its line's score and card when it is marked discontinued.
  - Its ratings are kept, and count again if it returns with the same formula.
  - A line whose flavors are all discontinued leaves the ranking.

**Two rankings.** This amends §1.

- **Closest to the original.** It answers §1's question. It is the default and primary ranking, and it alone drives the home page, Start with these, Still waiting and Trending.
- **Tastiest.** It answers a second question: how much people enjoyed a swap, whether or not it is like the original. The answer is an optional 1–5 enjoyment score stored on the same rating row.
- **Independence.** Neither ranking ever changes the other's score, rank or order.

**Independent answers (owner revision, 2026-10-20).** Both questions are optional and either can be answered first or alone. A missing similarity or enjoyment answer is excluded from that ranking's per-person mean and population, never treated as zero. Recent Closest counts, familiarity, detail aggregates and the lead flavor's Closest tie-breaks use only closeness answers. Taste-only ratings still mark Tried and contribute to Tastiest; they do not give a line a Closest rank. Clearing both answers removes the rating and keeps Tried.

**Line score.** The same calculation runs for each ranking, over similarity for Closest and over enjoyment for Tastiest. For each person, take the mean of their counted answers for the line's eligible flavors in that food.

```text
v     = number of such people
R     = mean of those per-person means
score = (v / (v + m)) × R + (m / (v + m)) × C
```

Tastiest has its own configurable `C` and `m`, which start at 3.5 and 10.

**Properties of the score:**

- **One vote per person per line.** A person counts once however many flavors they rate.
- **Weighting.** Flavors that more people eat carry more weight. Rating more flavors never adds weight.
- **Never the best flavor alone.** The score is never taken from the best-scoring flavor.
- **Old formulas never count.** A reformulated flavor's earlier formula never enters the line's score.
- **Tried and recent** count distinct people.

**Order and labels.**

- **Sort order.** Each ranking sorts by full-precision score descending, then people descending, then the recipe line's ID. The stable line ID keeps a change of representative flavor from reordering tied rankings.
- **Early** applies at 1–9 people, per ranking.
- **Most rated** sorts by people.
- **The lead flavor** supplies the row's photo and link: the eligible flavor with the most counted ratings in that food, answering either primary question (owner revision, 2026-10-20). A rating answering both counts once. Ties go to its own Closest score, then the earliest published, then product ID. Excluded ratings and historical formulas do not count.
- **Equivalence.** With exactly one flavor per line, the Closest score, population and eligibility equal the §8 and §13 result for that product; exact score-and-population ties use the stable line ID.

**Flavors inside a line.**

- **Scores.** Each flavor shows its own score in the current ranking once it has 5 answers.
- **Order.** Flavors with a shown score are listed by it, then the rest by counted ratings, then flavor name.
- **Product-page statistics stay per flavor:** familiarity, the recent-eaters score and the score distribution.

**Detail questions.**

- **Defaults.** New foods use the default Taste and Texture. The ten launch foods keep their own lists.
- **Per person.** A person's detail answer for a line is the mean of their answers across its flavors.
- **Line means.** Line detail means are shown, sorted on and awarded at 5 people answering.
- **Labels.** Detail sorts and badges are labeled "Closest taste", "Closest texture" and so on, so they read as closeness rather than tastiness.

**Trending and New.**

- **Trending** stays similarity-based. It looks back a quarter (owner, 2026-10-12), because shoppers may check the site only every month or two. This amends the milestone 4 constants:
  - Recent activity covers the last 90 days, with each day's weight halving every 30 days.
  - The baseline is the mean daily activity over days 91–180.
  - A line needs at least three people with a rating or a trial in the 90-day window to trend. Commenters add activity but never count toward the three.
  - Each person counts once per line and food across the whole window, on the day of their latest activity: a rating, a trial or a comment, whichever weighs most.
  - Their similarity is their mean across the line's flavors in the window.
  - The baseline counts each person once in days 91–180, the same way.
  - The formula is otherwise unchanged.
  - **Trending tag.** The top 3 trending lines in a food (a positive score, at least three people) carry a Trending tag in the other views and on their product pages; `RANKING_TRENDING.taggedLines` changes the 3. The tag never changes a rank or score.
- **New** lists lines whose first publication in that food falls within 90 days, stored in `family_category_first_published` so it can only move earlier. First publication is the earliest `published_at` of any flavor the line has had in that food, eligible or not, so it never moves later. Neither a new flavor nor a discontinued oldest flavor brings a line back into New.

**Filters.**

- **Matching.** A line appears when any eligible flavor matches the store or Free-from filter, and its card lists the matching flavors.
- **No effect on scores.** Filters never change a line's score or rank, in either ranking.

**Derived data.**

- **Tables.** `family_category_stats`, `family_category_dimension_stats`, `family_category_daily_stats` and `family_category_trends` are rebuildable from canonical rows.
- **When line rows are recomputed.** Line rows are recomputed in the same transaction as any rating write or exclusion, and any catalog decision that changes a product's family, current formula, lifecycle, classification, food membership or eligibility.
- **Clock and rebuild.** The only figure that changes with time alone is "people this week" (`recent_count`): a person leaves it when their latest rating turns seven days old. The hourly pass re-derives just the lines with a rating that crossed that mark since its last run, found through `ratings.created_at`. The integrity rebuild (§20) re-derives every line.
- **Implementation.**
  - `ranking/domain/lines.ts` (`aggregateLine`) is the reference definition. `ranking/infrastructure/line-refresh.ts` stores the same figures in SQL, and tests hold the two equal.
  - A line has one row per food where it has an eligible flavor: the current formula of an active product that isn't under review and is ranking-eligible in that food. A row holds the lead flavor even before anyone rates.
  - A food's and a country's active state are applied when lines are read, as they are for products, so retiring or restoring a food needs no line refresh.
  - Each flavor's own Tastiest figures (`enjoyment_count`, `enjoyment_sum`, `enjoyment_score`) sit on `product_category_stats` beside its Closest figures.
  - Tastiest's prior comes from `RANKING_TASTIEST_PRIOR_MEAN` and `RANKING_TASTIEST_PRIOR_STRENGTH`, which start at 3.5 and 10.

**Invariants added to §22:**

- One vote per person per line and food, in each ranking.
- Tastiest never affects Closest.
- Joining or leaving a line never moves ratings; it only regroups them.
- A line never spans countries.
