import { useState } from "react";
import {
  describeDeclaration,
  type AllergenDeclaration,
} from "@server/community/domain/allergens";
import type { ContributorProduct } from "@server/community/domain/moderation";
import { CheckThePackage } from "./ui/badges";
import { t } from "../i18n";

type Product = Pick<
  ContributorProduct,
  "allergens" | "allergenList" | "images" | "versionId"
>;
export const allergenLabels = (product: Pick<Product, "allergenList">) =>
  Object.fromEntries(product.allergenList.map((a) => [a.key, a.label]));

/** What the package says, in this country's allergen list. */
export function AllergenFields({ product }: { product: Product }) {
  const current = product.allergens;
  const [declared, setDeclared] = useState(current?.status !== "none_declared");
  const [contains, setContains] = useState<string[]>(
    current?.status === "declared" ? current.contains : [],
  );
  const [mayContain, setMayContain] = useState<string[]>(
    current?.status === "declared" ? current.mayContain : [],
  );
  const photos = product.images.filter(
    (i) =>
      i.versionId === product.versionId &&
      i.state === "accepted" &&
      (i.slot === "ingredients" || i.slot === "nutrition"),
  );
  return (
    <>
      <div className="notice">
        <p>{t("allergen.record")}</p>
        <CheckThePackage />
      </div>
      <p>
        <strong>{t("allergen.onFile")}</strong>{" "}
        {current
          ? describeDeclaration(current, allergenLabels(product))
          : t("allergen.notConfirmed")}
      </p>
      <AllergenChecklist
        list={product.allergenList}
        value={{
          status: declared ? "declared" : "none_declared",
          contains,
          mayContain,
        }}
        onChange={(next) => {
          setDeclared(next.status !== "none_declared");
          setContains(next.contains);
          setMayContain(next.mayContain);
        }}
      />
      <fieldset className="va-choice-list">
        <legend>{t("allergen.whichPhoto")}</legend>
        {photos.map((photo) => (
          <label className="checkbox-label va-photo-choice" key={photo.id}>
            <input
              type="radio"
              name="citedImageId"
              value={photo.id}
              defaultChecked={photo === photos[0]}
            />
            <img
              src={`/media/${photo.id}/thumbnail`}
              alt=""
              width={56}
              height={56}
            />
            {photo.slot === "ingredients"
              ? t("allergen.photoIngredients")
              : t("allergen.photoNutrition")}
          </label>
        ))}
        <label className="checkbox-label">
          <input
            type="radio"
            name="citedImageId"
            value=""
            defaultChecked={!photos.length}
          />
          {photos.length ? t("allergen.noneOfThese") : t("allergen.noPhoto")}
        </label>
        <p className="small muted">{t("allergen.citeHint")}</p>
      </fieldset>
    </>
  );
}

export function allergenDetails(form: FormData) {
  const keys = (name: string) => form.getAll(name).map(String);
  const declaration: AllergenDeclaration =
    form.get("allergenStatus") === "none_declared"
      ? { status: "none_declared" }
      : {
          status: "declared",
          contains: keys("contains"),
          mayContain: keys("mayContain"),
        };
  const cited = String(form.get("citedImageId") ?? "");
  return { declaration, ...(cited ? { citedImageId: cited } : {}) };
}

export interface AllergenChoice {
  status: "declared" | "none_declared" | null;
  contains: string[];
  mayContain: string[];
}
/**
 * What a package label says about allergens, from one country's list. The
 * inputs keep their form names so uncontrolled forms can read them.
 */
export function AllergenChecklist({
  list,
  value,
  onChange,
}: {
  list: { key: string; label: string }[];
  value: AllergenChoice;
  onChange: (value: AllergenChoice) => void;
}) {
  // An allergen is either contained or a cross-contact warning, not both.
  const toggle = (
    field: "contains" | "mayContain",
    key: string,
    on: boolean,
  ) => {
    const other = field === "contains" ? "mayContain" : "contains";
    onChange({
      ...value,
      status: "declared",
      [field]: on
        ? [...value[field], key]
        : value[field].filter((k) => k !== key),
      [other]: on ? value[other].filter((k) => k !== key) : value[other],
    });
  };
  return (
    <>
      <fieldset className="va-choice-list">
        <legend>{t("allergen.labelSays")}</legend>
        <label className="checkbox-label">
          <input
            type="radio"
            name="allergenStatus"
            value="declared"
            checked={value.status === "declared"}
            onChange={() => onChange({ ...value, status: "declared" })}
          />
          {t("allergen.lists")}
        </label>
        <label className="checkbox-label">
          <input
            type="radio"
            name="allergenStatus"
            value="none_declared"
            checked={value.status === "none_declared"}
            onChange={() =>
              onChange({
                status: "none_declared",
                contains: [],
                mayContain: [],
              })
            }
          />
          {t("allergen.noneDeclared")}
        </label>
      </fieldset>
      {value.status === "declared" && (
        <div className="va-allergen-grid">
          {(
            [
              ["contains", t("safety.legendContains")],
              ["mayContain", t("safety.legendMayContain")],
            ] as const
          ).map(([field, legend]) => (
            <fieldset className="va-choice-list" key={field}>
              <legend>{legend}</legend>
              {list.map((a) => (
                <label className="checkbox-label" key={a.key}>
                  <input
                    type="checkbox"
                    name={field}
                    value={a.key}
                    checked={value[field].includes(a.key)}
                    onChange={(event) =>
                      toggle(field, a.key, event.target.checked)
                    }
                  />
                  {a.label}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}
    </>
  );
}
