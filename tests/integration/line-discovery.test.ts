import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture, lineOf, lineStatement, testMarket } from "./fixtures";
import { trendingService } from "../../server/ranking/infrastructure/trending-composition";
import { LineRefresh } from "../../server/ranking/infrastructure/line-refresh";
import { INITIAL_SCORING } from "../../server/ranking/domain/policy";
import { CatalogService } from "../../server/catalog/application/service";
import { D1CatalogRepository } from "../../server/catalog/infrastructure/d1-repository";

const db = env.DB;
const DAY = 86_400_000;
const NOW = Date.UTC(2033, 4, 20, 12);
const rankingEnv = {
  DB: db,
  RANKING_PRIOR_MEAN: "3.5",
  RANKING_PRIOR_STRENGTH: "10",
} as Parameters<typeof trendingService>[0];
const lines = new LineRefresh(db, INITIAL_SCORING);

// A flavor joining `line` in the food, published `daysAgo`.
const flavor = (
  f: Awaited<ReturnType<typeof catalogFixture>>,
  line: string,
  key: string,
  daysAgo: number,
) => {
  const id = `${key}-${f.productId}`;
  return {
    id,
    version: `${id}-v`,
    statements: [
      db
        .prepare(
          "INSERT INTO products(id,country_id,product_family_id,name,slug,flavor,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,1)",
        )
        .bind(id, f.countryId, line, id, id, key, NOW - daysAgo * DAY),
      db
        .prepare(
          "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1)",
        )
        .bind(`${id}-v`, id),
      db
        .prepare(
          "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
        )
        .bind(id, f.categories[0]),
    ],
  };
};
const rating = (
  user: string,
  version: string,
  category: string,
  daysAgo: number,
) =>
  db
    .prepare(
      "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES(?,?,?,?,4,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      user,
      version,
      category,
      NOW - daysAgo * DAY,
      NOW - daysAgo * DAY,
    );
const trends = (category: string) =>
  db
    .prepare(
      "SELECT product_family_id AS line,rank,json_extract(inputs,'$.people') AS people FROM family_category_trends WHERE category_id=? ORDER BY rank",
    )
    .bind(category)
    .all<{ line: string; rank: number; people: number }>()
    .then((r) => r.results);

it("counts a person once per line across the Trending window and ranks lines for the tag", async () => {
  const f = await catalogFixture(db, 6);
  const [cat] = f.categories as [string];
  const line = lineOf(f.productId);
  const spicy = flavor(f, line, "spicy", 300),
    smoky = flavor(f, line, "smoky", 300);
  const users = f.users.map((u) => u.id);
  // One person rates three flavors on three different days; two more rate
  // once. Four other one-flavor lines trend with fewer people.
  const others = [0, 1, 2, 3].map((i) => `other-${i}-${f.productId}`);
  await db.batch([
    ...spicy.statements,
    ...smoky.statements,
    rating(users[0]!, f.versionId, cat, 1),
    rating(users[0]!, spicy.version, cat, 20),
    rating(users[0]!, smoky.version, cat, 40),
    rating(users[1]!, f.versionId, cat, 2),
    rating(users[2]!, spicy.version, cat, 3),
    ...others.flatMap((other, i) => [
      lineStatement(db, other, f.countryId),
      db
        .prepare(
          "INSERT INTO products(id,country_id,product_family_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,?,1,1)",
        )
        .bind(other, f.countryId, lineOf(other), other, other),
      db
        .prepare(
          "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1)",
        )
        .bind(`${other}-v`, other),
      db
        .prepare(
          "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
        )
        .bind(other, cat),
      // Three recent raters each, later than the main line's, so earlier
      // lines rank higher only by their people's recency.
      ...users
        .slice(3, 6)
        .map((user) => rating(user, `${other}-v`, cat, 10 + i * 10)),
    ]),
  ]);
  await lines.refresh({ familyIds: [line, ...others.map(lineOf)] }, NOW);
  await trendingService(rankingEnv, () => NOW).rebuild();

  const ranked = await trends(cat);
  // Five ratings by three people: three people, not five events.
  expect(ranked.find((r) => r.line === line)).toMatchObject({ people: 3 });
  expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  expect(ranked[0]!.line).toBe(line);
  // The tag goes to the first three; the view lists every trending line.
  const view = await new CatalogService(
    new D1CatalogRepository(db),
    () => NOW,
  ).category(testMarket(f.countryId), cat, { view: "trending" });
  expect(view.ranked).toHaveLength(5);
  // A line is shown by its lead flavor. The main product and Spicy each have
  // two ratings with the same score; the main product was never published,
  // so the earlier-published Spicy leads.
  expect(view.ranked[0]!.leadProduct.id).toBe(spicy.id);
  // Other views tag as many of the top trending lines as configured.
  const tagged = async (taggedLines?: number) =>
    (
      await new CatalogService(
        new D1CatalogRepository(db),
        () => NOW,
        undefined,
        taggedLines,
      ).category(testMarket(f.countryId), cat)
    ).ranked.filter((row) => row.trending).length;
  expect(await tagged()).toBe(3);
  expect(await tagged(1)).toBe(1);
});

