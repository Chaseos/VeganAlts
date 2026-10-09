import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { authenticatedFixture } from "./auth-fixture";
import { catalogFixture } from "./fixtures";
import { communityApi } from "../../server/community/http/handlers";
import { commentsApi } from "../../server/comments/http/handlers";
import { taxonomyApi } from "../../server/taxonomy/http/handlers";
import { communityServices } from "../../server/community/infrastructure/composition";
import { submissionInput } from "../../server/community/domain/contracts";
import { catalogIsPublic, robotsTxt } from "../../server/shared/domain/launch";

type Handler = (
  request: Request,
  path: string,
  env: Cloudflare.Env,
) => Promise<Response | null>;
// Every authenticated write and operator read added or extended in
// Milestone 4, plus representative milestone 3 entry points.
const contributorRoutes: [Handler, string, "GET" | "POST"][] = [
  [communityApi, "community/options", "GET"],
  [communityApi, "community/products/p/proposals", "GET"],
  [communityApi, "me/contributions", "GET"],
  [communityApi, "reports", "POST"],
  [communityApi, "proposals", "POST"],
  [communityApi, "proposals/p/responses", "POST"],
  [communityApi, "submissions/preflight", "POST"],
  [commentsApi, "comments", "POST"],
  [commentsApi, "comments/c/vote", "POST"],
  [commentsApi, "comments/c/edit", "POST"],
  [commentsApi, "comments/c/delete", "POST"],
  [commentsApi, "me/comment-state", "GET"],
  [taxonomyApi, "category-proposals", "POST"],
];
const operatorRoutes: [Handler, string, "GET" | "POST"][] = [
  [communityApi, "admin/moderation/inbox", "GET"],
  [communityApi, "admin/moderation/proposal/p/decide", "POST"],
  [communityApi, "admin/moderation/comment/c/decide", "POST"],
  [communityApi, "admin/moderation/actions/a/reverse", "POST"],
  [taxonomyApi, "admin/taxonomy", "GET"],
  [taxonomyApi, "admin/taxonomy/categories", "POST"],
  [taxonomyApi, "admin/taxonomy/categories/c", "POST"],
  [taxonomyApi, "admin/taxonomy/features", "POST"],
  [taxonomyApi, "admin/taxonomy/merges", "POST"],
  [taxonomyApi, "admin/taxonomy/merges/m/continue", "POST"],
  [taxonomyApi, "admin/taxonomy/merges/m/reverse", "POST"],
  [taxonomyApi, "admin/taxonomy/actions/a/reverse", "POST"],
  [taxonomyApi, "admin/moderation/category/c", "GET"],
  [taxonomyApi, "admin/moderation/category/c/decide", "POST"],
];

it("requires a session for contributor routes, the allowlist for operator routes and same-origin writes", async () => {
  const actor = await authenticatedFixture();
  const pass = { limit: async () => ({ success: true }) };
  const authEnv = {
    ...actor.authEnv,
    COMMENT_RATE_LIMIT: pass,
    VOTE_RATE_LIMIT: pass,
  } as Cloudflare.Env;
  const request = (path: string, method: string, headers: Headers) => {
    const h = new Headers(headers);
    h.set("Idempotency-Key", crypto.randomUUID());
    return new Request(`${authEnv.APP_URL}/api/v1/${path}`, {
      method,
      headers: h,
      body: method === "POST" ? "{}" : undefined,
    });
  };
  const anonymous = new Headers(actor.headers);
  anonymous.delete("Cookie");
  for (const [handler, path, method] of [
    ...contributorRoutes,
    ...operatorRoutes,
  ])
    await expect(
      handler(request(path, method, anonymous), path, authEnv),
      `${method} ${path}`,
    ).rejects.toMatchObject({ status: 401 });
  for (const [handler, path, method] of operatorRoutes)
    await expect(
      handler(request(path, method, actor.headers), path, authEnv),
      `${method} ${path}`,
    ).rejects.toMatchObject({ status: 403 });
  const cross = new Headers(actor.headers);
  cross.set("Origin", "https://attacker.example");
  for (const [handler, path, method] of contributorRoutes.filter(
    ([, , m]) => m === "POST",
  ))
    await expect(
      handler(request(path, method, cross), path, authEnv),
      `${method} ${path}`,
    ).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
});

