import { SEARCH_INDEX_STATEMENTS } from "../../server/catalog/infrastructure/search-index";
import { DEFAULT_DIMENSIONS } from "../../server/ratings/domain/details";

// Production-safe taxonomy: real conventional foods and search aliases only.
// No products, ratings, people or images. Reviewed before any production use.
// Food → aisle → food (confirmed by the owner on 2026-10-12, milestone 7).
// Aisles are non-rankable groups shared by every country; an aisle whose
// natural slug belongs to a food takes `-aisle`. Each country orders its
// aisles by popularity; `position` is the default store order before a
// country has ratings (owner decision, 2026-10-12).
export const TAXONOMY_GROUPS = [
  { slug: "food", name: "Food", parent: null },
  { slug: "beef", name: "Beef", parent: "food", position: 1 },
  { slug: "chicken", name: "Chicken", parent: "food", position: 2 },
  { slug: "pork", name: "Pork", parent: "food", position: 3 },
  { slug: "turkey-aisle", name: "Turkey", parent: "food", position: 4 },
  { slug: "lamb-aisle", name: "Lamb", parent: "food", position: 5 },
  {
    slug: "fish-and-seafood",
    name: "Fish and seafood",
    parent: "food",
    position: 6,
  },
  { slug: "milk-aisle", name: "Milk", parent: "food", position: 7 },
  { slug: "cream-aisle", name: "Cream", parent: "food", position: 8 },
  { slug: "butter-aisle", name: "Butter", parent: "food", position: 9 },
  { slug: "yogurt-aisle", name: "Yogurt", parent: "food", position: 10 },
  { slug: "ice-cream-aisle", name: "Ice cream", parent: "food", position: 11 },
  { slug: "cheese", name: "Cheese", parent: "food", position: 12 },
  { slug: "eggs-aisle", name: "Eggs", parent: "food", position: 13 },
  { slug: "condiments", name: "Condiments", parent: "food", position: 14 },
] as const;
// The United States launch foods (milestone 7) start only there; a food
// switches on elsewhere when a product for it is published there.
const US = ["US"] as const;
export const TAXONOMY_LEAVES = [
  {
    slug: "ground-beef",
    name: "Ground Beef",
    parent: "beef",
    aliases: ["mince", "ground meat", "beef crumbles"],
    // Each country's own name for the food; the URL stays the same.
    displayNames: {
      GB: "Beef mince",
      AU: "Beef mince",
      NZ: "Beef mince",
      IE: "Beef mince",
    },
  },
  {
    slug: "beef-burgers",
    name: "Beef Burgers",
    parent: "beef",
    aliases: ["hamburgers", "burger patties"],
  },
  {
    slug: "meatballs",
    name: "Meatballs",
    parent: "beef",
    aliases: ["meatless meatballs"],
    countries: US,
  },
  {
    slug: "hot-dogs",
    name: "Hot Dogs",
    parent: "beef",
    aliases: ["franks", "frankfurters", "wieners", "veggie dogs"],
    countries: US,
  },
  {
    slug: "chicken-nuggets",
    name: "Chicken Nuggets",
    parent: "chicken",
    aliases: ["nuggets", "chick'n nuggets"],
  },
  {
    slug: "grilled-chicken-strips",
    name: "Grilled Chicken Strips",
    parent: "chicken",
    aliases: ["chicken strips", "chicken pieces", "chick'n strips"],
    countries: US,
  },
  {
    slug: "chicken-patties",
    name: "Chicken Patties",
    parent: "chicken",
    aliases: ["chicken fillets", "chicken sandwich patties"],
    countries: US,
  },
  {
    slug: "chicken-tenders",
    name: "Chicken Tenders",
    parent: "chicken",
    aliases: ["chicken fingers", "tenders"],
    countries: US,
  },
  {
    slug: "boneless-wings",
    name: "Boneless Wings",
    parent: "chicken",
    aliases: ["buffalo wings", "chicken wings", "wings"],
    countries: US,
  },
  { slug: "bacon", name: "Bacon", parent: "pork", aliases: ["bacon strips"] },
  {
    slug: "breakfast-sausage",
    name: "Breakfast Sausage",
    parent: "pork",
    aliases: ["sausage links", "sausage patties"],
    countries: US,
  },
  {
    slug: "chorizo",
    name: "Chorizo",
    parent: "pork",
    aliases: ["soyrizo", "Mexican chorizo"],
    countries: US,
  },
  {
    slug: "italian-sausage",
    name: "Italian Sausage",
    parent: "pork",
    aliases: ["sweet Italian sausage", "mild Italian sausage"],
    countries: US,
  },
  {
    slug: "turkey-roast",
    name: "Turkey Roast",
    parent: "turkey-aisle",
    aliases: ["holiday roast", "Thanksgiving roast"],
    countries: US,
    season: { start: 10, end: 12 },
  },
  {
    slug: "turkey-deli-slices",
    name: "Turkey Deli Slices",
    parent: "turkey-aisle",
    aliases: ["turkey slices", "deli turkey"],
    countries: US,
  },
  {
    slug: "fish-fillets",
    name: "Fish Fillets",
    parent: "fish-and-seafood",
    aliases: ["fish sticks", "fish fingers", "breaded fish"],
    countries: US,
  },
  {
    slug: "milk",
    name: "Milk",
    parent: "milk-aisle",
    aliases: ["plant milk", "non-dairy milk", "barista milk"],
  },
  {
    slug: "chocolate-milk",
    name: "Chocolate Milk",
    parent: "milk-aisle",
    aliases: [],
    countries: US,
  },
  {
    slug: "eggnog",
    name: "Eggnog",
    parent: "milk-aisle",
    aliases: ["nog", "holiday nog"],
    countries: US,
    season: { start: 11, end: 1 },
  },
  {
    slug: "coffee-creamer",
    name: "Coffee Creamer",
    parent: "cream-aisle",
    aliases: ["creamer", "non-dairy creamer"],
    countries: US,
  },
  {
    slug: "half-and-half",
    name: "Half-and-Half",
    parent: "cream-aisle",
    aliases: [],
    countries: US,
  },
  {
    slug: "sour-cream",
    name: "Sour Cream",
    parent: "cream-aisle",
    aliases: [],
    countries: US,
  },
  {
    slug: "whipped-cream",
    name: "Whipped Cream",
    parent: "cream-aisle",
    aliases: ["whipped topping"],
    countries: US,
  },
  {
    slug: "butter",
    name: "Butter",
    parent: "butter-aisle",
    aliases: ["buttery spread"],
  },
  {
    slug: "yogurt",
    name: "Yogurt",
    parent: "yogurt-aisle",
    aliases: ["yoghurt", "dairy-free yogurt"],
    countries: US,
  },
  {
    slug: "greek-yogurt",
    name: "Greek Yogurt",
    parent: "yogurt-aisle",
    aliases: ["Greek-style yogurt", "Greek yoghurt"],
    countries: US,
  },
  {
    slug: "ice-cream",
    name: "Ice Cream",
    parent: "ice-cream-aisle",
    aliases: ["frozen dessert", "non-dairy ice cream"],
    countries: US,
  },
  {
    slug: "cheddar",
    name: "Cheddar",
    parent: "cheese",
    aliases: ["cheddar cheese"],
  },
  {
    slug: "mozzarella",
    name: "Mozzarella",
    parent: "cheese",
    aliases: ["mozzarella cheese"],
  },
  {
    slug: "smoked-gouda",
    name: "Smoked Gouda",
    parent: "cheese",
    aliases: ["gouda"],
    countries: US,
  },
  {
    slug: "pepper-jack",
    name: "Pepper Jack",
    parent: "cheese",
    aliases: ["pepper jack cheese"],
    countries: US,
  },
  {
    slug: "american-cheese",
    name: "American Cheese",
    parent: "cheese",
    aliases: ["American slices", "American singles"],
    countries: US,
  },
  {
    slug: "mexican-blend",
    name: "Mexican Blend",
    parent: "cheese",
    aliases: ["Mexican cheese", "taco cheese", "Mexican shreds"],
    countries: US,
  },
  {
    slug: "parmesan",
    name: "Parmesan",
    parent: "cheese",
    aliases: ["parm", "parmigiano", "grated parmesan"],
    countries: US,
  },
  {
    slug: "cream-cheese",
    name: "Cream Cheese",
    parent: "cheese",
    aliases: ["cream cheese spread"],
  },
  {
    slug: "queso",
    name: "Queso",
    parent: "cheese",
    aliases: ["nacho cheese dip", "cheese dip", "cheese sauce"],
    countries: US,
  },
  {
    slug: "eggs",
    name: "Eggs",
    parent: "eggs-aisle",
    // Cooked eggs (scrambled, folded); baking replacers are their own food.
    aliases: ["egg alternatives", "scrambled eggs"],
  },
  {
    slug: "eggs-for-baking",
    name: "Eggs for Baking",
    parent: "eggs-aisle",
    aliases: ["egg replacer", "egg substitute"],
    countries: US,
  },
  {
    slug: "mayonnaise",
    name: "Mayonnaise",
    parent: "condiments",
    aliases: ["mayo", "aioli"],
    countries: US,
  },
  {
    slug: "ranch-dressing",
    name: "Ranch Dressing",
    parent: "condiments",
    aliases: ["ranch"],
    countries: US,
  },
  {
    slug: "caesar-dressing",
    name: "Caesar Dressing",
    parent: "condiments",
    aliases: ["caesar"],
    countries: US,
  },
  {
    slug: "worcestershire-sauce",
    name: "Worcestershire Sauce",
    parent: "condiments",
    aliases: ["worcestershire", "worcester sauce"],
    countries: US,
  },
] as const;
// The main foods' detail questions (owner decisions, 2026-10-09; Milk and
// Eggs revised on 2026-10-12). Every other food asks Taste and Texture.
export const TAXONOMY_DIMENSIONS: Record<
  string,
  [key: string, label: string][]
