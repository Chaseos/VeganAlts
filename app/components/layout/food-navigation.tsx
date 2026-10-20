import { useState } from "react";
import { Link } from "react-router";
import { FoodIcon } from "../icons/food-icons";
import { Icon } from "../icons/icon";
import { plural } from "../../lib/format";
import { useFoodHref } from "../../lib/ranking-filters";
import {
  foodPath,
  searchPath,
  type ChromeAisle,
  type ChromeFood,
} from "../../lib/site-chrome";

/** Navigation uses the country tree already embedded in the public page. */
export function FoodNavigation({
  country,
  category,
}: {
  country: string;
  category: ChromeAisle;
}) {
  const [query, setQuery] = useState("");
  const lower = query.trim().toLowerCase();
  const shown = category.foods.filter((food) =>
    food.name.toLowerCase().includes(lower),
  );
  return (
    <div className="va-aisle va-aisle--menu">
      <div className="va-aisle__top">
        <span className="va-aisle__tile" aria-hidden="true">
          <FoodIcon slug={category.slug} size={28} />
        </span>
        <div className="va-aisle__title">
          <h2 className="va-aisle__name">{category.name}</h2>
          <p className="va-small va-muted">
            {plural(category.foods.length, "food type")}
          </p>
        </div>
        <div
          className="va-aisle__filter"
          role="search"
          aria-label={`Find in ${category.name}`}
        >
          <label className="va-aisle__filter-field">
            <Icon name="filter" size={18} />
            <span className="sr-only">Find a food type in {category.name}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a food type"
              autoComplete="off"
            />
          </label>
        </div>
        <Link
          className="va-link va-aisle__all"
          to={foodPath(country, category.slug)}
          discover="none"
        >
          Browse {category.name} <Icon name="arrowRight" size={16} />
        </Link>
      </div>
      {shown.length ? (
        <ul
          className="va-foods-menu__foods"
          aria-label={`Food types in ${category.name}`}
        >
          {shown.map((food) => (
            <li key={food.slug}>
              <FoodNavigationLink country={country} food={food} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="va-small va-muted">
          {lower
            ? `No food types match “${query.trim()}”.`
            : "No food types in this category yet."}
        </p>
      )}
      <div className="va-foods-menu__more va-small">
        <Link className="va-link" to={searchPath(country)} discover="none">
          Browse all categories
        </Link>
        <Link
          className="va-link"
          to={`/propose-category?country=${country}&aisle=${category.slug}`}
          discover="none"
        >
          Suggest a food
        </Link>
      </div>
    </div>
  );
}

function FoodNavigationLink({
  country,
  food,
}: {
  country: string;
  food: ChromeFood;
}) {
  const href = useFoodHref(country, foodPath(country, food.slug));
  return (
    <Link className="va-foods-menu__food" to={href} discover="none">
      <FoodIcon slug={food.slug} size={24} />
      <span>
        <strong>{food.name}</strong>
        <span className="va-small va-muted">
          {plural(food.productCount, "product")}
        </span>
      </span>
      <Icon name="chevronRight" size={16} />
    </Link>
  );
}
