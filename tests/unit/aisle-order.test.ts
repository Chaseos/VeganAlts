import { describe, expect, it } from "vitest";
import {
  aisleTree,
  type TaxonomyNode,
} from "../../server/taxonomy/domain/shape";
import {
  inSeason,
  seasonLabel,
  seasonOf,
} from "../../server/taxonomy/domain/season";
import { withArticle } from "../../app/lib/format";

const node = (
  id: string,
  parentId: string | null,
  extra: Partial<TaxonomyNode> = {},
): TaxonomyNode => ({
  id,
  slug: id,
  name: id,
  parentId,
  isRankable: 0,
  ...extra,
});
const food = (
  id: string,
  parentId: string,
  extra: Partial<TaxonomyNode> = {},
) => node(id, parentId, { isRankable: 1, ...extra });

describe("aisle order", () => {
  const nodes = [
    node("food", null),
    node("beef", "food", { position: 1 }),
    node("chicken", "food", { position: 2 }),
    node("cheese", "food", { position: 12 }),
    // An aisle an operator added without a position goes last.
    node("duck", "food"),
    food("ground-beef", "beef"),
    food("meatballs", "beef"),
    food("nuggets", "chicken"),
    food("cheddar", "cheese"),
    food("mock-duck", "duck"),
  ];

  it("uses the default store order before a country has ratings", () => {
    expect(aisleTree(nodes, new Map()).map((a) => a.slug)).toEqual([
      "beef",
      "chicken",
      "cheese",
      "duck",
    ]);
  });

  it("puts the most-rated aisles and foods first", () => {
    const counts = new Map([
      ["cheddar", { productCount: 2, rankedCount: 2, ratingCount: 40 }],
      ["meatballs", { productCount: 1, rankedCount: 1, ratingCount: 9 }],
      ["ground-beef", { productCount: 3, rankedCount: 3, ratingCount: 5 }],
      ["mock-duck", { productCount: 4, rankedCount: 0, ratingCount: 0 }],
    ]);
    const tree = aisleTree(nodes, counts);
    expect(tree.map((a) => a.slug)).toEqual([
      "cheese",
      "beef",
      // No ratings: more products comes first, then the default position.
      "duck",
      "chicken",
    ]);
    expect(tree[1]!.foods.map((f) => f.slug)).toEqual([
      "meatballs",
      "ground-beef",
    ]);
  });
});

describe("seasons", () => {
  it("labels a season and knows when it wraps past December", () => {
    const eggnog = seasonOf(11, 1)!;
    expect(seasonLabel(eggnog)).toBe("Nov–Jan");
    expect(seasonLabel({ start: 6, end: 6 })).toBe("Jun");
    expect([10, 11, 12, 1, 2].map((m) => inSeason(eggnog, m))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    expect(inSeason({ start: 10, end: 12 }, 12)).toBe(true);
    expect(seasonOf(null, null)).toBeNull();
  });
});

describe("articles", () => {
  it("uses an before a vowel", () => {
    expect(withArticle("eggnog")).toBe("an eggnog");
    expect(withArticle("italian sausage")).toBe("an italian sausage");
    expect(withArticle("cheddar")).toBe("a cheddar");
  });
});
