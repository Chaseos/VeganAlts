import { useCallback } from "react";
import { Link } from "react-router";
import type { Candidate } from "@server/community/domain/contracts";
import { PhotoPicker } from "../community-form";
import { Popover } from "../ui/popover";
import { Icon } from "../icons/icon";
import type { ShelfGroup } from "../shelf-select";
import { FoodPicker } from "./food-picker";
import { IdentityMatches } from "./identity-matches";
import type { FoodChoice } from "../../lib/food-choices";
import type {
  DraftErrors,
  DraftPhotos,
  ProductDraft,
} from "../../lib/product-draft";

export const BASICS_FIELDS = {
  food: "food-input",
  shelf: "food-shelf",
  brand: "brand-name",
  name: "product-name",
  duplicate: "product-name",
  front: "photo-front",
};

/** Step 1: only what every product needs. */
export function BasicsStep({
  draft,
  update,
  photos,
  setPhoto,
  foods,
  shelves,
  allowSuggest,
  brands,
  countries,
  countryName,
  errors,
  onExact,
  onContinue,
  busy,
}: {
  draft: ProductDraft;
  update: (patch: Partial<ProductDraft>) => void;
  photos: DraftPhotos & Partial<Record<"front", File>>;
  setPhoto: (slot: "front", file: File | undefined) => void;
  foods: readonly FoodChoice[];
  shelves: ShelfGroup[];
  allowSuggest: boolean;
  brands: { id: string; name: string }[];
  countries: { code: string; iso2: string; name: string }[];
  countryName: string;
  errors: DraftErrors;
  onExact: (match: Candidate | null) => void;
  onContinue: () => void;
  busy: boolean;
}) {
  const exact = useCallback(onExact, [onExact]);
  const field = (name: "brand" | "name") => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name]
      ? `${BASICS_FIELDS[name]}-error`
      : undefined,
  });
  return (
    <form
      className="community-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onContinue();
      }}
    >
      <p className="va-add__note">All fields are required.</p>
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
        shelves={shelves}
        allowSuggest={allowSuggest}
        error={errors.food}
        shelfError={errors.shelf}
      />
      <label htmlFor="brand-name">Brand (required)</label>
      <input
        id="brand-name"
        list="brand-options"
        value={draft.brand}
        onChange={(e) => update({ brand: e.target.value })}
        maxLength={160}
        autoComplete="off"
        {...field("brand")}
      />
      <datalist id="brand-options">
        {brands.map((b) => (
          <option key={b.id} value={b.name} />
        ))}
      </datalist>
      {errors.brand && (
        <p id="brand-name-error" className="field-error">
          {errors.brand}
        </p>
      )}
      <label htmlFor="product-name">Product name (required)</label>
      <input
        id="product-name"
        value={draft.name}
        onChange={(e) => update({ name: e.target.value })}
        maxLength={160}
        autoComplete="off"
        {...field("name")}
      />
      <p className="small muted">
        Include the flavor. Package sizes share one product.
      </p>
      {errors.name && (
        <p id="product-name-error" className="field-error">
          {errors.name}
        </p>
      )}
      <IdentityMatches
        country={draft.country}
        brand={draft.brand}
        name={draft.name}
        onExact={exact}
      />
      <PhotoPicker
        slot="front"
        label="Front of pack photo"
        required
        file={photos.front}
        onChange={(file) => setPhoto("front", file)}
        error={errors.front}
      />
      <button className="button" disabled={busy}>
        Continue
      </button>
    </form>
  );
}
