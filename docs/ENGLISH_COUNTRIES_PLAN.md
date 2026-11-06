# English-first countries: Singapore, South Africa and India

Planned and built locally 2026-11-05 from `develop`, on the owner's decisions below. It isn't on staging yet. This batch opens three countries in English before the [milestone 8](MILESTONE_8_PLAN.md) language work is ready. It takes one small change and a seed run.

## Scope

- Add Singapore (`/sg`), South Africa (`/za`) and India (`/in`), which brings the site to nine countries.
- No schema change and no database reset. The seed only adds rows, and every allergen below already has a key.
- English only. India can gain Hindi later through `languages.ts`, with no URL change for its English pages.
- Not included: the searchable country picker. The current menu is fine at nine countries.

## Allergen lists

Each list follows the country's own label rules, like the six existing countries (`docs/PRODUCT_MASTER.md`, allergen table). Labels shown are what readers see.

| Key | Singapore | South Africa | India |
|---|---|---|---|
| `milk` | Milk | Cow's milk | Milk |
| `egg` | Egg | Egg | Egg |
| `fish` | Fish | Fish | Fish |
| `crustacean` | Crustaceans | Crustaceans | Crustaceans |
| `mollusc` | Molluscs | Molluscs | Not listed |
| `peanut` | Peanuts | Peanuts | Peanuts |
| `tree_nuts` | Tree nuts | Tree nuts | Tree nuts |
| `soy` | Soybeans | Soybeans | Soy |
| `gluten` | Cereals containing gluten | Wheat, rye, barley and oats | Cereals containing gluten |
| `sulphites` | Sulphites (10 mg/kg or more) | Not listed | Sulphites (10 mg/kg or more) |

**Sources read.**

- **Singapore:** Singapore Food Agency, *A Guide to Food Labelling and Advertisements*, Table 2, amended to November 2025. It puts molluscs inside the fish group. They stay a separate key here, so a label naming them can be recorded and the existing animal-allergen rule applies.
- **South Africa:** R146 of 1 March 2010, the definitions of "common allergen" and "significant cereals", in the Government Gazette text. The law groups crustaceans and molluscs as one item. Hybrids such as triticale count as significant cereals.
- **India:** Food Safety and Standards (Labelling and Display) Regulations 2020, regulation 5(14), in FSSAI's compendium dated 23 September 2021. Packages declare peanuts and tree nuts together as "Nut". They stay two keys here because a contributor may see the specific nut in the ingredient list.

**Not confirmed from official text.** Check these against the gazettes before production.

- **India:** amendments after the September 2021 compendium. One unofficial page says a 2026 amendment left allergen declarations unchanged.
- **South Africa:** law firm and consultancy pages from 2026 say R3337 is still a draft and R146 still applies. I found no government notice either way, or the rule for goat's milk.
- **Singapore:** any change after November 2025.

## Changes

| File | Change |
|---|---|
| `db/seed/taxonomy.ts` | Add the three entries to `TAXONOMY_COUNTRIES`, and the exceptions and display names below |
| `tests/integration/taxonomy.test.ts` | Cover the new allergen lists and India's exceptions |
| `app/components/add-product/more-step.tsx` | Show India's vegetarian mark note |
| `docs/PRODUCT_MASTER.md` | Add the three rows to the allergen table and update the country lists |
| `docs/operations/launch-checklist.md` | Update "six countries" |
| `docs/MILESTONE_7_PLAN.md` | Mark the three as moved here in the milestone 8 list |

**Foods (owner, 2026-11-05).** New countries start from the shared aisles, not foods. The 10 launch foods and homepage features stay limited to the six launch countries through `LAUNCH_COUNTRIES`, and a food switches on when someone adds its first product. No display names are needed yet, and India needs no food exceptions.

**Empty countries (owner, 2026-11-05).** An aisle appears in a country only once it holds a product there, replacing the milestone 6 rule that showed all shared foods. This applies to every country, so an empty one shows no aisles until its first product. Add a product and Suggest a food still offer every aisle.

**Vegan marks.** The moderation rules treat a package's vegan word or mark as evidence. India's green vegetarian symbol is not one: vegetarian food can contain dairy. Its separate FSSAI vegan logo is. Add a product says so for India, beside "What does the package say?".

## Stores

No starter stores are seeded today: stores are added through the retailer proposal path. After the countries open, propose these through that path. Check each one's website and that it's still trading:

- **Singapore:** NTUC FairPrice, Sheng Siong, Cold Storage
- **South Africa:** Checkers, Pick n Pay, Woolworths, Spar, Shoprite
- **India:** BigBasket, Blinkit, DMart, Nature's Basket

## Order

1. Make the changes, then run `npm run check` and `tests/e2e/countries.spec.ts`.
2. Run `npm run taxonomy:seed:staging`. It adds the rows and rebuilds search.
3. Deploy staging. A deploy changes the cache identity, so the country menu updates everywhere at once.
4. Check on staging: `/sg`, `/za` and `/in` open and invite first products, each country's allergen list appears in Add a product, and `hreflang` shows `en-SG`, `en-ZA` and `en-IN`.
5. Leave stores to contributors, with none seeded (owner, 2026-11-06).

Production follows the unconfirmed items above and the launch checklist, with `npm run taxonomy:seed:production -- --confirm-taxonomy-only`, when the owner approves it.

## Owner decisions

| # | Decision | Recommendation |
|---|---|---|
| 1 | Open all three at once | Yes. The work is the same, and each opens empty |
| 2 | Show an aisle only once it holds a product | Yes, decided |

## Sources

- [Singapore Food Agency labelling guide](https://www.sfa.gov.sg/docs/default-source/food-manufacturing-and-storage/a-guide-to-food-labelling-and-advertisements.pdf)
- [South Africa R146 of 2010](https://dairystandard.co.za/wp-content/uploads/2024/02/Regulations-Relating-To-The-Labelling-And-Advertising-Of-Foodstuffs-R146-of-1-March-2010.pdf)
- [India labelling compendium](https://www.fssai.gov.in/upload/uploadfiles/files/Compendium_Labelling_Display_23_09_2021.pdf)
- [India vegan foods regulations](https://www.mondaq.com/india/food-and-drugs-law/1258966/food-safety-and-standards-vegan-food-regulations)
