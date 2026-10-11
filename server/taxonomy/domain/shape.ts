import { silentShelf } from "./display";

// Food → aisle → shelf → food. Depth is derived from parent links, never
// stored: the root is depth 0, aisles 1, shelves 2 and rankable foods 3.
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
  shelfId: string | null;
  // A category the aisle bar cannot place: a rankable food not at depth
  // three, or a group at depth three or deeper. It stays reachable by URL and
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
      shelfId: depth === 2 ? node.id : depth > 2 ? above!.shelfId : null,
      outsideDepth: node.isRankable ? depth !== 3 : depth >= 3,
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
export interface AisleShelf {
  id: string;
  slug: string;
  name: string;
  // Navigation skips a shelf that only repeats its aisle or food.
  silent: boolean;
  foods: AisleFood[];
}
export interface Aisle {
  id: string;
  slug: string;
  name: string;
  shelves: AisleShelf[];
}

// The navigable tree: aisles with their shelves and foods, in name order.
// Foods not on in the country are left out, and so are aisles and shelves
// without a placeable food.
export function aisleTree(
  nodes: TaxonomyNode[],
  counts: Map<string, { productCount: number; rankedCount: number }>,
): Aisle[] {
  const shaped = taxonomyShape(nodes);
  const byName = <T extends { name: string }>(a: T, b: T) =>
    a.name.localeCompare(b.name);
  const children = (parentId: string) =>
    [...shaped.values()]
      .filter((node) => node.parentId === parentId)
      .sort(byName);
  return [...shaped.values()]
    .filter((node) => node.depth === 1 && !node.isRankable)
    .sort(byName)
    .map((aisle) => {
      const shelves = children(aisle.id)
        .filter((shelf) => !shelf.isRankable)
        .map((shelf) => ({
          id: shelf.id,
          slug: shelf.slug,
          name: shelf.name,
          foods: children(shelf.id)
            .filter(
              (food) =>
                food.isRankable && !food.outsideDepth && food.available !== 0,
            )
            .map((food) => ({
              id: food.id,
              slug: food.slug,
              name: food.name,
              productCount: counts.get(food.id)?.productCount ?? 0,
              rankedCount: counts.get(food.id)?.rankedCount ?? 0,
            })),
        }))
        .filter((shelf) => shelf.foods.length > 0);
      return {
        id: aisle.id,
        slug: aisle.slug,
        name: aisle.name,
        shelves: shelves.map((shelf) => ({
          ...shelf,
          silent: silentShelf(aisle, shelf, shelf.foods, shelves.length),
        })),
      };
    })
    .filter((aisle) => aisle.shelves.length > 0);
}
