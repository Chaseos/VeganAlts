import { describe, expect, it } from "vitest";
import { TAXONOMY_GROUPS } from "../../db/seed/taxonomy";
import {
  currentNavigationGroup,
  groupCategories,
  NAVIGATION_GROUPS,
  navigationGroupPath,
  navigationSections,
} from "../../app/lib/navigation-groups";
import type { ChromeAisle } from "../../app/lib/site-chrome";

const category = (slug: string, name = slug, names = [slug]): ChromeAisle => ({
  slug,
  name,
  foods: names.map((name) => ({
    slug: name.toLowerCase().replaceAll(" ", "-"),
    name,
    productCount: 0,
  })),
});

describe("shared food navigation groups", () => {
  it("places every seed and live category exactly once, with a visible fallback", () => {
    const categories = [
      ...TAXONOMY_GROUPS.filter((item) => item.parent === "food"),
      // The seed has every current category; live environments may still
      // hold the earlier Bakery and desserts aisle, and add new ones.
      ...["bakery-and-desserts", "future-category"].map((slug) => ({ slug })),
    ];
    const groups = groupCategories(categories);
    expect(groups.map((group) => group.id)).toEqual([
      ...NAVIGATION_GROUPS.map((group) => group.id),
      "more-foods",
    ]);
    const assigned = groups.flatMap((group) => group.categories);
    expect(assigned).toHaveLength(categories.length);
    expect(new Set(assigned.map((item) => item.slug)).size).toBe(
      categories.length,
    );
    expect(groups.at(-1)?.categories).toEqual([{ slug: "future-category" }]);
    expect(
      groups
        .find((group) => group.id === "bakery-baking")
        ?.categories.map((item) => item.slug),
    ).toContain("bakery-and-desserts");
    const mapped = NAVIGATION_GROUPS.flatMap((group) => [
      ...group.categorySlugs,
    ]);
    expect(new Set(mapped).size).toBe(mapped.length);
  });

  it("keeps country visibility, local names and popularity without mutating input", () => {
    const milk = category("milk-aisle", "Milk"),
      cheese = category("cheese", "Cheese"),
      beef = category("beef", "Beef", ["Beef mince"]);
    const input = [cheese, beef, milk];
    const groups = groupCategories(input);
    expect(groups.map((group) => group.name)).toEqual([
      "Meat & seafood",
      "Dairy & eggs",
    ]);
    expect(groups[1]?.categories).toEqual([cheese, milk]);
    expect(groups[0]?.categories[0]?.foods[0]?.name).toBe("Beef mince");
    expect(input).toEqual([cheese, beef, milk]);
    expect(groupCategories([])).toEqual([]);
    // Contribution choices retain an empty category omitted by public loaders.
    expect(
      groupCategories([{ id: "lamb-id", slug: "lamb-aisle", name: "Lamb" }])[0]
        ?.categories[0]?.id,
    ).toBe("lamb-id");
  });

  it("limits default shortcuts but searches all foods and category names", () => {
    const cheese = category("cheese", "Cheese", [
      "Cheddar",
      "Mozzarella",
      "Gouda",
      "Cream Cheese",
      "Crème fraîche",
    ]);
    const group = groupCategories([
      cheese,
      category("milk-aisle", "Milk", ["Milk"]),
    ])[0]!;
    expect(
      navigationSections(group)[0]?.foods.map((food) => food.name),
    ).toEqual(["Cheddar", "Mozzarella", "Gouda"]);
    expect(navigationSections(group, "cheese")[0]?.foods).toEqual(cheese.foods);
    expect(navigationSections(group, "creme")[0]?.foods[0]?.name).toBe(
      "Crème fraîche",
    );
    expect(navigationSections(group, "cream cheese")[0]?.foods[0]?.name).toBe(
      "Cream Cheese",
    );
    expect(navigationSections(group, "no match")).toEqual([]);
    expect(navigationSections(group, "   ")[0]?.foods).toHaveLength(3);
  });

  it("selects only the current group for category, food, product context and directory links", () => {
    const groups = groupCategories([
      category("cheese", "Cheese", ["Cheddar"]),
      category("beef"),
    ]);
    const current = (pathname: string, search = "", hash = "") =>
      currentNavigationGroup(groups, { pathname, search, hash });
    expect(current("/gb/cheese")).toBe("dairy-eggs");
    expect(current("/gb/cheddar")).toBe("dairy-eggs");
    expect(current("/gb/products/example", "?food=cheddar")).toBe("dairy-eggs");
    expect(current("/gb/search", "", "#meat-seafood")).toBe("meat-seafood");
    expect(current("/gb/search", "?q=cheese", "#dairy-eggs")).toBeUndefined();
    expect(current("/gb/search", "", "#unknown")).toBeUndefined();
    expect(navigationGroupPath("gb", "dairy-eggs")).toBe(
      "/gb/search#dairy-eggs",
    );
  });
});
