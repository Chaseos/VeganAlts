import { useState } from "react";
import { Form, Link } from "react-router";
import { FoodIcon } from "../icons/food-icons";
import { Icon } from "../icons/icon";
import { ScoreLabel } from "../ui/score";
import { Badge, SeasonBadge } from "../ui/badges";
import type { Season } from "@server/taxonomy/domain/season";
import { plural, productName } from "../../lib/format";
import { ProductThumbnail } from "./product-thumbnail";
import { useFoodHref } from "../../lib/ranking-filters";
import { foodPath, productPath, searchPath } from "../../lib/site-chrome";

export interface AisleTopProduct {
  slug: string;
  name: string;
  brand: string | null;
  imageId: string | null;
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
  season?: Season | null;
  top: AisleTopProduct[];
}
export interface AisleData {
  aisle: { slug: string; name: string };
  foods: AisleFood[];
}

// One food with its first three products in Top order (Early ones carry
// their badge). Foods with fewer than three say so.
export function FoodCard({
  country,
  food,
  place,
  loading = false,
  level = 3,
}: {
  country: string;
  food: AisleFood;
  // Where the food sits ("Cheese"), where cards from several aisles mix.
  place?: string;
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
          {place && <p className="va-food-card__place">{place}</p>}
          <Heading className="va-food-card__name">
            <Link to={href}>{food.name}</Link>
          </Heading>
          {food.season && <SeasonBadge season={food.season} />}
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
              <ProductThumbnail
                imageId={product.imageId}
                food={food.slug}
                size="small"
              />
              <Link
                className="va-food-card__product"
                to={productPath(country, product.slug, food.slug)}
              >
                {productName(product.name, product.brand)}
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
          <Link to={`/add-product?country=${country}&food=${food.slug}`}>
            Add it.
          </Link>
        </p>
      )}
    </article>
  );
}

// An aisle's foods, as a page or in the desktop aisle menu.
export function AislePanel({
  country,
  data,
  mode,
  headingLevel = 1,
  loading = false,
}: {
  country: string;
  data: AisleData;
  mode: "page" | "menu";
  headingLevel?: 1 | 2;
  // Top products are still loading (the menu shows names and counts first).
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const foods = data.foods;
  const ranked = foods.reduce((sum, food) => sum + food.rankedCount, 0);
  const lower = query.trim().toLowerCase();
  const shown = foods.filter(
    (food) =>
      !lower ||
      food.name.toLowerCase().includes(lower) ||
      food.top.some((p) =>
        `${p.name} ${p.brand ?? ""}`.toLowerCase().includes(lower),
      ),
  );
  const aisleName = data.aisle.name.toLowerCase();
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
            {loading ? "" : ` · ${plural(ranked, "ranked swap")}`} · top 3 for
            each
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
      <div className="va-aisle__body va-aisle__body--single">
        <div className="va-aisle__foods">
          {shown.length ? (
            <ul className="va-food-grid">
              {shown.map((food) => (
                <li key={food.slug}>
                  <FoodCard
                    country={country}
                    food={food}
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
                  : `No foods in this aisle yet`}
              </p>
              <p className="va-muted">
                Try the search bar above, or suggest it as a new food.
              </p>
            </div>
          )}
          <SuggestFood country={country} aisle={data.aisle.slug} />
        </div>
      </div>
    </div>
  );
}

function SuggestFood({ country, aisle }: { country: string; aisle: string }) {
  return (
    <div className="va-suggest-food">
      <p className="va-suggest-food__title">Missing a food?</p>
      <p>
        Anyone can suggest one. It gets its own ranking once people add and rate
        products.
      </p>
      <Link
        className="button small-button"
        to={`/propose-category?country=${country}&aisle=${aisle}`}
      >
        Suggest a food
      </Link>
    </div>
  );
}