> = {
  "ground-beef": [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["browning", "Browning"],
  ],
  "beef-burgers": [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["juiciness", "Juiciness"],
  ],
  "chicken-nuggets": [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["crispiness", "Crispiness"],
  ],
  bacon: [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["crispiness", "Crispiness"],
  ],
  milk: [
    ["taste", "Taste"],
    ["creaminess", "Creaminess"],
    ["hot_drinks", "In hot drinks"],
    ["baking", "Baking"],
  ],
  butter: [
    ["taste", "Taste"],
    ["spreading", "Spreading"],
    ["baking", "Baking"],
  ],
  cheddar: [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["melt", "Melt"],
  ],
  mozzarella: [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["melt", "Melt"],
    ["stretch", "Stretch"],
  ],
  "cream-cheese": [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["spreading", "Spreading"],
  ],
  eggs: [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["scrambling", "Scrambling"],
    ["baking", "Baking"],
  ],
};
// The English-speaking launch countries (owner decision, 2026-10-09). Each
// list follows that country's labeling rules (PRODUCT_MASTER, milestone 5);
// a label overrides the shared vocabulary's wording.
export const TAXONOMY_COUNTRIES: {
  iso2: string;
  name: string;
  allergens: (string | [string, string])[];
}[] = [
  {
    iso2: "US",
    name: "United States",
    allergens: [
      "milk",
      "egg",
      "fish",
      ["crustacean", "Crustacean shellfish"],
      "tree_nuts",
      "peanut",
      "wheat",
      "soy",
      "sesame",
    ],
  },
  {
    iso2: "CA",
    name: "Canada",
    allergens: [
      "peanut",
      "tree_nuts",
      "sesame",
      "milk",
      "egg",
      ["fish", "Fish"],
      ["crustacean", "Crustaceans"],
      "mollusc",
      "soy",
      ["wheat", "Wheat and triticale"],
      "mustard",
      ["gluten", "Gluten sources"],
      ["sulphites", "Added sulphites"],
    ],
  },
  {
    iso2: "GB",
    name: "United Kingdom",
    allergens: [
      "celery",
      ["gluten", "Cereals containing gluten"],
      ["crustacean", "Crustaceans"],
      "egg",
      "fish",
      "lupin",
      "milk",
      "mollusc",
      "mustard",
      ["tree_nuts", "Nuts"],
      "peanut",
      "sesame",
      ["soy", "Soya"],
      ["sulphites", "Sulphur dioxide and sulphites"],
    ],
  },
  {
    iso2: "AU",
    name: "Australia",
    allergens: [
      "milk",
      "egg",
      "peanut",
      "tree_nuts",
      "sesame",
      "soy",
      "fish",
      ["crustacean", "Crustacean"],
      ["mollusc", "Mollusc"],
      "wheat",
      ["gluten", "Gluten (barley, oats, rye)"],
      "lupin",
      ["sulphites", "Added sulphites"],
    ],
  },
  {
    iso2: "NZ",
    name: "New Zealand",
    allergens: [
      "milk",
      "egg",
      "peanut",
      "tree_nuts",
      "sesame",
      "soy",
      "fish",
      ["crustacean", "Crustacean"],
      ["mollusc", "Mollusc"],
      "wheat",
      ["gluten", "Gluten (barley, oats, rye)"],
      "lupin",
      ["sulphites", "Added sulphites"],
    ],
  },
  {
    iso2: "IE",
    name: "Ireland",
    allergens: [
      "celery",
      ["gluten", "Cereals containing gluten"],
      ["crustacean", "Crustaceans"],
      "egg",
      "fish",
      "lupin",
      "milk",
      "mollusc",
      "mustard",
      ["tree_nuts", "Nuts"],
      "peanut",
      "sesame",
      ["soy", "Soya"],
      ["sulphites", "Sulphur dioxide and sulphites"],
    ],
  },
];
export const TAXONOMY_FEATURES = [
  "ground-beef",
  "beef-burgers",
  "milk",
  "cheddar",
  "butter",
  "eggs",
] as const;

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
/**
 * Idempotent SQL keyed by slug: existing categories, aliases and configured
 * features are left untouched, so it is safe on any environment's data.
 */
