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
  const toggle = (
    list: string[],
    key: string,
    on: boolean,
    other?: (update: (keys: string[]) => string[]) => void,
  ) => {
    // An allergen is either contained or a cross-contact warning, not both.
    if (on) other?.((keys) => keys.filter((k) => k !== key));
    return on ? [...list, key] : list.filter((k) => k !== key);
  };
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
      <fieldset className="va-choice-list">
        <legend>What does the label say?</legend>
        <label className="checkbox-label">
          <input
            type="radio"
            name="allergenStatus"
            value="declared"
            checked={declared}
            onChange={() => setDeclared(true)}
          />
          It lists allergens
        </label>
        <label className="checkbox-label">
          <input
            type="radio"
            name="allergenStatus"
            value="none_declared"
            checked={!declared}
            onChange={() => setDeclared(false)}
          />
          No allergens declared on the label
        </label>
      </fieldset>
      {declared && (
        <div className="va-allergen-grid">
          <fieldset className="va-choice-list">
            <legend>Contains</legend>
            {product.allergenList.map((a) => (
              <label className="checkbox-label" key={a.key}>
                <input
                  type="checkbox"
                  name="contains"
                  value={a.key}
                  checked={contains.includes(a.key)}
                  onChange={(event) =>
                    setContains((keys) =>
                      toggle(keys, a.key, event.target.checked, setMayContain),
                    )
                  }
                />
                {a.label}
              </label>
            ))}
          </fieldset>
          <fieldset className="va-choice-list">
            <legend>May contain</legend>
            {product.allergenList.map((a) => (
              <label className="checkbox-label" key={a.key}>
                <input
                  type="checkbox"
                  name="mayContain"
                  value={a.key}
                  checked={mayContain.includes(a.key)}
                  onChange={(event) =>
                    setMayContain((keys) =>
                      toggle(keys, a.key, event.target.checked, setContains),
                    )
                  }
                />
                {a.label}
              </label>
            ))}
          </fieldset>
        </div>
      )}
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
