import { readdir } from "node:fs/promises";
import { z } from "zod";
import {
  type Batch,
  loadProduct,
  photoFile,
  readJson,
  readJsonIfPresent,
  result,
  runFile,
  savedIds,
  writeJson,
} from "./batch";
import { checkLines, loadLines } from "./lines";
import { movedPhotos } from "./move-log";
import { loadChunks, loadIndex } from "./photos";
import {
  decidedRepeats,
  earlierBatch,
  earlierLines,
  loadRepeatPlan,
} from "./repeats";
import {
  binPlan,
  checkResult,
  FOODS,
  linesResult,
  mergePlan,
  type ProductRecord,
  reconcileResult,
  SLOTS,
  type SortResult,
  sortResult,
  storeChoice,
} from "./schema";

// What agents call: `todo` and `put` to resume and save work, and `show`,
// `bin` and `pair` to see their inputs. Also `stores`.

export const STAGES = [
  "sort",
  "reconcile",
  "repeat",
  "lines",
  "check",
] as const;
export type Stage = (typeof STAGES)[number];

async function binIds(batch: Batch, stage: Stage, bin: string) {
  let ids: string[] | undefined;
  if (stage === "sort")
    ids = (await loadChunks(batch)).ranges.some((r) => r.id === bin)
      ? [bin]
      : undefined;
  else if (stage === "reconcile")
    ids = (await readJson(runFile(batch, "merge.json"), mergePlan)).bins[bin]
      ? [bin]
      : undefined;
  else if (stage === "repeat")
    ids = (await loadRepeatPlan(batch))?.bins[bin] ? [bin] : undefined;
  else if (stage === "lines")
    ids = (await readJson(runFile(batch, "bins.json"), binPlan)).lines[bin]
      ? [bin]
      : undefined;
  else ids = (await readJson(runFile(batch, "bins.json"), binPlan)).check[bin];
  if (!ids) throw new Error(`There is no ${stage} bin "${bin}".`);
  return ids;
}

export async function todo(batch: Batch, stage: Stage, bin: string) {
  const ids = await binIds(batch, stage, bin);
  const saved = new Set(await savedIds(batch, stage));
  const remaining = ids.filter((id) => !saved.has(id));
  for (const id of remaining) console.log(id);
  console.log(`${remaining.length} of ${ids.length} left in ${stage} ${bin}.`);
  result({ remaining });
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(z.prettifyError(parsed.error));
  return parsed.data;
}

const productPhotos = (product: ProductRecord) =>
  new Set([
    ...Object.values(product.photos),
    ...Object.values(product.alternates).flat(),
    ...product.other,
  ]);

async function checkSort(batch: Batch, sorted: SortResult) {
  const range = (await loadChunks(batch)).ranges.find(
    (entry) => entry.id === sorted.range,
  )!;
  const inRange = new Set(range.photos);
  const context = new Set(range.context);
  const used = new Map<string, string>();
  const problems: string[] = [];
  const use = (photo: string, where: string) => {
    if (!inRange.has(photo))
      problems.push(`${photo} (${where}) is not in ${range.id}.`);
    else if (used.has(photo))
      problems.push(`${photo} is used twice: ${used.get(photo)} and ${where}.`);
    else used.set(photo, where);
  };
  sorted.groups.forEach((group, index) => {
    for (const slot of SLOTS)
      if (group.photos[slot])
        use(group.photos[slot], `group ${index + 1} ${slot}`);
    for (const photo of group.photos.other)
      use(photo, `group ${index + 1} other`);
    if (group.continues && !context.has(group.continues))
      problems.push(
        `Group ${index + 1} continues ${group.continues}, which is not one of the context photos.`,
      );
  });
  for (const entry of sorted.setAside) {
    use(entry.photo, "set aside");
    if (entry.duplicateOf && !inRange.has(entry.duplicateOf))
      problems.push(
        `${entry.photo} is a retake of ${entry.duplicateOf}, which is not in ${range.id}.`,
      );
  }
  for (const hint of sorted.storeHints)
    if (!inRange.has(hint.photo) && !context.has(hint.photo))
      problems.push(`Store evidence ${hint.photo} is not in ${range.id}.`);
  const missing = range.photos.filter((photo) => !used.has(photo));
  if (missing.length)
    problems.push(`Assign every photo; missing: ${missing.join(", ")}.`);
  if (problems.length) throw new Error(problems.join("\n"));
}

