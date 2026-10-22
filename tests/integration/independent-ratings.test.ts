import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture, lineOf, testMarket } from "./fixtures";
import { RatingsService } from "../../server/ratings/application/service";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";
import { D1PersonalRatingsRepository } from "../../server/ratings/infrastructure/personal-repository";
import { D1CatalogRepository } from "../../server/catalog/infrastructure/d1-repository";
import { CatalogService } from "../../server/catalog/application/service";
import { D1TrendingRepository } from "../../server/ranking/infrastructure/d1-trending-repository";
import { LineRefresh } from "../../server/ranking/infrastructure/line-refresh";
import { aggregateLine } from "../../server/ranking/domain/lines";
import { INITIAL_SCORING } from "../../server/ranking/domain/policy";
import { NO_FILTERS } from "../../server/catalog/domain/filters";

const db = env.DB;
const now = 1_800_000_000_000;
const ratings = new RatingsService(
  new D1RatingsRepository(db),
  INITIAL_SCORING.closest,
  () => crypto.randomUUID(),
  () => now,
);
const catalog = new CatalogService(new D1CatalogRepository(db), () => now);
const personal = new D1PersonalRatingsRepository(db);

it("saves taste alone, ranks it independently, clears each answer and keeps Tried", async () => {
  const f = await catalogFixture(db, 2);
  const category = f.categories[0]!;
  const actor = f.users[0]!;
  await db
    .prepare(
      "INSERT OR IGNORE INTO category_countries(category_id,country_id,source,created_at) VALUES(?,?,'operator',1)",
    )
    .bind(category, f.countryId)
    .run();
  const market = testMarket(f.countryId);
  const saved = await ratings.rate(actor, f.versionId, category, null, {
    enjoyment: 5,
  });
  expect(saved).toMatchObject({
    outcome: "created",
    tried: true,
    rating: { overallSimilarity: null, enjoyment: 5 },
  });
  expect((await personal.list(actor.id, null, 20))[0]).toMatchObject({
    overallSimilarity: null,
    enjoyment: 5,
  });
  expect((await personal.state(actor.id, [f.versionId])).ratings).toMatchObject(
    [{ overallSimilarity: null, enjoyment: 5 }],
  );
  const read = () =>
    db
      .prepare(
        "SELECT * FROM product_category_stats WHERE product_version_id=? AND category_id=?",
      )
      .bind(f.versionId, category)
      .first();
  expect(await read()).toMatchObject({
    rating_count: 0,
    rating_sum: 0,
    raw_average: null,
    bayesian_score: null,
    enjoyment_count: 1,
    enjoyment_sum: 5,
    tried_count: 1,
    recent_rating_count: 0,
  });
  expect((await catalog.category(market, category)).ranked).toHaveLength(0);
  const tasty = await catalog.category(market, category, { view: "tastiest" });
  expect(tasty.ranked).toMatchObject([
    { closestRank: null, tastiestRank: 1, people: 1 },
  ]);
  expect(tasty.unranked).toHaveLength(0);
  expect(tasty.summary).toMatchObject({
    rankedCount: 0,
    tastiestCount: 1,
    best: { lineId: lineOf(f.productId) },
  });
  const product = await catalog.product(market, f.productId, null);
  expect(
    product.categories.find((food) => food.id === category)?.line,
  ).toMatchObject({ closest: null, tastiest: { rank: 1, people: 1 } });
  // Taste-only answers never enter Closest's familiarity histogram or trend sums.
  expect(
    (
      await db
        .prepare(
          "SELECT * FROM product_category_familiarity_stats WHERE product_version_id=?",
        )
        .bind(f.versionId)
        .all()
    ).results,
  ).toEqual([]);
  const trends = new D1TrendingRepository(db);
  await trends.rollupDay(Math.floor(now / 86400_000) * 86400_000);
  expect(
    (
      await db
        .prepare(
          "SELECT * FROM family_category_daily_stats WHERE product_family_id=? AND category_id=?",
        )
        .bind(lineOf(f.productId), category)
        .all()
    ).results,
  ).toMatchObject([{ rating_count: 0, similarity_sum: 0, tried: 1 }]);
  await ratings.rate(actor, f.versionId, category, 3);
  expect(await read()).toMatchObject({
    rating_count: 1,
    rating_sum: 3,
    enjoyment_count: 1,
    enjoyment_sum: 5,
  });
  await ratings.rate(actor, f.versionId, category, 3, { enjoyment: null });
  expect(await read()).toMatchObject({ rating_count: 1, enjoyment_count: 0 });
  const cleared = await ratings.rate(actor, f.versionId, category, null, {
    enjoyment: null,
  });
  expect(cleared).toMatchObject({
    outcome: "removed",
    rating: { overallSimilarity: null, enjoyment: null },
    tried: true,
  });
  expect(await personal.state(actor.id, [f.versionId])).toMatchObject({
    ratings: [],
    triedVersionIds: [f.versionId],
  });
  expect(
    (
      await ratings.rate(actor, f.versionId, category, null, {
        enjoyment: null,
      })
    ).outcome,
  ).toBe("unchanged");
  expect(await read()).toMatchObject({
    rating_count: 0,
    enjoyment_count: 0,
    tried_count: 1,
  });
  // Empty rows and invalid non-null answers cannot bypass the service through SQL.
  await expect(
    db
      .prepare(
        "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES('empty',?,?,?,NULL,1,1)",
      )
      .bind(actor.id, f.versionId, category)
      .run(),
  ).rejects.toThrow(/ck_ratings_answer/);
  await expect(
    ratings.rate(actor, f.versionId, category, null, { enjoyment: 6 }),
  ).rejects.toMatchObject({ code: "INVALID_SCORE" });
});

