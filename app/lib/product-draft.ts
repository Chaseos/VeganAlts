import { z } from "zod";
import { hasIngredientEvidence as hasEvidence } from "@server/community/domain/policy";
import type {
  ManufacturerLabel,
  SubmissionInput,
} from "@server/community/domain/contracts";

/**
 * Add a product (milestone 6): the basics are required, everything else is
 * optional, and the text survives a reload in session storage. Photos are
 * files and stay in memory. Milestone 7: the basics choose a food, then a
 * brand, then a listed line's new flavor or something else from the brand.
 */
export const PHOTO_SLOTS = [
  "front",
  "ingredients",
  "back",
  "nutrition",
] as const;
export type PhotoSlot = (typeof PHOTO_SLOTS)[number];
export type DraftPhotos = Partial<Record<PhotoSlot, unknown>>;
export const MAX_FOODS = 5;
// A flavor label's length, as the server holds it.
export const MAX_FLAVOR = 40;

// What the product is, once the brand is chosen: a new flavor of one of the
// brand's listed lines, or something else from the brand (also the only
// choice for a new brand or one with nothing listed here).
const linePick = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("flavor"),
    lineId: z.string(),
    lineName: z.string(),
  }),
  z.object({ kind: z.literal("new") }),
]);
const foodPick = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), id: z.string() }),
  // A food suggested in place; an operator decides it with the product.
  z.object({
    kind: z.literal("new"),
    name: z.string(),
    aisleId: z.string(),
    otherNames: z.array(z.string()),
  }),
]);
const draftSchema = z.object({
  // Version 2 (milestone 7) ignores drafts saved before lines.
  v: z.literal(2),
  // Ties photos kept in IndexedDB to the draft they were picked for.
  id: z.string().min(1),
  country: z.string().regex(/^[A-Z]{2}$/),
  food: foodPick.nullable(),
  brand: z.string(),
  // The brand chosen from the suggestions (null: added as a new brand).
  // Typing again unchooses it.
  brandId: z.string().nullable(),
  brandChosen: z.boolean(),
  line: linePick.nullable(),
  name: z.string(),
  flavor: z.string(),
  // A flavored new product's line: "Name without the flavor".
  lineName: z.string(),
  // Fields typed over keep their text; untouched ones follow the flavor.
  nameEdited: z.boolean(),
  lineNameEdited: z.boolean(),
  // Null follows the food's season.
  seasonal: z.boolean().nullable(),
  rating: z.number().int().min(1).max(5).nullable(),
  // The optional Tastiest answer, given with a rating.
  enjoyment: z.number().int().min(1).max(5).nullable(),
  ingredients: z.object({
    url: z.string(),
    checked: z.boolean(),
    label: z.enum(["vegan", "plant_based", "neither", "unknown"]),
    note: z.string(),
  }),
  allergens: z.object({
    status: z.enum(["declared", "none_declared"]).nullable(),
    contains: z.array(z.string()),
    mayContain: z.array(z.string()),
  }),
  retailerIds: z.array(z.string()),
  alsoReplaces: z.array(z.string()),
  followUp: z
    .object({ submissionId: z.string(), expectedRevision: z.number() })
    .optional(),
  // The food a link chose when the draft began, so returning to that link
  // continues the draft even after the food was changed.
  startedFrom: z.string().optional(),
  savedAt: z.number(),
});
export type ProductDraft = z.infer<typeof draftSchema>;
export type FoodPick = z.infer<typeof foodPick>;
export type LinePick = z.infer<typeof linePick>;
// Where a link started the draft: a food page, a product's "Add another
// flavor" (its line) or a brand page.
export interface DraftStart {
  food?: FoodPick | null;
  brand?: { id: string; name: string } | null;
  line?: { lineId: string; lineName: string } | null;
}