/** Every pair of the bin decided exactly once. */
function checkDecisions(
  bin: string,
  pairs: readonly string[],
  decisions: readonly { pair: string }[],
) {
  const expected = new Set(pairs);
  const given = decisions.map((decision) => decision.pair);
  const missing = [...expected].filter((pair) => !given.includes(pair));
  const extra = [...new Set(given)].filter((pair) => !expected.has(pair));
  const twice = [
    ...new Set(given.filter((pair, index) => given.indexOf(pair) !== index)),
  ];
  if (missing.length || extra.length || twice.length)
    throw new Error(
      `Decide exactly the pairs in ${bin}, once each. Missing: ${missing.join(", ") || "none"}. Not in this bin: ${extra.join(", ") || "none"}. Decided twice: ${twice.join(", ") || "none"}.`,
    );
}

/** Validates an agent's JSON (on stdin) and saves it atomically. */
export async function put(batch: Batch, stage: Stage, bin: string, id: string) {
  const ids = await binIds(batch, stage, bin);
  if (!ids.includes(id)) throw new Error(`${id} is not in ${stage} ${bin}.`);
  const input: unknown = JSON.parse(await readStdin());
  let saved: unknown;
  if (stage === "sort") {
    const sorted = parse(sortResult, input);
    if (sorted.range !== id) throw new Error(`Set "range" to "${id}".`);
    await checkSort(batch, sorted);
    saved = sorted;
  } else if (stage === "reconcile" || stage === "repeat") {
    const decided = parse(reconcileResult, input);
    if (decided.bin !== id) throw new Error(`Set "bin" to "${id}".`);
    const pairs =
      stage === "reconcile"
        ? (await readJson(runFile(batch, "merge.json"), mergePlan)).bins[id]
        : (await loadRepeatPlan(batch))!.bins[id];
    checkDecisions(id, pairs ?? [], decided.decisions);
    saved = decided;
  } else if (stage === "lines") {
    const decided = parse(linesResult, input);
    if (decided.bin !== id) throw new Error(`Set "bin" to "${id}".`);
    const members = (await readJson(runFile(batch, "bins.json"), binPlan))
      .lines[id]!;
    const info = new Map(
      await Promise.all(
        members.map(async (member) => {
          const product = await loadProduct(batch, member);
          return [member, product] as const;
        }),
      ),
    );
    const problems = checkLines(decided.lines, members, info);
    if (problems.length) throw new Error(problems.join("\n"));
    saved = decided;
  } else {
    const checked = parse(checkResult, input);
    if (checked.id !== id) throw new Error(`Set "id" to "${id}".`);
    // A late duplicate's photos count too: its empty-slot photos join the
    // kept product (view.ts).
    const duplicates = ((await loadLines(batch))?.lines ?? []).flatMap((line) =>
      line.products
        .filter((member) => member.duplicateOf === id)
        .map((member) => member.id),
    );
    const known = new Set(
      (
        await Promise.all(
          [id, ...duplicates].map(async (owner) => [
            ...productPhotos(await loadProduct(batch, owner)),
          ]),
        )
      ).flat(),
    );
    const unknown = checked.photosUsed.filter((photo) => !known.has(photo));
    if (unknown.length)
      throw new Error(`Not photos of ${id}: ${unknown.join(", ")}.`);
    saved = checked;
  }
  await writeJson(runFile(batch, stage, `${id}.json`), saved);
  console.log(`Saved ${stage}/${id}.`);
}

