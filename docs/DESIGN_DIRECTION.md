# VeganAlts Design Direction

Agreed on 2026-10-08 after three rounds of design exploration. This document records **how VeganAlts looks and is navigated**. Product behavior, ranking semantics and moderation remain governed by the [product master](PRODUCT_MASTER.md), [ranking](RANKING.md) and [moderation](MODERATION.md) documents. Where a direction below needs a behavior change, it is listed in [§9](#9-required-specification-changes) and is not in effect until those documents are amended.

The design canvas ("VeganAlts Directory", the "Round 4 · Foundations" and "Round 5 · Screens" pages) holds the visual reference. It is private to the project owner; this document is the shareable source of truth.

## 1. Who it is for

The primary user eats a conventional food today and wants the closest vegan version of it. They usually decide in a store aisle or a kitchen, often on a phone. Every screen should answer "what should I buy instead of X?" before anything else.

## 2. Settled decisions

| Area           | Decision                                                                                                                                                                                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concept        | "The swap aisle": a well-signed grocery store. Aisle navigation, shelf-label scores, a flag on the closest match.                                                                                                                                                                                                                       |
| Themes         | Light and dark from the start, both designed and contrast-checked.                                                                                                                                                                                                                                                                      |
| Voice          | "Swap" in interface copy ("Find swaps", "#1 swap"). "Alternatives" in page titles, headings that need search visibility and metadata ("Vegan alternatives to ground beef").                                                                                                                                                             |
| Browsing       | Aisle bar with three levels: aisle → shelf → food (Meat → Pork → Bacon). Each aisle opens a menu showing every food with its top three products. The aisles, shelves, foods and products on the canvas are samples; the real structure comes from the managed taxonomy.                                                                 |
| Home           | Search first, with instant answers and Start with these beside it. Then Browse every food, followed by Trending now, New and needs ratings, and Still waiting for a great swap.                                                                                                                                                         |
| Early products | Products with 1–9 counted ratings stay in the ranking with an **Early** badge (unchanged locked rule). Unrated products stay listed separately.                                                                                                                                                                                         |
| Category views | One sort menu: Closest match (Top, default), Trending, Newest, Best taste / texture / other food-specific details, Most rated. The #1 card appears only for Closest match.                                                                                                                                                              |
| Rating form    | Overall similarity required. Optional food-specific detail scores. Optional "When did you last eat the original?"                                                                                                                                                                                                                       |
| Store          | Not in the header, because stores differ by country. Multi-select: people pick every store near them from the "Sold at" filter on rankings, or by tapping stores in a product's "Commonly found at" list. A product qualifies if any chosen store carries it. Saved on the device for the current country and applied to every ranking. |
| Allergens      | In the first redesign. Community-added and community-confirmed with label-photo evidence.                                                                                                                                                                                                                                               |
| Country        | A working country switcher from day one, even while only the United States has rankings.                                                                                                                                                                                                                                                |
| Screen sizes   | Phone and desktop designed side by side for every screen.                                                                                                                                                                                                                                                                               |
| Imagery        | Member package photos (the five canonical slots) and line icons for aisles and foods. No stock or lifestyle photography.                                                                                                                                                                                                                |
| Logo           | Direction D, the tagged wordmark: "Vegan" followed by "Alts" inside a yellow shelf label. Chosen for now; refinement continues on the canvas.                                                                                                                                                                                           |
| Workflow       | Screens are approved on the canvas, then become the Milestone 5 plan and issues, then code.                                                                                                                                                                                                                                             |

## 3. Visual system

### Color tokens

Tokens are CSS custom properties. Light is the default; dark applies through `prefers-color-scheme` and an explicit `data-theme` choice. Components use tokens only, never literal colors.

| Token                            | Light                 | Dark                  | Use                                                                          |
| -------------------------------- | --------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `--va-ground`                    | `#F3F4EE`             | `#0E1612`             | Page background                                                              |
| `--va-surface`                   | `#FFFFFF`             | `#18231D`             | Cards, menus, product rows                                                   |
| `--va-surface-2`                 | `#EEF0E8`             | `#22302A`             | Wells, photo placeholders, inactive tags                                     |
| `--va-ink`                       | `#15231B`             | `#EEF2EA`             | Primary text                                                                 |
| `--va-ink-2`                     | `#2E3D33`             | `#C8D3CB`             | Secondary text                                                               |
| `--va-muted`                     | `#56645A`             | `#9AAB9F`             | Tertiary text, captions                                                      |
| `--va-line`                      | `#DDE1D5`             | `#2C3B33`             | Dividers                                                                     |
| `--va-line-strong`               | `#C3C9B9`             | `#46594F`             | Control borders                                                              |
| `--va-kale`                      | `#12372A`             | `#163A2C`             | Header, aisle bar, footer                                                    |
| `--va-kale-2`                    | `#1C4A39`             | `#1F4A39`             | Hover and open states on kale                                                |
| `--va-kale-line`                 | `#24503F`             | `#2B5644`             | Dividers and borders on kale                                                 |
| `--va-on-kale`                   | `#F3F4EE`             | `#F1F5EF`             | Text on kale                                                                 |
| `--va-on-kale-muted`             | `#B9CBBE`             | `#A9BDAF`             | Secondary text on kale                                                       |
| `--va-field` / `--va-field-line` | `#FFFFFF` / `#C3C9B9` | `#22302A` / `#46594F` | Search boxes and inputs                                                      |
| `--va-tag`                       | `#FFD84D`             | `#FFD84D`             | Score labels and the logo label (same in both themes)                        |
| `--va-on-tag`                    | `#15231B`             | `#15231B`             | Text on score labels                                                         |
| `--va-flag`                      | `#D63A20`             | `#D63A20`             | #1 flag background                                                           |
| `--va-on-flag`                   | `#FFFFFF`             | `#FFFFFF`             | Text on the flag                                                             |
| `--va-flag-text`                 | `#C2361D`             | `#FF8A6E`             | Red used as text, such as the #1 rank numeral                                |
| `--va-btn`                       | `#12372A`             | `#A8DDB5`             | Primary button and every selected control (chips, toggles, active sort cell) |
| `--va-on-btn`                    | `#F3F4EE`             | `#0E1612`             | Text on primary and selected controls                                        |
| `--va-emphasis`                  | `#15231B`             | `#A8DDB5`             | Border of the #1 card and the rating card                                    |
| `--va-good-bg` / `--va-good`     | `#DDEFD9` / `#12372A` | `#1F3D2E` / `#A9E0B8` | Vegan status, positive badges                                                |
| `--va-warn-bg` / `--va-warn`     | `#FFF1CC` / `#6B4A00` | `#3B2F12` / `#FFD98A` | Allergen "Contains" labels                                                   |
| `--va-focus`                     | `#1F7A4D`             | `#FFD84D`             | Focus ring (3 px)                                                            |

All text meets WCAG 2.2 AA (4.5:1, or 3:1 at 24 px and above). Red and green are never the only difference between states; every flag and badge carries text.

Dark mode rules: the header sits lighter than the page so it reads as a band; each layer (page, card, well) steps up visibly; selected states use the mint primary color with dark text rather than dark green; red text uses `--va-flag-text`, never `--va-flag`.

### Logo

The tagged wordmark: "Vegan" in Archivo 800 at width 118, followed by "Alts" inside a yellow shelf label (`--va-tag`, dark text, 4–6 px radius). The label stays yellow in every theme and on the kale header, so the logo and the score labels read as one system. The app icon and favicon are "VA" on a yellow tile. Spacing, minimum size and lockups are still being refined.

### Type

One family, **Archivo** (variable: width 62–125, weight 100–900), fallback `"Helvetica Neue", Arial, sans-serif`.

| Role                    | Desktop      | Phone        | Setting                           |
| ----------------------- | ------------ | ------------ | --------------------------------- |
| Display XL (home)       | 72 / 0.98    | 40 / 1.02    | 800, width 118, tracking −0.03em  |
| Display L (page titles) | 56 / 1.0     | 34 / 1.02    | 800, width 115, tracking −0.025em |
| Heading M               | 28 / 1.1     | 22 / 1.15    | 800, width 112                    |
| Heading S               | 20 / 1.2     | 18 / 1.2     | 800, width 110                    |
| Body L                  | 18 / 1.55    | 17 / 1.5     | 400                               |
| Body                    | 16 / 1.45    | 16 / 1.45    | 400, 600, 700                     |
| Small                   | 14 / 1.4     | 14 / 1.4     | 400, 600                          |
| Caption                 | 13 / 1.35    | 13 / 1.35    | 400, 700                          |
| Score numerals          | by component | by component | 800, width 70–72, tabular figures |

### Shape and spacing

- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px.
- Radii: score labels 4–5 px, buttons 8–10 px, cards 12–16 px, chips fully rounded.
- Card styling is reserved for things that are objects (a product, a food card, a menu). Lists use dividers.
- Touch targets are at least 44 × 44 px.

## 4. Signature components

- **Score label.** The yellow shelf label. Always reads as a score, never a price: large and medium sizes say "out of 5" under the number; compact sizes append "/5". Format follows the locked rule (`4.6/5`, no word label).
- **#1 flag.** One red flag per list, on the closest match only. Under filters it names why the product leads ("Closest match · soy-free").
- **Badges.** Early (1–9 ratings), New, and detail winners ("Best taste") when a product other than #1 leads a detail.
- **Vegan status chip.** Vegan, Appears vegan, Plant-based, Under review, matching the classification model.
- **Allergen label and Free-from filter.** "Contains soy, wheat" on products; "Free from" chips on rankings. Always paired with "Always check the package."
- **Aisle bar and aisle menu.** Header bar of aisles; the menu shows shelves in a rail and food cards with each food's top three.
- **Search with instant answers.** Matching foods show their #1 swap and score; matching products show their rank. A preview of the pointed-at food fills the space beside the results.
- **Sort menu.** One control for Closest match, Trending, Newest, detail sorts and Most rated.
- **Country switcher.** In the header on every page. Changing country changes every ranking and the list of stores.
- **Store filter.** "Sold at" sits with the sort and Free-from filters on rankings. It opens a checklist of stores (a popover on desktop, an inline panel on phones), shows each store's number of ranked swaps, and summarizes the choice on the button ("Target, Kroger" or "Target + 2 more"). Rows name which of the chosen stores carry the product. A product's "Commonly found at" stores can be tapped to add or remove them. The list only shows stores members report in the current country.
- **Rating form.** Overall 1–5 first; detail scores and "last ate the original" appear as optional follow-ups.

## 5. Page structure

- **Home.** Search hero with instant answers and Start with these; Browse every food by aisle and shelf; Trending now; New and needs ratings; Still waiting for a great swap.
- **Aisle menu.** Shelf rail, filter box, food cards with top three, "Suggest a food".
- **Category.** Summary sentence naming the leader and the main tradeoff; sort menu, store and Free-from filters; #1 card with detail scores; ranked rows with detail mini-scores, allergen line and badges; unrated products; aisle sidebar on desktop.
- **Product.** Photos (five slots); name, vegan status, allergen label; score card with #1 flag, rating count, recent-eaters score and detail scores; commonly found at; rating form; how people rated it; notes (comments); also ranked for; other swaps; product facts.
- **Phone.** Same order. The aisle menu becomes an accordion; sort and filters become chip rows; the rating form uses five large buttons.

## 6. Presentation rules

- Trending, Newest and detail sorts never change the Top order or score; the page says so where it explains scores.
- The chosen stores live in device storage, keyed by country, not in an authenticated cookie, so public pages stay shared-cacheable. Switching country shows "Any store" unless stores were saved for that country before.
- Aisle and shelf counts vary: the aisle bar scrolls on narrow screens, an aisle with a single shelf hides the shelf rail, and foods with fewer than three products say so.
- Retailer data reads "Commonly found at", never stock.
- Switching country changes every ranking; places with no rankings say "No rankings in [country] yet" and invite submissions.
- No auto-rotating carousels. Content that changes over time does so because the data changed.
- "Start with these" and "Still waiting" are derived from scores, never curated by brands.

## 7. Copy voice

Plain, warm and specific. Name things the way shoppers do ("ground beef", "at Target"). Lead with the answer ("Impossible Beef comes closest"). No guilt, no ideology, no exclamation marks in interface copy.

## 8. Later, not in the first redesign

- Meal swaps (for example, taco night: ground beef, cheddar, sour cream).
- A "my swaps" shopping list.
- Saving foods to avoid in an account (device-level filters ship first).
- Illustration and food photography.

## 9. Required specification changes

These presentation decisions depend on behavior that is not yet specified. Each needs an intentional amendment, per AGENTS.md, before implementation:

1. **Allergens.** Add a formula-version-scoped allergen declaration (major allergens from the label's "Contains" statement, plus optional "may contain"). Community-added and community-confirmed, requiring the current nutrition-and-allergens or ingredients photo as evidence; any disagreement routes to an operator. Reconcile with the milestone 4 rule that ingredient and nutrition photo replacement is Tier 3. Update PRODUCT_MASTER §08, MODERATION §6, DATABASE_BASELINE.
2. **Last ate the original.** Add the optional familiarity answer to ratings and a minimum sample before any subgroup score is shown. It never changes rating weight. Update RANKING §4 and DATABASE_BASELINE.
3. **Detail scores.** Activate `category_rating_dimensions` and `rating_dimension_values`: per-food dimension definitions, the rating form, aggregates in the rebuild, and detail sorts that never affect Top. Update RANKING.
4. **Three-level taxonomy.** Aisles are the first level under Food; shelves are the second; rankable foods are leaves. Cheese becomes its own aisle. Use milestone 4 taxonomy tools; update the taxonomy seed.
5. **Country switcher.** Define behavior for countries without rankings and how the choice is stored.
6. **Store preference.** Define device storage of several stores per country, the filter contract (stores come from each country's retailer markets; several stores combine with OR) and cache behavior. Update ARCHITECTURE and API.
