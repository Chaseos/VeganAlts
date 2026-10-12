import { describe, expect, it } from "vitest";
import {
  exactFood,
  matchFoods,
  normalizeFood,
  placeLabel,
  type FoodChoice,
} from "../../app/lib/food-choices";

const food = (
  name: string,
  otherNames: string[] = [],
  place: Partial<Pick<FoodChoice, "aisle" | "inCountry">> = {},
): FoodChoice => ({
  id: name.toLowerCase().replaceAll(" ", "-"),
  slug: name.toLowerCase().replaceAll(" ", "-"),
  name,
  otherNames,
  aisle: { id: "beef", name: "Beef", silent: false },
  inCountry: true,
  ...place,
});
const foods = [
  food("Beef mince", ["Ground Beef", "mince"]),
  food("Beef Burgers"),
  food("Chicken Nuggets", [], {
    aisle: { id: "chicken", name: "Chicken", silent: false },
  }),
  food("Milk", [], {
    aisle: { id: "milk-aisle", name: "Milk", silent: true },
    inCountry: false,
  }),
];

describe("food choices", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalizeFood("  Crème-Fraîche ")).toBe("creme fraiche");
  });

  it("ranks names before other names and says which name matched", () => {
    expect(matchFoods(foods, "beef").map((m) => m.food.name)).toEqual([
      "Beef Burgers",
      "Beef mince",
    ]);
    expect(matchFoods(foods, "ground")).toEqual([
      { food: foods[0], via: "Ground Beef" },
    ]);
    expect(matchFoods(foods, "nug").map((m) => m.food.name)).toEqual([
      "Chicken Nuggets",
    ]);
    expect(matchFoods(foods, "zzz")).toEqual([]);
  });

  it("lists every food with no query, the country's own first", () => {
    const all = matchFoods(foods, "", ["beef-burgers"]).map((m) => m.food.name);
    expect(all).toEqual(["Beef mince", "Chicken Nuggets", "Milk"]);
  });

  it("finds an exact name so suggesting a duplicate food is not offered", () => {
    expect(exactFood(foods, "ground beef")?.name).toBe("Beef mince");
    expect(exactFood(foods, "sausage rolls")).toBeNull();
    expect(exactFood(foods, "")).toBeNull();
  });

  it("names the aisle, skipping one that only repeats the food", () => {
    expect(placeLabel(foods[2]!)).toBe("Chicken");
    expect(placeLabel(foods[3]!)).toBeNull();
  });
});
