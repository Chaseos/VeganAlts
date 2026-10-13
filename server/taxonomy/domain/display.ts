import { categoryKey } from "./taxonomy";

const same = (a: string, b: string) => categoryKey(a) === categoryKey(b);

/**
 * A "silent" aisle only repeats its one food (Eggs › Eggs, Butter › Butter).
 * Breadcrumbs then skip it as a level, so a name never repeats; its page and
 * menu keep working.
 */
export function silentAisle(
  aisle: { name: string },
  foods: readonly { name: string }[],
) {
  return foods.length === 1 && same(foods[0]!.name, aisle.name);
}
