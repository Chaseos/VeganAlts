import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture, lineOf, lineStatement } from "./fixtures";

const id = () => crypto.randomUUID();
const db = env.DB;

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
