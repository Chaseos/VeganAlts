import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { ratingState } from "../../server/ratings/http/handlers";
import { savedProductsApi } from "../../server/saved/http/handlers";
import { savedProductsService } from "../../server/saved/infrastructure/composition";
import { catalogFixture } from "./fixtures";
import { authenticatedFixture } from "./auth-fixture";

const write = (
  actor: Awaited<ReturnType<typeof authenticatedFixture>>,
  method: string,
  productId: string,
  headers: HeadersInit = actor.headers,
) =>
  savedProductsApi(
    new Request(
      `${actor.authEnv.APP_URL}/api/v1/me/saved-products/${productId}`,
      { method, headers },
    ),
    `me/saved-products/${productId}`,
    actor.authEnv,
  );

const savedState = async (
  actor: Awaited<ReturnType<typeof authenticatedFixture>>,
  productId: string,
) => {
  const response = await ratingState(
    new Request(
      `${actor.authEnv.APP_URL}/api/v1/me/rating-state?productIds=${productId}`,
      { headers: actor.headers },
    ),
    actor.authEnv,
  );
  return ((await response.json()) as { data: { savedProductIds: string[] } })
    .data.savedProductIds;
};

it("saves and removes a product idempotently and privately", async () => {
  const { productId } = await catalogFixture(env.DB);
  const actor = await authenticatedFixture();
  const saved = await write(actor, "PUT", productId);
  expect(saved?.headers.get("Cache-Control")).toContain("no-store");
  await write(actor, "PUT", productId);
  expect(await savedState(actor, productId)).toEqual([productId]);
  const { items } = await savedProductsService(env).list(actor.user.id, null);
  expect(items.map((item) => item.productId)).toEqual([productId]);

  await write(actor, "DELETE", productId);
  await write(actor, "DELETE", productId);
  expect(await savedState(actor, productId)).toEqual([]);
});

it("refuses anonymous writes and reports nothing saved to visitors", async () => {
  const { productId } = await catalogFixture(env.DB);
  const actor = await authenticatedFixture();
  await expect(
    write(actor, "PUT", productId, { Origin: actor.authEnv.APP_URL }),
  ).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
  const response = await ratingState(
    new Request(
      `${actor.authEnv.APP_URL}/api/v1/me/rating-state?productIds=${productId}`,
    ),
    actor.authEnv,
  );
  expect(await response.json()).toMatchObject({
    data: { user: null, savedProductIds: [] },
  });
});

it("rejects unknown and hidden products and drops hidden ones from the list", async () => {
  const { productId } = await catalogFixture(env.DB);
  const actor = await authenticatedFixture();
  await expect(write(actor, "PUT", "missing")).rejects.toMatchObject({
    code: "PRODUCT_NOT_FOUND",
  });
  await write(actor, "PUT", productId);
  await env.DB.prepare(
    "UPDATE products SET lifecycle_status='hidden' WHERE id=?",
  )
    .bind(productId)
    .run();
  await expect(write(actor, "PUT", productId)).rejects.toMatchObject({
    code: "PRODUCT_NOT_FOUND",
  });
  const { items } = await savedProductsService(env).list(actor.user.id, null);
  expect(items).toEqual([]);
});

it("ignores other routes", async () => {
  const actor = await authenticatedFixture();
  expect(
    await savedProductsApi(
      new Request(`${actor.authEnv.APP_URL}/api/v1/me/ratings`),
      "me/ratings",
      actor.authEnv,
    ),
  ).toBeNull();
});
