import { drizzle } from "drizzle-orm/sqlite-proxy";
import { v5 as uuid } from "uuid";
import * as schema from "../schema/app";
import { user } from "../schema/auth";
import { SEARCH_INDEX_STATEMENTS } from "../../server/catalog/infrastructure/search-index";
import {
  identityKey,
  normalizeName,
} from "../../server/community/domain/policy";
import {
  DEVELOPMENT_NOTICE,
  seedCategories,
  seedProducts,
  SOURCE_CHECKED_AT,
} from "./catalog";
import { TAXONOMY_GROUPS, taxonomySeedStatements } from "./taxonomy";

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

const DAY = 86_400_000;

/**
 * The demo catalog. Ratings, trials and publication dates are dated back
 * from `now` (the seed run), so Trending, New and Early read as they would on
 * a live site whenever it's seeded; fixed dates aged out of the windows.
 */
export function developmentSeedStatements(
  environment: string,
  now = Date.now(),
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
  for (const { slug: key, name, parent } of TAXONOMY_GROUPS) {
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
          normalizedName: normalizeName(brand),
          ...times,
        })
        .onConflictDoNothing(),
    );
  }
  const families = new Set<string>();
  // Tasters who rated each product, in catalog order unless it says.
  const raters = (index: number) =>
    seedProducts[index]!.ratings ?? [28, 14, 4, 0][index % 4]!;
  const published = (index: number) =>
    now - (raters(index) ? 200 : 4 + (index % 20)) * DAY;
  for (const [index, product] of seedProducts.entries()) {
    const brandId = seedId(`brand:${product.brand}`);
    const productId = seedId(`product:${product.slug}`);
    const dataNotes = [DEVELOPMENT_NOTICE, product.notes]
      .filter(Boolean)
      .join(" ");
    // Every product belongs to a line; one without a named line starts its
    // own, named after it (milestone 7).
    const family = product.family ?? `us-${product.slug}`;
    if (!families.has(family)) {
      families.add(family);
      add(
        db
          .insert(schema.productFamilies)
          .values({
            id: seedId(`family:${family}`),
            brandId,
            countryId: seedId("country:US"),
            slug: family,
            canonicalName: product.familyName ?? product.name,
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
          productFamilyId: seedId(`family:${family}`),
          name: product.name,
          flavor: product.flavor ?? null,
          slug: product.slug,
          manufacturerUrl: product.source,
          veganStatus: "vegan",
          manufacturerLabel: "vegan",
          developmentOnly: 1,
          sourceCheckedAt: SOURCE_CHECKED_AT,
          dataNotes,
          // Rated products have been listed a while; unrated ones are new.
          publishedAt: published(index),
          createdAt: published(index),
          updatedAt: published(index),
        })
        .onConflictDoNothing(),
    );
    add(
      db
        .insert(schema.productVersions)
        .values({
          id: seedId(`formula:${product.slug}:current`),
          productId,
          versionLabel: "Demo formula · 2026",
          isCurrent: 1,
          changeSummary: DEVELOPMENT_NOTICE,
          ...times,
        })
        .onConflictDoNothing(),
    );
    statements.push({
      sql: "INSERT INTO product_identity_keys(identity_key,product_id) VALUES(?,?) ON CONFLICT DO NOTHING",
      params: [
        identityKey(seedId("country:US"), product.brand, product.name),
        productId,
      ],
    });
    statements.push({
      sql: "INSERT INTO formula_classifications(product_version_id,vegan_status,manufacturer_label,evidence_data,updated_at) SELECT id,'vegan','vegan',?,? FROM product_versions WHERE id=? AND is_current=1 ON CONFLICT DO NOTHING",
      params: [
        JSON.stringify({ urls: [], imageIds: [], note: DEVELOPMENT_NOTICE }),
        SOURCE_CHECKED_AT,
        seedId(`formula:${product.slug}:current`),
      ],
    });
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
  // Synthetic accounts have reserved .invalid addresses and no credentials or
  // sessions. Deterministic IDs and insert-only contributions preserve all real
  // staging accounts, edits, verification records, and formula history.
  for (let index = 0; index < 28; index++) {
    const id = seedId(`taster:${index}`);
    add(
      db
        .insert(user)
        .values({
          id,
          name: "Demo taster",
          email: `taster-${index}@demo.veganalts.invalid`,
          createdAt: new Date(SOURCE_CHECKED_AT),
          updatedAt: new Date(SOURCE_CHECKED_AT),
        })
        .onConflictDoNothing(),
    );
    add(
      db
        .insert(schema.profiles)
        .values({
          userId: id,
          handle: `demo_taster_${String(index + 1).padStart(2, "0")}`,
          displayName: `Demo taster ${index + 1}`,
          ...times,
        })
        .onConflictDoNothing(),
    );
  }
  // When a taster rated: products on every third pattern rose over the last
  // six weeks (so Trending has something to show); the rest spread over half
  // a year, so the quarter before is the baseline.
  const ratedAt = (index: number, pattern: number) => {
    const days =
      pattern % 3 === 0
        ? (index * 3 + pattern) % 42
        : (index * 11 + pattern * 7) % 175;
    return now - days * DAY - ((index * 37 + pattern * 13) % 1440) * 60_000;
  };
  // A product's typical Tastiest answer, independent of how close it is.
  const tasty = [4, 5, 3, 4, 2];
  function sampleRatings(
    versionId: string,
    categories: readonly string[],
    count: number,
    pattern: number,
  ) {
    for (let index = 0; index < count; index++) {
      const userId = seedId(`taster:${index}`);
      const at = ratedAt(index, pattern);
      add(
        db
          .insert(schema.productTrials)
          .values({
            userId,
            productVersionId: versionId,
            createdAt: at,
            updatedAt: at,
          })
          .onConflictDoNothing(),
      );
      for (const [categoryIndex, category] of categories.entries()) {
        const categoryId = seedId(`category:${category}`);
        add(
          db
            .insert(schema.ratings)
            .values({
              id: seedId(`rating:${versionId}:${categoryId}:${index}`),
              userId,
              productVersionId: versionId,
              categoryId,
              overallSimilarity: Math.max(
                1,
                5 - ((index + pattern + categoryIndex) % ((pattern % 3) + 2)),
              ),
              // Two in three tasters also say how tasty it is.
              enjoyment:
                (index + pattern) % 3 === 0
                  ? null
                  : Math.min(
                      5,
                      Math.max(1, tasty[pattern % 5]! + (index % 3) - 1),
                    ),
              createdAt: at,
              updatedAt: at,
            })
            .onConflictDoNothing(),
        );
      }
    }
  }
  seedProducts.forEach((product, index) =>
    sampleRatings(
      seedId(`formula:${product.slug}:current`),
      product.categories,
      raters(index),
      index,
    ),
  );
  sampleRatings(
    seedId("formula:beyond-beef:historical"),
    ["ground-beef"],
    8,
    2,
  );
  // Countries, allergen lists and homepage features come from the reviewed
  // taxonomy seed, after the fixture categories exist under their seed IDs.
  let taxonomyIndex = 0;
  statements.push(
    ...taxonomySeedStatements(
      () => seedId(`taxonomy:${taxonomyIndex++}`),
      SOURCE_CHECKED_AT,
    ).map((sql) => ({ sql: sql.replace(/;\s*$/, ""), params: [] })),
  );
  statements.push(
    ...SEARCH_INDEX_STATEMENTS.map((sql) => ({ sql, params: [] })),
  );
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
