import { useState } from "react";
import { Form, Link } from "react-router";
import { FoodIcon } from "../icons/food-icons";
import { Icon } from "../icons/icon";
import { ScoreLabel } from "../ui/score";
import { Badge } from "../ui/badges";
import { plural } from "../../lib/format";
import { useFoodHref } from "../../lib/ranking-filters";
import { foodPath, productPath, searchPath } from "../../lib/site-chrome";

export interface AisleTopProduct {
  slug: string;
  name: string;
  brand: string | null;
  score: number;
  ratingCount: number;
  rank: number;
  early: boolean;
}
export interface AisleFood {
  slug: string;
  name: string;
  productCount: number;
  rankedCount: number;
  top: AisleTopProduct[];
}
export interface AisleShelf {
  slug: string;
  name: string;
  foods: AisleFood[];
}
export interface AisleData {
  aisle: { slug: string; name: string };
  shelves: AisleShelf[];
}

// One food with its first three products in Top order (Early ones carry
// their badge). Foods with fewer than three say so.
export function FoodCard({
  country,
  food,
  shelf,
  loading = false,
  level = 3,
}: {
  country: string;
  food: AisleFood;
  shelf?: string;
  loading?: boolean;
  // One below the heading that introduces the cards.
  level?: 2 | 3;
}) {
  const href = useFoodHref(country, foodPath(country, food.slug));
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <article className="va-food-card">
      <header className="va-food-card__head">
        <div>
          {shelf && <p className="va-food-card__shelf">{shelf}</p>}
          <Heading className="va-food-card__name">
            <Link to={href}>{food.name}</Link>
          </Heading>
        </div>
        <span className="va-food-card__count">
          {plural(food.productCount, "product")}
        </span>
      </header>
      {food.top.length ? (
        <ol className="va-food-card__top">
          {food.top.map((product) => (
            <li key={product.slug}>
              <span
                className={`va-food-card__rank${product.rank === 1 ? " va-food-card__rank--first" : ""}`}
                aria-label={`Rank ${product.rank}`}
              >
                {product.rank}
              </span>
              <Link
                className="va-food-card__product"
                to={productPath(country, product.slug, food.slug)}
              >
                {product.name}
              </Link>
              {product.early && <Badge tone="early">Early</Badge>}
              <ScoreLabel
                value={product.score}
                size="mini"
                tone={product.rank === 1 ? "tag" : "neutral"}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="va-food-card__empty">
          {loading ? "Loading the top products…" : "No ranked swaps yet."}
        </p>
      )}
      {food.top.length > 0 && food.top.length < 3 && (
        <p className="va-food-card__more">
          Know another?{" "}
          <Link to={`/add-product?country=${country}`}>Add it.</Link>
        </p>
      )}
    </article>
  );
}

// An aisle's shelves and foods. As a page, shelves are links (`?shelf=`); in
// the desktop aisle menu they filter in place.
export function AislePanel({
  country,
  data,
  shelf: initialShelf = null,
  mode,
  headingLevel = 1,
  loading = false,
}: {
  country: string;
  data: AisleData;
  shelf?: string | null;
  mode: "page" | "menu";
  headingLevel?: 1 | 2;
  // Top products are still loading (the menu shows names and counts first).
  loading?: boolean;
}) {
  const [menuShelf, setMenuShelf] = useState<string | null>(initialShelf);
  const shelf = mode === "page" ? initialShelf : menuShelf;
  const [query, setQuery] = useState("");
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const foods = data.shelves.flatMap((s) =>
    s.foods.map((food) => ({ ...food, shelf: s.name, shelfSlug: s.slug })),
  );
  const ranked = foods.reduce((sum, food) => sum + food.rankedCount, 0);
  const lower = query.trim().toLowerCase();
  const shown = foods.filter(
    (food) =>
      (!shelf || food.shelfSlug === shelf) &&
      (!lower ||
        food.name.toLowerCase().includes(lower) ||
        food.top.some((p) =>
          `${p.name} ${p.brand ?? ""}`.toLowerCase().includes(lower),
        )),
  );
  const single = data.shelves.length <= 1;
  const aisleName = data.aisle.name.toLowerCase();
  const shelfOptions = [
    { slug: null, name: `All ${aisleName}`, count: foods.length },
    ...data.shelves.map((s) => ({
      slug: s.slug,
      name: s.name,
      count: s.foods.length,
    })),
  ];
  return (
    <div className={`va-aisle va-aisle--${mode}`}>
      <div className="va-aisle__top">
        <span className="va-aisle__tile" aria-hidden="true">
          <FoodIcon slug={data.aisle.slug} size={28} />
        </span>
        <div className="va-aisle__title">
          <Heading className="va-aisle__name">{data.aisle.name}</Heading>
          <p className="va-small va-muted">
            {plural(foods.length, "food")}
            {data.shelves.length > 1
              ? ` on ${plural(data.shelves.length, "shelf", "shelves")}`
              : ""}{" "}
            {loading ? "" : ` · ${plural(ranked, "ranked product")}`} · top 3
            for each
          </p>
        </div>
        <Form
          className="va-aisle__filter"
          method="get"
          action={searchPath(country)}
          role="search"
          aria-label={`Find in ${data.aisle.name}`}
        >
          <label className="va-aisle__filter-field">
            <Icon name="filter" size={18} />
            <span className="sr-only">Find a food in {data.aisle.name}</span>
            <input
              type="search"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Find a food or brand in ${aisleName}`}
              autoComplete="off"
            />
          </label>
        </Form>
        {mode === "menu" && (
          <Link
            className="va-link va-aisle__all"
            to={foodPath(country, data.aisle.slug)}
          >
            See the whole aisle <Icon name="arrowRight" size={16} />
          </Link>
        )}
      </div>
      <div
        className={`va-aisle__body${single ? " va-aisle__body--single" : ""}`}
      >
        {!single && (
          <nav className="va-shelves" aria-label="Shelves">
            <ul>
              {shelfOptions.map((option) => {
                const selected = option.slug === shelf;
                return (
                  <li key={option.slug ?? "all"}>
                    {mode === "page" ? (
                      <Link
                        to={`${foodPath(country, data.aisle.slug)}${option.slug ? `?shelf=${option.slug}` : ""}`}
                        aria-current={selected ? "page" : undefined}
                        preventScrollReset
                        replace
                      >
                        <span>{option.name}</span>
                        <span className="va-shelves__count">
                          {option.count}
                        </span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setMenuShelf(option.slug)}
                      >
                        <span>{option.name}</span>
                        <span className="va-shelves__count">
                          {option.count}
                        </span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <SuggestFood country={country} />
          </nav>
        )}
        <div className="va-aisle__foods">
          {shown.length ? (
            <ul className="va-food-grid">
              {shown.map((food) => (
                <li key={food.slug}>
                  <FoodCard
                    country={country}
                    food={food}
                    shelf={single ? undefined : food.shelf}
                    loading={loading}
                    level={headingLevel === 1 ? 2 : 3}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="va-empty">
              <p className="va-heading-s">
                {lower
                  ? `No ${aisleName} foods match “${query.trim()}”`
                  : `No foods on this shelf yet`}
              </p>
              <p className="va-muted">
                Try the search bar above, or suggest it as a new food.
              </p>
            </div>
          )}
          <SuggestFood
            country={country}
            className={single ? undefined : "va-phone-block"}
          />
        </div>
      </div>
    </div>
  );
}

function SuggestFood({
  country,
  className,
}: {
  country: string;
  className?: string;
}) {
  return (
    <div className={`va-suggest-food${className ? ` ${className}` : ""}`}>
      <p className="va-suggest-food__title">Missing a food?</p>
      <p>
        Anyone can suggest one. It gets its own ranking once people add and rate
        products.
      </p>
      <Link
        className="button small-button"
        to={`/propose-category?country=${country}`}
      >
        Suggest a food
      </Link>
    </div>
  );
}
