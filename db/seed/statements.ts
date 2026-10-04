import { drizzle } from "drizzle-orm/sqlite-proxy";
import { v5 as uuid } from "uuid";
import * as schema from "../schema/app";
import {
  DEVELOPMENT_NOTICE,
  seedCategories,
  seedProducts,
  SOURCE_CHECKED_AT,
} from "./catalog";

export interface SeedStatement {
  sql: string;
  params: unknown[];
}
export const seedId = (key: string) =>
  uuid(`veganalts:development:${key}`, uuid.URL);
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function developmentSeedStatements(
  environment: string,
): SeedStatement[] {
  if (
    environment !== "local" &&
    environment !== "staging" &&
    environment !== "test"
  ) {
    throw new Error(
      "Development seeds are allowed only in local, staging, and isolated tests.",
    );
  }
  // The proxy is a SQL compiler here; no database work happens while generating.
  const db = drizzle(async () => {
    throw new Error("Use the seed runner to execute statements.");
  });
  const statements: SeedStatement[] = [];
  const add = (query: { toSQL(): SeedStatement }) =>
    statements.push(query.toSQL());
  const times = { createdAt: SOURCE_CHECKED_AT, updatedAt: SOURCE_CHECKED_AT };
  add(
    db
      .insert(schema.countries)
      .values({
        id: seedId("country:US"),
        iso2: "US",
        name: "United States",
        ...times,
      })
      .onConflictDoNothing(),
  );
  for (const [key, name, parent] of [
    ["food", "Food", null],
    ["meat", "Meat", "food"],
    ["dairy", "Dairy", "food"],
    ["cheese", "Cheese", "dairy"],
  ] as const) {
    add(
      db
        .insert(schema.categories)
        .values({
          id: seedId(`category:${key}`),
          slug: key,
          name,
          parentId: parent ? seedId(`category:${parent}`) : null,
          ...times,
        })
        .onConflictDoNothing(),
    );
  }
  for (const category of seedCategories) {
    const categoryId = seedId(`category:${category.slug}`);
    add(
      db
        .insert(schema.categories)
        .values({
          id: categoryId,
          slug: category.slug,
          name: category.name,
          parentId: seedId(`category:${category.parent}`),
          isRankable: 1,
          ...times,
        })
        .onConflictDoNothing(),
    );
    for (const alias of category.aliases)
      add(
        db
          .insert(schema.categoryAliases)
          .values({
            id: seedId(`alias:${category.slug}:${alias}`),
            categoryId,
            alias,
            createdAt: SOURCE_CHECKED_AT,
          })
          .onConflictDoNothing(),
      );
  }
  for (const brand of new Set(seedProducts.map((product) => product.brand))) {
    add(
      db
        .insert(schema.brands)
        .values({
          id: seedId(`brand:${brand}`),
          slug: slug(brand),
          name: brand,
          ...times,
        })
        .onConflictDoNothing(),
    );
  }
  const families = new Set<string>();
  for (const product of seedProducts) {
    const brandId = seedId(`brand:${product.brand}`);
    const productId = seedId(`product:${product.slug}`);
    if (product.family && !families.has(product.family)) {
      families.add(product.family);
      add(
        db
          .insert(schema.productFamilies)
          .values({
            id: seedId(`family:${product.family}`),
            brandId,
            slug: product.family,
            canonicalName:
              product.family === "just-eggs" ? "Just Egg" : "Oatly Oatmilk",
            ...times,
          })
          .onConflictDoNothing(),
      );
    }
    add(
      db
        .insert(schema.products)
        .values({
          id: productId,
          countryId: seedId("country:US"),
          brandId,
          productFamilyId: product.family
            ? seedId(`family:${product.family}`)
            : null,
          name: product.name,
          slug: product.slug,
          manufacturerUrl: product.source,
          veganStatus: "under_review",
          developmentOnly: 1,
          sourceCheckedAt: SOURCE_CHECKED_AT,
          dataNotes: [DEVELOPMENT_NOTICE, product.notes]
            .filter(Boolean)
            .join(" "),
          ...times,
        })
        .onConflictDoNothing(),
    );
    add(
      db
        .insert(schema.productVersions)
        .values({
          id: seedId(`formula:${product.slug}:current`),
          productId,
          versionLabel: "Development current formula",
          isCurrent: 1,
          changeSummary: DEVELOPMENT_NOTICE,
          ...times,
        })
        .onConflictDoNothing(),
    );
    for (const category of product.categories)
      add(
        db
          .insert(schema.productCategories)
          .values({
            productId,
            categoryId: seedId(`category:${category}`),
            ...times,
          })
          .onConflictDoNothing(),
      );
    statements.push({
      sql: "DELETE FROM search_index WHERE entity_type = 'product' AND entity_id = ?",
      params: [productId],
    });
    statements.push({
      sql: "INSERT INTO search_index(entity_type,entity_id,country_code,title,subtitle,aliases,body) VALUES ('product',?,'US',?,?,?,?)",
      params: [
        productId,
        product.name,
        product.brand,
        product.categories.join(" "),
        DEVELOPMENT_NOTICE,
      ],
    });
  }
  add(
    db
      .insert(schema.productVersions)
      .values({
        id: seedId("formula:beyond-beef:historical"),
        productId: seedId("product:beyond-beef"),
        versionLabel: "Illustrative development history",
        isCurrent: 0,
        changeSummary:
          "Synthetic history fixture only. No claim about a real manufacturer reformulation or effective date.",
        ...times,
      })
      .onConflictDoNothing(),
  );
  for (const [from, to] of [
    ["oatly-original", "oatly-full-fat"],
    ["just-egg", "just-egg-folded"],
  ]) {
    add(
      db
        .insert(schema.productRelationships)
        .values({
          fromProductId: seedId(`product:${from}`),
          toProductId: seedId(`product:${to}`),
          relationType: "variant",
          createdAt: SOURCE_CHECKED_AT,
        })
        .onConflictDoNothing(),
    );
  }
  return statements;
}

export function seedSql(statements: readonly SeedStatement[]) {
  return statements
    .map((statement) => {
      let index = 0;
      return (
        statement.sql.replace(/\?/g, () => {
          const value = statement.params[index++];
          if (value === null) return "NULL";
          if (typeof value === "number" && Number.isFinite(value))
            return String(value);
          if (typeof value === "string")
            return `'${value.replaceAll("'", "''")}'`;
          throw new Error("Unsupported seed value.");
        }) + ";"
      );
    })
    .join("\n");
}
