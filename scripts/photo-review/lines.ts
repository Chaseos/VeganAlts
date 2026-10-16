import { normalizeName } from "../../server/community/domain/policy";
import {
  type Batch,
  loadProduct,
  readJson,
  readJsonIfPresent,
  result,
  runFile,
  savedIds,
  writeJson,
} from "./batch";
import { brandKey } from "./identity";
import {
  AISLES,
  binPlan,
  checkResult,
  correction,
  FOODS,
  type LineDecision,
  type LineRecord,
  linesFile,
  type PackageLabel,
  linesResult,
  type ProductRecord,
} from "./schema";
import { decidedRepeats } from "./repeats";
import { sheet } from "./sheets";

// Recipe lines (milestone 7): the Lines agents group each brand's products
// into lines with one food each and give a risk level to products whose
// package says neither vegan nor plant-based. `scope` records the lines in
// lines.json and bins the high-risk, in-scope products for an ingredient
// check; `rescope` adds check bins after the owner's corrections.

const binName = (prefix: string, index: number) =>
  `${prefix}-${String(index + 1).padStart(2, "0")}`;

/**
 * Bins that never split a brand, so one agent sees all of a brand's
 * products; a brand larger than `size` gets a bin of its own.
 */
export function binsByBrand(
  products: readonly { id: string; brand: string }[],
  size: number,
  prefix: string,
) {
  const byBrand = new Map<string, string[]>();
  for (const product of [...products].sort(
    (a, b) => a.brand.localeCompare(b.brand) || a.id.localeCompare(b.id),
  ))
    byBrand.set(product.brand, [
      ...(byBrand.get(product.brand) ?? []),
      product.id,
    ]);
  const bins: string[][] = [];
  for (const ids of byBrand.values()) {
    const current = bins.at(-1);
    if (current && current.length + ids.length <= size) current.push(...ids);
    else bins.push([...ids]);
  }
  return Object.fromEntries(
    bins.map((ids, index) => [binName(prefix, index), ids]),
  );
}

/** Bins in capture order (product ids are photo names, so they sort by time). */
export function binsInOrder(
  ids: readonly string[],
  size: number,
  prefix: string,
) {
  const sorted = [...ids].sort();
  const bins: Record<string, string[]> = {};
  for (let start = 0; start < sorted.length; start += size)
    bins[binName(prefix, start / size)] = sorted.slice(start, start + size);
  return bins;
}

// Foods the owner keeps apart from their plain versions (2026-10-15).
const SEPARATE_FOODS = [
  { food: "milk", pattern: /chocolate|cocoa/i, belongs: "chocolate-milk" },
  { food: "yogurt", pattern: /greek/i, belongs: "greek-yogurt" },
];

/** Problems with a Lines agent's decisions for its bin; empty when sound. */
export function checkLines(
  decisions: readonly LineDecision[],
  ids: readonly string[],
  info: ReadonlyMap<
    string,
    { brand: string; name: string; label: PackageLabel }
  >,
) {
  const problems: string[] = [];
  const expected = new Set(ids);
  const placed = new Map<string, string>();
  // The site matches line names loosely ("Almond Milk" is "Almondmilk"), so
  // two lines of one brand in one food need clearly different names.
  const names = new Map<string, string>();
  for (const line of decisions) {
    const brand = info.get(line.products[0]!.id)?.brand ?? "";
    const key = `${brandKey(brand)}|${normalizeName(line.lineName).replace(/\s+/g, "")}|${line.food ?? line.newFood?.name ?? line.outOfScope?.suggestedFood}`;
    if (names.has(key))
      problems.push(
        `"${names.get(key)}" and "${line.lineName}" read as the same ${brand} line; merge them, or name each by what sets it apart (for example "Organic Almond Milk, Bottled").`,
      );
    else names.set(key, line.lineName);
  }
  for (const line of decisions) {
    for (const { id } of line.products) {
      if (!expected.has(id)) problems.push(`${id} is not in this bin.`);
      else if (placed.has(id))
        problems.push(
          `${id} is in both "${placed.get(id)}" and "${line.lineName}".`,
        );
      else placed.set(id, line.lineName);
    }
    const brands = new Set(line.products.map(({ id }) => info.get(id)?.brand));
    if (brands.size > 1)
      problems.push(
        `"${line.lineName}" mixes brands (${[...brands].join(", ")}); a line is one brand.`,
      );
    for (const rule of SEPARATE_FOODS)
      if (line.food === rule.food)
        for (const product of line.products)
          if (
            rule.pattern.test(
              `${info.get(product.id)?.name ?? ""} ${product.flavor ?? ""}`,
            )
          )
            problems.push(
              `${product.id} looks like ${rule.belongs}, which is its own food and line, not ${rule.food}.`,
            );
    // Only products whose package says neither vegan nor plant-based get a
    // risk level, and in scope every one of them needs it (owner, 2026-10-15).
    for (const product of line.products) {
      if (product.duplicateOf) continue;
      const label = info.get(product.id)?.label;
      if (product.risk && label !== "appears_plant_based")
        problems.push(
          `${product.id}'s package says ${label?.replace("_", " ")}; only "appears plant-based" products get a risk level.`,
        );
      if (!line.outOfScope && !product.risk && label === "appears_plant_based")
        problems.push(
          `${product.id} says neither vegan nor plant-based; give it a risk level.`,
        );
    }
  }
  const missing = ids.filter((id) => !placed.has(id));
  if (missing.length)
    problems.push(
      `Place every product in a line; missing: ${missing.join(", ")}.`,
    );
  return problems;
}

