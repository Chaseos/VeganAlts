import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join, resolve, sep } from "node:path";
import sharp from "sharp";
import { derivativeSpecs } from "../server/media/domain/media";

// Turns a folder of store photos into the full and thumbnail WebP copies the
// site itself makes, with identical settings for fronts and ingredient labels.
// A test on real package photos (2026-10-15) found 1800 px keeps even
// footnote-size label text as readable as the 12 MP original, so the site's
// own full spec is enough and no separate evidence copy is made here.
const usage =
  'Usage: npm run photos:prepare -- "<input folder>" ["<output folder>"] [--force]';
const args = process.argv.slice(2);
const force = args.includes("--force");
const [inputArg, outputArg, ...extra] = args.filter((arg) => arg !== "--force");
if (!inputArg || extra.length > 0) throw new Error(usage);
const input = resolve(inputArg);
const output = resolve(outputArg ?? `${input} - Web`);
if (output === input || output.startsWith(input + sep))
  throw new Error("Choose an output folder outside the input folder.");

const variants = derivativeSpecs("front");
const supported = /\.(jpe?g|png|webp)$/i;
const entries = (await readdir(input, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
  .map((entry) => entry.name)
  .sort();
const photos = entries.filter((name) => supported.test(name));
const unsupported = entries.filter((name) => !supported.test(name));
for (const variant of variants)
  await mkdir(join(output, variant.kind), { recursive: true });

// One photo per libvips thread keeps every core busy without oversubscribing.
sharp.cache(false);
sharp.concurrency(1);
const workers = Math.max(1, availableParallelism() - 2);

const outputPath = (name: string, kind: string) =>
  join(output, kind, name.replace(supported, ".webp"));
const outputModified = (path: string) =>
  stat(path).then(
    (info) => info.mtimeMs,
    () => -1,
  );

let converted = 0;
let skipped = 0;
let bytesBefore = 0;
const bytesAfter = new Map(variants.map((variant) => [variant.kind, 0]));
let largestFull = { name: "", bytes: 0 };
const failures: string[] = [];

async function prepare(name: string) {
  const source = join(input, name);
  const sourceInfo = await stat(source);
  const targets = variants.map((variant) => outputPath(name, variant.kind));
  if (!force) {
    const outputsModified = await Promise.all(targets.map(outputModified));
    if (outputsModified.every((time) => time >= sourceInfo.mtimeMs)) {
      skipped += 1;
      return;
    }
  }
  // Motion photos decode as their still frame; the embedded video is dropped,
  // and sharp writes no EXIF, so GPS and other metadata never leave this machine.
  const image = sharp(source).rotate();
  const temporaries = targets.map((target) => `${target}.${process.pid}.tmp`);
  try {
    const written = await Promise.all(
      variants.map((variant, index) =>
        image
          .clone()
          .resize({
            width: variant.maxEdge,
            height: variant.maxEdge,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: variant.quality, effort: 5 })
          .toFile(temporaries[index]!),
      ),
    );
    await Promise.all(
      temporaries.map((temporary, index) => rename(temporary, targets[index]!)),
    );
    converted += 1;
    bytesBefore += sourceInfo.size;
    variants.forEach((variant, index) => {
      const bytes = written[index]!.size;
      bytesAfter.set(variant.kind, (bytesAfter.get(variant.kind) ?? 0) + bytes);
      if (variant.kind === "full" && bytes > largestFull.bytes)
        largestFull = { name, bytes };
    });
  } catch (error) {
    await Promise.all(
      temporaries.map((temporary) => rm(temporary, { force: true })),
    );
    failures.push(
      `${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const settings = variants
  .map((variant) => `${variant.kind} ${variant.maxEdge} px q${variant.quality}`)
  .join(", ");
console.log(`Preparing ${photos.length} photos (${settings}) into ${output}`);
let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (next < photos.length) {
      await prepare(photos[next++]!);
      done += 1;
      if (done % 100 === 0) console.log(`  ${done}/${photos.length}`);
    }
  }),
);

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
console.log(
  `\nConverted ${converted}, already up to date ${skipped}, failed ${failures.length}.`,
);
if (converted > 0) {
  const after = [...bytesAfter.values()].reduce((sum, bytes) => sum + bytes, 0);
  console.log(
    `Size: ${mb(bytesBefore)} of originals -> ${mb(after)} (${[...bytesAfter]
      .map(([kind, bytes]) => `${kind} ${mb(bytes)}`)
      .join(", ")}).`,
  );
  console.log(
    `Largest full: ${largestFull.name} (${Math.round(largestFull.bytes / 1024)} KB).`,
  );
}
if (unsupported.length > 0)
  console.log(`Skipped unsupported files: ${unsupported.join(", ")}`);
if (failures.length > 0) {
  console.error(`Failed:\n  ${failures.join("\n  ")}`);
  process.exitCode = 1;
}
