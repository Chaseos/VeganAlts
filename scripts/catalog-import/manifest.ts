import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";
import { openBatch, runFile } from "../photo-review/batch";
import { brandsMayMatch, tokenOverlap } from "../photo-review/identity";
import { movedPhotos } from "../photo-review/move-log";
import { loadRun, reviewLineIds, type ProductView } from "../photo-review/view";
import {
  IMPORT_SLOTS,
  importFacts,
  importManifestHash,
  importSubmission,
  type ImportFacts,
  type ImportManifest,
  type ImportPhoto,
  type ImportProduct,
} from "../../server/community/domain/catalog-import";
import {
  identityKey,
  normalizeName,
  productName,
} from "../../server/community/domain/policy";
import {
  derivativeSpecs,
  validateImageBytes,
  validateImageInfo,
} from "../../server/media/domain/media";
import { IMPORT_STORES } from "./retailers";

// The import manifest (docs/IMPORTER_PLAN.md, "The manifest"): every
// in-scope product of the reviewed batches, read through the photo-review
// helper's own product view, with the checks that block a run and the
// warnings for the owner. Reads the batch folders and never changes them.

export type PhotoFiles = Map<
  string,
  Map<string, { full: string; thumbnail: string }>
>;
export interface BuiltManifest {
  manifest: ImportManifest;
  // Source key → slot → where the full and thumbnail copies are.
  files: PhotoFiles;
  blocking: string[];
  warnings: string[];
  counts: {
    products: number;
    lines: number;
    brands: number;
    foods: number;
    stores: number;
    storeLinks: number;
    photos: Record<string, number>;
    withoutIngredientsPhoto: number;
  };
}

/** A fully quoted CSV, as photo-review `render` writes products.csv. */
export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (field || row.length) rows.push([...row, field]);
  const [header, ...body] = rows;
  return body.map((values) =>
    Object.fromEntries(
      (header ?? []).map((name, index) => [name, values[index] ?? ""]),
    ),
  );
}

// The fields of products.csv the import relies on, as `render` writes them.
const sheetRow = (view: ProductView) => ({
  brand: view.brand,
  line_name: view.lineName ?? "",
  flavor: view.flavor ?? "",
  name: view.name,
  food: view.food ?? "",
  stores: view.stores.join("; "),
  package_label: view.label,
  label_evidence: view.labelEvidence ?? "",
  front_photo: view.photos.front ?? "",
  ingredients_photo: view.photos.ingredients ?? "",
  nutrition_photo: view.photos.nutrition ?? "",
  back_photo: view.photos.back ?? "",
});

async function readCopy(path: string, kind: "full" | "thumbnail") {
  const problems: string[] = [];
  const bytes = new Uint8Array(await readFile(path));
  try {
    if (validateImageBytes(bytes) !== "image/webp") problems.push("not WebP");
  } catch (error) {
    problems.push((error as Error).message);
  }
  const meta = await sharp(bytes).metadata();
  try {
    validateImageInfo(
      {
        width: meta.width,
        height: meta.height,
        format: `image/${meta.format}`,
      },
      "image/webp",
    );
  } catch (error) {
    problems.push((error as Error).message);
  }
  // The site's own caps: 1,800 px for the full copy, 500 px for thumbnails.
  const maxEdge = derivativeSpecs("front").find(
    (spec) => spec.kind === kind,
  )!.maxEdge;
  if (Math.max(meta.width, meta.height) > maxEdge)
    problems.push(`longer than ${maxEdge} px`);
  // GPS and camera details live in these; prepare-photos strips them.
  if (meta.exif || meta.xmp || meta.iptc)
    problems.push("carries EXIF, XMP or IPTC metadata");
  return {
    bytes,
    problems,
    copy: {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      width: meta.width,
      height: meta.height,
    },
  };
}

