import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture, lineOf, testMarket } from "./fixtures";
import { CatalogService } from "../../server/catalog/application/service";
import { D1CatalogRepository } from "../../server/catalog/infrastructure/d1-repository";
import { RatingsService } from "../../server/ratings/application/service";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";
import { INITIAL_SCORING } from "../../server/ranking/domain/policy";
import { rebuildSearchIndex } from "../../server/catalog/infrastructure/search-index";
import { brandResponse } from "../../server/catalog/http/brand-response";

const db = env.DB;
const catalog = new CatalogService(new D1CatalogRepository(db));
const ratings = new RatingsService(
  new D1RatingsRepository(db),
  INITIAL_SCORING.closest,
  () => crypto.randomUUID(),
);

// One food under an aisle. Oat Co sells a three-flavor line and a Lite line
// nobody has rated; Bean Co sells one product.
async function world() {
  const f = await catalogFixture(db, 6);
  // Search reads the country by its ISO code.
  await db.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await db
    .prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const s = crypto.randomUUID().slice(0, 8);
  const [cat] = f.categories as [string];
  const [root, aisle] = [`root-${s}`, `aisle-${s}`];
  const oat = `oat-${s}`,
    bean = `bean-${s}`;
  const line = (key: string, brand: string, name: string) => ({
    id: `${key}-line-${s}`,
    brand,
    name,
  });
  const oatMilk = line("oat", oat, "Oat Co Oatmilk"),
    oatLite = line("lite", oat, "Oat Co Lite Oatmilk"),
    beanMilk = line("bean", bean, "Bean Co Soymilk");
  const product = (
    key: string,
    of: typeof oatMilk,
    name: string,
    flavor: string | null,
  ) => ({ id: `${key}-${s}`, version: `${key}-v-${s}`, of, name, flavor });
  const original = product("original", oatMilk, "Oat Co Oatmilk", null),
    strawberry = product(
      "strawberry",
      oatMilk,
      "Oat Co Oatmilk Strawberry",
      "Strawberry",
    ),
    vanilla = product("vanilla", oatMilk, "Oat Co Oatmilk Vanilla", "Vanilla"),
    lite = product("lite", oatLite, "Oat Co Lite Oatmilk", null),
    soy = product("soy", beanMilk, "Bean Co Soymilk", null);
  const products = [original, strawberry, vanilla, lite, soy];
  await db.batch([
    db
      .prepare(
        "INSERT INTO categories(id,slug,name,is_rankable,created_at,updated_at) VALUES(?,?,?,0,1,1)",
      )
      .bind(root, root, `Root ${s}`),
    db
      .prepare(
        "INSERT INTO categories(id,parent_id,slug,name,is_rankable,created_at,updated_at) VALUES(?,?,?,?,0,1,1)",
      )
      .bind(aisle, root, aisle, `Milk aisle ${s}`),
    db.prepare("UPDATE categories SET parent_id=? WHERE id=?").bind(aisle, cat),
    ...[
      [oat, "Oat Co"],
      [bean, "Bean Co"],
    ].map(([id, name]) =>
      db
        .prepare(
          "INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
        )
        .bind(id, `${name} ${s}`, `${id}`, id),
    ),
    ...[oatMilk, oatLite, beanMilk].map((l) =>
      db
        .prepare(
          "INSERT INTO product_families(id,brand_id,country_id,canonical_name,slug,created_at,updated_at) VALUES(?,?,?,?,?,1,1)",
        )
        .bind(l.id, l.brand, f.countryId, l.name, l.id),
    ),
    ...products.flatMap((p, i) => [
      db
        .prepare(
          "INSERT INTO products(id,country_id,brand_id,product_family_id,name,flavor,slug,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,1)",
        )
        .bind(
          p.id,
          f.countryId,
          p.of.brand,
          p.of.id,
          p.name,
          p.flavor,
          p.id,
          1_000 + i,
        ),
      db
        .prepare(
          "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1)",
        )
        .bind(p.version, p.id),
      db
        .prepare(
          "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
        )
        .bind(p.id, cat),
    ]),
  ]);
  const [u0, u1, u2, u3, u4] = f.users;
  // Oat Co Oatmilk: u0 averages 4 over two flavors, u1 4, u4 2 (three
  // people, sum 10). Bean Co: two people, sum 9, so it leads Closest.
  await ratings.rate(u0!, original.version, cat, 5);
  await ratings.rate(u0!, strawberry.version, cat, 3);
  await ratings.rate(u1!, strawberry.version, cat, 4);
  await ratings.rate(u4!, vanilla.version, cat, 2);
  await ratings.rate(u2!, soy.version, cat, 5);
  await ratings.rate(u3!, soy.version, cat, 4);
  // Tastiest: u0 loved the original; u2 found the soy milk only OK.
  await db.batch([
    db
      .prepare(
        "UPDATE ratings SET enjoyment=5 WHERE user_id=? AND product_version_id=?",
      )
      .bind(u0!.id, original.version),
    db
      .prepare(
        "UPDATE ratings SET enjoyment=2 WHERE user_id=? AND product_version_id=?",
      )
      .bind(u2!.id, soy.version),
  ]);
  await ratings.rebuildVersions(products.map((p) => p.version));
  await rebuildSearchIndex(db);
  return {
    f,
    s,
    cat,
    oat,
    oatMilk,
    oatLite,
    beanMilk,
    original,
    strawberry,
    vanilla,
    lite,
    soy,
    us: testMarket(f.countryId),
  };
}

