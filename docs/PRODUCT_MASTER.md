**PRODUCT MASTER**

**VeganAlts**

Community-ranked vegan alternatives

_Find the closest vegan alternative._

| **THE RANKING IS THE PRODUCT.** |
| ------------------------------- |

| **VERSION**          | **1.0**                                               |
| -------------------- | ----------------------------------------------------- |
| **DATE**             | October 3, 2026                                       |
| **STATUS**           | Initial source of truth for product planning          |
| **PRIMARY DOMAIN**   | VeganAlts.com                                         |
| **SECONDARY DOMAIN** | VegAlts.com - recommended redirect / defensive domain |

**Purpose**

Make it easier for people to replace animal products by showing which
vegan alternatives the community believes come closest to the products
they already know.

**CONTENTS**

**VeganAlts Product Master v1.0**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Document map</strong></p>
<p>The master is organized from product thesis → user experience → data
and ranking rules → trust and moderation → launch and growth. Appendices
capture external patterns and a compact policy reference.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **01** | Product Definition & Mission               | **11** | Launch Strategy & Cold Start     |
| ------ | ------------------------------------------ | ------ | -------------------------------- |
| **02** | Audience & Product Principles              | **12** | Growth, SEO & Ecosystem          |
| **03** | Core Experience & Information Architecture | **13** | Monetization & Ranking Integrity |
| **04** | Categories, Products & Versions            | **14** | Future Expansion                 |
| **05** | Community Ranking System                   | **15** | Explicit Non-Goals               |
| **06** | Product Detail & Contributions             | **16** | Core Data Model                  |
| **07** | Trust, Moderation & Revision History       | **17** | Success Signals                  |
| **08** | Vegan / Plant-Based Classification         | **18** | Open Decisions & Next Planning   |
| **09** | Retailers & Availability                   | **A**  | Research & Product Patterns      |
| **10** | Profiles & Community Identity              | **B**  | Quick Policy Reference           |

**DOCUMENT CONTROL**

**What is settled in v1.0**

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>How to use this document</strong></p>
<p>This is the product source of truth for the initial VeganAlts
concept. “Locked” decisions should be treated as settled until
intentionally revised in a later master version. “Open” decisions belong
in milestone planning rather than being guessed during
implementation.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **Item**               | **Status** | **Decision**                                                 |
| ---------------------- | ---------- | ------------------------------------------------------------ |
| Product format         | LOCKED     | Web-first community ranking platform                         |
| Primary metric         | LOCKED     | Overall similarity to a specific non-vegan reference product |
| Launch content         | LOCKED     | Commercial packaged food first                               |
| Browsing               | LOCKED     | Public; sign-in required only to contribute                  |
| Geography              | LOCKED     | Country-specific product records and rankings                |
| Primary domain         | LOCKED     | VeganAlts.com                                                |
| Initial launch country | LOCKED     | United States for milestone 2                                |
| Rating display         | LOCKED     | 4.2/5, without an attached label; Early below 10 ratings     |

## Interpretation of decision status

| **Status** | **Meaning**                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| LOCKED     | Treat as a v1.0 product decision. Change only through an intentional master-document revision.               |
| OPEN       | A known decision still to be made during milestone planning, UX design, implementation research, or testing. |
| FUTURE     | A supported direction that should not expand initial release scope.                                          |

# 01 Product Definition & Mission

VeganAlts is a focused community utility: choose what you want to
replace, see the alternatives available in your country ranked by
similarity, and add your own experience if you have tried them.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Core product definition</strong></p>
<p>A web-first, community-supported database that ranks vegan
alternatives according to how closely they replace specific non-vegan
products within a particular country.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## The problem

People who want to reduce or eliminate animal products often encounter
the same practical barrier: the available replacement may not taste,
feel, cook, melt, stretch, or otherwise behave enough like the product
they already enjoy. Existing information is fragmented across Reddit
threads, generic reviews, editorial lists, store pages, and broad vegan
discovery apps.

## The answer VeganAlts should provide

A visitor should be able to search for “ground beef,” “mozzarella,”
“butter,” or another conventional product and immediately see the
community’s ordered answer for their country. The ranking should be
understandable before the visitor reads a single comment.

## Mission

Lower the friction of choosing vegan products by helping people identify
replacements they are more likely to enjoy. The product is intended to
support people who are vegan, becoming vegan, reducing animal products,
or simply trying alternatives.

