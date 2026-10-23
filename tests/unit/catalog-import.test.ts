import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildManifest } from "../../scripts/catalog-import/manifest";
import { openBatch } from "../../scripts/photo-review/batch";
import { merge } from "../../scripts/photo-review/merge";
import { render } from "../../scripts/photo-review/render";
import { loadRun } from "../../scripts/photo-review/view";
import { mergePlan } from "../../scripts/photo-review/schema";
import {
  importClassification,
  importEvidenceNote,
  importFactsHash,
  importIds,
  importImageId,
  importLineId,
  importPhotoKey,
  importSubmission,
  type ImportFacts,
} from "../../server/community/domain/catalog-import";

// The store-photo import's manifest (docs/IMPORTER_PLAN.md), built from
// small photo-batch run folders in a temporary directory.

type Slot = "front" | "ingredients" | "nutrition" | "back";
interface Product {
  id: string;
  brand: string;
  lineName: string;
  lineId?: string;
  flavor?: string;
  name: string;
  food: string;
  label: "vegan" | "plant_based" | "appears_plant_based";
  labelEvidence?: string;
  visits?: number[];
  slots?: Slot[];
  risk?: "low" | "medium" | "high";
  duplicateOf?: string;
  sizes?: string[];
}
interface Batch {
  name: string;
  products: Product[];
  stores: Record<string, string>;
  corrections?: Record<string, Record<string, unknown>>;
  // Photos written with EXIF metadata.
  exif?: string[];
  // Photos moved to the set-aside folder.
  moved?: string[];
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "veganalts-import-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const image = (width: number, height: number, exif: boolean) => {
  const picture = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  });
  return (exif ? picture.withExif({ IFD0: { Copyright: "Owner" } }) : picture)
    .webp()
    .toBuffer();
};
const photoName = (product: Product, slot: Slot) =>
  `${product.id}-${slot}.webp`;

async function writeBatch(batch: Batch) {
  const web = join(root, batch.name);
  const run = join(web, "review");
  const json = async (path: string, value: unknown) => {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, JSON.stringify(value, null, 2));
  };
  const names: string[] = [];
  const moves: string[] = [];
  for (const product of batch.products)
    for (const slot of product.slots ?? ["front", "ingredients"]) {
      const name = photoName(product, slot);
      names.push(name);
      const exif = batch.exif?.includes(name) ?? false;
      const base = batch.moved?.includes(name)
        ? join(web, "set-aside", "duplicate")
        : web;
      await mkdir(join(base, "full"), { recursive: true });
      await mkdir(join(base, "thumbnail"), { recursive: true });
      await writeFile(join(base, "full", name), await image(60, 80, exif));
      await writeFile(join(base, "thumbnail", name), await image(15, 20, exif));
      if (base !== web)
        moves.push(
          JSON.stringify({
            photo: name,
            reason: "duplicate",
            from: join(web, "thumbnail", name),
            to: join(base, "thumbnail", name),
          }),
        );
    }
  if (moves.length)
    await writeFile(
      join(web, "set-aside", "moves.jsonl"),
      moves.join("\n") + "\n",
    );
  await json(join(run, "photos.json"), {
    photos: names.map((name, index) => ({
      n: index + 1,
      name,
      time: null,
      gap: null,
      visit: 1,
      sharpness: 10,
      glare: 0,
      width: 60,
      height: 80,
    })),
  });
  for (const product of batch.products)
    await json(join(run, "products", `${product.id}.json`), {
      id: product.id,
      country: "US",
      brand: product.brand,
      lineName: product.lineName,
      ...(product.flavor ? { flavor: product.flavor } : {}),
      name: product.name,
      sizes: product.sizes ?? ["16 oz"],
      visits: product.visits ?? [1],
      label: product.label,
      ...(product.label === "appears_plant_based"
        ? {}
        : { labelEvidence: product.labelEvidence ?? "VEGAN on the front" }),
      photos: Object.fromEntries(
        (product.slots ?? ["front", "ingredients"]).map((slot) => [
          slot,
          photoName(product, slot),
        ]),
      ),
      alternates: {
        front: [],
        ingredients: [],
        nutrition: [],
        back: [],
        other: [],
      },
      other: [],
      cluster: [product.id],
      confidence: "high",
      notes: ["Seen on the bottom shelf."],
    });
  const lines = new Map<string, Product[]>();
  for (const product of batch.products) {
    const key =
      product.lineId ?? `${product.brand}|${product.lineName}|${product.food}`;
    lines.set(key, [...(lines.get(key) ?? []), product]);
  }
  await json(join(run, "lines.json"), {
    lines: [...lines.values()].map((members, index) => ({
      id: members[0]!.lineId ?? `line-${String(index + 1).padStart(3, "0")}`,
      brand: members[0]!.brand,
      lineName: members[0]!.lineName,
      food: members[0]!.food,
      products: members.map((product) => ({
        id: product.id,
        ...(product.flavor ? { flavor: product.flavor } : {}),
        ...(product.duplicateOf ? { duplicateOf: product.duplicateOf } : {}),
        ...(product.label === "appears_plant_based"
          ? {
              risk: {
                level: product.risk ?? "low",
                reason: "Usually made without animal products.",
              },
            }
          : {}),
      })),
    })),
  });
  await json(join(run, "stores.json"), { visits: batch.stores });
  for (const [id, fix] of Object.entries(batch.corrections ?? {}))
    await json(join(run, "corrections", `${id}.json`), { id, ...fix });
  return web;
}
const renderBatch = (web: string) => render(openBatch(web));

