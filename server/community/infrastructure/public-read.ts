import type { Classification } from "../domain/contracts";

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
        "SELECT vegan_status,manufacturer_label,evidence_data,certifications,reviewed_by FROM formula_classifications WHERE product_version_id=?",
      )
      .bind(versionId),
    db
      .prepare(
        `SELECT r.id,r.slug,r.canonical_name AS name,r.website_url AS websiteUrl,pr.status,pr.confirmation_count AS contributorCount,pr.last_confirmed_at AS lastConfirmedAt,
      (SELECT COUNT(*) FROM retailer_confirmations rc WHERE rc.product_id=pr.product_id AND rc.retailer_id=pr.retailer_id AND rc.stance='confirm' AND rc.updated_at>=?) AS recentContributorCount
      FROM product_retailers pr JOIN retailers r ON r.id=pr.retailer_id JOIN products p ON p.id=pr.product_id JOIN retailer_markets m ON m.retailer_id=r.id AND m.country_id=p.country_id AND m.is_active=1 WHERE pr.product_id=? ORDER BY pr.status,r.canonical_name LIMIT 50`,
      )
      .bind(now - STALE_AFTER, productId),
    db
      .prepare(
        `SELECT p.id,p.slug,p.name,c.iso2 AS country,COALESCE((SELECT relation_type FROM product_relationships WHERE from_product_id=? AND to_product_id=p.id LIMIT 1),'family') AS relationship FROM products p JOIN countries c ON c.id=p.country_id WHERE p.id<>? AND p.lifecycle_status<>'hidden' AND c.is_active=1 AND (p.id IN(SELECT to_product_id FROM product_relationships WHERE from_product_id=?) OR (p.product_family_id IS NOT NULL AND p.product_family_id=(SELECT product_family_id FROM products WHERE id=?))) ORDER BY c.iso2,p.name LIMIT 30`,
      )
      .bind(productId, productId, productId, productId),
    db
      .prepare("SELECT revision FROM catalog_revisions WHERE product_id=?")
      .bind(productId),
  ];
}
export function communityProductDetails(
  [classifications, retailers, related, revisions]: D1Result<
    Record<string, unknown>
  >[],
  now = Date.now(),
): CommunityProductDetails {
  const cutoff = now - STALE_AFTER;
  const f = classifications!.results[0];
  const classification: Classification | null = f
    ? {
        veganStatus: f.vegan_status as Classification["veganStatus"],
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