export function emptyDraft(
  country: string,
  start: DraftStart = {},
  now = Date.now(),
): ProductDraft {
  const food = start.food ?? null;
  return {
    v: 2,
    id: crypto.randomUUID(),
    country: country.toUpperCase(),
    food,
    brand: start.brand?.name ?? "",
    brandId: start.brand?.id ?? null,
    brandChosen: Boolean(start.brand),
    line: start.line ? { kind: "flavor", ...start.line } : null,
    name: "",
    flavor: "",
    lineName: "",
    nameEdited: false,
    lineNameEdited: false,
    seasonal: null,
    rating: null,
    enjoyment: null,
    ingredients: { url: "", checked: false, label: "unknown", note: "" },
    allergens: { status: null, contains: [], mayContain: [] },
    retailerIds: [],
    alsoReplaces: [],
    ...(food?.kind === "existing" ? { startedFrom: food.id } : {}),
    savedAt: now,
  };
}

/** The words of a flavor taken out of a name: "Oat Milk Vanilla" → "Oat Milk". */
export function withoutFlavor(name: string, flavor: string) {
  const words = new Set(
    flavor
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter(Boolean) ?? [],
  );
  if (!words.size) return name.trim();
  return name
    .split(/\s+/)
    .filter((word) => {
      const bare = word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      return !bare || !words.has(bare);
    })
    .join(" ")
    .replace(/[\s,–—-]+$/u, "")
    .replace(/^[\s,–—-]+/u, "")
    .trim();
}

/**
 * A text change with what follows from it: a new flavor's name is "[line],
 * [flavor]" and a flavored new product's line is its name without the
 * flavor, each until typed over. A new brand undoes the brand choice and the
 * line chosen with it.
 */
export function editDraft(
  draft: ProductDraft,
  patch: Partial<Pick<ProductDraft, "brand" | "name" | "flavor" | "lineName">>,
): ProductDraft {
  const next = { ...draft, ...patch };
  if (patch.brand !== undefined && patch.brand !== draft.brand) {
    next.brandId = null;
    next.brandChosen = false;
    next.line = null;
  }
  if (patch.name !== undefined) next.nameEdited = patch.name.trim() !== "";
  if (patch.lineName !== undefined)
    next.lineNameEdited = patch.lineName.trim() !== "";
  const flavor = next.flavor.trim();
  if (next.line?.kind === "flavor" && !next.nameEdited)
    next.name = flavor ? `${next.line.lineName}, ${flavor}` : "";
  if (next.line?.kind === "new" && !next.lineNameEdited)
    next.lineName = flavor ? withoutFlavor(next.name, flavor) : "";
  return next;
}

export type DraftField =
  | "food"
  | "aisle"
  | "brand"
  | "line"
  | "flavor"
  | "name"
  | "lineName"
  | "front"
  | "duplicate"
  | "ingredientUrl"
  | "allergens";
export type DraftErrors = Partial<Record<DraftField, string>>;

const enough = (value: string) => value.trim().length >= 2;
/** What step 1 still needs, in the order the fields appear. */
export function basicsErrors(
  draft: ProductDraft,
  photos: DraftPhotos,
): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.food)
    errors.food = "Choose the food it replaces, or suggest a new one.";
  else if (draft.food.kind === "new") {
    if (!enough(draft.food.name)) errors.food = "Name the food it replaces.";
    if (!draft.food.aisleId)
      errors.aisle = "Choose the aisle where you’d find it in a store.";
  }
  if (!enough(draft.brand)) errors.brand = "Enter the brand.";
  else if (!draft.brandChosen)
    errors.brand = "Choose the brand from the list, or add it as a new brand.";
  else if (!draft.line)
    errors.line =
      "Choose the product if it’s listed, a new flavor of a line, or something else from the brand.";
  // The product's own fields appear once it's clear what it is.
  if (!draft.line) return errors;
  if (draft.line.kind === "flavor" && !draft.flavor.trim())
    errors.flavor = "Enter the flavor.";
  if (draft.flavor.trim().length > MAX_FLAVOR)
    errors.flavor = `Keep the flavor to ${MAX_FLAVOR} characters.`;
  if (!enough(draft.name)) errors.name = "Enter the product name.";
  if (
    draft.line.kind === "new" &&
    draft.flavor.trim() &&
    !enough(draft.lineName)
  )
    errors.lineName = "Enter the name without the flavor.";
  if (!photos.front) errors.front = "Add a photo of the front of the package.";
  return errors;
}

