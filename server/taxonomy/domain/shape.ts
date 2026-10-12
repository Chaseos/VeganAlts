import { silentAisle } from "./display";
import { seasonOf, type Season } from "./season";

// Food → aisle → food (milestone 7). Depth is derived from parent links, never
// stored: the root is depth 0, aisles 1 and rankable foods 2.
export interface TaxonomyNode {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  isRankable: number;
  // 0 for a food that is not switched on in the country being shaped.
  available?: number;
  // An aisle's default order before a country has ratings (milestone 7).
  position?: number | null;
  // A seasonal food's months.
  seasonStart?: number | null;
  seasonEnd?: number | null;
}

export interface ShapedNode extends TaxonomyNode {
  depth: number;
  aisleId: string | null;
  // A category the aisle bar cannot place: a rankable food not at depth
  // two, or a group at depth two or deeper. It stays reachable by URL and
  // search, and the taxonomy workspace flags it.
  outsideDepth: boolean;
}

export function taxonomyShape(nodes: TaxonomyNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const shaped = new Map<string, ShapedNode>();
  const shape = (node: TaxonomyNode, seen = new Set<string>()): ShapedNode => {
    const known = shaped.get(node.id);
    if (known) return known;
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    // A missing or cyclic parent leaves the node at the top.
    const above =
      parent && !seen.has(parent.id)
        ? shape(parent, new Set([...seen, node.id]))
        : null;
    const depth = above ? above.depth + 1 : 0;
    const result: ShapedNode = {
      ...node,
      depth,
      aisleId: depth === 1 ? node.id : depth > 1 ? above!.aisleId : null,
      outsideDepth: node.isRankable ? depth !== 2 : depth >= 2,
    };
    shaped.set(node.id, result);
    return result;
  };
  for (const node of nodes) shape(node);
  return shaped;
}

export interface AisleFood {
  id: string;
  slug: string;
  name: string;
  productCount: number;
  rankedCount: number;
  ratingCount: number;
  season: Season | null;
}

export interface FoodCounts {
  productCount: number;
  rankedCount: number;
  // Counted ratings of the food's ranked swaps in the country.
  ratingCount?: number;
}

/**
 * Popularity order (milestone 7): most counted ratings first, then most
 * products. Aisles then fall back to their default position (an aisle
 * without one goes after those with one) and finally to their name, so a
 * country without ratings reads in the default store order.
 */
export function byPopularity<
  T extends {
    name: string;
    ratingCount: number;
    productCount: number;
    position?: number | null;
  },
>(a: T, b: T) {
  return (
    b.ratingCount - a.ratingCount ||
    b.productCount - a.productCount ||
    (a.position ?? Number.MAX_SAFE_INTEGER) -
      (b.position ?? Number.MAX_SAFE_INTEGER) ||
    a.name.localeCompare(b.name)
  );
}
export interface Aisle {
  id: string;
  slug: string;
  name: string;
  // Breadcrumbs skip an aisle that only repeats its one food (Eggs › Eggs).
  silent: boolean;
  foods: AisleFood[];
}

// One food with its counts in the country.
export function aisleFood(
  food: TaxonomyNode,
  counts: Map<string, FoodCounts>,
): AisleFood {
  const own = counts.get(food.id);
  return {
    id: food.id,
    slug: food.slug,
    name: food.name,
    productCount: own?.productCount ?? 0,
    rankedCount: own?.rankedCount ?? 0,
    ratingCount: own?.ratingCount ?? 0,
    season: seasonOf(food.seasonStart, food.seasonEnd),
  };
}

// The navigable tree: aisles with their foods, both in popularity order.
// Foods not on in the country are left out, and so are aisles without a
// placeable food.
export function aisleTree(
  nodes: TaxonomyNode[],
  counts: Map<string, FoodCounts>,
): Aisle[] {
  const shaped = taxonomyShape(nodes);
  return [...shaped.values()]
    .filter((node) => node.depth === 1 && !node.isRankable)
    .map((aisle) => {
      const foods = [...shaped.values()]
        .filter(
          (food) =>
            food.parentId === aisle.id &&
            food.isRankable &&
            !food.outsideDepth &&
            food.available !== 0,
        )
        .map((food) => aisleFood(food, counts))
        .sort(byPopularity);
      return {
        id: aisle.id,
        slug: aisle.slug,
        name: aisle.name,
        position: aisle.position ?? null,
        silent: silentAisle(aisle, foods),
        foods,
        ratingCount: foods.reduce((n, f) => n + f.ratingCount, 0),
        productCount: foods.reduce((n, f) => n + f.productCount, 0),
      };
    })
    .filter((aisle) => aisle.foods.length > 0)
    .sort(byPopularity)
    .map(({ id, slug, name, silent, foods }) => ({
      id,
      slug,
      name,
      silent,
      foods,
    }));
}