## Positioning

- Not a generic vegan product-review website.

- Not a forum, editorial publication, recipe site, or lifestyle social
  network.

- Not primarily “Is this vegan?”; the primary question is “How closely
  does this replace X?”

- The leaderboard is the main output. Product details explain the
  result.

# 02 Audience & Product Principles

VeganAlts should be useful to people on both sides of the transition. A
person who still eats the conventional product may be especially
valuable because their comparison reference is fresh.

## Primary audiences

- People considering becoming vegan.

- Flexitarians and people reducing meat or dairy.

- Vegetarians considering veganism.

- New vegans looking for convincing replacements.

- Established vegans looking for better alternatives.

- People replacing only a specific animal product.

- People shopping for vegan family members or friends.

- People with dietary needs that overlap with vegan products.

## Product principles

| **Principle**                   | **Meaning**                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Ranking first                   | A category page should answer the visitor’s question immediately.                                   |
| Similarity, not generic quality | A delicious product can still be a poor imitation. Overall similarity is its own explicit judgment. |
| Collective experience           | No single reviewer or editor decides what is “best.”                                                |
| Low-friction contribution       | One useful rating should take seconds; power users can add much more.                               |
| Open browsing                   | Search visitors should never hit a sign-in wall just to learn.                                      |
| Independent rankings            | Brands can buy visibility in the future, never ranking position or rating weight.                   |
| History over overwrite          | Material formula and metadata changes remain traceable and reversible.                              |
| Focus over feature breadth      | Avoid becoming an all-purpose vegan platform before the ranking product is proven.                  |

# 03 Core Experience & Information Architecture

The browsing experience should remain simpler than the data model.
People should not need to understand taxonomies, Bayesian scoring,
formula versions, or moderation confidence to get an answer.

## Primary user loop

<table>
<colgroup>
<col style="width: 20%" />
<col style="width: 20%" />
<col style="width: 20%" />
<col style="width: 20%" />
<col style="width: 20%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>1</strong></p>
<p><strong>SEARCH</strong></p>
<p>What do you want to replace?</p></th>
<th><p><strong>2</strong></p>
<p><strong>RANK</strong></p>
<p>See #1, #2, #3…</p></th>
<th><p><strong>3</strong></p>
<p><strong>EXPLORE</strong></p>
<p>Open a product for details</p></th>
<th><p><strong>4</strong></p>
<p><strong>RATE</strong></p>
<p>Sign in and score similarity</p></th>
<th><p><strong>5</strong></p>
<p><strong>IMPROVE</strong></p>
<p>Optionally add details or corrections</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Homepage

The homepage is a discovery surface, not a literal rendering of the
taxonomy. It should prioritize a strong search entry point, the current
country, popular replacement categories, trending alternatives, and new
alternatives.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Suggested top-level framing</strong></p>
<p>Find the closest vegan alternative.<br />
What are you trying to replace?</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Search and discovery

The internal taxonomy can be Food → Meat → Beef → Ground Beef while the
visitor searches naturally for “meat,” “beef,” or “ground beef.” Broader
searches should fan out to relevant rankable destination categories
rather than forcing hierarchical navigation.

## Public vs. authenticated

| **Public without account**                                                       | **Requires sign-in**                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Rankings, products, comments, photos, retailer information, contributor profiles | Similarity ratings                                                 |
| Search, categories, historical formulas and public evidence                      | Comments and reports                                               |
| Sharing and SEO landing pages                                                    | Product additions, edits, confirmations and retailer contributions |

# 04 Categories, Products & Versions

The product model needs to distinguish the replacement job from the
commercial product, its market-specific record, its variants, and its
formula history.

## Category hierarchy

Categories represent the non-vegan reference product being replaced. The
deepest useful replacement concept becomes a rankable destination page.
Examples: Ground Beef, Beef Burger, Chicken Nuggets, Mozzarella,
Parmesan, Cream Cheese, Butter, Bacon, Eggs, Milk Chocolate.

Categories should evolve with the market. The system should support new
categories as product diversity and community activity justify them
rather than requiring a perfectly predefined global taxonomy.

## Country-specific product records

Each rankable commercial product belongs to one country record. The same
branded product in another market is a separate product record because
formula, labeling, packaging, retailers, and availability may differ.
Related market records can be linked through a shared Product Family.

## What is a distinct rankable product?

