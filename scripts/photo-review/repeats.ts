import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  type Batch,
  loadProduct,
  moveAside,
  openBatch,
  readJsonIfPresent,
  result,
  runFile,
  savedIds,
  writeJson,
} from "./batch";
import { brandsMayMatch, productKey, tokenOverlap } from "./identity";
import { movedPhotos } from "./move-log";
import {
  linesFile,
  type ProductRecord,
  reconcileResult,
  type RepeatPlan,
  repeatPlan,
} from "./schema";
import { sheet } from "./sheets";

// `repeats`: products a later batch photographed again. Each product of this
// run is paired with likely matches from an earlier batch's run; Repeat
// agents decide each pair from a side-by-side sheet, and a confirmed repeat
// leaves the list, its photos set aside as duplicates (owner, 2026-10-16).
// The earlier batch is read through its own review (view.ts loadRun), so its
// owner corrections, late duplicates and repeats apply; view.ts imports this
// module, so loadRun is imported lazily.

const CANDIDATES_PER_PRODUCT = 3;
const PAIRS_PER_BIN = 30;
const MIN_OVERLAP = 0.5;

export const loadRepeatPlan = (batch: Batch) =>
  readJsonIfPresent(runFile(batch, "repeats.json"), repeatPlan);

export const earlierBatch = (plan: RepeatPlan) =>
  openBatch(plan.earlier.web, basename(plan.earlier.run));

const earlierViews = async (earlier: Batch) => {
  const { loadRun } = await import("./view");
  return (await loadRun(earlier)).views;
};

const labelPhoto = (photos: ProductRecord["photos"], other: string[]) =>
  photos.ingredients ?? photos.back ?? photos.nutrition ?? other[0];

/** Pair bins whose decisions are not saved yet. */
async function undecided(batch: Batch, plan: RepeatPlan) {
  const decided = new Set(await savedIds(batch, "repeat"));
  return Object.keys(plan.bins).filter((bin) => !decided.has(bin));
}

export async function findRepeats(
  batch: Batch,
  earlier: Batch,
  options: { force: boolean },
) {
  if (earlier.run === batch.run)
    throw new Error("Compare with a different batch's run.");
  // A rerun keeps the plan and any decisions, so the workflow can resume;
  // --force starts over. A rebuild sets both aside itself (build.ts).
  const existing = await loadRepeatPlan(batch);
  if (existing && !options.force) {
    const open = await undecided(batch, existing);
    console.log(
      `Repeats already paired (${existing.pairs.length} pairs); ${open.length} bins still to decide. Pass --force to start over.`,
    );
    return result({ ok: true, pairs: existing.pairs.length, bins: open });
  }
  const [mine, theirs, movedHere, movedThere] = await Promise.all([
    Promise.all(
      (await savedIds(batch, "products")).map((id) => loadProduct(batch, id)),
    ),
    earlierViews(earlier),
    movedPhotos(batch),
    movedPhotos(earlier),
  ]);
  if (!theirs.length)
    throw new Error(
      `No products in ${earlier.run}; check --earlier and --earlier-run.`,
    );
  const thumbnail = (web: string, moved: Map<string, string>, photo: string) =>
    join(web, moved.get(photo) ?? "", "thumbnail", photo);

  const pairs: RepeatPlan["pairs"] = [];
  for (const product of mine) {
    const key = productKey(product.brand, product.name, product.flavor);
    const matches = theirs
      .filter((other) => brandsMayMatch(product.brand, other.brand))
      .map((other) => ({
        other,
        same: productKey(other.brand, other.name, other.flavor) === key,
        overlap: tokenOverlap(product.name, other.name),
      }))
      .filter((match) => match.same || match.overlap >= MIN_OVERLAP)
      .sort((a, b) => Number(b.same) - Number(a.same) || b.overlap - a.overlap)
      .slice(0, CANDIDATES_PER_PRODUCT);
    for (const { other, same, overlap } of matches) {
      const id = `repeat-${String(pairs.length + 1).padStart(3, "0")}`;
      pairs.push({
        id,
        product: product.id,
        earlier: other.id,
        earlierBrand: other.brand,
        earlierName: other.name,
        earlierPhoto: other.photos.front,
        reason: same
          ? "Same brand and product name."
          : `Same brand; ${Math.round(overlap * 100)}% of the name's words match.`,
        sheet: runFile(batch, "repeats", `${id}.jpg`),
      });
    }
  }

  // The old plan, decisions and sheets move aside only now, once the new
  // ones can be made.
  await moveAside(batch, "repeat");
  await moveAside(batch, "repeats.json");
  await moveAside(batch, "repeats");
  const byId = new Map(mine.map((product) => [product.id, product]));
  const earlierById = new Map(theirs.map((view) => [view.id, view]));
  const short = (text: string) =>
    text.length > 44 ? `${text.slice(0, 43)}…` : text;
  // A few sheets at a time keeps the command inside a timeout.
  for (let start = 0; start < pairs.length; start += 6)
    await Promise.all(
      pairs.slice(start, start + 6).map((pair) => {
        const a = byId.get(pair.product)!;
        const b = earlierById.get(pair.earlier)!;
        const aFront = a.photos.front ?? labelPhoto(a.photos, a.other);
        const aLabel = labelPhoto(a.photos, a.other);
        const bFront = b.photos.front ?? labelPhoto(b.photos, b.record.other);
        const bLabel = labelPhoto(b.photos, b.record.other);
        const here = (photo?: string) =>
          photo ? thumbnail(batch.web, movedHere, photo) : undefined;
        const there = (photo?: string) =>
          photo ? thumbnail(earlier.web, movedThere, photo) : undefined;
        return sheet(
          batch,
          [
            { path: here(aFront), caption: short(`NEW: ${a.name}`) },
            { path: there(bFront), caption: short(`EARLIER: ${b.name}`) },
            { path: here(aLabel), caption: "NEW label" },
            { path: there(bLabel), caption: "EARLIER label" },
          ],
          2,
          pair.sheet,
        );
      }),
    );

  const bins: Record<string, string[]> = {};
  for (let start = 0; start < pairs.length; start += PAIRS_PER_BIN)
    bins[`repeats-${String(start / PAIRS_PER_BIN + 1).padStart(2, "0")}`] =
      pairs.slice(start, start + PAIRS_PER_BIN).map((pair) => pair.id);
  await writeJson(
    runFile(batch, "repeats.json"),
    repeatPlan.parse({
      earlier: { web: earlier.web, run: earlier.run },
      pairs,
      bins,
    }),
  );
  const covered = new Set(pairs.map((pair) => pair.product)).size;
  console.log(
    `${pairs.length} possible repeats for ${covered} of ${mine.length} products, against ${theirs.length} products in ${earlier.run}; ${Object.keys(bins).length} bins.`,
  );
  result({ ok: true, pairs: pairs.length, bins: Object.keys(bins) });
}

