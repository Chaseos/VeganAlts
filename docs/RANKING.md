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
