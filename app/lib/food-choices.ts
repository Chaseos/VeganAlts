import type { FoodChoice } from "@server/taxonomy/domain/food-choices";

export type { FoodChoice };

/** Case, accents, punctuation and spacing never decide a match. */
export function normalizeFood(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The food's aisle ("Chicken"), or null when the aisle only repeats it. */
export const placeLabel = (food: FoodChoice) =>
  food.aisle.silent ? null : food.aisle.name;

export interface FoodMatch {
  food: FoodChoice;
  // The other name that matched ("Also called mince"), when not the name.
  via: string | null;
}

/**
 * Foods matching what someone typed: names first, then other names; words
 * that start with the query before words that merely contain it. With no
 * query, every food in name order (foods on in the country first).
 */
export function matchFoods(
  foods: readonly FoodChoice[],
  query: string,
  exclude: readonly string[] = [],
): FoodMatch[] {
  const wanted = normalizeFood(query);
  const open = foods.filter((food) => !exclude.includes(food.id));
  if (!wanted)
    return open
      .map((food) => ({ food, via: null }))
      .sort(
        (a, b) =>
          Number(b.food.inCountry) - Number(a.food.inCountry) ||
          a.food.name.localeCompare(b.food.name),
      );
  const score = (text: string) => {
    const value = normalizeFood(text);
    if (value === wanted) return 4;
    if (value.startsWith(wanted)) return 3;
    if (value.split(" ").some((word) => word.startsWith(wanted))) return 2;
    return value.includes(wanted) ? 1 : 0;
  };
  return open
    .flatMap((food): (FoodMatch & { rank: number })[] => {
      const own = score(food.name);
      const best = food.otherNames
        .map((name) => ({ name, score: score(name) }))
        .sort((a, b) => b.score - a.score)[0];
      if (own >= (best?.score ?? 0) && own > 0)
        return [{ food, via: null, rank: own * 2 + 1 }];
      if (best && best.score > 0)
        return [{ food, via: best.name, rank: best.score * 2 }];
      return [];
    })
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        Number(b.food.inCountry) - Number(a.food.inCountry) ||
        a.food.name.localeCompare(b.food.name),
    )
    .map(({ food, via }) => ({ food, via }));
}

/** A food the query names exactly, by its name or another name. */
export function exactFood(foods: readonly FoodChoice[], query: string) {
  const wanted = normalizeFood(query);
  return (
    (wanted &&
      foods.find((food) =>
        [food.name, ...food.otherNames].some(
          (name) => normalizeFood(name) === wanted,
        ),
      )) ||
    null
  );
}
