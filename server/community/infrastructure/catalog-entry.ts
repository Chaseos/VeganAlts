import {
  categorySearchStatements,
  productSearchStatements,
} from "../../catalog/infrastructure/search-index";
import type { LineRefresh } from "../../ranking/infrastructure/line-refresh";
import type { SubmissionInput, VeganStatus } from "../domain/contracts";
import { normalizeName, slug } from "../domain/policy";
import { retailerConfirmationStatements } from "./contribution-repository";
import type { SubmissionContext } from "./lookup-repository";
import type { StagedAttachment } from "./staged-media-repository";

// A photo a new product publishes with. Staged submission photos also carry
// their blob, which publication marks complete.
export type CatalogImage = Pick<
  StagedAttachment,
  "slot" | "imageId" | "derivatives"
> & { blobId?: string };

/** A new product's facts, as publication writes them to the catalog. */
export interface CatalogEntry {
  productId: string;
  versionId: string;
  // The contributor: author of the product, its formula, food membership,
  // photos and store confirmations.
  userId: string;
  input: SubmissionInput;
  context: SubmissionContext;
  classification: {
    veganStatus: VeganStatus;
    ingredientsChecked: boolean;
    reviewedBy: string | null;
  };
  images: CatalogImage[];
  // Used only when the brand is new.
  newBrandId: string;
  // The formula's change summary.
  changeSummary: string;
}

export const catalogProductSlug = (
  brandName: string,
  name: string,
  productId: string,
) => `${slug(`${brandName} ${name}`)}-${productId.slice(-8)}`;

/**
 * The statements that put a new product in the catalog: its brand when new,
 * its line when it starts one, the product, identity key, formula, foods,
 * classification, photos, stores, search documents and line statistics.
 * Submission publication and the owner's store-photo import share them; each
 * adds its own receipt and audit statements. Every statement carries the
 * caller's guard, so the whole batch writes or none of it does.
 */
