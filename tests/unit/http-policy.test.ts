import { expect, it } from "vitest";
import {
  canonicalRedirect,
  conditionalMediaResponse,
  responsePolicy,
} from "../../server/shared/http/response-policy";

it("canonicalizes HTTP and www including static paths without dropping path or query", () => {
  for (const origin of [
    "http://veganalts.com",
    "http://www.veganalts.com",
    "https://www.veganalts.com",
  ]) {
    const response = canonicalRedirect(
      new Request(`${origin}/assets/example.css?x=1&y=2`),
      "production",
    );
    expect(response?.status).toBe(308);
    expect(response?.headers.get("Location")).toBe(
      "https://veganalts.com/assets/example.css?x=1&y=2",
    );
  }
  expect(
    canonicalRedirect(new Request("https://staging.veganalts.com/"), "staging"),
  ).toBeNull();
});

it("never shares private, write, error, or Set-Cookie responses", () => {
  for (const path of [
    "/account",
    "/admin/media",
    "/api/auth/get-session",
    "/healthz",
  ]) {
    const response = responsePolicy(
      new Response("ok", {
        headers: { "Cache-Control": "public, max-age=1800" },
      }),
      new Request(`https://veganalts.com${path}`),
      "production",
      "request-test",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
  for (const [method, status, cookie] of [
    ["POST", 200, false],
    ["GET", 500, false],
    ["GET", 200, true],
  ] as const) {
    const response = responsePolicy(
      new Response("test", {
        status,
        headers: cookie ? { "Set-Cookie": "test=value" } : {},
      }),
      new Request("https://veganalts.com/", { method }),
      "production",
      "request-test",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
});

it("revalidates landing HTML in the browser even when the edge cache supplies a longer TTL", () => {
  const response = responsePolicy(
    new Response("landing", {
      headers: { "Cache-Control": "public, max-age=14400" },
    }),
    new Request("https://veganalts.com/"),
    "production",
    "cache-hit-test",
  );
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=0");
});

it("evaluates image validators after shared delivery while retaining immutable browser caching", async () => {
  const request = new Request(
    "https://staging.veganalts.com/media/image_1/full",
    {
      headers: { "If-None-Match": '"older", W/"current"' },
    },
  );
  const shared = new Response("image bytes", {
    headers: {
      ETag: '"current"',
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  const conditional = conditionalMediaResponse(shared, request);
  expect(conditional.status).toBe(304);
  expect(await conditional.text()).toBe("");
  expect(
    responsePolicy(conditional, request, "staging", "image-test").headers.get(
      "Cache-Control",
    ),
  ).toBe("public, max-age=31536000, immutable");
  expect(
    conditionalMediaResponse(
      shared,
      new Request(request.url, { headers: { "If-None-Match": '"different"' } }),
    ).status,
  ).toBe(200);
  expect(await shared.text()).toBe("image bytes");
});
