import { DETAIL_MIN_ANSWERS } from "../../ranking/domain/display";
import { DIMENSION_KEY } from "../../ratings/domain/details";

// A food's sort menu (docs/RANKING.md, milestone 5). Only "top" is the
// ranking; the others reorder the same products and never change a score.
export type CategoryView =
  "top" | "trending" | "new" | "most-rated" | `detail-${string}`;
export const isDetailView = (view: string): view is `detail-${string}` =>
  view.startsWith("detail-");
export const detailKey = (view: CategoryView) =>
  isDetailView(view) ? view.slice("detail-".length) : null;

/** Syntax only; a detail key must also be an active question of the food. */
export function parseCategoryView(input: string | null): CategoryView | null {
  if (input === null || input === "top") return "top";
  if (input === "trending" || input === "new" || input === "most-rated")
    return input;
  if (isDetailView(input) && DIMENSION_KEY.test(input.slice(7)))
    return input as CategoryView;
  return null;
}

export interface Question {
  id: string;
  key: string;
  label: string;
}
export interface DetailScore {
  key: string;
  label: string;
  // Shown only with enough answers.
  mean: number | null;
  count: number;
}
/** Answers per question id: [count, sum]. */
export type DetailStats = Record<string, [number, number]>;

export function detailScores(
  stats: DetailStats,
  questions: Question[],
): DetailScore[] {
  return questions.map((question) => {
    const [count, sum] = stats[question.id] ?? [0, 0];
    return {
      key: question.key,
      label: question.label,
      mean: count >= DETAIL_MIN_ANSWERS ? sum / count : null,
      count,
    };
  });
}

interface Orderable {
  id: string;
  topRank: number;
  ratingCount: number;
  details: DetailScore[];
}

/**
 * Orders ranked products for a view. A detail sort lists products with
 * enough answers by that mean (ties keep Top order), then the rest in Top
 * order; `qualified` says where the second group starts.
 */
export function orderRows<T extends Orderable>(rows: T[], view: CategoryView) {
  const byTop = (a: T, b: T) => a.topRank - b.topRank;
  if (view === "most-rated")
    return {
      rows: [...rows].sort(
        (a, b) => b.ratingCount - a.ratingCount || byTop(a, b),
      ),
      qualified: rows.length,
    };
  const key = detailKey(view);
  if (!key) return { rows: [...rows].sort(byTop), qualified: rows.length };
  const mean = (row: T) => row.details.find((d) => d.key === key)?.mean ?? null;
  const scored = rows
    .filter((row) => mean(row) !== null)
    .sort((a, b) => mean(b)! - mean(a)! || byTop(a, b));
  const rest = rows.filter((row) => mean(row) === null).sort(byTop);
  return { rows: [...scored, ...rest], qualified: scored.length };
}

/**
 * "Best taste": for each question, the product with the highest mean among
 * those with enough answers, unless it is already the #1. Computed over the
 * unfiltered ranking so a filter never moves a badge.
 */
export function detailBadges<T extends Orderable>(
  rows: T[],
  questions: Question[],
) {
  const badges = new Map<string, string[]>();
  for (const question of questions) {
    let best: { row: T; mean: number } | null = null;
    for (const row of rows) {
      const mean = row.details.find((d) => d.key === question.key)?.mean;
      if (mean === null || mean === undefined) continue;
      if (
        !best ||
        mean > best.mean ||
        (mean === best.mean && row.topRank < best.row.topRank)
      )
        best = { row, mean };
    }
    if (best && best.row.topRank !== 1)
      badges.set(best.row.id, [
        ...(badges.get(best.row.id) ?? []),
        `Best ${question.label.toLowerCase()}`,
      ]);
  }
  return badges;
}