const oatMilk = (overrides: Partial<Product> = {}): Product => ({
  id: "A1",
  brand: "Oatside",
  lineName: "Oat Milk",
  name: "Oat Milk Original",
  food: "milk",
  label: "vegan",
  ...overrides,
});

describe("manifest", () => {
  it.each(["Oatside", "Oat-Side"])(
    "keeps distinct reviewed lines separate when their normalized names match (%s)",
    async (brand) => {
      const first = await writeBatch({
        name: "Photos 1 - Web",
        stores: { "1": "Sprouts" },
        products: [
          oatMilk({ lineId: "line-001" }),
          oatMilk({
            id: "A2",
            lineId: "line-001",
            flavor: "Vanilla",
            name: "Oat Milk Vanilla",
          }),
          oatMilk({
            id: "A3",
            lineId: "line-002",
            brand,
            name: "Barista Oat Milk",
          }),
        ],
      });
      const second = await writeBatch({
        name: "Photos 2 - Web",
        stores: { "1": "Sprouts" },
        products: [
          oatMilk({
            id: "B1",
            flavor: "Chocolate",
            name: "Oat Milk Chocolate",
          }),
        ],
      });
      await renderBatch(first);
      await renderBatch(second);
      const review = await readFile(
        join(first, "review", "review.html"),
        "utf8",
      );
      expect(review.match(/<section class="line"/g)).toHaveLength(2);
      expect(review).not.toContain("two products are this line's original");

      const built = await buildManifest([first, second]);
      expect(built.blocking).toEqual([]);
      const [a1, a2, a3, b1] = built.manifest.products.map(
        ({ facts }) => facts,
      );
      expect(a1!.line).toEqual(a2!.line);
      expect(a1!.line.first).toBe("Photos 1 - Web/A1");
      expect(a3!.line.first).toBe("Photos 1 - Web/A3");
      expect(b1!.line.first).toBe("Photos 2 - Web/B1");
      expect(new Set([a1!.line.key, a3!.line.key, b1!.line.key]).size).toBe(3);
      expect(built.counts.lines).toBe(3);
      expect(built.warnings).toContainEqual(
        expect.stringContaining("distinct reviewed lines"),
      );
      expect((await buildManifest([first, second])).manifest.hash).toBe(
        built.manifest.hash,
      );
    },
  );

  it("keeps an owner-corrected product in the unique matching reviewed line", async () => {
    const web = await writeBatch({
      name: "Photos - Web",
      stores: { "1": "Sprouts" },
      products: [
        oatMilk({ lineId: "line-001" }),
        oatMilk({
          id: "A2",
          lineId: "line-002",
          lineName: "Barista Oat Milk",
          name: "Barista Oat Milk",
        }),
      ],
      corrections: { A1: { lineName: "Barista Oat Milk", flavor: "Vanilla" } },
    });
    await renderBatch(web);
    const review = await readFile(join(web, "review", "review.html"), "utf8");
    expect(review.match(/<section class="line"/g)).toHaveLength(1);
    const built = await buildManifest([web]);
    expect(built.blocking).toEqual([]);
    expect(built.counts.lines).toBe(1);
    const [a1, a2] = built.manifest.products.map(({ facts }) => facts);
    expect(a1!.line).toEqual(a2!.line);
    expect(a1!.line.first).toBe("Photos - Web/A2");
  });

  it("joins lines across batches, applies the review's corrections, duplicates, repeats and carried stores, and keeps review data internal", async () => {
    const first = await writeBatch({
      name: "Photos 1 - Web",
      stores: { "1": "Sprouts", "2": "Target" },
      products: [
        oatMilk(),
        oatMilk({
          id: "A2",
          flavor: "Vanilla",
          name: "Oat Milk Vanilla",
          label: "plant_based",
        }),
        // A late duplicate: its store goes to A2.
        oatMilk({
          id: "A5",
          flavor: "Vanilla",
          name: "Oat Milk Vanilla",
          visits: [2],
          duplicateOf: "A2",
        }),
        {
          id: "A3",
          brand: "Cheeseless",
          lineName: "Shreds",
          name: "Cheddar Shreds",
          food: "cheddar",
          label: "appears_plant_based",
          slots: ["front", "ingredients", "back"],
        },
        {
          id: "A4",
          brand: "Noodle Co",
          lineName: "Ramen",
          name: "Ramen",
          food: "milk",
          label: "vegan",
        },
        {
          id: "A6",
          brand: "Skipped",
          lineName: "Skip",
          name: "Skipped Milk",
          food: "milk",
          label: "vegan",
        },
      ],
      corrections: {
        A4: { outOfScope: "Instant noodles" },
        A6: { skip: true },
      },
      moved: ["A3-back.webp"],
    });
    const second = await writeBatch({
      name: "Photos 2 - Web",
      stores: { "1": "Publix" },
      products: [
        oatMilk({
          id: "B1",
          brand: "Oat-Side",
          lineName: "Oat-Milk",
          flavor: "Chocolate",
          name: "Oat Milk Chocolate",
        }),
        oatMilk({ id: "B2", brand: "Oat-Side", lineName: "Oat-Milk" }),
      ],
    });
    // B2 is A1 again: a decided repeat whose store was carried to A1.
    const run2 = join(second, "review");
    await writeFile(
      join(run2, "repeats.json"),
      JSON.stringify({
        earlier: { web: first, run: join(first, "review") },
        pairs: [
          {
            id: "pair-01",
            product: "B2",
            earlier: "A1",
            earlierBrand: "Oatside",
            earlierName: "Oat Milk Original",
            reason: "Same name and brand.",
            sheet: join(run2, "pairs", "pair-01.jpg"),
          },
        ],
        bins: { "repeats-01": ["pair-01"] },
      }),
    );
    await mkdir(join(run2, "repeat"), { recursive: true });
    await writeFile(
      join(run2, "repeat", "repeats-01.json"),
      JSON.stringify({
        bin: "repeats-01",
        decisions: [
          { pair: "pair-01", same: true, reason: "The same carton." },
        ],
      }),
    );
    await mkdir(join(first, "review", "carried"), { recursive: true });
    await writeFile(
      join(first, "review", "carried", "Photos 2 - Web.json"),
      JSON.stringify({ A1: ["Publix"] }),
    );
    await renderBatch(first);
    await renderBatch(second);

    const built = await buildManifest([first, second]);
    expect(built.blocking).toEqual([]);
    const facts = new Map(
      built.manifest.products.map(({ facts }) => [facts.sourceKey, facts]),
    );
    expect([...facts.keys()].sort()).toEqual([
      "Photos 1 - Web/A1",
      "Photos 1 - Web/A2",
      "Photos 1 - Web/A3",
      "Photos 2 - Web/B1",
    ]);
    const a1 = facts.get("Photos 1 - Web/A1")!;
    const a2 = facts.get("Photos 1 - Web/A2")!;
    const b1 = facts.get("Photos 2 - Web/B1")!;
    // One line across both batches, started by its original.
    expect(b1.line).toEqual(a1.line);
    expect(a1.line.first).toBe("Photos 1 - Web/A1");
    expect(a1.stores).toEqual(["Sprouts", "Publix"]);
    expect(a2.stores).toEqual(["Sprouts", "Target"]);
    expect(built.counts).toMatchObject({
      products: 4,
      lines: 2,
      brands: 2,
      stores: 3,
      storeLinks: 6,
      photos: { front: 4, ingredients: 4, back: 1 },
    });
    // The moved photo is read from where it is now.
    expect(built.files.get("Photos 1 - Web/A3")!.get("back")!.full).toContain(
      join("set-aside", "duplicate", "full"),
    );
    // Review data stays internal.
    const a3 = built.manifest.products.find(
      ({ facts }) => facts.sourceKey === "Photos 1 - Web/A3",
    )!;
    expect(a3.internal).toMatchObject({
      risk: { level: "low" },
      sizes: ["16 oz"],
      notes: ["Seen on the bottom shelf."],
    });
    for (const { facts } of built.manifest.products)
      for (const field of ["risk", "check", "sizes", "confidence", "notes"])
        expect(facts).not.toHaveProperty(field);
    expect(a3.facts).not.toHaveProperty("labelEvidence");
  });

  it("refuses two originals in a line joined across batches, and a flavor twice", async () => {
    const first = await writeBatch({
      name: "Photos 1 - Web",
      stores: { "1": "Sprouts" },
      products: [
        oatMilk(),
        oatMilk({ id: "A2", flavor: "Vanilla", name: "Oat Milk Vanilla" }),
      ],
    });
    const second = await writeBatch({
      name: "Photos 2 - Web",
      stores: { "1": "Sprouts" },
      products: [
        oatMilk({ id: "B1", name: "The Original Oat Milk" }),
        oatMilk({ id: "B2", flavor: "vanilla", name: "Vanilla Oat Milk" }),
      ],
    });
    await renderBatch(first);
    await renderBatch(second);
    const { blocking } = await buildManifest([first, second]);
    expect(blocking).toEqual(
      expect.arrayContaining([
        expect.stringContaining("two products are the line's original"),
        expect.stringContaining('the flavor "vanilla" appears twice'),
      ]),
    );
  });

  it("refuses one product by the site's identity key, an unknown store and a stale review sheet", async () => {
    const web = await writeBatch({
      name: "Photos 1 - Web",
      stores: { "1": "Sprouts", "2": "Corner Shop" },
      products: [
        oatMilk(),
        // The same brand and name in another food, 12 oz: one identity.
        oatMilk({
          id: "A2",
          lineName: "Oat Milk Barista",
          name: "Oat Milk Original 12 oz",
          food: "coffee-creamer",
          visits: [2],
        }),
      ],
    });
    await renderBatch(web);
    // A correction after the sheet was rendered.
    await mkdir(join(web, "review", "corrections"), { recursive: true });
    await writeFile(
      join(web, "review", "corrections", "A1.json"),
      JSON.stringify({ id: "A1", name: "Oat Milk Classic" }),
    );
    const { blocking } = await buildManifest([web]);
    expect(blocking).toEqual(
      expect.arrayContaining([
        expect.stringContaining("products.csv no longer matches the review"),
        expect.stringContaining('no import store for "Corner Shop"'),
      ]),
    );
    // Rendered again, the sheet matches; the identity still collides.
    await writeFile(
      join(web, "review", "corrections", "A1.json"),
      JSON.stringify({ id: "A1", name: "Oat Milk Original" }),
    );
    await renderBatch(web);
    const again = await buildManifest([web]);
    expect(
      again.blocking.some((problem) => problem.includes("products.csv")),
    ).toBe(false);
    expect(again.blocking).toEqual(
      expect.arrayContaining([
        expect.stringContaining("One product by the site's identity key"),
      ]),
    );
  });

  it("refuses photos that carry metadata and products the review still flags", async () => {
    const web = await writeBatch({
      name: "Photos 1 - Web",
      stores: { "1": "Sprouts" },
      products: [
        oatMilk(),
        {
          id: "A2",
          brand: "Gummy Co",
          lineName: "Bears",
          name: "Gummy Bears",
          food: "gummy-candy",
          label: "appears_plant_based",
          risk: "high",
        },
      ],
      exif: ["A1-front.webp"],
    });
    await renderBatch(web);
    const { blocking } = await buildManifest([web]);
    expect(blocking).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "A1-front.webp carries EXIF, XMP or IPTC metadata",
        ),
        expect.stringContaining("high risk; ingredients not checked yet"),
      ]),
    );
  });

  it("keeps ids and the manifest hash stable across runs, whatever the review's internal data says", async () => {
    const web = await writeBatch({
      name: "Photos 1 - Web",
      stores: { "1": "Sprouts" },
      products: [
        oatMilk(),
        {
          id: "A2",
          brand: "Cheeseless",
          lineName: "Shreds",
          name: "Cheddar Shreds",
          food: "cheddar",
          label: "appears_plant_based",
        },
      ],
    });
    await renderBatch(web);
    const first = await buildManifest([web]);
    const second = await buildManifest([web]);
    expect(second.manifest.hash).toBe(first.manifest.hash);
    // A changed risk reason (internal) keeps the hash.
    await mkdir(join(web, "review", "corrections"), { recursive: true });
    await writeFile(
      join(web, "review", "corrections", "A2.json"),
      JSON.stringify({ id: "A2", risk: "medium", riskReason: "Looked again." }),
    );
    await renderBatch(web);
    const internal = await buildManifest([web]);
    expect(internal.blocking).toEqual([]);
    expect(internal.manifest.hash).toBe(first.manifest.hash);
    // A changed name changes it.
    await writeFile(
      join(web, "review", "corrections", "A2.json"),
      JSON.stringify({ id: "A2", name: "Sharp Cheddar Shreds" }),
    );
    await renderBatch(web);
    const renamed = await buildManifest([web]);
    expect(renamed.manifest.hash).not.toBe(first.manifest.hash);
    expect(basename(web)).toBe("Photos 1 - Web");
  });
});