/** The products of a lines or check bin, one line each. */
export async function listBin(batch: Batch, stage: Stage, bin: string) {
  const plan = await readJson(runFile(batch, "bins.json"), binPlan);
  const members = stage === "lines" ? plan.lines[bin] : plan.check[bin];
  if (!members) throw new Error(`There is no ${stage} bin "${bin}".`);
  const repeats = await decidedRepeats(batch);
  const brands = new Set<string>();
  for (const id of members) {
    const product = await loadProduct(batch, id);
    brands.add(product.brand);
    const repeat = repeats.get(id);
    console.log(
      `${id}${repeat ? ` · ALREADY IN AN EARLIER BATCH as ${repeat.earlierBrand} · ${repeat.earlierName}` : ""} · ${product.brand} · ${product.name}${product.lineName ? ` · line guess "${product.lineName}"` : ""}${product.flavor ? ` · flavor guess "${product.flavor}"` : ""}${product.sizes.length ? ` · ${product.sizes.join(", ")}` : ""} · package says ${product.label.replace(/_/g, " ")}${product.labelEvidence ? ` (${product.labelEvidence})` : ""} · front ${product.photos.front ? photoFile(batch, product.photos.front, "thumbnail") : "none"}`,
    );
  }
  if (stage === "lines") {
    const earlier = await earlierLines(batch, [...brands]);
    if (earlier.length)
      console.log(
        `Lines an earlier batch already has for these brands (reuse their names and foods):\n${earlier
          .map(
            (line) =>
              `  ${line.brand} · "${line.lineName}" · ${line.food} · flavors: ${line.flavors.join(", ")}`,
          )
          .join("\n")}`,
      );
    const prefix = `${bin}-`;
    const sheets = (await readdir(runFile(batch, "sheets")))
      .filter((name) => name.startsWith(prefix))
      .sort();
    console.log(
      `Front sheets, in order:\n${sheets.map((name) => `  ${runFile(batch, "sheets", name)}`).join("\n")}`,
    );
  }
}

/** A product's identity, line, label and photos, with paths and scores. */
export async function show(batch: Batch, id: string) {
  const [product, { photos }, lines] = await Promise.all([
    loadProduct(batch, id),
    loadIndex(batch),
    loadLines(batch),
  ]);
  const entry = new Map(photos.map((photo) => [photo.name, photo]));
  const line = (label: string, photo: string) => {
    const scores = entry.get(photo);
    return `  ${label}: ${photoFile(batch, photo)}${scores ? ` (${scores.width}×${scores.height}, sharp ${scores.sharpness}, glare ${Math.round(scores.glare * 100)}%)` : ""}`;
  };
  console.log(`Product ${product.id}`);
  const recipe = lines?.lines.find((candidate) =>
    candidate.products.some((member) => member.id === id),
  );
  const member = recipe?.products.find((candidate) => candidate.id === id);
  if (recipe)
    console.log(
      `  ${product.brand} · ${product.name} · line "${recipe.lineName}" · ${member?.flavor ? `flavor "${member.flavor}"` : "the line's original"} · ${recipe.food ? `food ${FOODS.get(recipe.food)}` : recipe.newFood ? `suggested new food ${recipe.newFood.name}` : `out of scope (${recipe.outOfScope?.suggestedFood})`}${member?.risk ? ` · risk ${member.risk.level}: ${member.risk.reason}` : ""}`,
    );
  else
    console.log(
      `  ${product.brand} · ${product.name}${product.lineName ? ` · line guess "${product.lineName}"` : ""}${product.flavor ? ` · flavor guess "${product.flavor}"` : ""}`,
    );
  console.log(
    `  Package says: ${product.label.replace(/_/g, " ")}${product.labelEvidence ? ` (${product.labelEvidence})` : ""}`,
  );
  if (product.sizes.length)
    console.log(`  Sizes seen: ${product.sizes.join(", ")}`);
  console.log(
    `  Visits: ${product.visits.join(", ")} · confidence ${product.confidence}`,
  );
  for (const note of product.notes) console.log(`  Note: ${note}`);
  console.log("Chosen photos:");
  for (const slot of SLOTS)
    if (product.photos[slot]) console.log(line(slot, product.photos[slot]));
  for (const photo of product.other) console.log(line("other", photo));
  const alternates = Object.entries(product.alternates).flatMap(
    ([slot, list]) => list.map((photo) => line(`alternate ${slot}`, photo)),
  );
  if (alternates.length)
    console.log(`Alternates (best first):\n${alternates.join("\n")}`);
}

/**
 * Both sides of a possible duplicate, for the reconcile agents; given a bin
 * ("pairs-01"), every pair in it.
 */