| **Example**                                                      | **Treatment**                                                         | **Reason**                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Country Crock Original Plant Butter vs. Avocado Oil Plant Butter | Separate rankable products                                            | Meaningfully different formulas trying to solve the same Butter replacement job. |
| 8 oz vs. 16 oz package                                           | Same product                                                          | Package size does not change the underlying experience.                          |
| Plain cream cheese vs. strawberry cream cheese                   | Separate variant; strawberry excluded from Plain Cream Cheese ranking | The flavor intentionally moves away from the conventional reference.             |
| Regular vs. spicy chicken nuggets                                | Separate variant; spicy excluded from regular Chicken Nuggets ranking | Specialty flavor would distort the general similarity question.                  |
| Gluten-free version with a materially different formulation      | Usually separate rankable product                                     | Formula may produce a meaningfully different similarity result.                  |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Working rule</strong></p>
<p>If a variation intentionally changes the defining flavor away from
the conventional reference, it should normally not participate in the
primary ranking for that reference.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Multiple category relationships

A product may participate in more than one replacement category when
appropriate. Every product-category relationship has its own ratings
because similarity depends on the replacement job. A product might score
4.7 as Ground Beef and 3.9 as Beef Burger without contradiction.

## Formula versioning

A material reformulation does not create a brand-new public product. It
creates a new Formula Version under the existing product. This is
foundational because a formulation change can alter the exact experience
VeganAlts measures.

| **Product** | **Formula state**              | **Rating behavior**                                                               |
| ----------- | ------------------------------ | --------------------------------------------------------------------------------- |
| Beyond Beef | Previous formula               | Historical ratings remain visible and permanently attached to the old formula.    |
| Beyond Beef | Current / reformulated formula | Receives new ratings; only current-formula ratings drive the current leaderboard. |
| Beyond Beef | Discontinued formula           | Preserved for history but removed from current ranking eligibility.               |

# 05 Community Ranking System

The interface should feel as fast as an upvote system while collecting
enough information to distinguish “5/5 closest” from “4/5 very close.”

## Required contribution

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>One required field</strong></p>
<p>Overall, how close is this to [reference product]?</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

| **Score** | **Meaning**      |
| --------- | ---------------- |
| 1         | Not close        |
| 2         | Slightly similar |
| 3         | Fairly close     |
| 4         | Very close       |
| 5         | Extremely close  |

Submitting the score requires an authenticated account and records that
the user has tried the product. A standalone Tried action may also be
offered for someone who wants to record experience without making a
confident similarity judgment.

## Why not a simple upvote/downvote?

A binary upvote cannot express that one user believes Impossible is 5/5
similar while Beyond is 4/5. A downvote is even less useful because it
may represent dislike of the brand, price, processing, ideology, or
availability rather than similarity. A five-point similarity judgment
keeps the interaction simple while preserving useful nuance.

## Optional detailed ratings

Detailed attributes explain why a product ranks where it does. They
should be category-specific and optional. They do not replace the
explicit Overall Similarity score.

| **Category**               | **Possible optional dimensions**                                 |
| -------------------------- | ---------------------------------------------------------------- |
| Ground Beef                | Taste; texture; browning/cooking behavior                        |
| Mozzarella                 | Taste; texture; melt; stretch                                    |
| Milk                       | Taste; mouthfeel; drinking experience; coffee/cereal performance |
| Future leather alternative | Appearance; feel; flexibility; durability                        |

## Conventional-product familiarity

Users may optionally indicate how recently they consumed the
conventional product. This should not change the weight of their ranking
contribution, but it can support informative subgroup statistics on
product detail pages.

## Leaderboard calculation

Top should use a Bayesian or equivalent confidence-weighted model rather
than a raw average. Sample size must matter so a new product with two
5/5 ratings does not instantly outrank an established product with
thousands of strong ratings. Exact constants should be configurable and
determined empirically during implementation.

## Ranking views

| **View** | **Purpose**                   | **Primary behavior**                                                          |
| -------- | ----------------------------- | ----------------------------------------------------------------------------- |
| Top      | Canonical answer              | Confidence-weighted lifetime/current-formula similarity ranking.              |
| Trending | Discovery for rising products | Recent rating velocity and strong recent support; time-sensitive.             |
| New      | Cold-start visibility         | Recently added products before they have enough evidence to rank confidently. |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Natural discovery lifecycle</strong></p>
<p>New → Trending → Top</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 06 Product Detail & Contributions

