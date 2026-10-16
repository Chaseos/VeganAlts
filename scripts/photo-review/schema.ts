import { z } from "zod";
import { TAXONOMY_GROUPS, TAXONOMY_LEAVES } from "../../db/seed/taxonomy";

// The files of a photo-batch run. Product fields follow the site's
// submission contract (server/community/domain/contracts.ts) so a future
// importer can read them: names 2–160 characters, flavors up to 40, one of
// the site's foods per recipe line.

export const SLOTS = ["front", "ingredients", "nutrition", "back"] as const;
export const slot = z.enum(SLOTS);
export type Slot = z.infer<typeof slot>;

export const FOODS = new Map<string, string>(
  TAXONOMY_LEAVES.map((leaf) => [leaf.slug, leaf.name]),
);
export const AISLES = new Map<string, string>(
  TAXONOMY_GROUPS.filter((group) => group.parent).map((group) => [
    group.slug,
    group.name,
  ]),
);

export const photo = z
  .string()
  .regex(/^[^/\\]+\.webp$/, "Use a photo file name such as PXL_….webp.");
const text = z.string().trim().min(1);
const label = z.string().trim().min(2).max(160);
const flavor = z.string().trim().min(1).max(40);
export const confidence = z.enum(["high", "medium", "low"]);

// What the package says, anywhere on the photographed panels (owner,
// 2026-10-15): "vegan" when the word or a vegan mark or certification
// appears; else "plant_based" when it says plant-based; else
// "appears_plant_based". Only the last gets a risk level.
export const packageLabel = z.enum([
  "vegan",
  "plant_based",
  "appears_plant_based",
]);
export type PackageLabel = z.infer<typeof packageLabel>;
export const LABEL_RANK: Record<PackageLabel, number> = {
  vegan: 0,
  plant_based: 1,
  appears_plant_based: 2,
};
// The site's manufacturer label for each, as the importer writes it.
export { MANUFACTURER_LABEL } from "../../server/community/domain/catalog-import";
export const riskLevel = z.enum(["low", "medium", "high"]);

