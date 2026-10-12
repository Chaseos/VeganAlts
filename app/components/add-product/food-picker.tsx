import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "../ui/badges";
import { FoodIcon } from "../icons/food-icons";
import { AisleSelect, type AisleOption } from "../aisle-select";
import {
  exactFood,
  matchFoods,
  placeLabel,
  type FoodChoice,
} from "../../lib/food-choices";
import type { FoodPick } from "../../lib/product-draft";

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
  error?: string;
  aisleError?: string;
}) {
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null),
    field = useRef<HTMLInputElement>(null);
  const optionId = useId(),
    listId = `${id}-listbox`,
    errorId = `${id}-error`;
  const typed = query.trim();
  const matches = matchFoods(foods, query, exclude);
  const options: Option[] = [
    ...matches
      .slice(0, typed ? SHOWN.typed : SHOWN.browsing)
      .map((m) => ({ kind: "food" as const, ...m })),
    ...(allowSuggest && typed.length >= 2 && !exactFood(foods, typed)
      ? [{ kind: "suggest" as const, name: typed }]
      : []),
  ];
  useEffect(() => setActive(-1), [query]);
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
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const choose = (option: Option) => {
    setOpen(false);
    setQuery("");
    onChange(
      option.kind === "food"
        ? { kind: "existing", id: option.food.id }
        : { kind: "new", name: option.name, aisleId: "", otherNames: [] },
    );
  };

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
            <strong>{food?.name ?? "Chosen food"}</strong>
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
            Change<span className="sr-only"> {food?.name}</span>
          </button>
        </div>
        {food && !food.inCountry && (
          <p className="va-small">
            <Badge tone="neutral">Not in {countryName} yet</Badge> Adding a
            product brings {food.name.toLowerCase()} to {countryName}.
          </p>
        )}
      </div>
    );
  }

  if (value?.kind === "new")
    return (
      <fieldset className="va-food-pick va-food-pick--new" id={id}>
        <legend>New food (reviewed with your product)</legend>
        <label htmlFor={`${id}-name`}>Food name (required)</label>
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
        <label htmlFor={`${id}-other`}>
          Other names (optional, separated by commas)
        </label>
        <input
          id={`${id}-other`}
          value={otherNames}
          maxLength={400}
          onChange={(e) => {
            setOtherNames(e.target.value);
            onChange({ ...value, otherNames: parseNames(e.target.value) });
          }}
        />
        <p className="small muted">
          A moderator checks new foods for duplicates. Your product goes live
          once the food is accepted.
        </p>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            onChange(null);
            requestAnimationFrame(() => field.current?.focus());
          }}
        >
          Choose an existing food instead
        </button>
      </fieldset>
    );

  const showing = open;
  const highlighted = options[active];
  return (
    <div
      className="va-food-pick va-combo"
      ref={root}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
    >
      <label htmlFor={`${id}-input`} className="va-food-pick__label">
        {label}
      </label>
      <input
        ref={field}
        id={`${id}-input`}
        type="text"
        role="combobox"
        autoComplete="off"
        placeholder="Chicken nuggets, cheddar, milk…"
        value={query}
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={listId}
        aria-activedescendant={
          showing && highlighted ? `${optionId}-${active}` : undefined
        }
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!options.length) return;
            event.preventDefault();
            setOpen(true);
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((index) =>
              index === -1 && step === -1
                ? options.length - 1
                : (index + step + options.length) % options.length,
            );
          } else if (event.key === "Enter" && showing && highlighted) {
            event.preventDefault();
            choose(highlighted);
          } else if (event.key === "Escape" && showing) {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {showing && typed
          ? options.length
            ? `${options.length} choices. Use the arrow keys to choose.`
            : `No food matches ${typed}.`
          : ""}
      </p>
      {showing && (
        <div className="va-combo__panel">
          <div
            id={listId}
            role="listbox"
            aria-label={`Foods${typed ? ` matching ${typed}` : ""}`}
            className="va-combo__list"
          >
            {options.map((option, index) => (
              <div
                key={option.kind === "food" ? option.food.id : "suggest"}
                id={`${optionId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`va-combo__option${option.kind === "suggest" ? " va-combo__option--suggest" : ""}`}
                onPointerMove={() => setActive(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
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
                          · Also called {option.via}
                        </span>
                      )}
                    </span>
                    {!option.food.inCountry && (
                      <span className="va-combo__tag">
                        Not in {countryName} yet
                      </span>
                    )}
                  </>
                ) : (
                  <span className="va-combo__name">
                    Suggest “{option.name}” as a new food
                  </span>
                )}
              </div>
            ))}
          </div>
          {!options.length && (
            <p className="va-combo__message">
              No food matches “{typed}”. Check the spelling
              {allowSuggest ? ", or suggest it as a new food." : "."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