export function taxonomySeedStatements(newId: () => string, now: number) {
  const statements: string[] = [];
  for (const country of TAXONOMY_COUNTRIES) {
    statements.push(
      `INSERT INTO countries(id,iso2,name,created_at,updated_at) VALUES(${quote(newId())},${quote(country.iso2)},${quote(country.name)},${now},${now}) ON CONFLICT DO NOTHING;`,
    );
    const list = country.allergens.map((entry, position) => {
      const [key, label] = typeof entry === "string" ? [entry, null] : entry;
      return { key, label, position: position + 1 };
    });
    statements.push(
      `INSERT INTO country_allergens(country_id,allergen_key,position,label)
      SELECT co.id,json_extract(j.value,'$.key'),json_extract(j.value,'$.position'),json_extract(j.value,'$.label')
      FROM json_each(${quote(JSON.stringify(list))}) j CROSS JOIN countries co WHERE co.iso2=${quote(country.iso2)}
      ON CONFLICT DO NOTHING;`,
    );
  }
  for (const category of [...TAXONOMY_GROUPS, ...TAXONOMY_LEAVES]) {
    const rankable = "aliases" in category ? 1 : 0;
    const position = "position" in category ? category.position : null;
    const season = "season" in category ? category.season : null;
    statements.push(
      `INSERT INTO categories(id,parent_id,slug,name,is_rankable,is_active,position,season_start,season_end,created_at,updated_at)
      SELECT ${quote(newId())},${category.parent ? `(SELECT id FROM categories WHERE slug=${quote(category.parent)})` : "NULL"},${quote(category.slug)},${quote(category.name)},${rankable},1,${position ?? "NULL"},${season?.start ?? "NULL"},${season?.end ?? "NULL"},${now},${now}
      WHERE NOT EXISTS(SELECT 1 FROM categories WHERE slug=${quote(category.slug)});`,
    );
    // An existing category gets a missing default position or season, unless
    // an operator has ever set that field, so their choice stays.
    const untouched = (field: string) =>
      `NOT EXISTS(SELECT 1 FROM moderation_actions a WHERE a.kind='category_update' AND a.target_id=categories.id AND json_type(a.after_data,'$.${field}') IS NOT NULL)`;
    if (position !== null)
      statements.push(
        `UPDATE categories SET position=${position} WHERE slug=${quote(category.slug)} AND position IS NULL AND ${untouched("position")};`,
      );
    if (season)
      statements.push(
        `UPDATE categories SET season_start=${season.start},season_end=${season.end} WHERE slug=${quote(category.slug)} AND season_start IS NULL AND ${untouched("seasonStart")};`,
      );
    if ("aliases" in category)
      for (const alias of category.aliases)
        statements.push(
          `INSERT INTO category_aliases(id,category_id,country_id,alias,created_at)
          SELECT ${quote(newId())},c.id,NULL,${quote(alias)},${now} FROM categories c WHERE c.slug=${quote(category.slug)}
          ON CONFLICT DO NOTHING;`,
        );
  }
  for (const leaf of TAXONOMY_LEAVES)
    if ("displayNames" in leaf)
      for (const [iso2, name] of Object.entries(leaf.displayNames))
        statements.push(
          `INSERT INTO category_aliases(id,category_id,country_id,alias,is_display_name,created_at)
          SELECT ${quote(newId())},c.id,co.id,${quote(name)},1,${now} FROM categories c CROSS JOIN countries co
          WHERE c.slug=${quote(leaf.slug)} AND co.iso2=${quote(iso2)}
          AND NOT EXISTS(SELECT 1 FROM category_aliases a WHERE a.category_id=c.id AND a.country_id=co.id AND a.is_display_name=1)
          ON CONFLICT DO NOTHING;`,
        );
  // Questions are seeded only for foods that have none, so an operator's
  // list is never overwritten. SQLite reads the whole SELECT before inserting.
  const questions = (
    where: string,
    list: readonly (readonly [string, string])[],
  ) =>
    `INSERT INTO category_rating_dimensions(id,category_id,key,label,description,sort_order,is_active,created_at,updated_at)
    SELECT ${quote(`${newId()}-`)}||c.id||'-'||j.key,c.id,json_extract(j.value,'$[0]'),json_extract(j.value,'$[1]'),NULL,j.key,1,${now},${now}
    FROM categories c CROSS JOIN json_each(${quote(JSON.stringify(list))}) j
    WHERE ${where} AND NOT EXISTS(SELECT 1 FROM category_rating_dimensions d WHERE d.category_id=c.id)
    ON CONFLICT DO NOTHING;`;
  for (const [slug, list] of Object.entries(TAXONOMY_DIMENSIONS))
    statements.push(questions(`c.slug=${quote(slug)}`, list));
  statements.push(
    questions(
      "c.is_rankable=1",
      DEFAULT_DIMENSIONS.map(({ key, label }) => [key, label] as const),
    ),
  );
  // Each launch food is on in its launch countries: every launch country
  // unless it names its own. A food whose countries an operator has ever
  // changed is skipped, so their choices are never undone.
  const launch = TAXONOMY_LEAVES.flatMap((leaf) =>
    ("countries" in leaf
      ? leaf.countries
      : TAXONOMY_COUNTRIES.map((c) => c.iso2)
    ).map((iso2) => [leaf.slug, iso2]),
  );
  statements.push(
    `INSERT INTO category_countries(category_id,country_id,source,created_at)
    SELECT c.id,co.id,'launch',${now} FROM json_each(${quote(JSON.stringify(launch))}) j
    JOIN categories c ON c.slug=json_extract(j.value,'$[0]') AND c.is_rankable=1
    JOIN countries co ON co.iso2=json_extract(j.value,'$[1]')
    WHERE NOT EXISTS(SELECT 1 FROM moderation_actions a WHERE a.kind='category_countries' AND a.target_id=c.id)
    ON CONFLICT DO NOTHING;`,
  );
  // Features are seeded per country, only where none are configured yet.
  statements.push(
    `INSERT INTO category_features(country_id,category_id,position,updated_at)
    SELECT co.id,c.id,j.key+1,${now} FROM json_each(${quote(JSON.stringify(TAXONOMY_FEATURES))}) j
    JOIN categories c ON c.slug=j.value AND c.is_active=1 CROSS JOIN countries co WHERE co.iso2 IN (${TAXONOMY_COUNTRIES.map((c) => quote(c.iso2)).join(",")})
    AND NOT EXISTS(SELECT 1 FROM category_features f WHERE f.country_id=co.id)
    ON CONFLICT DO NOTHING;`,
  );
  return statements;
}
// The script also rebuilds the search index from canonical rows, so new foods
// and display names are searchable at once.
export const taxonomySeedSql = (newId: () => string, now: number) =>
  [
    ...taxonomySeedStatements(newId, now),
    ...SEARCH_INDEX_STATEMENTS.map((sql) => `${sql};`),
  ].join("\n");
