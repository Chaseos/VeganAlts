import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// Read-only checks of the deployed staging public surface: shared caching,
// cookie isolation, crawler controls and a modest anonymous load. It sends no
// writes and never authenticates.
const origin = process.env.TEST_BASE_URL ?? "https://staging.veganalts.com";
const load = process.argv.includes("--load");
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const read = async (path: string, headers: Record<string, string> = {}) => {
  const started = performance.now();
  const response = await fetch(new URL(path, origin), {
    headers,
    redirect: "manual",
  });
  const body = await response.text();
  return {
    path,
    status: response.status,
    cache: response.headers.get("X-Public-Cache"),
    cacheControl: response.headers.get("Cache-Control"),
    robots: response.headers.get("X-Robots-Tag"),
    setCookie: response.headers.has("Set-Cookie"),
    ms: Math.round(performance.now() - started),
    body: body
      .replace(/nonce="[^"]+"/g, 'nonce="x"')
      .replace(/"requestId":"[^"]+"/g, ""),
  };
};

const ranked = (
  (await (
    await fetch(new URL("/api/v1/categories/ground-beef", origin))
  ).json()) as {
    data: { ranked: { slug: string }[] };
  }
).data.ranked;
assert.ok(ranked.length, "staging needs a ranked product in ground-beef");
const product = `/us/products/${ranked[0]!.slug}`;
// Every launch country's home and a food page share the cache the same way;
// filtered rankings, aisles, product food views and instant answers too.
const countries = ["ca", "gb", "au", "nz", "ie"];
const pages = [
  "/",
  "/us/ground-beef",
  "/us/ground-beef?view=trending",
  "/us/ground-beef?view=new",
  "/us/ground-beef?view=most-rated",
  "/us/ground-beef?freeFrom=soy",
  "/us/meat",
  "/us/meat?shelf=beef",
  ...countries.flatMap((code) => [`/${code}`, `/${code}/ground-beef`]),
  "/api/v1/suggest?country=us&q=beef",
  product,
  `${product}?food=ground-beef`,
  `/api/v1/products/${product.split("/").at(-1)}/comments?sort=best`,
  "/about/rankings",
  "/sitemap.xml",
];
const evidence: Record<string, unknown> = {
  origin,
  at: new Date().toISOString(),
};

const robots = await read("/robots.txt");
assert.equal(robots.status, 200);
assert.match(
  robots.body,
  /Disallow: \//,
  "staging robots must disallow crawling",
);
evidence.robots = robots.body;

const cache = [];
for (const path of pages) {
  await read(path); // warm
  await pause(400);
  const anonymous = await read(path);
  // A session-like cookie must neither fragment nor bypass the shared cache.
  const cookie = await read(path, {
    Cookie: "__Secure-better-auth.session_token=unrelated",
  });
  assert.equal(anonymous.status, 200, `${path} status`);
  assert.equal(anonymous.setCookie, false, `${path} must not set cookies`);
  assert.equal(
    anonymous.robots,
    "noindex, nofollow",
    `${path} staging noindex`,
  );
  assert.equal(
    anonymous.cache,
    "HIT",
    `${path} should be served from the shared cache`,
  );
  assert.equal(
    cookie.cache,
    "HIT",
    `${path} with a cookie should share the cached copy`,
  );
  assert.equal(cookie.body, anonymous.body, `${path} must not vary by cookie`);
  cache.push({
    path,
    cache: anonymous.cache,
    cacheControl: anonymous.cacheControl,
    ms: anonymous.ms,
  });
}
evidence.cache = cache;

// Former category slugs redirect uncached; private routes stay private.
const privateRead = await read("/api/v1/me/comment-state?productId=x");
assert.equal(privateRead.status, 401);
assert.match(privateRead.cacheControl ?? "", /no-store/);
evidence.privateRead = {
  status: privateRead.status,
  cacheControl: privateRead.cacheControl,
};

if (load) {
  const seconds = Number(process.env.LOAD_SECONDS ?? 120),
    concurrency = Number(process.env.LOAD_CONCURRENCY ?? 8);
  const latencies: number[] = [];
  let hits = 0,
    errors = 0;
  const end = Date.now() + seconds * 1000;
  await Promise.all(
    Array.from({ length: concurrency }, async (_, worker) => {
      let i = worker;
      while (Date.now() < end) {
        const result = await read(pages[i++ % pages.length]!).catch(() => null);
        if (!result || result.status !== 200) errors++;
        else {
          latencies.push(result.ms);
          if (result.cache === "HIT") hits++;
        }
        // Roughly 20 requests per second overall at the default concurrency.
        await pause(350);
      }
    }),
  );
  latencies.sort((a, b) => a - b);
  const pct = (p: number) => latencies[Math.floor((latencies.length - 1) * p)];
  evidence.load = {
    seconds,
    concurrency,
    requests: latencies.length + errors,
    errors,
    hitRatio: latencies.length ? hits / latencies.length : 0,
    p50: pct(0.5),
    p95: pct(0.95),
    max: latencies.at(-1),
  };
  assert.equal(errors, 0, "load produced errors");
}
await mkdir("test-results/milestone-4", { recursive: true });
await writeFile(
  "test-results/milestone-4/staging-public.json",
  JSON.stringify(evidence, null, 2),
);
console.log(
  JSON.stringify({
    ...evidence,
    robots: undefined,
    cache: cache.map((c) => `${c.path} ${c.cache}`),
  }),
);