Category pages answer “what ranks highest?” Product pages answer “why,
what exactly is this product, and where can I find it?”

## Product detail information

| **Area**         | **Content**                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Identity         | Product name, brand, country, product family, current formula                                 |
| Ranking          | Rank position by category, similarity score, rating count, Tried count                        |
| Community detail | Optional taste/texture/etc. aggregates, comments, conventional-product familiarity statistics |
| Evidence         | Canonical package photos, ingredient panel, nutrition/allergen image where useful             |
| Availability     | Commonly found retailers                                                                      |
| History          | Formula versions, discontinuation, reformulation notes                                        |
| Related          | Variants and other replacement categories                                                     |

## Comments

Comments belong to products and should add context to the comparison.
VeganAlts should not create independent forum threads or a general
social feed in the initial product.

_Useful example: “Very close in tacos, but I notice the difference more
when it is used as a burger.”_

## Product additions

Adding a missing product is intentionally lower risk than changing an
established product. An authenticated user should be able to submit a
product with a minimal required set of identity and category
information, after which the community can rate, correct, report, and
enrich it.

- Product name

- Brand

- Country

- Replacement category

- Primary product photo

- Available vegan / plant-based evidence

Duplicate detection should be part of the submission flow. New products
can appear with a visible New state rather than waiting for manual
approval by default.

## Photos

Product pages should use canonical image slots rather than becoming
photo feeds. Useful slots include Front, Back, Ingredients,
Nutrition/Allergens, and Prepared Product. Once a slot is filled, the
action becomes “Suggest a better photo,” preserving the old image in
history where appropriate.

# 07 Trust, Moderation & Revision History

VeganAlts should scale by accumulating confidence rather than manually
approving every contribution. Subjective opinions publish quickly;
established facts receive protection proportional to their impact.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Moderation principle</strong></p>
<p>Opinions publish immediately. Facts accumulate confidence.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Proposed-change model

Edits to established canonical facts should create Proposed Changes
instead of immediately overwriting the public record. A proposal can
contain the new value, explanation, photos, supporting URLs, and the
contributor identity. Other contributors can Confirm, Disagree, or Add
Evidence.

## Risk-based moderation

| **Tier**        | **Examples**                                                                                                                | **Default behavior**                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1 · Low risk    | Ratings, comments, existing retailer confirmation, simple low-impact availability data                                      | Publish immediately or near-immediately; remain reportable.                           |
| 2 · Confirmable | Packaging update, new variant, discontinued status, retailer removal, product rename, certain formula updates               | Create proposal; publish after enough independent confirmations or contributor trust. |
| 3 · Protected   | Vegan-status change, major formula change, merge, deletion, major category reassignment, changing an established brand/name | Require strong corroboration, trusted review, and/or manual moderation.               |

## Adaptive protection

The threshold for a factual change can increase as a product becomes
more established. A newly submitted record with two ratings does not
need the same protection as the \#1 alternative with 15,000 ratings.

## Contributor trust

An internal contributor-trust model can eventually consider account age,
contribution volume, accepted edits, useful evidence, accurate reports,
and retailer confirmations. Higher trust can reduce the number of
independent confirmations required for factual edits.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Important separation</strong></p>
<p>Contributor reputation may influence moderation confidence. It must
not make that person’s similarity rating count more than someone else’s
rating.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Reports

| **Object** | **Example report reasons**                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------- |
| Product    | Not vegan; incorrect information; duplicate; discontinued; wrong category; misleading information |
| Photo      | Wrong product; outdated; poor quality; inappropriate; copyright concern                           |
| Comment    | Spam; harassment; off-topic; misleading product information                                       |

## Revision history

Meaningful product changes should remain reversible and attributable.
Formula versions, discontinued states, canonical photo replacements, and
protected metadata edits should preserve prior states rather than
destroying them.

# 08 Vegan / Plant-Based Classification

VeganAlts needs a consistent operational definition without pretending
to be a certification authority or turning product eligibility into a
popularity vote.

## Operational rule

Vegan status is primarily ingredient-based. Community members may
disagree with a company or its practices, but that disagreement should
not silently redefine an ingredient fact. Manufacturer labeling and
formal certification are stored separately from VeganAlts’ own evidence
status.

## Suggested status model