export const photoEntry = z
  .object({
    n: z.number().int().positive(),
    name: photo,
    time: z.string().nullable(),
    gap: z.number().nullable(),
    visit: z.number().int().positive(),
    sharpness: z.number().nonnegative(),
    glare: z.number().min(0).max(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export type PhotoEntry = z.infer<typeof photoEntry>;
export const photoIndex = z.object({ photos: z.array(photoEntry) }).strict();

export const chunkPlan = z
  .object({
    ranges: z.array(
      z
        .object({
          id: z.string().regex(/^range-\d+$/),
          photos: z.array(photo).min(1),
          context: z.array(photo),
          sheets: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();

export const setAsideReason = z.enum([
  "not a product",
  "accidental",
  "retake",
  "duplicate",
  "blurrier copy",
]);
export const setAsideEntry = z
  .object({
    photo,
    reason: setAsideReason,
    // The photo kept instead, for retakes and duplicates.
    duplicateOf: photo.optional(),
    note: text.optional(),
  })
  .strict();
export type SetAsideEntry = z.infer<typeof setAsideEntry>;

export const groupPhotos = z
  .object({
    front: photo.optional(),
    ingredients: photo.optional(),
    nutrition: photo.optional(),
    back: photo.optional(),
    other: z.array(photo).default([]),
  })
  .strict();
export type GroupPhotos = z.infer<typeof groupPhotos>;

const identity = {
  brand: label,
  lineName: label.optional(),
  flavor: flavor.optional(),
  name: label,
};

export const sortGroup = z
  .object({
    photos: groupPhotos,
    // A front just before this range whose label photos start the range.
    continues: photo.optional(),
    brand: label.optional(),
    lineName: label.optional(),
    flavor: flavor.optional(),
    name: label.optional(),
    size: text.optional(),
    label: packageLabel.optional(),
    // Where the vegan or plant-based wording or mark is, e.g. "Certified
    // Vegan logo on the back".
    labelEvidence: text.optional(),
    confidence,
    note: text.optional(),
  })
  .strict()
  .refine(
    (group) =>
      group.continues !== undefined ||
      (group.brand !== undefined &&
        group.name !== undefined &&
        group.label !== undefined),
    "Give a brand, name and package label, or the earlier front this group continues.",
  )
  .refine(
    (group) => group.continues === undefined || !group.photos.front,
    "A group that continues an earlier front has no front of its own.",
  )
  .refine(
    (group) =>
      group.label === undefined ||
      group.label === "appears_plant_based" ||
      group.labelEvidence !== undefined,
    "Say where the vegan or plant-based wording or mark is (labelEvidence).",
  )
  .refine(
    (group) =>
      [
        group.photos.front,
        group.photos.ingredients,
        group.photos.nutrition,
        group.photos.back,
        ...group.photos.other,
      ].some(Boolean),
    "A group needs at least one photo.",
  );
export type SortGroup = z.infer<typeof sortGroup>;

export const storeHint = z
  .object({ photo, store: label, evidence: text })
  .strict();

export const sortResult = z
  .object({
    range: z.string(),
    groups: z.array(sortGroup),
    setAside: z.array(setAsideEntry).default([]),
    storeHints: z.array(storeHint).default([]),
  })
  .strict();
export type SortResult = z.infer<typeof sortResult>;

export const mergedGroup = z
  .object({
    id: z.string(),
    range: z.string(),
    ...identity,
    brandKey: z.string(),
    size: text.optional(),
    label: packageLabel,
    labelEvidence: text.optional(),
    confidence,
    note: text.optional(),
    photos: groupPhotos,
    // Groups with the same identity key share a cluster from the start.
    cluster: z.string(),
  })
  .strict();
export type MergedGroup = z.infer<typeof mergedGroup>;

export const candidate = z
  .object({
    id: z.string(),
    kind: z.enum(["brand", "product"]),
    a: z.string(),
    b: z.string(),
    reason: text,
    sheet: z.string(),
  })
  .strict();
export type Candidate = z.infer<typeof candidate>;

export const mergePlan = z
  .object({
    groups: z.array(mergedGroup),
    brands: z.array(
      z
        .object({
          key: z.string(),
          name: label,
          variants: z.array(z.string()),
          groups: z.number().int(),
        })
        .strict(),
    ),
    candidates: z.array(candidate),
    bins: z.record(z.string(), z.array(z.string())),
    setAside: z.array(setAsideEntry),
    storeHints: z.array(
      z.object({ visit: z.number().int(), store: label, evidence: text }),
    ),
    // Lost, doubled or orphaned photos: build refuses until they're fixed.
    blocking: z.array(z.string()).default([]),
    problems: z.array(z.string()),
  })
  .strict();
export type MergePlan = z.infer<typeof mergePlan>;

export const reconcileResult = z
  .object({
    bin: z.string(),
    decisions: z.array(
      z
        .object({
          pair: z.string(),
          same: z.boolean(),
          // For brand pairs judged the same: the spelling the brand uses.
          name: label.optional(),
          reason: text,
        })
        .strict(),
    ),
  })
  .strict();

// Products a later batch photographed again: each pair puts a product of
// this run beside a likely match from an earlier batch's run, for the Repeat
// agents to decide (owner, 2026-10-16). Decisions use reconcileResult.
export const earlierRun = z
  .object({ web: z.string(), run: z.string() })
  .strict();
export const repeatPlan = z
  .object({
    earlier: earlierRun,
    pairs: z.array(
      z
        .object({
          id: z.string(),
          product: z.string(),
          earlier: z.string(),
          earlierBrand: z.string(),
          earlierName: z.string(),
          earlierPhoto: z.string().optional(),
          reason: text,
          sheet: z.string(),
        })
        .strict(),
    ),
    bins: z.record(z.string(), z.array(z.string())),
  })
  .strict();
export type RepeatPlan = z.infer<typeof repeatPlan>;

const slotList = z.array(photo);
export const productRecord = z
  .object({
    id: z.string(),
    country: z.literal("US"),
    ...identity,
    sizes: z.array(text),
    visits: z.array(z.number().int()),
    // The strongest label any merged shot showed (vegan over plant-based).
    label: packageLabel,
    labelEvidence: text.optional(),
    photos: z
      .object({
        front: photo.optional(),
        ingredients: photo.optional(),
        nutrition: photo.optional(),
        back: photo.optional(),
      })
      .strict(),
    // Other shots of each face, and extra angles, best first.
    alternates: z
      .object({
        front: slotList,
        ingredients: slotList,
        nutrition: slotList,
        back: slotList,
        other: slotList,
      })
      .strict(),
    other: slotList,
    cluster: z.array(z.string()),
    confidence,
    notes: z.array(text),
  })
  .strict();
export type ProductRecord = z.infer<typeof productRecord>;

export const setAsideFile = z
  .object({ setAside: z.array(setAsideEntry) })
  .strict();

export const visitsFile = z
  .object({
    visits: z.array(
      z
        .object({
          visit: z.number().int(),
          photos: z.number().int(),
          first: z.number().int(),
          last: z.number().int(),
          start: z.string().nullable(),
          end: z.string().nullable(),
          proposals: z.array(
            z
              .object({
                store: z.string(),
                count: z.number().int(),
                evidence: z.array(z.string()),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

// Lines bins come from build; check bins (high-risk products only) come
// from scope.
export const binPlan = z
  .object({
    lines: z.record(z.string(), z.array(z.string())),
    check: z.record(z.string(), z.array(z.string())).default({}),
  })
  .strict();

export const foodSlug = z
  .string()
  .refine(
    (slug) => FOODS.has(slug),
    "Use a food slug from `photos:review -- foods` (TAXONOMY_LEAVES).",
  );

export const aisleSlug = z
  .string()
  .refine(
    (slug) => AISLES.has(slug),
    "Use an aisle slug from `photos:review -- foods`, or name a new aisle.",
  );

const risk = z.object({ level: riskLevel, reason: text }).strict();

// A plant-based alternative no site food fits yet stays in scope: the owner
// adds the food, and a new aisle when none fits, after review (owner,
// 2026-10-15).
const newFood = z
  .object({
    name: label,
    aisle: aisleSlug.optional(),
    newAisle: label.optional(),
    reason: text,
  })
  .strict()
  .refine(
    (food) => (food.aisle === undefined) !== (food.newAisle === undefined),
    "Give an existing aisle's slug, or name a new aisle when none fits.",
  );
// A product that replaces no animal product is out of scope: its photos go
// to the owner's review folder.
const outOfScope = z.object({ suggestedFood: label, reason: text }).strict();

// A recipe line (milestone 7): one brand's base recipe in one food, with its
// flavors. duplicateOf: the same product as another one in the
// line, missed when duplicates were merged; its photos become that product's
// alternates. risk: only for products whose package says neither vegan nor
// plant-based.
const lineProduct = z
  .object({
    id: z.string(),
    flavor: flavor.optional(),
    duplicateOf: z.string().optional(),
    risk: risk.optional(),
  })
  .strict();
const distinct = <T extends { duplicateOf?: string }>(products: T[]) =>
  products.filter((product) => !product.duplicateOf);
// "Original" or "Plain" as a flavor names the line's original, which has no
// flavor; it counts as flavorless for the one-original rule.
const isOriginal = (product: { flavor?: string }) =>
  !product.flavor || /^(original|plain)$/i.test(product.flavor.trim());
export const lineDecision = z
  .object({
    lineName: label,
    food: foodSlug.optional(),
    newFood: newFood.optional(),
    outOfScope: outOfScope.optional(),
    products: z.array(lineProduct).min(1),
    note: text.optional(),
  })
  .strict()
  .refine(
    (line) =>
      [line.food, line.newFood, line.outOfScope].filter(
        (choice) => choice !== undefined,
      ).length === 1,
    "Give the line one of: a site food; a newFood for a plant-based alternative no food fits; or outOfScope for a product that replaces no animal product.",
  )
  .refine(
    (line) => distinct(line.products).filter(isOriginal).length <= 1,
    "Only one product can be the line's original (no flavor; don't name it Original or Plain).",
  )
  .refine(
    (line) =>
      new Set(
        distinct(line.products).map(
          (product) => product.flavor?.toLowerCase() ?? "",
        ),
      ).size === distinct(line.products).length,
    "Each flavor appears once in a line.",
  )
  .refine(
    (line) =>
      line.products.every(
        (product) =>
          !product.duplicateOf ||
          (product.duplicateOf !== product.id &&
            distinct(line.products).some(
              (other) => other.id === product.duplicateOf,
            )),
      ),
    "duplicateOf must name another product in the same line that is not itself a duplicate.",
  );
export type LineDecision = z.infer<typeof lineDecision>;
export const linesResult = z
  .object({ bin: z.string(), lines: z.array(lineDecision) })
  .strict();
export const linesFile = z
  .object({
    lines: z.array(
      z
        .object({
          id: z.string(),
          brand: label,
          lineName: label,
          food: foodSlug.optional(),
          newFood: newFood.optional(),
          outOfScope: outOfScope.optional(),
          products: z.array(lineProduct),
          note: text.optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type LineRecord = z.infer<typeof linesFile>["lines"][number];

// A high-risk product's ingredient photo, looked at only for animal-derived
// ingredients; nothing is transcribed.
export const checkResult = z
  .object({
    id: z.string(),
    result: z.enum([
      "animal_ingredients",
      "none_found",
      "unclear",
      "no_ingredient_photo",
    ]),
    // Exactly as printed, e.g. "gelatin", "whey", "honey".
    animalIngredients: z.array(text).default([]),
    photosUsed: z.array(photo).default([]),
    notes: text.optional(),
  })
  .strict()
  .refine(
    (check) =>
      (check.result === "animal_ingredients") ===
      check.animalIngredients.length > 0,
    "List animalIngredients exactly when the result is animal_ingredients.",
  )
  .refine(
    (check) =>
      check.result === "no_ingredient_photo" || check.photosUsed.length,
    "List the photos you looked at.",
  );
export type CheckResult = z.infer<typeof checkResult>;

// The owner's corrections, applied last.
export const correction = z
  .object({
    id: z.string(),
    skip: z.boolean().optional(),
    brand: label.optional(),
    lineName: label.optional(),
    flavor: flavor.optional(),
    name: label.optional(),
    sizes: z.array(text).optional(),
    food: foodSlug.optional(),
    // Moves the product out of scope, naming the food it would need.
    outOfScope: label.optional(),
    label: packageLabel.optional(),
    // Where the corrected label's claim was seen.
    labelEvidence: text.optional(),
    // Stores where a later batch photographed this product again.
    alsoFoundAt: z.array(label).optional(),
    risk: riskLevel.optional(),
    riskReason: text.optional(),
    note: text.optional(),
  })
  .strict();
export type Correction = z.infer<typeof correction>;

export const setAsideChanges = z
  .object({
    keep: z.array(photo).default([]),
    add: z.array(setAsideEntry).default([]),
  })
  .strict();

export const storeChoice = z
  .object({ visits: z.record(z.string(), label) })
  .strict();

export const matchFile = z.record(
  z.string(),
  z
    .object({
      environment: z.string(),
      // The brand and name that were looked up, so a later rename shows.
      brand: z.string().optional(),
      name: z.string().optional(),
      candidates: z
        .array(
          z
            .object({
              name: z.string(),
              brand: z.string().nullable(),
              exact: z.boolean(),
            })
            .strict(),
        )
        .optional(),
      error: z.string().optional(),
    })
    .strict(),
);
