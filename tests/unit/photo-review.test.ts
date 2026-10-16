import { describe, expect, it } from "vitest";
import {
  brandKey,
  brandsMayMatch,
  Clusters,
  productKey,
  tokenOverlap,
} from "../../scripts/photo-review/identity";
import {
  percentile,
  photoScores,
  pickScore,
} from "../../scripts/photo-review/sharpness";
import {
  binsByBrand,
  binsInOrder,
  checkLines,
} from "../../scripts/photo-review/lines";
import { folderName } from "../../scripts/photo-review/move-log";
import { checkResult, lineDecision } from "../../scripts/photo-review/schema";
import {
  captureTime,
  cutRanges,
  photoNumbers,
  timeline,
} from "../../scripts/photo-review/timeline";
import { exifCaptureTime } from "../../scripts/photo-review/capture-times";

/** A little-endian EXIF block with DateTimeOriginal and its sub-seconds and offset. */
function exifBlock(stamp: string, offset?: string, subSeconds?: string) {
  const ascii = [
    [0x9003, `${stamp}\0`],
    ...(subSeconds ? [[0x9291, `${subSeconds}\0`] as const] : []),
    ...(offset ? [[0x9011, `${offset}\0`] as const] : []),
  ] as const;
  const ifd0 = 8;
  const exifIfd = ifd0 + 2 + 12 + 4;
  let data = exifIfd + 2 + ascii.length * 12 + 4;
  const buffer = Buffer.alloc(data + 64);
  buffer.write("II", 0, "latin1");
  buffer.writeUInt16LE(42, 2);
  buffer.writeUInt32LE(ifd0, 4);
  buffer.writeUInt16LE(1, ifd0);
  buffer.writeUInt16LE(0x8769, ifd0 + 2);
  buffer.writeUInt16LE(4, ifd0 + 4);
  buffer.writeUInt32LE(1, ifd0 + 6);
  buffer.writeUInt32LE(exifIfd, ifd0 + 10);
  buffer.writeUInt16LE(ascii.length, exifIfd);
  ascii.forEach(([tag, value], index) => {
    const at = exifIfd + 2 + index * 12;
    buffer.writeUInt16LE(tag, at);
    buffer.writeUInt16LE(2, at + 2);
    buffer.writeUInt32LE(value.length, at + 4);
    if (value.length <= 4) buffer.write(value, at + 8, "latin1");
    else {
      buffer.writeUInt32LE(data, at + 8);
      buffer.write(value, data, "latin1");
      data += value.length;
    }
  });
  return Buffer.concat([Buffer.from("Exif\0\0", "latin1"), buffer]);
}

describe("timeline", () => {
  it("reads Pixel capture times and leaves other names undated", () => {
    expect(captureTime("PXL_20261011_181217317.jpg")?.toISOString()).toBe(
      "2026-10-11T18:12:17.317Z",
    );
    expect(captureTime("IMG_1234.webp")).toBeNull();
  });

  it("starts a new visit after an eight-minute pause", () => {
    const entries = timeline([
      "PXL_20261011_180000000.webp",
      "PXL_20261011_180005000.webp",
      "PXL_20261011_180804000.webp",
      "PXL_20261011_181700000.webp",
    ]);
    expect(entries.map((entry) => entry.visit)).toEqual([1, 1, 1, 2]);
    expect(entries.map((entry) => entry.gap)).toEqual([null, 5, 479, 536]);
  });

  it("reads an iPhone's capture time from EXIF, in UTC when the offset is known", () => {
    expect(
      exifCaptureTime(
        exifBlock("2026:10:14 09:41:41", "-05:00", "123"),
      )?.toISOString(),
    ).toBe("2026-10-14T14:41:41.123Z");
    expect(exifCaptureTime(Buffer.from("not exif"))).toBeNull();
  });

  it("uses saved capture times for names without one", () => {
    const entries = timeline(
      ["IMG_1133.webp", "IMG_1134.webp", "IMG_1135.webp"],
      new Map([
        ["IMG_1133.webp", new Date("2026-10-14T14:41:41Z")],
        ["IMG_1134.webp", new Date("2026-10-14T14:41:50Z")],
        ["IMG_1135.webp", new Date("2026-10-14T15:30:00Z")],
      ]),
    );
    expect(entries.map((entry) => entry.visit)).toEqual([1, 1, 2]);
    expect(entries[1]!.gap).toBe(9);
  });

  it("parses photo number lists", () => {
    expect([...photoNumbers("3-5,9")]).toEqual([3, 4, 5, 9]);
    expect(() => photoNumbers("5-3")).toThrow();
  });

  it("cuts ranges at the longest nearby pause and never across a numbering break", () => {
    const photos = Array.from({ length: 100 }, (_, index) => ({
      n: index + 1,
      gap: index === 47 ? 90 : 4,
    }));
    const ranges = cutRanges(photos, 50, 10);
    expect(ranges.map((range) => range[0]!.n)).toEqual([1, 48]);
    const split = cutRanges(
      [1, 2, 3, 10, 11].map((n) => ({ n, gap: 1 })),
      100,
    );
    expect(split.map((range) => range.map((photo) => photo.n))).toEqual([
      [1, 2, 3],
      [10, 11],
    ]);
  });
});

