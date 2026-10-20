import { searchPath } from "@server/catalog/domain/markets";
import { normalizeFood } from "./food-choices";
import type { ChromeAisle } from "./site-chrome";

interface NavigationGroupDefinition {
  id: string;
  name: string;
  iconSlug: string;
  categorySlugs: readonly string[];
}

// Presentation only: the stored taxonomy remains category → food. Match
// stable slugs, not display names, which may differ between countries.
export const NAVIGATION_GROUPS = [
  {
    id: "meat-seafood",
    name: "Meat & seafood",
    iconSlug: "beef",
    categorySlugs: [
      "beef",
      "chicken",
      "pork",
      "turkey-aisle",
      "lamb-aisle",
      "fish-and-seafood",
    ],
  },
  {
    id: "dairy-eggs",
    name: "Dairy & eggs",
    iconSlug: "milk-aisle",
    categorySlugs: [
      "milk-aisle",
      "cream-aisle",
      "butter-aisle",
      "yogurt-aisle",
      "cheese",
      "eggs-aisle",
    ],
  },
  {
    id: "bakery-baking",
    name: "Bakery & baking",
    iconSlug: "brioche-and-rolls",
    categorySlugs: ["bakery", "toaster-pastries-aisle", "bakery-and-desserts"],
  },
  {
    id: "sweets-desserts",
    name: "Sweets & desserts",
    iconSlug: "ice-cream-aisle",
    categorySlugs: ["chocolate", "candy", "ice-cream-aisle", "desserts"],
  },
  {
    id: "sauces-dips-spreads",
    name: "Sauces, dips & spreads",
    iconSlug: "dips-and-spreads",
    categorySlugs: ["condiments", "sauces", "dips-and-spreads"],
  },
  {
    id: "meals-prepared-foods",
    name: "Meals & prepared foods",
    iconSlug: "meals",
    categorySlugs: ["meals", "pizza-aisle"],
  },
] as const satisfies readonly NavigationGroupDefinition[];

const MORE_FOODS: NavigationGroupDefinition = {
  id: "more-foods",
  name: "More foods",
  iconSlug: "food",
  categorySlugs: [],
};
const definitions = [...NAVIGATION_GROUPS, MORE_FOODS];
const groupBySlug = new Map<string, string>(
  NAVIGATION_GROUPS.flatMap((group) =>
    group.categorySlugs.map((slug) => [slug, group.id] as const),
  ),
);

export interface NavigationGroup<T> {
  id: string;
  name: string;
  iconSlug: string;
  categories: T[];
}

/** Keep caller order and visibility, including empty contribution choices. */
export function groupCategories<T extends { slug: string }>(
  categories: readonly T[],
): NavigationGroup<T>[] {
  return definitions.flatMap((definition) => {
    const members = categories.filter(
      (category) =>
        (groupBySlug.get(category.slug) ?? MORE_FOODS.id) === definition.id,
    );
    return members.length
      ? [
          {
            id: definition.id,
            name: definition.name,
            iconSlug: definition.iconSlug,
            categories: members,
          },
        ]
      : [];
  });
}

export function navigationGroupPath(country: string, groupId: string) {
  return `${searchPath(country)}#${groupId}`;
}

/** Locate the current category/food or an explicit directory section. */
export function currentNavigationGroup(
  groups: readonly NavigationGroup<ChromeAisle>[],
  location: { pathname: string; search: string; hash: string },
) {
  const segment = location.pathname.split("/")[2] ?? "";
  if (segment === "search" && !new URLSearchParams(location.search).get("q"))
    return groups.find((group) => `#${group.id}` === location.hash)?.id;
  const food = new URLSearchParams(location.search).get("food") ?? "";
  return groups.find((group) =>
    group.categories.some(
      (category) =>
        category.slug === segment ||
        category.foods.some(
          (item) => item.slug === segment || item.slug === food,
        ),
    ),
  )?.id;
}

/** Popular shortcuts by default; a search examines every available food. */
export function navigationSections(
  group: NavigationGroup<ChromeAisle>,
  query = "",
) {
  const wanted = normalizeFood(query);
  return group.categories.flatMap((category) => {
    const foods = !wanted
      ? category.foods.slice(0, 3)
      : normalizeFood(category.name).includes(wanted)
        ? category.foods
        : category.foods.filter((food) =>
            normalizeFood(food.name).includes(wanted),
          );
    return foods.length ? [{ category, foods }] : [];
  });
}
