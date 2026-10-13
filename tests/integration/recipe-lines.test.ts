import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { expect, it } from "vitest";
import { catalogFixture, lineOf, lineStatement } from "./fixtures";
import { emptyDatabase } from "../../db/empty-database";

const id = () => crypto.randomUUID();
const db = env.DB;
const line = (familyId: string) =>
  db
    .prepare(
      "SELECT brand_id AS brandId,country_id AS countryId,canonical_name AS name,slug FROM product_families WHERE id=?",
    )
    .bind(familyId)
    .first<{
      brandId: string | null;
      countryId: string | null;
      name: string;
      slug: string;
    }>();
const familyOf = (productId: string) =>
  db
    .prepare("SELECT product_family_id AS f FROM products WHERE id=?")
    .bind(productId)
    .first<string>("f");

it("gives every existing product a line of its brand and country, splitting mixed lines", async () => {
  // A database on the history before recipe lines.
  await emptyDatabase(db);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 2));
  const product = (
    productId: string,
    country: string,
    brand: string | null,
    family: string | null,
    createdAt: number,
  ) =>
    db
      .prepare(
        "INSERT INTO products(id,country_id,brand_id,product_family_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        productId,
        country,
        brand,
        family,
        `Name ${productId}`,
        `slug-${productId}`,
        createdAt,
        createdAt,
      );
  await db.batch([
    db.prepare(
      "INSERT INTO countries(id,iso2,name,created_at,updated_at) VALUES('us','US','United States',1,1),('ca','CA','Canada',1,1)",
    ),
    db.prepare(
      "INSERT INTO brands(id,name,slug,created_at,updated_at) VALUES('b1','Oat Co','oat-co',1,1),('b2','Bean Co','bean-co',1,1)",
    ),
    db.prepare(
      `INSERT INTO product_families(id,brand_id,canonical_name,slug,created_at,updated_at) VALUES
        ('oat','b1','Oat Milk','oat-milk',1,1),
        ('loose',NULL,'Loose Line','loose-line',1,1),
        ('empty','b1','Empty Line','empty-line',1,1),
        ('taken',NULL,'Taken','us-slug-clash',1,1)`,
    ),
    // No line: each starts its own.
    product("solo", "us", "b1", null, 1),
    product("clash", "us", null, null, 1),
    // One line across two countries and two brands.
    product("oat-us", "us", "b1", "oat", 1),
    product("oat-ca", "ca", "b1", "oat", 2),
    product("oat-bean", "us", "b2", "oat", 3),
    product("oat-us-2", "us", "b1", "oat", 4),
    // A line without a brand takes its products' brand.
    product("loose-1", "us", "b2", "loose", 1),
  ]);
  // The clash product's natural slug is taken by another line.
  await db
    .prepare("UPDATE products SET slug='slug-clash' WHERE id='clash'")
    .run();

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  expect(await familyOf("solo")).toBe("line-solo");
  expect(await line("line-solo")).toEqual({
    brandId: "b1",
    countryId: "us",
    name: "Name solo",
    slug: "us-slug-solo",
  });
  expect((await line("line-clash"))!.slug).toBe("us-slug-clash-clash");

  // The line's own brand in the earliest country keeps it; the others copy
  // its name into lines of their own.
  expect(await line("oat")).toMatchObject({ brandId: "b1", countryId: "us" });
  expect(await familyOf("oat-us")).toBe("oat");
  expect(await familyOf("oat-us-2")).toBe("oat");
  expect(await familyOf("oat-ca")).toBe("line-oat-ca");
  expect(await line("line-oat-ca")).toEqual({
    brandId: "b1",
    countryId: "ca",
    name: "Oat Milk",
    slug: "oat-milk-ca-slug-oat-ca",
  });
  expect(await familyOf("oat-bean")).toBe("line-oat-bean");
  expect(await line("line-oat-bean")).toMatchObject({
    brandId: "b2",
    countryId: "us",
    name: "Oat Milk",
  });
  expect(await line("loose")).toMatchObject({ brandId: "b2", countryId: "us" });
  // A line without products keeps no country.
  expect((await line("empty"))!.countryId).toBeNull();

  // Every product now sits in a line of its own brand and country.
  expect(
    await db
      .prepare(
        "SELECT COUNT(*) AS n FROM products p LEFT JOIN product_families f ON f.id=p.product_family_id WHERE f.id IS NULL OR f.country_id IS NOT p.country_id OR f.brand_id IS NOT p.brand_id",
      )
      .first("n"),
  ).toBe(0);
  expect(
    await db
      .prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE name='m7_line_groups'",
      )
      .first("n"),
  ).toBe(0);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual(
    [],
  );
});

