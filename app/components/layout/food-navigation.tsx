import { useState } from "react";
import { Link } from "react-router";
import { FoodIcon } from "../icons/food-icons";
import { Icon } from "../icons/icon";
import { plural } from "../../lib/format";
import { useFoodHref } from "../../lib/ranking-filters";
import {
  navigationGroupPath,
  navigationSections,
  type NavigationGroup,
} from "../../lib/navigation-groups";
import {
  foodPath,
  searchPath,
  type ChromeAisle,
  type ChromeFood,
} from "../../lib/site-chrome";

/** Navigation uses the country tree already embedded in the public page. */
export function FoodNavigation({
  country,
  group,
}: {
  country: string;
  group: NavigationGroup<ChromeAisle>;
}) {
  const [query, setQuery] = useState("");
  return (
    <div className="va-food-navigation">
      <div className="va-food-navigation__top">
        <h2 className="va-heading-m">{group.name}</h2>
        <div role="search" aria-label={`Find in ${group.name}`}>
          <label className="va-aisle__filter-field">
            <Icon name="filter" size={18} />
            <span className="sr-only">Find a food type in {group.name}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a food type"
              autoComplete="off"
            />
          </label>
        </div>
      </div>
      <FoodGroupSections country={country} group={group} query={query} />
      <div className="va-foods-menu__more va-small">
        <Link
          className="va-link"
          to={navigationGroupPath(country, group.id)}
          discover="none"
        >
          Browse all {group.name.toLowerCase()}
        </Link>
        <Link className="va-link" to={searchPath(country)} discover="none">
          Browse all categories
        </Link>
        <Link
          className="va-link"
          to={`/propose-category?country=${country}`}
          discover="none"
        >
          Suggest a food
        </Link>
      </div>
    </div>
  );
}

/** The same compact category shortcuts serve pointer and phone navigation. */
export function FoodGroupSections({
  country,
  group,
  query = "",
  onNavigate,
}: {
  country: string;
  group: NavigationGroup<ChromeAisle>;
  query?: string;
  onNavigate?: () => void;
}) {
  const sections = navigationSections(group, query);
  if (!sections.length)
    return (
      <p className="va-small va-muted">No food types match “{query.trim()}”.</p>
    );
  return (
    <div className="va-food-navigation__sections">
      {sections.map(({ category, foods }) => (
        <section
          key={category.slug}
          className="va-food-navigation__category"
          aria-label={category.name}
        >
          <h3 className="va-food-navigation__heading">
            <Link
              to={foodPath(country, category.slug)}
              discover="none"
              onClick={onNavigate}
            >
              <FoodIcon slug={category.slug} size={20} />
              {category.name}
            </Link>
          </h3>
          <ul
            className="va-food-navigation__foods"
            aria-label={`Food types in ${category.name}`}
          >
            {foods.map((food) => (
              <li key={food.slug}>
                <FoodNavigationLink
                  country={country}
                  food={food}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
          {category.foods.length > foods.length && (
            <Link
              className="va-link va-food-navigation__all"
              to={foodPath(country, category.slug)}
              discover="none"
              aria-label={`View all ${category.name} food types`}
              onClick={onNavigate}
            >
              View all ({category.foods.length}){" "}
              <Icon name="arrowRight" size={14} />
            </Link>
          )}
        </section>
      ))}
    </div>
  );
}

function FoodNavigationLink({
  country,
  food,
  onNavigate,
}: {
  country: string;
  food: ChromeFood;
  onNavigate?: () => void;
}) {
  const href = useFoodHref(country, foodPath(country, food.slug));
  return (
    <Link
      className="va-food-navigation__food"
      to={href}
      discover="none"
      onClick={onNavigate}
    >
      <span>{food.name}</span>
      <span className="va-small va-muted">
        {plural(food.productCount, "product")}
      </span>
    </Link>
  );
}