it("lists recipe lines with their flavors in both rankings", async () => {
  const w = await world();
  const top = await catalog.category(w.us, w.cat);
  expect(
    top.ranked.map((row) => [row.name, row.people, row.closestRank]),
  ).toEqual([
    [w.soy.name, 2, 1],
    [w.oatMilk.name, 3, 2],
  ]);
  const oat = top.ranked[1]!;
  expect(oat).toMatchObject({
    lineId: w.oatMilk.id,
    flavorCount: 3,
    // The lead flavor (most ratings) supplies the link.
    leadProduct: { id: w.strawberry.id },
    tastiestRank: 1,
    badges: ["Tastiest"],
  });
  // Flavors: too few answers for their own scores, so by ratings, then name.
  expect(oat.flavors.map((f) => [f.flavor, f.ratingCount, f.score])).toEqual([
    ["Strawberry", 2, null],
    [null, 1, null],
    ["Vanilla", 1, null],
  ]);
  expect(oat.hiddenFlavorCount).toBe(0);
  // A line no one has rated waits under "Not rated yet".
  expect(top.unranked.map((row) => [row.lineId, row.name])).toEqual([
    [w.oatLite.id, w.lite.name],
  ]);

  const tastiest = await catalog.category(w.us, w.cat, { view: "tastiest" });
  expect(tastiest.ranked.map((row) => row.lineId)).toEqual([
    w.oatMilk.id,
    w.beanMilk.id,
  ]);
  expect(tastiest.summary.best?.lineId).toBe(w.oatMilk.id);
  expect(tastiest.summary.tastiestCount).toBe(2);
  // Its header counts only the people who said how tasty: u0 and u2.
  expect(tastiest.summary.tastiestPeople).toBe(2);
  // Each flavor shows its Tastiest answers in the Tastiest view.
  expect(
    tastiest.ranked[0]!.flavors.map((f) => [f.flavor, f.ratingCount]),
  ).toEqual([
    [null, 1],
    ["Strawberry", 0],
    ["Vanilla", 0],
  ]);
});