describe("package labels", () => {
  const cases = [
    { kept: "appears_plant_based", incoming: "vegan", expected: "vegan" },
    { kept: "vegan", incoming: "appears_plant_based", expected: "vegan" },
    { kept: "plant_based", incoming: "vegan", expected: "vegan" },
    { kept: "vegan", incoming: "plant_based", expected: "vegan" },
    {
      kept: "appears_plant_based",
      incoming: "plant_based",
      expected: "plant_based",
    },
    {
      kept: "plant_based",
      incoming: "appears_plant_based",
      expected: "plant_based",
    },
    { kept: "vegan", incoming: "vegan", expected: "vegan" },
  ] satisfies {
    kept: Product["label"];
    incoming: Product["label"];
    expected: Product["label"];
  }[];

  it.each(cases)(
    "folds a $incoming duplicate into $kept as $expected",
    async ({ kept, incoming, expected }) => {
      const web = await writeBatch({
        name: "Photos - Web",
        stores: { "1": "Sprouts" },
        products: [
          oatMilk({
            label: kept,
            labelEvidence: "Claim on the kept package",
            risk: "high",
          }),
          oatMilk({
            id: "A2",
            label: incoming,
            labelEvidence: "Claim on the duplicate package",
            duplicateOf: "A1",
          }),
        ],
      });
      const { views } = await loadRun(openBatch(web));
      expect(views).toHaveLength(1);
      expect(views[0]).toMatchObject({
        label: expected,
        manufacturerLabel: expected,
        labelEvidence:
          expected === kept
            ? "Claim on the kept package"
            : "Claim on the duplicate package",
        flags: [],
      });
      expect(views[0]!.risk).toBeUndefined();
    },
  );

  it("keeps the owner's label correction when a duplicate has stronger evidence", async () => {
    const web = await writeBatch({
      name: "Photos - Web",
      stores: { "1": "Sprouts" },
      products: [oatMilk(), oatMilk({ id: "A2", duplicateOf: "A1" })],
      corrections: {
        A1: { label: "plant_based", labelEvidence: "Corrected by the owner" },
      },
    });
    expect((await loadRun(openBatch(web))).views[0]).toMatchObject({
      label: "plant_based",
      manufacturerLabel: "plant_based",
      labelEvidence: "Corrected by the owner",
    });
  });

  it.each(cases)(
    "merges a continued $incoming claim into $kept as $expected",
    async ({ kept, incoming, expected }) => {
      const web = await writeBatch({
        name: "Photos - Web",
        stores: { "1": "Sprouts" },
        products: [oatMilk()],
      });
      const run = join(web, "review");
      await writeFile(
        join(run, "chunks.json"),
        JSON.stringify({
          ranges: [
            {
              id: "range-01",
              photos: ["A1-front.webp"],
              context: [],
              sheets: [],
            },
            {
              id: "range-02",
              photos: ["A1-ingredients.webp"],
              context: ["A1-front.webp"],
              sheets: [],
            },
          ],
        }),
      );
      await mkdir(join(run, "sort"), { recursive: true });
      await writeFile(
        join(run, "sort", "range-01.json"),
        JSON.stringify({
          range: "range-01",
          groups: [
            {
              brand: "Oatside",
              name: "Oat Milk",
              label: kept,
              labelEvidence: "Claim on the front",
              confidence: "high",
              photos: { front: "A1-front.webp" },
            },
          ],
          setAside: [],
          storeHints: [],
        }),
      );
      await writeFile(
        join(run, "sort", "range-02.json"),
        JSON.stringify({
          range: "range-02",
          groups: [
            {
              continues: "A1-front.webp",
              label: incoming,
              labelEvidence: "Claim on the ingredients panel",
              confidence: "high",
              photos: { ingredients: "A1-ingredients.webp" },
            },
          ],
          setAside: [],
          storeHints: [],
        }),
      );
      await merge(openBatch(web), { force: false });
      const plan = mergePlan.parse(
        JSON.parse(await readFile(join(run, "merge.json"), "utf8")),
      );
      expect(plan.groups).toHaveLength(1);
      expect(plan.groups[0]).toMatchObject({
        label: expected,
        labelEvidence:
          expected === kept
            ? "Claim on the front"
            : "Claim on the ingredients panel",
        photos: { front: "A1-front.webp", ingredients: "A1-ingredients.webp" },
      });
    },
  );
});

