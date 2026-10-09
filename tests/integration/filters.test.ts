import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { CatalogService } from "../../server/catalog/application/service";
import { D1CatalogRepository } from "../../server/catalog/infrastructure/d1-repository";
import { catalogFixture, testMarket } from "./fixtures";

const catalog = new CatalogService(new D1CatalogRepository(env.DB));

// One food in two countries. Products A > B > C are ranked; D is unrated.
// Store reports: A at Target and Aldi (active), B at Kroger (active), C at
// Target (uncertain) and at Closed (active, but its market is inactive).
// "Twin" in the other country shares A's slug and is also at Target.
async function world() {
  const f = await catalogFixture(env.DB, 0);
  const s = crypto.randomUUID().slice(0, 8);
  const category = f.categories[0]!;
  const product = (
    key: string,
    country = f.countryId,
    slug = `${key}-${s}`,
  ) => ({
    id: `${key}-${s}`,
    version: `${key}-v-${s}`,
    slug,
    country,
  });
  const a = product("a"),
    b = product("b"),
    c = product("c"),
    d = product("d"),
    twin = product("twin", f.otherCountryId, `a-${s}`);
  const retailer = (key: string) => ({
    id: `${key}-r-${s}`,
    slug: `${key}-${s}`,
  });
  const target = retailer("target"),
    kroger = retailer("kroger"),
    aldi = retailer("aldi"),
    closed = retailer("closed");
  const statements = [
    ...[a, b, c, d, twin].flatMap((p) => [
      env.DB.prepare(
        "INSERT INTO products(id,country_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
      ).bind(p.id, p.country, p.id, p.slug),
      env.DB.prepare(
        "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1)",
      ).bind(p.version, p.id),
      env.DB.prepare(
        "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
      ).bind(p.id, category),
    ]),
    ...(
      [
        [a, 4.5, 20],
        [b, 4.0, 12],
        [c, 3.6, 5],
        [twin, 4.9, 30],
      ] as const
    ).map(([p, score, count]) =>
      env.DB.prepare(
        "INSERT INTO product_category_stats(product_version_id,category_id,rating_count,rating_sum,raw_average,bayesian_score,recomputed_at) VALUES(?,?,?,?,?,?,1)",
      ).bind(p.version, category, count, count * 4, 4, score),
    ),
    ...[target, kroger, aldi, closed].map((r) =>
      env.DB.prepare(
        "INSERT INTO retailers(id,canonical_name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
      ).bind(r.id, r.slug, r.slug, r.slug),
    ),
    ...(
      [
        [target, f.countryId, 1],
        [kroger, f.countryId, 1],
        [aldi, f.countryId, 1],
        [closed, f.countryId, 0],
        [target, f.otherCountryId, 1],
      ] as const
    ).map(([r, country, active]) =>
      env.DB.prepare(
        "INSERT INTO retailer_markets(retailer_id,country_id,is_active,created_at,updated_at) VALUES(?,?,?,1,1)",
      ).bind(r.id, country, active),
    ),
    ...(
      [
        [a, target, "active"],
        [a, aldi, "active"],
        [b, kroger, "active"],
        [c, target, "uncertain"],
        [c, closed, "active"],
        [d, target, "active"],
        [twin, target, "active"],
      ] as const
    ).map(([p, r, status]) =>
      env.DB.prepare(
        "INSERT INTO product_retailers(product_id,retailer_id,status,created_at,updated_at) VALUES(?,?,?,1,1)",
      ).bind(p.id, r.id, status),
    ),
  ];
  await env.DB.batch(statements);
  return {
    f,
    s,
    category,
    a,
    b,
    c,
    d,
    twin,
    target,
    kroger,
    aldi,
    closed,
    us: testMarket(f.countryId, "us"),
    ca: testMarket(f.otherCountryId, "ca"),
  };
}

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

