import { v5 as uuidv5 } from "uuid";
import { z } from "zod";
import {
  countryCode,
  flavorText,
  shortText,
  submissionInput,
  type ManufacturerLabel,
  type SubmissionInput,
} from "./contracts";
import { fingerprint, provisionalClassification } from "./policy";
import {
  ingredientTranscription,
  type IngredientTranscription,
} from "./ingredient-transcription";
import type { AllergenDeclaration } from "./allergens";

// The owner's store-photo import (docs/IMPORTER_PLAN.md): the reviewed photo
// batches become catalog products without the review queue (owner,
// 2026-10-16). A manifest describes every product once, the same for every
// environment; the site sees only each product's facts, never the review's
// internal data (risk levels, ingredient checks, sizes, notes).

export const IMPORT_OPERATION = "catalog-import";
export const IMPORT_ACTION = "product_import";
export const IMPORT_CHANGE_SUMMARY = "Added from VeganAlts store photos.";
// A product can't be un-created; reversing its import hides it, the
// administrative state that takes it off every public surface.
export const IMPORT_BEFORE = { lifecycleStatus: "hidden" } as const;
export const IMPORT_AFTER = { lifecycleStatus: "active" } as const;

export const IMPORT_SLOTS = [
  "front",
  "ingredients",
  "nutrition",
  "back",
] as const;
export const packageLabel = z.enum([
  "vegan",
  "plant_based",
  "appears_plant_based",
]);
export type PackageLabel = z.infer<typeof packageLabel>;
// What the package says, as the site's manufacturer label: a package that
// says neither vegan nor plant-based on the photographed panels may say it
// elsewhere, so it is unknown rather than "neither".
export const MANUFACTURER_LABEL: Record<PackageLabel, ManufacturerLabel> = {
  vegan: "vegan",
  plant_based: "plant_based",
  appears_plant_based: "unknown",
};

const importedAllergenAliases: Record<string, string> = {
  almond: "tree_nuts",
  cashew: "tree_nuts",
  cashews: "tree_nuts",
  hazelnut: "tree_nuts",
  hazelnuts: "tree_nuts",
  macadamia: "tree_nuts",
  pecan: "tree_nuts",
  pine_nut: "tree_nuts",
  pistachio: "tree_nuts",
  tree_nut: "tree_nuts",
  walnut: "tree_nuts",
  peanuts: "peanut",
  sulfites: "sulphites",
};

/**
 * Maps reviewed package allergen keys to this country's supported vocabulary.
 * Unmapped structured keys are omitted rather than guessed into another
 * category. Source photos remain available as evidence; verbatim label text
 * stays in the transcription when it was provided.
 */
