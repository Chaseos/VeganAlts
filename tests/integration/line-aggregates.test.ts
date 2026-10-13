import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture, lineOf, productRows } from "./fixtures";
import {
  aggregateLine,
  type LineFlavor,
  type LineRating,
} from "../../server/ranking/domain/lines";
import { INITIAL_SCORING } from "../../server/ranking/domain/policy";
import { LineRefresh } from "../../server/ranking/infrastructure/line-refresh";
import {
  rankedMembershipSql,
  rankingOrderSql,
} from "../../server/ranking/infrastructure/read-policy";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";
import { RatingsService } from "../../server/ratings/application/service";

const db = env.DB;
const DAY = 86400_000;
const NOW = 1_800_000_000_000;
const lines = new LineRefresh(db, INITIAL_SCORING);
const ratings = new RatingsService(
  new D1RatingsRepository(db),
  INITIAL_SCORING.closest,
  () => crypto.randomUUID(),
);

const statsOf = async (familyId: string) =>
  (
    await db
      .prepare(
        `SELECT category_id AS categoryId,people_count AS peopleCount,mean_sum AS meanSum,raw_average AS rawAverage,
          bayesian_score AS bayesianScore,enjoyment_people AS enjoymentPeople,enjoyment_mean_sum AS enjoymentMeanSum,
          enjoyment_average AS enjoymentAverage,enjoyment_score AS enjoymentScore,tried_count AS triedCount,
          recent_count AS recentCount,lead_product_id AS leadProductId
        FROM family_category_stats WHERE product_family_id=? ORDER BY category_id`,
      )
      .bind(familyId)
      .all<Record<string, unknown>>()
  ).results;
const dimensionsOf = async (familyId: string, categoryId: string) =>
  (
    await db
      .prepare(
        "SELECT dimension_id AS dimensionId,people_count AS peopleCount,mean_sum AS meanSum FROM family_category_dimension_stats WHERE product_family_id=? AND category_id=? ORDER BY dimension_id",
      )
      .bind(familyId, categoryId)
      .all()
  ).results;
// Stored rows without their refresh time, for rebuild comparisons.
const storedLine = async (familyId: string) => [
  ...(
    await db
      .prepare(
        "SELECT * FROM family_category_stats WHERE product_family_id=? ORDER BY category_id",
      )
      .bind(familyId)
      .all()
  ).results.map(({ recomputed_at: _, ...row }) => row),
  ...(
    await db
      .prepare(
        "SELECT * FROM family_category_dimension_stats WHERE product_family_id=? ORDER BY category_id,dimension_id",
      )
      .bind(familyId)
      .all()
  ).results.map(({ recomputed_at: _, ...row }) => row),
];
const expectClose = (
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
) => {
  for (const [key, value] of Object.entries(expected))
    if (typeof value === "number" && !Number.isInteger(value))
      expect(actual[key], key).toBeCloseTo(value, 12);
    else expect(actual[key], key).toEqual(value);
};