it("combines stores with OR and counts only active reports in an active market", async () => {
  const w = await world();
  const all = await catalog.category(w.us, w.category);
  expect(ids(all.ranked)).toEqual([w.a.id, w.b.id, w.c.id]);
  expect(all.ranked.map((row) => row.topRank)).toEqual([1, 2, 3]);

  const target = await catalog.category(w.us, w.category, {
    filters: { stores: [w.target.slug], freeFrom: [] },
  });
  // C's Target report is uncertain, so it never qualifies.
  expect(ids(target.ranked)).toEqual([w.a.id]);
  expect(target.ranked[0]!.matchedStores).toEqual([w.target.slug]);
  expect(ids(target.unranked)).toEqual([w.d.id]);

  const either = await catalog.category(w.us, w.category, {
    filters: { stores: [w.kroger.slug, w.target.slug], freeFrom: [] },
  });
  expect(ids(either.ranked)).toEqual([w.a.id, w.b.id]);
  // Filtered rows keep their overall Top rank and score.
  expect(either.ranked.map((row) => row.topRank)).toEqual([1, 2]);
  expect(either.ranked.map((row) => row.bayesianScore)).toEqual(
    all.ranked.slice(0, 2).map((row) => row.bayesianScore),
  );

  // A store whose market is inactive never qualifies a product.
  expect(
    (
      await catalog.category(w.us, w.category, {
        filters: { stores: [w.closed.slug], freeFrom: [] },
      })
    ).ranked,
  ).toEqual([]);

  // Options list the country's active stores with ranked swaps in this food.
  const counts = Object.fromEntries(
    all.storeOptions.map((option) => [option.slug, option.count]),
  );
  expect(counts).toEqual({
    [w.target.slug]: 1,
    [w.kroger.slug]: 1,
    [w.aldi.slug]: 1,
  });
});

it("validates filters against the country and never changes Top", async () => {
  const w = await world();
  const before = await env.DB.prepare(
    "SELECT * FROM product_category_stats WHERE category_id=? ORDER BY product_version_id",
  )
    .bind(w.category)
    .all();
  const checked = await catalog.validateFilters(w.us, {
    stores: [w.closed.slug, "unknown-store", w.target.slug],
    freeFrom: ["milk", "made_up"],
  });
  // The inactive market and unknown values are dropped; the fixture country
  // has no allergen list, so every allergen is unknown there.
  expect(checked.filters).toEqual({ stores: [w.target.slug], freeFrom: [] });
  expect(checked.changed).toBe(true);
  expect(
    (
      await catalog.validateFilters(w.us, {
        stores: [w.target.slug],
        freeFrom: [],
      })
    ).changed,
  ).toBe(false);
  for (const view of ["top", "trending", "new"] as const)
    await catalog.category(w.us, w.category, {
      view,
      filters: { stores: [w.target.slug], freeFrom: [] },
    });
  expect(
    await env.DB.prepare(
      "SELECT * FROM product_category_stats WHERE category_id=? ORDER BY product_version_id",
    )
      .bind(w.category)
      .all(),
  ).toEqual(before);
});

it("keeps every country's catalog separate even when slugs repeat", async () => {
  const w = await world();
  expect(ids((await catalog.category(w.ca, w.category)).ranked)).toEqual([
    w.twin.id,
  ]);
  expect(ids((await catalog.category(w.us, w.category)).ranked)).not.toContain(
    w.twin.id,
  );
  // The same slug resolves to a different product in each country.
  expect((await catalog.product(w.us, w.a.slug, null)).id).toBe(w.a.id);
  expect((await catalog.product(w.ca, w.a.slug, null)).id).toBe(w.twin.id);
  // Canadian Target reports never count toward the United States.
  const caOptions = (await catalog.category(w.ca, w.category)).storeOptions;
  expect(caOptions.map((option) => option.slug)).toEqual([w.target.slug]);
  expect(caOptions[0]!.count).toBe(1);
});

it("resolves only active countries and builds their aisle tree", async () => {
  await expect(catalog.market("zz")).rejects.toMatchObject({ status: 404 });
  await expect(catalog.market("usa")).rejects.toMatchObject({ status: 404 });
  const w = await world();
  await env.DB.prepare("UPDATE countries SET iso2='ZY' WHERE id=?")
    .bind(w.f.otherCountryId)
    .run();
  expect((await catalog.market("zy")).id).toBe(w.f.otherCountryId);
  await env.DB.prepare("UPDATE countries SET is_active=0 WHERE id=?")
    .bind(w.f.otherCountryId)
    .run();
  await expect(catalog.market("zy")).rejects.toMatchObject({ status: 404 });
  expect(
    (await catalog.markets()).some((row) => row.market.code === "zy"),
  ).toBe(false);
});

