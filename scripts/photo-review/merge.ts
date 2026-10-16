import { normalizeName } from "../../server/community/domain/policy";
import {
  type Batch,
  moveAside,
  readJsonIfPresent,
  result,
  runFile,
  savedIds,
  stem,
  writeJson,
} from "./batch";
import { brandKey, brandsMayMatch, productKey, tokenOverlap } from "./identity";
import { loadChunks, loadIndex, number } from "./photos";
import {
  type Candidate,
  type GroupPhotos,
  LABEL_RANK,
  type MergedGroup,
  mergePlan,
  type PackageLabel,
  type SetAsideEntry,
  SLOTS,
  type SortGroup,
  sortResult,
} from "./schema";
import { sheet } from "./sheets";

// `merge`: joins the sort agents' ranges into photo groups, settles brand
// spellings, clusters groups with the same identity key and lists possible
// duplicates for the reconcile agents, each with a side-by-side sheet.

const PAIRS_PER_BRAND = 150;
const PAIRS_PER_BIN = 40;

export const groupPhotoNames = (photos: GroupPhotos) => [
  ...SLOTS.flatMap((slot) => (photos[slot] ? [photos[slot]] : [])),
  ...photos.other,
];

interface Draft {
  id: string;
  range: string;
  brand: string;
  lineName?: string;
  flavor?: string;
  name: string;
  size?: string;
  label: PackageLabel;
  labelEvidence?: string;
  confidence: SortGroup["confidence"];
  note?: string;
  photos: GroupPhotos;
  // Label photos whose front was never found: never merged with anything.
  orphan?: boolean;
}