it("shows a line when any flavor passes a filter and lists only those flavors", async () => {
  const w = await world();
  const store = `store-${w.s}`;
  await db.batch([
    db
      .prepare(
        "INSERT INTO retailers(id,canonical_name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
      )
      .bind(store, store, store, store),
    db
      .prepare(
        "INSERT INTO retailer_markets(retailer_id,country_id,is_active,created_at,updated_at) VALUES(?,?,1,1,1)",
      )
      .bind(store, w.f.countryId),
    db
      .prepare(
        "INSERT INTO product_retailers(product_id,retailer_id,status,created_at,updated_at) VALUES(?,?,'active',1,1)",
      )
      .bind(w.vanilla.id, store),
  ]);
  const filtered = await catalog.category(w.us, w.cat, {
    filters: { stores: [store], freeFrom: [] },
  });
  expect(filtered.ranked.map((row) => row.lineId)).toEqual([w.oatMilk.id]);
  // The filter never changes the line's rank or score.
  expect(filtered.ranked[0]).toMatchObject({
    closestRank: 2,
    matchedStores: [store],
    hiddenFlavorCount: 2,
  });
  expect(filtered.ranked[0]!.flavors.map((f) => f.productId)).toEqual([
    w.vanilla.id,
  ]);
  expect(
    filtered.storeOptions.find((option) => option.slug === store)?.count,
  ).toBe(1);
});

it("gives a flavor's page its line's ranks, its siblings and other lines", async () => {
  const w = await world();
  const page = await catalog.product(w.us, w.vanilla.id, null);
  expect(page.categories[0]).toMatchObject({ rank: 2, rankedCount: 2 });
  expect(page.line).toMatchObject({
    id: w.oatMilk.id,
    name: w.oatMilk.name,
    flavorCount: 3,
    closest: { rank: 2, of: 2, people: 3 },
    tastiest: { rank: 1, of: 2, people: 1 },
  });
  // The flavor's own scores stay beside the line's.
  expect(page.flavorScores).toMatchObject({
    closest: { count: 1 },
    tastiest: { count: 0, score: null },
  });
  expect(page.otherFlavors.map((f) => f.id)).toEqual([
    w.original.id,
    w.strawberry.id,
  ]);
  // Other swaps leave out the product's own line.
  expect(page.others.map((other) => other.slug)).toEqual([w.soy.id]);
  // Search places a flavor by its line's rank.
  const found = await catalog.searchResults(w.us, "strawberry");
  expect(found.products.find((p) => p.slug === w.strawberry.id)).toMatchObject({
    rank: 2,
  });
  // A flavor listed only in another food never links to this one.
  const other = w.f.categories[1]!,
    chocolate = `chocolate-${w.s}`;
  await db.batch([
    db
      .prepare(
        "INSERT INTO products(id,country_id,brand_id,product_family_id,name,flavor,slug,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,1,1)",
      )
      .bind(
        chocolate,
        w.f.countryId,
        w.oat,
        w.oatMilk.id,
        "Oat Co Oatmilk Chocolate",
        "Chocolate",
        chocolate,
      ),
    db
      .prepare(
        "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
      )
      .bind(chocolate, other),
  ]);
  expect(
    (await catalog.product(w.us, w.vanilla.id, null)).otherFlavors.map((f) => [
      f.id,
      f.food,
    ]),
  ).toEqual([
    [w.original.id, w.cat],
    [chocolate, null],
    [w.strawberry.id, w.cat],
  ]);
});

