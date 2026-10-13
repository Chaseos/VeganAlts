import { expect, it } from "vitest";
import {
  decideSubmission,
  effectiveDate,
  identityKey,
  normalizeName,
  productName,
  communityLimits,
  provisionalClassification,
} from "../../server/community/domain/policy";
import {
  changeInput,
  evidenceUrl,
  submissionInput,
  reportInput,
} from "../../server/community/domain/contracts";
import {
  assertCompensable,
  assertProposalCurrent,
  proposalBaseline,
} from "../../server/community/domain/change-policy";
import {
  contributorProduct,
  type ProductSnapshot,
} from "../../server/community/domain/moderation";
import { isNewProduct } from "../../server/catalog/application/service";
const input = submissionInput.parse({
  name: "Burger",
  brand: "Garden",
  country: "US",
  categoryIds: ["burger"],
  imageSlots: ["front"],
  ingredientUrl: "https://example.com/ingredients",
  statusBasis: "No animal-derived ingredients appear in this ingredient list.",
  noKnownAnimalIngredients: true,
  manufacturerLabel: "vegan",
});
it("normalizes punctuation and package quantities without conflating flavor and formula identities", () => {
  expect(identityKey("US", "Garden's", "Burger 12 oz")).toBe(
    identityKey("US", "Gardens", "Burger 340 g"),
  );
  expect(productName("Smoky Burger 2 pack")).not.toBe(productName("Burger"));
  expect(productName("Burger 2.0")).not.toBe(productName("Burger"));
  expect(normalizeName("Green-Mart")).toBe(normalizeName("Green Mart"));
  expect(identityKey("CA", "Garden", "Burger")).not.toBe(
    identityKey("US", "Garden", "Burger"),
  );
});
it("distinguishes deterministic publication, actionable duplicates and manual review", () => {
  expect(decideSubmission(input, []).decision).toBe("READY");
  // Joining a line, naming a new one or giving a flavor never holds
  // (milestone 7).
  expect(
    decideSubmission({ ...input, lineId: "line", flavor: "Vanilla" }, [])
      .decision,
  ).toBe("READY");
  expect(
    decideSubmission(
      { ...input, flavor: "Spicy", lineName: "Smoky Burger" },
      [],
    ).decision,
  ).toBe("READY");
  // Unconfirmed ingredients publish as "not checked yet" (milestone 6).
  expect(
    decideSubmission({ ...input, noKnownAnimalIngredients: false }, [])
      .decision,
  ).toBe("READY");
  expect(
    decideSubmission(input, [
      {
        id: "existing",
        name: "Burger",
        slug: "burger",
        brand: "Garden",
        countryId: "US",
        exact: true,
      },
    ]).decision,
  ).toBe("NEEDS_CHANGES");
  // A label listing an animal-derived allergen contradicts the
  // classification; a cross-contact statement does not.
  expect(
    decideSubmission(
      {
        ...input,
        allergens: { status: "declared", contains: ["milk"], mayContain: [] },
      },
      [],
    ).decision,
  ).toBe("NEEDS_REVIEW");
  expect(
    decideSubmission(
      {
        ...input,
        allergens: { status: "declared", contains: [], mayContain: ["milk"] },
      },
      [],
    ).decision,
  ).toBe("READY");
  // A suggested food waits for an operator.
  expect(
    decideSubmission(
      { ...input, newFood: { name: "Bratwurst", aisleId: "pork" } },
      [],
    ).decision,
  ).toBe("NEEDS_REVIEW");
});
it("requires only a name, brand, country, food and front photo", () => {
  const minimal = {
    name: "Burger",
    brand: "Garden",
    country: "US",
    categoryIds: ["burger"],
    imageSlots: ["front"],
  };
  expect(submissionInput.safeParse(minimal).success).toBe(true);
  // Ingredient evidence and the classification note are optional.
  expect(
    submissionInput.safeParse({ ...input, ingredientUrl: undefined }).success,
  ).toBe(true);
  // A food is required: an existing one or a suggested one, five at most.
  expect(
    submissionInput.safeParse({ ...minimal, categoryIds: [] }).success,
  ).toBe(false);
  expect(
    submissionInput.safeParse({
      ...minimal,
      categoryIds: [],
      newFood: { name: "Bratwurst", aisleId: "pork" },
    }).success,
  ).toBe(true);
  expect(
    submissionInput.safeParse({
      ...minimal,
      categoryIds: ["a", "b", "c", "d", "e"],
      newFood: { name: "Bratwurst", aisleId: "pork" },
    }).success,
  ).toBe(false);
  // A front photo is required, and four photos at most.
  expect(
    submissionInput.safeParse({ ...minimal, imageSlots: ["ingredients"] })
      .success,
  ).toBe(false);
  expect(
    submissionInput.safeParse({
      ...minimal,
      imageSlots: ["front", "ingredients", "back", "nutrition"],
    }).success,
  ).toBe(true);
  expect(
    submissionInput.safeParse({
      ...minimal,
      imageSlots: ["front", "ingredients", "back", "nutrition", "prepared"],
    }).success,
  ).toBe(false);
  // Extras are optional and bounded.
  expect(
    submissionInput.safeParse({
      ...minimal,
      rating: 4,
      retailerIds: ["store"],
      allergens: { status: "none_declared" },
    }).success,
  ).toBe(true);
  expect(submissionInput.safeParse({ ...minimal, rating: 6 }).success).toBe(
    false,
  );
});
it("retains approximate date precision and rejects invented or malformed dates", () => {
  expect(effectiveDate("2026")).toMatchObject({
    date: "2026",
    precision: "year",
  });
  expect(effectiveDate("2026-09")).toMatchObject({
    date: "2026-09",
    precision: "month",
  });
  expect(effectiveDate("2024-02-29")).toMatchObject({ precision: "day" });
  expect(effectiveDate()).toMatchObject({ date: null, precision: "unknown" });
  for (const value of ["2026-02-29", "2026-13", "2026-00", "1800"])
    expect(() => effectiveDate(value)).toThrow();
});
it("validates evidence references, target-specific report reasons and configurable safeguards", () => {
  for (const value of [
    "bad URL",
    "javascript:alert(1)",
    "http://example.com",
    "https://user:password@example.com",
  ])
    expect(evidenceUrl.safeParse(value).success).toBe(false);
  expect(
    reportInput.safeParse({
      targetType: "comment",
      targetId: "comment",
      reason: "ingredient_concern",
    }).success,
  ).toBe(false);
  expect(communityLimits('{"concurrentUploads":1}').concurrentUploads).toBe(1);
  expect(() => communityLimits('{"concurrentUploads":0}')).toThrow();
});