it("keeps every product in a line of its own brand and country", async () => {
  const f = await catalogFixture(db, 0);
  const brand = `brand-${id()}`;
  await db
    .prepare(
      "INSERT INTO brands(id,name,slug,created_at,updated_at) VALUES(?,?,?,1,1)",
    )
    .bind(brand, brand, brand)
    .run();
  const insert = (
    productId: string,
    familyId: string | null,
    country = f.countryId,
  ) =>
    db
      .prepare(
        "INSERT INTO products(id,country_id,product_family_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,?,1,1)",
      )
      .bind(productId, country, familyId, productId, productId)
      .run();

  // Without a line, with another country's line or with another brand's.
  await expect(insert(id(), null)).rejects.toThrow(/needs a line/);
  await expect(
    insert(id(), lineOf(f.productId), f.otherCountryId),
  ).rejects.toThrow(/needs a line/);
  const branded = id();
  await lineStatement(db, branded, f.countryId, brand).run();
  await expect(insert(id(), lineOf(branded))).rejects.toThrow(/needs a line/);

  // A sibling flavor joins the line; a product never leaves one.
  const sibling = id();
  await insert(sibling, lineOf(f.productId));
  await expect(
    db
      .prepare("UPDATE products SET product_family_id=NULL WHERE id=?")
      .bind(sibling)
      .run(),
  ).rejects.toThrow(/needs a line/);
  // Moving to another line of the same brand and country is fine.
  const other = id();
  await lineStatement(db, other, f.countryId).run();
  await db
    .prepare("UPDATE products SET product_family_id=? WHERE id=?")
    .bind(lineOf(other), sibling)
    .run();
  // A product's brand can't drift from its line's.
  await expect(
    db
      .prepare("UPDATE products SET brand_id=? WHERE id=?")
      .bind(brand, sibling)
      .run(),
  ).rejects.toThrow(/needs a line/);

  // A line needs a country, keeps its products' brand and country, and can't
  // be deleted while it has products.
  await expect(
    db
      .prepare(
        "INSERT INTO product_families(id,canonical_name,slug,created_at,updated_at) VALUES(?,?,?,1,1)",
      )
      .bind(id(), "Nowhere", `nowhere-${id()}`)
      .run(),
  ).rejects.toThrow(/needs a country/);
  await expect(
    db
      .prepare("UPDATE product_families SET country_id=? WHERE id=?")
      .bind(f.otherCountryId, lineOf(other))
      .run(),
  ).rejects.toThrow(/keeps its products/);
  await expect(
    db
      .prepare("DELETE FROM product_families WHERE id=?")
      .bind(lineOf(other))
      .run(),
  ).rejects.toThrow(/cannot be deleted/);
  await db
    .prepare("DELETE FROM product_families WHERE id=?")
    .bind(lineOf(branded))
    .run();
});

it("checks flavor labels and Tastiest answers", async () => {
  const f = await catalogFixture(db, 1);
  const flavor = (value: string | null) =>
    db
      .prepare("UPDATE products SET flavor=? WHERE id=?")
      .bind(value, f.productId)
      .run();
  for (const bad of ["", " Spicy", "Spicy\n", "x".repeat(41)])
    await expect(flavor(bad)).rejects.toThrow(/flavor/);
  for (const good of ["Spicy", "x".repeat(40), null]) await flavor(good);
  await expect(
    db.batch([
      lineStatement(db, `p-${f.productId}`, f.countryId),
      db
        .prepare(
          "INSERT INTO products(id,country_id,product_family_id,name,flavor,slug,created_at,updated_at) VALUES(?,?,?,?,?,?,1,1)",
        )
        .bind(
          `p-${f.productId}`,
          f.countryId,
          lineOf(`p-${f.productId}`),
          "Blank",
          "  ",
          `p-${f.productId}`,
        ),
    ]),
  ).rejects.toThrow(/flavor/);

  const rate = (enjoyment: number | null) =>
    db
      .prepare(
        "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,enjoyment,created_at,updated_at) VALUES(?,?,?,?,4,?,1,1)",
      )
      .bind(id(), f.users[0]!.id, f.versionId, f.categories[0], enjoyment)
      .run();
  for (const bad of [0, 6, 3.5])
    await expect(rate(bad)).rejects.toThrow(/enjoyment/);
  await rate(5);
  await expect(
    db
      .prepare("UPDATE ratings SET enjoyment=7 WHERE user_id=?")
      .bind(f.users[0]!.id)
      .run(),
  ).rejects.toThrow(/enjoyment/);
  await db
    .prepare("UPDATE ratings SET enjoyment=NULL WHERE user_id=?")
    .bind(f.users[0]!.id)
    .run();
});
