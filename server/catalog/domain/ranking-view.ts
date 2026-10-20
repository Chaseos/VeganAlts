import { DETAIL_MIN_ANSWERS } from "../../ranking/domain/display";
import { DIMENSION_KEY } from "../../ratings/domain/details";

// A food's sort menu (docs/RANKING.md, milestones 5 and 7). "top" (Closest
// to the original) and "tastiest" are the two rankings; the others reorder
// the same lines and never change a score.
export type CategoryView =
  "top" | "tastiest" | "trending" | "new" | "most-rated" | `detail-${string}`;
export const isDetailView = (view: string): view is `detail-${string}` =>
  view.startsWith("detail-");
export const detailKey = (view: CategoryView) =>
  isDetailView(view) ? view.slice("detail-".length) : null;

/** Syntax only; a detail key must also be an active question of the food. */
export function parseCategoryView(input: string | null): CategoryView | null {
  if (input === null || input === "top") return "top";
  if (
    input === "tastiest" ||
    input === "trending" ||
    input === "new" ||
    input === "most-rated"
  )
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
  topRank: number | null;
  ratingCount: number;
  tastiestScore: number | null;
  tastiestCount: number;
  details: DetailScore[];
}

/**
 * Orders ranked lines for a view. Tastiest lists lines with a Tastiest score
 * by it, then people, then the lead flavor's ID. A detail sort lists lines
 * with enough answers by that mean (ties keep Top order). Either way the rest
 * follow in Top order; `qualified` says where they start.
 */
export function orderRows<T extends Orderable>(rows: T[], view: CategoryView) {
  const byTop = (a: T, b: T) =>
    (a.topRank ?? Infinity) - (b.topRank ?? Infinity) ||
    a.id.localeCompare(b.id);
  if (view === "tastiest") {
    const scored = rows
      .filter((row) => row.tastiestScore !== null)
      .sort(
        (a, b) =>
          b.tastiestScore! - a.tastiestScore! ||
          b.tastiestCount - a.tastiestCount ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    const rest = rows.filter((row) => row.tastiestScore === null).sort(byTop);
    return { rows: [...scored, ...rest], qualified: scored.length };
  }
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
 * "Closest taste": for each question, the line with the highest mean among
 * those with enough answers, unless it is already the #1. Computed over the
 * unfiltered ranking so a filter never moves a badge. "Closest" keeps it
 * apart from Tastiest (milestone 7).
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
        (mean === best.mean &&
          (row.topRank ?? Infinity) < (best.row.topRank ?? Infinity))
      )
        best = { row, mean };
    }
    if (best && best.row.topRank !== 1)
      badges.set(best.row.id, [
        ...(badges.get(best.row.id) ?? []),
        `Closest ${question.label.toLowerCase()}`,
      ]);
  }
  return badges;
}
