import type { Market } from "../../server/catalog/domain/markets";

// A catalog market for a fixture country (the repository reads only its ID
// and ISO code).
export const testMarket = (id: string, code = "us"): Market => ({
  id,
  code,
  iso2: code.toUpperCase(),
  name: "Test market",
});

// Every product belongs to a recipe line of its brand and country (milestone
// 7). A test product starts its own line, `line-<product id>`; insert it
// before the product.
export const lineOf = (productId: string) => `line-${productId}`;
export const lineStatement = (
  db: D1Database,
  productId: string,
  countryId: string,
  brandId: string | null = null,
) =>
  db
    .prepare(
      "INSERT INTO product_families(id,brand_id,country_id,canonical_name,slug,created_at,updated_at) VALUES(?,?,?,?,?,1,1)",
    )
    .bind(lineOf(productId), brandId, countryId, productId, lineOf(productId));

// A plain product row with the line it starts.
export const productRows = (
  db: D1Database,
  productId: string,
  countryId: string,
  name: string,
  slug: string,
  brandId: string | null = null,
) => [
  lineStatement(db, productId, countryId, brandId),
  db
    .prepare(
      "INSERT INTO products(id,country_id,brand_id,product_family_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,?,?,1,1)",
    )
    .bind(productId, countryId, brandId, lineOf(productId), name, slug),
];

export async function catalogFixture(db: D1Database, userCount = 3) {
  const suffix = crypto.randomUUID();
  const countryId = `country-${suffix}`;
  const otherCountryId = `other-country-${suffix}`;
  const productId = `product-${suffix}`;
  const versionId = `version-${suffix}`;
  const categories = [`burger-${suffix}`, `ground-${suffix}`];
  const users = Array.from({ length: userCount }, (_, index) => ({
    id: `user-${suffix}-${index}`,
    accountState: "active",
  }));
  const statements = [
    db
      .prepare(
        "INSERT INTO countries (id,iso2,name,created_at,updated_at) VALUES (?,?,?,?,?),(?,?,?,?,?)",
      )
      .bind(
        countryId,
        `US-${suffix}`,
        "Test US",
        1,
        1,
        otherCountryId,
        `CA-${suffix}`,
        "Test Canada",
        1,
        1,
      ),
    ...categories.map((id) =>
      db
        .prepare(
          "INSERT INTO categories (id,slug,name,is_rankable,created_at,updated_at) VALUES (?,?,?,1,1,1)",
        )
        .bind(id, id, id),
    ),
    lineStatement(db, productId, countryId),
    db
      .prepare(
        "INSERT INTO products (id,country_id,product_family_id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?,1,1)",
      )
      .bind(productId, countryId, lineOf(productId), "Test burger", productId),
    db
      .prepare(
        "INSERT INTO product_versions (id,product_id,is_current,created_at,updated_at) VALUES (?,?,1,1,1)",
      )
      .bind(versionId, productId),
    ...categories.map((id) =>
      db
        .prepare(
          "INSERT INTO product_categories (product_id,category_id,created_at,updated_at) VALUES (?,?,1,1)",
        )
        .bind(productId, id),
    ),
    ...users.flatMap((user) => [
      db
        .prepare(
          "INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,1,1)",
        )
        .bind(user.id, "Test identity", `${user.id}@example.invalid`),
      db
        .prepare(
          "INSERT INTO profiles (user_id,handle,created_at,updated_at) VALUES (?,?,1,1)",
        )
        .bind(user.id, user.id),
    ]),
  ];
  await db.batch(statements);
  return { countryId, otherCountryId, productId, versionId, categories, users };
}