describe("site facts", () => {
  const photo = (slot: "front" | "ingredients") => ({
    slot,
    name: `p-${slot}.webp`,
    full: { sha256: "a".repeat(64), bytes: 10, width: 60, height: 80 },
    thumbnail: { sha256: "b".repeat(64), bytes: 5, width: 15, height: 20 },
  });
  const facts = (overrides: Partial<ImportFacts> = {}): ImportFacts => ({
    sourceKey: "Photos 1 - Web/A1",
    country: "US",
    brand: "Oatside",
    line: {
      key: "oatside|oatmilk|milk",
      name: "Oat Milk",
      first: "Photos 1 - Web/A1",
    },
    name: "Oat Milk Original",
    food: "milk",
    packageLabel: "vegan",
    labelEvidence: "VEGAN on the front",
    stores: ["Sprouts"],
    photos: [photo("front"), photo("ingredients")],
    ...overrides,
  });

  it("classifies by the documented provisional rule, never by the review's checks", () => {
    const unchecked = {
      veganStatus: "appears_vegan",
      ingredientsChecked: false,
    };
    expect(importClassification(facts())).toEqual(unchecked);
    expect(importClassification(facts({ photos: [photo("front")] }))).toEqual(
      unchecked,
    );
    expect(
      importClassification(facts({ packageLabel: "plant_based" })),
    ).toEqual({
      veganStatus: "plant_based",
      ingredientsChecked: true,
    });
    expect(
      importClassification(
        facts({ packageLabel: "plant_based", photos: [photo("front")] }),
      ),
    ).toEqual(unchecked);
    expect(
      importClassification(
        facts({
          packageLabel: "appears_plant_based",
          labelEvidence: undefined,
        }),
      ),
    ).toEqual(unchecked);
  });

  it("submits a line's first product with the line's name and later ones into it", () => {
    const first = importSubmission(facts(), {
      categoryId: "milk",
      retailerIds: ["store"],
    });
    expect(first).toMatchObject({
      country: "US",
      categoryIds: ["milk"],
      imageSlots: ["front", "ingredients"],
      manufacturerLabel: "vegan",
      retailerIds: ["store"],
      lineName: "Oat Milk",
    });
    expect(first).not.toHaveProperty("noKnownAnimalIngredients");
    expect(first.statusBasis).toBe(
      "Added from VeganAlts store photos. The ingredient list is in the photo and has not been typed out. Package: VEGAN on the front.",
    );
    const later = importSubmission(
      facts({
        sourceKey: "Photos 1 - Web/A2",
        flavor: "Vanilla",
        name: "Oat Milk Vanilla",
      }),
      { categoryId: "milk", retailerIds: [] },
    );
    expect(later).toMatchObject({
      flavor: "Vanilla",
      lineId: importLineId("Photos 1 - Web/A1"),
    });
    expect(later).not.toHaveProperty("lineName");
    expect(later).not.toHaveProperty("retailerIds");
    expect(
      importEvidenceNote(
        facts({
          packageLabel: "appears_plant_based",
          photos: [photo("front")],
        }),
      ),
    ).toBe(
      "Added from VeganAlts store photos. No ingredients photo was taken.",
    );
  });

  it("derives the same ids, keys and receipt hash from the same source", async () => {
    const ids = importIds("Photos 1 - Web/A1");
    expect(importIds("Photos 1 - Web/A1")).toEqual(ids);
    expect(new Set(Object.values(ids)).size).toBe(5);
    const imageId = importImageId("Photos 1 - Web/A1", "front", "a".repeat(64));
    expect(imageId).not.toBe(
      importImageId("Photos 1 - Web/A1", "front", "c".repeat(64)),
    );
    expect(importPhotoKey(ids.product, ids.version, imageId, "full")).toBe(
      `products/${ids.product}/${ids.version}/${imageId}/import/full.webp`,
    );
    expect(await importFactsHash(facts())).toBe(
      await importFactsHash({ ...facts(), stores: ["Sprouts"] }),
    );
    expect(await importFactsHash(facts())).not.toBe(
      await importFactsHash(facts({ name: "Oat Milk Classic" })),
    );
  });
});
