import { counted } from "./counted";
import { formatCount, formatScore, inSentence, productName } from "./format";
import { t } from "../i18n";

// The sentence under a food's title (canvas: Category5). It describes the
// unfiltered ranking so it reads the same for every visitor.
export function categorySummary({
  food,
  rankedCount,
  people,
  best,
  tastiest = false,
}: {
  food: string;
  rankedCount: number;
  // People who rated the food's ranked swaps.
  people: number;
  best: {
    name: string;
    brand?: string | null;
    score: number | null;
    early: boolean;
  } | null;
  // The Tastiest ranking's #1 rather than Closest's.
  tastiest?: boolean;
}) {
  const lower = inSentence(food);
  if (!rankedCount || !best || best.score === null)
    return t(tastiest ? "summary.emptyTastiest" : "summary.empty", {
      food: lower,
    });
  const lead = counted("summary.ranked", rankedCount, {
    food: lower,
    people:
      people === 1
        ? t("summary.onePerson")
        : counted("summary.manyPeople", people),
  });
  const title = productName(best.name, best.brand ?? null);
  const key = tastiest
    ? best.early
      ? "summary.tastiestEarly"
      : "summary.tastiest"
    : best.early
      ? "summary.closestEarly"
      : "summary.closest";
  return t(key, { lead, title, score: formatScore(best.score) });
}