/** Front-photo sheets for a Lines bin. */
export async function linesSheets(
  batch: Batch,
  bin: string,
  products: readonly ProductRecord[],
) {
  const tiles = products.map((product) => ({
    photo:
      product.photos.front ??
      Object.values(product.photos)[0] ??
      product.other[0],
    caption:
      `${product.id.slice(13)} · ${product.name}${product.flavor && !product.name.includes(product.flavor) ? ` · ${product.flavor}` : ""}`.slice(
        0,
        46,
      ),
  }));
  const sheets: string[] = [];
  for (let start = 0; start < tiles.length; start += 12) {
    const path = runFile(
      batch,
      "sheets",
      `${bin}-${String(start / 12 + 1).padStart(2, "0")}.jpg`,
    );
    await sheet(batch, tiles.slice(start, start + 12), 4, path);
    sheets.push(path);
  }
  return sheets;
}

export const loadLines = (batch: Batch) =>
  readJsonIfPresent(runFile(batch, "lines.json"), linesFile);

const lineKey = (line: LineRecord) =>
  `${brandKey(line.brand)}|${normalizeName(line.lineName)}|${line.food ?? (line.newFood ? `new:${normalizeName(line.newFood.name)}` : `out:${normalizeName(line.outOfScope!.suggestedFood)}`)}`;
const foodKey = (name: string) => normalizeName(name).replace(/e?s$/, "");

/**
 * In-scope, high-risk products: the only ones whose ingredients are checked.
 * A product an earlier batch already has is not checked again.
 */
const highRisk = (
  lines: readonly LineRecord[],
  repeats: ReadonlySet<string> = new Set(),
) =>
  lines.flatMap((line) =>
    !line.outOfScope
      ? line.products.filter(
          (member) =>
            !member.duplicateOf &&
            !repeats.has(member.id) &&
            member.risk?.level === "high",
        )
      : [],
  );

