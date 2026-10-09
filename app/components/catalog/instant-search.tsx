import { useEffect, useId, useRef, useState } from "react";
import { Form, Link, useNavigate } from "react-router";
import { FoodIcon } from "../icons/food-icons";
import { Icon } from "../icons/icon";
import { RankFlag, ScoreLabel } from "../ui/score";
import { plural } from "../../lib/format";
import { useHydrated } from "../../lib/use-hydrated";
import {
  useInstantSearch,
  type SuggestedFood,
  type SuggestedProduct,
} from "../../lib/instant-search";
import { foodPath, productPath, searchPath } from "../../lib/site-chrome";

type Option =
  | { kind: "food"; href: string; food: SuggestedFood }
  | { kind: "product"; href: string; product: SuggestedProduct };

/**
 * Search with instant answers (ARIA 1.2 combobox with a listbox popup).
 * Without JavaScript, or on Enter with nothing highlighted, it is a plain GET
 * form to the full search page.
 */
export function InstantSearch({
  country,
  variant,
  id,
  query = "",
  label = "Search a food or brand",
  placeholder = "Ground beef, cheddar, eggs…",
  onPreview,
}: {
  country: string;
  variant: "hero" | "header";
  id: string;
  query?: string;
  label?: string;
  placeholder?: string;
  // The food a desktop home page previews: the highlighted one, else the first.
  onPreview?: (food: SuggestedFood | null, query: string) => void;
}) {
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const { state, input } = useInstantSearch(country);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const listId = `${id}-listbox`;
  const optionId = useId();
  const result = state.result;
  const options: Option[] = result
    ? [
        ...result.foods.map((food) => ({
          kind: "food" as const,
          href: foodPath(country, food.slug),
          food,
        })),
        ...result.products.map((product) => ({
          kind: "product" as const,
          href: productPath(country, product.slug, product.food.slug),
          product,
        })),
      ]
    : [];
  const showing = open && state.status !== "idle";
  const foods = result?.foods ?? [];
  const highlighted = options[active];
  const previewFood =
    highlighted?.kind === "food" ? highlighted.food : (foods[0] ?? null);
  useEffect(() => {
    onPreview?.(showing ? previewFood : null, state.query);
  }, [onPreview, showing, previewFood, state.query]);
  useEffect(() => setActive(-1), [result]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const go = (href: string) => {
    setOpen(false);
    void navigate(href);
  };
  const searchHref = `${searchPath(country)}?q=${encodeURIComponent(state.query)}`;
  const announcement =
    state.status === "ready" && open
      ? options.length
        ? `${plural(foods.length, "food")} and ${plural(result!.products.length, "product")} found. Use the arrow keys to choose.`
        : `No foods match ${state.query} yet.`
      : "";
  return (
    <div
      ref={root}
      className={`va-instant va-instant--${variant}`}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
    >
      <Form
        method="get"
        action={searchPath(country)}
        role="search"
        className={`va-search va-search--${variant}`}
      >
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
        <Icon
          name="search"
          size={variant === "hero" ? 24 : 20}
          className="va-search__icon"
        />
        <input
          ref={field}
          id={id}
          name="q"
          type="search"
          defaultValue={query}
          maxLength={80}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          {...(hydrated
            ? {
                role: "combobox",
                "aria-autocomplete": "list" as const,
                "aria-expanded": showing && options.length > 0,
                "aria-controls": listId,
                "aria-activedescendant":
                  showing && highlighted ? `${optionId}-${active}` : undefined,
              }
            : {})}
          onChange={(event) => {
            input(event.target.value);
            setOpen(true);
          }}
          onFocus={(event) => {
            if (event.target.value) {
              input(event.target.value);
              setOpen(true);
            }
          }}
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
              go(highlighted.href);
            } else if (event.key === "Escape") {
              if (showing) {
                event.preventDefault();
                setOpen(false);
                setActive(-1);
              } else if (event.currentTarget.value) {
                event.preventDefault();
                event.currentTarget.value = "";
                input("");
              }
            }
          }}
        />
        <button type="submit" className="button search">
          Find swaps
        </button>
      </Form>
      {/* A live region without the status role, so a page's own status
          message stays the only one. */}
      <p
        className="sr-only va-instant__live"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </p>
      {showing && (
        <div className="va-instant__panel">
          {state.status === "error" ? (
            <p className="va-instant__message">
              Suggestions aren’t available right now. Press Enter to search.
            </p>
          ) : (
            <div
              id={listId}
              role="listbox"
              aria-label={`Suggestions for ${state.query}`}
              className="va-instant__list"
            >
              {(["food", "product"] as const).map((kind) => {
                const group = options
                  .map((option, index) => ({ option, index }))
                  .filter(({ option }) => option.kind === kind);
                if (!group.length) return null;
                const heading = `${id}-${kind}s`;
                return (
                  <div role="group" aria-labelledby={heading} key={kind}>
                    <p id={heading} className="va-instant__group">
                      {kind === "food"
                        ? "Foods · closest swap shown"
                        : "Products"}
                    </p>
                    {group.map(({ option, index }) => (
                      <div
                        key={option.href}
                        id={`${optionId}-${index}`}
                        role="option"
                        aria-selected={index === active}
                        className={`va-instant__option va-instant__option--${option.kind}`}
                        onPointerMove={() => setActive(index)}
                        // Keep focus in the field; the click navigates.
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => go(option.href)}
                      >
                        {option.kind === "food" ? (
                          <FoodOption food={option.food} />
                        ) : (
                          <ProductOption product={option.product} />
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          {state.status === "ready" && !options.length && (
            <div className="va-instant__message">
              <p className="va-instant__empty">
                No foods match “{state.query}” yet
              </p>
              <p>
                Check the spelling, or suggest it as a new food so others can
                add products.
              </p>
            </div>
          )}
          <div className="va-instant__footer">
            <Link to={searchHref} onClick={() => setOpen(false)}>
              See all results for “{state.query}”
            </Link>
            <Link
              to={`/propose-category?country=${country}&name=${encodeURIComponent(state.query)}`}
              onClick={() => setOpen(false)}
            >
              Can’t find a food? Suggest it
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function FoodOption({ food }: { food: SuggestedFood }) {
  const best = food.top[0];
  return (
    <>
      <span className="va-instant__tile" aria-hidden="true">
        <FoodIcon slug={food.slug} size={22} />
      </span>
      <span className="va-instant__food">
        <span className="va-instant__name">{food.name}</span>
        <span className="va-instant__meta">
          {[food.aisle, plural(food.productCount, "product")]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {best ? (
        <>
          <span className="va-instant__best">
            <RankFlag size="small">#1</RankFlag>
            <span>{best.name}</span>
          </span>
          <ScoreLabel value={best.score} size="compact" />
        </>
      ) : (
        <span className="va-instant__best va-instant__meta">
          No ranked swaps yet
        </span>
      )}
    </>
  );
}

function ProductOption({ product }: { product: SuggestedProduct }) {
  return (
    <>
      <span className="va-instant__food">
        <span className="va-instant__name">{product.name}</span>
        <span className="va-instant__meta">
          {product.rank
            ? `#${product.rank} for ${product.food.name.toLowerCase()}`
            : `Not ranked yet for ${product.food.name.toLowerCase()}`}
        </span>
      </span>
      {product.score !== null && product.rank !== null && (
        <ScoreLabel value={product.score} size="mini" tone="neutral" />
      )}
    </>
  );
}
