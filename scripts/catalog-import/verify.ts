import { createHash } from "node:crypto";
import {
  IMPORT_ACTION,
  importIds,
  importImageId,
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
          "SELECT id,lifecycle_status AS lifecycle,product_family_id AS line,brand_id AS brand FROM products WHERE id IN (SELECT value FROM json_each(?))",
        )
        .bind(ids)
        .all<{ id: string; lifecycle: string; line: string; brand: string }>()
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
  for (const { facts, ids: productIds } of products) {
    const row = rows.get(productIds.product);
    if (!row) {
      problems.push(`${facts.sourceKey} is not imported.`);
      continue;
    }
    if (row.lifecycle !== "active")
      problems.push(`${facts.sourceKey} is ${row.lifecycle}.`);
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
          `SELECT COUNT(*) AS n FROM audit_log WHERE entity_id IN (SELECT value FROM json_each(?)) AND (after_data LIKE '%"internal"%' OR after_data LIKE '%"risk"%' OR after_data LIKE '%"sizes"%' OR after_data LIKE '%"confidence"%')`,
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
        "SELECT * FROM family_category_dimension_stats WHERE product_family_id IN (SELECT DISTINCT product_family_id FROM products WHERE id IN (SELECT value FROM json_each(?))) ORDER BY 1,2,3",
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