| **Status**    | **Meaning**                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vegan         | Available evidence supports that the product contains no animal-derived ingredients.                                                                  |
| Appears Vegan | No known animal-derived ingredients are identified, but evidence is incomplete or not yet strong enough for full verification.                        |
| Plant-Based   | Manufacturer or market positioning uses plant-based language; this can coexist with other metadata and does not automatically guarantee vegan status. |
| Under Review  | A credible ingredient or classification concern is pending resolution.                                                                                |

## Separate metadata

- Manufacturer label: Vegan / Plant-Based / neither / unknown.

- Certification: named third-party certification when known.

- Evidence: package/ingredient photos and supporting manufacturer
  information.

- Formula-specific status: classification may change when the product is
  reformulated.

## Ingredient evidence

A typed ingredient list is not required for v1. Package images can act
as the supporting source of truth. Structured ingredient transcription
or extraction can be introduced later if it becomes useful.

# 09 Retailers & Availability

VeganAlts should help people know where a product is commonly sold
without becoming a real-time inventory platform.

## Availability model

Product pages should say “Commonly found at” and list canonical retailer
chains. Individual store locations and live stock are explicitly outside
the initial product.

## Canonical retailer records

Users should select a retailer from an existing searchable list rather
than type arbitrary free text. This prevents duplicate records such as
Walmart, Wal-Mart, Wallmart, and Walmart Supercenter when the intended
concept is the same retailer chain.

## Adding a retailer

If a retailer does not exist, a deliberate “Add retailer” flow can
create a canonical record with name, country, website, and
aliases/search terms. Retailer additions can use the same report and
correction system as other low-risk catalog data.

## What v1 should not attempt

- Live inventory

- Per-store quantities

- Real-time prices

- Store-by-store location records

- Delivery integrations

# 10 Profiles & Community Identity

Persistent identity gives contributions accountability and lets users
build a personal history without requiring VeganAlts to become a social
network.

## Public profile

- User-chosen handle / username.

- Optional profile image if supported.

- Products tried.

- Similarity ratings submitted.

- Products added.

- Accepted or verified edits.

- Retailer confirmations and other contribution counts.

## My Ratings

The first iteration should use one unified list of everything the user
has rated rather than building separate “My Meat,” “My Dairy,” or
category-specific profile sections. The list can be sorted by Recently
Rated, Highest Similarity, or Lowest Similarity and later gain
search/filter controls.

## What profiles do not need initially

- Followers

- Direct messages

- User feeds

- General posts

- Standalone discussion threads

## Future contributor recognition

Trusted Contributor badges or contribution milestones may eventually
recognize reliable editors, borrowing the useful
community-accountability pattern seen in platforms such as HappyCow.
This should remain secondary to the ranking experience.

# 11 Launch Strategy & Cold Start

The biggest early product risk is not competition. It is insufficient
density: empty categories, products with one rating, and a community
ranking that does not yet feel trustworthy.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Launch principle</strong></p>
<p>Depth is more valuable than breadth. Ten useful ranking pages beat
ten thousand empty product pages.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Initial dataset

Launch should be manually seeded rather than completely empty. A
practical initial target is one country, roughly 10–20 high-value
categories, and about 5–15 credible alternatives per category, producing
approximately 100–300 product records.

## Candidate high-value categories

- Ground Beef

- Beef Burgers

- Chicken Nuggets

- Bacon

- Sausage

- Milk

- Butter

- Cheddar

- Mozzarella

- Parmesan

- Cream Cheese

- Eggs

- Mayonnaise

- Ice Cream

- Milk Chocolate

## Data-source stance

V1 should not depend on Open Food Facts or another external catalog as
its foundational database. Exact product matching, licensing
constraints, formula differences, and schema mismatch can create more
complexity than they remove. The initial catalog can be manually seeded
and then increasingly community-maintained.

## Launch market

The first country remains an explicit open decision. The market should
be chosen based on product density, ability to seed accurate records,
likely early community participation, and the owner’s ability to
moderate the initial catalog.

# 12 Growth, SEO & Ecosystem

Web-first distribution is a product decision, not merely an
implementation preference. Each category and product naturally forms a
searchable answer page for a high-intent question.

## SEO

Every useful category and product should have a stable, indexable URL.
Search intent such as “vegan mozzarella closest to dairy mozzarella,”
“vegan ground beef that tastes like beef,” and country-specific
equivalents should map naturally to ranking pages rather than articles.

