import { createHash } from "node:crypto";
import {
  IMPORT_ACTION,
  MANUFACTURER_LABEL,
  canonical,
  importClassification,
  importIds,
  importImageId,
  importLineId,
  importPhotoKey,
  type ImportManifest,
} from "../../server/community/domain/catalog-import";
import { normalizeName } from "../../server/community/domain/policy";
import { readMedia } from "../../server/media/infrastructure/media-reader";
import { IMPORT_STORES } from "./retailers";

// `--verify` (docs/IMPORTER_PLAN.md, "Verification"): read-only checks that
// the environment holds exactly what the manifest describes. The digest of
// the imported lines' derived rows proves that the integrity rebuild
// reproduces what the import wrote.

const number = async (statement: D1PreparedStatement) =>
  Number((await statement.first<number>("n")) ?? 0);

export async function verifyImport(
  env: { DB: D1Database; MEDIA_BUCKET: R2Bucket },
  manifest: ImportManifest,
  options: { sample: number },
) {
  const db = env.DB;
  const problems: string[] = [];
  const products = manifest.products.map(({ facts }) => ({
    facts,
    ids: importIds(facts.sourceKey),
  }));
  const ids = JSON.stringify(products.map(({ ids }) => ids.product));
  const rows = new Map(
    (
      await db
        .prepare(
          "SELECT p.id,p.name,p.flavor,p.lifecycle_status AS lifecycle,p.product_family_id AS line,p.brand_id AS brand,b.name AS brandName,c.iso2 AS country FROM products p LEFT JOIN brands b ON b.id=p.brand_id JOIN countries c ON c.id=p.country_id WHERE p.id IN (SELECT value FROM json_each(?))",
        )
        .bind(ids)
        .all<{
          id: string;
          name: string;
          flavor: string | null;
          lifecycle: string;
          line: string;
          brand: string;
          brandName: string;
          country: string;
        }>()
    ).results.map((row) => [row.id, row]),
  );
  const formulas = new Map(
    (
      await db
        .prepare(
          "SELECT product_id AS id,COUNT(*) AS n FROM product_versions WHERE is_current=1 AND product_id IN (SELECT value FROM json_each(?)) GROUP BY product_id",
        )
        .bind(ids)
        .all<{ id: string; n: number }>()
    ).results.map((row) => [row.id, row.n]),
  );
  const currentVersions = new Map(
    (
      await db
        .prepare(
          "SELECT product_id AS product,id FROM product_versions WHERE is_current=1 AND product_id IN (SELECT value FROM json_each(?))",
        )
        .bind(ids)
        .all<{ product: string; id: string }>()
    ).results.map((row) => [row.product, row.id]),
  );
  const expectedFacts = new Map(
    products.map(({ facts, ids: productIds }) => [productIds.product, facts]),
  );
  for (const update of manifest.formulaUpdates)
    expectedFacts.set(importIds(update.productSourceKey).product, update.facts);
  const currentClassifications = new Map(
    (
      await db
        .prepare(
          "SELECT p.id,p.vegan_status AS productStatus,p.manufacturer_label AS productLabel,f.vegan_status AS status,f.manufacturer_label AS label,f.ingredients_checked AS checked FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1 JOIN formula_classifications f ON f.product_version_id=v.id WHERE p.id IN (SELECT value FROM json_each(?))",
        )
        .bind(ids)
        .all<{
          id: string;
          productStatus: string;
          productLabel: string;
          status: string;
          label: string;
          checked: number;
        }>()
    ).results.map((row) => [row.id, row]),
  );
  for (const [productId, facts] of expectedFacts) {
    const actual = currentClassifications.get(productId);
    const expectedStatus = importClassification(facts).veganStatus;
    const expectedLabel = MANUFACTURER_LABEL[facts.packageLabel];
    if (
      !actual ||
      actual.status !== expectedStatus ||
      actual.productStatus !== expectedStatus ||
      actual.label !== expectedLabel ||
      actual.productLabel !== expectedLabel ||
      actual.checked !== 1
    )
      problems.push(
        `${facts.sourceKey} has a current label or ingredient-check state that differs from the reviewed manifest.`,
      );
  }
  const images = new Map(
    (
      await db
        .prepare(
          "SELECT i.id,i.slot,i.full_r2_key AS full,i.thumbnail_r2_key AS thumbnail,i.evidence_r2_key AS evidence,v.product_id AS product FROM product_images i JOIN product_versions v ON v.id=i.product_version_id WHERE i.state='accepted' AND v.product_id IN (SELECT value FROM json_each(?))",
        )
        .bind(ids)
        .all<{
          id: string;
          slot: string;
          full: string;
          thumbnail: string;
          evidence: string | null;
          product: string;
        }>()
    ).results.map((row) => [row.id, row]),
  );
  const photos: Record<string, number> = {};
  const objects: { key: string; bytes: number }[] = [];
  const memberships = (
    await db
      .prepare(
        "SELECT pc.product_id AS product,c.slug AS food,pc.ranking_eligible AS eligible FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id IN (SELECT value FROM json_each(?))",
      )
      .bind(ids)
      .all<{ product: string; food: string; eligible: number }>()
  ).results;
  for (const { facts, ids: productIds } of products) {
    const row = rows.get(productIds.product);
    if (!row) {
      problems.push(`${facts.sourceKey} is not imported.`);
      continue;
    }
    if (row.lifecycle !== "active")
      problems.push(`${facts.sourceKey} is ${row.lifecycle}.`);
    if (
      row.line !== importLineId(facts.line.first) ||
      row.name !== facts.name ||
      (row.flavor ?? "") !== (facts.flavor ?? "") ||
      normalizeName(row.brandName) !== normalizeName(facts.brand) ||
      row.country !== facts.country
    )
      problems.push(
        `${facts.sourceKey} has a different identity, market or recipe line from the release manifest.`,
      );
    const foods = memberships.filter(
      (m) => m.product === productIds.product && m.eligible,
    );
    if (foods.length !== 1 || foods[0]?.food !== facts.food)
      problems.push(
        `${facts.sourceKey} has different eligible foods from the release manifest.`,
      );
    if (formulas.get(productIds.product) !== 1)
      problems.push(`${facts.sourceKey} has no single current formula.`);
    for (const photo of facts.photos) {
      const imageId = importImageId(
        facts.sourceKey,
        photo.slot,
        photo.full.sha256,
      );
      const image = images.get(imageId);
      if (!image || image.slot !== photo.slot) {
        problems.push(`${facts.sourceKey} lacks its ${photo.slot} photo.`);
        continue;
      }
      photos[photo.slot] = (photos[photo.slot] ?? 0) + 1;
      if (image.evidence)
        problems.push(
          `${facts.sourceKey}'s ${photo.slot} photo has an evidence copy.`,
        );
      for (const kind of ["full", "thumbnail"] as const) {
        const key = importPhotoKey(
          productIds.product,
          productIds.version,
          imageId,
          kind,
        );
        if (image[kind] !== key)
          problems.push(
            `${facts.sourceKey}'s ${photo.slot} ${kind} key differs.`,
          );
        objects.push({ key, bytes: photo[kind].bytes });
      }
    }
  }
  for (const update of manifest.formulaUpdates) {
    const productId = importIds(update.productSourceKey).product;
    const versionId = importIds(update.facts.sourceKey).version;
    if (currentVersions.get(productId) !== versionId)
      problems.push(
        `${update.facts.sourceKey} is not the current version of its product.`,
      );
    for (const photo of update.facts.photos) {
      const imageId = importImageId(
        update.facts.sourceKey,
        photo.slot,
        photo.full.sha256,
      );
      const image = images.get(imageId);
      if (!image || image.slot !== photo.slot) {
        problems.push(
          `${update.facts.sourceKey} lacks its ${photo.slot} photo.`,
        );
        continue;
      }
      photos[photo.slot] = (photos[photo.slot] ?? 0) + 1;
      if (image.evidence)
        problems.push(
          `${update.facts.sourceKey}'s ${photo.slot} photo has an evidence copy.`,
        );
      for (const kind of ["full", "thumbnail"] as const) {
        const key = importPhotoKey(productId, versionId, imageId, kind);
        if (image[kind] !== key)
          problems.push(
            `${update.facts.sourceKey}'s ${photo.slot} ${kind} key differs.`,
          );
        objects.push({ key, bytes: photo[kind].bytes });
      }
    }
  }
  const transcriptionExpectations = [
    ...products.map(({ facts, ids: productIds }) => ({
      facts,
      versionId: productIds.version,
    })),
    ...manifest.formulaUpdates.map(({ facts }) => ({
      facts,
      versionId: importIds(facts.sourceKey).version,
    })),
  ];
  const transcriptionVersionIds = JSON.stringify(
    transcriptionExpectations.map(({ versionId }) => versionId),
  );
  const transcriptions = new Map(
    (
      await db
        .prepare(
          "SELECT product_version_id AS id,package_ingredients,package_contains,package_may_contain,source_image_ids,readings,verification,assessment,online_ingredients,online_contains,online_may_contain,online_url,online_accessed_at,online_product_match FROM product_version_ingredient_transcriptions WHERE product_version_id IN (SELECT value FROM json_each(?))",
        )
        .bind(transcriptionVersionIds)
        .all<{
          id: string;
          package_ingredients: string | null;
          package_contains: string | null;
          package_may_contain: string | null;
          source_image_ids: string;
          readings: string;
          verification: string;
          assessment: string;
          online_ingredients: string | null;
          online_contains: string | null;
          online_may_contain: string | null;
          online_url: string | null;
          online_accessed_at: string | null;
          online_product_match: string | null;
        }>()
    ).results.map((row) => [row.id, row]),
  );
  for (const { facts, versionId } of transcriptionExpectations) {
    const actual = transcriptions.get(versionId);
    const sourceImageIds = [
      ...new Set(
        facts.transcription.readings.flatMap((reading) => reading.photosUsed),
      ),
    ]
      .map((name) => facts.photos.find((photo) => photo.name === name))
      .filter((photo): photo is (typeof facts.photos)[number] => !!photo)
      .map((photo) =>
        importImageId(facts.sourceKey, photo.slot, photo.full.sha256),
      );
    const expected = {
      package_ingredients: facts.transcription.ingredients ?? null,
      package_contains: facts.transcription.contains ?? null,
      package_may_contain: facts.transcription.mayContain ?? null,
      source_image_ids: sourceImageIds,
      readings: facts.transcription.readings,
      verification: facts.transcription.verification,
      assessment: facts.transcription.assessment,
      online_ingredients:
        facts.transcription.onlineSupplement?.ingredients ?? null,
      online_contains: facts.transcription.onlineSupplement?.contains ?? null,
      online_may_contain:
        facts.transcription.onlineSupplement?.mayContain ?? null,
      online_url: facts.transcription.onlineSupplement?.url ?? null,
      online_accessed_at:
        facts.transcription.onlineSupplement?.accessedAt ?? null,
      online_product_match:
        facts.transcription.onlineSupplement?.productMatch ?? null,
    };
    const values = actual
      ? {
          package_ingredients: actual.package_ingredients,
          package_contains: actual.package_contains,
          package_may_contain: actual.package_may_contain,
          source_image_ids: JSON.parse(actual.source_image_ids) as string[],
          readings: JSON.parse(actual.readings) as unknown[],
          verification: actual.verification,
          assessment: JSON.parse(actual.assessment) as unknown,
          online_ingredients: actual.online_ingredients,
          online_contains: actual.online_contains,
          online_may_contain: actual.online_may_contain,
          online_url: actual.online_url,
          online_accessed_at: actual.online_accessed_at,
          online_product_match: actual.online_product_match,
        }
      : null;
    if (
      !values ||
      JSON.stringify(canonical(values)) !== JSON.stringify(canonical(expected))
    )
      problems.push(
        `${facts.sourceKey} is missing or differs from its reviewed ingredient transcription.`,
      );
  }
  for (const update of manifest.formulaUpdates) {
    const versionId = importIds(update.facts.sourceKey).version;
    const version = await db
      .prepare(
        "SELECT version_label AS label,change_summary AS summary FROM product_versions WHERE id=? AND product_id=?",
      )
      .bind(versionId, importIds(update.productSourceKey).product)
      .first<{ label: string; summary: string }>();
    if (
      !version ||
      version.label !== update.label ||
      version.summary !== update.summary
    )
      problems.push(
        `${update.facts.sourceKey} has formula history metadata that differs from the reviewed manifest.`,
      );
  }
  // Every object is in R2 with the manifest's size.
  let missingObjects = 0;
  for (let start = 0; start < objects.length; start += 16)
    await Promise.all(
      objects.slice(start, start + 16).map(async ({ key, bytes }) => {
        const head = await env.MEDIA_BUCKET.head(key);
        if (!head || head.size !== bytes) missingObjects++;
      }),
    );
  if (missingObjects)
    problems.push(
      `${missingObjects} photo objects are missing or the wrong size.`,
    );
  // A sample reads through the site's media reader.
  for (const { facts, ids: productIds } of products.slice(0, options.sample)) {
    const front = facts.photos[0]!;
    const imageId = importImageId(
      facts.sourceKey,
      front.slot,
      front.full.sha256,
    );
    for (const kind of ["full", "thumbnail"] as const) {
      const response = await readMedia(
        db,
        env.MEDIA_BUCKET,
        imageId,
        kind,
        new Request("https://example.invalid/media"),
      );
      const length = response.ok
        ? (await response.arrayBuffer()).byteLength
        : 0;
      if (length !== front[kind].bytes)
        problems.push(
          `${facts.sourceKey}'s ${kind} photo doesn't read (${productIds.product}).`,
        );
    }
  }

  const expected = {
    products: products.length,
    lines: new Set(products.map(({ facts }) => facts.line.key)).size,
    storeLinks: products.reduce(
      (sum, { facts }) => sum + facts.stores.length,
      0,
    ),
  };
  const counts = {
    products: rows.size,
    activeProducts: [...rows.values()].filter(
      (row) => row.lifecycle === "active",
    ).length,
    lines: new Set([...rows.values()].map((row) => row.line)).size,
    brands: new Set([...rows.values()].map((row) => row.brand)).size,
    photos,
    storeLinks: await number(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM product_retailers WHERE product_id IN (SELECT value FROM json_each(?))",
        )
        .bind(ids),
    ),
    stores: await number(
      db
        .prepare(
          "SELECT COUNT(DISTINCT r.id) AS n FROM retailers r JOIN retailer_markets m ON m.retailer_id=r.id AND m.is_active=1 JOIN countries c ON c.id=m.country_id AND c.iso2='US' WHERE r.normalized_name IN (SELECT value FROM json_each(?))",
        )
        .bind(
          JSON.stringify(
            IMPORT_STORES.map((store) => normalizeName(store.name)),
          ),
        ),
    ),
    searchable: await number(
      db
        .prepare(
          "SELECT COUNT(DISTINCT entity_id) AS n FROM search_index WHERE entity_type='product' AND entity_id IN (SELECT value FROM json_each(?))",
        )
        .bind(ids),
    ),
    brandsSearchable: await number(
      db
        .prepare(
          "SELECT COUNT(DISTINCT brand_id) AS n FROM brand_search WHERE brand_id IN (SELECT DISTINCT brand_id FROM products WHERE id IN (SELECT value FROM json_each(?)))",
        )
        .bind(ids),
    ),
    linesInFoods: await number(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM (SELECT DISTINCT p.product_family_id AS line,pc.category_id AS food FROM products p JOIN product_categories pc ON pc.product_id=p.id WHERE p.id IN (SELECT value FROM json_each(?)))",
        )
        .bind(ids),
    ),
    linesFirstPublished: await number(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM (SELECT DISTINCT p.product_family_id AS line,pc.category_id AS food FROM products p JOIN product_categories pc ON pc.product_id=p.id WHERE p.id IN (SELECT value FROM json_each(?))) x WHERE EXISTS(SELECT 1 FROM family_category_first_published f WHERE f.product_family_id=x.line AND f.category_id=x.food)",
        )
        .bind(ids),
    ),
    importActions: await number(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM moderation_actions WHERE kind=? AND product_id IN (SELECT value FROM json_each(?))",
        )
        .bind(IMPORT_ACTION, ids),
    ),
    publishedEntries: await number(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_log WHERE action='product_published' AND entity_id IN (SELECT value FROM json_each(?))",
        )
        .bind(ids),
    ),
    // The review's internal data never reaches the audit log.
    internalInAudit: await number(
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM audit_log a WHERE a.entity_id IN (SELECT value FROM json_each(?)) AND EXISTS(
            SELECT 1 FROM json_tree(a.after_data) j
            LEFT JOIN json_tree(a.after_data) parent ON parent.id=j.parent
            LEFT JOIN json_tree(a.after_data) grandparent ON grandparent.id=parent.parent
            WHERE j.key IN ('internal','risk','sizes','notes')
              OR (j.key='confidence' AND grandparent.key IS NOT 'readings')
          )`,
        )
        .bind(ids),
    ),
    foreignKeyProblems: (await db.prepare("PRAGMA foreign_key_check").all())
      .results.length,
  };
  const classification = (
    await db
      .prepare(
        "SELECT p.vegan_status AS status,f.ingredients_checked AS checked,p.manufacturer_label AS label,COUNT(*) AS n FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1 JOIN formula_classifications f ON f.product_version_id=v.id WHERE p.id IN (SELECT value FROM json_each(?)) GROUP BY 1,2,3 ORDER BY 4 DESC",
      )
      .bind(ids)
      .all()
  ).results;
  for (const [name, value] of Object.entries(expected))
    if (counts[name as keyof typeof counts] !== value)
      problems.push(
        `Expected ${value} ${name}, found ${String(counts[name as keyof typeof counts])}.`,
      );
  if (counts.activeProducts !== expected.products)
    problems.push(
      `${expected.products - counts.activeProducts} imported products are not active.`,
    );
  if (counts.stores !== IMPORT_STORES.length)
    problems.push(
      `Expected ${IMPORT_STORES.length} stores, found ${counts.stores}.`,
    );
  if (counts.searchable !== rows.size)
    problems.push(
      `${rows.size - counts.searchable} products are missing from search.`,
    );
  if (counts.brandsSearchable !== counts.brands)
    problems.push(
      `${counts.brands - counts.brandsSearchable} brands are missing from brand search.`,
    );
  if (counts.linesFirstPublished !== counts.linesInFoods)
    problems.push(
      `${counts.linesInFoods - counts.linesFirstPublished} lines have no first publication.`,
    );
  if (
    counts.importActions !== rows.size ||
    counts.publishedEntries !== rows.size
  )
    problems.push(
      "Some imported products lack their import action or audit entry.",
    );
  if (counts.internalInAudit)
    problems.push("Internal review data is in the audit log.");
  if (counts.foreignKeyProblems)
    problems.push(`${counts.foreignKeyProblems} foreign-key problems.`);

  // The imported lines' derived rows, which the integrity rebuild must
  // reproduce. Timestamps of the recomputation itself are left out.
  const derived = await db.batch([
    db
      .prepare(
        "SELECT product_family_id,category_id,people_count,mean_sum,raw_average,bayesian_score,enjoyment_people,enjoyment_mean_sum,enjoyment_average,enjoyment_score,tried_count,recent_count,lead_product_id FROM family_category_stats WHERE product_family_id IN (SELECT DISTINCT product_family_id FROM products WHERE id IN (SELECT value FROM json_each(?))) ORDER BY 1,2",
      )
      .bind(ids),
    db
      .prepare(
        "SELECT product_family_id,category_id,dimension_id,people_count,mean_sum FROM family_category_dimension_stats WHERE product_family_id IN (SELECT DISTINCT product_family_id FROM products WHERE id IN (SELECT value FROM json_each(?))) ORDER BY 1,2,3",
      )
      .bind(ids),
    db
      .prepare(
        "SELECT product_family_id,category_id,first_published_at FROM family_category_first_published WHERE product_family_id IN (SELECT DISTINCT product_family_id FROM products WHERE id IN (SELECT value FROM json_each(?))) ORDER BY 1,2",
      )
      .bind(ids),
    db
      .prepare(
        "SELECT entity_type,entity_id,country_code,title,subtitle,aliases,body FROM search_index WHERE entity_type='product' AND entity_id IN (SELECT value FROM json_each(?)) ORDER BY entity_id",
      )
      .bind(ids),
  ]);
  const digest = createHash("sha256")
    .update(JSON.stringify(derived.map((result) => result.results)))
    .digest("hex");
  return {
    ok: problems.length === 0,
    expected,
    counts,
    classification,
    digest,
    problems,
  };
}
