import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { TAXONOMY_LEAVES } from "../../db/seed/taxonomy";
import { openBatch, stem } from "./batch";
import { build } from "./build";
import { rescope, scope } from "./lines";
import { match } from "./match";
import { merge } from "./merge";
import { outOfScope, setAside } from "./moves";
import { describeRange, indexPhotos, planChunks } from "./photos";
import { render } from "./render";
import { carryStores, findRepeats } from "./repeats";
import { AISLES } from "./schema";
import {
  listBin,
  pair,
  put,
  show,
  type Stage,
  STAGES,
  stores,
  todo,
} from "./stages";
import { photoNumbers } from "./timeline";

// The photo-batch skill's helper (.claude/skills/photo-batch/SKILL.md).
// Every command takes the converted photo folder ("<web>", which holds
// full/ and thumbnail/) and writes to its run folder (--run, default
// "review"). Nothing is imported into the site.

const usage = `Usage: npm run photos:review -- <command> "<web>" [options] [--run review-pilot]
  index "<web>" [--photos 301-400,1101-1200] [--force]  number, time and score the photos
  chunks "<web>" [--size 263] [--force]          ranges and contact sheets for sorting
  range "<web>" <range-id>                       a range's photos and sheets
  merge "<web>" [--force]                        join sorted ranges, list possible duplicates
  pair "<web>" <pair-id|pairs-bin>               both sides of a possible duplicate
  build "<web>" [--lines-size 40] [--force]      one record per product; lines bins
  repeats "<web>" --earlier "<earlier web>" [--earlier-run review] [--force]
                                                 pairs with an earlier batch's products
  carry-stores "<web>"                           add repeats' stores to the earlier products
  scope "<web>" [--check-size 10]                lines.json; check bins (high risk only)
  rescope "<web>" [--check-size 10]              check bins after the owner's corrections
  bin "<web>" <stage> <bin>                      the products in a lines or check bin
  show "<web>" <product-id>                      a product's line, label, risk and photos
  todo "<web>" <stage> <bin>                     what is left in a bin
  put "<web>" <stage> <bin> <id> < result.json  save validated work
  stores "<web>" 1=Walmart 2=unknown …           the store of each visit
  match "<web>" --staging|--local                catalog check (read-only)
  render "<web>"                                 review.html, products.csv, out-of-scope.csv
  out-of-scope "<web>" [--apply|--undo [product-id]]  list, move or restore out-of-scope photos
  set-aside "<web>" [--apply|--undo [product-id]]     list, move or restore set-aside photos
  zoom "<web>/full/<photo>" <left> <top> <width> <height>
  foods                                          food and aisle slugs
Stages: ${STAGES.join(", ")}.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    run: { type: "string", default: "review" },
    earlier: { type: "string" },
    "earlier-run": { type: "string", default: "review" },
    photos: { type: "string" },
    size: { type: "string", default: "263" },
    "lines-size": { type: "string", default: "40" },
    "check-size": { type: "string", default: "10" },
    force: { type: "boolean", default: false },
    staging: { type: "boolean", default: false },
    local: { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
    undo: { type: "boolean", default: false },
  },
});
const [command, target, ...rest] = positionals;
if (command === "foods") {
  for (const [aisle, name] of AISLES) {
    const foods = TAXONOMY_LEAVES.filter((leaf) => leaf.parent === aisle);
    console.log(
      `${aisle} (${name}): ${foods.map((leaf) => `${leaf.slug} (${leaf.name})`).join(", ") || "no foods yet"}`,
    );
  }
  process.exit(0);
}
if (!command || !target) throw new Error(usage);
const count = (value: string | undefined, name: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`--${name} needs a whole number.`);
  return parsed;
};
const stage = (value: string | undefined): Stage => {
  if (!STAGES.includes(value as Stage)) throw new Error(usage);
  return value as Stage;
};
const argument = (index: number) => {
  const value = rest[index];
  if (!value) throw new Error(usage);
  return value;
};

if (command === "zoom") {
  const photo = target;
  const batch = openBatch(dirname(dirname(photo)), values.run);
  const [left, top, width, height] = rest.map(Number);
  if (
    [left, top, width, height].some((value) => !Number.isInteger(value)) ||
    !width ||
    !height
  )
    throw new Error(usage);
  const output = join(
    batch.run,
    "zoom",
    `${stem(basename(photo))}-${left}-${top}-${width}x${height}.png`,
  );
  await mkdir(dirname(output), { recursive: true });
  await sharp(photo)
    .extract({ left: left!, top: top!, width, height })
    .resize({ width: width * 3, kernel: "lanczos3" })
    .png()
    .toFile(output);
  console.log(output);
} else {
  const batch = openBatch(target, values.run);
  switch (command) {
    case "index":
      await indexPhotos(
        batch,
        values.photos ? photoNumbers(values.photos) : undefined,
        values.force,
      );
      break;
    case "chunks":
      await planChunks(batch, count(values.size, "size"), values.force);
      break;
    case "range":
      await describeRange(batch, argument(0));
      break;
    case "merge":
      await merge(batch, { force: values.force });
      break;
    case "pair":
      await pair(batch, argument(0));
      break;
    case "build":
      await build(batch, {
        linesSize: count(values["lines-size"], "lines-size"),
        force: values.force,
      });
      break;
    case "repeats":
      if (!values.earlier) throw new Error(usage);
      await findRepeats(
        batch,
        openBatch(values.earlier, values["earlier-run"]),
        { force: values.force },
      );
      break;
    case "carry-stores":
      await carryStores(batch);
      break;
    case "scope":
    case "rescope":
      await (command === "scope" ? scope : rescope)(batch, {
        checkSize: count(values["check-size"], "check-size"),
      });
      break;
    case "bin":
      await listBin(batch, stage(rest[0]), argument(1));
      break;
    case "show":
      await show(batch, argument(0));
      break;
    case "todo":
      await todo(batch, stage(rest[0]), argument(1));
      break;
    case "put":
      await put(batch, stage(rest[0]), argument(1), argument(2));
      break;
    case "stores":
      await stores(batch, rest);
      break;
    case "match":
      if (values.staging === values.local) throw new Error(usage);
      await match(batch, values.staging ? "staging" : "local");
      break;
    case "render":
      await render(batch);
      break;
    case "set-aside":
    case "out-of-scope": {
      if (values.apply && values.undo) throw new Error(usage);
      const mode = values.apply ? "apply" : values.undo ? "undo" : "list";
      await (command === "set-aside" ? setAside : outOfScope)(
        batch,
        mode,
        mode === "undo" ? rest[0] : undefined,
      );
      break;
    }
    default:
      throw new Error(usage);
  }
}