## Community flywheel

1.  Search or shared link brings a visitor to a useful ranking.

2.  The visitor tries one of the alternatives.

3.  They return and rate the product.

4.  Their contribution improves the ranking for the next visitor.

5.  Power users add missing products, evidence, retailers, and
    corrections.

## HappyCow relationship

HappyCow is complementary rather than directly competitive. HappyCow
primarily answers “Where can I find vegan food?” VeganAlts answers
“Which alternative comes closest to what I am trying to replace?”
HappyCow is also a useful reference model for persistent contributor
identity, community-submitted records, business participation,
factual-update moderation, and global coverage.

## Potential future partnership

A future integration could connect VeganAlts restaurant-menu rankings
with HappyCow location discovery. VeganAlts could own the similarity
ranking for a menu item while HappyCow helps users find participating
locations. No current launch dependency should be created around this
possibility.

## Restaurant chain extension

Future restaurant content should rank the menu product at the
country/market level rather than create one record for every physical
restaurant location. Example: Burger King → United States → Impossible
Whopper → Beef Burger category.

# 13 Monetization & Ranking Integrity

Trust in the ordering is the core asset. Any monetization model must
preserve the belief that \#1 is \#1 because of community evidence, not
because a brand paid for it.

## Allowed future direction

Clearly labeled advertising or sponsored visibility may be considered
later. A sponsor could appear in a clearly separated placement above or
alongside a ranking, but paid placement must never alter scores or
organic order.

## Permanent integrity rule

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Non-negotiable</strong></p>
<p>Advertising may influence visibility. It must never influence
similarity scores, rating weight, or organic ranking position.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Brand participation

Brands may eventually be allowed to claim or provide evidence for their
own product records, similar to business-owner participation on mature
community platforms. Brand-supplied factual information must remain
labeled and subject to community correction; brands do not control
community ratings.

# 14 Future Expansion

The core question is broad enough to support additional verticals later,
but the first release should remain deliberately narrow.

| **Phase**         | **Potential expansion**                                             | **How the core model survives**                                                                          |
| ----------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Core              | Commercial packaged food                                            | Rank products by similarity to a conventional reference.                                                 |
| Natural extension | Chain restaurant / menu alternatives                                | Rank menu products at the country/market level; location discovery can be external or partnered.         |
| Later             | Recipes intended to mimic conventional foods                        | Separate recipe rankings under the same reference category.                                              |
| Eventually        | Leather, wool, down, and other animal-derived material alternatives | Replace food-specific dimensions with appearance, feel, durability, flexibility, and overall similarity. |

## What should not drive current scope

Future extensibility should influence the data model where inexpensive,
but it should not justify building restaurant infrastructure, recipe
systems, material taxonomies, barcode scanning, or social features
before the packaged-food ranking loop is validated.

# 15 Explicit Non-Goals

These boundaries protect the product from becoming another broad vegan
platform before its core ranking value is proven.

| — General discussion forum        | — Order fulfillment                       |
| --------------------------------- | ----------------------------------------- |
| — Social feed or follower network | — Generic 5-star review database          |
| — Vegan news/blog publication     | — Ingredient-scanner app                  |
| — Recipe website in v1            | — Comprehensive nutrition platform        |
| — Restaurant directory            | — Editorial “best products” publication   |
| — Real-time retail inventory      | — All-purpose vegan lifestyle application |
| — Ecommerce marketplace           |                                           |

# 16 Core Data Model

This is a conceptual model, not an implementation schema. It exists so
later architecture work preserves the product relationships established
in this master.

| **Concept**                   | **Role**                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| Country                       | Defines market context.                                                                       |
| Category                      | The conventional product being replaced.                                                      |
| Product Family                | Links related products across markets and variants.                                           |
| Product                       | Country-specific commercial product record.                                                   |
| Formula Version               | Preserves material reformulations and historical ratings.                                     |
| Product–Category Relationship | Allows one product to participate in multiple replacement categories with independent scores. |
| Rating                        | User + category + formula-specific Overall Similarity judgment.                               |
| Detailed Rating               | Optional category-specific attributes such as taste, texture, melt, stretch, or cooking.      |
| User                          | Persistent contributor identity and rating history.                                           |
| Comment                       | Product-level contextual discussion.                                                          |
| Retailer                      | Canonical country-aware retailer chain.                                                       |
| Product–Retailer Relationship | Community-supported “commonly found at” availability.                                         |
| Photo / Evidence              | Canonical images associated with a product or formula.                                        |
| Edit Proposal                 | Suggested factual modification to an established record.                                      |
| Edit Confirmation             | Independent evidence/confirmation for a proposal.                                             |
| Report                        | Moderation signal for a product, photo, comment, or other content.                            |
| Revision History              | Audit trail for meaningful factual changes.                                                   |

