import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { taxonomyServices } from "../../server/taxonomy/infrastructure/composition";
import { catalogService } from "../../server/catalog/infrastructure/composition";
import { rebuildSearchIndex } from "../../server/catalog/infrastructure/search-index";
import { taxonomySeedStatements } from "../../db/seed/taxonomy";

const id = () => crypto.randomUUID();
const note = "Aisle order and season maintenance for the test.";
const testEnv = {
  ...env,
  APP_ENV: "local",
  MODERATION_PROVIDER: "fake",
} as unknown as Cloudflare.Env;
const seed = async () => {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  await rebuildSearchIndex(env.DB);
};
const category = (slug: string) =>
  env.DB.prepare(
    "SELECT id,position,season_start AS seasonStart,season_end AS seasonEnd,revision FROM categories WHERE slug=?",
  )
    .bind(slug)
    .first<{
      id: string;
      position: number | null;
      seasonStart: number | null;
      seasonEnd: number | null;
      revision: number;
    }>();

it("rejects a half or invalid season, a negative position and a non-boolean seasonal flag", async () => {
  const insert = (season: [number | null, number | null], position = 0) =>
    env.DB.prepare(
      "INSERT INTO categories(id,slug,name,is_rankable,position,season_start,season_end,created_at,updated_at) VALUES(?,?,?,1,?,?,?,1,1)",
    )
      .bind(id(), `food-${id()}`, `Food ${id()}`, position, ...season)
      .run();
  await expect(insert([13, 1])).rejects.toThrow(/invalid category/);
  await expect(insert([11, null])).rejects.toThrow(/invalid category/);
  await expect(insert([null, null], -1)).rejects.toThrow(/invalid category/);
  await insert([11, 1]);
  await insert([null, null]);
  await expect(
    env.DB.prepare(
      "INSERT INTO countries(id,iso2,name,created_at,updated_at) VALUES('c-x','XX','X',1,1)",
    )
      .run()
      .then(() =>
        env.DB.prepare(
          "INSERT INTO products(id,country_id,name,slug,seasonal,created_at,updated_at) VALUES(?,?,?,?,2,1,1)",
        )
          .bind("p-x", "c-x", "X", "p-x")
          .run(),
      ),
  ).rejects.toThrow(/seasonal must be 0 or 1/);
});

it("seeds default positions and seasons, fills only what an operator never set, and orders by popularity", async () => {
  await seed();
  expect(await category("beef")).toMatchObject({ position: 1 });
  expect(await category("condiments")).toMatchObject({ position: 14 });
  expect(await category("eggnog")).toMatchObject({
    seasonStart: 11,
    seasonEnd: 1,
  });
  expect(await category("turkey-roast")).toMatchObject({
    seasonStart: 10,
    seasonEnd: 12,
  });

  // Without ratings, the United States reads in the default store order.
  const catalog = catalogService(env);
  const us = await catalog.market("us");
  const order = async () =>
    (await catalog.page("us")).aisles.map((aisle) => aisle.slug);
  expect((await order()).slice(0, 4)).toEqual([
    "beef",
    "chicken",
    "pork",
    "turkey-aisle",
  ]);
  // Suggest a food lists every aisle in the default order, Lamb included.
  expect((await catalog.aisles(us)).map((a) => a.slug).slice(3, 5)).toEqual([
    "turkey-aisle",
    "lamb-aisle",
  ]);

  // Ratings in one aisle move it, and its food, ahead.
  const cheddar = (await category("cheddar"))!.id;
  const product = `p-${id()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO products(id,country_id,name,slug,created_at,updated_at) SELECT ?,id,'Sharp shreds',?,1,1 FROM countries WHERE iso2='US'",
    ).bind(product, product),
    env.DB.prepare(
      "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1)",
    ).bind(`${product}-v`, product),
    env.DB.prepare(
      "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
    ).bind(product, cheddar),
    env.DB.prepare(
      "INSERT INTO product_category_stats(product_version_id,category_id,rating_count,rating_sum,raw_average,bayesian_score,tried_count,recent_rating_count,recomputed_at) VALUES(?,?,7,28,4,3.8,7,0,1)",
    ).bind(`${product}-v`, cheddar),
  ]);
  expect((await order())[0]).toBe("cheese");
  const cheese = (await catalog.page("us")).aisles[0]!;
  expect(cheese.foods[0]!.slug).toBe("cheddar");
  // The food's own page carries its season.
  expect((await catalog.category(us, "eggnog")).category).toMatchObject({
    seasonStart: 11,
    seasonEnd: 1,
  });

  // An operator clears Eggnog's season and moves Beef: reseeding keeps both.
  const operatorId = `op-${id()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,1,1)",
    ).bind(operatorId, "Operator", `${operatorId}@example.invalid`),
    env.DB.prepare(
      "INSERT INTO profiles(user_id,handle,created_at,updated_at) VALUES(?,?,1,1)",
    ).bind(operatorId, operatorId),
  ]);
  const operator = {
    id: operatorId,
    accountState: "active",
    administrator: true,
  };
  const service = taxonomyServices(testEnv, id);
  const eggnog = (await category("eggnog"))!;
  const cleared = (await service.update(operator, id(), eggnog.id, {
    expectedRevision: eggnog.revision,
    season: null,
    note,
  })) as { actionId: string };
  const beef = (await category("beef"))!;
  await service.update(operator, id(), beef.id, {
    expectedRevision: beef.revision,
    position: 20,
    note,
  });
  await seed();
  expect(await category("eggnog")).toMatchObject({
    seasonStart: null,
    seasonEnd: null,
  });
  expect(await category("beef")).toMatchObject({ position: 20 });
  // A reversal restores the season exactly.
  await service.reverseUpdate(operator, id(), cleared.actionId, note);
  expect(await category("eggnog")).toMatchObject({
    seasonStart: 11,
    seasonEnd: 1,
  });
  // A half season is refused before any write.
  await expect(
    service.update(operator, id(), eggnog.id, {
      expectedRevision: (await category("eggnog"))!.revision,
      season: { start: 0, end: 3 },
      note,
    }),
  ).rejects.toThrow();
});
