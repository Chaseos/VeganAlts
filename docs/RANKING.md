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

| Score | Meaning |
|---:|---|
| 1 | Not close |
| 2 | Slightly similar |
| 3 | Fairly close |
| 4 | Very close |
| 5 | Extremely close |

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

The exact production constants are an implementation calibration decision, not a permanent product truth.

### 8.3 Display behavior

The public ranking should show:

- rank position;
- a clearly named Match score;
- rating count;
- Early/New labeling when sample size is small.

Avoid presenting a confidence-adjusted score as if it were literally the raw average without explanation.

One workable UI pattern is:

```text
#1 Impossible Beef
4.7 Match · 2,841 ratings
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

1. Bayesian Match score descending.
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
Product X → Ground Beef: 4.7 Match
Product X → Beef Burger: 3.9 Match
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