/** What step 2's optional answers get wrong; empty answers are fine. */
export function extrasErrors(draft: ProductDraft): DraftErrors {
  const errors: DraftErrors = {};
  const url = draft.ingredients.url.trim();
  if (url) {
    let valid = false;
    try {
      const parsed = new URL(url);
      valid =
        parsed.protocol === "https:" && !parsed.username && !parsed.password;
    } catch {
      valid = false;
    }
    if (!valid)
      errors.ingredientUrl =
        "Use an HTTPS link, like https://brand.example/ingredients.";
  }
  if (
    draft.allergens.status === "declared" &&
    !draft.allergens.contains.length &&
    !draft.allergens.mayContain.length
  )
    errors.allergens =
      "Choose the allergens the label lists, or choose “No allergens declared”.";
  return errors;
}

// The server's rule: an ingredients photo or a manufacturer source.
export const hasIngredientEvidence = (
  draft: ProductDraft,
  photos: DraftPhotos,
) =>
  hasEvidence({
    imageSlots: PHOTO_SLOTS.filter((slot) => photos[slot]),
    ingredientUrl: draft.ingredients.url.trim() || undefined,
  });

/**
 * The submission the server checks. Optional answers left empty are left out,
 * so the same draft always produces the same payload.
 */
export function toSubmission(
  draft: ProductDraft,
  photos: DraftPhotos,
): SubmissionInput {
  const food = draft.food;
  const url = draft.ingredients.url.trim(),
    note = draft.ingredients.note.trim();
  const { status, contains, mayContain } = draft.allergens;
  const flavor = draft.flavor.trim(),
    lineName = draft.lineName.trim();
  return {
    name: draft.name.trim(),
    brand: draft.brand.trim(),
    country: draft.country,
    categoryIds: [
      ...(food?.kind === "existing" ? [food.id] : []),
      ...draft.alsoReplaces.filter(
        (id) => !(food?.kind === "existing" && food.id === id),
      ),
    ].slice(0, MAX_FOODS - (food?.kind === "new" ? 1 : 0)),
    ...(food?.kind === "new"
      ? {
          newFood: {
            name: food.name.trim(),
            aisleId: food.aisleId,
            ...(food.otherNames.length ? { aliases: food.otherNames } : {}),
          },
        }
      : {}),
    imageSlots: PHOTO_SLOTS.filter((slot) => photos[slot]),
    ...(url ? { ingredientUrl: url } : {}),
    ...(note ? { statusBasis: note } : {}),
    // "Nothing animal-derived" only means something with evidence attached.
    ...(hasIngredientEvidence(draft, photos) && draft.ingredients.checked
      ? { noKnownAnimalIngredients: true }
      : {}),
    ...(draft.ingredients.label !== "unknown"
      ? { manufacturerLabel: draft.ingredients.label }
      : {}),
    ...(draft.rating ? { rating: draft.rating } : {}),
    ...(draft.rating && draft.enjoyment ? { enjoyment: draft.enjoyment } : {}),
    ...(draft.retailerIds.length ? { retailerIds: draft.retailerIds } : {}),
    ...(status === "none_declared"
      ? { allergens: { status } }
      : status === "declared"
        ? { allergens: { status, contains, mayContain } }
        : {}),
    ...(flavor ? { flavor } : {}),
    // A new flavor joins its line; a flavored new product names its own.
    ...(draft.line?.kind === "flavor" ? { lineId: draft.line.lineId } : {}),
    ...(draft.line?.kind === "new" && flavor && lineName ? { lineName } : {}),
    ...(draft.seasonal !== null ? { seasonal: draft.seasonal } : {}),
    ...(draft.followUp ? { followUp: draft.followUp } : {}),
  };
}