export async function pair(batch: Batch, id: string) {
  if (id.startsWith("repeat")) return describeRepeats(batch, id);
  const plan = await readJson(runFile(batch, "merge.json"), mergePlan);
  const ids = plan.bins[id] ?? [id];
  for (const pairId of ids) {
    describePair(batch, plan, pairId);
    console.log("");
  }
}

function describePair(
  batch: Batch,
  plan: z.output<typeof mergePlan>,
  id: string,
) {
  const candidate = plan.candidates.find((entry) => entry.id === id);
  if (!candidate) throw new Error(`No pair ${id}.`);
  console.log(`${candidate.id} (${candidate.kind}): ${candidate.reason}`);
  console.log(`Sheet: ${candidate.sheet}`);
  const describe = (side: string, groupId: string) => {
    const group = plan.groups.find((entry) => entry.id === groupId)!;
    console.log(
      `${side}: ${group.brand} · ${group.name}${group.lineName ? ` · line "${group.lineName}"` : ""}${group.flavor ? ` · flavor "${group.flavor}"` : ""}${group.size ? ` · ${group.size}` : ""} (${group.confidence})`,
    );
    for (const slot of SLOTS)
      if (group.photos[slot])
        console.log(`  ${slot}: ${photoFile(batch, group.photos[slot])}`);
    for (const photo of group.photos.other)
      console.log(`  other: ${photoFile(batch, photo)}`);
  };
  if (candidate.kind === "brand")
    for (const [side, key] of [
      ["A", candidate.a],
      ["B", candidate.b],
    ] as const) {
      const brand = plan.brands.find((entry) => entry.key === key)!;
      console.log(
        `${side}: brand "${brand.name}" (${brand.groups} groups; spellings: ${brand.variants.join(", ")})`,
      );
      for (const group of plan.groups
        .filter((g) => g.brandKey === key)
        .slice(0, 3))
        describe(`  ${side} example`, group.id);
    }
  else {
    describe("A", candidate.a);
    describe("B", candidate.b);
  }
}

/** A repeats bin ("repeats-01") or one pair, both sides with photo paths. */
async function describeRepeats(batch: Batch, id: string) {
  const plan = await loadRepeatPlan(batch);
  if (!plan) throw new Error("Run repeats first.");
  const earlier = earlierBatch(plan);
  const moved = await movedPhotos(earlier);
  const ids = plan.bins[id] ?? [id];
  const sides = async (label: string, from: Batch, productId: string) => {
    const product = await loadProduct(from, productId);
    console.log(
      `${label}: ${product.brand} · ${product.name}${product.flavor ? ` · flavor "${product.flavor}"` : ""}${product.sizes.length ? ` · ${product.sizes.join(", ")}` : ""}`,
    );
    for (const slot of SLOTS) {
      const photo = product.photos[slot];
      if (photo)
        console.log(
          `  ${slot}: ${from === earlier ? `${earlier.web}/${moved.get(photo) ? `${moved.get(photo)}/` : ""}full/${photo}` : photoFile(from, photo)}`,
        );
    }
  };
  for (const pairId of ids) {
    const entry = plan.pairs.find((candidate) => candidate.id === pairId);
    if (!entry) throw new Error(`No pair ${pairId}.`);
    console.log(`${entry.id}: ${entry.reason}\nSheet: ${entry.sheet}`);
    await sides("NEW", batch, entry.product);
    await sides("EARLIER", earlier, entry.earlier);
    console.log("");
  }
}

/** Records the store for each visit, e.g. `stores <web> 1=Walmart 2=unknown`. */
export async function stores(batch: Batch, assignments: string[]) {
  const current = (await readJsonIfPresent(
    runFile(batch, "stores.json"),
    storeChoice,
  )) ?? {
    visits: {},
  };
  for (const assignment of assignments) {
    const match = /^(\d+)=(.+)$/.exec(assignment);
    if (!match) throw new Error(`Use visit=store, not "${assignment}".`);
    current.visits[match[1]!] = match[2]!.trim();
  }
  await writeJson(runFile(batch, "stores.json"), parse(storeChoice, current));
  for (const [visit, store] of Object.entries(current.visits))
    console.log(`Visit ${visit}: ${store}`);
}
