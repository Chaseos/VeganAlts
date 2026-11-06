import { useState } from "react";
import type { ProductChange } from "@server/community/domain/contracts";
import type { CommunityOptions } from "../lib/community";
import { BrandChangeField } from "./brand-change-field";
import { t } from "../i18n";

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
export const factLabels = (): Record<FactKind, string> => ({
  rename: t("fact.rename"),
  brand: t("fact.brand"),
  alias: t("fact.alias"),
  source_url: t("fact.sourceUrl"),
  category_add: t("fact.categoryAdd"),
  foods: t("fact.foods"),
  seasonal: t("fact.seasonal"),
});
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
          <label htmlFor="fact-name">{t("fact.nameLabel")}</label>
          <input
            id="fact-name"
            name="name"
            required
            minLength={2}
            maxLength={160}
            defaultValue={currentName}
          />
          <label htmlFor="fact-flavor">
            {t("fact.flavor")}{" "}
            <span className="va-optional__tag">{t("fact.optionalTag")}</span>
          </label>
          <input
            id="fact-flavor"
            name="flavor"
            maxLength={40}
            defaultValue={currentFlavor ?? ""}
            aria-describedby="fact-flavor-hint"
          />
          <p id="fact-flavor-hint" className="small muted">
            {t("fact.flavorHint")}
          </p>
        </>
      );
    case "seasonal":
      return (
        <fieldset>
          <legend>{t("fact.seasonalLegend")}</legend>
          <label className="checkbox-label">
            <input
              type="radio"
              name="seasonal"
              value="yes"
              defaultChecked={!seasonal}
            />
            {t("fact.seasonalYes")}
          </label>
          <label className="checkbox-label">
            <input
              type="radio"
              name="seasonal"
              value="no"
              defaultChecked={seasonal}
            />
            {t("fact.seasonalNo")}
          </label>
        </fieldset>
      );
    case "alias":
      return (
        <>
          <label htmlFor="fact-alias">{t("fact.otherName")}</label>
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
          <label htmlFor="fact-url">{t("fact.sourceUrl")}</label>
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
          <label htmlFor="fact-category">{t("fact.alsoReplaces")}</label>
          <select id="fact-category" name="categoryId" required>
            <option value="">{t("fact.chooseFood")}</option>
            {categories
              .filter((c) => !existing.includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <p className="small muted">{t("fact.separateRatings")}</p>
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
        <legend>{t("fact.listedUnder")}</legend>
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
      <label htmlFor="fact-new-food">{t("fact.moveTo")}</label>
      <select
        id="fact-new-food"
        name="categoryIds"
        defaultValue=""
        onChange={(e) => setKept(e.target.value ? [] : existing)}
      >
        <option value="">{t("fact.keepTicked")}</option>
        {categories
          .filter((c) => !existing.includes(c.id))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
      <p className="small muted">{t("fact.moveNote")}</p>
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
