import type { ProductChange } from "@server/community/domain/contracts";
import type { CommunityOptions } from "../lib/community";

export const factKinds = [
  "rename",
  "alias",
  "source_url",
  "category_add",
  "seasonal",
] as const;
export type FactKind = (typeof factKinds)[number];
export const factLabels: Record<FactKind, string> = {
  rename: "Product name on the package",
  alias: "Another name people search for",
  source_url: "Manufacturer product page",
  category_add: "Another food it replaces",
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
}: {
  kind: FactKind;
  currentName: string;
  currentFlavor: string | null;
  seasonal: boolean;
  categories: CommunityOptions["categories"];
  existing: string[];
}) {
  switch (kind) {
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
  }
}
export function factChangeDetails(kind: FactKind, form: FormData) {
  switch (kind) {
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
  }
}
