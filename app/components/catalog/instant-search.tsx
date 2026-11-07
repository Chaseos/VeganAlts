import { useEffect, useId, useRef, useState } from "react";
import { Form, Link, useNavigate } from "react-router";
import { FoodIcon } from "../icons/food-icons";
import { Icon } from "../icons/icon";
import { ProductThumbnail } from "./product-thumbnail";
import { RankFlag, ScoreLabel } from "../ui/score";
import { counted } from "../../lib/counted";
import { inSentence, productName } from "../../lib/format";
import { t } from "../../i18n";
import { useHydrated } from "../../lib/use-hydrated";
import {
  useInstantSearch,
  type SuggestedBrand,
  type SuggestedFood,
  type SuggestedProduct,
} from "../../lib/instant-search";
import {
  brandPath,
  foodPath,
  productPath,
  searchPath,
} from "../../lib/site-chrome";

type Option =
  | { kind: "food"; href: string; food: SuggestedFood }
  | { kind: "brand"; href: string; brand: SuggestedBrand }
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
  label = t("search.foodOrBrand"),
  placeholder = t("search.placeholder"),
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
        ...result.brands.map((brand) => ({
          kind: "brand" as const,
          href: brandPath(country, brand.slug),
          brand,
        })),
        ...result.products.map((product) => ({
          kind: "product" as const,
          href: productPath(country, product.slug, product.food.slug),
          product,
        })),
      ]
    : [];
  const showing = open && Boolean(state.query);
  // While the next answer loads, the previous one stays visible but cannot
  // be chosen: Enter searches for what is typed now.
  const stale = state.status === "loading";
  const foods = result?.foods ?? [];
  const highlighted = stale ? undefined : options[active];
  const previewFood =
    highlighted?.kind === "food" ? highlighted.food : (foods[0] ?? null);
  useEffect(() => {
    onPreview?.(showing ? previewFood : null, state.query);
  }, [onPreview, showing, previewFood, state.query]);
  useEffect(() => setActive(-1), [result]);
  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(`${optionId}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, optionId]);
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
        ? t("search.found", {
            foods: counted("count.food", foods.length),
            brands: result!.brands.length
              ? `${t("list.separator")}${counted("count.brand", result!.brands.length)}`
              : "",
            products: counted("count.product", result!.products.length),
          })
        : t("search.noFoods", { query: state.query })
      : open && state.status === "loading"
        ? t("search.loading")
        : open && state.status === "error"
          ? t("search.loadFailed")
          : open && state.query
            ? t("search.needMore")
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
            setActive(-1);
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
              if (!options.length || stale) return;
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
          {t("search.submit")}
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
          {state.status === "idle" && (
            <p className="va-instant__message">{t("search.needThree")}</p>
          )}
          {stale && (
            <p className="va-instant__message">{t("search.loading")}</p>
          )}
          {state.status === "error" ? (
            <p className="va-instant__message">{t("search.unavailable")}</p>
          ) : (
            <div
              id={listId}
              role="listbox"
              aria-label={t("search.suggestionsFor", { query: state.query })}
              aria-busy={stale}
              className="va-instant__list"
            >
              {(["food", "brand", "product"] as const).map((kind) => {
                const group = options
                  .map((option, index) => ({ option, index }))
                  .filter(({ option }) => option.kind === kind);
                if (!group.length) return null;
                const heading = `${id}-${kind}s`;
                return (
                  <div role="group" aria-labelledby={heading} key={kind}>
                    <p id={heading} className="va-instant__group">
                      {kind === "food"
                        ? t("search.groupFoods")
                        : kind === "brand"
                          ? t("search.groupBrands")
                          : t("search.groupProducts")}
                    </p>
                    {group.map(({ option, index }) => (
                      <div
                        key={option.href}
                        id={`${optionId}-${index}`}
                        role="option"
                        aria-selected={index === active}
                        className={`va-instant__option va-instant__option--${option.kind}`}
                        onPointerMove={() => !stale && setActive(index)}
                        // Keep focus in the field; the click navigates.
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => !stale && go(option.href)}
                      >
                        {option.kind === "food" ? (
                          <FoodOption food={option.food} />
                        ) : option.kind === "brand" ? (
                          <BrandOption brand={option.brand} />
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
                {t("search.emptyTitle", { query: state.query })}
              </p>
              <p>{t("search.emptyBody")}</p>
            </div>
          )}
          {state.status !== "idle" && (
            <div className="va-instant__footer">
              <Link to={searchHref} onClick={() => setOpen(false)}>
                {t("search.seeAll", { query: state.query })}
              </Link>
              <Link
                to={`/propose-category?country=${country}&name=${encodeURIComponent(state.query)}`}
                onClick={() => setOpen(false)}
              >
                {t("search.cantFind")}
              </Link>
            </div>
          )}
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
          {[food.aisle, counted("count.product", food.productCount)]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {best ? (
        <>
          <span className="va-instant__best">
            <RankFlag size="small">#1</RankFlag>
            <span>{productName(best.name, best.brand)}</span>
          </span>
          <ScoreLabel value={best.score} size="compact" />
        </>
      ) : (
        <span className="va-instant__best va-instant__meta">
          {t("search.noRanked")}
        </span>
      )}
    </>
  );
}

function BrandOption({ brand }: { brand: SuggestedBrand }) {
  return (
    <span className="va-instant__food">
      <span className="va-instant__name">{brand.name}</span>
      <span className="va-instant__meta">
        {counted("count.product", brand.productCount)}
      </span>
    </span>
  );
}

function ProductOption({ product }: { product: SuggestedProduct }) {
  return (
    <>
      <ProductThumbnail
        imageId={product.imageId}
        food={product.food.slug}
        size="small"
      />
      <span className="va-instant__food">
        <span className="va-instant__name">
          {productName(product.name, product.brand)}
        </span>
        <span className="va-instant__meta">
          {product.rank
            ? t("search.closestRank", {
                rank: product.rank,
                food: inSentence(product.food.name),
              })
            : t("search.notRanked", { food: inSentence(product.food.name) })}
        </span>
        {product.rank !== null && (
          <span className="va-instant__meta">
            {t("search.includesFlavors")}
          </span>
        )}
      </span>
      {product.score !== null && product.rank !== null && (
        <ScoreLabel value={product.score} size="mini" tone="neutral" />
      )}
    </>
  );
}
