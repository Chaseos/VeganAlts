import type { ProductChange } from "@server/community/domain/contracts";
import type { CommunityOptions } from "../lib/community";

export const factKinds = [
  "rename",
  "alias",
  "source_url",
  "category_add",
] as const;
export type FactKind = (typeof factKinds)[number];
export const factLabels: Record<FactKind, string> = {
  rename: "Product name on the package",
  alias: "Another name people search for",
  source_url: "Manufacturer product page",
  category_add: "Another food it replaces",
};
export const isFactKind = (kind: ProductChange["kind"]): kind is FactKind =>
  (factKinds as readonly string[]).includes(kind);

/** Kind-specific inputs for established-fact proposals. */
export function FactChangeFields({
  kind,
  currentName,
  categories,
  existing,
}: {
  kind: FactKind;
  currentName: string;
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
          <p className="small muted">
            The product keeps its address and ratings. Attach a front photo
            showing the new name.
          </p>
        </>
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
            <option value="">Choose a category</option>
            {categories
              .filter((c) => !existing.includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <p className="small muted">
            Ratings in each category are independent. The product starts unrated
            there.
          </p>
        </>
      );
  }
}
export function factChangeDetails(kind: FactKind, form: FormData) {
  switch (kind) {
    case "rename":
      return { name: form.get("name") };
    case "alias":
      return { alias: form.get("alias") };
    case "source_url":
      return { url: form.get("url") };
    case "category_add":
      return { categoryId: form.get("categoryId") };
  }
}
