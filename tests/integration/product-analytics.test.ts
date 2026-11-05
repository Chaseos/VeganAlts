import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { ProductAnalyticsService } from "../../server/analytics/application/service";
import { D1ProductAnalyticsRepository } from "../../server/analytics/infrastructure/d1-repository";
import { productViewsApi } from "../../server/analytics/http/handlers";
import { catalogFixture, lineOf, lineStatement } from "./fixtures";
import { authenticatedFixture } from "./auth-fixture";

const DAY = Date.UTC(2026, 10, 5, 12);
const at = (time: number) =>
  new ProductAnalyticsService(
    new D1ProductAnalyticsRepository(env.DB),
    () => time,
  );

const named = async (id: string) => {
  const name = `analytics ${crypto.randomUUID()}`;
  await env.DB.prepare("UPDATE products SET name=? WHERE id=?")
    .bind(name, id)
    .run();
  return name;
};

const addProduct = async (countryId: string, name: string) => {
  const id = `product-${crypto.randomUUID()}`;
  await env.DB.batch([
    lineStatement(env.DB, id, countryId),
    env.DB.prepare(
      "INSERT INTO products (id,country_id,product_family_id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?,1,1)",
    ).bind(id, countryId, lineOf(id), name, id),
  ]);
  return id;
};

const addSave = (userId: string, productId: string) =>
  env.DB.prepare(
    "INSERT INTO saved_products (user_id,product_id,created_at) VALUES (?,?,1)",
  )
    .bind(userId, productId)
    .run();

it("counts a product's views by day and reports the recent ones", async () => {
  const { productId } = await catalogFixture(env.DB);
  const search = await named(productId);
  await at(DAY - 40 * 86_400_000).recordView(productId);
  await at(DAY).recordView(productId);
  await at(DAY).recordView(productId);
  const { items } = await at(DAY).report({ sort: "views", search, page: 1 });
  expect(items).toMatchObject([
    { id: productId, views: 3, recentViews: 2, saves: 0, ratings: 0 },
  ]);
});

it("counts people, sorts by each measure and keeps ratings on their product", async () => {
  const { productId, versionId, categories, users, countryId } =
    await catalogFixture(env.DB);
  const search = await named(productId);
  const viewed = await addProduct(countryId, `${search} viewed`);
  const saved = await addProduct(countryId, `${search} saved`);
  await at(DAY).recordView(viewed);
  await addSave(users[0]!.id, saved);
  // Two foods, one person: still one rater.
  for (const category of categories)
    await env.DB.prepare(
      "INSERT INTO ratings (id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES (?,?,?,?,4,1,1)",
    )
      .bind(crypto.randomUUID(), users[0]!.id, versionId, category)
      .run();
  const report = at(DAY);
  const first = async (sort: "views" | "saves" | "ratings") =>
    (await report.report({ sort, search, page: 1 })).items[0];
  expect((await first("views"))?.id).toBe(viewed);
  expect((await first("saves"))?.id).toBe(saved);
  expect(await first("ratings")).toMatchObject({ id: productId, ratings: 1 });
});

it("moves views and saves to a surviving product and leaves hidden products out", async () => {
  const { productId, users, countryId } = await catalogFixture(env.DB);
  const search = await named(productId);
  const donor = await addProduct(countryId, `${search} donor`);
  await at(DAY).recordView(donor);
  await addSave(users[0]!.id, donor);
  await addSave(users[0]!.id, productId);
  await env.DB.prepare(
    "UPDATE products SET lifecycle_status='hidden' WHERE id=?",
  )
    .bind(donor)
    .run();
  const actionId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO moderation_actions (id,actor_id,kind,target_id,before_data,after_data,note,created_at) VALUES (?,?,'duplicate_consolidation',?,'{}','{}','Same product.',1)",
    ).bind(actionId, users[0]!.id, donor),
    env.DB.prepare(
      "INSERT INTO duplicate_consolidations (donor_id,survivor_id,action_id,active,created_at) VALUES (?,?,?,1,1)",
    ).bind(donor, productId, actionId),
  ]);
  await at(DAY).recordView(donor);
  const { items } = await at(DAY).report({ sort: "views", search, page: 1 });
  expect(items).toMatchObject([{ id: productId, views: 1, saves: 1 }]);
});

it("treats a search as text and pages through results", async () => {
  const { productId, countryId } = await catalogFixture(env.DB);
  const search = await named(productId);
  expect(
    (await at(DAY).report({ sort: "views", search: "%", page: 1 })).items,
  ).toEqual([]);
  for (let index = 0; index < 50; index += 1)
    await addProduct(countryId, `${search} ${index}`);
  const report = at(DAY);
  const first = await report.report({ sort: "views", search, page: 1 });
  const second = await report.report({ sort: "views", search, page: 2 });
  expect([first.items.length, first.hasNext]).toEqual([50, true]);
  expect([second.items.length, second.hasNext]).toEqual([1, false]);
});

it("accepts same-origin views only and ignores other routes", async () => {
  const { productId } = await catalogFixture(env.DB);
  const search = await named(productId);
  const { authEnv } = await authenticatedFixture();
  const post = (id: string, headers: HeadersInit = {}) =>
    productViewsApi(
      new Request(`${authEnv.APP_URL}/api/v1/products/${id}/views`, {
        method: "POST",
        headers,
      }),
      `products/${id}/views`,
      authEnv,
    );
  await expect(post(productId)).rejects.toMatchObject({
    code: "INVALID_ORIGIN",
  });
  const origin = { Origin: authEnv.APP_URL };
  const response = await post(productId, origin);
  expect(response?.headers.get("Cache-Control")).toContain("no-store");
  await post("unknown-product", origin);
  await expect(post("not%20valid", origin)).rejects.toMatchObject({
    code: "PRODUCT_NOT_FOUND",
  });
  const { items } = await at(Date.now()).report({
    sort: "views",
    search,
    page: 1,
  });
  expect(items[0]?.views).toBe(1);
  expect(
    await productViewsApi(
      new Request(`${authEnv.APP_URL}/api/v1/products/x/views`),
      "products/x/views",
      authEnv,
    ),
  ).toBeNull();
});