describe("sharpness", () => {
  const image = (pixel: (x: number, y: number) => number) => {
    const width = 40;
    const height = 60;
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) data[y * width + x] = pixel(x, y);
    return { data, width, height };
  };

  it("scores crisp detail above soft detail above a blank surface", () => {
    const crisp = photoScores(image((x, y) => ((x + y) % 2 ? 255 : 0)));
    const soft = photoScores(image((x) => 128 + 100 * Math.sin(x / 4)));
    const blank = photoScores(image(() => 128));
    expect(crisp.sharpness).toBeGreaterThan(soft.sharpness);
    expect(soft.sharpness).toBeGreaterThan(blank.sharpness);
    expect(blank.sharpness).toBe(0);
  });

  it("measures glare and lets it cost score", () => {
    expect(photoScores(image(() => 255)).glare).toBe(1);
    expect(pickScore({ sharpness: 50, glare: 0.2 })).toBeLessThan(
      pickScore({ sharpness: 40, glare: 0 }),
    );
  });

  it("interpolates percentiles", () => {
    expect(percentile([1, 2, 3, 4, 5], 90)).toBeCloseTo(4.6);
    expect(percentile([], 90)).toBe(0);
  });
});

describe("identity", () => {
  it("treats trademark signs and punctuation as the same brand", () => {
    expect(brandKey("Hellmann's™")).toBe(brandKey("Hellmanns"));
  });

  it("ignores package sizes but keeps flavors apart", () => {
    expect(productKey("Kite Hill", "Greek Style Vanilla 16 oz")).toBe(
      productKey("Kite Hill", "Greek Style Vanilla"),
    );
    expect(productKey("Daiya", "Mac & Cheese", "Taco")).not.toBe(
      productKey("Daiya", "Mac & Cheese", "Cheddar"),
    );
  });

  it("finds brand spellings that may be one brand, but not unrelated brands", () => {
    expect(brandsMayMatch("Daiya", "Daiya Foods")).toBe(true);
    expect(brandsMayMatch("Beyond", "Beyond Meat")).toBe(true);
    expect(brandsMayMatch("Primal Kitchen", "Primal Kitchn")).toBe(true);
    expect(brandsMayMatch("Hu", "Hungry Planet")).toBe(false);
    expect(brandsMayMatch("Daiya", "Samyang")).toBe(false);
    expect(brandsMayMatch("Edward & Sons", "So Delicious")).toBe(false);
  });

  it("measures shared name words regardless of order or size", () => {
    expect(
      tokenOverlap(
        "Organic Chili, Black Bean",
        "Organic Black Bean Chili 14.7oz",
      ),
    ).toBe(1);
    expect(tokenOverlap("Taco Mac & Cheese", "Cheddar Mac & Cheese")).toBe(0.5);
  });

  it("joins clusters transitively", () => {
    const clusters = new Clusters();
    clusters.union("a", "b");
    clusters.union("b", "c");
    clusters.add("d");
    expect(clusters.members().map((group) => group.sort())).toEqual([
      ["a", "b", "c"],
      ["d"],
    ]);
  });
});