it("keeps the catalog closed in production until the launch flag is set", async () => {
  expect(catalogIsPublic({ APP_ENV: "staging" })).toBe(true);
  expect(
    catalogIsPublic({ APP_ENV: "production", PUBLIC_LAUNCH: "false" }),
  ).toBe(false);
  expect(
    catalogIsPublic({ APP_ENV: "production", PUBLIC_LAUNCH: "true" }),
  ).toBe(true);
  const actor = await authenticatedFixture();
  const closed = {
    ...actor.authEnv,
    APP_ENV: "production",
    PUBLIC_LAUNCH: "false",
  } as unknown as Cloudflare.Env;
  for (const [handler, path, method] of contributorRoutes)
    await expect(
      handler(
        new Request(`${closed.APP_URL}/api/v1/${path}`, {
          method,
          headers: actor.headers,
          body: method === "POST" ? "{}" : undefined,
        }),
        path,
        closed,
      ),
      `${method} ${path}`,
    ).rejects.toMatchObject({ status: 404 });
  expect(
    robotsTxt({ APP_ENV: "staging", APP_URL: "https://staging.veganalts.com" }),
  ).toBe("User-agent: *\nDisallow: /\n");
  expect(
    robotsTxt({
      APP_ENV: "production",
      APP_URL: "https://veganalts.com",
      PUBLIC_LAUNCH: "false",
    }),
  ).not.toContain("Sitemap");
  expect(
    robotsTxt({
      APP_ENV: "production",
      APP_URL: "https://veganalts.com",
      PUBLIC_LAUNCH: "true",
    }),
  ).toContain("Sitemap: https://veganalts.com/sitemap.xml");
});

it("rejects disguised, polyglot, oversized and decompression-bomb contribution uploads before storing them", async () => {
  const f = await catalogFixture(env.DB, 1);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const services = communityServices(env, () => crypto.randomUUID());
  const actor = { ...f.users[0]!, administrator: false };
  const checked = await services.submissions.preflight(
    actor,
    crypto.randomUUID(),
    submissionInput.parse({
      name: "Upload safety patties",
      brand: `Safety ${crypto.randomUUID()}`,
      country: "US",
      categoryIds: [f.categories[0]],
      imageSlots: ["front"],
      ingredientUrl: "https://example.com/ingredients",
      statusBasis:
        "Synthetic manufacturer ingredient evidence for upload safety.",
      noKnownAnimalIngredients: true,
      manufacturerLabel: "vegan",
    }),
  );
  const upload = (bytes: Uint8Array) =>
    services.media.upload(actor, {
      receiptId: checked.receiptId!,
      slot: "front",
      idempotencyKey: crypto.randomUUID(),
      bytes,
    });
  const text = (value: string) => new TextEncoder().encode(value);
  // HTML or SVG renamed to an image extension has no image signature.
  await expect(
    upload(text("<svg onload=alert(1)></svg>")),
  ).rejects.toMatchObject({
    code: "INVALID_IMAGE",
  });
  await expect(
    upload(text("<!doctype html><script>alert(1)</script>")),
  ).rejects.toMatchObject({
    code: "INVALID_IMAGE",
  });
  // A JPEG signature followed by markup does not decode as an image.
  await expect(
    upload(
      new Uint8Array([
        0xff,
        0xd8,
        0xff,
        ...text("<html><script>alert(1)</script>"),
      ]),
    ),
  ).rejects.toMatchObject({ status: expect.any(Number) });
  await expect(
    upload(new Uint8Array(10 * 1024 * 1024 + 1)),
  ).rejects.toMatchObject({
    status: 413,
  });
  // Dimensions are checked before any transformation.
  const transform = vi.spyOn(
    // The staged service's transformer is reachable through its prototype chain.
    Object.getPrototypeOf(
      (services.media as unknown as { transformer: object }).transformer,
    ),
    "inspect",
  );
  transform.mockResolvedValueOnce({
    format: "image/jpeg",
    width: 20000,
    height: 20000,
  });
  await expect(
    upload(Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) => c.charCodeAt(0))),
  ).rejects.toMatchObject({ status: expect.any(Number) });
  transform.mockRestore();
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM submission_uploads u JOIN staged_blobs b ON b.id=u.blob_id WHERE u.submission_id=? AND b.state='complete'",
    )
      .bind(checked.receiptId)
      .first("n"),
  ).toBe(0);
});
