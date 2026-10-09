import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import {
  saveRating,
  ratingState,
  myRatings,
} from "../../server/ratings/http/handlers";
import { catalogFixture } from "./fixtures";
import { authenticatedFixture } from "./auth-fixture";

it("treats an expired persisted session as anonymous and refuses a contribution", async () => {
  const catalog = await catalogFixture(env.DB);
  const actor = await authenticatedFixture();
  await env.DB.prepare("UPDATE session SET expires_at=0 WHERE id=?")
    .bind(actor.session.id)
    .run();
  const request = new Request(
    `${actor.authEnv.APP_URL}/api/v1/me/rating-state?versionIds=${catalog.versionId}`,
    { headers: actor.headers },
  );
  expect(
    await (await ratingState(request, actor.authEnv)).json(),
  ).toMatchObject({ data: { user: null, ratings: [], triedVersionIds: [] } });
  await expect(
    saveRating(
      new Request(`${actor.authEnv.APP_URL}/api/v1/ratings`, {
        method: "PUT",
        headers: actor.headers,
        body: JSON.stringify({
          productVersionId: catalog.versionId,
          categoryId: catalog.categories[0],
          overallSimilarity: 4,
        }),
      }),
      actor.authEnv,
    ),
  ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});

it("writes through real authenticated HTTP boundaries, returns authoritative private state, and emits events only for committed changes", async () => {
  const catalog = await catalogFixture(env.DB);
  const actor = await authenticatedFixture();
  const payload = {
    productVersionId: catalog.versionId,
    categoryId: catalog.categories[0],
    overallSimilarity: 4,
  };
  const put = (body: unknown, headers = actor.headers) =>
    new Request(`${actor.authEnv.APP_URL}/api/v1/ratings`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
  const saved = await saveRating(put(payload), actor.authEnv);
  expect(saved.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await saved.json()).toMatchObject({
    data: { rating: payload, tried: true, outcome: "created" },
  });
  expect(
    await (await saveRating(put(payload), actor.authEnv)).json(),
  ).toMatchObject({ data: { outcome: "unchanged" } });
  expect(
    await (
      await saveRating(put({ ...payload, overallSimilarity: 5 }), actor.authEnv)
    ).json(),
  ).toMatchObject({ data: { outcome: "updated" } });
  expect(actor.events.map((event) => event.blobs?.[0])).toEqual([
    "rating_created",
    "rating_updated",
  ]);
  const request = new Request(
    `${actor.authEnv.APP_URL}/api/v1/me/rating-state?versionIds=${catalog.versionId}`,
    { headers: actor.headers },
  );
  expect(
    await (await ratingState(request, actor.authEnv)).json(),
  ).toMatchObject({
    data: {
      ratings: [{ ...payload, overallSimilarity: 5 }],
      triedVersionIds: [catalog.versionId],
    },
  });
  const other = await authenticatedFixture();
  expect(
    await (
      await ratingState(
        new Request(request.url, { headers: other.headers }),
        other.authEnv,
      )
    ).json(),
  ).toMatchObject({ data: { ratings: [], triedVersionIds: [] } });
  expect(
    await (
      await myRatings(
        new Request(`${actor.authEnv.APP_URL}/api/v1/me/ratings`, {
          headers: actor.headers,
        }),
        actor.authEnv,
      )
    ).json(),
  ).toMatchObject({ data: [{ ...payload, overallSimilarity: 5 }] });
  // An analytics outage cannot turn an already committed contribution into an error.
  actor.authEnv.APP_EVENTS = {
    writeDataPoint: () => {
      throw new Error("analytics unavailable");
    },
  };
  expect(
    (await saveRating(put({ ...payload, overallSimilarity: 3 }), actor.authEnv))
      .status,
  ).toBe(200);
});

it("rejects invalid scores, foreign origins, spoofed ownership, unrelated categories, historical formulas, limited and suspended accounts", async () => {
  const catalog = await catalogFixture(env.DB);
  const actor = await authenticatedFixture();
  const body = {
    productVersionId: catalog.versionId,
    categoryId: catalog.categories[0],
    overallSimilarity: 4,
  };
  const put = (payload: unknown, headers = actor.headers) =>
    new Request(`${actor.authEnv.APP_URL}/api/v1/ratings`, {
      method: "PUT",
      headers,
      body: JSON.stringify(payload),
    });
  for (const score of [0, 6, 1.5, "4", null])
    await expect(
      saveRating(put({ ...body, overallSimilarity: score }), actor.authEnv),
    ).rejects.toMatchObject({ code: "INVALID_RATING" });
  await expect(
    saveRating(put({ ...body, userId: catalog.users[0]!.id }), actor.authEnv),
  ).rejects.toMatchObject({ code: "INVALID_RATING" });
  const foreign = new Headers(actor.headers);
  foreign.set("Origin", "https://elsewhere.test");
  await expect(
    saveRating(put(body, foreign), actor.authEnv),
  ).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
  const anonymous = new Headers(actor.headers);
  anonymous.delete("Cookie");
  await expect(
    saveRating(put(body, anonymous), actor.authEnv),
  ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  const unrelated = await catalogFixture(env.DB);
  await expect(
    saveRating(
      put({ ...body, categoryId: unrelated.categories[0] }),
      actor.authEnv,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await env.DB.prepare("UPDATE product_versions SET is_current=0 WHERE id=?")
    .bind(catalog.versionId)
    .run();
  await expect(saveRating(put(body), actor.authEnv)).rejects.toMatchObject({
    status: 409,
  });
  await env.DB.prepare("UPDATE product_versions SET is_current=1 WHERE id=?")
    .bind(catalog.versionId)
    .run();
  actor.authEnv.RATING_RATE_LIMIT = { limit: async () => ({ success: false }) };
  await expect(saveRating(put(body), actor.authEnv)).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  actor.authEnv.RATING_RATE_LIMIT = { limit: async () => ({ success: true }) };
  actor.authEnv.RATING_RISK_LIMIT = { limit: async () => ({ success: false }) };
  await expect(saveRating(put(body), actor.authEnv)).rejects.toMatchObject({
    code: "CHALLENGE_REQUIRED",
  });
  await env.DB.prepare(
    "UPDATE profiles SET account_state='suspended' WHERE user_id=?",
  )
    .bind(actor.user.id)
    .run();
  await expect(saveRating(put(body), actor.authEnv)).rejects.toMatchObject({
    status: 403,
  });
  expect(
    (
      await env.DB.prepare("SELECT COUNT(*) AS n FROM ratings WHERE user_id=?")
        .bind(actor.user.id)
        .first<{ n: number }>()
    )?.n,
  ).toBe(0);
  expect(
    actor.events.some((event) => event.blobs?.[0] === "rating_created"),
  ).toBe(false);
});

it("accepts optional details through the strict contract and reports them privately", async () => {
  const catalog = await catalogFixture(env.DB);
  const actor = await authenticatedFixture();
  const category = catalog.categories[0]!;
  await env.DB.batch(
    ["taste", "texture"].map((key, index) =>
      env.DB.prepare(
        "INSERT INTO category_rating_dimensions(id,category_id,key,label,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,1,1)",
      ).bind(`${key}-${category}`, category, key, key, index),
    ),
  );
  const put = (body: Record<string, unknown>) =>
    saveRating(
      new Request(`${actor.authEnv.APP_URL}/api/v1/ratings`, {
        method: "PUT",
        headers: actor.headers,
        body: JSON.stringify({
          productVersionId: catalog.versionId,
          categoryId: category,
          overallSimilarity: 4,
          ...body,
        }),
      }),
      actor.authEnv,
    );
  expect(
    await (
      await put({
        dimensions: { taste: 5, texture: null },
        conventionalRecency: "within_year",
      })
    ).json(),
  ).toMatchObject({
    data: {
      rating: { dimensions: { taste: 5 }, conventionalRecency: "within_year" },
      outcome: "created",
    },
  });
  for (const invalid of [
    { dimensions: { Taste: 3 } },
    { dimensions: { taste: 6 } },
    { conventionalRecency: "yesterday" },
    { dimensions: { taste: 3 }, extra: true },
  ])
    await expect(put(invalid)).rejects.toMatchObject({
      code: "INVALID_RATING",
    });
  await expect(put({ dimensions: { smell: 3 } })).rejects.toMatchObject({
    code: "INVALID_DIMENSION",
    status: 422,
  });
  const state = await (
    await ratingState(
      new Request(
        `${actor.authEnv.APP_URL}/api/v1/me/rating-state?versionIds=${catalog.versionId}`,
        { headers: actor.headers },
      ),
      actor.authEnv,
    )
  ).json();
  expect(state).toMatchObject({
    data: {
      ratings: [
        {
          overallSimilarity: 4,
          dimensions: { taste: 5 },
          conventionalRecency: "within_year",
        },
      ],
    },
  });
});
