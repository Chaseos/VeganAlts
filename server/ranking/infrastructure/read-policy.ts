// These SQL fragments share the aliases used by the bounded aggregate readers.
// Keep eligibility and full-precision ordering identical across every public read.
export const eligibleProductSql =
  "p.lifecycle_status='active' AND p.vegan_status<>'under_review'";
export const rankedMembershipSql = `JOIN product_categories pc ON pc.product_id=p.id AND pc.category_id=s.category_id AND pc.ranking_eligible=1
  JOIN categories c ON c.id=s.category_id AND c.is_active=1 AND c.is_rankable=1`;
export const rankedSampleSql =
  "s.rating_count>0 AND s.bayesian_score IS NOT NULL";
export const rankingOrderSql =
  "s.bayesian_score DESC,s.rating_count DESC,p.id ASC";
