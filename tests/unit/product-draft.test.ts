import { describe, expect, it } from "vitest";
import {
  DRAFT_KEY,
  DRAFT_TTL,
  basicsErrors,
  clearDraft,
  emptyDraft,
  extrasErrors,
  forCountry,
  fromSubmission,
  loadDraft,
  saveDraft,
  toSubmission,
} from "../../app/lib/product-draft";
import { submissionInput } from "../../server/community/domain/contracts";

const memory = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
};
const basics = () => ({
  ...emptyDraft("gb", { kind: "existing", id: "ground-beef" }, 1),
  brand: "Richmond",
  name: "Meat Free Sausages",
});

describe("product draft", () => {
  it("asks only for the basics on step 1, in field order", () => {
    expect(Object.keys(basicsErrors(emptyDraft("US"), {}))).toEqual([
      "food",
      "brand",
      "name",
      "front",
    ]);
    expect(basicsErrors(basics(), { front: true })).toEqual({});
    // A suggested food needs a name and an aisle.
    expect(
      basicsErrors(
        {
          ...basics(),
          food: { kind: "new", name: "", aisleId: "", otherNames: [] },
        },
        { front: true },
      ),
    ).toMatchObject({ food: expect.any(String), aisle: expect.any(String) });
  });

  it("checks optional answers only when given", () => {
    expect(extrasErrors(basics())).toEqual({});
    const draft = basics();
    draft.ingredients.url = "http://brand.example/ingredients";
    draft.allergens.status = "declared";
    expect(Object.keys(extrasErrors(draft))).toEqual([
      "ingredientUrl",
      "allergens",
    ]);
  });

  it("builds a valid minimal submission and leaves empty answers out", () => {
    const minimal = toSubmission(basics(), { front: true });
    expect(minimal).toEqual({
      name: "Meat Free Sausages",
      brand: "Richmond",
      country: "GB",
      categoryIds: ["ground-beef"],
      imageSlots: ["front"],
      specialtyFlavor: false,
    });
    expect(submissionInput.safeParse(minimal).success).toBe(true);
  });

  it("carries every extra, a suggested food and other foods within five", () => {
    const draft = basics();
    draft.food = {
      kind: "new",
      name: "Sausage rolls",
      aisleId: "pork",
      otherNames: ["bangers"],
    };
    draft.alsoReplaces = ["a", "b", "c", "d", "e"];
    draft.rating = 4;
    draft.retailerIds = ["tesco"];
    draft.ingredients = {
      url: "https://brand.example/i",
      checked: true,
      label: "plant_based",
      note: "Checked the list.",
    };
    draft.allergens = { status: "declared", contains: ["soy"], mayContain: [] };
    const input = toSubmission(draft, { front: true, ingredients: true });
    expect(input).toMatchObject({
      categoryIds: ["a", "b", "c", "d"],
      newFood: { name: "Sausage rolls", aisleId: "pork", aliases: ["bangers"] },
      imageSlots: ["front", "ingredients"],
      noKnownAnimalIngredients: true,
      manufacturerLabel: "plant_based",
      rating: 4,
      retailerIds: ["tesco"],
      allergens: { status: "declared", contains: ["soy"], mayContain: [] },
    });
    expect(submissionInput.safeParse(input).success).toBe(true);
    // "Nothing animal-derived" is dropped without ingredient evidence.
    const bare = basics();
    bare.ingredients.checked = true;
    expect(toSubmission(bare, { front: true })).not.toHaveProperty(
      "noKnownAnimalIngredients",
    );
    // A follow-up draft round-trips the same submission.
    const followUp = { submissionId: "s", expectedRevision: 2 };
    expect(
      toSubmission(fromSubmission(input, followUp, 1), {
        front: true,
        ingredients: true,
      }),
    ).toEqual({ ...input, followUp });
  });

  it("keeps a draft for a day and ignores anything malformed", () => {
    const storage = memory();
    saveDraft(storage, basics(), 1_000);
    expect(loadDraft(storage, 1_000 + DRAFT_TTL - 1)?.name).toBe(
      "Meat Free Sausages",
    );
    expect(loadDraft(storage, 1_000 + DRAFT_TTL + 1)).toBeNull();
    storage.setItem(DRAFT_KEY, "{not json");
    expect(loadDraft(storage, 1_000)).toBeNull();
    storage.setItem(DRAFT_KEY, JSON.stringify({ v: 2 }));
    expect(loadDraft(storage, 1_000)).toBeNull();
    clearDraft(storage);
    expect(storage.values.size).toBe(0);
    // Storage that throws is the same as none.
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadDraft(broken)).toBeNull();
    expect(() => saveDraft(broken, basics())).not.toThrow();
    expect(() => clearDraft(broken)).not.toThrow();
  });
});

describe("moving a draft to another country", () => {
  it("keeps only the stores, allergens and related products the new country offers", () => {
    const draft = {
      ...emptyDraft("US", { kind: "existing", id: "ground-beef" }, 1),
      retailerIds: ["us-store", "both"],
      variants: {
        familyId: "family",
        relatedId: "us-product",
        relationship: "variant" as const,
        specialtyFlavor: false,
      },
      allergens: {
        status: "declared" as const,
        contains: ["soy", "celery"],
        mayContain: ["mustard"],
      },
    };
    const moved = forCountry(draft, "gb", {
      retailerIds: ["both", "gb-store"],
      allergens: ["soy", "mustard"],
    });
    expect(moved).toMatchObject({
      id: draft.id,
      country: "GB",
      food: draft.food,
      retailerIds: ["both"],
      allergens: {
        status: "declared",
        contains: ["soy"],
        mayContain: ["mustard"],
      },
      // A family belongs to the brand; a related product to the country.
      variants: { familyId: "family", relatedId: "", relationship: "" },
    });
  });
});
