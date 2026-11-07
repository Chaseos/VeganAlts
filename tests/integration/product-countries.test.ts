import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { D1CatalogRepository } from "../../server/catalog/infrastructure/d1-repository";

const db = env.DB;
const catalog = new D1CatalogRepository(db);
const rows = (productId: string) =>
  db
    .prepare(
      "SELECT country_id AS countryId,source FROM product_countries WHERE product_id=? ORDER BY source",
    )
    .bind(productId)
    .all<{ countryId: string; source: string }>();
const sellIn = (productId: string, countryId: string, source = "member") =>
  db
    .prepare(
      "INSERT INTO product_countries(product_id,country_id,source,created_at) VALUES(?,?,?,1)",
    )
    .bind(productId, countryId, source)
    .run();

it("gives every product its home country and keeps it", async () => {
  const f = await catalogFixture(db, 0);
  expect((await rows(f.productId)).results).toEqual([
    { countryId: f.countryId, source: "home" },
  ]);
  await expect(
    db
      .prepare("UPDATE products SET country_id=? WHERE id=?")
      .bind(f.otherCountryId, f.productId)
      .run(),
  ).rejects.toThrow(/line of its brand and country/);
  await expect(sellIn(f.productId, f.otherCountryId, "home")).rejects.toThrow(
    /UNIQUE/,
  );
});

it("lists a product in another country once it's sold there", async () => {
  const f = await catalogFixture(db, 0);
  expect(await catalog.product(f.otherCountryId, f.productId, null)).toBeNull();
  await sellIn(f.productId, f.otherCountryId);
  const here = await catalog.product(f.otherCountryId, f.productId, null);
  expect(here?.id).toBe(f.productId);
  expect((await catalog.product(f.countryId, f.productId, null))?.id).toBe(
    f.productId,
  );
});
