import { useState } from "react";
import type { ProductChange } from "@server/community/domain/contracts";
import type { CommunityOptions } from "../lib/community";
import { BrandChangeField } from "./brand-change-field";

export const factKinds = [
  "rename",
  "brand",
  "alias",
  "source_url",
  "category_add",
  "foods",
  "seasonal",
] as const;
export type FactKind = (typeof factKinds)[number];
export const factLabels: Record<FactKind, string> = {
  rename: "Product name on the package",
  brand: "Brand",
  alias: "Another name people search for",
  source_url: "Manufacturer product page",
  category_add: "Another food it replaces",
  foods: "Food it’s listed under",
  seasonal: "Sold only part of the year",
};
export const isFactKind = (kind: ProductChange["kind"]): kind is FactKind =>
  (factKinds as readonly string[]).includes(kind);

/** Kind-specific inputs for established-fact proposals. */
export function FactChangeFields({
  kind,
  currentName,
  currentFlavor,
  seasonal,
  categories,
  existing,
  country,
  countryName,
  currentBrandId,
  lineName,
}: {
  kind: FactKind;
  currentName: string;
  currentFlavor: string | null;
  seasonal: boolean;
  categories: CommunityOptions["categories"];
  existing: string[];
  country: string;
  countryName: string;
  currentBrandId: string | null;
  lineName: string;
}) {
  switch (kind) {
    case "brand":
      return (
        <BrandChangeField
          country={country}
          countryName={countryName}
          currentBrandId={currentBrandId}
          lineName={lineName}
        />
      );
    case "rename":
      return (
        <>
          <label htmlFor="fact-name">Name as printed on the package</label>
          <input
            id="fact-name"
            name="name"
            required
            minLength={2}
            maxLength={160}
            defaultValue={currentName}
          />
          <label htmlFor="fact-flavor">
            Flavor <span className="va-optional__tag">Optional</span>
          </label>
          <input
            id="fact-flavor"
            name="flavor"
            maxLength={40}
            defaultValue={currentFlavor ?? ""}
            aria-describedby="fact-flavor-hint"
          />
          <p id="fact-flavor-hint" className="small muted">
            Leave blank for the line’s original or plain version. The product
            keeps its address and ratings. Attach a front photo showing the new
            name.
          </p>
        </>
      );
    case "seasonal":
      return (
        <fieldset>
          <legend>Is it sold only part of the year?</legend>
          <label className="checkbox-label">
            <input
              type="radio"
              name="seasonal"
              value="yes"
              defaultChecked={!seasonal}
            />
            Yes, it’s seasonal
          </label>
          <label className="checkbox-label">
            <input
              type="radio"
              name="seasonal"
              value="no"
              defaultChecked={seasonal}
            />
            No, it’s sold all year
          </label>
        </fieldset>
      );
    case "alias":
      return (
        <>
          <label htmlFor="fact-alias">Other name</label>
          <input
            id="fact-alias"
            name="alias"
            required
            minLength={2}
            maxLength={160}
          />
        </>
      );
    case "source_url":
      return (
        <>
          <label htmlFor="fact-url">Manufacturer product page</label>
          <input
            id="fact-url"
            name="url"
            type="url"
            required
            placeholder="https://"
            maxLength={1000}
          />
        </>
      );
    case "category_add":
      return (
        <>
          <label htmlFor="fact-category">It also replaces</label>
          <select id="fact-category" name="categoryId" required>
            <option value="">Choose a food</option>
            {categories
              .filter((c) => !existing.includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <p className="small muted">
            Ratings for each food are separate. The product starts unrated
            there.
          </p>
        </>
      );
    case "foods":
      return <FoodsField categories={categories} existing={existing} />;
  }
}
/** The foods a product is listed under: moving unticks where it was. */
function FoodsField({
  categories,
  existing,
}: {
  categories: CommunityOptions["categories"];
  existing: string[];
}) {
  const [kept, setKept] = useState(existing);
  return (
    <>
      <fieldset className="va-choice-list">
        <legend>Listed under</legend>
        {categories
          .filter((c) => existing.includes(c.id))
          .map((c) => (
            <label className="checkbox-label" key={c.id}>
              <input
                type="checkbox"
                name="categoryIds"
                value={c.id}
                checked={kept.includes(c.id)}
                onChange={(e) =>
                  setKept((foods) =>
                    e.target.checked
                      ? [...foods, c.id]
                      : foods.filter((id) => id !== c.id),
                  )
                }
              />
              {c.name}
            </label>
          ))}
      </fieldset>
      <label htmlFor="fact-new-food">Move it to</label>
      <select
        id="fact-new-food"
        name="categoryIds"
        defaultValue=""
        onChange={(e) => setKept(e.target.value ? [] : existing)}
      >
        <option value="">Keep only the foods ticked above</option>
        {categories
          .filter((c) => !existing.includes(c.id))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
      <p className="small muted">
        Moving unticks its current foods; tick one again to list it in both.
        Ratings are never lost: a rated food keeps them, off its ranking, and
        the product starts unrated in a new food.
      </p>
    </>
  );
}
export function factChangeDetails(kind: FactKind, form: FormData) {
  switch (kind) {
    case "brand":
      return form.get("brandLine") === "new" || !form.get("brandLine")
        ? { brandId: form.get("brandId"), newLineName: form.get("newLineName") }
        : { brandId: form.get("brandId"), lineId: form.get("brandLine") };
    case "rename": {
      const flavor = String(form.get("flavor") ?? "").trim();
      return { name: form.get("name"), flavor: flavor || null };
    }
    case "seasonal":
      return { seasonal: form.get("seasonal") === "yes" };
    case "alias":
      return { alias: form.get("alias") };
    case "source_url":
      return { url: form.get("url") };
    case "category_add":
      return { categoryId: form.get("categoryId") };
    case "foods":
      return { categoryIds: form.getAll("categoryIds").filter(Boolean) };
  }
}
