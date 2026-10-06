import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import { developmentSeedStatements, seedId } from "../../db/seed/statements";
import { CatalogService } from "../../server/catalog/application/service";
import { D1CatalogRepository } from "../../server/catalog/infrastructure/d1-repository";
import { RatingsService } from "../../server/ratings/application/service";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";
import { PersonalRatingsService } from "../../server/ratings/application/personal-service";
import { D1PersonalRatingsRepository } from "../../server/ratings/infrastructure/personal-repository";
import { catalogFixture } from "./fixtures";

const catalog = new CatalogService(new D1CatalogRepository(env.DB));
const ratings = new RatingsService(
  new D1RatingsRepository(env.DB),
  { priorMean: 3.5, priorStrength: 10 },
  () => crypto.randomUUID(),
);
const personal = new PersonalRatingsService(
  new D1PersonalRatingsRepository(env.DB),
);
async function seed() {
  const statements = developmentSeedStatements("test");
  for (let i = 0; i < statements.length; i += 50)
    await env.DB.batch(
      statements
        .slice(i, i + 50)
        .map((s) => env.DB.prepare(s.sql).bind(...s.params)),
    );
}
beforeAll(async () => {
  await seed();
  let cursor: string | null = null;
  do {
    cursor = (await ratings.rebuildPage(cursor)).next;
  } while (cursor);
});

it("finds categories and products through aliases, brands and category ancestry", async () => {
  for (const query of ["mince", "beef", "cheese"]) {
    const result = await catalog.search(query);
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.products.length).toBeGreaterThan(0);
  }
  expect(
    (await catalog.search("mince")).categories.some(
      (c) => c.slug === "ground-beef",
    ),
  ).toBe(true);
  expect(
    (await catalog.search("oatly")).products.every((p) => p.brand === "Oatly"),
  ).toBe(true);
  expect((await catalog.search('" - * ()')).products).toEqual([]);
  expect((await catalog.search('" OR NOT : foo')).products).toEqual([]);
});

it("reads current aggregate rankings separately from unrated and historical formulas", async () => {
  const category = await catalog.category("beef-burgers");
  expect(category.ranked.length).toBeGreaterThan(0);
  expect(category.unranked.some((p) => p.slug === "beyond-burger")).toBe(true);
  expect(
    category.ranked.every(
      (p, i, rows) => i === 0 || rows[i - 1]!.bayesianScore >= p.bayesianScore,
    ),
  ).toBe(true);
  const current = await catalog.product("beyond-beef", null);
  expect(current.categories).toHaveLength(2);
  expect(current.categories.every((c) => c.canRate === 1)).toBe(true);
  const history = await catalog.product(
    "beyond-beef",
    seedId("formula:beyond-beef:historical"),
  );
  expect(history.formula.isCurrent).toBe(0);
  expect(history.categories.every((c) => c.canRate === 0)).toBe(true);
  await expect(
    catalog.product("beyond-beef", seedId("formula:oatly-original:current")),
  ).rejects.toMatchObject({ status: 404 });
  await expect(catalog.category("not-a-category")).rejects.toMatchObject({
    status: 404,
  });
});

it("preserves real staging-style accounts and contributions on repeated seeds", async () => {
  const f = await catalogFixture(env.DB, 1);
  const version = seedId("formula:beyond-beef:current"),
    category = seedId("category:ground-beef");
  const saved = await ratings.rate(f.users[0]!, version, category, 2);
  await env.DB.prepare(
    "UPDATE product_versions SET verified_at=123456 WHERE id=?",
  )
    .bind(version)
    .run();
  await seed();
  const state = await personal.state(f.users[0]!.id, version);
  expect(state.ratings).toEqual([saved.rating]);
  expect(
    await env.DB.prepare("SELECT verified_at FROM product_versions WHERE id=?")
      .bind(version)
      .first("verified_at"),
  ).toBe(123456);
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS count FROM user WHERE id=?")
      .bind(f.users[0]!.id)
      .first("count"),
  ).toBe(1);
});

it("paginates private ratings with stable timestamp ties and exposes only public profile fields", async () => {
  const userId = seedId("taster:0");
  const first = await personal.list(userId, null);
  expect(first.items).toHaveLength(20);
  expect(first.nextCursor).not.toBeNull();
  const second = await personal.list(userId, first.nextCursor);
  expect(second.items.length).toBeGreaterThan(0);
  expect(new Set([...first.items, ...second.items].map((r) => r.id)).size).toBe(
    first.items.length + second.items.length,
  );
  expect([...first.items, ...second.items].some((r) => !r.isCurrent)).toBe(
    true,
  );
  const profile = await catalog.profile("demo_taster_01");
  expect(Object.keys(profile).sort()).toEqual([
    "displayName",
    "handle",
    "ratingCount",
    "triedCount",
  ]);
  const state = await personal.state(
    userId,
    seedId("formula:beyond-beef:current"),
  );
  expect(state.ratings).toHaveLength(2);
  expect(state.triedVersionIds).toHaveLength(1);
});

it("reports created, updated and repeated-write outcomes from successful canonical writes", async () => {
  const f = await catalogFixture(env.DB, 1);
  expect(
    (await ratings.rate(f.users[0]!, f.versionId, f.categories[0]!, 4)).outcome,
  ).toBe("created");
  expect(
    (await ratings.rate(f.users[0]!, f.versionId, f.categories[0]!, 4)).outcome,
  ).toBe("unchanged");
  const changed = await ratings.rate(
    f.users[0]!,
    f.versionId,
    f.categories[0]!,
    2,
  );
  expect(changed.outcome).toBe("updated");
  expect(changed.rating.overallSimilarity).toBe(2);
  expect(changed.tried).toBe(true);
});
