import { matchKey } from "@server/shared/domain/text";
import { useEffect, useState } from "react";
import type { BrandSuggestion } from "@server/community/domain/contracts";
import { communityRequest } from "../../lib/community";
import { formatCount } from "../../lib/format";
import { t } from "../../i18n";
import { useCombobox } from "../../lib/use-combobox";

type Option =
  { kind: "brand"; brand: BrandSuggestion } | { kind: "new"; name: string };

const compact = matchKey;

/**
 * Choose the brand (milestone 7), an ARIA 1.2 combobox like the food picker.
 * From three characters it suggests brands through the shared matcher (a
 * word's start, part of the name or a couple of typos), each with its
 * products in the country. The last option adds the typed text as a new
 * brand.
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
  // The text whose lookup failed. It stays unanswered: offering it as a new
  // brand could duplicate a listed brand the server matches only exactly.
  const [failed, setFailed] = useState("");
  const [attempt, setAttempt] = useState(0);
  const typed = value.trim();
  // Like other lookups while typing, nothing is looked up or offered before
  // three characters.
  const searchable = typed.length >= 3;
  const loading = searchable && answered !== typed && failed !== typed;
  useEffect(() => {
    if (chosen) return;
    if (!searchable) {
      setSuggestions([]);
      return;
    }
    let live = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ country, q: typed });
      setFailed("");
      void communityRequest<BrandSuggestion[]>(
        `community/brands?${query}`,
        undefined,
        undefined,
        undefined,
        { signal: controller.signal },
      )
        .then((found) => {
          if (!live) return;
          setSuggestions(found);
          setAnswered(typed);
        })
        .catch(() => live && setFailed(typed));
    }, 200);
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [country, typed, chosen, attempt]);
  // Suggestions, and the new-brand option, only answer the text typed now.
  const answeredNow = searchable && answered === typed;
  const shown = answeredNow ? suggestions : [];
  // A listed brand's name or other name is never offered as a new brand.
  const exact = shown.some((b) =>
    [b.name, ...b.aliases].some((name) => compact(name) === compact(typed)),
  );
  const options: Option[] = [
    ...shown.map((brand) => ({ kind: "brand" as const, brand })),
    ...(answeredNow && !exact ? [{ kind: "new" as const, name: typed }] : []),
  ];
  const combo = useCombobox({
    id,
    text: typed,
    options,
    error,
    ready: searchable,
    onChoose: (option) => {
      setPicked(option.kind === "brand" ? option.brand : null);
      onChoose(
        option.kind === "brand"
          ? { id: option.brand.id, name: option.brand.name }
          : { id: null, name: option.name },
      );
    },
  });
  const { showing, field, errorId } = combo;

  if (chosen) {
    const brand = picked?.name === value ? picked : null;
    return (
      <div className="va-food-pick" id={id}>
        <p className="va-food-pick__label">{t("addProduct.brandRequired")}</p>
        <div className="va-food-pick__chosen">
          <span className="va-food-pick__text">
            <strong>{value}</strong>
            <span className="va-small va-muted">
              {isNew
                ? t("addProduct.newBrand")
                : brand
                  ? brandCount(brand, countryName)
                  : t("addProduct.listedBrand")}
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
            {t("addProduct.change")}
            <span className="sr-only">
              {" "}
              {t("addProduct.changeBrand", { name: value })}
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="va-food-pick va-combo" {...combo.rootProps}>
      <label htmlFor={`${id}-input`} className="va-food-pick__label">
        {t("addProduct.brandRequired")}
      </label>
      <input
        {...combo.inputProps}
        maxLength={160}
        value={value}
        onChange={(e) => {
          onType(e.target.value);
          combo.setOpen(true);
        }}
      />
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {showing && answeredNow
          ? t("addProduct.brandsFound", {
              count: shown.length,
              number: formatCount(shown.length),
            })
          : showing && failed === typed
            ? t("addProduct.brandsFailedRetry")
            : ""}
      </p>
      {showing && (
        <div className="va-combo__panel">
          <div
            id={combo.listId}
            role="listbox"
            aria-label={t("addProduct.brandsMatching", { text: typed })}
            className="va-combo__list"
          >
            {options.map((option, index) => (
              <div
                key={option.kind === "brand" ? option.brand.id : "new"}
                {...combo.optionProps(index)}
                className={`va-combo__option${option.kind === "new" ? " va-combo__option--suggest" : ""}`}
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
                    {t("addProduct.addNewBrand", { name: option.name })}
                  </span>
                )}
              </div>
            ))}
          </div>
          {loading && (
            <p className="va-combo__message">{t("addProduct.lookingBrands")}</p>
          )}
          {failed === typed && (
            <p className="va-combo__message">
              {t("addProduct.brandsFailed")}{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setAttempt((n) => n + 1);
                  field.current?.focus();
                }}
              >
                {t("addProduct.tryAgain")}
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const brandCount = (brand: BrandSuggestion, countryName: string) =>
  brand.productCount
    ? t("addProduct.brandProducts", {
        count: brand.productCount,
        number: formatCount(brand.productCount),
        country: countryName,
      })
    : t("addProduct.brandNothing", { country: countryName });
