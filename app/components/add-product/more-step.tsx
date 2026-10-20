import { useState } from "react";
import { PhotoPicker } from "../community-form";
import { AllergenChecklist } from "../allergen-fields";
import { OverallScale, SCORE_MEANINGS, TasteScale } from "../rating-control";
import { CheckThePackage } from "../ui/badges";
import { FoodPicker } from "./food-picker";
import { OptionalRow } from "./optional-row";
import { placeLabel, type FoodChoice } from "../../lib/food-choices";
import { plural } from "../../lib/format";
import {
  MAX_FOODS,
  hasIngredientEvidence,
  type DraftErrors,
  type PhotoSlot,
  type ProductDraft,
} from "../../lib/product-draft";
import type { CommunityOptions } from "../../lib/community";

export const MORE_FIELDS = {
  ingredientUrl: "ingredient-source",
  allergens: "allergens",
};
type Photos = Partial<Record<PhotoSlot, File>>;

/** Step 2: everything optional, then one Submit. */
export function MoreStep({
  draft,
  update,
  photos,
  setPhoto,
  foods,
  countryName,
  allergenList,
  options,
  errors,
  onEdit,
  onSubmit,
  busy,
  progress,
}: {
  draft: ProductDraft;
  update: (patch: Partial<ProductDraft>) => void;
  photos: Photos;
  setPhoto: (slot: PhotoSlot, file: File | undefined) => void;
  foods: readonly FoodChoice[];
  countryName: string;
  allergenList: { key: string; label: string }[];
  options: CommunityOptions;
  errors: DraftErrors;
  onEdit: () => void;
  onSubmit: () => void;
  busy: boolean;
  progress: string;
}) {
  const chosen = draft.food;
  const primary =
    chosen?.kind === "existing" ? foods.find((f) => f.id === chosen.id) : null;
  const foodName =
    draft.food?.kind === "new" ? draft.food.name : (primary?.name ?? "it");
  const evidence = hasIngredientEvidence(draft, photos);
  const ingredients = draft.ingredients;
  const setIngredients = (patch: Partial<ProductDraft["ingredients"]>) =>
    update({ ingredients: { ...ingredients, ...patch } });
  const morePhotos = (["back", "nutrition"] as const).filter((s) => photos[s]);
  const otherFoods = draft.alsoReplaces
    .map((id) => foods.find((f) => f.id === id))
    .filter((f): f is FoodChoice => Boolean(f));
  const room = MAX_FOODS - 1 - draft.alsoReplaces.length;
  const [storeFilter, setStoreFilter] = useState("");
  const stores = options.retailers.filter((r) =>
    r.name.toLowerCase().includes(storeFilter.trim().toLowerCase()),
  );
  return (
    <form
      className="community-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="va-add__summary">
        <dl className="review-facts va-add__facts">
          <div>
            <dt>Product</dt>
            <dd>
              {draft.brand.trim()} · {draft.name.trim()}
            </dd>
          </div>
          <div>
            <dt>Replaces</dt>
            <dd>
              {draft.food?.kind === "new"
                ? `${draft.food.name} (new food, reviewed with your product)`
                : primary
                  ? [primary.name, placeLabel(primary)]
                      .filter(Boolean)
                      .join(" · ")
                  : "—"}
            </dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>{countryName}</dd>
          </div>
        </dl>
        <button type="button" className="link-button" onClick={onEdit}>
          Edit the basics
        </button>
      </div>
      <p className="va-add__note">
        Everything here is optional. Submit now or add what you know.
      </p>

      <section className="va-add__rating" aria-labelledby="rate-title">
        <p className="va-rate__product">
          {draft.name.trim()}
          {draft.flavor.trim() ? ` · ${draft.flavor.trim()}` : ""}
        </p>
        <h3 id="rate-title" className="va-heading-s">
          Tried it? How close is it to {foodName.toLowerCase()}?
        </h3>
        <div className="va-rate">
          <OverallScale
            selected={draft.rating}
            onChoose={(rating) =>
              update(draft.rating === rating ? { rating: null } : { rating })
            }
          />
        </div>
        <p className="small muted">
          {draft.rating
            ? `${SCORE_MEANINGS[draft.rating - 1]}. Saved as your rating when the product goes live; tap it again to clear.`
            : "Saved as your rating when the product goes live."}
        </p>
        <fieldset className="va-rate__group va-rate__tasty">
          <legend className="va-rate__subtitle">
            How tasty is it, whether or not it’s like the original?
          </legend>
          <TasteScale
            selected={draft.enjoyment}
            onChoose={(enjoyment) => update({ enjoyment })}
          />
        </fieldset>
      </section>

      <div className="va-optional-list">
        <OptionalRow
          title="Ingredients"
          status={
            evidence
              ? ingredients.checked
                ? "Added · nothing animal-derived"
                : "Added"
              : undefined
          }
          open={evidence || Boolean(errors.ingredientUrl)}
        >
          <p className="small muted">
            Without ingredients, the product shows “Ingredients not checked yet”
            until someone adds them.
          </p>
          <PhotoPicker
            slot="ingredients"
            file={photos.ingredients}
            onChange={(file) => setPhoto("ingredients", file)}
          />
          <label htmlFor="ingredient-source">
            Link to the ingredients on the brand’s site (optional)
          </label>
          <input
            id="ingredient-source"
            type="url"
            inputMode="url"
            value={ingredients.url}
            onChange={(e) => setIngredients({ url: e.target.value })}
            maxLength={1000}
            placeholder="https://"
            aria-invalid={errors.ingredientUrl ? true : undefined}
            aria-describedby={
              errors.ingredientUrl ? "ingredient-source-error" : undefined
            }
          />
          {errors.ingredientUrl && (
            <p id="ingredient-source-error" className="field-error">
              {errors.ingredientUrl}
            </p>
          )}
          {evidence && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={ingredients.checked}
                onChange={(e) => setIngredients({ checked: e.target.checked })}
              />
              I checked the ingredients and found nothing animal-derived
            </label>
          )}
          <label htmlFor="manufacturer-label">What does the package say?</label>
          <select
            id="manufacturer-label"
            value={ingredients.label}
            onChange={(e) =>
              setIngredients({
                label: e.target.value as ProductDraft["ingredients"]["label"],
              })
            }
          >
            <option value="unknown">Not sure / not stated</option>
            <option value="vegan">Labeled vegan</option>
            <option value="plant_based">Labeled plant-based</option>
            <option value="neither">Neither wording</option>
          </select>
          <label htmlFor="ingredient-note">
            Anything a reviewer should know? (optional)
          </label>
          <textarea
            id="ingredient-note"
            rows={3}
            maxLength={2000}
            value={ingredients.note}
            onChange={(e) => setIngredients({ note: e.target.value })}
          />
        </OptionalRow>

        <OptionalRow
          title="Allergens"
          status={
            draft.allergens.status === "none_declared"
              ? "None on the label"
              : draft.allergens.status === "declared"
                ? `${plural(draft.allergens.contains.length + draft.allergens.mayContain.length, "allergen")} added`
                : undefined
          }
          open={Boolean(draft.allergens.status) || Boolean(errors.allergens)}
        >
          <div id="allergens">
            <p className="small muted">
              Record what the package says.{" "}
              {photos.ingredients || photos.nutrition
                ? "Another member confirms it against your photo."
                : "With an ingredients or nutrition photo, another member can confirm it; otherwise a moderator checks it."}
            </p>
            <CheckThePackage />
            <AllergenChecklist
              list={allergenList}
              value={draft.allergens}
              onChange={(allergens) => update({ allergens })}
            />
            {errors.allergens && (
              <p className="field-error">{errors.allergens}</p>
            )}
          </div>
        </OptionalRow>

        <OptionalRow
          title="Where it’s sold"
          status={
            draft.retailerIds.length
              ? plural(draft.retailerIds.length, "store")
              : undefined
          }
          open={draft.retailerIds.length > 0}
        >
          {options.retailers.length ? (
            <fieldset className="va-choice-list">
              <legend>Commonly found at</legend>
              {options.retailers.length > 12 && (
                <input
                  type="search"
                  aria-label="Filter stores"
                  placeholder="Filter stores"
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                />
              )}
              <div className="va-chip-row">
                {stores.map((store) => (
                  <label className="va-chip" key={store.id}>
                    <input
                      type="checkbox"
                      checked={draft.retailerIds.includes(store.id)}
                      onChange={(e) =>
                        update({
                          retailerIds: e.target.checked
                            ? [...draft.retailerIds, store.id].slice(0, 10)
                            : draft.retailerIds.filter((id) => id !== store.id),
                        })
                      }
                    />
                    {store.name}
                  </label>
                ))}
              </div>
              <p className="small muted">
                “Commonly found at”, not live stock. Up to 10 stores.
              </p>
            </fieldset>
          ) : (
            <p className="small muted">
              No stores are listed for {countryName} yet. You can add one from
              the product page once it’s live.
            </p>
          )}
        </OptionalRow>

        <OptionalRow
          title="More photos"
          status={
            morePhotos.length
              ? morePhotos.map((s) => `${s} photo`).join(", ")
              : undefined
          }
          open={morePhotos.length > 0}
        >
          <p className="small muted">
            JPEG, PNG or WebP, up to 10 MiB each. Photos stay private until the
            product is published.
          </p>
          <PhotoPicker
            slot="back"
            file={photos.back}
            onChange={(file) => setPhoto("back", file)}
          />
          <PhotoPicker
            slot="nutrition"
            label="Nutrition and allergens photo"
            file={photos.nutrition}
            onChange={(file) => setPhoto("nutrition", file)}
          />
        </OptionalRow>

        <OptionalRow
          title="Other foods it replaces"
          status={
            otherFoods.length
              ? plural(otherFoods.length, "other food")
              : undefined
          }
          open={otherFoods.length > 0}
        >
          <fieldset>
            <legend>Also replaces</legend>
            {otherFoods.length > 0 && (
              <ul className="va-chip-row" aria-label="Other foods">
                {otherFoods.map((food) => (
                  <li key={food.id}>
                    <button
                      type="button"
                      className="va-chip"
                      aria-pressed="true"
                      onClick={() =>
                        update({
                          alsoReplaces: draft.alsoReplaces.filter(
                            (id) => id !== food.id,
                          ),
                        })
                      }
                    >
                      {food.name}
                      <span className="sr-only"> (remove)</span> ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {room > 0 && (
              <FoodPicker
                id="other-food"
                label="Another food it replaces"
                foods={foods}
                countryName={countryName}
                value={null}
                exclude={[
                  ...(draft.food?.kind === "existing" ? [draft.food.id] : []),
                  ...draft.alsoReplaces,
                ]}
                onChange={(pick) =>
                  pick?.kind === "existing" &&
                  update({ alsoReplaces: [...draft.alsoReplaces, pick.id] })
                }
              />
            )}
          </fieldset>
        </OptionalRow>
      </div>

      {progress && (
        <p role="status" className="small">
          {progress}
        </p>
      )}
      <div className="button-row">
        <button type="button" className="button secondary" onClick={onEdit}>
          Back
        </button>
        <button className="button" disabled={busy}>
          {busy ? "Submitting…" : "Submit product"}
        </button>
      </div>
    </form>
  );
}
