import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture, productRows } from "./fixtures";
import { CommunityLookupRepository } from "../../server/community/infrastructure/lookup-repository";
import { communityServices } from "../../server/community/infrastructure/composition";
import { normalizeName } from "../../server/community/domain/policy";

it("offers every active food beyond 100 and retains labels for retired memberships", async () => {
  const f = await catalogFixture(env.DB);
  const ids = Array.from({ length: 116 }, () => crypto.randomUUID());
  await env.DB.batch(
    ids.map((id, i) =>
      env.DB.prepare(
        "INSERT INTO categories(id,slug,name,is_rankable,created_at,updated_at) VALUES(?,?,?,1,1,1)",
      ).bind(
        id,
        id,
        i === 115 ? "Z Yogurt" : `Food ${String(i).padStart(3, "0")}`,
      ),
    ),
  );
  const lookup = new CommunityLookupRepository(env.DB);
  const options = await lookup.options("no product matches");
  expect(options.categories.map((c) => c.id)).toEqual(
    expect.arrayContaining(ids),
  );
  await env.DB.prepare(
    "UPDATE categories SET name='Retired food',is_active=0 WHERE id=?",
  )
    .bind(f.categories[0])
    .run();
  const product = await communityServices(env).contributions.product(
    { ...f.users[0]!, administrator: false },
    f.productId,
  );
  expect(product.categoryNames[f.categories[0]!]).toBe("Retired food");
  expect(
    (await lookup.options()).categories.some((c) => c.id === f.categories[0]),
  ).toBe(false);
});

it("finds products by brand, brand alias and product alias with unambiguous market labels", async () => {
  const f = await catalogFixture(env.DB);
  const brand = crypto.randomUUID(),
    otherBrand = crypto.randomUUID();
  const milk = crypto.randomUUID(),
    otherMilk = crypto.randomUUID(),
    hidden = crypto.randomUUID();
  const alias = `Alias ${brand}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?, ?,1,1),(?,?,?, ?,1,1)",
    ).bind(
      brand,
      "Silk",
      "silk",
      brand,
      otherBrand,
      "Other brand",
      "other brand",
      otherBrand,
    ),
    env.DB.prepare(
      "INSERT INTO brand_aliases(brand_id,alias,normalized_name) VALUES(?,?,?)",
    ).bind(brand, alias, normalizeName(alias)),
    ...productRows(
      env.DB,
      milk,
      f.countryId,
      "Original Almondmilk",
      milk,
      brand,
    ),
    ...productRows(
      env.DB,
      otherMilk,
      f.otherCountryId,
      "Original Almondmilk",
      otherMilk,
      otherBrand,
    ),
    ...productRows(env.DB, hidden, f.countryId, "Hidden milk", hidden, brand),
    env.DB.prepare(
      "UPDATE products SET lifecycle_status='hidden' WHERE id=?",
    ).bind(hidden),
    env.DB.prepare(
      "INSERT INTO product_aliases(id,product_id,alias,created_at) VALUES(?,?,?,1)",
    ).bind(crypto.randomUUID(), milk, `Old label ${milk}`),
  ]);
  const lookup = new CommunityLookupRepository(env.DB);
  for (const query of ["Silk", alias, `Old label ${milk}`]) {
    expect((await lookup.options(query)).products, query).toEqual([
      expect.objectContaining({
        id: milk,
        name: "Original Almondmilk",
        brand: "Silk",
        country: `US-${f.countryId.slice(8)}`,
      }),
    ]);
  }
  const sameNames = (await lookup.options("Original Almondmilk")).products;
  expect(sameNames).toHaveLength(2);
  expect(
    new Set(sameNames.map((p) => `${p.brand} · ${p.name} · ${p.country}`)).size,
  ).toBe(2);
  expect((await lookup.options("%_")).products).toEqual([]);
});
