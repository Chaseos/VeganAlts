import {
  HOME_LIST_SIZE,
  STILL_WAITING_BELOW,
  isEarly,
} from "../../ranking/domain/display";
import type { TopProduct } from "./contracts";

// Home lists (docs/RANKING.md, milestone 5). They only choose which foods to
// show; every score shown is the food's Top score.
export interface FoodLeader {
  food: { id: string; slug: string; name: string };
  // The food's #1 in Top order, if anything is ranked yet.
  best: TopProduct | null;
}

/**
 * "Start with these": the foods whose #1 is past Early, closest first. When
 * fewer qualify, homepage features with any #1 fill the list in their order.
 */
export function startWithThese(
  leaders: FoodLeader[],
  featuredIds: string[],
  size = HOME_LIST_SIZE,
) {
  const established = leaders
    .filter((l) => l.best && !isEarly(l.best.ratingCount))
    .sort(
      (a, b) =>
        b.best!.bayesianScore - a.best!.bayesianScore ||
        a.food.name.localeCompare(b.food.name),
    )
    .slice(0, size);
  const chosen = new Set(established.map((l) => l.food.id));
  const fill = featuredIds
    .map((id) => leaders.find((l) => l.food.id === id))
    .filter(
      (l): l is FoodLeader & { best: TopProduct } =>
        !!l?.best && !chosen.has(l.food.id),
    );
  return [...established, ...fill].slice(0, size);
}

/**
 * "Still waiting for a great swap": foods whose best ranked product is below
 * the bar, lowest first, then foods with nothing ranked yet.
 */
export function stillWaiting(leaders: FoodLeader[], size = HOME_LIST_SIZE) {
  const weak = leaders
    .filter((l) => l.best && l.best.bayesianScore < STILL_WAITING_BELOW)
    .sort(
      (a, b) =>
        a.best!.bayesianScore - b.best!.bayesianScore ||
        a.food.name.localeCompare(b.food.name),
    );
  const empty = leaders
    .filter((l) => !l.best)
    .sort((a, b) => a.food.name.localeCompare(b.food.name));
  return [...weak, ...empty].slice(0, size);
}