it("stores what the reference function computes for a line of several flavors", async () => {
  const f = await catalogFixture(db, 4);
  const [cat, other] = f.categories as [string, string];
  const line = lineOf(f.productId);
  const [u0, u1, u2, u3] = f.users.map((u) => u.id) as [
    string,
    string,
    string,
    string,
  ];
  const product = (key: string) => ({
    id: `${key}-${f.productId}`,
    version: `${key}-v-${f.productId}`,
  });
  const p0 = { id: f.productId, version: f.versionId };
  const [p1, p2, p3, p4] = ["p1", "p2", "p3", "p4"].map(product) as [
    typeof p0,
    typeof p0,
    typeof p0,
    typeof p0,
  ];
  const oldFormula = `p1-old-${f.productId}`;
  const [d1, d2] = [`d1-${f.productId}`, `d2-${f.productId}`];

  // P3 is not ranking-eligible here and P4 is discontinued; P1 was
  // reformulated, so its old formula's ratings no longer count.
  const setup = [
    db
      .prepare("UPDATE products SET published_at=? WHERE id=?")
      .bind(NOW - 100 * DAY, p0.id),
    ...[p1, p2, p3, p4].flatMap((p, index) => [
      db
        .prepare(
          "INSERT INTO products(id,country_id,product_family_id,name,slug,flavor,lifecycle_status,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,1)",
        )
        .bind(
          p.id,
          f.countryId,
          line,
          p.id,
          p.id,
          `Flavor ${index + 1}`,
          p === p4 ? "discontinued" : "active",
          NOW - 50 * DAY,
        ),
      db
        .prepare(
          "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1)",
        )
        .bind(p.version, p.id),
      db
        .prepare(
          "INSERT INTO product_categories(product_id,category_id,ranking_eligible,created_at,updated_at) VALUES(?,?,?,1,1)",
        )
        .bind(p.id, cat, p === p3 ? 0 : 1),
    ]),
    db
      .prepare(
        "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,0,1,1)",
      )
      .bind(oldFormula, p1.id),
    db
      .prepare(
        "INSERT INTO category_rating_dimensions(id,category_id,key,label,created_at,updated_at) VALUES(?,?,'taste','Taste',1,1),(?,?,'texture','Texture',1,1)",
      )
      .bind(d1, cat, d2, cat),
  ];
  type Row = {
    user: string;
    p: typeof p0 | string;
    category?: string;
    similarity: number;
    enjoyment?: number;
    counted?: boolean;
    age: number;
    answers?: Record<string, number>;
  };
  const rows: Row[] = [
    {
      user: u0,
      p: p0,
      similarity: 5,
      enjoyment: 4,
      age: 1,
      answers: { [d1]: 4 },
    },
    { user: u0, p: p1, similarity: 3, age: 20, answers: { [d1]: 2, [d2]: 5 } },
    { user: u0, p: p3, similarity: 1, age: 1 },
    { user: u1, p: p1, similarity: 4, enjoyment: 5, age: 30 },
    { user: u1, p: p2, similarity: 2, counted: false, age: 3 },
    {
      user: u2,
      p: p2,
      similarity: 5,
      enjoyment: 2,
      age: 2,
      answers: { [d2]: 3 },
    },
    { user: u2, p: p4, similarity: 1, age: 1 },
    { user: u2, p: oldFormula, similarity: 1, age: 40 },
    { user: u3, p: p0, similarity: 4, age: 10 },
    { user: u0, p: p0, category: other, similarity: 3, enjoyment: 3, age: 5 },
  ];
  const versionOf = (p: Row["p"]) => (typeof p === "string" ? p : p.version);
  for (const [index, row] of rows.entries()) {
    const ratingId = `r${index}-${f.productId}`;
    setup.push(
      db
        .prepare(
          "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,enjoyment,is_counted,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          ratingId,
          row.user,
          versionOf(row.p),
          row.category ?? cat,
          row.similarity,
          row.enjoyment ?? null,
          row.counted === false ? 0 : 1,
          NOW - row.age * DAY,
          NOW - row.age * DAY,
        ),
      ...Object.entries(row.answers ?? {}).map(([dimension, score]) =>
        db
          .prepare(
            "INSERT INTO rating_dimension_values(rating_id,dimension_id,score,created_at,updated_at) VALUES(?,?,?,1,1)",
          )
          .bind(ratingId, dimension, score),
      ),
    );
  }
  const trials = [
    { user: u0, p: p0 },
    { user: u0, p: p1 },
    { user: u1, p: p1 },
    { user: u2, p: p4 },
  ];
  for (const t of trials)
    setup.push(
      db
        .prepare(
          "INSERT INTO product_trials(user_id,product_version_id,created_at,updated_at) VALUES(?,?,1,1)",
        )
        .bind(t.user, t.p.version),
    );
  await db.batch(setup);
  await lines.refresh({ familyIds: [line] }, NOW);

  const flavors = (category: string): LineFlavor[] =>
    [p0, p1, p2, p3, p4].map((p) => ({
      productId: p.id,
      eligible: p === p0 || (category === cat && (p === p1 || p === p2)),
      publishedAt: p === p0 ? NOW - 100 * DAY : NOW - 50 * DAY,
    }));
  // The reference sees the current formulas' ratings only.
  const current = (category: string): LineRating[] =>
    rows
      .filter(
        (row) =>
          typeof row.p !== "string" && (row.category ?? cat) === category,
      )
      .map((row) => ({
        productId: (row.p as typeof p0).id,
        userId: row.user,
        similarity: row.similarity,
        enjoyment: row.enjoyment ?? null,
        counted: row.counted !== false,
        createdAt: NOW - row.age * DAY,
        answers: row.answers,
      }));
  const trialRows = trials.map((t) => ({ productId: t.p.id, userId: t.user }));

  const stored = await statsOf(line);
  expect(stored.map((row) => row.categoryId)).toEqual([cat, other].sort());
  for (const category of [cat, other]) {
    const { dimensions, ...expected } = aggregateLine(
      flavors(category),
      current(category),
      trialRows,
      INITIAL_SCORING,
      NOW,
    )!;
    expectClose(
      stored.find((row) => row.categoryId === category)!,
      expected,
    );
    const storedDimensions = await dimensionsOf(line, category);
    expect(storedDimensions).toHaveLength(dimensions.length);
    for (const [index, dimension] of dimensions.entries())
      expectClose(storedDimensions[index]!, { ...dimension });
  }
  // Spelled out for the main food: u0 averages 4 across P0 and P1; u1's
  // P2 rating isn't counted; u2's ratings of P4 and P1's old formula don't
  // count. The four people vote 4, 4, 5 and 4. P0 and P1 each have two
  // ratings and P0's own score is higher, so P0 leads; two people rated in
  // the last week.
  expect(stored.find((row) => row.categoryId === cat)).toMatchObject({
    peopleCount: 4,
    meanSum: 17,
    rawAverage: 4.25,
    bayesianScore: (17 + 35) / 14,
    enjoymentPeople: 3,
    triedCount: 2,
    recentCount: 2,
    leadProductId: p0.id,
  });
});

