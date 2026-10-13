import { describe, expect, it } from "vitest";
import {
  DRAFT_KEY,
  DRAFT_TTL,
  basicsErrors,
  clearDraft,
  editDraft,
  emptyDraft,
  extrasErrors,
  forCountry,
  fromSubmission,
  loadDraft,
  saveDraft,
  toSubmission,
  withoutFlavor,
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
// A new brand: something else from it is the only choice.
const basics = () => ({
  ...emptyDraft("gb", { food: { kind: "existing", id: "ground-beef" } }, 1),
  brand: "Richmond",
  brandChosen: true,
  line: { kind: "new" as const },
  name: "Meat Free Sausages",
});

describe("product draft", () => {
  it("asks only for the basics on step 1, in field order", () => {
    // The product's own fields wait until it's clear what it is.
    expect(Object.keys(basicsErrors(emptyDraft("US"), {}))).toEqual([
      "food",
      "brand",
    ]);
    expect(
      basicsErrors({ ...basics(), brandChosen: false }, { front: true }),
    ).toEqual({ brand: expect.stringMatching(/Choose the brand/) });
    expect(
      Object.keys(basicsErrors({ ...basics(), brandId: "b", line: null }, {})),
    ).toEqual(["line"]);
    expect(Object.keys(basicsErrors({ ...basics(), name: "" }, {}))).toEqual([
      "name",
      "front",
    ]);
    expect(basicsErrors(basics(), { front: true })).toEqual({});
    // A new flavor needs its flavor; a flavored new product its line's name.
    expect(
      Object.keys(
        basicsErrors(
          {
            ...basics(),
            line: { kind: "flavor", lineId: "l", lineName: "Sausages" },
          },
          { front: true },
        ),
      ),
    ).toEqual(["flavor"]);
    expect(
      Object.keys(
        basicsErrors({ ...basics(), flavor: "Spicy" }, { front: true }),
      ),
    ).toEqual(["lineName"]);
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
    });
    expect(submissionInput.safeParse(minimal).success).toBe(true);
  });

  it("joins a chosen line or names a flavored product's own line", () => {
    const flavor = editDraft(
      {
        ...basics(),
        brandId: "richmond",
        line: {
          kind: "flavor",
          lineId: "line-1",
          lineName: "Meat Free Sausages",
        },
        name: "",
        nameEdited: false,
      },
      { flavor: "Caramelised Onion" },
    );
    // The name follows the flavor until typed over.
    expect(flavor.name).toBe("Meat Free Sausages, Caramelised Onion");
    expect(toSubmission(flavor, { front: true })).toMatchObject({
      name: "Meat Free Sausages, Caramelised Onion",
      flavor: "Caramelised Onion",
      lineId: "line-1",
    });
    expect(
      editDraft(editDraft(flavor, { name: "Own name" }), { flavor: "Smoky" })
        .name,
    ).toBe("Own name");
    // Emptied to retype, it stays empty rather than refilling.
    expect(editDraft(flavor, { name: "" }).name).toBe("");
    // A line chosen after the flavor was typed fills the name at once.
    expect(
      editDraft({ ...flavor, name: "", nameEdited: false, flavor: "Smoky" }, {})
        .name,
    ).toBe("Meat Free Sausages, Smoky");
    // Something else, flavored: its line drops the flavor's words.
    const spicy = editDraft(
      editDraft(basics(), { name: "Meat Free Sausages Spicy" }),
      { flavor: "Spicy" },
    );
    expect(spicy.lineName).toBe("Meat Free Sausages");
    const input = toSubmission(spicy, { front: true });
    expect(input).toMatchObject({
      flavor: "Spicy",
      lineName: "Meat Free Sausages",
    });
    expect(input).not.toHaveProperty("lineId");
    expect(submissionInput.safeParse(input).success).toBe(true);
    // A new brand unchooses the brand and the line chosen with it.
    expect(editDraft(flavor, { brand: "Linda" })).toMatchObject({
      brandChosen: false,
      brandId: null,
      line: null,
    });
    expect(withoutFlavor("Oatly Oatmilk, Strawberry", "Strawberry")).toBe(
      "Oatly Oatmilk",
    );
    expect(withoutFlavor("Vanilla Bean Ice Cream", "vanilla bean")).toBe(
      "Ice Cream",
    );
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
    draft.enjoyment = 5;
    draft.seasonal = true;
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
      enjoyment: 5,
      seasonal: true,
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
    // A draft saved before lines (version 1) is ignored.
    storage.setItem(DRAFT_KEY, JSON.stringify({ ...basics(), v: 1 }));
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
  it("keeps only the stores, allergens and line the new country offers", () => {
    const draft = {
      ...emptyDraft(
        "US",
        {
          food: { kind: "existing", id: "ground-beef" },
          brand: { id: "b", name: "Beyond" },
          line: { lineId: "us-line", lineName: "Beyond Beef" },
        },
        1,
      ),
      retailerIds: ["us-store", "both"],
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
      // The brand is shared; a line is one country's.
      brandId: "b",
      line: null,
    });
  });
});