it("keeps a line's New date fixed when flavors come and go", async () => {
  const f = await catalogFixture(db, 1);
  const [cat] = f.categories as [string];
  const line = lineOf(f.productId);
  const catalog = new CatalogService(new D1CatalogRepository(db), () => NOW);
  const fresh = async () =>
    (
      await catalog.category(testMarket(f.countryId), cat, { view: "new" })
    ).ranked.map((row) => row.leadProduct.id);
  const firstPublished = () =>
    db
      .prepare(
        "SELECT first_published_at AS at FROM family_category_first_published WHERE product_family_id=? AND category_id=?",
      )
      .bind(line, cat)
      .first<number>("at");

  // An old line: its first flavor appeared 200 days ago.
  await db
    .prepare("UPDATE products SET published_at=? WHERE id=?")
    .bind(NOW - 200 * DAY, f.productId)
    .run();
  await lines.refresh({ familyIds: [line] }, NOW);
  expect(await firstPublished()).toBe(NOW - 200 * DAY);
  expect(await fresh()).toEqual([]);

  // A new flavor doesn't bring it back into New.
  const lemon = flavor(f, line, "lemon", 1);
  await db.batch(lemon.statements);
  await lines.refresh({ familyIds: [line] }, NOW);
  expect(await fresh()).toEqual([]);

  // Nor does discontinuing the oldest flavor, or removing it from the food.
  await db.batch([
    db
      .prepare("UPDATE products SET lifecycle_status='discontinued' WHERE id=?")
      .bind(f.productId),
    db
      .prepare(
        "DELETE FROM product_categories WHERE product_id=? AND category_id=?",
      )
      .bind(f.productId, cat),
  ]);
  await lines.refresh({ familyIds: [line] }, NOW);
  expect(await firstPublished()).toBe(NOW - 200 * DAY);
  expect(await fresh()).toEqual([]);
  // Shown by its new flavor in other views, it still isn't labeled New.
  expect(
    (await catalog.category(testMarket(f.countryId), cat)).unranked.find(
      (row) => row.lineId === line,
    ),
  ).toMatchObject({
    leadProduct: { id: lemon.id },
    publishedAt: NOW - 200 * DAY,
    isNew: false,
  });

  // A line new to the food is listed, dated by its first flavor.
  const newLine = `new-${f.productId}`;
  await db.batch([
    lineStatement(db, newLine, f.countryId),
    ...flavor(f, lineOf(newLine), "fresh", 2).statements,
  ]);
  await lines.refresh({ familyIds: [lineOf(newLine)] }, NOW);
  const listed = await catalog.category(testMarket(f.countryId), cat, {
    view: "new",
  });
  expect(listed.ranked.map((row) => row.leadProduct.id)).toEqual([
    `fresh-${f.productId}`,
  ]);
  expect(listed.ranked[0]).toMatchObject({
    publishedAt: NOW - 2 * DAY,
    isNew: true,
  });
});
