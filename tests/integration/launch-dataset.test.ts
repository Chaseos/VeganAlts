import { hasIngredientEvidence } from "../../scripts/ingredient-evidence";
import { env } from "cloudflare:workers";
import { afterEach, expect, it } from "vitest";
import { taxonomySeedStatements } from "../../db/seed/taxonomy";
import { auditLaunchDataset } from "../../scripts/launch-dataset";
import { productRows } from "./fixtures";

let currentProductId: string | undefined;
afterEach(async () => {
  if (currentProductId)
    await env.DB.prepare(
      "UPDATE products SET lifecycle_status='hidden' WHERE id=?",
    )
      .bind(currentProductId)
      .run();
  currentProductId = undefined;
});

async function product({
  status = "appears_plant_based",
  checked = 0,
  classification = true,
  front = true,
  urls = [] as string[],
} = {}) {
  await env.DB.batch(
    taxonomySeedStatements(() => crypto.randomUUID(), 1).map((sql) =>
      env.DB.prepare(sql),
    ),
  );
  const countryId = (await env.DB.prepare(
      "SELECT id FROM countries WHERE iso2='US'",
    ).first<string>("id"))!,
    productId = crypto.randomUUID(),
    versionId = crypto.randomUUID();
  currentProductId = productId;
  await env.DB.batch([
    ...productRows(env.DB, productId, countryId, "Launch product", productId),
    env.DB.prepare(
      "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1)",
    ).bind(versionId, productId),
    env.DB.prepare("UPDATE products SET vegan_status=? WHERE id=?").bind(
      status,
      productId,
    ),
    ...(front
      ? [
          env.DB.prepare(
            "INSERT INTO product_images(id,product_version_id,slot,state,full_r2_key,created_at,updated_at) VALUES(?,?,'front','accepted','front.webp',1,1)",
          ).bind(crypto.randomUUID(), versionId),
        ]
      : []),
    ...(classification
      ? [
          env.DB.prepare(
            "INSERT INTO formula_classifications(product_version_id,vegan_status,manufacturer_label,evidence_data,ingredients_checked,updated_at) VALUES(?,?,'unknown',?,?,1)",
          ).bind(versionId, status, JSON.stringify({ urls }), checked),
        ]
      : []),
  ]);
  return { productId, versionId };
}

it("accepts a front-photo-only product explicitly marked unchecked and reports missing evidence informationally", async () => {
  const { productId } = await product();
  const audit = await auditLaunchDataset(env.DB);
  expect(audit.readyForLaunch).toBe(true);
  expect(audit.blocking).toEqual([]);
  expect(audit.report.uncheckedProductsWithoutIngredientEvidence).toEqual({
    count: 1,
    sample: [productId],
    byCountry: { US: 1 },
  });
  expect(audit.report.productsWithoutIngredientEvidence?.count).toBe(0);
});

it.each(["appears_plant_based", "plant_based", "vegan", "under_review"])(
  "still requires ingredient evidence for checked %s classifications",
  async (status) => {
    const { productId } = await product({ status, checked: 1 });
    const audit = await auditLaunchDataset(env.DB);
    expect(audit.readyForLaunch).toBe(false);
    expect(audit.blocking).toContain("productsWithoutIngredientEvidence");
    expect(audit.report.productsWithoutIngredientEvidence?.sample).toEqual([
      productId,
    ]);
    expect(audit.report.uncheckedProductsWithoutIngredientEvidence?.count).toBe(
      0,
    );
  },
);

it("does not treat a missing classification as explicitly unchecked", async () => {
  await product({ classification: false });
  expect((await auditLaunchDataset(env.DB)).blocking).toContain(
    "productsWithoutIngredientEvidence",
  );
});

it.each(["url", "photo"])(
  "accepts checked classifications with ingredient evidence from a %s",
  async (source) => {
    const { versionId } = await product({
      checked: 1,
      urls: source === "url" ? ["https://example.com/ingredients"] : [],
    });
    if (source === "photo")
      await env.DB.prepare(
        "INSERT INTO product_images(id,product_version_id,slot,state,full_r2_key,created_at,updated_at) VALUES(?,?,'ingredients','accepted','ingredients.webp',1,1)",
      )
        .bind(crypto.randomUUID(), versionId)
        .run();
    expect((await auditLaunchDataset(env.DB)).readyForLaunch).toBe(true);
  },
);

it("still requires operator review for Vegan even with ingredient evidence", async () => {
  const { versionId } = await product({
    status: "vegan",
    checked: 1,
    urls: ["https://example.com/ingredients"],
  });
  expect((await auditLaunchDataset(env.DB)).blocking).toEqual([
    "veganWithoutReview",
  ]);
  await env.DB.prepare(
    "UPDATE formula_classifications SET reviewed_by='veganalts-system' WHERE product_version_id=?",
  )
    .bind(versionId)
    .run();
  expect((await auditLaunchDataset(env.DB)).readyForLaunch).toBe(true);
});

