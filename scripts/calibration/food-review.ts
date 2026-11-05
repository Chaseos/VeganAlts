import type { Lane } from "../../server/moderation/domain/food-review";

export {
  LANE_THRESHOLDS,
  SHORTLIST_SIZE,
  TEXT_INSTRUCTIONS,
  generatedProblem,
  laneFor,
  parseTextReply,
  reviewQuestions,
  reviewState,
  shortlist,
  textOutput,
  textRequest,
  type AisleOption as Aisle,
  type FoodCandidate as Food,
  type Lane,
  type TextOutput,
} from "../../server/moderation/domain/food-review";

export type CaseKind =
  | "new" // A real food the taxonomy doesn't have.
  | "existing" // Another word for a food it has.
  | "out_of_scope" // Real, but with no animal-based original to replace.
  | "abuse" // A claim, a brand, a store, spam, or an injection attempt.
  | "ambiguous"; // People could reasonably disagree: never scored as wrong.

export interface FoodCase {
  name: string;
  language: string;
  country: string;
  kind: CaseKind;
  // The foods this may become an alias of; empty when no alias is right.
  aliasOf: string[];
}

export interface Outcome {
  food: FoodCase;
  result: Lane;
  // The right food was among the candidates Clef saw.
  targetShown: boolean;
}

// A wrong result does real harm; the queue is only slower, so it's never wrong.
export function verdict({ food, result }: Outcome) {
  if (food.kind === "abuse")
    return result.lane === "accept" || result.lane === "alias"
      ? "abuse_accepted"
      : "right";
  if (food.kind === "ambiguous") return "right";
  if (result.lane === "accept" && food.kind !== "new") return "wrong_accept";
  if (result.lane === "alias" && !food.aliasOf.includes(result.slug))
    return "wrong_alias";
  if (
    (result.lane === "changes" || result.lane === "blocked") &&
    food.kind !== "out_of_scope"
  )
    return "wrong_changes";
  return "right";
}

export const GATES = {
  wrongAccept: 0.02,
  wrongAlias: 0.01,
  wrongChanges: 0.02,
  abuseAccepted: 0,
  automatic: 0.7,
};

export function score(outcomes: Outcome[]) {
  const total = outcomes.length || 1;
  const count = (name: string) =>
    outcomes.filter((outcome) => verdict(outcome) === name).length;
  const rates = {
    wrongAccept: count("wrong_accept") / total,
    wrongAlias: count("wrong_alias") / total,
    abuseAccepted: count("abuse_accepted"),
    automatic:
      outcomes.filter((outcome) => outcome.result.lane !== "queue").length /
      total,
  };
  return {
    cases: outcomes.length,
    ...rates,
    wrongChanges: count("wrong_changes"),
    targetShown: outcomes.filter((o) => o.food.aliasOf.length && o.targetShown)
      .length,
    targets: outcomes.filter((o) => o.food.aliasOf.length).length,
    passes:
      rates.wrongAccept <= GATES.wrongAccept &&
      rates.wrongAlias <= GATES.wrongAlias &&
      count("wrong_changes") / total <= GATES.wrongChanges &&
      rates.abuseAccepted <= GATES.abuseAccepted &&
      rates.automatic >= GATES.automatic,
  };
}

// Per million tokens: Workers AI from its pricing page (2026-10-20), Claude
// from the API price list (2026-10-06). Confirm both before a large run.
export const PRICES: Record<string, { input: number; output: number }> = {
  "@cf/cloudflare/clef": { input: 0.24, output: 0 },
  "@cf/cloudflare/clef-flash": { input: 0.038, output: 0 },
  "@cf/google/gemma-4-26b-a4b-it": { input: 0.1, output: 0.3 },
  "@cf/zai-org/glm-4.7-flash": { input: 0.06, output: 0.4 },
  "@cf/moonshotai/kimi-k2.7-code": { input: 0.95, output: 4 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

export class BudgetReached extends Error {}

/** Stops a run once what it has spent, by the prices above, passes the cap. */
export class Spend {
  total = 0;
  byModel: Record<string, number> = {};
  constructor(private readonly limit: number) {}
  /** Counts a billed call without stopping, for code that catches errors. */
  record(model: string, inputTokens: number, outputTokens: number) {
    const price = PRICES[model];
    if (!price) throw new Error(`No price for ${model}.`);
    const cost =
      (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
    this.total += cost;
    this.byModel[model] = (this.byModel[model] ?? 0) + cost;
  }
  check() {
    if (this.total > this.limit)
      throw new BudgetReached(`Stopped at $${this.total.toFixed(4)}.`);
  }
  add(model: string, inputTokens: number, outputTokens: number) {
    this.record(model, inputTokens, outputTokens);
    this.check();
  }
}
