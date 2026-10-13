import { useCallback } from "react";
import { Link } from "react-router";
import type { Candidate } from "@server/community/domain/contracts";
import { PhotoPicker } from "../community-form";
import { Popover } from "../ui/popover";
import { Icon } from "../icons/icon";
import type { AisleOption } from "../aisle-select";
import { FoodPicker } from "./food-picker";
import { BrandPicker } from "./brand-picker";
import { BrandLines } from "./brand-lines";
import { IdentityMatches } from "./identity-matches";
import type { FoodChoice } from "../../lib/food-choices";
import {
  MAX_FLAVOR,
  type DraftErrors,
  type DraftPhotos,
  type ProductDraft,
} from "../../lib/product-draft";

export const BASICS_FIELDS = {
  food: "food-input",
  aisle: "food-aisle",
  brand: "brand-input",
  line: "brand-lines",
  flavor: "product-flavor",
  name: "product-name",
  lineName: "line-name",
  duplicate: "product-name",
  front: "photo-front",
};
type TextField = "name" | "flavor" | "lineName";

/**
 * Step 1 (milestone 7): the food, then the brand, then what's already listed
 * from it, then the product: a new flavor of a listed line or something else
 * from the brand. A new brand, or one with nothing listed here, goes straight
 * to the product.
 */
