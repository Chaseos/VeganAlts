import { createHash } from "node:crypto";
import { basename } from "node:path";
import {
  type Batch,
  loadProduct,
  readJsonIfPresent,
  runFile,
  savedIds,
} from "./batch";
import { loadLines } from "./lines";
import { loadIndex } from "./photos";
import { decidedRepeats, loadCarried, type Repeat } from "./repeats";
import {
  type CheckResult,
  checkResult,
  type Correction,
  correction,
  FOODS,
  LABEL_RANK,
  type LineRecord,
  MANUFACTURER_LABEL,
  matchFile,
  mergePlan,
  type PackageLabel,
  type ProductRecord,
  type SetAsideEntry,
  setAsideChanges,
  setAsideFile,
  SLOTS,
  storeChoice,
  visitsFile,
} from "./schema";

// One product as the owner reviews it: the sorted record, its recipe line,
// the package label, the risk flag and ingredient check, and the owner's
// corrections on top.

export interface ProductView {
  id: string;
  record: ProductRecord;
  line?: LineRecord;
  correction?: Correction;
  skip: boolean;
  // Another product in the same line this one duplicates.
  duplicateOf?: string;
  brand: string;
  lineName?: string;
  flavor?: string;
  name: string;
  sizes: string[];
  photos: ProductRecord["photos"];
  food?: string;
  // A plant-based alternative no site food fits yet: the food to add.
  newFood?: LineRecord["newFood"];
  // What an out-of-scope product is (it replaces no animal product).
  outOfScope?: string;
  outOfScopeReason?: string;
  label: PackageLabel;
  // Where the package's claim was seen; dropped when the owner corrects the
  // label, since it describes the old one.
  labelEvidence?: string;
  manufacturerLabel: string;
  risk?: { level: string; reason: string };
  check?: CheckResult;
  stores: string[];
  catalog: string;
  flags: string[];
}

/** Reviewed line IDs, with owner corrections resolved against this batch. */
export function reviewLineIds(views: readonly ProductView[]) {
  const drafts = views.map((view) => {
    const placement = view.food ?? view.newFood?.name ?? view.outOfScope ?? "";
    const line = view.line;
    return {
      id: view.id,
      key: `${view.brand}\u0000${view.lineName ?? view.name}\u0000${placement}`,
      original:
        line &&
        line.brand === view.brand &&
        line.lineName === view.lineName &&
        (line.food ?? line.newFood?.name ?? line.outOfScope?.suggestedFood) ===
          placement
          ? line.id
          : undefined,
    };
  });
  const originals = new Map<string, Set<string>>();
  for (const { key, original } of drafts)
    if (original)
      originals.set(key, (originals.get(key) ?? new Set()).add(original));
  return new Map(
    drafts.map(({ id, key, original }) => {
      const matching = originals.get(key);
      // A corrected product joins an existing line only when its name is unambiguous.
      const lineId =
        original ??
        (matching?.size === 1 ? [...matching][0] : undefined) ??
        `line-${createHash("sha1").update(key).digest("hex").slice(0, 8)}`;
      return [id, lineId];
    }),
  );
}

type MatchEntry = {
  brand?: string;
  name?: string;
  candidates?: { name: string; brand: string | null; exact: boolean }[];
  error?: string;
};

function catalogStatus(
  found: MatchEntry | undefined,
  brand: string,
  name: string,
) {
  if (!found) return "catalog not checked";
  // A check made before the owner renamed the product no longer applies.
  if (
    (found.brand !== undefined && found.brand !== brand) ||
    (found.name !== undefined && found.name !== name)
  )
    return "catalog not checked (renamed since the check)";
  if (found.error) return `catalog check failed: ${found.error}`;
  const exact = found.candidates?.find((candidate) => candidate.exact);
  if (exact) return `existing: ${exact.brand ?? ""} ${exact.name}`.trim();
  if (found.candidates?.length)
    return `possible duplicate: ${found.candidates
      .map((candidate) => `${candidate.brand ?? ""} ${candidate.name}`.trim())
      .join("; ")}`;
  return "new";
}

/**
 * What needs the owner's action. Risk levels are shown on each product but
 * are not flags: only a high-risk check that found something, could not be
 * read or had no photo needs a look (owner, 2026-10-15). Catalog matches
 * and out-of-scope products have their own sections.
 */
function flagsFor(view: ProductView) {
  const flags: string[] = [];
  if (!view.photos.front) flags.push("no front photo");
  if (!view.food && !view.newFood && !view.outOfScope)
    flags.push("not placed in a line yet");
  if (view.outOfScope || view.label !== "appears_plant_based") return flags;
  if (!view.risk) flags.push("appears plant-based; risk not set");
  else if (view.risk.level === "high") {
    if (!view.check) flags.push("high risk; ingredients not checked yet");
    else if (view.check.result === "animal_ingredients")
      flags.push(
        `animal ingredients on the label: ${view.check.animalIngredients.join(", ")}`,
      );
    else if (view.check.result === "unclear")
      flags.push("high risk; ingredient check unclear");
    else if (view.check.result === "no_ingredient_photo")
      flags.push("high risk; no ingredient photo to check");
  }
  return flags;
}