/** `scope`: lines.json, then check bins for in-scope, high-risk products. */
export async function scope(batch: Batch, options: { checkSize: number }) {
  const fail = (problems: string[]): never => {
    result({ ok: false, problems });
    throw new Error(problems.join("\n"));
  };
  const bins = await readJson(runFile(batch, "bins.json"), binPlan);
  const decided = new Set(await savedIds(batch, "lines"));
  const missing = Object.keys(bins.lines).filter((bin) => !decided.has(bin));
  if (missing.length) fail([`Lines not decided yet: ${missing.join(", ")}`]);
  const products = new Map<string, ProductRecord>();
  for (const id of await savedIds(batch, "products"))
    products.set(id, await loadProduct(batch, id));
  const lines: LineRecord[] = [];
  for (const bin of Object.keys(bins.lines)) {
    const decision = await readJson(
      runFile(batch, "lines", `${bin}.json`),
      linesResult,
    );
    for (const line of decision.lines)
      lines.push({
        id: `line-${String(lines.length + 1).padStart(3, "0")}`,
        brand: products.get(line.products[0]!.id)!.brand,
        ...line,
      });
  }
  // One recipe line, one record, even when bins were decided separately.
  const seen = new Map<string, string>();
  const problems: string[] = [];
  for (const line of lines) {
    const key = lineKey(line);
    if (seen.has(key))
      problems.push(
        `${line.brand} "${line.lineName}" is decided twice (${seen.get(key)} and ${line.id}); merge them in one lines bin.`,
      );
    seen.set(key, line.id);
  }
  const placed = new Set(
    lines.flatMap((line) => line.products.map((p) => p.id)),
  );
  const unplaced = [...products.keys()].filter((id) => !placed.has(id));
  if (unplaced.length)
    problems.push(`Not in any line: ${unplaced.join(", ")}.`);
  if (problems.length) fail(problems);
  await writeJson(runFile(batch, "lines.json"), linesFile.parse({ lines }));
  const repeated = new Set((await decidedRepeats(batch)).keys());

  const inScope = lines.flatMap((line) =>
    !line.outOfScope
      ? line.products.filter((member) => !member.duplicateOf)
      : [],
  );
  const check = binsInOrder(
    highRisk(lines, repeated).map(({ id }) => id),
    options.checkSize,
    "check",
  );
  await writeJson(
    runFile(batch, "bins.json"),
    binPlan.parse({ lines: bins.lines, check }),
  );
  const risks = new Map<string, number>();
  for (const member of inScope)
    if (member.risk)
      risks.set(member.risk.level, (risks.get(member.risk.level) ?? 0) + 1);

  const outLines = lines.filter((line) => line.outOfScope);
  const byFood = new Map<string, number>();
  for (const line of outLines)
    byFood.set(
      line.outOfScope!.suggestedFood,
      (byFood.get(line.outOfScope!.suggestedFood) ?? 0) + line.products.length,
    );
  const suggested = new Map<string, { products: number; aisle: string }>();
  for (const line of lines.filter((l) => l.newFood)) {
    const { name, aisle, newAisle } = line.newFood!;
    suggested.set(name, {
      products: (suggested.get(name)?.products ?? 0) + line.products.length,
      aisle: aisle ? AISLES.get(aisle)! : `new aisle ${newAisle}`,
    });
  }
  // Near-identical names would scatter one food across folders, or one
  // suggested food across several.
  const variants = [byFood.keys(), suggested.keys()].flatMap((names) => {
    const spellings = new Map<string, Set<string>>();
    for (const food of names)
      spellings.set(
        foodKey(food),
        new Set([...(spellings.get(foodKey(food)) ?? []), food]),
      );
    return [...spellings.values()].filter((group) => group.size > 1);
  });
  const foods = new Map<string, number>();
  for (const line of lines.filter((l) => l.food))
    foods.set(
      FOODS.get(line.food!)!,
      (foods.get(FOODS.get(line.food!)!) ?? 0) + 1,
    );
  const duplicates = lines.flatMap((line) =>
    line.products.filter((p) => p.duplicateOf),
  ).length;
  console.log(
    `${lines.length} lines: ${lines.length - outLines.length} in scope (${inScope.length} products, ${lines.filter((l) => l.newFood).length} lines under suggested new foods), ${outLines.length} out of scope; ${duplicates} late duplicates folded in.`,
  );
  console.log(
    `Risk flags: ${["high", "medium", "low"].map((level) => `${risks.get(level) ?? 0} ${level}`).join(", ")}; ${highRisk(lines, repeated).length} high-risk products to check in ${Object.keys(check).length} bins.`,
  );
  console.log(
    `In scope by food: ${[...foods].map(([food, count]) => `${food} ${count}`).join(", ")}`,
  );
  console.log(
    `Suggested new foods: ${[...suggested].map(([food, { products: count, aisle }]) => `${food} ${count} (${aisle})`).join(", ") || "none"}`,
  );
  console.log(
    `Out of scope: ${[...byFood].map(([food, count]) => `${food} ${count}`).join(", ") || "none"}`,
  );
  const warnings = variants.map(
    (names) =>
      `One food spelled several ways (unify with corrections before moving): ${[...names].join(" / ")}`,
  );
  for (const warning of warnings) console.log(`Warning: ${warning}`);
  result({
    ok: true,
    lines: lines.length,
    inScope: inScope.length,
    outOfScope: [...products.keys()].length - inScope.length - duplicates,
    bins: Object.keys(check),
    problems: warnings,
  });
}

/**
 * `rescope`: after owner corrections, check bins (check-x01 …) for in-scope,
 * high-risk products that have no check yet, beside the existing bins.
 */
export async function rescope(batch: Batch, options: { checkSize: number }) {
  const [bins, lines] = await Promise.all([
    readJson(runFile(batch, "bins.json"), binPlan),
    loadLines(batch),
  ]);
  if (!lines) throw new Error("Run scope first.");
  const repeated = new Set((await decidedRepeats(batch)).keys());
  const binned = new Set(Object.values(bins.check).flat());
  const wanted: string[] = [];
  for (const line of lines.lines)
    for (const member of line.products) {
      if (
        member.duplicateOf ||
        binned.has(member.id) ||
        repeated.has(member.id)
      )
        continue;
      const [record, fix, checked] = await Promise.all([
        loadProduct(batch, member.id),
        readJsonIfPresent(
          runFile(batch, "corrections", `${member.id}.json`),
          correction,
        ),
        readJsonIfPresent(
          runFile(batch, "check", `${member.id}.json`),
          checkResult,
        ),
      ]);
      // The owner's label wins: a package corrected to vegan or plant-based
      // needs no check, whatever risk the line gave it.
      if ((fix?.label ?? record.label) !== "appears_plant_based" || fix?.skip)
        continue;
      const inScope = fix?.food
        ? true
        : fix?.outOfScope
          ? false
          : !line.outOfScope;
      const level = fix?.risk ?? member.risk?.level;
      if (inScope && level === "high" && !checked) wanted.push(member.id);
    }
  const used = Object.keys(bins.check).filter((name) =>
    name.startsWith("check-x"),
  ).length;
  const fresh = Object.fromEntries(
    Object.values(binsInOrder(wanted, options.checkSize, "check")).map(
      (ids, index) => [
        `check-x${String(used + index + 1).padStart(2, "0")}`,
        ids,
      ],
    ),
  );
  await writeJson(
    runFile(batch, "bins.json"),
    binPlan.parse({ lines: bins.lines, check: { ...bins.check, ...fresh } }),
  );
  console.log(
    `${wanted.length} high-risk products to check in ${Object.keys(fresh).length} new bins.`,
  );
  result({ ok: true, bins: Object.keys(fresh) });
}
