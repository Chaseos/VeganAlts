import { z } from "zod";
import type {
  ManufacturerLabel,
  SubmissionInput,
} from "@server/community/domain/contracts";

/**
 * Add a product (milestone 6): the basics are required, everything else is
 * optional, and the text survives a reload in session storage. Photos are
 * files and stay in memory.
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

const relationship = z.enum([
  "variant",
  "specialty_flavor",
  "companion",
  "successor",
]);
const foodPick = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), id: z.string() }),
  // A food suggested in place; an operator decides it with the product.
  z.object({
    kind: z.literal("new"),
    name: z.string(),
    shelfId: z.string(),
    otherNames: z.array(z.string()),
  }),
]);
const draftSchema = z.object({
  v: z.literal(1),
  country: z.string().regex(/^[A-Z]{2}$/),
  food: foodPick.nullable(),
  brand: z.string(),
  name: z.string(),
  rating: z.number().int().min(1).max(5).nullable(),
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
  variants: z.object({
    familyId: z.string(),
    relatedId: z.string(),
    relationship: relationship.or(z.literal("")),
    specialtyFlavor: z.boolean(),
  }),
  followUp: z
    .object({ submissionId: z.string(), expectedRevision: z.number() })
    .optional(),
  savedAt: z.number(),
});
export type ProductDraft = z.infer<typeof draftSchema>;
export type FoodPick = z.infer<typeof foodPick>;

export function emptyDraft(
  country: string,
  food: FoodPick | null = null,
  now = Date.now(),
): ProductDraft {
  return {
    v: 1,
    country: country.toUpperCase(),
    food,
    brand: "",
    name: "",
    rating: null,
    ingredients: { url: "", checked: false, label: "unknown", note: "" },
    allergens: { status: null, contains: [], mayContain: [] },
    retailerIds: [],
    alsoReplaces: [],
    variants: {
      familyId: "",
      relatedId: "",
      relationship: "",
      specialtyFlavor: false,
    },
    savedAt: now,
  };
}

export type DraftField =
  | "food"
  | "shelf"
  | "brand"
  | "name"
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
    if (!draft.food.shelfId)
      errors.shelf = "Choose the shelf where you’d find it in a store.";
  }
  if (!enough(draft.brand)) errors.brand = "Enter the brand.";
  if (!enough(draft.name)) errors.name = "Enter the product name.";
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

export const hasIngredientEvidence = (
  draft: ProductDraft,
  photos: DraftPhotos,
) => Boolean(photos.ingredients) || Boolean(draft.ingredients.url.trim());

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
  const { familyId, relatedId, relationship } = draft.variants;
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
            shelfId: food.shelfId,
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
    ...(draft.retailerIds.length ? { retailerIds: draft.retailerIds } : {}),
    ...(status === "none_declared"
      ? { allergens: { status } }
      : status === "declared"
        ? { allergens: { status, contains, mayContain } }
        : {}),
    ...(familyId ? { productFamilyId: familyId } : {}),
    ...(relatedId && relationship
      ? { relatedProductId: relatedId, relationship }
      : {}),
    specialtyFlavor: draft.variants.specialtyFlavor,
    ...(draft.followUp ? { followUp: draft.followUp } : {}),
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
    ...emptyDraft(input.country, null, now),
    food: input.newFood
      ? {
          kind: "new",
          name: input.newFood.name,
          shelfId: input.newFood.shelfId,
          otherNames: input.newFood.aliases ?? [],
        }
      : first
        ? { kind: "existing", id: first }
        : null,
    alsoReplaces: input.newFood ? input.categoryIds : rest,
    brand: input.brand,
    name: input.name,
    rating: input.rating ?? null,
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
    variants: {
      familyId: input.productFamilyId ?? "",
      relatedId: input.relatedProductId ?? "",
      relationship: input.relationship ?? "",
      specialtyFlavor: input.specialtyFlavor ?? false,
    },
    followUp,
  };
}

export const DRAFT_KEY = "veganalts.product-draft.v1";
export const DRAFT_TTL = 24 * 60 * 60 * 1000;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Storage can be missing or throw (private windows, blocked site data); a
// draft is a convenience, so every failure just means "no draft".
export function loadDraft(
  storage: DraftStorage | null,
  now = Date.now(),
): ProductDraft | null {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
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
) {
  try {
    storage?.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: now }));
  } catch {
    // Quota or privacy settings: the form still works without a draft.
  }
}
export function clearDraft(storage: DraftStorage | null) {
  try {
    storage?.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}
