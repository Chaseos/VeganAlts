import { useEffect, useId, useRef, useState } from "react";
import type { BrandSuggestion } from "@server/community/domain/contracts";
import { communityRequest } from "../../lib/community";
import { plural } from "../../lib/format";

type Option =
  { kind: "brand"; brand: BrandSuggestion } | { kind: "new"; name: string };

const compact = (value: string) =>
  value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Choose the brand (milestone 7), an ARIA 1.2 combobox like the food picker.
 * From two characters it suggests brands through the shared matcher (a word's
 * start, part of the name or a couple of typos), each with its products in
 * the country. The last option adds the typed text as a new brand.
 */
export function BrandPicker({
  id,
  country,
  countryName,
  value,
  chosen,
  isNew,
  onType,
  onChoose,
  onChange,
  error,
}: {
  id: string;
  country: string;
  countryName: string;
  // The typed or chosen brand name.
  value: string;
  chosen: boolean;
  // Chosen as a new brand.
  isNew: boolean;
  onType: (text: string) => void;
  onChoose: (brand: { id: string | null; name: string }) => void;
  // Back to typing, keeping the text.
  onChange: () => void;
  error?: string;
}) {
  const [suggestions, setSuggestions] = useState<BrandSuggestion[]>([]);
  // The suggestion chosen, for its product count.
  const [picked, setPicked] = useState<BrandSuggestion | null>(null);
  // The text the suggestions answer; until it matches, they're loading, so
  // "Add as a new brand" never shows before a listed brand could.
  const [answered, setAnswered] = useState("");
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null),
    field = useRef<HTMLInputElement>(null);
  const optionId = useId(),
    listId = `${id}-listbox`,
    errorId = `${id}-error`;
  const typed = value.trim();
  const loading = typed.length >= 2 && answered !== typed;
  useEffect(() => {
    if (chosen) return;
    if (typed.length < 2) {
      setSuggestions([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ country, q: typed });
      void communityRequest<BrandSuggestion[]>(`community/brands?${query}`)
        // Suggestions are a convenience; a new brand can still be added.
        .catch(() => [])
        .then((found) => {
          if (!live) return;
          setSuggestions(found);
          setAnswered(typed);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [country, typed, chosen]);
  useEffect(() => setActive(-1), [typed]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  if (chosen) {
    const brand = picked?.name === value ? picked : null;
    return (
      <div className="va-food-pick" id={id}>
        <p className="va-food-pick__label">Brand (required)</p>
        <div className="va-food-pick__chosen">
          <span className="va-food-pick__text">
            <strong>{value}</strong>
            <span className="va-small va-muted">
              {isNew
                ? "New brand"
                : brand
                  ? brandCount(brand, countryName)
                  : "Listed brand"}
            </span>
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              onChange();
              requestAnimationFrame(() => field.current?.focus());
            }}
          >
            Change<span className="sr-only"> brand {value}</span>
          </button>
        </div>
      </div>
    );
  }

  const shown = loading ? [] : suggestions;
  const exact = shown.some((b) => compact(b.name) === compact(typed));
  const options: Option[] = [
    ...shown.map((brand) => ({ kind: "brand" as const, brand })),
    ...(typed.length >= 2 && !exact && !loading
      ? [{ kind: "new" as const, name: typed }]
      : []),
  ];
  const showing = open && typed.length >= 2;
  const highlighted = options[active];
  const choose = (option: Option) => {
    setOpen(false);
    setPicked(option.kind === "brand" ? option.brand : null);
    onChoose(
      option.kind === "brand"
        ? { id: option.brand.id, name: option.brand.name }
        : { id: null, name: option.name },
    );
  };
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
        Brand (required)
      </label>
      <input
        ref={field}
        id={`${id}-input`}
        type="text"
        role="combobox"
        autoComplete="off"
        maxLength={160}
        value={value}
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={listId}
        aria-activedescendant={
          showing && highlighted ? `${optionId}-${active}` : undefined
        }
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          onType(e.target.value);
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
        {showing && !loading
          ? `${plural(shown.length, "brand")} found. Use the arrow keys to choose.`
          : ""}
      </p>
      {showing && (
        <div className="va-combo__panel">
          <div
            id={listId}
            role="listbox"
            aria-label={`Brands matching ${typed}`}
            className="va-combo__list"
          >
            {options.map((option, index) => (
              <div
                key={option.kind === "brand" ? option.brand.id : "new"}
                id={`${optionId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`va-combo__option${option.kind === "new" ? " va-combo__option--suggest" : ""}`}
                onPointerMove={() => setActive(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option.kind === "brand" ? (
                  <>
                    <span className="va-combo__name">{option.brand.name}</span>
                    <span className="va-combo__tag">
                      {brandCount(option.brand, countryName)}
                    </span>
                  </>
                ) : (
                  <span className="va-combo__name">
                    Add “{option.name}” as a new brand
                  </span>
                )}
              </div>
            ))}
          </div>
          {loading && <p className="va-combo__message">Looking for brands…</p>}
        </div>
      )}
    </div>
  );
}

const brandCount = (brand: BrandSuggestion, countryName: string) =>
  brand.productCount
    ? `${plural(brand.productCount, "product")} in ${countryName}`
    : `Nothing in ${countryName} yet`;