/**
 * The draft moved to another country. Stores, allergens and lines are each
 * country's own, so choices the new country doesn't offer are dropped rather
 * than kept where no control can clear them. The brand is shared.
 */
export function forCountry(
  draft: ProductDraft,
  country: string,
  offered: { retailerIds: readonly string[]; allergens: readonly string[] },
): ProductDraft {
  const allergen = (key: string) => offered.allergens.includes(key);
  return {
    ...draft,
    country: country.toUpperCase(),
    retailerIds: draft.retailerIds.filter((id) =>
      offered.retailerIds.includes(id),
    ),
    allergens: {
      ...draft.allergens,
      contains: draft.allergens.contains.filter(allergen),
      mayContain: draft.allergens.mayContain.filter(allergen),
    },
    line: null,
  };
}

/** A draft from an earlier submission, for answering a follow-up. */
export function fromSubmission(
  input: SubmissionInput,
  followUp: { submissionId: string; expectedRevision: number },
  now = Date.now(),
): ProductDraft {
  const [first, ...rest] = input.categoryIds;
  return {
    ...emptyDraft(input.country, {}, now),
    food: input.newFood
      ? {
          kind: "new",
          name: input.newFood.name,
          aisleId: input.newFood.aisleId,
          otherNames: input.newFood.aliases ?? [],
        }
      : first
        ? { kind: "existing", id: first }
        : null,
    alsoReplaces: input.newFood ? input.categoryIds : rest,
    brand: input.brand,
    // The brand and line are checked again when it's resubmitted.
    brandChosen: true,
    line: input.lineId
      ? { kind: "flavor", lineId: input.lineId, lineName: "" }
      : { kind: "new" },
    name: input.name,
    flavor: input.flavor ?? "",
    lineName: input.lineName ?? "",
    nameEdited: true,
    lineNameEdited: true,
    seasonal: input.seasonal ?? null,
    rating: input.rating ?? null,
    enjoyment: input.enjoyment ?? null,
    ingredients: {
      url: input.ingredientUrl ?? "",
      checked: input.noKnownAnimalIngredients ?? false,
      label: (input.manufacturerLabel ?? "unknown") as ManufacturerLabel,
      note: input.statusBasis ?? "",
    },
    allergens: input.allergens
      ? input.allergens.status === "declared"
        ? { ...input.allergens }
        : { status: "none_declared", contains: [], mayContain: [] }
      : { status: null, contains: [], mayContain: [] },
    retailerIds: input.retailerIds ?? [],
    followUp,
  };
}

export const DRAFT_KEY = "veganalts.product-draft.v2";
// A reply to a moderator's follow-up keeps its own draft, so it survives a
// reload without replacing an unfinished new product.
export const draftKey = (followUp?: { submissionId: string } | null) =>
  followUp ? `${DRAFT_KEY}:follow-up:${followUp.submissionId}` : DRAFT_KEY;
export const DRAFT_TTL = 24 * 60 * 60 * 1000;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Storage can be missing or throw (private windows, blocked site data); a
// draft is a convenience, so every failure just means "no draft".
export function loadDraft(
  storage: DraftStorage | null,
  now = Date.now(),
  key = DRAFT_KEY,
): ProductDraft | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || now - parsed.data.savedAt > DRAFT_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
export function saveDraft(
  storage: DraftStorage | null,
  draft: ProductDraft,
  now = Date.now(),
  key = DRAFT_KEY,
) {
  try {
    storage?.setItem(key, JSON.stringify({ ...draft, savedAt: now }));
  } catch {
    // Quota or privacy settings: the form still works without a draft.
  }
}
export function clearDraft(storage: DraftStorage | null, key = DRAFT_KEY) {
  try {
    storage?.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
