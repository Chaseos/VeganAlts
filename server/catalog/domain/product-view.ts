import {
  RECENT_EATERS_MIN,
  RECENT_EATER_BUCKETS,
} from "../../ranking/domain/display";

// Context on a product page (docs/RANKING.md, milestone 5). It explains a
// score; it never changes it or any rating's weight.
export interface FamiliarityRow {
  recency: string;
  score: number;
  count: number;
}

/**
 * The average similarity from people who ate the original within the past
 * year, once enough of their ratings count.
 */
export function recentEaters(rows: FamiliarityRow[]) {
  const recent = rows.filter((row) =>
    (RECENT_EATER_BUCKETS as readonly string[]).includes(row.recency),
  );
  const count = recent.reduce((sum, row) => sum + row.count, 0);
  if (count < RECENT_EATERS_MIN) return null;
  return {
    count,
    average:
      recent.reduce((sum, row) => sum + row.score * row.count, 0) / count,
  };
}

/** Counted ratings at each overall score, from 5 down to 1. */
export function distribution(rows: FamiliarityRow[]) {
  return [5, 4, 3, 2, 1].map((score) => ({
    score,
    count: rows
      .filter((row) => row.score === score)
      .reduce((sum, row) => sum + row.count, 0),
  }));
}