it("still requires a front photo for unchecked products", async () => {
  await product({ front: false });
  expect((await auditLaunchDataset(env.DB)).blocking).toEqual([
    "productsWithoutFrontPhoto",
  ]);
});

async function transcription(
  versionId: string,
  changes: Record<string, unknown> = {},
) {
  const sourceId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO product_images(id,product_version_id,slot,state,full_r2_key,created_at,updated_at) VALUES(?,?,'back','accepted','back.webp',1,1)",
  )
    .bind(sourceId, versionId)
    .run();
  const row = {
    package: "Oats, water",
    sources: JSON.stringify([sourceId]),
    verification: "single_read",
    online: null,
    url: null,
    accessed: null,
    match: null,
    ...changes,
  };
  await env.DB.prepare(
    `INSERT INTO product_version_ingredient_transcriptions(product_version_id,package_ingredients,source_image_ids,readings,verification,assessment,online_ingredients,online_url,online_accessed_at,online_product_match,created_at) VALUES(?,?,?,'[]',?,'{}',?,?,?,?,1)`,
  )
    .bind(
      versionId,
      row.package,
      row.sources,
      row.verification,
      row.online,
      row.url,
      row.accessed,
      row.match,
    )
    .run();
  return sourceId;
}

it.each(["front", "back"])(
  "accepts a checked transcription citing its accepted %s photo",
  async (slot) => {
    const { versionId } = await product({ checked: 1 });
    const photo = await transcription(versionId);
    if (slot === "front") {
      await env.DB.prepare(
        "UPDATE product_images SET state='rejected' WHERE product_version_id=? AND slot='front'",
      )
        .bind(versionId)
        .run();
      await env.DB.prepare("UPDATE product_images SET slot='front' WHERE id=?")
        .bind(photo)
        .run();
    }
    expect(
      (await auditLaunchDataset(env.DB)).report
        .productsWithoutIngredientEvidence?.count,
    ).toBe(0);
  },
);

it.each([
  { sources: "[]" },
  { sources: '["unrelated-photo"]' },
  { package: " " },
  { verification: "no_source" },
  { verification: "unresolved" },
])("does not accept unusable transcription evidence: %j", async (changes) => {
  const { versionId } = await product({ checked: 1 });
  await transcription(versionId, changes);
  expect((await auditLaunchDataset(env.DB)).blocking).toContain(
    "productsWithoutIngredientEvidence",
  );
});

it("rejects rejected source photos and photos belonging to a different formula", async () => {
  const { versionId, productId } = await product({ checked: 1 });
  const photo = await transcription(versionId);
  await env.DB.prepare("UPDATE product_images SET state='rejected' WHERE id=?")
    .bind(photo)
    .run();
  expect((await auditLaunchDataset(env.DB)).blocking).toContain(
    "productsWithoutIngredientEvidence",
  );
  const historical = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,0,1,1)",
  )
    .bind(historical, productId)
    .run();
  await env.DB.prepare(
    "UPDATE product_images SET state='accepted',product_version_id=? WHERE id=?",
  )
    .bind(historical, photo)
    .run();
  expect((await auditLaunchDataset(env.DB)).blocking).toContain(
    "productsWithoutIngredientEvidence",
  );
});

it("requires a usable, dated matching online ingredient source", async () => {
  const { versionId } = await product({ checked: 1 });
  await transcription(versionId, {
    package: null,
    sources: "[]",
    verification: "online_only",
    online: "Oats, water",
    url: "https://example.com/product",
    accessed: "2026-10-23T00:00:00.000Z",
    match: "Exact photographed product",
  });
  expect(
    (await auditLaunchDataset(env.DB)).report.productsWithoutIngredientEvidence
      ?.count,
  ).toBe(0);
  for (const url of ["", "javascript:alert(1)", "not-a-url"]) {
    await env.DB.prepare(
      "UPDATE product_version_ingredient_transcriptions SET online_url=? WHERE product_version_id=?",
    )
      .bind(url, versionId)
      .run();
    expect((await auditLaunchDataset(env.DB)).blocking).toContain(
      "productsWithoutIngredientEvidence",
    );
  }
  await env.DB.prepare(
    "UPDATE product_version_ingredient_transcriptions SET online_url='https://example.com/product',online_product_match='' WHERE product_version_id=?",
  )
    .bind(versionId)
    .run();
  expect((await auditLaunchDataset(env.DB)).blocking).toContain(
    "productsWithoutIngredientEvidence",
  );
});

it("rejects online evidence with an unrecognized verification state", () => {
  expect(
    hasIngredientEvidence({
      evidenceUrls: "[]",
      packageIngredients: null,
      verification: "invalid",
      acceptedSourcePhotos: 0,
      onlineIngredients: "Oats, water",
      onlineUrl: "https://example.com/product",
      onlineAccessedAt: "2026-10-23T00:00:00.000Z",
      onlineProductMatch: "Exact product",
    }),
  ).toBe(false);
});