export interface Repeat {
  earlier: string;
  earlierBrand: string;
  earlierName: string;
  earlierWeb: string;
}

/**
 * Products of this run judged the same as an earlier batch's product. A
 * repeat passes along a late-duplicate link: when a Lines agent folded a
 * confirmed repeat into another product, that product is the repeat.
 */
export async function decidedRepeats(batch: Batch) {
  const repeats = new Map<string, Repeat>();
  const plan = await loadRepeatPlan(batch);
  if (!plan) return repeats;
  const pairs = new Map(plan.pairs.map((pair) => [pair.id, pair]));
  for (const bin of Object.keys(plan.bins)) {
    const decided = await readJsonIfPresent(
      runFile(batch, "repeat", `${bin}.json`),
      reconcileResult,
    );
    for (const decision of decided?.decisions ?? []) {
      const pair = pairs.get(decision.pair);
      if (!decision.same || !pair || repeats.has(pair.product)) continue;
      repeats.set(pair.product, {
        earlier: pair.earlier,
        earlierBrand: pair.earlierBrand,
        earlierName: pair.earlierName,
        earlierWeb: plan.earlier.web,
      });
    }
  }
  const lines = await readJsonIfPresent(
    runFile(batch, "lines.json"),
    linesFile,
  );
  for (const line of lines?.lines ?? [])
    for (const member of line.products) {
      const repeat = repeats.get(member.id);
      if (member.duplicateOf && repeat && !repeats.has(member.duplicateOf))
        repeats.set(member.duplicateOf, repeat);
    }
  return repeats;
}

/**
 * The earlier batch's lines for these brands, as its review shows them
 * (corrections applied), so names and foods carry over.
 */
export async function earlierLines(batch: Batch, brands: readonly string[]) {
  const plan = await loadRepeatPlan(batch);
  if (!plan) return [];
  const lines = new Map<
    string,
    { brand: string; lineName: string; food: string; flavors: string[] }
  >();
  for (const view of await earlierViews(earlierBatch(plan))) {
    if (view.skip || !brands.some((brand) => brandsMayMatch(brand, view.brand)))
      continue;
    const food = view.food
      ? `food ${view.food}`
      : view.newFood
        ? `new food ${view.newFood.name}`
        : `out of scope (${view.outOfScope})`;
    const lineName = view.lineName ?? view.name;
    const key = `${view.brand}|${lineName}|${food}`;
    const line = lines.get(key) ?? {
      brand: view.brand,
      lineName,
      food,
      flavors: [],
    };
    line.flavors.push(view.flavor ?? "Original");
    lines.set(key, line);
  }
  return [...lines.values()];
}

/** Stores later batches found products at, by product id (carry-stores). */
export async function loadCarried(batch: Batch) {
  const carried = new Map<string, string[]>();
  let files: string[] = [];
  try {
    files = await readdir(runFile(batch, "carried"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const stores = JSON.parse(
      await readFile(runFile(batch, "carried", file), "utf8"),
    ) as Record<string, string[]>;
    for (const [id, found] of Object.entries(stores))
      carried.set(id, [...new Set([...(carried.get(id) ?? []), ...found])]);
  }
  return carried;
}

/**
 * `carry-stores`: a repeat's photos are set aside, so the stores where this
 * batch found it (late duplicates' stores included) are recorded for the
 * earlier batch's product in `<earlier run>/carried/<this batch>.json`, which
 * its review reads (owner, 2026-10-16). Run it after `stores`. Each run
 * rewrites this batch's file, so changed stores or decisions replace it.
 */
export async function carryStores(batch: Batch) {
  const plan = await loadRepeatPlan(batch);
  if (!plan) throw new Error("Run repeats first.");
  const earlier = earlierBatch(plan);
  const { loadRun } = await import("./view");
  const run = await loadRun(batch);
  if (!Object.keys(run.stores).length)
    throw new Error("Choose this batch's stores first (stores).");
  const carried: Record<string, string[]> = {};
  for (const { view, repeat } of run.repeats)
    if (view.stores.length)
      carried[repeat.earlier] = [
        ...new Set([...(carried[repeat.earlier] ?? []), ...view.stores]),
      ].sort();
  await writeJson(
    runFile(earlier, "carried", `${basename(batch.web)}.json`),
    carried,
  );
  console.log(
    `${run.repeats.length} repeats; stores recorded for ${Object.keys(carried).length} products of ${earlier.web}. Render it again to show them.`,
  );
  result({
    ok: true,
    repeats: run.repeats.length,
    updated: Object.keys(carried).length,
  });
}