export function catalogEntryStatements(
  db: D1Database,
  lines: LineRefresh,
  entry: CatalogEntry,
  guard: string,
  fence: (string | number)[],
  now: number,
) {
  const { productId, versionId, userId, input, context, classification } =
    entry;
  const productSlug = catalogProductSlug(
    context.brandName,
    input.name,
    productId,
  );
  // A product outside a chosen line starts its own, named by the
  // contributor ("Name without the flavor") or after the product.
  const familyId = input.lineId ?? `line-${productId}`;
  const status = classification.veganStatus;
  const statements: D1PreparedStatement[] = [];
  if (!context.brandId)
    statements.push(
      db
        .prepare(
          `INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${guard} ON CONFLICT(normalized_name) DO NOTHING`,
        )
        .bind(
          entry.newBrandId,
          context.brandName,
          normalizeName(context.brandName),
          `${slug(context.brandName)}-${entry.newBrandId.slice(-8)}`,
          now,
          now,
          ...fence,
        ),
    );
  if (!input.lineId)
    statements.push(
      db
        .prepare(
          `INSERT INTO product_families(id,brand_id,country_id,canonical_name,slug,created_at,updated_at)
          SELECT ?,COALESCE(?,(SELECT id FROM brands WHERE normalized_name=?)),?,?,(SELECT lower(iso2) FROM countries WHERE id=?)||'-'||?,?,? WHERE ${guard}`,
        )
        .bind(
          familyId,
          context.brandId,
          normalizeName(context.brandName),
          context.countryId,
          input.lineName ?? input.name,
          context.countryId,
          productSlug,
          now,
          now,
          ...fence,
        ),
    );
  statements.push(
    db
      .prepare(
        `INSERT INTO products(id,country_id,brand_id,product_family_id,name,flavor,seasonal,slug,vegan_status,manufacturer_label,manufacturer_url,created_by,published_at,created_at,updated_at)
        SELECT ?,?,COALESCE(?,(SELECT id FROM brands WHERE normalized_name=?)),?,?,?,COALESCE(?,(SELECT season_start IS NOT NULL FROM categories WHERE id=?),0),?,?,?,?,?,?,?,? WHERE ${guard}`,
      )
      .bind(
        productId,
        context.countryId,
        // A brand matched by name or alias keeps its identity; only a new
        // brand is resolved by the normalized key inserted above.
        context.brandId,
        normalizeName(context.brandName),
        familyId,
        input.name,
        input.flavor ?? null,
        // Unsaid, a product follows its food's season.
        input.seasonal === undefined ? null : Number(input.seasonal),
        input.categoryIds[0] ?? null,
        productSlug,
        status,
        input.manufacturerLabel ?? "unknown",
        input.ingredientUrl ?? null,
        userId,
        now,
        now,
        now,
        ...fence,
      ),
    db
      .prepare(
        `INSERT INTO product_identity_keys(identity_key,product_id) SELECT ?,? WHERE ${guard}`,
      )
      .bind(context.identity, productId, ...fence),
    db
      .prepare(
        `INSERT INTO product_versions(id,product_id,version_label,is_current,change_summary,created_by,created_at,updated_at) SELECT ?,?,'Original formula',1,?,?,?,? WHERE ${guard}`,
      )
      .bind(
        versionId,
        productId,
        entry.changeSummary,
        userId,
        now,
        now,
        ...fence,
      ),
    ...input.categoryIds.map((categoryId) =>
      db
        .prepare(
          `INSERT INTO product_categories(product_id,category_id,ranking_eligible,created_by,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          productId,
          categoryId,
          // Every flavor counts (milestone 7); operators can exclude one.
          1,
          userId,
          now,
          now,
          ...fence,
        ),
    ),
    db
      .prepare(
        `INSERT INTO formula_classifications(product_version_id,vegan_status,manufacturer_label,evidence_data,reviewed_by,ingredients_checked,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
      )
      .bind(
        versionId,
        status,
        input.manufacturerLabel ?? "unknown",
        JSON.stringify({
          urls: input.ingredientUrl ? [input.ingredientUrl] : [],
          imageIds: entry.images
            .filter((i) => i.slot === "ingredients")
            .map((i) => i.imageId),
          // Evidence notes are at least 8 characters; the contributor's
          // note is optional.
          note:
            input.statusBasis && input.statusBasis.length >= 8
              ? input.statusBasis
              : "Added with the product; the contributor left no ingredient note.",
        }),
        classification.reviewedBy,
        classification.ingredientsChecked ? 1 : 0,
        now,
        ...fence,
      ),
    ...imageInsertStatements(
      db,
      versionId,
      userId,
      entry.images,
      now,
      guard,
      fence,
    ),
  );
  // Stores chosen with the product: its contributor's "commonly found at".
  for (const retailerId of input.retailerIds ?? [])
    statements.push(
      ...retailerConfirmationStatements(
        db,
        { userId, productId, retailerId, stance: "confirm", now },
        guard,
        fence,
      ),
    );
  statements.push(
    ...productSearchStatements(db, productId, guard, fence),
    // A food this product switched on in its country becomes searchable.
    ...categorySearchStatements(db, productId, guard, fence),
    // The line the product starts or joins.
    ...lines.statements({ productIds: [productId] }, now),
  );
  return { statements, slug: productSlug };
}

export function imageInsertStatements(
  db: D1Database,
  versionId: string,
  userId: string,
  images: CatalogImage[],
  now: number,
  guard: string,
  fence: (string | number)[],
  replace = false,
) {
  return images.flatMap((image) => {
    const full = image.derivatives.find((d) => d.kind === "full"),
      thumbnail = image.derivatives.find((d) => d.kind === "thumbnail"),
      evidence = image.derivatives.find((d) => d.kind === "evidence");
    if (!full || !thumbnail) throw new Error("Missing derivative.");
    return [
      ...(replace
        ? [
            db
              .prepare(
                `UPDATE product_images SET state='archived',updated_at=? WHERE product_version_id=? AND slot=? AND state='accepted' AND ${guard}`,
              )
              .bind(now, versionId, image.slot, ...fence),
          ]
        : []),
      db
        .prepare(
          `INSERT INTO product_images(id,product_version_id,slot,state,full_r2_key,thumbnail_r2_key,evidence_r2_key,full_width,full_height,evidence_width,evidence_height,submitted_by,created_at,updated_at)
        SELECT ?,?,?,'accepted',?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          image.imageId,
          versionId,
          image.slot,
          full.key,
          thumbnail.key,
          evidence?.key ?? null,
          full.width,
          full.height,
          evidence?.width ?? null,
          evidence?.height ?? null,
          userId,
          now,
          now,
          ...fence,
        ),
      // A staged submission photo's blob is complete once published.
      ...(image.blobId
        ? [
            db
              .prepare(
                `UPDATE staged_blobs SET derivatives=?,state='complete',updated_at=? WHERE id=? AND ${guard}`,
              )
              .bind(
                JSON.stringify(image.derivatives),
                now,
                image.blobId,
                ...fence,
              ),
          ]
        : []),
    ];
  });
}
