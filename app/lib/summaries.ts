import { formatCount, formatScore, plural, productName } from "./format";

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
  const lower = food.toLowerCase();
  if (!rankedCount || !best || best.score === null)
    return tastiest
      ? `No one has said how tasty these ${lower} swaps are yet. Tried one? Your answer starts the ranking.`
      : `No vegan ${lower} swaps are ranked yet. Tried one? Your rating starts the ranking.`;
  const lead = `${plural(rankedCount, `vegan ${lower} swap`)} ranked by ${people === 1 ? "1 person who’s tried it" : `${plural(people, "person", "people")} who’ve tried them`}.`;
  const title = productName(best.name, best.brand ?? null);
  return tastiest
    ? `${lead} ${title} is the tastiest${best.early ? " so far" : ""}, at ${formatScore(best.score)} out of 5.`
    : `${lead} ${title} comes closest${best.early ? " so far" : ""}, at ${formatScore(best.score)} out of 5.`;
}
