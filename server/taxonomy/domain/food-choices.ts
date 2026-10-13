import { aisleTree, taxonomyShape, type TaxonomyNode } from "./shape";

/** One food the contribution picker offers, with where it sits. */
export interface FoodChoice {
  id: string;
  slug: string;
  // Its name in the country (a display name where one is set).
  name: string;
  otherNames: string[];
  // A silent aisle only repeats its one food; the picker then omits it.
  aisle: { id: string; name: string; silent: boolean };
  // Not on in the country yet: adding a product there switches it on.
  inCountry: boolean;
  // A seasonal food: a product added to it is seasonal unless said otherwise.
  seasonal: boolean;
}

/**
 * Every placeable food for the picker, including foods not on in the country
 * yet. Whether an aisle is silent is judged across every food, so a food's
 * place reads the same in every country.
 */
export function foodChoices(
  nodes: TaxonomyNode[],
  aliases: { categoryId: string; alias: string }[],
): FoodChoice[] {
  const shaped = taxonomyShape(nodes);
  const silent = new Map(
    aisleTree(
      nodes.map((node) => ({ ...node, available: 1 })),
      new Map(),
    ).map((aisle) => [aisle.id, aisle.silent] as const),
  );
  const names = new Map<string, string[]>();
  for (const { categoryId, alias } of aliases)
    names.set(categoryId, [...(names.get(categoryId) ?? []), alias]);
  return [...shaped.values()]
    .filter((node) => node.isRankable && !node.outsideDepth)
    .map((food) => {
      const aisle = shaped.get(food.aisleId!)!;
      return {
        id: food.id,
        slug: food.slug,
        name: food.name,
        otherNames: (names.get(food.id) ?? []).filter(
          (alias) => alias !== food.name,
        ),
        aisle: {
          id: aisle.id,
          name: aisle.name,
          silent: silent.get(aisle.id) ?? false,
        },
        inCountry: food.available !== 0,
        seasonal: food.seasonStart != null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