it("ranks one-flavor lines exactly as their products", async () => {
  const f = await catalogFixture(db, 6);
  const [cat] = f.categories as [string];
  const products = Array.from({ length: 5 }, (_, i) => ({
    id: `solo-${i}-${f.productId}`,
    version: `solo-v-${i}-${f.productId}`,
  }));
  await db.batch(
    products.flatMap((p) => [
      ...productRows(db, p.id, f.countryId, p.id, p.id),
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
  );
  // Varied scores and sample sizes, including ties.
  const scores = [
    [5, 5, 4],
    [4, 4, 4, 4, 4, 4],
    [5],
    [2, 3],
    [4, 4, 4, 4, 4, 4],
  ];
  for (const [i, own] of scores.entries())
    for (const [j, score] of own.entries())
      await ratings.rate(f.users[j]!, products[i]!.version, cat, score);

  const productOrder = (
    await db
      .prepare(
        `SELECT p.id,s.bayesian_score AS score,s.rating_count AS people FROM product_category_stats s
          JOIN product_versions v ON v.id=s.product_version_id AND v.is_current=1
          JOIN products p ON p.id=v.product_id ${rankedMembershipSql}
          WHERE s.category_id=? AND p.id IN (SELECT value FROM json_each(?)) ORDER BY ${rankingOrderSql}`,
      )
      .bind(cat, JSON.stringify(products.map((p) => p.id)))
      .all()
  ).results;
  const lineOrder = (
    await db
      .prepare(
        `SELECT s.lead_product_id AS id,s.bayesian_score AS score,s.people_count AS people FROM family_category_stats s
          WHERE s.category_id=? AND s.lead_product_id IN (SELECT value FROM json_each(?))
          ORDER BY s.bayesian_score DESC,s.people_count DESC,s.lead_product_id`,
      )
      .bind(cat, JSON.stringify(products.map((p) => p.id)))
      .all()
  ).results;
  expect(lineOrder).toEqual(productOrder);
  expect(productOrder).toHaveLength(5);
});

it("counts each person once, keeps Tastiest apart and rebuilds to the same rows", async () => {
  const f = await catalogFixture(db, 2);
  const [cat] = f.categories as [string];
  const line = lineOf(f.productId);
  const spicy = {
    id: `spicy-${f.productId}`,
    version: `spicy-v-${f.productId}`,
  };
  await db.batch([
    db
      .prepare(
        "INSERT INTO products(id,country_id,product_family_id,name,slug,flavor,created_at,updated_at) VALUES(?,?,?,?,?,'Spicy',1,1)",
      )
      .bind(spicy.id, f.countryId, line, spicy.id, spicy.id),
    db
      .prepare(
        "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1)",
      )
      .bind(spicy.version, spicy.id),
    db
      .prepare(
        "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
      )
      .bind(spicy.id, cat),
  ]);
  const [one, two] = f.users as [(typeof f.users)[0], (typeof f.users)[0]];
  // One person rates both flavors; they count once, as their mean.
  await ratings.rate(one, f.versionId, cat, 3);
  await ratings.rate(one, spicy.version, cat, 5);
  await ratings.rate(two, f.versionId, cat, 2);
  const closest = {
    peopleCount: 2,
    meanSum: 6,
    rawAverage: 3,
    bayesianScore: (6 + 35) / 12,
  };
  expect((await statsOf(line))[0]).toMatchObject({
    ...closest,
    enjoymentPeople: 0,
    enjoymentScore: null,
  });

  // Tastiest answers never move Closest.
  await db
    .prepare(
      "UPDATE ratings SET enjoyment=CASE product_version_id WHEN ? THEN 5 ELSE 1 END WHERE user_id=? AND category_id=?",
    )
    .bind(spicy.version, one.id, cat)
    .run();
  await ratings.rebuildVersions([f.versionId, spicy.version]);
  expect((await statsOf(line))[0]).toMatchObject({
    ...closest,
    enjoymentPeople: 1,
    enjoymentMeanSum: 3,
    enjoymentScore: (3 + 35) / 11,
  });
  // The flavor keeps its own Tastiest figures.
  expect(
    await db
      .prepare(
        "SELECT enjoyment_count AS n,enjoyment_sum AS total FROM product_category_stats WHERE product_version_id=? AND category_id=?",
      )
      .bind(spicy.version, cat)
      .first(),
  ).toEqual({ n: 1, total: 5 });

  // Excluding a rating refreshes the line in the same write.
  const excluded = (await new D1RatingsRepository(db).snapshot(spicy.version))!
    .ratings[0]!;
  await ratings.setCounted(spicy.version, excluded.id, false);
  expect((await statsOf(line))[0]).toMatchObject({
    peopleCount: 2,
    meanSum: 5,
  });

  // A full rebuild reproduces what the writes left.
  const incremental = await storedLine(line);
  await lines.refreshAll();
  expect(await storedLine(line)).toEqual(incremental);
});