it("finds brands loosely and lists a brand's lines by aisle and food", async () => {
  const w = await world();
  const answers = await catalog.suggest(w.us, `Oat Coo ${w.s}`);
  expect(answers.brands[0]).toMatchObject({
    slug: w.oat,
    productCount: 4,
  });
  // A brand's page is in the sitemap only where something of it is listed.
  const listed = async () =>
    (await catalog.sitemap()).brands.some((b) => b.slug === w.oat);
  expect(await listed()).toBe(true);
  const brand = await catalog.brand(w.us, w.oat);
  expect(brand).toMatchObject({
    productCount: 4,
    availability: { here: true },
  });
  expect(brand.aisles).toHaveLength(1);
  const food = brand.aisles[0]!.foods[0]!;
  expect(food.lines[0]).toMatchObject({
    leadProduct: { slug: w.strawberry.id, imageId: null },
    people: 3,
    tastiestPeople: 1,
    rankedFlavorCount: 3,
  });
  const response = brandResponse(brand).aisles[0]!.foods[0]!.lines[0]!;
  expect(response).not.toHaveProperty("tastiestPeople");
  expect(response).not.toHaveProperty("rankedFlavorCount");
  expect(
    food.lines.map((line) => [line.name, line.closestRank, line.tastiestRank]),
  ).toEqual([
    [w.oatMilk.name, 2, 1],
    [w.lite.name, null, null],
  ]);
  expect(food.lines[0]!.flavors.map((f) => f.flavor)).toEqual([
    null,
    "Strawberry",
    "Vanilla",
  ]);
  // A product under review has no ranking row yet, but its page lists it.
  const barista = `barista-${w.s}`;
  await db.batch([
    db
      .prepare(
        "INSERT INTO product_families(id,brand_id,country_id,canonical_name,slug,created_at,updated_at) VALUES(?,?,?,?,?,1,1)",
      )
      .bind(barista, w.oat, w.f.countryId, "Oat Co Barista", barista),
    db
      .prepare(
        "INSERT INTO products(id,country_id,brand_id,product_family_id,name,slug,lifecycle_status,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'under_review',1,1,1)",
      )
      .bind(barista, w.f.countryId, w.oat, barista, "Oat Co Barista", barista),
    db
      .prepare(
        "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
      )
      .bind(barista, w.cat),
  ]);
  const reviewed = await catalog.brand(w.us, w.oat);
  expect(reviewed.productCount).toBe(5);
  expect(
    reviewed.aisles[0]!.foods[0]!.lines.find((line) => line.lineId === barista),
  ).toMatchObject({
    name: "Oat Co Barista",
    closestRank: null,
    people: 0,
    flavors: [{ id: barista, flavor: null }],
  });
  await expect(catalog.brand(w.us, `missing-${w.s}`)).rejects.toMatchObject({
    status: 404,
  });
  await db
    .prepare(
      "UPDATE products SET lifecycle_status='discontinued' WHERE brand_id=?",
    )
    .bind(w.oat)
    .run();
  expect(await listed()).toBe(false);
  // A line's ID is a product family; it never leaks into the line's name.
  expect(lineOf("x")).toBe("line-x");
});

it("returns the accepted front photo of the lead flavor across discovery reads", async () => {
  const w = await world();
  const imageId = `front-${w.s}`;
  for (const [id, slot, state] of [
    [imageId, "front", "accepted"],
    [`pending-${w.s}`, "front", "pending"],
    [`back-${w.s}`, "back", "accepted"],
  ]) {
    await db
      .prepare(
        "INSERT INTO product_images(id,product_version_id,slot,state,full_r2_key,thumbnail_r2_key,created_at,updated_at) VALUES(?,?,?,?,?,?,1,1)",
      )
      .bind(
        id,
        w.strawberry.version,
        slot,
        state,
        `${id}/full`,
        `${id}/thumbnail`,
      )
      .run();
  }
  const repository = new D1CatalogRepository(db);
  const top = await repository.topProducts(w.us.id, [w.cat], 3);
  expect(top.find((row) => row.lineId === w.oatMilk.id)).toMatchObject({
    imageId,
  });
  const brand = await catalog.brand(w.us, w.oat);
  expect(brand.aisles[0]!.foods[0]!.lines[0]!.leadProduct).toEqual({
    slug: w.strawberry.id,
    imageId,
  });
  const search = await catalog.searchResults(w.us, w.strawberry.name);
  expect(
    search.products.find((row) => row.slug === w.strawberry.id),
  ).toMatchObject({ imageId });
  // Removing the accepted image must not expose a pending replacement or a back photo.
  await db
    .prepare("UPDATE product_images SET state='archived' WHERE id=?")
    .bind(imageId)
    .run();
  expect(
    (await repository.topProducts(w.us.id, [w.cat], 3)).find(
      (row) => row.lineId === w.oatMilk.id,
    )?.imageId,
  ).toBeNull();
});
