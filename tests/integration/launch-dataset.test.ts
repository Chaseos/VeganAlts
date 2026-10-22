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
  status = "appears_vegan",
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

it.each(["appears_vegan", "plant_based", "vegan", "under_review"])(
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