export function importAllergenDeclaration(
  declaration: AllergenDeclaration | undefined,
  supported: ReadonlySet<string>,
): AllergenDeclaration | undefined {
  if (!declaration || declaration.status === "none_declared")
    return declaration;
  const key = (value: string) => {
    const normalized = importedAllergenAliases[value] ?? value;
    return supported.has(normalized) ? normalized : null;
  };
  const contains = new Set(
    declaration.contains.map(key).filter((value): value is string => !!value),
  );
  const mayContain = new Set(
    declaration.mayContain
      .map(key)
      .filter((value): value is string => !!value && !contains.has(value)),
  );
  if (!contains.size && !mayContain.size) return undefined;
  return {
    status: "declared",
    contains: [...contains],
    mayContain: [...mayContain],
  };
}

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const copy = z
  .object({
    sha256,
    bytes: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export const importPhoto = z
  .object({
    slot: z.enum(IMPORT_SLOTS),
    // The photo's file name in its batch; the same name has a full and a
    // thumbnail copy.
    name: z.string().regex(/^[^/\\]+\.webp$/),
    full: copy,
    thumbnail: copy,
  })
  .strict();
export type ImportPhoto = z.infer<typeof importPhoto>;

/** What the site is told about a product. The hashes cover exactly this. */
export const importFacts = z
  .object({
    // `<batch folder>/<product id>`: every id the import writes derives from it.
    sourceKey: z.string().min(3).max(300),
    country: countryCode,
    brand: shortText,
    line: z
      .object({
        // Brand, line name and food after normalization: lines of different
        // batches with the same key are one line.
        key: z.string().min(1),
        name: shortText,
        // The source key of the line's first product, which starts the line.
        first: z.string().min(3).max(300),
      })
      .strict(),
    flavor: flavorText.optional(),
    name: shortText,
    food: z.string().min(1),
    packageLabel,
    // Where the vegan or plant-based claim sits on the package.
    labelEvidence: z.string().trim().min(1).max(500).optional(),
    // Every source product has an explicit transcription record, including
    // no_source when no usable ingredient panel exists.
    transcription: ingredientTranscription,
    stores: z.array(shortText).max(10),
    photos: z
      .array(importPhoto)
      .min(1)
      .max(4)
      .refine(
        (photos) =>
          photos[0]?.slot === "front" &&
          new Set(photos.map((photo) => photo.slot)).size === photos.length,
        "A product starts with its front photo and has one photo per slot.",
      ),
  })
  .strict();
export type ImportFacts = z.infer<typeof importFacts>;

export type ImportTranscription = IngredientTranscription;

/** The review's own data, kept for the owner and never written to the site. */
export const importInternal = z
  .object({
    risk: z.object({ level: z.string(), reason: z.string() }).optional(),
    check: z
      .object({
        result: z.string(),
        animalIngredients: z.array(z.string()),
      })
      .optional(),
    sizes: z.array(z.string()),
    confidence: z.string(),
    notes: z.array(z.string()),
  })
  .strict();

export const importProduct = z
  .object({ facts: importFacts, internal: importInternal })
  .strict();
export type ImportProduct = z.infer<typeof importProduct>;

/** A later label for a product already listed from an earlier photo batch. */
export const importFormulaUpdate = z
  .object({
    productSourceKey: z.string().min(3).max(300),
    facts: importFacts,
    label: shortText,
    summary: z.string().trim().min(8).max(2000),
  })
  .strict();
export type ImportFormulaUpdate = z.infer<typeof importFormulaUpdate>;

export const importManifest = z
  .object({
    version: z.literal(1),
    hash: sha256,
    batches: z.array(
      z.object({ folder: z.string(), products: z.number().int() }).strict(),
    ),
    products: z.array(importProduct),
    formulaUpdates: z.array(importFormulaUpdate).default([]),
  })
  .strict();
export type ImportManifest = z.infer<typeof importManifest>;

// UUIDv5 in the import's own namespace, like the demo seed's `seedId`: the
// same product gets the same ids, slug and photo keys everywhere.
export const importId = (kind: string, key: string) =>
  uuidv5(`veganalts:import:${kind}:${key}`, uuidv5.URL);
export const importIds = (sourceKey: string) => ({
  product: importId("product", sourceKey),
  version: importId("version", sourceKey),
  action: importId("action", sourceKey),
  published: importId("published", sourceKey),
  receiptKey: `import-${importId("receipt", sourceKey)}`,
});
export const importBrandId = (normalizedName: string) =>
  importId("brand", normalizedName);
// Lines keep the publication rule: `line-<first product id>`.
export const importLineId = (firstSourceKey: string) =>
  `line-${importIds(firstSourceKey).product}`;
// The full copy's hash is part of the id, so bytes under a referenced key
// never change.
export const importImageId = (
  sourceKey: string,
  slot: string,
  fullSha256: string,
) => importId("image", `${sourceKey}:${slot}:${fullSha256}`);
// The layout of a promoted submission photo, with `import` in place of the
// publication lease token.
export const importPhotoKey = (
  productId: string,
  versionId: string,
  imageId: string,
  kind: "full" | "thumbnail",
) => `products/${productId}/${versionId}/${imageId}/import/${kind}.webp`;

const sentence = (value: string) =>
  /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`;
/**
 * The classification's public evidence note: where the facts came from, and
 * where the package's vegan or plant-based claim sits. Never ingredient text,
 * a risk level or a check result.
 */
export function importEvidenceNote(facts: ImportFacts) {
  const base =
    facts.transcription.verification === "no_source"
      ? "Added from VeganAlts store photos. No readable ingredient source was available."
      : facts.transcription.verification === "online_only"
        ? "Added from VeganAlts store photos. No matching readable package ingredient list was available; an exact-product online source is shown below."
        : "Added from VeganAlts store photos. Ingredients were transcribed from the package label. Ingredient text is available below.";
  return facts.labelEvidence && facts.packageLabel !== "appears_plant_based"
    ? `${base} Package: ${sentence(facts.labelEvidence)}`
    : base;
}

/**
 * Classification for the owner's reviewed historical photo batches.
 * A vegan package claim controls unless transcription confirms an animal
 * ingredient. Otherwise, clean assessments are Plant-based and flagged or
 * incomplete assessments are Appears plant-based.
 */
export const importClassification = (facts: ImportFacts) => {
  const t = facts.transcription;
  const veganStatus =
    t.assessment.result === "animal_ingredients"
      ? "under_review"
      : facts.packageLabel === "vegan"
        ? "vegan"
        : t.assessment.result === "none_found"
          ? "plant_based"
          : "appears_plant_based";
  return {
    veganStatus,
    // The owner has reviewed this historical batch's ingredient evidence and
    // explicitly accepts Appears plant-based when a source or ingredient
    // origin remains uncertain. Keep that public tag visible; animal findings
    // remain under review and are blocked from import separately.
    ingredientsChecked: true,
  } as const;
};

export const isLineFirst = (facts: ImportFacts) =>
  facts.line.first === facts.sourceKey;

/**
 * The product as Add a product would submit it, parsed by the same contract.
 * A line's first product starts it; the rest join it.
 */
export function importSubmission(
  facts: ImportFacts,
  target: {
    categoryId: string;
    retailerIds: string[];
    allergens?: AllergenDeclaration;
  },
): SubmissionInput {
  return submissionInput.parse({
    name: facts.name,
    brand: facts.brand,
    country: facts.country,
    categoryIds: [target.categoryId],
    imageSlots: facts.photos.map((photo) => photo.slot),
    statusBasis: importEvidenceNote(facts),
    manufacturerLabel: MANUFACTURER_LABEL[facts.packageLabel],
    ...(target.retailerIds.length ? { retailerIds: target.retailerIds } : {}),
    ...(target.allergens ? { allergens: target.allergens } : {}),
    ...(facts.flavor ? { flavor: facts.flavor } : {}),
    ...(isLineFirst(facts)
      ? { lineName: facts.line.name }
      : { lineId: importLineId(facts.line.first) }),
  });
}

/** Objects with sorted keys, so equal facts always hash alike. */
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
// A product's receipt hash: a rerun with the same facts replays, and changed
// facts are reported instead of written.
export const importFactsHash = (facts: ImportFacts) =>
  fingerprint(canonical(facts));
// The manifest hash covers every product's facts in order, never the review's
// internal data, so the same hash applies to every environment.
export const importManifestHash = (
  manifest: Pick<ImportManifest, "batches" | "products"> & {
    formulaUpdates?: ImportFormulaUpdate[];
  },
) =>
  fingerprint(
    canonical({
      version: 1,
      batches: manifest.batches,
      products: manifest.products.map((product) => product.facts),
      formulaUpdates: manifest.formulaUpdates ?? [],
    }),
  );
