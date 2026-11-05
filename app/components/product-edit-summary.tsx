import { describeDeclaration } from "@server/community/domain/allergens";
import type { ProductChange } from "@server/community/domain/contracts";
import type { ContributorProduct } from "@server/community/domain/moderation";
import { allergenLabels } from "./allergen-fields";
import { veganStatusLabel } from "./ui/badges";

type Kind = ProductChange["kind"];

/**
 * What a product says now, each fact with its own way in, so an administrator
 * sees what can change instead of guessing which edit to choose.
 */
export function ProductEditSummary({
  product,
  categoryNames,
  onChange,
}: {
  product: ContributorProduct & { brandName: string | null };
  categoryNames: Record<string, string>;
  onChange: (kind: Kind) => void;
}) {
  const discontinued = product.lifecycleStatus === "discontinued";
  const rows: [label: string, value: string, kind: Kind][] = [
    ["Name", product.name, "rename"],
    ["Brand", product.brandName ?? "None", "brand"],
    ["Flavor", product.flavor ?? "Original", "rename"],
    [
      "Food",
      product.categories
        .filter((c) => c.eligible)
        .map((c) => categoryNames[c.categoryId] ?? "Unknown food")
        .join(", "),
      "foods",
    ],
    ["Line", product.lineName ?? "None", "relationships"],
    ["Seasonal", product.seasonal ? "Yes" : "No", "seasonal"],
    [
      "Search names",
      product.aliases.length ? product.aliases.join(", ") : "None",
      "alias",
    ],
    ["Manufacturer page", product.manufacturerUrl ?? "None", "source_url"],
    ["Vegan status", veganStatusLabel(product.veganStatus), "classification"],
    [
      "Allergens",
      product.allergens
        ? describeDeclaration(product.allergens, allergenLabels(product))
        : "Not confirmed yet",
      "allergens",
    ],
    [
      "Availability",
      discontinued ? "Discontinued" : "On sale",
      discontinued ? "reintroduce" : "discontinue",
    ],
  ];
  return (
    <dl className="va-edit-facts">
      {rows.map(([label, value, kind]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
          <dd>
            <button
              type="button"
              className="link-button"
              aria-label={`Change ${label.toLowerCase()}`}
              onClick={() => onChange(kind)}
            >
              Change
            </button>
          </dd>
        </div>
      ))}
    </dl>
  );
}
