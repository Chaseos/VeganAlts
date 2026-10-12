import { silentAisle } from "./display";

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
}
export interface Aisle {
  id: string;
  slug: string;
  name: string;
  // Breadcrumbs skip an aisle that only repeats its one food (Eggs › Eggs).
  silent: boolean;
  foods: AisleFood[];
}

// The navigable tree: aisles with their foods, in name order. Foods not on in
// the country are left out, and so are aisles without a placeable food.
export function aisleTree(
  nodes: TaxonomyNode[],
  counts: Map<string, { productCount: number; rankedCount: number }>,
): Aisle[] {
  const shaped = taxonomyShape(nodes);
  const byName = <T extends { name: string }>(a: T, b: T) =>
    a.name.localeCompare(b.name);
  return [...shaped.values()]
    .filter((node) => node.depth === 1 && !node.isRankable)
    .sort(byName)
    .map((aisle) => {
      const foods = [...shaped.values()]
        .filter(
          (food) =>
            food.parentId === aisle.id &&
            food.isRankable &&
            !food.outsideDepth &&
            food.available !== 0,
        )
        .sort(byName)
        .map((food) => ({
          id: food.id,
          slug: food.slug,
          name: food.name,
          productCount: counts.get(food.id)?.productCount ?? 0,
          rankedCount: counts.get(food.id)?.rankedCount ?? 0,
        }));
      return {
        id: aisle.id,
        slug: aisle.slug,
        name: aisle.name,
        silent: silentAisle(aisle, foods),
        foods,
      };
    })
    .filter((aisle) => aisle.foods.length > 0);
}
