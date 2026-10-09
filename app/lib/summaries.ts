import { formatCount, formatScore, plural } from "./format";

// The sentence under a food's title (canvas: Category5). It describes the
// unfiltered ranking so it reads the same for every visitor.
export function categorySummary({
  food,
  rankedCount,
  ratingCount,
  best,
}: {
  food: string;
  rankedCount: number;
  ratingCount: number;
  best: { name: string; bayesianScore: number | null; early: boolean } | null;
}) {
  const lower = food.toLowerCase();
  if (!rankedCount || !best || best.bayesianScore === null)
    return `No vegan ${lower} swaps are ranked yet. Tried one? Your rating starts the ranking.`;
  const lead = `${plural(rankedCount, `vegan ${lower} swap`)} ranked by ${formatCount(ratingCount)} ${ratingCount === 1 ? "rating" : "ratings"} from people who’ve tried them.`;
  return `${lead} ${best.name} comes closest${best.early ? " so far" : ""}, at ${formatScore(best.bayesianScore)} out of 5.`;
}
