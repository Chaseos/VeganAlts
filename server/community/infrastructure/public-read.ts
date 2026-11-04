import type { Classification, PublicVeganStatus } from "../domain/contracts";

// "Ingredients not checked yet" is a flag beside a placeholder status, never a
// stored status (milestone 6). Every public read derives it with these, so an
// unchecked formula never reads as Appears plant-based.
export function publicVeganStatus(
  status: string,
  ingredientsChecked: unknown,
): PublicVeganStatus {
  return ingredientsChecked === 0 ? "unchecked" : (status as PublicVeganStatus);
}
export const publicVeganStatusSql = (product = "p", version = "v") =>
  `CASE WHEN EXISTS(SELECT 1 FROM formula_classifications uf WHERE uf.product_version_id=${version}.id AND uf.ingredients_checked=0) THEN 'unchecked' ELSE ${product}.vegan_status END`;

import type {
  CommunityProductDetails,
  RetailerSummary,
  RelatedProduct,
} from "../domain/public";
const STALE_AFTER = 180 * 86400000;
// Statements for the public product batch; callers append them to their own
// D1 batch so a product page costs one round trip.
export function communityProductStatements(
  db: D1Database,
  productId: string,
  versionId: string,
  now = Date.now(),
) {
  return [
    db
      .prepare(
        "SELECT vegan_status,ingredients_checked,manufacturer_label,evidence_data,certifications,reviewed_by FROM formula_classifications WHERE product_version_id=?",
      )
      .bind(versionId),
    // Only active reports are public: uncertain or no-longer-carried rows stay
    // with moderation and history, never "Commonly found at".
    db
      .prepare(
        `SELECT r.id,r.slug,r.canonical_name AS name,r.website_url AS websiteUrl,pr.status,pr.confirmation_count AS contributorCount,pr.last_confirmed_at AS lastConfirmedAt,
      (SELECT COUNT(*) FROM retailer_confirmations rc WHERE rc.product_id=pr.product_id AND rc.retailer_id=pr.retailer_id AND rc.stance='confirm' AND rc.updated_at>=?) AS recentContributorCount
      FROM product_retailers pr JOIN retailers r ON r.id=pr.retailer_id JOIN products p ON p.id=pr.product_id JOIN retailer_markets m ON m.retailer_id=r.id AND m.country_id=p.country_id AND m.is_active=1 WHERE pr.product_id=? AND pr.status='active' ORDER BY r.canonical_name LIMIT 50`,
      )
      .bind(now - STALE_AFTER, productId),
    db
      .prepare(
        // Explicit links only: the product's own line is listed as its
        // other flavors (milestone 7).
        `SELECT p.id,p.slug,p.name,c.iso2 AS country,MIN(r.relation_type) AS relationship FROM product_relationships r JOIN products p ON p.id=r.to_product_id JOIN countries c ON c.id=p.country_id
        WHERE r.from_product_id=? AND p.lifecycle_status<>'hidden' AND c.is_active=1 AND p.product_family_id<>(SELECT product_family_id FROM products WHERE id=?) GROUP BY p.id ORDER BY c.iso2,p.name LIMIT 30`,
      )
      .bind(productId, productId),
    db
      .prepare("SELECT revision FROM catalog_revisions WHERE product_id=?")
      .bind(productId),
    db
      .prepare(
        "SELECT package_ingredients AS ingredients,package_contains AS contains,package_may_contain AS mayContain,source_image_ids AS sourceImageIds,verification,online_ingredients AS onlineIngredients,online_contains AS onlineContains,online_may_contain AS onlineMayContain,online_url AS onlineUrl,online_accessed_at AS onlineAccessedAt,online_product_match AS onlineProductMatch FROM product_version_ingredient_transcriptions WHERE product_version_id=?",
      )
      .bind(versionId),
  ];
}
export function communityProductDetails(
  [classifications, retailers, related, revisions, transcriptions]: D1Result<
    Record<string, unknown>
  >[],
  now = Date.now(),
): CommunityProductDetails {
  const cutoff = now - STALE_AFTER;
  const f = classifications!.results[0];
  const classification: Classification | null = f
    ? {
        veganStatus: publicVeganStatus(
          String(f.vegan_status),
          f.ingredients_checked,
        ),
        manufacturerLabel:
          f.manufacturer_label as Classification["manufacturerLabel"],
        evidence: JSON.parse(
          String(f.evidence_data),
        ) as Classification["evidence"],
        certifications: JSON.parse(
          String(f.certifications),
        ) as Classification["certifications"],
        reviewed: f.reviewed_by !== null,
      }
    : null;
  return {
    classification,
    ingredientTranscription: transcriptions!.results[0]
      ? {
          ingredients: transcriptions!.results[0].ingredients as string | null,
          contains: transcriptions!.results[0].contains as string | null,
          mayContain: transcriptions!.results[0].mayContain as string | null,
          onlineIngredients: transcriptions!.results[0].onlineIngredients as string | null,
          onlineContains: transcriptions!.results[0].onlineContains as string | null,
          onlineMayContain: transcriptions!.results[0].onlineMayContain as string | null,
          sourceImageIds: JSON.parse(String(transcriptions!.results[0].sourceImageIds)) as string[],
          verification: String(transcriptions!.results[0].verification),
          onlineSource: transcriptions!.results[0].onlineUrl
            ? {
                url: String(transcriptions!.results[0].onlineUrl),
                accessedAt: String(transcriptions!.results[0].onlineAccessedAt),
                productMatch: String(transcriptions!.results[0].onlineProductMatch),
              }
            : null,
        }
      : null,
    retailers: retailers!.results.map((r) => ({
      ...r,
      stale: !r.lastConfirmedAt || Number(r.lastConfirmedAt) < cutoff,
    })) as unknown as RetailerSummary[],
    relatedProducts: related!.results as unknown as RelatedProduct[],
    revision: Number(revisions!.results[0]?.revision ?? 0),
    publicationState: "published",
    canonicalRedirect: null,
  };
}
export function readCanonicalRedirect(
  db: D1Database,
  countryId: string,
  slug: string,
) {
  return db
    .prepare(
      `SELECT survivor.id,survivor.slug FROM products donor JOIN duplicate_consolidations d ON d.donor_id=donor.id AND d.active=1 JOIN products survivor ON survivor.id=d.survivor_id WHERE donor.slug=? AND donor.country_id=? AND survivor.lifecycle_status<>'hidden'`,
    )
    .bind(slug, countryId)
    .first<{ id: string; slug: string }>();
}
