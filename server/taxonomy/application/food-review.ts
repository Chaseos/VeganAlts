import { ProviderError } from "../../moderation/application/decision-service";
import type {
  DecisionRequest,
  DecisionResult,
} from "../../moderation/application/decision-service";
import {
  AUTO_ACCEPTS_PER_DAY,
  REVIEW_DEADLINE_MS,
  foodReviewMode,
  generatedProblem,
  hasClaimWord,
  laneFor,
  leansAccept,
  reviewQuestions,
  reviewState,
  shortlist,
  type AisleOption,
  type FoodCandidate,
  type FoodReview,
  type FoodTextProvider,
  type Lane,
} from "../../moderation/domain/food-review";

export interface ReviewRow {
  id: string;
  name: string;
  proposed: string;
  userId: string;
  country: string;
  createdAt: number;
  review: string | null;
}
export interface FoodReviewRepository {
  proposalsToReview(limit: number): Promise<ReviewRow[]>;
  proposalToReview(id: string): Promise<ReviewRow | null>;
  expiredProposals(before: number, limit: number): Promise<ReviewRow[]>;
  saveReview(id: string, review: FoodReview): Promise<unknown>;
  foodCandidates(): Promise<FoodCandidate[]>;
  aisleOptions(): Promise<AisleOption[]>;
  autoAcceptedSince(country: string, since: number): Promise<number>;
  foodId(slug: string): Promise<string | null>;
}
export interface AutomaticDecision {
  decision: "accept" | "alias" | "reject";
  note: string;
  aliasOf?: string;
}

const DAY = 86_400_000;
const CLAIM_NOTE =
  "A food name can't make a vegan, allergen or health claim. Suggest the plain food name.";

/**
 * Reviews suggested foods (MODERATION, Milestone 8 policy). Nothing here can
 * touch a product or a classification: its only writes are the stored review
 * and a decision on the proposal itself, made as the system account.
 */
export class FoodReviewService {
  constructor(
    private readonly repository: FoodReviewRepository,
    private readonly decisions: {
      evaluate(request: DecisionRequest): Promise<DecisionResult>;
    },
    private readonly textProvider: () => Promise<FoodTextProvider | null>,
    private readonly decide: (
      id: string,
      decision: AutomaticDecision,
    ) => Promise<unknown>,
    private readonly modes: string | undefined,
    private readonly clock = Date.now,
  ) {}
  private mode(country: string) {
    return foodReviewMode(this.modes, country);
  }
  /** Reviews a food as it's suggested. A failure waits for the next sweep. */
  async reviewNow(id: string) {
    try {
      const row = await this.repository.proposalToReview(id);
      if (row && this.mode(row.country) !== "off") await this.review(row);
    } catch (error) {
      if (!(error instanceof ProviderError))
        console.error(
          JSON.stringify({ event: "food_review_failed", proposal: id }),
        );
    }
  }
  /** Reviews waiting proposals. A failed call retries on the next pass. */
  async sweep(limit = 10) {
    let reviewed = 0;
    for (const row of await this.repository.proposalsToReview(limit)) {
      if (this.mode(row.country) === "off") continue;
      try {
        if (await this.review(row)) reviewed += 1;
      } catch (error) {
        if (!(error instanceof ProviderError))
          console.error(
            JSON.stringify({ event: "food_review_failed", proposal: row.id }),
          );
      }
    }
    return reviewed;
  }
  private async review(row: ReviewRow) {
    const proposed = JSON.parse(row.proposed) as { language?: string };
    const food = {
      name: row.name,
      language: proposed.language ?? "en",
      country: row.country,
    };
    if (hasClaimWord(row.name)) {
      const review: FoodReview = {
        text: null,
        lane: "changes",
        aliasOf: null,
        leansAccept: false,
        aisle: null,
        reasons: ["claim_word"],
      };
      await this.repository.saveReview(row.id, review);
      await this.apply(row, review);
      return true;
    }
    const provider = await this.textProvider();
    const text = provider ? await provider.describe(food) : null;
    const valid = text !== null && generatedProblem(text) === null;
    const [foods, aisles] = await Promise.all([
      this.repository.foodCandidates(),
      this.repository.aisleOptions(),
    ]);
    const candidates = shortlist(foods, row.name, text);
    const result = await this.decisions.evaluate({
      kind: "food_review",
      subject: { type: "category_proposal", id: row.id },
      userId: row.userId,
      state: reviewState(food, text, candidates, aisles),
      questions: reviewQuestions(candidates.length, aisles.length),
      // Generated text is published, so it passes the safety check too.
      safety: {
        text: [row.name, text?.englishName, text?.gloss]
          .filter(Boolean)
          .join("\n"),
      },
    });
    if (result.status === "failed" || result.status === "over_budget")
      return false;
    const answers = result.answers;
    const lane: Lane =
      result.outcome === "BLOCKED"
        ? { lane: "blocked" }
        : answers
          ? laneFor(answers, candidates, valid)
          : { lane: "queue" };
    const aisleIndex = answers?.aisle_fit?.option.slice(1);
    const review: FoodReview = {
      text: valid ? text : null,
      lane: lane.lane,
      aliasOf: lane.lane === "alias" ? lane.slug : null,
      leansAccept: valid && !!answers && leansAccept(answers),
      aisle: aisleIndex ? (aisles[Number(aisleIndex) - 1]?.slug ?? null) : null,
      reasons: result.reasons,
    };
    await this.repository.saveReview(row.id, review);
    await this.apply(row, review);
    return true;
  }
  /** Auto mode only: anything uncertain stays with the operator. */
  private async apply(row: ReviewRow, review: FoodReview) {
    if (this.mode(row.country) !== "auto") return;
    if (review.lane === "changes" || review.lane === "blocked")
      await this.decide(row.id, { decision: "reject", note: CLAIM_NOTE });
    else if (review.lane === "alias") {
      const aliasOf = await this.repository.foodId(review.aliasOf!);
      if (aliasOf)
        await this.decide(row.id, {
          decision: "alias",
          aliasOf,
          note: `Added automatically as another name (${review.aliasOf}).`,
        });
    } else if (
      review.lane === "accept" &&
      (await this.repository.autoAcceptedSince(
        row.country,
        this.clock() - DAY,
      )) < AUTO_ACCEPTS_PER_DAY
    )
      await this.decide(row.id, {
        decision: "accept",
        note: "Accepted automatically as a provisional food.",
      });
  }
  /**
   * The deadline: an operator had 72 hours. A food that leaned toward
   * acceptance becomes provisional; the rest are rejected.
   */
  async expire(limit = 20) {
    let decided = 0;
    const before = this.clock() - REVIEW_DEADLINE_MS;
    for (const row of await this.repository.expiredProposals(before, limit)) {
      if (this.mode(row.country) === "off") continue;
      const review = row.review ? (JSON.parse(row.review) as FoodReview) : null;
      const reject = {
        decision: "reject" as const,
        note: "Not accepted: no decision within 72 hours.",
      };
      try {
        if (review?.leansAccept)
          // Its name or address may have been taken since. Nothing waits on
          // that: the food is rejected instead.
          await this.decide(row.id, {
            decision: "accept",
            note: "Accepted provisionally: timed_default after 72 hours in the queue.",
          }).catch(() => this.decide(row.id, reject));
        else await this.decide(row.id, reject);
        decided += 1;
      } catch {
        console.error(
          JSON.stringify({ event: "food_deadline_failed", proposal: row.id }),
        );
      }
    }
    return decided;
  }
}
