import { useState } from "react";
import {
  describeDeclaration,
  type AllergenDeclaration,
} from "@server/community/domain/allergens";
import type { ContributorProduct } from "@server/community/domain/moderation";
import { CheckThePackage } from "./ui/badges";

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
        <p>
          Record what this formula’s package says. Confirmations check that the
          declaration matches the label, never that a product is safe.
        </p>
        <CheckThePackage />
      </div>
      <p>
        <strong>On file now:</strong>{" "}
        {current
          ? describeDeclaration(current, allergenLabels(product))
          : "Not confirmed yet"}
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
        <legend>Which photo shows it?</legend>
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
            The {photo.slot === "ingredients" ? "ingredients" : "nutrition"}{" "}
            photo
          </label>
        ))}
        <label className="checkbox-label">
          <input
            type="radio"
            name="citedImageId"
            value=""
            defaultChecked={!photos.length}
          />
          {photos.length
            ? "None of these; I’ll explain in the note"
            : "This formula has no label photo yet; I’ll explain in the note"}
        </label>
        <p className="small muted">
          Citing the formula’s ingredients or nutrition photo lets other
          contributors confirm the declaration. Otherwise an operator reviews
          it.
        </p>
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
        <legend>What does the label say?</legend>
        <label className="checkbox-label">
          <input
            type="radio"
            name="allergenStatus"
            value="declared"
            checked={value.status === "declared"}
            onChange={() => onChange({ ...value, status: "declared" })}
          />
          It lists allergens
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
          No allergens declared on the label
        </label>
      </fieldset>
      {value.status === "declared" && (
        <div className="va-allergen-grid">
          {(
            [
              ["contains", "Contains"],
              ["mayContain", "May contain"],
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
