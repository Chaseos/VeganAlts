// Production-safe taxonomy: real conventional foods and search aliases only.
// No products, ratings, people or images. Reviewed before any production use.
export const TAXONOMY_PARENTS = [
  { slug: "food", name: "Food", parent: null },
  { slug: "meat", name: "Meat", parent: "food" },
  { slug: "dairy", name: "Dairy", parent: "food" },
  { slug: "cheese", name: "Cheese", parent: "dairy" },
] as const;
export const TAXONOMY_LEAVES = [
  {
    slug: "ground-beef",
    name: "Ground Beef",
    parent: "meat",
    aliases: ["mince", "ground meat"],
  },
  {
    slug: "beef-burgers",
    name: "Beef Burgers",
    parent: "meat",
    aliases: ["hamburgers", "burger patties"],
  },
  {
    slug: "chicken-nuggets",
    name: "Chicken Nuggets",
    parent: "meat",
    aliases: ["nuggets", "chick'n nuggets"],
  },
  { slug: "bacon", name: "Bacon", parent: "meat", aliases: ["bacon strips"] },
  {
    slug: "milk",
    name: "Milk",
    parent: "dairy",
    aliases: ["plant milk", "non-dairy milk"],
  },
  {
    slug: "butter",
    name: "Butter",
    parent: "dairy",
    aliases: ["buttery spread"],
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
    slug: "cream-cheese",
    name: "Cream Cheese",
    parent: "cheese",
    aliases: ["cream cheese spread"],
  },
  {
    slug: "eggs",
    name: "Eggs",
    parent: "food",
    aliases: ["egg alternatives", "egg replacer"],
  },
] as const;
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
  for (const category of [...TAXONOMY_PARENTS, ...TAXONOMY_LEAVES]) {
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
export const taxonomySeedSql = (newId: () => string, now: number) =>
  taxonomySeedStatements(newId, now).join("\n");