export const productPhotos = (record: ProductRecord) => [
  ...Object.values(record.photos),
  ...Object.values(record.alternates).flat(),
  ...record.other,
];

export type SetAsideItem = SetAsideEntry & {
  // The product the photo belongs to, so `set-aside --undo <id>` finds it.
  product?: string;
};

export async function loadRun(batch: Batch) {
  const [index, lines, choices, matches, plan, visits, baseSetAside, changes] =
    await Promise.all([
      loadIndex(batch),
      loadLines(batch),
      readJsonIfPresent(runFile(batch, "stores.json"), storeChoice),
      readJsonIfPresent(runFile(batch, "matches.json"), matchFile),
      readJsonIfPresent(runFile(batch, "merge.json"), mergePlan),
      readJsonIfPresent(runFile(batch, "visits.json"), visitsFile),
      readJsonIfPresent(runFile(batch, "setaside.json"), setAsideFile),
      readJsonIfPresent(
        runFile(batch, "corrections", "setaside.json"),
        setAsideChanges,
      ),
    ]);
  const [repeatOf, carried] = await Promise.all([
    decidedRepeats(batch),
    loadCarried(batch),
  ]);
  const problems: string[] = [];
  const lineOf = new Map<string, LineRecord>();
  for (const line of lines?.lines ?? [])
    for (const { id } of line.products) lineOf.set(id, line);
  const ids = await savedIds(batch, "products");
  const all = await Promise.all(
    ids.map(async (id) => {
      const [record, check, fix] = await Promise.all([
        loadProduct(batch, id),
        readJsonIfPresent(runFile(batch, "check", `${id}.json`), checkResult),
        readJsonIfPresent(
          runFile(batch, "corrections", `${id}.json`),
          correction,
        ),
      ]);
      if (fix && fix.id !== id)
        problems.push(
          `corrections/${id}.json says "id": "${fix.id}"; it applies to ${id}.`,
        );
      const line = lineOf.get(id);
      const member = line?.products.find((candidate) => candidate.id === id);
      const outOfScope = fix?.food
        ? undefined
        : (fix?.outOfScope ?? line?.outOfScope?.suggestedFood);
      const label = fix?.label ?? record.label;
      const risk =
        label !== "appears_plant_based"
          ? undefined
          : fix?.risk
            ? { level: fix.risk, reason: fix.riskReason ?? "Set by the owner." }
            : member?.risk;
      // A line decides the flavor: no flavor means the line's original.
      const flavor = fix?.flavor ?? (line ? member?.flavor : record.flavor);
      const view: ProductView = {
        id,
        record,
        line,
        correction: fix,
        skip: fix?.skip ?? false,
        duplicateOf: member?.duplicateOf,
        brand: fix?.brand ?? record.brand,
        lineName: fix?.lineName ?? line?.lineName ?? record.lineName,
        flavor,
        name: fix?.name ?? record.name,
        sizes: fix?.sizes ?? record.sizes,
        photos: { ...record.photos },
        food: outOfScope ? undefined : (fix?.food ?? line?.food),
        newFood: outOfScope || fix?.food ? undefined : line?.newFood,
        outOfScope,
        outOfScopeReason: fix?.outOfScope
          ? "Moved out of scope by the owner."
          : line?.outOfScope?.reason,
        label,
        labelEvidence:
          fix?.labelEvidence ??
          (label === record.label ? record.labelEvidence : undefined),
        manufacturerLabel: MANUFACTURER_LABEL[label],
        risk,
        check,
        stores: [
          ...new Set([
            ...record.visits
              .map((visit) => choices?.visits[String(visit)])
              .filter(
                (store): store is string => !!store && store !== "unknown",
              ),
            ...(fix?.alsoFoundAt ?? []),
            ...(carried.get(id) ?? []),
          ]),
        ],
        catalog: catalogStatus(
          matches?.[id],
          fix?.brand ?? record.brand,
          fix?.name ?? record.name,
        ),
        flags: [],
      };
      view.flags = flagsFor(view);
      return view;
    }),
  );
  const known = new Set(ids);
  for (const fixed of await savedIds(batch, "corrections"))
    if (fixed !== "setaside" && !known.has(fixed))
      problems.push(
        `corrections/${fixed}.json matches no product of this run; check the file name.`,
      );

  // A late duplicate folds into the product it duplicates, the way build
  // merges duplicates: the kept product takes its stores, sizes, a stronger
  // package label and any slot it lacks, and the rest of its photos are set
  // aside as duplicates of the kept photos.
  const byId = new Map(all.map((view) => [view.id, view]));
  const folded: SetAsideItem[] = [];
  for (const view of all.filter((candidate) => candidate.duplicateOf)) {
    const target = byId.get(view.duplicateOf!);
    if (!target) {
      problems.push(
        `${view.id} duplicates ${view.duplicateOf}, which is not a product of this run.`,
      );
      continue;
    }
    target.stores = [...new Set([...target.stores, ...view.stores])];
    if (!target.correction?.sizes)
      target.sizes = [...new Set([...target.sizes, ...view.sizes])];
    if (
      !target.correction?.label &&
      LABEL_RANK[view.label] < LABEL_RANK[target.label]
    ) {
      target.label = view.label;
      target.labelEvidence = view.labelEvidence;
      target.manufacturerLabel = MANUFACTURER_LABEL[view.label];
      if (view.label !== "appears_plant_based") target.risk = undefined;
    }
    const filled = new Set<string>();
    for (const slot of SLOTS) {
      const photo = view.photos[slot];
      if (photo && !target.photos[slot]) {
        target.photos[slot] = photo;
        filled.add(photo);
      }
    }
    target.flags = flagsFor(target);
    const anchor =
      target.photos.front ??
      SLOTS.map((slot) => target.photos[slot]).find(Boolean) ??
      productPhotos(target.record)[0];
    for (const photo of productPhotos(view.record)) {
      if (filled.has(photo)) continue;
      const slot = SLOTS.find((name) => view.record.photos[name] === photo);
      const kept = (slot && target.photos[slot]) || anchor;
      folded.push({
        photo,
        reason: "duplicate",
        ...(kept ? { duplicateOf: kept } : {}),
        product: target.id,
      });
    }
  }
  // A product an earlier batch already has leaves the list; its photos are
  // set aside as duplicates of that batch's product.
  const repeats: { view: ProductView; repeat: Repeat }[] = [];
  for (const view of all) {
    const repeat = repeatOf.get(view.id);
    if (!repeat || view.duplicateOf) continue;
    repeats.push({ view, repeat });
    for (const photo of new Set([
      ...productPhotos(view.record),
      ...SLOTS.map((slot) => view.photos[slot]).filter(
        (photo): photo is string => !!photo,
      ),
    ]))
      folded.push({
        photo,
        reason: "duplicate",
        note: `Already in ${basename(repeat.earlierWeb)}: ${repeat.earlierBrand} · ${repeat.earlierName}`,
        product: view.id,
      });
  }
  const views = all.filter(
    (view) => !view.duplicateOf && !repeatOf.has(view.id),
  );

  // Photos a product shows are never set aside, and a listed out-of-scope
  // product's photos go to the out-of-scope folder instead.
  const keep = new Set(changes?.keep ?? []);
  const shown = new Map<string, string>();
  for (const view of views) {
    for (const slot of SLOTS)
      if (view.photos[slot]) shown.set(view.photos[slot], view.id);
    if (view.outOfScope && !view.skip) {
      for (const photo of productPhotos(view.record)) keep.add(photo);
      continue;
    }
    for (const slot of SLOTS)
      if (view.photos[slot]) keep.add(view.photos[slot]);
    for (const photo of [
      ...view.record.other,
      ...(view.check?.photosUsed ?? []),
    ])
      keep.add(photo);
  }
  // Each photo's product, for per-product undo of set-aside moves.
  const ownerOf = new Map<string, string>();
  for (const view of all)
    for (const photo of productPhotos(view.record))
      ownerOf.set(photo, view.duplicateOf ?? view.id);
  const listed = new Map<string, SetAsideItem>();
  // The owner's additions apply last and win, except over a photo a listed
  // product shows in a slot; that is reported instead.
  for (const entry of changes?.add ?? []) {
    if (shown.has(entry.photo)) {
      problems.push(
        `corrections/setaside.json sets aside ${entry.photo}, but ${shown.get(entry.photo)} shows it; correct that product first.`,
      );
      continue;
    }
    listed.set(entry.photo, entry);
  }
  for (const entry of [...(baseSetAside?.setAside ?? []), ...folded])
    if (!keep.has(entry.photo) && !listed.has(entry.photo))
      listed.set(entry.photo, entry);
  const setAside = [...listed.values()].map((entry): SetAsideItem => ({
    ...entry,
    product:
      entry.product ??
      ownerOf.get(entry.photo) ??
      (entry.duplicateOf ? ownerOf.get(entry.duplicateOf) : undefined),
  }));

  const accounted = new Set([...keep, ...listed.keys()]);
  for (const view of all)
    for (const photo of productPhotos(view.record)) accounted.add(photo);
  const unaccounted = index.photos
    .filter((photo) => !accounted.has(photo.name))
    .map((photo) => photo.name);
  return {
    views,
    repeats,
    lines: lines?.lines ?? [],
    photos: index.photos,
    setAside,
    unaccounted,
    problems,
    visits: visits?.visits ?? [],
    stores: choices?.visits ?? {},
    plan,
  };
}

export const foodName = (slug: string) => FOODS.get(slug) ?? slug;
