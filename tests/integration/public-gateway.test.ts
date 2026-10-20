import { expect, it, vi } from "vitest";
import gateway from "../../workers/app";

it("serves readable gateway document errors and retains API errors and response policy", async () => {
  const env = {
    APP_ENV: "staging",
    APP_URL: "https://staging.veganalts.com",
    WEB_ANALYTICS_TOKEN: "",
    VERSION_METADATA: { id: "gateway-error" },
    SEARCH_RATE_LIMIT: { limit: async () => ({ success: false }) },
  } as unknown as Cloudflare.Env;
  for (const path of ["/us/search?q=beef", "/api/v1/search?q=beef"]) {
    const response = await gateway.fetch(
      new Request(env.APP_URL + path) as Request<
        unknown,
        IncomingRequestCfProperties
      >,
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    if (path.startsWith("/us/")) {
      expect(response.headers.get("Content-Type")).toContain("text/html");
      expect(await response.text()).toContain("Retry this page");
    } else {
      expect(response.headers.get("Content-Type")).toContain(
        "application/problem+json",
      );
      expect(await response.json()).toMatchObject({ status: 429 });
    }
  }
});

it("serves cached product documents, data and API reads without touching D1", async () => {
  const prepare = vi.fn(() => {
    throw new Error("D1 must not run before a cache hit");
  });
  const cached = vi.fn(async (_request: Request) =>
    Response.json(
      { product: "Cached product" },
      {
        headers: {
          "CF-Cache-Status": "HIT",
          "Cache-Control": "public, max-age=0",
        },
      },
    ),
  );
  // Simulate the native cache RPC boundary. Any accidental gateway D1 access
  // fails, even when the cached entrypoint itself has a valid product response.
  const env = {
    APP_ENV: "staging",
    APP_URL: "https://staging.veganalts.com",
    WEB_ANALYTICS_TOKEN: "",
    VERSION_METADATA: { id: "cached-deployment" },
    DB: { prepare },
  } as unknown as Cloudflare.Env;
  const context = {
    exports: { PublicCatalog: { fetch: cached } },
  } as unknown as ExecutionContext;
  for (const path of [
    "/us/products/cached",
    "/us/products/cached.data",
    "/api/v1/products/cached",
  ]) {
    const response = await gateway.fetch(
      new Request(env.APP_URL + path, {
        headers: {
          Cookie: "private-session",
          Authorization: "Bearer private-token",
        },
      }) as Request<unknown, IncomingRequestCfProperties>,
      env,
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Public-Cache")).toBe("HIT");
    const forwarded = cached.mock.calls.at(-1)![0] as Request;
    expect(forwarded.headers.has("Cookie")).toBe(false);
    expect(forwarded.headers.has("Authorization")).toBe(false);
    expect(forwarded.redirect).toBe("manual");
  }
  expect(prepare).not.toHaveBeenCalled();
  expect(cached).toHaveBeenCalledTimes(3);
});
