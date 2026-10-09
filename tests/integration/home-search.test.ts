import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { developmentSeedStatements } from "../../db/seed/statements";
import { CatalogService } from "../../server/catalog/application/service";
import { D1CatalogRepository } from "../../server/catalog/infrastructure/d1-repository";
import { RatingsService } from "../../server/ratings/application/service";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";
import {
  EARLY_RATING_THRESHOLD,
  STILL_WAITING_BELOW,
} from "../../server/ranking/domain/display";
import type { Market } from "../../server/catalog/domain/markets";

const catalog = new CatalogService(new D1CatalogRepository(env.DB));
const ratings = new RatingsService(
  new D1RatingsRepository(env.DB),
  { priorMean: 3.5, priorStrength: 10 },
  () => crypto.randomUUID(),
);
let us: Market;
beforeAll(async () => {
  const statements = developmentSeedStatements("test");
  for (let i = 0; i < statements.length; i += 50)
    await env.DB.batch(
      statements
        .slice(i, i + 50)
        .map((s) => env.DB.prepare(s.sql).bind(...s.params)),
    );
  us = await catalog.market("us");
  let cursor: string | null = null;
  do {
    cursor = (await ratings.rebuildPage(cursor)).next;
  } while (cursor);
});

it("answers while typing with at most five foods and products, in one country", async () => {
  expect(await catalog.suggest(us, "b")).toMatchObject({
    foods: [],
    products: [],
  });
  const beef = await catalog.suggest(us, "beef");
  expect(beef.foods.length).toBeGreaterThan(0);
  expect(beef.foods.length).toBeLessThanOrEqual(5);
  expect(beef.products.length).toBeLessThanOrEqual(5);
  const ground = beef.foods.find((food) => food.slug === "ground-beef")!;
  expect(ground).toMatchObject({ name: "Ground Beef", aisle: "Meat" });
  expect(ground.top.length).toBeLessThanOrEqual(3);
  expect(ground.top.map((product) => product.rank)).toEqual(
    ground.top.map((_, index) => index + 1),
  );
  // Groups are never suggested; a food alias finds its food.
  expect(beef.foods.every((food) => food.slug !== "beef")).toBe(true);
  expect(
    (await catalog.suggest(us, "mince")).foods.map((food) => food.slug),
  ).toContain("ground-beef");
  const product = beef.products.find((p) => p.slug === "beyond-beef")!;
  expect(product.rank).toBeGreaterThanOrEqual(1);
  expect(product.food.slug).toMatch(/^(ground-beef|beef-burgers)$/);
  // Another country has its own (empty) catalog.
  const canada = await catalog.market("ca");
  expect((await catalog.suggest(canada, "beef")).products).toEqual([]);
  // The full search page uses the same answers with room for more.
  expect((await catalog.searchResults(us, "beef")).foods).toEqual(
    expect.arrayContaining([expect.objectContaining({ slug: "ground-beef" })]),
  );
});

it("builds the home page from Top data only", async () => {
  const home = await catalog.home(us);
  expect(home.counts.foods).toBeGreaterThanOrEqual(10);
  expect(home.counts.products).toBeGreaterThan(0);
  // Start with these: #1s past Early first, closest first.
  const established = home.startWithThese.filter(
    (leader) =>
      leader.best && leader.best.ratingCount >= EARLY_RATING_THRESHOLD,
  );
  const scores = established.map((leader) => leader.best!.score);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  expect(home.startWithThese.length).toBeLessThanOrEqual(6);
  // Still waiting: under the bar or empty, weakest first.
  const waiting = home.stillWaiting.filter((leader) => leader.best);
  expect(
    waiting.every((leader) => leader.best!.score < STILL_WAITING_BELOW),
  ).toBe(true);
  // Every food in the browse tree sits on a shelf of an aisle.
  const foods = home.aisles.flatMap((aisle) =>
    aisle.shelves.flatMap((shelf) => shelf.foods),
  );
  expect(foods.length).toBe(home.counts.foods);
  expect(home.aisles.map((aisle) => aisle.name)).toEqual(
    expect.arrayContaining(["Meat", "Cheese"]),
  );
  for (const product of [...home.trending, ...home.newest])
    expect(product.foodName.length).toBeGreaterThan(0);
  expect(home.tryFoods[0]).toMatchObject({ slug: "ground-beef" });
});

it("describes a product for one of its foods with ranks and rating context", async () => {
  const product = await catalog.product(us, "beyond-beef", null);
  expect(product.categories.map((food) => food.slug).sort()).toEqual([
    "beef-burgers",
    "ground-beef",
  ]);
  // Without ?food the page is about its first active food.
  expect(product.food).toBe(product.categories.find((c) => c.isActive)!.slug);
  for (const food of product.categories) {
    expect(food.rank).toBeGreaterThanOrEqual(1);
    expect(food.rank!).toBeLessThanOrEqual(food.rankedCount);
    // The distribution accounts for every counted rating.
    expect(food.distribution.reduce((sum, row) => sum + row.count, 0)).toBe(
      food.ratingCount,
    );
    expect(food.details.map((detail) => detail.key)).toEqual(
      food.dimensions.map((dimension) => dimension.key),
    );
  }
  const burgers = await catalog.product(
    us,
    "beyond-beef",
    null,
    "beef-burgers",
  );
  expect(burgers.food).toBe("beef-burgers");
  expect(burgers.place?.aisle?.name).toBe("Meat");
  expect(burgers.others.every((other) => other.slug !== "beyond-beef")).toBe(
    true,
  );
  expect(burgers.allergenOptions.map((option) => option.key)).toContain("soy");
  await expect(
    catalog.product(us, "beyond-beef", null, "cheddar"),
  ).rejects.toMatchObject({ status: 404 });

  // An earlier formula keeps its own figures but never claims the live rank.
  const earlier = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO product_versions(id,product_id,version_label,is_current,created_at,updated_at) VALUES(?,?,?,0,1,1)",
  )
    .bind(earlier, product.id, "Earlier recipe")
    .run();
  const old = await catalog.product(us, "beyond-beef", earlier);
  expect(old.formula.id).toBe(earlier);
  for (const food of old.categories)
    expect(food).toMatchObject({ rank: null, rankedCount: 0, early: false });
});