export async function merge(batch: Batch, options: { force: boolean }) {
  // Pair ids are renumbered on every merge, so old decisions would land on
  // different pairs: a rerun backs them up and starts reconciling again.
  if ((await savedIds(batch, "reconcile")).length && !options.force) {
    const message =
      "Duplicates have already been reconciled for this merge. Rerunning renumbers the pairs; pass --force to back up those decisions and reconcile again.";
    result({ ok: false, problems: [message] });
    throw new Error(message);
  }
  await moveAside(batch, "reconcile");
  await moveAside(batch, "pairs");
  const [{ photos }, plan] = await Promise.all([
    loadIndex(batch),
    loadChunks(batch),
  ]);
  const position = new Map(photos.map((entry) => [entry.name, entry]));
  const firstPhoto = (group: GroupPhotos) =>
    groupPhotoNames(group).sort(
      (a, b) => (position.get(a)?.n ?? 0) - (position.get(b)?.n ?? 0),
    )[0]!;
  const sorted = [];
  const missing = [];
  for (const range of plan.ranges) {
    const saved = await readJsonIfPresent(
      runFile(batch, "sort", `${range.id}.json`),
      sortResult,
    );
    if (saved) sorted.push(saved);
    else missing.push(range.id);
  }
  if (missing.length) {
    result({ ok: false, problems: [`Not sorted yet: ${missing.join(", ")}`] });
    throw new Error(`Not sorted yet: ${missing.join(", ")}`);
  }

  const problems: string[] = [];
  const setAside: SetAsideEntry[] = [];
  const drafts: Draft[] = [];
  const byFront = new Map<string, Draft>();
  const continuing: { range: string; group: SortGroup }[] = [];
  const draft = (range: string, group: SortGroup): Draft => {
    const photosCopy = structuredClone(group.photos);
    return {
      id: `g-${stem(group.photos.front ?? firstPhoto(photosCopy))}`,
      range,
      brand: group.brand ?? "Unknown",
      lineName: group.lineName,
      flavor: group.flavor,
      name: group.name ?? "Label photos without a front",
      size: group.size,
      label: group.label ?? "appears_plant_based",
      labelEvidence: group.labelEvidence,
      confidence: group.confidence,
      note: group.note,
      photos: photosCopy,
    };
  };
  for (const range of sorted) {
    setAside.push(...range.setAside);
    for (const group of range.groups) {
      if (group.continues) {
        continuing.push({ range: range.range, group });
        continue;
      }
      const entry = draft(range.range, group);
      drafts.push(entry);
      if (group.photos.front) byFront.set(group.photos.front, entry);
    }
  }
  // A front set aside as a retake points to the shot that was kept.
  const keptFor = new Map(
    setAside.flatMap((entry) =>
      entry.reason === "retake" && entry.duplicateOf
        ? [[entry.photo, entry.duplicateOf] as const]
        : [],
    ),
  );
  const structural: string[] = [];
  for (const { range, group } of continuing) {
    const front = group.continues!;
    const target = byFront.get(front) ?? byFront.get(keptFor.get(front) ?? "");
    if (!target) {
      structural.push(
        `${range}: label photos continue ${front}, which no range sorted as a front.`,
      );
      drafts.push({ ...draft(range, group), confidence: "low", orphan: true });
      continue;
    }
    for (const slot of ["ingredients", "nutrition", "back"] as const) {
      const photo = group.photos[slot];
      if (!photo) continue;
      if (target.photos[slot]) target.photos.other.push(photo);
      else target.photos[slot] = photo;
    }
    target.photos.other.push(...group.photos.other);
    // A claim seen only on the continued label shots still counts.
    if (group.label && LABEL_RANK[group.label] > LABEL_RANK[target.label]) {
      target.label = group.label;
      target.labelEvidence = group.labelEvidence;
    }
    if (group.note)
      target.note = target.note ? `${target.note} ${group.note}` : group.note;
  }

  const owners = new Map<string, string>();
  const claim = (photo: string, owner: string) => {
    if (!position.has(photo))
      structural.push(`${photo} (${owner}) is not in this run.`);
    else if (owners.has(photo))
      structural.push(`${photo} is used by ${owners.get(photo)} and ${owner}.`);
    else owners.set(photo, owner);
  };
  for (const entry of drafts)
    for (const photo of groupPhotoNames(entry.photos)) claim(photo, entry.id);
  for (const entry of setAside) claim(entry.photo, "set aside");
  const unassigned = photos.filter((entry) => !owners.has(entry.name));
  if (unassigned.length)
    structural.push(`Not assigned: ${unassigned.map(number).join(", ")}.`);

  // The most common spelling names a brand; ties go to the longer one.
  const spellings = new Map<string, Map<string, number>>();
  for (const entry of drafts) {
    const key = brandKey(entry.brand);
    const counts = spellings.get(key) ?? new Map<string, number>();
    counts.set(entry.brand, (counts.get(entry.brand) ?? 0) + 1);
    spellings.set(key, counts);
  }
  const brands = [...spellings]
    .map(([key, counts]) => {
      const ranked = [...counts].sort(
        (a, b) => b[1] - a[1] || b[0].length - a[0].length,
      );
      return {
        key,
        name: ranked[0]![0],
        variants: ranked.map(([spelling]) => spelling),
        groups: ranked.reduce((sum, [, count]) => sum + count, 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const brandName = new Map(brands.map((brand) => [brand.key, brand.name]));

  const clusterOf = new Map<string, string>();
  const groups: MergedGroup[] = drafts
    .sort(
      // A photo missing from the index sorts last; it is reported as
      // blocking above.
      (a, b) =>
        (position.get(firstPhoto(a.photos))?.n ?? Number.MAX_SAFE_INTEGER) -
        (position.get(firstPhoto(b.photos))?.n ?? Number.MAX_SAFE_INTEGER),
    )
    .map((entry) => {
      const key = brandKey(entry.brand);
      const brand = brandName.get(key)!;
      if (entry.orphan) {
        const { orphan: _, ...group } = entry;
        return { ...group, brand, brandKey: key, cluster: entry.id };
      }
      const identity = productKey(brand, entry.name, entry.flavor);
      const cluster = clusterOf.get(identity) ?? entry.id;
      clusterOf.set(identity, cluster);
      return { ...entry, brand, brandKey: key, cluster };
    });

  const candidates: Candidate[] = [];
  const nextId = () => `pair-${String(candidates.length + 1).padStart(3, "0")}`;
  const related = new Map(
    brands.map((brand) => [brand.key, new Set<string>()]),
  );
  for (const [index, a] of brands.entries())
    for (const b of brands.slice(index + 1))
      if (brandsMayMatch(a.name, b.name)) {
        candidates.push({
          id: nextId(),
          kind: "brand",
          a: a.key,
          b: b.key,
          reason: `"${a.name}" and "${b.name}" may be one brand.`,
          sheet: "",
        });
        related.get(a.key)!.add(b.key);
        related.get(b.key)!.add(a.key);
      }

  // One representative per cluster; pairs within a brand and across brands
  // that may be the same brand.
  const representatives = groups.filter((group) => group.cluster === group.id);
  const byBrand = new Map<string, MergedGroup[]>();
  for (const group of representatives)
    byBrand.set(group.brandKey, [
      ...(byBrand.get(group.brandKey) ?? []),
      group,
    ]);
  const lineKey = (group: MergedGroup) =>
    group.lineName
      ? `${normalizeName(group.lineName)}:${normalizeName(group.flavor ?? "")}`
      : null;
  for (const brand of brands) {
    const own = byBrand.get(brand.key) ?? [];
    const pairs: { a: string; b: string; score: number; reason: string }[] = [];
    const consider = (a: MergedGroup, b: MergedGroup) => {
      const sameLine = lineKey(a) !== null && lineKey(a) === lineKey(b);
      const overlap = tokenOverlap(
        `${a.name} ${a.flavor ?? ""}`,
        `${b.name} ${b.flavor ?? ""}`,
      );
      if (sameLine || overlap >= 0.6)
        pairs.push({
          a: a.id,
          b: b.id,
          score: sameLine ? 1 : overlap,
          reason: sameLine
            ? "Same line and flavor."
            : `Names ${Math.round(overlap * 100)}% alike.`,
        });
    };
    for (const [index, a] of own.entries())
      for (const b of own.slice(index + 1)) consider(a, b);
    for (const otherKey of related.get(brand.key)!)
      if (otherKey > brand.key)
        for (const a of own)
          for (const b of byBrand.get(otherKey) ?? []) consider(a, b);
    pairs.sort((a, b) => b.score - a.score);
    if (pairs.length > PAIRS_PER_BRAND)
      problems.push(
        `${brand.name}: only the ${PAIRS_PER_BRAND} closest of ${pairs.length} possible duplicate pairs were reviewed; check the rest by eye.`,
      );
    for (const { a, b, reason } of pairs.slice(0, PAIRS_PER_BRAND))
      candidates.push({
        id: nextId(),
        kind: "product",
        a,
        b,
        reason,
        sheet: "",
      });
  }

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const labelPhoto = (group: MergedGroup) =>
    group.photos.ingredients ?? group.photos.nutrition ?? group.photos.back;
  const short = (value: string) =>
    value.length > 44 ? `${value.slice(0, 43)}…` : value;
  const drawPair = async (pair: Candidate) => {
    const sides =
      pair.kind === "brand"
        ? [pair.a, pair.b].map((key) =>
            groups.find((group) => group.brandKey === key)!,
          )
        : [groupById.get(pair.a)!, groupById.get(pair.b)!];
    const [a, b] = sides as [MergedGroup, MergedGroup];
    const caption = (side: string, group: MergedGroup) =>
      short(
        pair.kind === "brand"
          ? `${side}: ${group.brand}`
          : `${side}: ${group.name}${group.flavor ? ` · ${group.flavor}` : ""}${group.size ? ` · ${group.size}` : ""}`,
      );
    pair.sheet = runFile(batch, "pairs", `${pair.id}.jpg`);
    await sheet(
      batch,
      [
        {
          photo: a.photos.front ?? firstPhoto(a.photos),
          caption: caption("A", a),
        },
        {
          photo: b.photos.front ?? firstPhoto(b.photos),
          caption: caption("B", b),
        },
        { photo: labelPhoto(a), caption: "A label" },
        { photo: labelPhoto(b), caption: "B label" },
      ],
      2,
      pair.sheet,
    );
  };
  // A few sheets at a time keeps a large merge well inside a command timeout.
  for (let start = 0; start < candidates.length; start += 6)
    await Promise.all(candidates.slice(start, start + 6).map(drawPair));
  const bins: Record<string, string[]> = {};
  for (let start = 0; start < candidates.length; start += PAIRS_PER_BIN)
    bins[`pairs-${String(start / PAIRS_PER_BIN + 1).padStart(2, "0")}`] =
      candidates.slice(start, start + PAIRS_PER_BIN).map((pair) => pair.id);

  const storeHints = sorted.flatMap((range) =>
    range.storeHints.map((hint) => ({
      visit: position.get(hint.photo)?.visit ?? 0,
      store: hint.store,
      evidence: hint.evidence,
    })),
  );
  await writeJson(
    runFile(batch, "merge.json"),
    mergePlan.parse({
      groups,
      brands,
      candidates,
      bins,
      setAside,
      storeHints,
      blocking: structural,
      problems,
    }),
  );
  const clusters = new Set(groups.map((group) => group.cluster)).size;
  console.log(
    `${groups.length} photo groups in ${clusters} identity clusters, ${brands.length} brands, ${candidates.length} possible duplicates in ${Object.keys(bins).length} bins, ${setAside.length} photos set aside by the sort.`,
  );
  for (const problem of [...structural, ...problems])
    console.log(`Problem: ${problem}`);
  // Lost, doubled or orphaned photos must be fixed in the sort first.
  if (structural.length) {
    result({ ok: false, problems: structural });
    throw new Error(
      "Fix these in the sort results (put sort again), then merge again.",
    );
  }
  result({
    ok: true,
    bins: Object.keys(bins),
    groups: groups.length,
    clusters,
    candidates: candidates.length,
    problems,
  });
}
