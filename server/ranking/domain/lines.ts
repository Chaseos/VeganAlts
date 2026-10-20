import { scoreAggregate, type Scoring } from "./policy";

// The reference definition of a recipe line's standing in one food
// (milestone 7). The SQL refresh in `ranking/infrastructure/line-refresh.ts`
// persists the same figures; tests hold the two equal.

export interface LineFlavor {
  productId: string;
  // Current formula, active, not under review and ranking-eligible in the
  // food. Food and country state are applied when the line is read.
  eligible: boolean;
  publishedAt: number | null;
}
export interface LineRating {
  productId: string;
  userId: string;
  similarity: number | null;
  enjoyment: number | null;
  counted: boolean;
  createdAt: number;
  // Detail answers by dimension id.
  answers?: Record<string, number>;
}
export interface LineDimension {
  dimensionId: string;
  peopleCount: number;
  meanSum: number;
}
export interface LineAggregate {
  peopleCount: number;
  meanSum: number;
  rawAverage: number | null;
  bayesianScore: number | null;
  enjoymentPeople: number;
  enjoymentMeanSum: number;
  enjoymentAverage: number | null;
  enjoymentScore: number | null;
  triedCount: number;
  recentCount: number;
  leadProductId: string;
  dimensions: LineDimension[];
}

export const RECENT_WINDOW_MS = 7 * 86400_000;

const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

// Bayesian score over people: (sum of means + C·m) / (people + m).
export function scorePeople(
  meanSum: number,
  people: number,
  parameters: Scoring["closest"],
) {
  return people === 0
    ? null
    : (meanSum + parameters.priorMean * parameters.priorStrength) /
        (people + parameters.priorStrength);
}

/**
 * One vote per person: each person's ratings of the line's eligible flavors
 * in the food are averaged, and the line is scored over people. A line with
 * no eligible flavor has no standing (null).
 */
export function aggregateLine(
  flavors: readonly LineFlavor[],
  ratings: readonly LineRating[],
  trials: readonly { productId: string; userId: string }[],
  scoring: Scoring,
  now: number,
): LineAggregate | null {
  const eligible = flavors.filter((flavor) => flavor.eligible);
  if (!eligible.length) return null;
  const ids = new Set(eligible.map((flavor) => flavor.productId));
  const counted = ratings.filter(
    (rating) => rating.counted && ids.has(rating.productId),
  );
  const byPerson = new Map<string, LineRating[]>();
  for (const rating of counted)
    byPerson.set(rating.userId, [
      ...(byPerson.get(rating.userId) ?? []),
      rating,
    ]);
  const people = [...byPerson.values()].map((own) => {
    const enjoyed = own.flatMap((rating) =>
      rating.enjoyment === null ? [] : [rating.enjoyment],
    );
    const compared = own.filter((rating) => rating.similarity !== null);
    return {
      similarity: compared.length
        ? mean(compared.map((rating) => rating.similarity!))
        : null,
      enjoyment: enjoyed.length ? mean(enjoyed) : null,
      latest: Math.max(...compared.map((rating) => rating.createdAt)),
    };
  });
  const comparing = people.filter((person) => person.similarity !== null);
  const meanSum = comparing.reduce(
    (sum, person) => sum + person.similarity!,
    0,
  );
  const enjoying = people.flatMap((person) =>
    person.enjoyment === null ? [] : [person.enjoyment],
  );
  const enjoymentMeanSum = enjoying.reduce((sum, value) => sum + value, 0);

  // A person's detail answer is their mean across the flavors they answered.
  const answers = new Map<string, Map<string, number[]>>();
  for (const rating of counted.filter((rating) => rating.similarity !== null))
    for (const [dimensionId, score] of Object.entries(rating.answers ?? {})) {
      const byUser = answers.get(dimensionId) ?? new Map<string, number[]>();
      byUser.set(rating.userId, [...(byUser.get(rating.userId) ?? []), score]);
      answers.set(dimensionId, byUser);
    }
  const dimensions = [...answers.entries()]
    .map(([dimensionId, byUser]) => ({
      dimensionId,
      peopleCount: byUser.size,
      meanSum: [...byUser.values()].reduce(
        (sum, scores) => sum + mean(scores),
        0,
      ),
    }))
    .sort((a, b) => (a.dimensionId < b.dimensionId ? -1 : 1));

  return {
    peopleCount: comparing.length,
    meanSum,
    rawAverage: comparing.length ? meanSum / comparing.length : null,
    bayesianScore: scorePeople(meanSum, comparing.length, scoring.closest),
    enjoymentPeople: enjoying.length,
    enjoymentMeanSum,
    enjoymentAverage: enjoying.length
      ? enjoymentMeanSum / enjoying.length
      : null,
    enjoymentScore: scorePeople(
      enjoymentMeanSum,
      enjoying.length,
      scoring.tastiest,
    ),
    triedCount: new Set(
      trials
        .filter((trial) => ids.has(trial.productId))
        .map((trial) => trial.userId),
    ).size,
    recentCount: comparing.filter(
      (person) => person.latest >= now - RECENT_WINDOW_MS,
    ).length,
    leadProductId: leadFlavor(eligible, counted, scoring).productId,
    dimensions,
  };
}

/**
 * The flavor that represents the line (its card photo and link): the most
 * counted ratings answering either question, then its own Closest score,
 * then the earliest published and product ID.
 */
export function leadFlavor(
  eligible: readonly LineFlavor[],
  counted: readonly LineRating[],
  scoring: Scoring,
) {
  const ranked = eligible.map((flavor) => {
    const own = counted.filter(
      (rating) => rating.productId === flavor.productId,
    );
    const compared = own.filter((rating) => rating.similarity !== null);
    const sum = compared.reduce(
      (total, rating) => total + rating.similarity!,
      0,
    );
    return {
      flavor,
      count: own.length,
      score: scoreAggregate(sum, compared.length, scoring.closest)
        .bayesianScore,
    };
  });
  ranked.sort(
    (a, b) =>
      b.count - a.count ||
      (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
      (a.flavor.publishedAt ?? Infinity) - (b.flavor.publishedAt ?? Infinity) ||
      (a.flavor.productId < b.flavor.productId ? -1 : 1),
  );
  return ranked[0]!.flavor;
}
