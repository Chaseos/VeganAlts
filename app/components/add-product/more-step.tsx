import { useState } from "react";
import { AllergenChecklist } from "../allergen-fields";
import { OverallScale, scoreMeanings, TasteScale } from "../rating-control";
import { CheckThePackage } from "../ui/badges";
import { FoodPicker } from "./food-picker";
import { OptionalRow } from "./optional-row";
import { placeLabel, type FoodChoice } from "../../lib/food-choices";
import { formatCount, inSentence } from "../../lib/format";
import { t } from "../../i18n";
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
  foods,
  countryName,
  countryCode,
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
  foods: readonly FoodChoice[];
  countryName: string;
  countryCode: string;
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
    draft.food?.kind === "new"
      ? draft.food.name
      : (primary?.name ?? t("addProduct.it"));
  const evidence = hasIngredientEvidence(draft, photos);
  const ingredients = draft.ingredients;
  const setIngredients = (patch: Partial<ProductDraft["ingredients"]>) =>
    update({ ingredients: { ...ingredients, ...patch } });
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
            <dt>{t("addProduct.product")}</dt>
            <dd>
              {draft.brand.trim()} · {draft.name.trim()}
            </dd>
          </div>
          <div>
            <dt>{t("addProduct.replaces")}</dt>
            <dd>
              {draft.food?.kind === "new"
                ? t("addProduct.newFoodSummary", { name: draft.food.name })
                : primary
                  ? [primary.name, placeLabel(primary)]
                      .filter(Boolean)
                      .join(" · ")
                  : "—"}
            </dd>
          </div>
          <div>
            <dt>{t("addProduct.country")}</dt>
            <dd>{countryName}</dd>
          </div>
        </dl>
        <button type="button" className="link-button" onClick={onEdit}>
          {t("addProduct.editBasics")}
        </button>
      </div>
      <p className="va-add__note">{t("addProduct.allOptional")}</p>

      <section className="va-add__rating" aria-labelledby="rate-title">
        <p className="va-rate__product">
          {draft.name.trim()}
          {draft.flavor.trim() ? ` · ${draft.flavor.trim()}` : ""}
        </p>
        <h3 id="rate-title" className="va-heading-s">
          {t("addProduct.triedIt", { food: inSentence(foodName) })}
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
            ? t("addProduct.ratingSavedClear", {
                meaning: scoreMeanings()[draft.rating - 1]!,
              })
            : t("addProduct.ratingSaved")}
        </p>
        <fieldset className="va-rate__group va-rate__tasty">
          <legend className="va-rate__subtitle">{t("addProduct.tasty")}</legend>
          <TasteScale
            selected={draft.enjoyment}
            onChoose={(enjoyment) => update({ enjoyment })}
          />
        </fieldset>
      </section>

      <div className="va-optional-list">
        <OptionalRow
          title={t("addProduct.ingredients")}
          status={
            evidence
              ? ingredients.checked
                ? t("addProduct.addedNothingAnimal")
                : t("addProduct.added")
              : undefined
          }
          open={evidence || Boolean(errors.ingredientUrl)}
        >
          <p className="small muted">{t("safety.uncheckedHint")}</p>
          <label htmlFor="ingredient-source">
            {t("addProduct.ingredientLink")}
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
              {t("addProduct.checkedNothing")}
            </label>
          )}
          <label htmlFor="manufacturer-label">
            {t("addProduct.packageSays")}
          </label>
          <select
            id="manufacturer-label"
            value={ingredients.label}
            onChange={(e) =>
              setIngredients({
                label: e.target.value as ProductDraft["ingredients"]["label"],
              })
            }
          >
            <option value="unknown">
              {t("community.manufacturerUnknown")}
            </option>
            <option value="vegan">{t("community.manufacturerVegan")}</option>
            <option value="plant_based">
              {t("community.manufacturerPlantBased")}
            </option>
            <option value="neither">
              {t("community.manufacturerNeither")}
            </option>
          </select>
          {countryCode === "in" && (
            <p className="small">{t("safety.indiaMark")}</p>
          )}
          <label htmlFor="ingredient-note">
            {t("addProduct.reviewerNote")}
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
          title={t("addProduct.allergens")}
          status={
            draft.allergens.status === "none_declared"
              ? t("addProduct.noneOnLabel")
              : draft.allergens.status === "declared"
                ? t("addProduct.allergensAdded", {
                    count:
                      draft.allergens.contains.length +
                      draft.allergens.mayContain.length,
                    number: formatCount(
                      draft.allergens.contains.length +
                        draft.allergens.mayContain.length,
                    ),
                  })
                : undefined
          }
          open={Boolean(draft.allergens.status) || Boolean(errors.allergens)}
        >
          <div id="allergens">
            <p className="small muted">
              {t("addProduct.recordPackage")}{" "}
              {photos.ingredients || photos.nutrition
                ? t("addProduct.confirmPhoto")
                : t("addProduct.confirmNoPhoto")}
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
          title={t("addProduct.whereSold")}
          status={
            draft.retailerIds.length
              ? t("addProduct.stores", {
                  count: draft.retailerIds.length,
                  number: formatCount(draft.retailerIds.length),
                })
              : undefined
          }
          open={draft.retailerIds.length > 0}
        >
          {options.retailers.length ? (
            <fieldset className="va-choice-list">
              <legend>{t("contribute.foundAt")}</legend>
              {options.retailers.length > 12 && (
                <input
                  type="search"
                  aria-label={t("addProduct.filterStores")}
                  placeholder={t("addProduct.filterStores")}
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
              <p className="small muted">{t("addProduct.foundAtNote")}</p>
            </fieldset>
          ) : (
            <p className="small muted">
              {t("addProduct.noStores", { country: countryName })}
            </p>
          )}
        </OptionalRow>

        <OptionalRow
          title={t("addProduct.otherFoods")}
          status={
            otherFoods.length
              ? t("addProduct.otherFoodsCount", {
                  count: otherFoods.length,
                  number: formatCount(otherFoods.length),
                })
              : undefined
          }
          open={otherFoods.length > 0}
        >
          <fieldset>
            <legend>{t("addProduct.alsoReplaces")}</legend>
            {otherFoods.length > 0 && (
              <ul
                className="va-chip-row"
                aria-label={t("addProduct.otherFoodsLabel")}
              >
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
                      <span className="sr-only">
                        {" "}
                        {t("addProduct.remove")}
                      </span>{" "}
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {room > 0 && (
              <FoodPicker
                id="other-food"
                label={t("fact.categoryAdd")}
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
          {t("addProduct.back")}
        </button>
        <button className="button" disabled={busy}>
          {busy ? t("addProduct.submitting") : t("addProduct.submit")}
        </button>
      </div>
    </form>
  );
}
