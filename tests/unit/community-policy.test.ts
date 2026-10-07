import { expect, it } from "vitest";
import {
  decideSubmission,
  effectiveDate,
  identityKey,
  normalizeName,
  productName,
  communityLimits,
} from "../../server/community/domain/policy";
import {
  evidenceUrl,
  submissionInput,
  reportInput,
} from "../../server/community/domain/contracts";
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
  expect(
    decideSubmission({ ...input, specialtyFlavor: true }, []).decision,
  ).toBe("NEEDS_REVIEW");
  expect(
    decideSubmission({ ...input, noKnownAnimalIngredients: false }, [])
      .decision,
  ).toBe("NEEDS_REVIEW");
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
  expect(
    submissionInput.safeParse({ ...input, ingredientUrl: undefined }).success,
  ).toBe(false);
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
