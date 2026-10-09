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
  const statements = [
    `INSERT INTO countries(id,iso2,name,created_at,updated_at) VALUES(${quote(newId())},'US','United States',${now},${now}) ON CONFLICT DO NOTHING;`,
  ];
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
  // Features are seeded only when none are configured yet.
  statements.push(
    `INSERT INTO category_features(country_id,category_id,position,updated_at)
    SELECT co.id,c.id,j.key+1,${now} FROM json_each(${quote(JSON.stringify(TAXONOMY_FEATURES))}) j
    JOIN categories c ON c.slug=j.value AND c.is_active=1 CROSS JOIN countries co WHERE co.iso2='US'
    AND NOT EXISTS(SELECT 1 FROM category_features f WHERE f.country_id=co.id)
    ON CONFLICT DO NOTHING;`,
  );
  return statements;
}
export const taxonomySeedSql = (newId: () => string, now: number) =>
  taxonomySeedStatements(newId, now).join("\n");