const snapshot: ProductSnapshot = {
  id: "product",
  name: "Burger",
  slug: "burger",
  countryId: "US",
  countryCode: "us",
  brandId: "brand",
  familyId: null,
  lineName: null,
  flavor: null,
  seasonal: false,
  lifecycleStatus: "active",
  veganStatus: "appears_vegan",
  manufacturerLabel: "vegan",
  manufacturerUrl: null,
  aliases: [],
  countedRatings: 0,
  revision: 4,
  versionId: "formula",
  versionLabel: null,
  classification: {
    veganStatus: "appears_vegan",
    manufacturerLabel: "vegan",
    evidence: { urls: [], imageIds: [], note: "Reviewed label evidence." },
    certifications: [],
    reviewedBy: "operator",
  },
  categories: [{ categoryId: "burger", eligible: true }],
  images: [
    { id: "front-old", versionId: "formula", slot: "front", state: "rejected" },
    { id: "front-new", versionId: "formula", slot: "front", state: "accepted" },
    { id: "back", versionId: "formula", slot: "back", state: "pending" },
  ],
  allergens: null,
  allergenSource: null,
  allergenList: [
    { key: "soy", label: "Soy" },
    { key: "wheat", label: "Wheat" },
    { key: "milk", label: "Milk" },
  ],
  relationships: [],
  retailers: [
    {
      retailerId: "market",
      name: "Market",
      status: "active",
      contributorCount: 1,
      disagreementCount: 0,
      lastConfirmedAt: 1,
    },
  ],
};
const evidence = { urls: [], imageIds: [], note: "Package evidence attached." };
it("keeps proposals acceptable through unrelated catalog activity but not competing changes", () => {
  const classification = changeInput.parse({
    kind: "classification",
    productId: "product",
    expectedRevision: 4,
    evidence,
    veganStatus: "vegan",
    manufacturerLabel: "vegan",
  });
  const baseline = proposalBaseline(snapshot, classification);
  // A retailer confirmation or photo change advances the revision only.
  const busier = {
    ...snapshot,
    revision: 9,
    retailers: [{ ...snapshot.retailers[0]!, contributorCount: 5 }],
  };
  expect(() =>
    assertProposalCurrent(busier, classification, baseline),
  ).not.toThrow();
  expect(() =>
    assertProposalCurrent(
      {
        ...busier,
        classification: {
          ...snapshot.classification!,
          veganStatus: "under_review",
        },
      },
      classification,
      baseline,
    ),
  ).toThrow(/changed/);
  // Proposals without a recorded baseline keep the strict revision rule.
  expect(() => assertProposalCurrent(busier, classification, null)).toThrow();
  const packaging = changeInput.parse({
    kind: "packaging",
    productId: "product",
    expectedRevision: 4,
    evidence,
  });
  const photos = proposalBaseline(snapshot, packaging, ["front"]);
  expect(photos).toEqual({
    versionId: "formula",
    images: { front: "front-new" },
  });
  expect(() =>
    assertProposalCurrent(
      {
        ...busier,
        images: [
          ...snapshot.images,
          {
            id: "nutrition",
            versionId: "formula",
            slot: "nutrition",
            state: "accepted",
          },
        ],
      },
      packaging,
      photos,
    ),
  ).not.toThrow();
});
it("refuses to restore a photo into a slot a newer photo holds", () => {
  const removal = {
    before: { imageStates: [{ id: "front-old", state: "accepted" }] },
    after: { imageStates: [{ id: "front-old", state: "rejected" }] },
  };
  expect(() =>
    assertCompensable(snapshot, removal.after, removal.before),
  ).toThrow(/later catalog change/);
  // The same restore is valid when the reversal also retires the newer photo.
  expect(() =>
    assertCompensable(
      snapshot,
      {
        imageStates: [
          { id: "front-old", state: "rejected" },
          { id: "front-new", state: "accepted" },
        ],
      },
      {
        imageStates: [
          { id: "front-old", state: "accepted" },
          { id: "front-new", state: "rejected" },
        ],
      },
    ),
  ).not.toThrow();
});
it("classifies by the evidence given, and more evidence never does worse", () => {
  const unchecked = { veganStatus: "appears_vegan", ingredientsChecked: false };
  const labels = ["vegan", "plant_based", "neither", "unknown"] as const;
  const shapes = [
    { imageSlots: ["front"] as const, ingredientUrl: undefined },
    { imageSlots: ["front", "ingredients"] as const, ingredientUrl: undefined },
    {
      imageSlots: ["front"] as const,
      ingredientUrl: "https://example.com/ingredients",
    },
  ];
  // Rank: unchecked < plant-based < appears vegan.
  const rank = (c: ReturnType<typeof provisionalClassification>) =>
    !c.ingredientsChecked ? 0 : c.veganStatus === "plant_based" ? 1 : 2;
  for (const manufacturerLabel of labels)
    for (const noKnownAnimalIngredients of [false, true]) {
      const facts = { manufacturerLabel, noKnownAnimalIngredients };
      const none = provisionalClassification({ ...shapes[0]!, ...facts });
      // No ingredient evidence is always "not checked yet".
      expect(none).toEqual(unchecked);
      for (const shape of shapes.slice(1)) {
        const given = provisionalClassification({
          ...shape,
          imageSlots: [...shape.imageSlots],
          ...facts,
        });
        expect(rank(given)).toBeGreaterThanOrEqual(rank(none));
        expect(given).toEqual(
          noKnownAnimalIngredients
            ? { veganStatus: "appears_vegan", ingredientsChecked: true }
            : manufacturerLabel === "plant_based"
              ? { veganStatus: "plant_based", ingredientsChecked: true }
              : unchecked,
        );
      }
    }
  // A label listing an animal-derived allergen leaves the classification to
  // an operator; a cross-contact statement does not.
  const evidence = {
    imageSlots: ["front", "ingredients"],
    noKnownAnimalIngredients: true,
  };
  expect(
    provisionalClassification({
      ...evidence,
      allergens: { status: "declared", contains: ["egg"], mayContain: [] },
    }),
  ).toEqual(unchecked);
  expect(
    provisionalClassification({
      ...evidence,
      allergens: { status: "declared", contains: [], mayContain: ["egg"] },
    }),
  ).toEqual({ veganStatus: "appears_vegan", ingredientsChecked: true });
  // An unreadable ingredients photo counts only when a source backs it.
  const photo = { ...input, imageSlots: ["front", "ingredients"] as const };
  expect(
    provisionalClassification(
      { ...photo, imageSlots: [...photo.imageSlots], ingredientUrl: undefined },
      { unreadablePhoto: true },
    ),
  ).toEqual(unchecked);
  expect(
    provisionalClassification(
      { ...photo, imageSlots: [...photo.imageSlots] },
      { unreadablePhoto: true },
    ).ingredientsChecked,
  ).toBe(true);
});
it("hides reviewer identities and non-public photos from contributors", () => {
  const view = contributorProduct(snapshot);
  expect(view.classification).toMatchObject({ reviewed: true });
  expect(JSON.stringify(view)).not.toContain("operator");
  expect(view.images.map((i) => i.id)).toEqual(["front-new"]);
});
it("decides the New label once, from the publication time", () => {
  const day = 86_400_000;
  expect(isNewProduct(1_000 * day, 1_029 * day)).toBe(true);
  expect(isNewProduct(1_000 * day, 1_030 * day)).toBe(false);
  expect(isNewProduct(1_001 * day, 1_000 * day)).toBe(false);
  expect(isNewProduct(null, 1_000 * day)).toBe(false);
});