it("sorts by detail scores and rating counts and filters by label without changing Top", async () => {
  const w = await world();
  const q = (key: string) => `${key}-q-${w.s}`;
  const stat = (
    p: { version: string },
    key: string,
    count: number,
    sum: number,
  ) =>
    env.DB.prepare(
      "INSERT INTO product_category_dimension_stats(product_version_id,category_id,dimension_id,answer_count,answer_sum,recomputed_at) VALUES(?,?,?,?,?,1)",
    ).bind(p.version, w.category, q(key), count, sum);
  await env.DB.batch([
    ...["taste", "melt"].map((key, index) =>
      env.DB.prepare(
        "INSERT INTO category_rating_dimensions(id,category_id,key,label,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,1,1)",
      ).bind(
        q(key),
        w.category,
        key,
        key === "taste" ? "Taste" : "Melt",
        index,
      ),
    ),
    stat(w.a, "taste", 6, 24),
    stat(w.b, "taste", 5, 24),
    stat(w.c, "taste", 2, 10),
    stat(w.a, "melt", 5, 22),
    stat(w.b, "melt", 5, 20),
    env.DB.prepare(
      "INSERT INTO country_allergens(country_id,allergen_key,position) VALUES(?,'soy',0),(?,'wheat',1)",
    ).bind(w.f.countryId, w.f.countryId),
    env.DB.prepare(
      "INSERT INTO product_version_allergen_declarations(product_version_id,status,evidence_data,created_at,updated_at) VALUES(?,'declared','{}',1,1),(?,'none_declared','{}',1,1)",
    ).bind(w.a.version, w.b.version),
    env.DB.prepare(
      "INSERT INTO product_version_allergens(product_version_id,allergen_key,presence) VALUES(?,'soy','contains')",
    ).bind(w.a.version),
  ]);
  const top = await catalog.category(w.us, w.category);
  const ranks = Object.fromEntries(
    top.ranked.map((row) => [row.id, [row.topRank, row.bayesianScore]]),
  );
  const same = (rows: typeof top.ranked) =>
    rows.forEach((row) =>
      expect([row.topRank, row.bayesianScore]).toEqual(ranks[row.id]),
    );
  expect(top.questions.map((question) => question.key)).toEqual([
    "taste",
    "melt",
  ]);
  // Taste: B (4.8) and A (4.0) have five answers; C follows in Top order.
  const taste = await catalog.category(w.us, w.category, {
    view: "detail-taste",
  });
  expect(ids(taste.ranked)).toEqual([w.b.id, w.a.id, w.c.id]);
  expect(taste.qualified).toBe(2);
  same(taste.ranked);
  expect(taste.ranked[2]!.details[0]).toMatchObject({ mean: null, count: 2 });
  // "Best taste" goes to B; A is already #1, so it gets no melt badge.
  expect(
    Object.fromEntries(top.ranked.map((row) => [row.id, row.badges])),
  ).toEqual({
    [w.a.id]: [],
    [w.b.id]: ["Best taste"],
    [w.c.id]: [],
  });
  const rated = await catalog.category(w.us, w.category, {
    view: "most-rated",
  });
  expect(ids(rated.ranked)).toEqual([w.a.id, w.b.id, w.c.id]);
  same(rated.ranked);
  // Free from soy: only confirmed labels without soy; C is not confirmed.
  const soyFree = await catalog.category(w.us, w.category, {
    filters: { stores: [], freeFrom: ["soy"] },
  });
  expect(ids(soyFree.ranked)).toEqual([w.b.id]);
  expect(soyFree.notConfirmedCount).toBe(1);
  expect(soyFree.ranked[0]!.badges).toEqual(["Best taste"]);
  same(soyFree.ranked);
  expect(soyFree.summary.rankedCount).toBe(3);
  expect(top.ranked[0]!.allergens).toEqual({
    status: "declared",
    contains: ["soy"],
    mayContain: [],
  });
  // A detail sort the food does not ask about is refused.
  await expect(
    catalog.category(w.us, w.category, { view: "detail-crunch" }),
  ).rejects.toMatchObject({ code: "UNKNOWN_VIEW" });
});
