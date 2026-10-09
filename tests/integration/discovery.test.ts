import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { trendingService } from "../../server/ranking/infrastructure/trending-composition";
import { CatalogService } from "../../server/catalog/application/service";
import { D1CatalogRepository } from "../../server/catalog/infrastructure/d1-repository";
import { RatingsService } from "../../server/ratings/application/service";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";
import { trendingParameters } from "../../server/ranking/domain/trending";
import { INITIAL_RANKING_PARAMETERS } from "../../server/ranking/domain/policy";

const DAY = 86_400_000;
const NOW = Date.UTC(2032, 2, 10, 12);
const rankingEnv = {
  DB: env.DB,
  RANKING_PRIOR_MEAN: "3.5",
  RANKING_PRIOR_STRENGTH: "10",
} as Parameters<typeof trendingService>[0];

async function world() {
  const f = await catalogFixture(env.DB, 8);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const s = crypto.randomUUID().slice(0, 8);
  const category = f.categories[0]!;
  const steady = `steady-${s}`,
    steadyVersion = `steady-v-${s}`,
    fresh = `fresh-${s}`,
    freshVersion = `fresh-v-${s}`,
    gone = `gone-${s}`,
    goneVersion = `gone-v-${s}`;
  await env.DB.batch([
    env.DB.prepare("UPDATE products SET published_at=? WHERE id=?").bind(
      NOW - 200 * DAY,
      f.productId,
    ),
    env.DB.prepare(
      "INSERT INTO products(id,country_id,name,slug,published_at,lifecycle_status,created_at,updated_at) VALUES(?,?,?,?,?,'active',1,1),(?,?,?,?,?,'active',1,1),(?,?,?,?,?,'discontinued',1,1)",
    ).bind(
      steady,
      f.countryId,
      `Steady ${s}`,
      steady,
      NOW - 300 * DAY,
      fresh,
      f.countryId,
      `Fresh ${s}`,
      fresh,
      NOW - 2 * DAY,
      gone,
      f.countryId,
      `Gone ${s}`,
      gone,
      NOW - 3 * DAY,
    ),
    env.DB.prepare(
      "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1),(?,?,1,1,1),(?,?,1,1,1)",
    ).bind(steadyVersion, steady, freshVersion, fresh, goneVersion, gone),
    env.DB.prepare(
      "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1),(?,?,1,1),(?,?,1,1)",
    ).bind(steady, category, fresh, category, gone, category),
  ]);
  const ratings = new RatingsService(
    new D1RatingsRepository(env.DB),
    INITIAL_RANKING_PARAMETERS,
    () => crypto.randomUUID(),
  );
  // The fixture product receives a recent burst; the steady product has an
  // older, larger history and leads Top.
  const rate = (user: string, version: string, score: number, at: number) =>
    env.DB.prepare(
      "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    ).bind(crypto.randomUUID(), user, version, category, score, at, at);
  await env.DB.batch([
    ...f.users
      .slice(0, 4)
      .map((u, i) => rate(u.id, f.versionId, 4, NOW - i * 3_600_000)),
    ...f.users.map((u) => rate(u.id, steadyVersion, 5, NOW - 40 * DAY)),
  ]);
  await ratings.rebuildVersions([f.versionId, steadyVersion]);
  return { f, s, category, steady, fresh, gone };
}
const topHash = async (category: string) =>
  JSON.stringify(
    (
      await env.DB.prepare(
        "SELECT product_version_id,rating_count,rating_sum,bayesian_score FROM product_category_stats WHERE category_id=? ORDER BY product_version_id",
      )
        .bind(category)
        .all()
    ).results,
  );

it("computes Trending and New from precomputed activity without changing Top", async () => {
  const w = await world();
  const catalog = new CatalogService(
    new D1CatalogRepository(env.DB),
    () => NOW,
  );
  const slug = w.category;
  const top = await catalog.category(slug, 1, 1, "top");
  const before = await topHash(w.category);
  await trendingService(rankingEnv, () => NOW).rebuild();
  expect(await topHash(w.category)).toBe(before);
  expect((await catalog.category(slug, 1, 1, "top")).ranked).toEqual(
    top.ranked,
  );
  expect(top.ranked[0]!.id).toBe(w.steady);
  const trending = await catalog.category(slug, 1, 1, "trending");
  expect(trending.discovery.map((p) => p.id)).toEqual([w.f.productId]);
  // New lists recent eligible products before they have any ratings.
  const fresh = await catalog.category(slug, 1, 1, "new");
  expect(fresh.discovery.map((p) => p.id)).toEqual([w.fresh]);
  expect(fresh.discovery[0]).toMatchObject({ ratingCount: 0, isNew: true });
  // The configured New window bounds the view: a one-day window excludes a
  // product published two days ago.
  expect(
    (
      await new CatalogService(
        new D1CatalogRepository(env.DB),
        () => NOW,
        trendingParameters('{"newDays":1}').newDays,
      ).category(slug, 1, 1, "new")
    ).discovery.map((p) => p.id),
  ).not.toContain(w.fresh);
  const home = await catalog.home();
  expect(home.trending.map((p) => p.id)).toContain(w.f.productId);
  expect(home.newest.map((p) => p.id)).toContain(w.fresh);
  expect(home.newest.map((p) => p.id)).not.toContain(w.gone);
  // Without new activity the burst fades out of Trending.
  await trendingService(rankingEnv, () => NOW + 9 * DAY).rebuild();
  expect(
    (
      await new CatalogService(
        new D1CatalogRepository(env.DB),
        () => NOW + 9 * DAY,
      ).category(slug, 1, 1, "trending")
    ).discovery,
  ).toEqual([]);
  expect(await topHash(w.category)).toBe(before);
});

it("serves every category view without reading raw ratings", async () => {
  const w = await world();
  await trendingService(rankingEnv, () => NOW).rebuild();
  const statements: string[] = [];
  const recording = new Proxy(env.DB, {
    get(target, property, receiver) {
      if (property === "prepare")
        return (sql: string) => {
          statements.push(sql);
          return target.prepare(sql);
        };
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const catalog = new CatalogService(
    new D1CatalogRepository(recording),
    () => NOW,
  );
  for (const view of ["top", "trending", "new"] as const)
    await catalog.category(w.category, 1, 1, view);
  await catalog.home();
  expect(statements.length).toBeGreaterThan(0);
  for (const sql of statements)
    expect(sql).not.toMatch(/\b(from|join)\s+ratings\b/i);
});