describe("recipe lines", () => {
  const product = (
    brand: string,
    name: string,
    label: "vegan" | "plant_based" | "appears_plant_based" = "vegan",
  ) => ({ brand, name, label });
  const brandOf = new Map([
    ["a", product("Sour Patch Kids", "Sour Patch Kids", "appears_plant_based")],
    [
      "b",
      product(
        "Sour Patch Kids",
        "Sour Patch Kids Watermelon",
        "appears_plant_based",
      ),
    ],
    ["c", product("Silk", "Almondmilk Unsweet")],
    ["d", product("Silk", "Chocolate Almondmilk")],
  ]);
  const risk = {
    level: "high" as const,
    reason: "Gummies usually contain gelatin.",
  };

  it("accepts every product placed once in a one-brand line", () => {
    expect(
      checkLines(
        [
          {
            lineName: "Sour Patch Kids",
            food: "gummy-candy",
            products: [
              { id: "a", risk },
              { id: "b", flavor: "Watermelon", risk },
            ],
          },
          {
            lineName: "Almondmilk",
            food: "milk",
            products: [{ id: "c", flavor: "Unsweetened" }],
          },
          {
            lineName: "Chocolate Almondmilk",
            food: "chocolate-milk",
            products: [{ id: "d" }],
          },
        ],
        ["a", "b", "c", "d"],
        brandOf,
      ),
    ).toEqual([]);
  });

  it("reports missing, repeated and mixed-brand placements", () => {
    const problems = checkLines(
      [
        {
          lineName: "Mixed",
          food: "milk",
          products: [
            { id: "a", risk },
            { id: "c", flavor: "Vanilla" },
            { id: "d", flavor: "Chocolate" },
          ],
        },
        {
          lineName: "Again",
          food: "gummy-candy",
          products: [{ id: "a", flavor: "Blue", risk }],
        },
      ],
      ["a", "b", "c", "d"],
      brandOf,
    );
    expect(problems.join("\n")).toMatch(/mixes brands/);
    expect(problems.join("\n")).toMatch(/a is in both/);
    expect(problems.join("\n")).toMatch(/missing: b/);
    expect(problems.join("\n")).toMatch(/d looks like chocolate-milk/);
  });

  it("refuses two lines of one brand whose names read the same", () => {
    const problems = checkLines(
      [
        { lineName: "Almond Milk", food: "milk", products: [{ id: "c" }] },
        {
          lineName: "Almondmilk",
          food: "milk",
          products: [{ id: "d", flavor: "Chocolate" }],
        },
      ],
      ["c", "d"],
      brandOf,
    ).join("\n");
    expect(problems).toMatch(/read as the same Silk line/);
  });

  it("gives a risk level only to products that say neither vegan nor plant-based", () => {
    const problems = checkLines(
      [
        {
          lineName: "Sour Patch Kids",
          food: "gummy-candy",
          products: [{ id: "a" }, { id: "b", flavor: "Watermelon", risk }],
        },
        { lineName: "Almondmilk", food: "milk", products: [{ id: "c", risk }] },
      ],
      ["a", "b", "c"],
      brandOf,
    ).join("\n");
    expect(problems).toMatch(/a says neither vegan nor plant-based/);
    expect(problems).toMatch(/c's package says vegan/);
    expect(problems).not.toMatch(/\bb\b.*risk/);
  });

  it("gives a suggested new food the same rules as a site food", () => {
    const suggested = {
      lineName: "Sour Patch Kids",
      newFood: {
        name: "Sour Candy",
        aisle: "candy",
        reason: "No food for sour candy yet.",
      },
      products: [{ id: "a" }, { id: "b", flavor: "Watermelon", risk }],
    };
    expect(lineDecision.safeParse(suggested).success).toBe(true);
    // A suggested new food is in scope, so it needs risk levels too.
    expect(checkLines([suggested], ["a", "b"], brandOf).join("\n")).toMatch(
      /a says neither vegan nor plant-based/,
    );
    expect(
      lineDecision.safeParse({
        ...suggested,
        newFood: { name: "Pasta Dishes", newAisle: "Meals", reason: "x" },
      }).success,
    ).toBe(true);
    for (const newFood of [
      { name: "Sour Candy", reason: "No aisle given." },
      { name: "Sour Candy", aisle: "not-an-aisle", reason: "x" },
      { name: "Sour Candy", aisle: "candy", newAisle: "Sweets", reason: "x" },
    ])
      expect(lineDecision.safeParse({ ...suggested, newFood }).success).toBe(
        false,
      );
    expect(
      lineDecision.safeParse({ ...suggested, food: "gummy-candy" }).success,
    ).toBe(false);
  });

  it("counts a flavor named Original or Plain as the line's original", () => {
    const line = {
      lineName: "Almondmilk",
      food: "milk",
      products: [{ id: "a" }, { id: "b", flavor: "Original" }],
    };
    expect(lineDecision.safeParse(line).success).toBe(false);
    expect(
      lineDecision.safeParse({
        ...line,
        products: [{ id: "a" }, { id: "b", flavor: "Unsweetened Original" }],
      }).success,
    ).toBe(true);
  });

  it("lists animal ingredients exactly when a check found them", () => {
    const base = { id: "a", photosUsed: ["a.webp"] };
    expect(
      checkResult.safeParse({
        ...base,
        result: "animal_ingredients",
        animalIngredients: ["whey"],
      }).success,
    ).toBe(true);
    expect(
      checkResult.safeParse({
        ...base,
        result: "none_found",
        animalIngredients: ["whey"],
      }).success,
    ).toBe(false);
    expect(
      checkResult.safeParse({
        ...base,
        result: "animal_ingredients",
        animalIngredients: [],
      }).success,
    ).toBe(false);
  });

  it("needs a food or an out-of-scope reason, one original and distinct flavors", () => {
    const ok = {
      lineName: "Organic Chili",
      outOfScope: { suggestedFood: "Chili", reason: "No chili food." },
      products: [{ id: "a" }],
    };
    expect(lineDecision.safeParse(ok).success).toBe(true);
    expect(lineDecision.safeParse({ ...ok, food: "milk" }).success).toBe(false);
    expect(
      lineDecision.safeParse({
        lineName: "Milk",
        food: "not-a-food",
        products: [{ id: "a" }],
      }).success,
    ).toBe(false);
    expect(
      lineDecision.safeParse({
        lineName: "Milk",
        food: "milk",
        products: [{ id: "a" }, { id: "b" }],
      }).success,
    ).toBe(false);
    expect(
      lineDecision.safeParse({
        lineName: "Milk",
        food: "milk",
        products: [
          { id: "a", flavor: "Vanilla" },
          { id: "b", flavor: "vanilla" },
        ],
      }).success,
    ).toBe(false);
  });

  it("bins whole brands together and keeps capture order elsewhere", () => {
    const products = [
      { id: "p3", brand: "Silk" },
      { id: "p1", brand: "Daiya" },
      { id: "p2", brand: "Silk" },
      { id: "p4", brand: "Zen" },
    ];
    expect(binsByBrand(products, 2, "lines")).toEqual({
      "lines-01": ["p1"],
      "lines-02": ["p2", "p3"],
      "lines-03": ["p4"],
    });
    expect(binsInOrder(["p3", "p1", "p2"], 2, "read")).toEqual({
      "read-01": ["p1", "p2"],
      "read-02": ["p3"],
    });
  });

  it("makes safe folder names for suggested foods", () => {
    expect(folderName("Instant noodles")).toBe("Instant noodles");
    expect(folderName("Mac & cheese / pasta")).toBe("Mac & cheese pasta");
    expect(folderName("  ")).toBe("Other");
  });
});