# 17 Success Signals

Early success should be measured by whether VeganAlts becomes a
progressively more useful answer system, not by account registrations
alone.

- Visitors reach category ranking pages from search or shared links.

- Visitors open top-ranked product details.

- Signed-in users submit Overall Similarity ratings.

- Users rate multiple products rather than only one.

- Community members add missing alternatives.

- Retailer and product information gains independent confirmations.

- Contributors return and build a rating history.

- Key categories reach enough rating density that rankings feel
  trustworthy.

- New products can surface through New and Trending rather than
  remaining buried.

- Search traffic increasingly lands directly on useful category/product
  pages.

## North-star qualitative test

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>The question to keep asking</strong></p>
<p>If someone wants to replace a product they already love, does
VeganAlts give them a more trustworthy and faster answer than searching
Reddit, generic reviews, store pages, or editorial lists?</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>

# 18 Open Decisions & Next Planning

These questions should be resolved during milestone planning or
implementation research. They do not block Product Master v1.0.

| **Decision**                         | **Current direction**                                      | **When to settle**                            |
| ------------------------------------ | ---------------------------------------------------------- | --------------------------------------------- |
| Initial launch country               | United States                                              | Decided for milestone 2.                      |
| Initial category list                | 10–20 high-value categories                                | Before seed-data work.                        |
| Public rating presentation           | 4.2/5, without an attached label                           | Decided for milestone 2.                      |
| Bayesian constants / priors          | Configurable confidence weighting                          | During implementation and testing.            |
| Standalone Tried action              | Useful but not required for core rating flow               | During UX design.                             |
| Authentication providers             | TBD                                                        | Before contribution implementation.           |
| Public handle rules                  | Persistent user profile required                           | Before account/profile implementation.        |
| Trusted-contributor thresholds       | Internal confidence model later                            | When moderation volume justifies it.          |
| Automatic edit acceptance thresholds | Risk-based                                                 | During moderation implementation.             |
| New-product minimum fields           | Name, brand, country, category, photo/evidence as baseline | During contribution-flow design.              |
| Vegan evidence threshold             | Ingredient-based with explicit status tiers                | During moderation/data-policy implementation. |

## Recommended first milestone boundary

The smallest complete product loop is: category discovery → leaderboard
→ product detail → sign-in → Overall Similarity rating → updated
community result. Advanced moderation, reputation, restaurant items,
recipes, and non-food expansion should follow after this loop exists and
feels useful.

# Appendix A Research & Product Patterns

These products are useful references for patterns, not blueprints to
copy wholesale. VeganAlts stays narrower than most of them.

| **Reference**                | **Relevant pattern for VeganAlts**                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HappyCow                     | Community-supported vegan restaurant discovery; contributor identity; moderated factual updates; business-owner participation; future complementary partner rather than direct competitor. |
| Google Maps                  | Confidence-based factual edits; suggested changes can be accepted, rejected, or corroborated by other data/users; model for high-volume change moderation.                                 |
| Wikipedia                    | Progressive protection and pending-change patterns for higher-risk content.                                                                                                                |
| OpenStreetMap                | Open contribution with attribution, reversibility, community review, and vandalism response.                                                                                               |
| Open Food Facts              | Product evidence photos, revision history, community product data; useful pattern but not recommended as a foundational v1 data dependency.                                                |
| Product Hunt / AlternativeTo | Simple public ranking presentation and anti-manipulation lesson; VeganAlts uses richer similarity input under the hood.                                                                    |
| Vegan Oasis / NomNomVegan    | Adjacent broad vegan discovery/community tools; evidence that the space exists but also a warning against feature sprawl.                                                                  |
| abillion                     | Historical evidence of large-scale interest in community vegan product discovery; also reinforces the value of a focused, sustainable scope.                                               |

## Selected public references

