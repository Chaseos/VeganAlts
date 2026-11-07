# Products sold in more than one country: plan

Stage 1 is built. The first release is USA only (owner, 2026-11-06), so this work comes in two stages:

- **Stage 1, before launch (done):** the structure only, steps 1 and 2 of the build order. Nothing changes for visitors.
- **Stage 2, before a second country opens:** steps 3 to 8, including search, buttons and the add flow.

## 1. Goal

Every country has its own product records and starts empty, so the same real product would be added again in each country, splitting its votes. A product should be one record, sold in as many countries as people confirm, with one set of ratings. A shopper who searches an empty country should still find it, and can add it there with one tap.

## 2. How it works today

| Fact | Evidence | What it means |
|---|---|---|
| A product belongs to one country | `products.country_id`, `ux_products_country_id_slug`, triggers in `0001_initial.sql` | The same real product is one row per country |
| A line belongs to one country | `product_families.country_id`; `PRODUCT_MASTER.md` line 1181 | Lines stay with their home country in this design |
| Ratings and stats have no country | `ratings`, `family_category_stats`, `comments` | They follow the product, so they need no change |
| Ranks are worked out at read time | `ROW_NUMBER()` in `d1-repository.ts` | Each country can rank a different set from the same scores |
| Stores and foods are per country | `retailer_markets`, `category_countries` | They stay per country |
| Search entries carry one country | `search_index.country_code` | A shared product needs one entry per country |
| Purges name one country | `public-cache.ts` | A change must purge every country a product is in |
| Raters have no country | No column, and nothing is inferred from IP | Votes count everywhere |

## 3. Design

```sql
CREATE TABLE product_countries (
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  country_id text NOT NULL REFERENCES countries(id),
  source text NOT NULL,      -- 'home', 'member' or 'operator'
  created_by text REFERENCES profiles(user_id),
  created_at integer NOT NULL,
  PRIMARY KEY (product_id, country_id)
);
```

- `products.country_id` stays as the product's **home country**: where its label, slug, identity and line live. Every product has a `home` row here, so reads have one place to look.
- A country's catalog is every product with a row for that country. Catalog reads change from `p.country_id=?` to a join on this table, starting from `productJoins`.
- Votes stay on the product, so one set of ratings counts everywhere. Each country ranks the lines that have a product sold there, so ranks can differ between countries while scores match.
- A line shows only the flavors sold in the visitor's country.
- Marking a product in a country also switches its foods on there, the way adding a product does today.
- Stores stay per country and are added separately.
- A product page has "Also sold in: Germany, Austria" and a "Sold here too" button.

**Addresses.** `/at/de/products/x` works once the product is sold in Austria. Product slugs end in an ID, so they can't collide across countries. Each country's page keeps its own canonical, and language links name every country it's sold in.

## 4. Search

Search still shows local results first. Below them is a new section:

```text
Results in Austria
  ...
From nearby countries
  Oatly Barista · Germany · 4.2          [Sold here too]
```

- **Nearby** comes from a short list in code, such as Austria to Germany and Switzerland. If local and nearby both find nothing, search looks worldwide.
- Rankings never show these products. Only search and instant suggestions do, and suggestions place them below local results.
- Search runs a second, small query on `search_index.country_code`. Measure it, and leave the section off if it adds noticeable time.
- The button needs a signed-in account; signed-out visitors go to sign-in, then return. Public pages stay shared and cached, so the button works after hydration, like saving a product.

## 5. Avoiding duplicates

- Adding a product in Austria checks the current identity rule across nearby countries too, and offers "Sold here too" before creating a new record. This check is the core of the feature.
- **A different recipe here:** a product differs by country sometimes, which is why lines are per country today. The add flow and product page offer "Different recipe here". It removes the country's mark, and the contributor adds a separate product there.
- **Not sold here:** a product report on the page, with a reason that removes the mark after a report from a second account, or at once by an operator.

## 6. Who can mark a product

Any active signed-in account, within the existing contribution limits. It applies at once with no model call, because it changes no facts. It's recorded in the audit log, and an operator can undo it. A product removed or hidden in its home country is hidden everywhere.

## 7. Allergens

This is the main risk. A declaration records what the label said against the home country's list. Lists differ: Canada, the EU, the US and Japan all name different items, so "no major allergens" means different things.

- **First version:** a product can only be marked in a country whose allergen list matches its home's. The EU countries share one list, so this covers the European groups. A country with a different list shows the product in search, with no "Sold here too" button.
- Any page with a shared product says which country's label the allergens came from.
- A later version could allow different lists, showing "Check the package" instead of a declaration.

## 8. Rules to change

`PRODUCT_MASTER.md` line 85 locks "Country-specific product records and rankings", and line 94 requires an intentional revision. Proposed wording:

> Each product has a home country. It may also be sold in other countries that share its allergen list, once a member confirms it. Ratings belong to the product, and each country ranks the products sold there. A different recipe is a separate product.

Also update line 1120, line 1181, `docs/RANKING.md` lines 252 and 371, `docs/MODERATION.md`, and the `AGENTS.md` milestone 7 paragraph. The country menu's copy on rankings coming from people who live there changes too.

## 9. Build order

1. Revise the locked rule. Add `product_countries` to `0001_initial.sql`, filled with a `home` row for every product, and keep it filled through add and import paths.
2. Switch catalog reads in `d1-repository.ts`, `brand-rows.ts` and `d1-ranking-reader.ts`, with an index on `(country_id, product_id)`. Compare page speed before and after, using a quiet machine. Still on the home country, for stage 2: a line's lead flavor, which must be sold in the country for the line to rank there; store filters; search entries; sitemap; and purges.
3. Search: one entry per country in `search-index.ts`, kept current when a mark changes.
4. Write paths: mark, unmark, "Different recipe here", audit and limits.
5. Add a product: the cross-country check.
6. Interface: "Also sold in", the search section, buttons, and labels from which country, in every language.
7. Cache: purge every country a product is in. The sitemap lists each country's page.
8. Trending is already global per food, a separate bug. Scope it to the visitor's country here.

## 10. Testing

- Marking a product in Austria adds it to Austria's ranking and search, with one set of votes.
- A rating from either country changes the same score, and ranks can differ between countries.
- Search in Austria shows a German product under nearby, and never in a ranking.
- Adding a matching product in Austria offers "Sold here too", and creates nothing if accepted.
- "Different recipe here" removes the mark and allows a new product.
- A country with a different allergen list can't mark the product.
- A change purges every country.
- A country with no shared products behaves exactly as it does today.

## 11. Decisions

Approved by the owner on 2026-11-06.

| # | Decision | Answer |
|---|---|---|
| 1 | Revise the locked geography rule | Yes |
| 2 | Limit sharing to matching allergen lists at first | Yes |
| 3 | Nearby groups: Germany, Austria, Switzerland; France, Belgium, Luxembourg; Spain, Portugal; UK, Ireland; Australia, New Zealand; US, Canada | Yes, for suggestions only |
| 4 | Search worldwide when nothing nearby matches | Yes |
| 5 | Removing a wrong mark: two reports or an operator | Yes |
