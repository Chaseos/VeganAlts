import { describe, expect, it } from "vitest";
import {
  applyFilters,
  filtersAreNormalized,
  intersectFilters,
  MAX_STORES,
  readFilters,
} from "../../server/catalog/domain/filters";
import {
  aisleTree,
  taxonomyShape,
  type TaxonomyNode,
} from "../../server/taxonomy/domain/shape";
import {
  foodPath,
  homePath,
  parseCountryCode,
  productPath,
} from "../../server/catalog/domain/markets";

const params = (query: string) => new URLSearchParams(query);

describe("ranking filter parameters", () => {
  it("lowercases, de-duplicates, sorts and syntax-checks values", () => {
    expect(
      readFilters(
        params("stores=Target,kroger&stores=target&freeFrom=SOY,milk,bad-key!"),
      ),
    ).toEqual({ stores: ["kroger", "target"], freeFrom: ["milk", "soy"] });
    expect(readFilters(params("stores=-bad,ok-store,a%20b"))).toEqual({
      stores: ["ok-store"],
      freeFrom: [],
    });
    const many = Array.from(
      { length: 15 },
      (_, i) => `store-${String(i).padStart(2, "0")}`,
    );
    expect(readFilters(params(`stores=${many.join(",")}`)).stores).toHaveLength(
      MAX_STORES,
    );
  });

  it("recognizes only the single, sorted, comma-joined form as normalized", () => {
    expect(filtersAreNormalized(params(""))).toBe(true);
    expect(filtersAreNormalized(params("stores=kroger,target&view=new"))).toBe(
      true,
    );
    expect(filtersAreNormalized(params("stores=target,kroger"))).toBe(false);
    expect(filtersAreNormalized(params("stores=kroger&stores=target"))).toBe(
      false,
    );
    expect(filtersAreNormalized(params("stores=Kroger"))).toBe(false);
    expect(filtersAreNormalized(params("stores="))).toBe(false);
    // Writing the normalized filters is a fixed point.
    const written = applyFilters(
      params("stores=Target&stores=kroger&view=new"),
      readFilters(params("stores=Target&stores=kroger")),
    );
    expect(filtersAreNormalized(written)).toBe(true);
    expect(written.toString()).toBe("stores=kroger%2Ctarget&view=new");
  });

  it("keeps only values the country offers", () => {
    expect(
      intersectFilters(
        { stores: ["kroger", "gone"], freeFrom: ["soy", "lupin"] },
        { stores: ["kroger", "target"], freeFrom: ["soy"] },
      ),
    ).toEqual({ stores: ["kroger"], freeFrom: ["soy"] });
  });
});

describe("country paths", () => {
  it("keeps the United States home at / and every other country under its code", () => {
    expect(homePath("us")).toBe("/");
    expect(homePath("ca")).toBe("/ca");
    expect(foodPath("gb", "ground-beef")).toBe("/gb/ground-beef");
    expect(productPath("au", "oat-milk")).toBe("/au/products/oat-milk");
    expect(parseCountryCode(undefined)).toBe("us");
    expect(parseCountryCode("NZ")).toBe("nz");
    expect(() => parseCountryCode("usa")).toThrow();
  });
});

describe("taxonomy shape", () => {
  const node = (
    id: string,
    parentId: string | null,
    isRankable = 0,
    name = id,
  ): TaxonomyNode => ({ id, slug: id, name, parentId, isRankable });
  const nodes = [
    node("food", null),
    node("beef", "food"),
    node("ground-beef", "beef", 1),
    node("meatballs", "beef", 1),
    node("eggs-aisle", "food", 0, "Eggs"),
    node("eggs", "eggs-aisle", 1, "Eggs"),
    // A rankable food directly under Food, or below a nested group, is
    // outside depth two.
    node("bacon", "food", 1),
    node("old-shelf", "beef"),
    node("deep", "old-shelf", 1),
  ];

  it("derives depth and aisle from parent links", () => {
    const shaped = taxonomyShape(nodes);
    expect(shaped.get("ground-beef")).toMatchObject({
      depth: 2,
      aisleId: "beef",
      outsideDepth: false,
    });
    expect(shaped.get("bacon")).toMatchObject({ depth: 1, outsideDepth: true });
    expect(shaped.get("old-shelf")).toMatchObject({
      depth: 2,
      outsideDepth: true,
    });
    expect(shaped.get("deep")).toMatchObject({
      depth: 3,
      aisleId: "beef",
      outsideDepth: true,
    });
    expect(shaped.get("beef")).toMatchObject({ depth: 1, outsideDepth: false });
  });

  it("builds the aisle tree from placeable foods only", () => {
    const tree = aisleTree(
      nodes,
      new Map([["ground-beef", { productCount: 4, rankedCount: 3 }]]),
    );
    expect(tree.map((aisle) => aisle.slug)).toEqual(["beef", "eggs-aisle"]);
    expect(tree[0]).toEqual({
      id: "beef",
      slug: "beef",
      name: "beef",
      silent: false,
      foods: [
        {
          id: "ground-beef",
          slug: "ground-beef",
          name: "ground-beef",
          productCount: 4,
          rankedCount: 3,
        },
        {
          id: "meatballs",
          slug: "meatballs",
          name: "meatballs",
          productCount: 0,
          rankedCount: 0,
        },
      ],
    });
    // An aisle that only repeats its one food is silent in breadcrumbs.
    expect(tree[1]).toMatchObject({ slug: "eggs-aisle", silent: true });
  });

  it("survives a cycle without looping", () => {
    const shaped = taxonomyShape([node("x", "y"), node("y", "x")]);
    expect(shaped.size).toBe(2);
  });
});
