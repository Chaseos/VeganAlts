import type { CatalogPatch } from "./moderation";

const labels: Partial<Record<keyof CatalogPatch, string>> = {
  legacyProjection: "Displayed classification",
  lifecycleStatus: "Product visibility",
  currentVersionId: "Current formula",
  classification: "Ingredient classification",
  ingredientTranscription: "Ingredient evidence",
  familyId: "Recipe line",
  brandId: "Brand",
  lineName: "Line name",
  categories: "Food ranking eligibility",
  name: "Product name",
  flavor: "Flavor",
  seasonal: "Seasonal",
  manufacturerUrl: "Manufacturer page",
  aliases: "Other names",
  addedCategories: "Food memberships to add",
  removedCategories: "Food memberships to remove",
  imageStates: "Photo visibility",
  commentStates: "Comment visibility",
  relationships: "Related products",
  retailer: "Retailer availability",
  retailerLinks: "Store confirmations",
  consolidation: "Duplicate redirect",
  allergens: "Allergen declaration",
};

/** The compensation restores the before patch; identity keys and newly created lines remain. */
export function reversalChanges(before: CatalogPatch, after: CatalogPatch) {
  return (Object.keys(before) as (keyof CatalogPatch)[]).flatMap<{
    field: keyof CatalogPatch;
    label: string;
    recorded: unknown;
    restore: unknown;
  }>((key) => {
    if (key === "removedCategories" || key === "addedCategories") {
      const restoresEligibility = key === "addedCategories";
      const memberships = before[key] ?? [];
      return memberships.length
        ? [
            {
              field: key,
              label: restoresEligibility
                ? "Restore food rankings"
                : "Remove from food rankings",
              recorded: memberships.map((categoryId) => ({
                categoryId,
                eligible: !restoresEligibility,
              })),
              restore: memberships.map((categoryId) => ({
                categoryId,
                eligible: restoresEligibility,
              })),
            },
          ]
        : [];
    }
    const label = labels[key];
    return label && JSON.stringify(before[key]) !== JSON.stringify(after[key])
      ? [{ field: key, label, recorded: after[key], restore: before[key] }]
      : [];
  });
}
export function catalogReferenceIds(value: unknown, key = ""): string[] {
  if (typeof value === "string")
    return /(?:^id$|Id$|^(added|removed)Categories$)/.test(key) ? [value] : [];
  if (Array.isArray(value))
    return value.flatMap((item) => catalogReferenceIds(item, key));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([field, item]) =>
      catalogReferenceIds(item, field),
    );
  return [];
}