it("keeps SQL, rebuilds and the reference math equal for mixed independent answers", async () => {
  const f = await catalogFixture(db, 3);
  const category = f.categories[0]!;
  const dimension = `detail-${f.productId}`;
  await db
    .prepare(
      "INSERT INTO category_rating_dimensions(id,category_id,key,label,sort_order,created_at,updated_at) VALUES(?,?,'taste','Taste',0,1,1)",
    )
    .bind(dimension, category)
    .run();
  await ratings.rate(f.users[0]!, f.versionId, category, 2, {
    enjoyment: 5,
    dimensions: { taste: 4 },
    conventionalRecency: "within_month",
  });
  await ratings.rate(f.users[1]!, f.versionId, category, null, {
    enjoyment: 3,
  });
  await ratings.rate(f.users[2]!, f.versionId, category, 4);
  const expected = aggregateLine(
    [{ productId: f.productId, eligible: true, publishedAt: null }],
    [
      {
        productId: f.productId,
        userId: f.users[0]!.id,
        similarity: 2,
        enjoyment: 5,
        counted: true,
        createdAt: now,
      },
      {
        productId: f.productId,
        userId: f.users[1]!.id,
        similarity: null,
        enjoyment: 3,
        counted: true,
        createdAt: now,
      },
      {
        productId: f.productId,
        userId: f.users[2]!.id,
        similarity: 4,
        enjoyment: null,
        counted: true,
        createdAt: now,
      },
    ],
    f.users.map((user) => ({ productId: f.productId, userId: user.id })),
    INITIAL_SCORING,
    now,
  )!;
  const line = () =>
    db
      .prepare(
        "SELECT people_count AS peopleCount,mean_sum AS meanSum,bayesian_score AS bayesianScore,enjoyment_people AS enjoymentPeople,enjoyment_mean_sum AS enjoymentMeanSum,enjoyment_score AS enjoymentScore,recent_count AS recentCount,tried_count AS triedCount,lead_product_id AS leadProductId FROM family_category_stats WHERE product_family_id=? AND category_id=?",
      )
      .bind(lineOf(f.productId), category)
      .first();
  expect(await line()).toMatchObject({
    peopleCount: expected.peopleCount,
    meanSum: expected.meanSum,
    bayesianScore: expected.bayesianScore,
    enjoymentPeople: expected.enjoymentPeople,
    enjoymentMeanSum: expected.enjoymentMeanSum,
    enjoymentScore: expected.enjoymentScore,
    recentCount: expected.recentCount,
    triedCount: expected.triedCount,
    leadProductId: expected.leadProductId,
  });
  const before = await line();
  await ratings.rebuildVersions([f.versionId]);
  await new LineRefresh(db, INITIAL_SCORING).refresh(
    { versionIds: [f.versionId] },
    now,
  );
  expect(await line()).toEqual(before);
  await ratings.rate(f.users[0]!, f.versionId, category, null);
  expect(
    (await personal.state(f.users[0]!.id, [f.versionId])).ratings[0],
  ).toMatchObject({
    overallSimilarity: null,
    enjoyment: 5,
    dimensions: {},
    conventionalRecency: null,
  });
  expect(
    (
      await db
        .prepare("SELECT * FROM rating_dimension_values WHERE dimension_id=?")
        .bind(dimension)
        .all()
    ).results,
  ).toEqual([]);
  await expect(
    ratings.rate(f.users[0]!, f.versionId, category, null, {
      dimensions: { taste: 3 },
    }),
  ).rejects.toMatchObject({ code: "SIMILARITY_REQUIRED" });
  const tasteId = (await personal.state(f.users[1]!.id, [f.versionId]))
    .ratings[0]!.id;
  await ratings.setCounted(f.versionId, tasteId, false);
  expect(await line()).toMatchObject({ peopleCount: 1, enjoymentPeople: 1 });
  await ratings.rate(f.users[1]!, f.versionId, category, null, {
    enjoyment: 5,
  });
  expect(await line()).toMatchObject({ peopleCount: 1, enjoymentPeople: 1 });
  await ratings.setCounted(f.versionId, tasteId, true);
  expect(await line()).toMatchObject({ peopleCount: 1, enjoymentPeople: 2 });
  const rows = await new D1CatalogRepository(db).rankedSet(
    f.countryId,
    category,
    NO_FILTERS,
  );
  expect(rows[0]).toMatchObject({
    topRank: 1,
    ratingCount: 1,
    tastiestCount: 2,
  });
});
