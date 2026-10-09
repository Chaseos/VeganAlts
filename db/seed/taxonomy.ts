import { SEARCH_INDEX_STATEMENTS } from "../../server/catalog/infrastructure/search-index";
import { DEFAULT_DIMENSIONS } from "../../server/ratings/domain/details";

// Production-safe taxonomy: real conventional foods and search aliases only.
// No products, ratings, people or images. Reviewed before any production use.
// Food → aisle → shelf → food (confirmed by the owner on 2026-10-09). Aisles
// and shelves are non-rankable groups; a group whose natural slug belongs to
// a food takes a suffix.
export const TAXONOMY_GROUPS = [
  { slug: "food", name: "Food", parent: null },
  { slug: "meat", name: "Meat", parent: "food" },
  { slug: "beef", name: "Beef", parent: "meat" },
  { slug: "chicken", name: "Chicken", parent: "meat" },
  { slug: "pork", name: "Pork", parent: "meat" },
  { slug: "dairy", name: "Dairy", parent: "food" },
  { slug: "milk-shelf", name: "Milk", parent: "dairy" },
  { slug: "butter-shelf", name: "Butter", parent: "dairy" },
  { slug: "cheese", name: "Cheese", parent: "food" },
  { slug: "block-and-shredded", name: "Block and shredded", parent: "cheese" },
  {
    slug: "soft-and-spreadable",
    name: "Soft and spreadable",
    parent: "cheese",
  },
  { slug: "eggs-aisle", name: "Eggs", parent: "food" },
  { slug: "eggs-shelf", name: "Eggs", parent: "eggs-aisle" },
] as const;
export const TAXONOMY_LEAVES = [
  {
    slug: "ground-beef",
    name: "Ground Beef",
    parent: "beef",
    aliases: ["mince", "ground meat"],
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
    slug: "chicken-nuggets",
    name: "Chicken Nuggets",
    parent: "chicken",
    aliases: ["nuggets", "chick'n nuggets"],
  },
  { slug: "bacon", name: "Bacon", parent: "pork", aliases: ["bacon strips"] },
  {
    slug: "milk",
    name: "Milk",
    parent: "milk-shelf",
    aliases: ["plant milk", "non-dairy milk"],
  },
  {
    slug: "butter",
    name: "Butter",
    parent: "butter-shelf",
    aliases: ["buttery spread"],
  },
  {
    slug: "cheddar",
    name: "Cheddar",
    parent: "block-and-shredded",
    aliases: ["cheddar cheese"],
  },
  {
    slug: "mozzarella",
    name: "Mozzarella",
    parent: "block-and-shredded",
    aliases: ["mozzarella cheese"],
  },
  {
    slug: "cream-cheese",
    name: "Cream Cheese",
    parent: "soft-and-spreadable",
    aliases: ["cream cheese spread"],
  },
  {
    slug: "eggs",
    name: "Eggs",
    parent: "eggs-shelf",
    aliases: ["egg alternatives", "egg replacer"],
  },
] as const;
// Each launch food's detail questions (owner decision, 2026-10-09). Other
// foods start with Taste and Texture.
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
    ["in_coffee", "In coffee"],
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
    statements.push(
      `INSERT INTO categories(id,parent_id,slug,name,is_rankable,is_active,created_at,updated_at)
      SELECT ${quote(newId())},${category.parent ? `(SELECT id FROM categories WHERE slug=${quote(category.parent)})` : "NULL"},${quote(category.slug)},${quote(category.name)},${rankable},1,${now},${now}
      WHERE NOT EXISTS(SELECT 1 FROM categories WHERE slug=${quote(category.slug)});`,
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
