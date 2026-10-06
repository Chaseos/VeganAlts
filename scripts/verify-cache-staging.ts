import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "jsonc-parser";

if (process.argv[2] !== "--staging")
  throw new Error(
    "Pass --staging to deploy a disposable native-cache fixture.",
  );
const source = parse(await readFile("wrangler.jsonc", "utf8"));
const name = `veganalts-cache-check-${crypto.randomUUID().slice(0, 8)}`;
const directory = await mkdtemp(join(tmpdir(), "veganalts-cache-check-"));
const config = join(directory, "wrangler.json");
const command = (args: string[]) =>
  execFileSync("npx", ["wrangler", ...args, "--config", config], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const evidence: Record<string, unknown>[] = [];
let deployed = false;
let verified = false;
try {
  await writeFile(
    config,
    JSON.stringify({
      name,
      account_id: source.account_id,
      main: resolve("tests/remote-cache/worker.ts"),
      compatibility_date: source.compatibility_date,
      workers_dev: true,
      preview_urls: false,
      cache: { enabled: false },
      exports: {
        default: { type: "worker", cache: { enabled: false } },
        Fixture: { type: "worker", cache: { enabled: true } },
      },
    }),
  );
  const deployment = command(["deploy"]);
  deployed = true;
  const origin = deployment.match(
    new RegExp(`https://${name}\\.[a-z0-9-]+\\.workers\\.dev`),
  )?.[0];
  assert.ok(origin, "Wrangler did not return the fixture URL");
  // A newly registered workers.dev hostname can briefly return Cloudflare's
  // 404 while the route propagates. Wait for our entrypoint before testing it.
  let ready = false;
  for (let attempt = 0; attempt < 24; attempt++) {
    const probe = await fetch(`${origin}/us/ready`);
    await probe.arrayBuffer();
    if (probe.status === 200 && probe.headers.has("X-Public-Cache")) {
      ready = true;
      break;
    }
    await pause(2500);
  }
  assert.ok(ready, "Disposable Worker route did not become ready");
  const read = async (path: string) => {
    const response = await fetch(origin + path);
    const text = await response.text();
    const result = {
      path,
      status: response.status,
      cache: response.headers.get("X-Public-Cache"),
      colo: response.headers.get("CF-Ray")?.split("-").at(-1),
      age: response.headers.get("Age"),
      body: text.replace(/nonce="[^"]+"/g, 'nonce="delivery"'),
      nonce: text.match(/nonce="([^"]+)"/)?.[1],
    };
    evidence.push(result);
    return result;
  };
  // Every path is synthetic, with no access to the application or its records.
  const first = await read("/us/fresh");
  await pause(500);
  const hit = await read("/us/fresh");
  assert.equal(hit.cache, "HIT");
  assert.equal(hit.body, first.body);
  assert.notEqual(hit.nonce, first.nonce);
  await pause(5000);
  const refresh = await read("/us/fresh?revision=two");
  assert.equal(refresh.status, 200);
  await pause(1000);
  assert.match((await read("/us/fresh?revision=two")).body, /two /);
  const staleSeed = await read("/us/stale");
  await pause(7500);
  const stale = await read("/us/stale?mode=failure");
  assert.equal(stale.status, 200);
  assert.equal(stale.cache, "STALE");
  assert.equal(stale.body, staleSeed.body);
  await pause(4100);
  assert.equal((await read("/us/stale?mode=failure")).status, 503);
  assert.equal((await read("/us/cold?mode=failure")).status, 503);
  const cookieA = await read("/us/cookie?mode=cookie");
  const cookieB = await read("/us/cookie?mode=cookie");
  assert.notEqual(cookieA.body, cookieB.body);
  assert.notEqual(cookieB.cache, "HIT");
  const collapsed = await Promise.all(
    Array.from({ length: 8 }, () => read("/us/collapse")),
  );
  assert.equal(new Set(collapsed.map((result) => result.body)).size, 1);
  const beforePurge = await read("/us/purge");
  const purged = await fetch(`${origin}/us/purge`, { method: "POST" });
  assert.equal(purged.status, 200);
  assert.equal(((await purged.json()) as { success: boolean }).success, true);
  // Purges propagate asynchronously. This fixture has a ten-minute TTL so
  // expiry cannot accidentally satisfy the five-second invalidation check.
  let afterPurge = beforePurge;
  for (let attempt = 0; attempt < 10; attempt++) {
    await pause(500);
    afterPurge = await read("/us/purge?revision=two");
    if (afterPurge.body !== beforePurge.body) break;
  }
  assert.match(afterPurge.body, /two /);
  assert.notEqual(afterPurge.body, beforePurge.body);
  verified = true;
  console.log(
    JSON.stringify({
      verified,
      checks: [
        "hit",
        "fresh nonce",
        "expiry/background refresh",
        "stale error",
        "bounded stale",
        "cold failure",
        "Set-Cookie bypass",
        "request collapsing",
        "material purge",
      ],
    }),
  );
} finally {
  await mkdir("test-results/milestone-2", { recursive: true });
  await writeFile(
    "test-results/milestone-2/native-cache.json",
    JSON.stringify(
      { checkedAt: new Date().toISOString(), verified, evidence },
      null,
      2,
    ),
  );
  if (deployed) {
    command(["delete", "--force"]);
    console.log("Disposable cache fixture removed.");
  }
  await rm(directory, { recursive: true, force: true });
}
