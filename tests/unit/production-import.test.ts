import { expect, it } from "vitest";
import { assertProductionApproval } from "../../scripts/catalog-import/production-guard";
import { applyReleaseReview } from "../../scripts/catalog-import/release-review";
import {
  importManifestHash,
  type ImportFacts,
  type ImportManifest,
} from "../../server/community/domain/catalog-import";

const now = Date.parse("2026-10-23T12:00:00Z");
const expected = {
  databaseId: "production-db",
  bucket: "production-media",
  operatorId: "owner",
  manifestHash: "a".repeat(64),
  reviewHash: "b".repeat(64),
  confirmation: "production-db",
  fullRun: true,
};
const approval = {
  version: 1,
  environment: "production",
  ...expected,
  notReady: [],
  createdAt: new Date(now).toISOString(),
};

it("requires a recent successful full production dry run bound to the target, operator and reviewed facts", () => {
  expect(() => assertProductionApproval(approval, expected, now)).not.toThrow();
  for (const change of [
    { environment: "staging" },
    { databaseId: "other-db" },
    { bucket: "staging-media" },
    { operatorId: "other" },
    { manifestHash: "c".repeat(64) },
    { reviewHash: "c".repeat(64) },
    { fullRun: false },
    { notReady: [{ reason: "changed" }] },
    { createdAt: "2026-10-21T12:00:00Z" },
    { createdAt: "2026-10-24T12:00:00Z" },
  ])
    expect(() =>
      assertProductionApproval({ ...approval, ...change }, expected, now),
    ).toThrow();
  for (const change of [
    { confirmation: undefined },
    { confirmation: "staging-db" },
    { fullRun: false },
    { reviewHash: null },
  ])
    expect(() =>
      assertProductionApproval(approval, { ...expected, ...change }, now),
    ).toThrow();
});

const product = (
  sourceKey: string,
  flavor?: string,
): ImportManifest["products"][number] => ({
  facts: {
    sourceKey,
    country: "US",
    brand: "Test brand",
    name: `Test product ${sourceKey}`,
    food: "milk",
    flavor,
    line: { key: "milk-line", name: "Milk", first: "photos/original" },
    packageLabel: "vegan",
    stores: [],
    transcription: {
      ingredients: "Water, oats.",
      readings: [
        {
          reader: "first",
          ingredients: "Water, oats.",
          photosUsed: ["front.webp"],
          confidence: "high",
        },
      ],
      verification: "single_read",
      assessment: {
        result: "none_found",
        animalIngredients: [],
        unclearIngredients: [],
      },
    },
    photos: [
      {
        slot: "front",
        name: "front.webp",
        full: { sha256: "a".repeat(64), bytes: 10, width: 10, height: 10 },
        thumbnail: { sha256: "b".repeat(64), bytes: 10, width: 10, height: 10 },
      },
    ],
  } as ImportFacts,
  internal: { confidence: "high", sizes: [], notes: [] },
});
async function fixture() {
  const source: ImportManifest = {
    version: 1,
    batches: [{ folder: "photos", products: 3 }],
    products: [
      product("photos/original"),
      product("photos/vanilla", "Vanilla"),
      product("photos/chocolate", "Chocolate"),
    ],
    formulaUpdates: [],
    hash: "",
  };
  source.hash = await importManifestHash(source);
  return {
    source,
    review: {
      version: 1,
      sourceManifestHash: source.hash,
      scope: "animal-original-imitation-with-vegan-preparation",
      decisions: [
        {
          sourceKey: "photos/original",
          decision: "exclude",
          reason: "Outside the approved catalog scope.",
        },
        {
          sourceKey: "photos/chocolate",
          decision: "reclassify",
          food: "chocolate-milk",
          lineName: "Chocolate Milk",
          separateLine: true,
          reason: "A distinct food and base recipe.",
        },
      ],
    },
  };
}

it("omits held/excluded records, repairs the remaining line's first product, and splits changed foods without touching source history", async () => {
  const { source, review } = await fixture();
  const original = structuredClone(source);
  const result = await applyReleaseReview(source, review);
  expect(source).toEqual(original);
  expect(result.manifest.products).toHaveLength(2);
  expect(result.manifest.products[0]!.facts.line.first).toBe("photos/vanilla");
  expect(result.manifest.products[1]!.facts).toMatchObject({
    food: "chocolate-milk",
    line: { name: "Chocolate Milk", first: "photos/chocolate" },
  });
  expect(result.manifest.hash).not.toBe(source.hash);
  expect((await applyReleaseReview(source, review)).manifest.hash).toBe(
    result.manifest.hash,
  );
  await expect(
    applyReleaseReview(source, {
      ...review,
      sourceManifestHash: "f".repeat(64),
    }),
  ).rejects.toThrow("different source");
  await expect(
    applyReleaseReview(source, {
      ...review,
      decisions: [...review.decisions, review.decisions[0]],
    }),
  ).rejects.toThrow("more than one");
  await expect(
    applyReleaseReview(source, {
      ...review,
      decisions: [{ ...review.decisions[0], sourceKey: "photos/missing" }],
    }),
  ).rejects.toThrow("Unknown release source");
});

it("omits confirmed duplicates only when their survivor remains in the release", async () => {
  const { source, review } = await fixture();
  const duplicate = {
    sourceKey: "photos/chocolate",
    decision: "duplicate",
    survivorSourceKey: "photos/vanilla",
    reason: "Matching package and formula evidence.",
  };
  const result = await applyReleaseReview(source, {
    ...review,
    decisions: [duplicate],
  });
  expect(result.manifest.products.map((p) => p.facts.sourceKey)).toEqual([
    "photos/original",
    "photos/vanilla",
  ]);
  for (const survivorSourceKey of [
    undefined,
    "photos/chocolate",
    "photos/missing",
  ])
    await expect(
      applyReleaseReview(source, {
        ...review,
        decisions: [{ ...duplicate, survivorSourceKey }],
      }),
    ).rejects.toThrow("retained survivor");
  await expect(
    applyReleaseReview(source, {
      ...review,
      decisions: [
        duplicate,
        {
          sourceKey: "photos/vanilla",
          decision: "hold",
          reason: "Missing evidence of eligibility.",
        },
      ],
    }),
  ).rejects.toThrow("retained survivor");
});

it("rejects reclassifications that the cleanup cannot apply consistently", async () => {
  const { source, review } = await fixture();
  for (const change of [
    { food: undefined },
    { lineName: undefined },
    { separateLine: false },
  ]) {
    await expect(
      applyReleaseReview(source, {
        ...review,
        decisions: [{ ...review.decisions[1], ...change }],
      }),
    ).rejects.toThrow("reclassification needs");
  }
});
