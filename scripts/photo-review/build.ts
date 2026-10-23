import { mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import {
  type Batch,
  moveAside,
  readJson,
  readJsonIfPresent,
  result,
  runFile,
  savedIds,
  stem,
  writeJson,
} from "./batch";
import { Clusters } from "./identity";
import { groupPhotoNames } from "./merge";
import { loadIndex } from "./photos";
import {
  binPlan,
  type MergedGroup,
  mergePlan,
  type ProductRecord,
  productRecord,
  reconcileResult,
  LABEL_RANK,
  type SetAsideEntry,
  setAsideFile,
  SLOTS,
  visitsFile,
} from "./schema";
import { binsByBrand, linesSheets } from "./lines";
import { pendingMoves } from "./move-log";
import { pickScore } from "./sharpness";

// `build`: one record per unique product, the best shot of each face kept
// and every other shot listed as an alternate (and set aside), plus the
// lines bins.

const RANK = { high: 0, medium: 1, low: 2 } as const;
const DOWNSTREAM = ["products", "lines", "check", "repeat"];

export async function build(
  batch: Batch,
  options: { linesSize: number; force: boolean },
) {
  const [{ photos }, plan] = await Promise.all([
    loadIndex(batch),
    readJson(runFile(batch, "merge.json"), mergePlan),
  ]);
  const fail = (problems: string[]): never => {
    result({ ok: false, problems });
    throw new Error(problems.join("\n"));
  };
  if (plan.blocking.length)
    fail([
      "merge reported lost, doubled or orphaned photos; fix the sort and merge again.",
      ...plan.blocking,
    ]);
  // Every bin decided, each against exactly the pairs merge gave it.
  const decisions = new Map<string, { same: boolean; name?: string }>();
  const problems: string[] = [];
  for (const [bin, pairs] of Object.entries(plan.bins)) {
    const saved = await readJsonIfPresent(
      runFile(batch, "reconcile", `${bin}.json`),
      reconcileResult,
    );
    if (!saved) {
      problems.push(`Not reconciled yet: ${bin}.`);
      continue;
    }
    const decided = saved.decisions.map((decision) => decision.pair).sort();
    if (decided.join() !== [...pairs].sort().join())
      problems.push(
        `${bin}'s decisions don't match its pairs; reconcile it again.`,
      );
    for (const decision of saved.decisions)
      decisions.set(decision.pair, decision);
  }
  if (problems.length) fail(problems);

  // Rebuilding redraws sheets from full/ and thumbnail/, and product ids can
  // change, so moved photos must come back first.
  const moves = await pendingMoves(batch);
  if (moves.length)
    fail([
      `${moves.length} photo files are moved out of full/ and thumbnail/. Undo those moves first (out-of-scope --undo, set-aside --undo).`,
    ]);
  const started = (
    await Promise.all(
      DOWNSTREAM.slice(1).map((folder) => savedIds(batch, folder)),
    )
  ).flat().length;
  if (started && !options.force)
    fail([
      "Repeats, lines or ingredient checks have already been worked on for this run. Rebuilding sets that work aside; pass --force only if that is intended.",
    ]);
  // Product ids can change on a rebuild, so everything after it starts over;
  // earlier work is moved to <run>/old, never deleted.
  for (const name of [...DOWNSTREAM, "lines.json", "repeats.json", "repeats"])
    await moveAside(batch, name);
  try {
    const stale = (await readdir(runFile(batch, "sheets"))).filter((name) =>
      name.startsWith("lines-"),
    );
    if (stale.length) {
      const folder = runFile(batch, "old", `lines-sheets-${Date.now()}`);
      await mkdir(folder, { recursive: true });
      for (const name of stale)
        await rename(runFile(batch, "sheets", name), join(folder, name));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const entry = new Map(photos.map((photo) => [photo.name, photo]));

  // Brands judged the same take the spelling the reconcile agent chose, or
  // the spelling with the most photo groups.
  const brandClusters = new Clusters();
  for (const brand of plan.brands) brandClusters.add(brand.key);
  const chosen = new Map<string, string>();
  for (const pair of plan.candidates.filter((c) => c.kind === "brand")) {
    const decision = decisions.get(pair.id);
    if (!decision?.same) continue;
    brandClusters.union(pair.a, pair.b);
    if (decision.name) {
      chosen.set(pair.a, decision.name);
      chosen.set(pair.b, decision.name);
    }
  }
  const brandByKey = new Map(plan.brands.map((brand) => [brand.key, brand]));
  const brandName = new Map<string, string>();
  for (const members of brandClusters.members()) {
    const named = members.map((key) => chosen.get(key)).find(Boolean);
    const biggest = members
      .map((key) => brandByKey.get(key)!)
      .sort((a, b) => b.groups - a.groups)[0]!;
    for (const key of members) brandName.set(key, named ?? biggest.name);
  }

  const clusters = new Clusters();
  for (const group of plan.groups) {
    clusters.add(group.id);
    clusters.union(group.cluster, group.id);
  }
  for (const pair of plan.candidates.filter((c) => c.kind === "product"))
    if (decisions.get(pair.id)?.same) clusters.union(pair.a, pair.b);

  const groupById = new Map(plan.groups.map((group) => [group.id, group]));
  const n = (photo: string) => entry.get(photo)?.n ?? Number.MAX_SAFE_INTEGER;
  const score = (photo: string) => {
    const photoEntry = entry.get(photo);
    return photoEntry ? pickScore(photoEntry) : 0;
  };
  const firstN = (group: MergedGroup) =>
    Math.min(...groupPhotoNames(group.photos).map(n));
  const products: ProductRecord[] = [];
  const setAside: SetAsideEntry[] = [...plan.setAside];
  for (const members of clusters.members()) {
    const groups = members
      .map((id) => groupById.get(id)!)
      .sort(
        (a, b) =>
          RANK[a.confidence] - RANK[b.confidence] ||
          groupPhotoNames(b.photos).length - groupPhotoNames(a.photos).length ||
          firstN(a) - firstN(b),
      );
    const primary = groups[0]!;
    // The strongest label any shot of the product showed.
    const labelled = [...groups].sort(
      (a, b) => LABEL_RANK[a.label] - LABEL_RANK[b.label],
    )[0]!;
    const owner = new Map<string, MergedGroup>();
    for (const group of groups)
      for (const photo of groupPhotoNames(group.photos))
        owner.set(photo, group);
    const kept: ProductRecord["photos"] = {};
    const alternates: ProductRecord["alternates"] = {
      front: [],
      ingredients: [],
      nutrition: [],
      back: [],
      other: groups
        .filter((group) => group !== primary)
        .flatMap((group) => group.photos.other),
    };
    for (const slot of SLOTS) {
      const shots = groups
        .flatMap((group) => (group.photos[slot] ? [group.photos[slot]] : []))
        .sort((a, b) => score(b) - score(a));
      const best = shots[0];
      if (!best) continue;
      kept[slot] = best;
      alternates[slot] = shots.slice(1);
      for (const shot of shots.slice(1))
        setAside.push({
          photo: shot,
          reason:
            owner.get(shot) === owner.get(best) ? "blurrier copy" : "duplicate",
          duplicateOf: best,
        });
    }
    const all = groups
      .flatMap((group) => groupPhotoNames(group.photos))
      .sort((a, b) => n(a) - n(b));
    const anchor = kept.front ?? all[0]!;
    for (const shot of alternates.other)
      setAside.push({ photo: shot, reason: "duplicate", duplicateOf: anchor });
    products.push({
      id: stem(anchor),
      country: "US",
      brand: brandName.get(primary.brandKey) ?? primary.brand,
      lineName: primary.lineName,
      flavor: primary.flavor,
      name: primary.name,
      label: labelled.label,
      labelEvidence: labelled.labelEvidence,
      sizes: [
        ...new Set(groups.flatMap((group) => (group.size ? [group.size] : []))),
      ],
      visits: [
        ...new Set(all.map((photo) => entry.get(photo)?.visit ?? 0)),
      ].sort((a, b) => a - b),
      photos: kept,
      alternates,
      other: primary.photos.other,
      cluster: groups.map((group) => group.id),
      confidence: primary.confidence,
      notes: [
        ...groups.flatMap((group) => (group.note ? [group.note] : [])),
        ...(groups.length > 1
          ? [`Merged ${groups.length} photo groups of this product.`]
          : []),
      ],
    });
  }

  const productFirst = (product: ProductRecord) =>
    Math.min(...[...Object.values(product.photos), ...product.other].map(n));
  products.sort((a, b) => productFirst(a) - productFirst(b));
  for (const product of products)
    await writeJson(
      runFile(batch, "products", `${product.id}.json`),
      productRecord.parse(product),
    );

  // Lines agents see a brand's products together; check bins come later
  // from `scope`, once lines and risk levels are known.
  const lines = binsByBrand(products, options.linesSize, "lines");
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const [bin, ids] of Object.entries(lines))
    await linesSheets(
      batch,
      bin,
      ids.map((id) => byId.get(id)!),
    );
  await writeJson(runFile(batch, "bins.json"), binPlan.parse({ lines }));

  const seen = new Set<string>();
  const uniqueSetAside = setAside.filter((item) => {
    if (seen.has(item.photo)) return false;
    seen.add(item.photo);
    return true;
  });
  await writeJson(
    runFile(batch, "setaside.json"),
    setAsideFile.parse({ setAside: uniqueSetAside }),
  );

  const visits = [...new Set(photos.map((photo) => photo.visit))].map(
    (visit) => {
      const members = photos.filter((photo) => photo.visit === visit);
      const proposals = new Map<
        string,
        { count: number; evidence: string[] }
      >();
      for (const hint of plan.storeHints.filter((h) => h.visit === visit)) {
        const proposal = proposals.get(hint.store) ?? {
          count: 0,
          evidence: [],
        };
        proposal.count += 1;
        if (proposal.evidence.length < 3) proposal.evidence.push(hint.evidence);
        proposals.set(hint.store, proposal);
      }
      return {
        visit,
        photos: members.length,
        first: members[0]!.n,
        last: members.at(-1)!.n,
        start: members[0]!.time,
        end: members.at(-1)!.time,
        proposals: [...proposals]
          .map(([store, proposal]) => ({ store, ...proposal }))
          .sort((a, b) => b.count - a.count),
      };
    },
  );
  await writeJson(runFile(batch, "visits.json"), visitsFile.parse({ visits }));

  console.log(
    `${products.length} products from ${plan.groups.length} photo groups; ${uniqueSetAside.length} photos set aside; ${Object.keys(lines).length} lines bins.`,
  );
  result({
    ok: true,
    products: products.length,
    bins: Object.keys(lines),
    setAside: uniqueSetAside.length,
  });
}