**HappyCow statistics:**
[<u>https://www.happycow.net/reports/stats</u>](https://www.happycow.net/reports/stats)

**HappyCow member FAQ:**
[<u>https://www.happycow.net/members/faq</u>](https://www.happycow.net/members/faq)

**HappyCow business FAQ:**
[<u>https://www.happycow.net/business/faq</u>](https://www.happycow.net/business/faq)

**Google Maps / Business Profile edits:**
[<u>https://support.google.com/business/answer/3480441</u>](https://support.google.com/business/answer/3480441)

**Open Food Facts support / data quality:**
[<u>https://support.openfoodfacts.org/</u>](https://support.openfoodfacts.org/)

**OpenStreetMap vandalism / community processes:**
[<u>https://wiki.openstreetmap.org/wiki/Vandalism</u>](https://wiki.openstreetmap.org/wiki/Vandalism)

**MediaWiki pending changes:**
[<u>https://www.mediawiki.org/wiki/Help:Pending_changes</u>](https://www.mediawiki.org/wiki/Help:Pending_changes)

# Appendix B Quick Policy Reference

A compact set of rules intended to prevent future implementation
decisions from drifting away from the product thesis.

| **Question**                                      | **v1.0 policy**                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| What is ranked?                                   | How closely a vegan alternative replaces a specific conventional product in a specific country. |
| What is required to rate?                         | Authenticated user + Overall Similarity score.                                                  |
| Are there downvotes?                              | No. Similarity scoring is the primary signal.                                                   |
| Do optional details affect overall automatically? | No. Overall Similarity is independently supplied.                                               |
| Can one product appear in multiple categories?    | Yes, with independent ratings for each category.                                                |
| Do reformulations create new public products?     | No. Create a new Formula Version under the existing product.                                    |
| Do old ratings carry into a new formula?          | No. They remain historical and attached to the formula experienced.                             |
| Can anyone add a product?                         | Authenticated users should be able to, with duplicate checks and post-publication moderation.   |
| Can anyone rewrite an established product?        | No. Material changes use proposed edits, evidence, confirmation, and risk-based moderation.     |
| Can contributor reputation affect rankings?       | No. It may affect edit/moderation confidence only.                                              |
| How is “vegan” defined?                           | Ingredient-based operationally; manufacturer labels/certifications are separate metadata.       |
| Can brands pay to rank higher?                    | Never.                                                                                          |
| Can brands advertise later?                       | Potentially, if sponsored visibility is clearly separated from organic rankings.                |
| Does v1 include live store inventory?             | No. Only commonly found retailers.                                                              |
| Does v1 include recipes or restaurants?           | No. Both are natural later extensions.                                                          |
| Does v1 require an app?                           | No. Web first.                                                                                  |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<thead>
<tr class="header">
<th><p><strong>Final product guardrail</strong></p>
<p>Everything added to VeganAlts should strengthen the path from “I want
to replace this” to “the community gives me a trustworthy alternative to
try.” If a feature does not improve that loop or the data behind it, it
is probably not part of the core product.</p></th>
</tr>
</thead>
<tbody>
</tbody>
</table>
## Milestone 2 implementation decisions

The accepted [milestone specification](MILESTONE_2_PLAN.md) fixes the United States catalog, one-tap 1–5 ratings, and automatic submission of a tab-scoped selection after sign-in. A changed formula/category requires a fresh selection. Individual rating history remains private in My Ratings; public profiles expose only chosen identity and contribution counts.

Local and staging catalog records are approved fictional development fixtures. Demo images, identities and deterministic sample ratings are visibly labeled; they are not verified manufacturer claims or organic community feedback. Repeat seeding preserves real accounts, contributions and historical verification records. Production seeding is prohibited. Production retains its coming-soon page through this milestone.

## Milestone 3 implementation decisions

The approved [milestone 3 specification](MILESTONE_3_PLAN.md) governs community submissions, retailers, manual reporting/review, formula/lifecycle changes, classification evidence and duplicate/variant management. New submissions require a front photo and ingredient-panel photo or manufacturer ingredient source; deterministic validation precedes canonical insertion. Automatic publication is provisional; Vegan classification and Under Review require operator assessment. Separate formula-specific evidence, manufacturer wording and known certification. Duplicate consolidation archives the donor without transferring its ratings or metadata, leaves the survivor unchanged, and remains reversible. Public comment reporting is deferred to the comment feature while its shared reporting contract is tested here. Staging is the delivery destination; production launch, external AI moderation, community acceptance voting and contributor trust remain later work.
