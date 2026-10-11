import { aisleTree, taxonomyShape, type TaxonomyNode } from "./shape";

/** One food the contribution picker offers, with where it sits. */
export interface FoodChoice {
  id: string;
  slug: string;
  // Its name in the country (a display name where one is set).
  name: string;
  otherNames: string[];
  aisle: { id: string; name: string };
  // A silent shelf only repeats its aisle or food; the picker shows the aisle.
  shelf: { id: string; name: string; silent: boolean };
  // Not on in the country yet: adding a product there switches it on.
  inCountry: boolean;
}

/**
 * Every placeable food for the picker, including foods not on in the country
 * yet. Whether a shelf is silent is judged across every food, so a food's
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
    ).flatMap((aisle) => aisle.shelves.map((s) => [s.id, s.silent] as const)),
  );
  const names = new Map<string, string[]>();
  for (const { categoryId, alias } of aliases)
    names.set(categoryId, [...(names.get(categoryId) ?? []), alias]);
  return [...shaped.values()]
    .filter((node) => node.isRankable && !node.outsideDepth)
    .map((food) => {
      const shelf = shaped.get(food.shelfId!)!;
      const aisle = shaped.get(food.aisleId!)!;
      return {
        id: food.id,
        slug: food.slug,
        name: food.name,
        otherNames: (names.get(food.id) ?? []).filter(
          (alias) => alias !== food.name,
        ),
        aisle: { id: aisle.id, name: aisle.name },
        shelf: {
          id: shelf.id,
          name: shelf.name,
          silent: silent.get(shelf.id) ?? true,
        },
        inCountry: food.available !== 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
