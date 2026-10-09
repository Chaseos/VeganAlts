import type { ProductChange } from "./contracts";
import { describeDeclaration } from "./allergens";

const label = (value: string) => value.replaceAll("_", " ");

/** A short plain-language description of a proposed product change. */
export function describeChange(
  change: ProductChange,
  names: Record<string, string> = {},
) {
  switch (change.kind) {
    case "rename":
      return `Rename to “${change.name}”`;
    case "alias":
      return `Also findable as “${change.alias}”`;
    case "source_url":
      return `Manufacturer page: ${change.url}`;
    case "category_add":
      return `Also replaces ${names[change.categoryId] ?? "another category"}`;
    case "packaging":
      return "Updated packaging photos";
    case "photo":
      return change.reason === "missing"
        ? `New ${change.slot} photo`
        : `Better ${change.slot} photo (${label(change.reason)})`;
    case "discontinue":
      return "No longer sold";
    case "reintroduce":
      return change.sameFormula
        ? "Back on sale with the same formula"
        : `Back on sale as “${change.versionLabel}”`;
    case "reformulation":
      return `New formula “${change.versionLabel}”`;
    case "classification":
      return `Classification: ${label(change.veganStatus)}`;
    case "relationships":
      return "Family, variant or category eligibility";
    case "retailer_status":
      return `Retailer availability: ${label(change.status)}`;
    case "allergens":
      return `Allergens: ${describeDeclaration(change.declaration, names)}`;
  }
}