export function BasicsStep({
  draft,
  update,
  edit,
  photos,
  setPhoto,
  foods,
  aisles,
  allowSuggest,
  countries,
  countryName,
  errors,
  onExact,
  onContinue,
  busy,
}: {
  draft: ProductDraft;
  update: (patch: Partial<ProductDraft>) => void;
  // Text changes, with the names that follow them (editDraft).
  edit: (patch: Partial<Pick<ProductDraft, TextField | "brand">>) => void;
  photos: DraftPhotos & Partial<Record<"front", File>>;
  setPhoto: (slot: "front", file: File | undefined) => void;
  foods: readonly FoodChoice[];
  aisles: AisleOption[];
  allowSuggest: boolean;
  countries: { code: string; iso2: string; name: string }[];
  countryName: string;
  errors: DraftErrors;
  onExact: (match: Candidate | null) => void;
  onContinue: () => void;
  busy: boolean;
}) {
  const exact = useCallback(onExact, [onExact]);
  const field = (name: keyof typeof BASICS_FIELDS) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name]
      ? `${BASICS_FIELDS[name]}-error`
      : undefined,
  });
  const fieldError = (name: keyof typeof BASICS_FIELDS) =>
    errors[name] && (
      <p id={`${BASICS_FIELDS[name]}-error`} className="field-error">
        {errors[name]}
      </p>
    );
  const food = draft.food;
  const chosenFood =
    food?.kind === "existing"
      ? (foods.find((f) => f.id === food.id) ?? null)
      : null;
  const line = draft.line;
  const listed = draft.brandChosen && draft.brandId !== null;
  // A product follows its food's season unless the contributor says.
  const seasonal = draft.seasonal ?? chosenFood?.seasonal ?? false;
  return (
    <form
      className="community-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onContinue();
      }}
    >
      <p className="va-add__note">
        Fields are required unless they say optional.
      </p>
      <div className="va-add__country">
        <span>
          Adding to <strong>{countryName}</strong>
        </span>
        {/* A reply to a follow-up stays in its submission's country. */}
        {!draft.followUp && (
          <Popover
            summary="Change"
            summaryLabel={`Change country (now ${countryName})`}
            panelLabel="Countries"
            className="va-add__country-menu"
          >
            {(close) => (
              <ul className="va-menu-list va-country-list">
                {countries.map((country) => {
                  const selected = country.iso2 === draft.country;
                  return (
                    <li key={country.code}>
                      <Link
                        to={`?country=${country.code}`}
                        replace
                        aria-current={selected ? "true" : undefined}
                        onClick={() => close()}
                      >
                        <span className="va-menu-check" aria-hidden="true">
                          {selected && (
                            <Icon name="check" size={16} strokeWidth={3} />
                          )}
                        </span>
                        <span className="va-country-list__name">
                          {country.name}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Popover>
        )}
      </div>
      <FoodPicker
        id="food"
        label="What food does it replace? (required)"
        foods={foods}
        countryName={countryName}
        value={draft.food}
        onChange={(food) => update({ food })}
        aisles={aisles}
        allowSuggest={allowSuggest}
        error={errors.food}
        aisleError={errors.aisle}
      />
      <BrandPicker
        id="brand"
        country={draft.country}
        countryName={countryName}
        value={draft.brand}
        chosen={draft.brandChosen}
        isNew={draft.brandChosen && draft.brandId === null}
        onType={(brand) => edit({ brand })}
        onChoose={(brand) =>
          update({
            brand: brand.name,
            brandId: brand.id,
            brandChosen: true,
            // A new brand has nothing listed to choose from.
            line: brand.id ? null : { kind: "new" },
          })
        }
        onChange={() =>
          update({ brandChosen: false, brandId: null, line: null })
        }
        error={errors.brand}
      />
      {listed && !line && (
        <BrandLines
          country={draft.country}
          brand={{ id: draft.brandId!, name: draft.brand }}
          food={chosenFood}
          onFlavor={(chosen) =>
            update({
              line: {
                kind: "flavor",
                lineId: chosen.lineId,
                lineName: chosen.name,
              },
              // Its name follows the flavor until typed over.
              name: "",
              nameEdited: false,
            })
          }
          onSomethingElse={() => update({ line: { kind: "new" } })}
          onNothing={() => update({ line: { kind: "new" } })}
          error={errors.line}
        />
      )}
      {line && (
        <fieldset className="va-add__product">
          <legend>
            {line.kind === "flavor"
              ? `A new flavor of ${line.lineName || "this line"}`
              : `New from ${draft.brand.trim() || "this brand"}`}
          </legend>
          {listed && (
            <button
              type="button"
              className="link-button"
              onClick={() => update({ line: null })}
            >
              {line.kind === "flavor"
                ? "Choose something else"
                : `See what’s listed from ${draft.brand.trim()}`}
            </button>
          )}
          {line.kind === "flavor" && (
            <>
              <label htmlFor="product-flavor">Flavor (required)</label>
              <input
                id="product-flavor"
                value={draft.flavor}
                onChange={(e) => edit({ flavor: e.target.value })}
                maxLength={MAX_FLAVOR}
                autoComplete="off"
                {...field("flavor")}
              />
              {fieldError("flavor")}
            </>
          )}
          <label htmlFor="product-name">Product name (required)</label>
          <input
            id="product-name"
            value={draft.name}
            onChange={(e) => edit({ name: e.target.value })}
            maxLength={160}
            autoComplete="off"
            {...field("name")}
          />
          <p className="small muted">
            {line.kind === "flavor"
              ? "As the package names it. Package sizes share one product."
              : "Include the flavor. Package sizes share one product."}
          </p>
          {fieldError("name")}
          {line.kind === "new" && (
            <>
              <label htmlFor="product-flavor">Flavor (optional)</label>
              <input
                id="product-flavor"
                value={draft.flavor}
                onChange={(e) => edit({ flavor: e.target.value })}
                maxLength={MAX_FLAVOR}
                autoComplete="off"
                aria-describedby="product-flavor-hint"
                aria-invalid={errors.flavor ? true : undefined}
              />
              <p id="product-flavor-hint" className="small muted">
                Leave blank if it’s the original or plain version.
              </p>
              {fieldError("flavor")}
              {draft.flavor.trim() && (
                <>
                  <label htmlFor="line-name">
                    Name without the flavor (required)
                  </label>
                  <input
                    id="line-name"
                    value={draft.lineName}
                    onChange={(e) => edit({ lineName: e.target.value })}
                    maxLength={160}
                    autoComplete="off"
                    {...field("lineName")}
                  />
                  <p className="small muted">
                    Its other flavors share this name and one ranking.
                  </p>
                  {fieldError("lineName")}
                </>
              )}
            </>
          )}
          <IdentityMatches
            country={draft.country}
            brand={draft.brand}
            name={draft.name}
            lineId={line.kind === "flavor" ? line.lineId : null}
            onExact={exact}
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={seasonal}
              onChange={(e) => update({ seasonal: e.target.checked })}
            />
            Sold only part of the year (seasonal)
          </label>
          <PhotoPicker
            slot="front"
            label="Front of pack photo"
            required
            file={photos.front}
            onChange={(file) => setPhoto("front", file)}
            error={errors.front}
          />
        </fieldset>
      )}
      <button className="button" disabled={busy}>
        Continue
      </button>
    </form>
  );
}
