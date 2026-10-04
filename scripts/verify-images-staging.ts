import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";
import { CloudflareImageTransformer } from "../server/media/infrastructure/cloudflare-images";
import {
  derivativeSpecs,
  validateImageBytes,
  validateImageInfo,
} from "../server/media/domain/media";

// Explicit opt-in: this calls real Cloudflare Images and consumes transformations.
if (process.argv[2] !== "--staging")
  throw new Error("Pass --staging to verify real Cloudflare Images.");
const source = parse(await readFile("wrangler.jsonc", "utf8"));
const directory = await mkdtemp(join(tmpdir(), "veganalts-image-check-"));
const outputDirectory = "test-results/live-images";
try {
  const configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "veganalts-image-check",
      account_id: source.account_id,
      compatibility_date: source.compatibility_date,
      images: { binding: "IMAGES", remote: true },
    }),
  );
  const proxy = await getPlatformProxy<{ IMAGES: ImagesBinding }>({
    configPath,
    remoteBindings: true,
  });
  try {
    await mkdir(outputDirectory, { recursive: true });
    const transformer = new CloudflareImageTransformer(proxy.env.IMAGES);
    const results = [];
    for (const [file, slot] of [
      ["evidence.png", "ingredients"],
      ["small.jpg", "front"],
      ["sample.webp", "front"],
    ] as const) {
      const bytes = new Uint8Array(await readFile(`tests/fixtures/${file}`));
      const info = await transformer.inspect(bytes);
      validateImageInfo(info, validateImageBytes(bytes));
      for (const spec of derivativeSpecs(slot)) {
        const output = await transformer.transform(bytes, spec);
        const scale = Math.min(
          1,
          spec.maxEdge / Math.max(info.width, info.height),
        );
        assert.equal(output.width, Math.round(info.width * scale));
        assert.equal(output.height, Math.round(info.height * scale));
        validateImageInfo(
          await transformer.inspect(output.bytes),
          "image/webp",
        );
        await writeFile(
          join(outputDirectory, `${file}-${spec.kind}.webp`),
          output.bytes,
        );
        results.push({
          file,
          kind: spec.kind,
          width: output.width,
          height: output.height,
          bytes: output.bytes.length,
        });
      }
    }
    await writeFile(
      join(outputDirectory, "results.json"),
      JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
    );
    console.log(
      JSON.stringify({
        environment: "Cloudflare Images remote binding",
        results,
      }),
    );
  } finally {
    await proxy.dispose();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
