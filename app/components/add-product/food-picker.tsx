import { inSentence } from "../../lib/format";
import { useEffect, useState } from "react";
import { Badge } from "../ui/badges";
import { FoodIcon } from "../icons/food-icons";
import { AisleSelect, NewAisleField, type AisleOption } from "../aisle-select";
import {
  exactFood,
  matchFoods,
  placeLabel,
  type FoodChoice,
} from "../../lib/food-choices";
import type { FoodPick } from "../../lib/product-draft";
import { useCombobox } from "../../lib/use-combobox";
import { t } from "../../i18n";

const parseNames = (text: string) =>
  text
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 10);
// Typing narrows to the closest few; an empty field lets people browse.
const SHOWN = { typed: 8, browsing: 40 };
type Option =
  | { kind: "food"; food: FoodChoice; via: string | null }
  | { kind: "suggest"; name: string };

/**
 * Choose the food a product replaces (ARIA 1.2 combobox with a listbox
 * popup). Foods are matched by their name in the country and their other
 * names; foods not on in the country yet can still be chosen. The last
 * option can suggest a new food, which opens its aisle in place.
 */
export function FoodPicker({
  id,
  label,
  foods,
  countryName,
  value,
  onChange,
  aisles = [],
  allowSuggest = false,
  exclude = [],
  preferred,
  disabledHint,
  error,
  aisleError,
}: {
  id: string;
  label: string;
  foods: readonly FoodChoice[];
  countryName: string;
  value: FoodPick | null;
  onChange: (value: FoodPick | null) => void;
  aisles?: AisleOption[];
  allowSuggest?: boolean;
  exclude?: readonly string[];
  // The chosen brand's foods, listed first; every other food stays available.
  preferred?: { ids: readonly string[]; tag: string };
  // Set while the field waits for something else, and says what.
  disabledHint?: string;
  error?: string;
  aisleError?: string;
}) {
  const [query, setQuery] = useState("");
  const typed = query.trim();
  const isPreferred = (food: FoodChoice) =>
    Boolean(preferred?.ids.includes(food.id));
  const found = matchFoods(foods, query, exclude);
  const matches = [
    ...found.filter((match) => isPreferred(match.food)),
    ...found.filter((match) => !isPreferred(match.food)),
  ];
  const options: Option[] = [
    ...matches
      .slice(0, typed ? SHOWN.typed : SHOWN.browsing)
      .map((m) => ({ kind: "food" as const, ...m })),
    ...(allowSuggest && typed.length >= 2 && !exactFood(foods, typed)
      ? [{ kind: "suggest" as const, name: typed }]
      : []),
  ];
  // Other names update the draft as they're typed; the text is kept as typed
  // (commas and all) unless the draft's names change from outside, as when a
  // draft is restored.
  const joined = value?.kind === "new" ? value.otherNames.join(", ") : "";
  const [otherNames, setOtherNames] = useState(joined);
  useEffect(
    () =>
      setOtherNames((text) =>
        parseNames(text).join(", ") === joined ? text : joined,
      ),
    [joined],
  );
  const combo = useCombobox({
    id,
    text: query,
    options,
    error,
    onChoose: (option) => {
      setQuery("");
      onChange(
        option.kind === "food"
          ? { kind: "existing", id: option.food.id }
          : { kind: "new", name: option.name, aisleId: "", otherNames: [] },
      );
    },
  });
  const { showing, field, errorId } = combo;

  if (value?.kind === "existing") {
    const food = foods.find((f) => f.id === value.id);
    return (
      <div className="va-food-pick" id={id}>
        <p className="va-food-pick__label">{label}</p>
        <div className="va-food-pick__chosen">
          <span className="va-food-pick__tile" aria-hidden="true">
            <FoodIcon slug={food?.slug ?? "food"} size={22} />
          </span>
          <span className="va-food-pick__text">
            <strong>{food?.name ?? t("addProduct.chosenFood")}</strong>
            {food && placeLabel(food) && (
              <span className="va-small va-muted">{placeLabel(food)}</span>
            )}
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              onChange(null);
              requestAnimationFrame(() => field.current?.focus());
            }}
          >
            {t("addProduct.change")}
            <span className="sr-only"> {food?.name}</span>
          </button>
        </div>
        {food && !food.inCountry && (
          <p className="va-small">
            <Badge tone="neutral">
              {t("addProduct.notInCountry", { country: countryName })}
            </Badge>{" "}
            {t("addProduct.bringsFood", {
              food: inSentence(food.name),
              country: countryName,
            })}
          </p>
        )}
      </div>
    );
  }

  if (value?.kind === "new")
    return (
      <fieldset className="va-food-pick va-food-pick--new" id={id}>
        <legend>{t("addProduct.newFoodLegend")}</legend>
        <label htmlFor={`${id}-name`}>{t("suggestFood.nameLabel")}</label>
        <input
          id={`${id}-name`}
          value={value.name}
          maxLength={160}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
        {error && (
          <p id={errorId} className="field-error">
            {error}
          </p>
        )}
        <AisleSelect
          id={`${id}-aisle`}
          aisles={aisles}
          value={value.aisleId}
          required
          error={aisleError}
          onChange={(aisleId) => onChange({ ...value, aisleId })}
        />
        <NewAisleField
          id={`${id}-new-aisle`}
          value={value.newAisle ?? ""}
          onChange={(newAisle) => onChange({ ...value, newAisle })}
        />
        <label htmlFor={`${id}-other`}>{t("common.aliasesLabel")}</label>
        <input
          id={`${id}-other`}
          value={otherNames}
          maxLength={400}
          onChange={(e) => {
            setOtherNames(e.target.value);
            onChange({ ...value, otherNames: parseNames(e.target.value) });
          }}
        />
        <p className="small muted">{t("addProduct.newFoodNote")}</p>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            onChange(null);
            requestAnimationFrame(() => field.current?.focus());
          }}
        >
          {t("addProduct.chooseExisting")}
        </button>
      </fieldset>
    );

  return (
    <div className="va-food-pick va-combo" {...combo.rootProps}>
      <label htmlFor={`${id}-input`} className="va-food-pick__label">
        {label}
      </label>
      <input
        {...combo.inputProps}
        placeholder={disabledHint ? undefined : t("addProduct.foodPlaceholder")}
        disabled={Boolean(disabledHint)}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          combo.setOpen(true);
        }}
      />
      {disabledHint && <p className="small muted">{disabledHint}</p>}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {showing && typed
          ? options.length
            ? t("addProduct.choices", { number: options.length })
            : t("addProduct.noFoodMatches", { text: typed })
          : ""}
      </p>
      {showing && (
        <div className="va-combo__panel">
          <div
            id={combo.listId}
            role="listbox"
            aria-label={
              typed
                ? t("addProduct.foodsMatching", { text: typed })
                : t("addProduct.foods")
            }
            className="va-combo__list"
          >
            {options.map((option, index) => (
              <div
                key={option.kind === "food" ? option.food.id : "suggest"}
                {...combo.optionProps(index)}
                className={`va-combo__option${option.kind === "suggest" ? " va-combo__option--suggest" : ""}`}
              >
                {option.kind === "food" ? (
                  <>
                    {placeLabel(option.food) && (
                      <span className="va-combo__place">
                        {placeLabel(option.food)}
                      </span>
                    )}
                    <span className="va-combo__name">
                      {option.food.name}
                      {option.via && (
                        <span className="va-muted">
                          {" "}
                          · {t("addProduct.alsoCalled", { name: option.via })}
                        </span>
                      )}
                    </span>
                    {isPreferred(option.food) ? (
                      <span className="va-combo__tag">{preferred!.tag}</span>
                    ) : (
                      !option.food.inCountry && (
                        <span className="va-combo__tag">
                          {t("addProduct.notInCountry", {
                            country: countryName,
                          })}
                        </span>
                      )
                    )}
                  </>
                ) : (
                  <span className="va-combo__name">
                    {t("addProduct.suggestNewFood", { name: option.name })}
                  </span>
                )}
              </div>
            ))}
          </div>
          {!options.length && (
            <p className="va-combo__message">
              {allowSuggest
                ? t("addProduct.noMatchSuggest", { text: typed })
                : t("addProduct.noMatch", { text: typed })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
