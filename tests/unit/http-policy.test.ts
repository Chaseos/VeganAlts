import { expect, it } from "vitest";
import {
  canonicalRedirect,
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
  expect(response.headers.get("Cache-Control")).toBe(
    "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
  );
});
