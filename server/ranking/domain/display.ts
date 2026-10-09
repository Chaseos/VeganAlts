// Presentation thresholds shared by every surface (docs/RANKING.md, milestone 5).
// They decide what is shown or how a view is ordered; none of them changes a
// Top score, eligibility or rating weight.
export const EARLY_RATING_THRESHOLD = 10;
export const DETAIL_MIN_ANSWERS = 5;
export const RECENT_EATERS_MIN = 10;
export const RECENT_EATER_BUCKETS = [
  "current_or_week",
  "within_month",
  "within_year",
] as const;
export const HOME_LIST_SIZE = 6;
export const STILL_WAITING_BELOW = 3.5;
export const AISLE_TOP = 3;
export const SUGGEST_LIMIT = 5;

// A ranked product with 1–9 counted ratings carries the Early badge.
export function isEarly(ratingCount: number) {
  return ratingCount > 0 && ratingCount < EARLY_RATING_THRESHOLD;
}
