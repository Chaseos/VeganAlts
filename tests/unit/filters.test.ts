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
  ): TaxonomyNode => ({ id, slug: id, name: id, parentId, isRankable });
  const nodes = [
    node("food", null),
    node("meat", "food"),
    node("beef", "meat"),
    node("ground-beef", "beef", 1),
    node("eggs-aisle", "food"),
    node("eggs-shelf", "eggs-aisle"),
    node("eggs", "eggs-shelf", 1),
    // A rankable food directly under an aisle is outside depth three.
    node("bacon", "meat", 1),
    // A group nested too deep.
    node("deep", "beef"),
  ];

  it("derives depth, aisle and shelf from parent links", () => {
    const shaped = taxonomyShape(nodes);
    expect(shaped.get("ground-beef")).toMatchObject({
      depth: 3,
      aisleId: "meat",
      shelfId: "beef",
      outsideDepth: false,
    });
    expect(shaped.get("bacon")).toMatchObject({ depth: 2, outsideDepth: true });
    expect(shaped.get("deep")).toMatchObject({ depth: 3, outsideDepth: true });
    expect(shaped.get("meat")).toMatchObject({ depth: 1, outsideDepth: false });
  });

  it("builds the aisle tree from placeable foods only", () => {
    const tree = aisleTree(
      nodes,
      new Map([["ground-beef", { productCount: 4, rankedCount: 3 }]]),
    );
    expect(tree.map((aisle) => aisle.slug)).toEqual(["eggs-aisle", "meat"]);
    expect(tree[1]!.shelves).toEqual([
      {
        id: "beef",
        slug: "beef",
        name: "beef",
        foods: [
          {
            id: "ground-beef",
            slug: "ground-beef",
            name: "ground-beef",
            productCount: 4,
            rankedCount: 3,
          },
        ],
      },
    ]);
  });

  it("survives a cycle without looping", () => {
    const shaped = taxonomyShape([node("x", "y"), node("y", "x")]);
    expect(shaped.size).toBe(2);
  });
});