/** Builds the manifest from the batches, earliest first. */
export async function buildManifest(webs: string[]): Promise<BuiltManifest> {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const files: PhotoFiles = new Map();
  const drafts: {
    batch: number;
    view: ProductView;
    facts: Omit<ImportFacts, "line">;
    internal: ImportProduct["internal"];
    lineName: string;
    lineKey: string;
    reviewedLine: string;
  }[] = [];
  const batches: ImportManifest["batches"] = [];
  const folders = new Set<string>();
  for (const [index, web] of webs.entries()) {
    const batch = openBatch(web);
    const folder = basename(batch.web);
    if (folders.has(folder))
      blocking.push(
        `Two batches are named "${folder}"; their products would share source keys.`,
      );
    folders.add(folder);
    const run = await loadRun(batch);
    for (const problem of run.problems) blocking.push(`${folder}: ${problem}`);
    if (run.unaccounted.length)
      warnings.push(
        `${folder}: ${run.unaccounted.length} photos are not accounted for.`,
      );
    const moved = await movedPhotos(batch);
    const inScope = run.views.filter((view) => !view.skip && !view.outOfScope);
    const lineIds = reviewLineIds(inScope);
    batches.push({ folder, products: inScope.length });

    // The review sheet the owner approved must still describe these products.
    let sheet: Record<string, string>[] = [];
    try {
      sheet = parseCsv(await readFile(runFile(batch, "products.csv"), "utf8"));
    } catch {
      blocking.push(
        `${folder}: products.csv is missing; render the review sheet first.`,
      );
    }
    const rows = new Map(sheet.map((row) => [row.id!, row]));
    const stale = inScope.filter((view) => {
      const row = rows.get(view.id);
      return (
        !row ||
        Object.entries(sheetRow(view)).some(
          ([field, value]) => row[field] !== value,
        )
      );
    });
    const gone = sheet.filter(
      (row) => !inScope.some((view) => view.id === row.id),
    );
    if (sheet.length && (stale.length || gone.length))
      blocking.push(
        `${folder}: products.csv no longer matches the review (${stale.length + gone.length} products changed, for example ${[...stale.map((view) => view.id), ...gone.map((row) => row.id)][0]}). Render the sheet again and review it.`,
      );

    for (const view of inScope) {
      const sourceKey = `${folder}/${view.id}`;
      if (view.flags.length)
        blocking.push(`${sourceKey}: ${view.flags.join("; ")}`);
      if (view.newFood)
        blocking.push(
          `${sourceKey}: is in a suggested food (${view.newFood.name}).`,
        );
      if (!view.food) {
        blocking.push(`${sourceKey}: has no food.`);
        continue;
      }
      if (view.check?.result === "animal_ingredients")
        blocking.push(`${sourceKey}: animal ingredients on the label.`);
      const photos: ImportPhoto[] = [];
      const paths = new Map<string, { full: string; thumbnail: string }>();
      for (const slot of IMPORT_SLOTS) {
        const name = view.photos[slot];
        if (!name) continue;
        const where = moved.get(name);
        const path = (size: "full" | "thumbnail") =>
          where
            ? join(batch.web, where, size, name)
            : join(batch.web, size, name);
        try {
          const [full, thumbnail] = await Promise.all([
            readCopy(path("full"), "full"),
            readCopy(path("thumbnail"), "thumbnail"),
          ]);
          const problems = [...full.problems, ...thumbnail.problems];
          const ratio = (copy: { width: number; height: number }) =>
            copy.width / copy.height;
          if (Math.abs(ratio(full.copy) - ratio(thumbnail.copy)) > 0.02)
            problems.push("its full and thumbnail copies differ in shape");
          for (const problem of new Set(problems))
            blocking.push(`${sourceKey}: ${slot} photo ${name} ${problem}.`);
          if (where)
            warnings.push(
              `${sourceKey}: ${slot} photo ${name} is in ${where}.`,
            );
          photos.push({
            slot,
            name,
            full: full.copy,
            thumbnail: thumbnail.copy,
          });
          paths.set(slot, { full: path("full"), thumbnail: path("thumbnail") });
        } catch (error) {
          blocking.push(
            `${sourceKey}: ${slot} photo ${name} can't be read (${(error as Error).message}).`,
          );
        }
      }
      files.set(sourceKey, paths);
      const lineName = view.lineName ?? view.name;
      drafts.push({
        batch: index,
        view,
        lineName,
        // Lines of different batches join on brand, line name and food.
        lineKey: `${normalizeName(view.brand)}|${normalizeName(lineName)}|${view.food}`,
        // The line as the review sheet groups it within its batch.
        reviewedLine: lineIds.get(view.id)!,
        facts: {
          sourceKey,
          country: view.record.country,
          brand: view.brand,
          ...(view.flavor ? { flavor: view.flavor } : {}),
          name: view.name,
          food: view.food,
          packageLabel: view.label,
          ...(view.labelEvidence ? { labelEvidence: view.labelEvidence } : {}),
          stores: view.stores,
          photos,
        },
        internal: {
          ...(view.risk ? { risk: view.risk } : {}),
          ...(view.check
            ? {
                check: {
                  result: view.check.result,
                  animalIngredients: view.check.animalIngredients,
                },
              }
            : {}),
          sizes: view.sizes,
          confidence: view.record.confidence,
          notes: [
            ...view.record.notes,
            ...(view.correction?.note ? [view.correction.note] : []),
          ],
        },
      });
    }
  }

  // Lines: the first product is the original, else the earliest in batch and
  // id order. Each line has one original and each flavor once.
  const byName = new Map<string, typeof drafts>();
  for (const draft of drafts)
    byName.set(draft.lineKey, [...(byName.get(draft.lineKey) ?? []), draft]);
  const lines = new Map<string, typeof drafts>();
  for (const [key, members] of byName) {
    const reviewed = new Map<number, Set<string>>();
    for (const member of members)
      reviewed.set(
        member.batch,
        (reviewed.get(member.batch) ?? new Set()).add(member.reviewedLine),
      );
    if ([...reviewed.values()].some((ids) => ids.size > 1)) {
      warnings.push(
        `Line ${key}: one batch has distinct reviewed lines with the same normalized brand, line name and food; they stay separate, including across batches.`,
      );
      // A name alone cannot decide which reviewed line a later batch joins.
      for (const member of members) {
        member.lineKey = `${key}|${batches[member.batch]!.folder}/${member.reviewedLine}`;
        lines.set(member.lineKey, [
          ...(lines.get(member.lineKey) ?? []),
          member,
        ]);
      }
    } else lines.set(key, members);
  }
  const products: ImportProduct[] = [];
  const firstOf = new Map<string, (typeof drafts)[number]>();
  for (const [key, members] of lines) {
    const flavors = members.map((member) =>
      (member.facts.flavor ?? "").toLowerCase(),
    );
    for (const flavor of new Set(flavors))
      if (flavors.filter((other) => other === flavor).length > 1)
        blocking.push(
          `Line ${members[0]!.facts.brand} · ${members[0]!.lineName}: ${flavor ? `the flavor "${flavor}" appears twice` : "two products are the line's original"} (${members
            .filter(
              (member) => (member.facts.flavor ?? "").toLowerCase() === flavor,
            )
            .map((member) => member.facts.sourceKey)
            .join(", ")}).`,
        );
    if (new Set(members.map((member) => member.facts.packageLabel)).size > 1)
      warnings.push(
        `Line ${members[0]!.facts.brand} · ${members[0]!.lineName} mixes package labels (allowed).`,
      );
    firstOf.set(
      key,
      members.find((member) => !member.facts.flavor) ?? members[0]!,
    );
  }
  for (const draft of drafts) {
    const first = firstOf.get(draft.lineKey)!;
    const facts = {
      ...draft.facts,
      line: {
        key: draft.lineKey,
        name: first.lineName,
        first: first.facts.sourceKey,
      },
    };
    const parsed = importFacts.safeParse(facts);
    if (!parsed.success) {
      blocking.push(
        `${facts.sourceKey}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`,
      );
      continue;
    }
    // The submission contract, with placeholder ids for this database's
    // food and stores.
    try {
      importSubmission(parsed.data, {
        categoryId: "food",
        retailerIds: parsed.data.stores.map((_, index) => `store-${index}`),
      });
    } catch (error) {
      blocking.push(
        `${facts.sourceKey}: fails the submission contract (${(error as Error).message}).`,
      );
    }
    products.push({ facts: parsed.data, internal: draft.internal });
  }

  // Exact duplicates by the site's identity key.
  const identities = new Map<string, string[]>();
  for (const { facts } of products) {
    const key = identityKey("US", facts.brand, facts.name);
    identities.set(key, [...(identities.get(key) ?? []), facts.sourceKey]);
  }
  for (const sources of identities.values())
    if (sources.length > 1)
      blocking.push(
        `One product by the site's identity key: ${sources.join(", ")}.`,
      );

  // Every store maps to one import store.
  const storeNames = new Map<string, string>();
  for (const store of IMPORT_STORES)
    for (const name of [store.name, ...store.aliases])
      storeNames.set(normalizeName(name), store.name);
  const used = new Set<string>();
  for (const { facts } of products)
    for (const store of facts.stores) {
      const match = storeNames.get(normalizeName(store));
      if (match) used.add(match);
      else blocking.push(`${facts.sourceKey}: no import store for "${store}".`);
    }

  // Warnings for the owner.
  const brands = new Map<string, Set<string>>();
  for (const { facts } of products) {
    const key = normalizeName(facts.brand);
    brands.set(key, (brands.get(key) ?? new Set()).add(facts.brand));
    if (normalizeName(facts.name).startsWith(key))
      warnings.push(
        `${facts.sourceKey}: the name starts with its brand ("${facts.name}").`,
      );
    if (normalizeName(facts.name) !== productName(facts.name))
      warnings.push(
        `${facts.sourceKey}: the name carries a size or pack count ("${facts.name}").`,
      );
  }
  for (const spellings of brands.values())
    if (spellings.size > 1)
      warnings.push(
        `One brand, spelled ${[...spellings].join(" and ")}; the first spelling is kept.`,
      );
  const brandList = [...brands.values()].map((names) => [...names][0]!);
  for (let a = 0; a < brandList.length; a++)
    for (let b = a + 1; b < brandList.length; b++)
      if (brandsMayMatch(brandList[a]!, brandList[b]!))
        warnings.push(
          `Possibly one brand: ${brandList[a]} and ${brandList[b]}.`,
        );
  // A product of a later batch close to an earlier batch's product, in
  // another line of the same brand and food: a repeat the repeats step may
  // have missed.
  const batchOf = new Map(
    drafts.map((draft) => [draft.facts.sourceKey, draft.batch]),
  );
  const groups = new Map<string, ImportFacts[]>();
  for (const { facts } of products) {
    const key = `${normalizeName(facts.brand)}|${facts.food}`;
    groups.set(key, [...(groups.get(key) ?? []), facts]);
  }
  for (const members of groups.values())
    for (const later of members)
      for (const earlier of members)
        if (
          batchOf.get(earlier.sourceKey)! < batchOf.get(later.sourceKey)! &&
          later.line.key !== earlier.line.key &&
          (later.flavor ?? "").toLowerCase() ===
            (earlier.flavor ?? "").toLowerCase() &&
          tokenOverlap(later.name, earlier.name) >= 0.6
        )
          warnings.push(
            `Possible missed repeat: ${later.sourceKey} "${later.name}" and ${earlier.sourceKey} "${earlier.name}".`,
          );

  const photos: Record<string, number> = {};
  for (const { facts } of products)
    for (const photo of facts.photos)
      photos[photo.slot] = (photos[photo.slot] ?? 0) + 1;
  const manifest = {
    version: 1 as const,
    batches,
    products,
  };
  return {
    manifest: { ...manifest, hash: await importManifestHash(manifest) },
    files,
    blocking,
    warnings,
    counts: {
      products: products.length,
      lines: new Set(products.map(({ facts }) => facts.line.key)).size,
      brands: brands.size,
      foods: new Set(products.map(({ facts }) => facts.food)).size,
      stores: used.size,
      storeLinks: products.reduce(
        (sum, { facts }) => sum + facts.stores.length,
        0,
      ),
      photos,
      withoutIngredientsPhoto: products.filter(
        ({ facts }) =>
          !facts.photos.some((photo) => photo.slot === "ingredients"),
      ).length,
    },
  };
}
