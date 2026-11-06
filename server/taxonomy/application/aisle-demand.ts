import { z } from "zod";
import type { Actor } from "../../community/domain/contracts";
import { ApplicationError } from "../../shared/domain/errors";
import { ProviderError } from "../../moderation/application/decision-service";
import type {
  DecisionRequest,
  DecisionResult,
} from "../../moderation/application/decision-service";
import type { Answers, Question } from "../../moderation/domain/decisions";
import {
  foodReviewMode,
  generatedProblem,
  type AisleOption,
  type FoodTextProvider,
  type TextOutput,
} from "../../moderation/domain/food-review";
import { categoryKey, categorySlug } from "../domain/taxonomy";

const DAY = 86_400_000;
// MODERATION, Milestone 8 policy.
export const AISLE_ACCOUNT_AGE_MS = DAY;
export const AISLE_EXPIRY_MS = 180 * DAY;
export const AISLE_SENSIBLE = 0.85;
export const LOCAL_AISLES_PER_COUNTRY = 6;
const WEEK = 7 * DAY;

export interface AisleSuggestion {
  foodProposalId: string;
  userId: string;
  countryId: string;
  name: string;
  language: string | null;
  createdAt: number;
}
export interface AisleRow {
  id: string;
  name: string;
  language: string;
  country: string;
  countryId: string;
  userId: string;
}
export interface AisleReview {
  text: TextOutput | null;
  reason: string;
}
type Status = "queued" | "closed";
export interface AisleDemandRepository {
  unlinkedAisleSuggestions(limit: number): Promise<AisleSuggestion[]>;
  linkAisleSuggestion(
    suggestion: AisleSuggestion,
    proposal: { id: string; key: string; status: "gathering" | "closed" },
    now: number,
  ): Promise<unknown>;
  closeIdleAisles(before: number, now: number): Promise<unknown>;
  aislesWithDemand(accountsBefore: number, limit: number): Promise<AisleRow[]>;
  aisleProposal(id: string): Promise<
    | (AisleRow & {
        status: string;
        review: string | null;
      })
    | null
  >;
  aisleOptions(): Promise<AisleOption[]>;
  settleAisle(
    id: string,
    status: Status,
    review: AisleReview | null,
    note: string,
    now: number,
  ): Promise<unknown>;
  localAisleCount(countryId: string): Promise<number>;
  aislesOpenedSince(countryId: string, since: number): Promise<number>;
  aisleFoods(id: string): Promise<string[]>;
  finishAisle(
    id: string,
    categoryId: string,
    countryId: string,
    note: string,
    now: number,
  ): Promise<unknown>;
}

function questions(): Question[] {
  return [
    {
      id: "sensible",
      instructions:
        "Does the suggestion name a kind of product a shop would group together, not an occasion, a brand, a claim or a place?",
      options: {
        YES: "A kind of product shoppers would browse.",
        NO: "An occasion, brand, claim, place or something else.",
        UNCLEAR: "The state does not make this clear.",
      },
    },
    {
      id: "same_aisle",
      instructions:
        "Does the suggestion mean the same as any aisle in the state, including in another language?",
      options: {
        NEW: "Different from every aisle.",
        SAME: "The same as one of the aisles.",
        UNCLEAR: "The state does not make this clear.",
      },
    },
  ];
}
const chance = (answers: Answers | undefined, id: string, option: string) =>
  answers?.[id]?.probabilities[option] ?? 0;

const operatorDecision = z
  .object({
    decision: z.enum(["open", "close"]),
    name: z.string().trim().min(2).max(160).optional(),
    note: z.string().trim().min(8).max(2000),
  })
  .strict();

/**
 * Local aisles (MODERATION, Milestone 8 policy). Foods always sit in an
 * existing aisle, so nothing here holds a food or product: an aisle gathers
 * demand and opens later, moving the foods that asked for it.
 */
export class AisleDemandService {
  constructor(
    private readonly repository: AisleDemandRepository,
    private readonly decisions: {
      evaluate(request: DecisionRequest): Promise<DecisionResult>;
    },
    private readonly textProvider: () => Promise<FoodTextProvider | null>,
    private readonly open: (
      key: string,
      aisle: { name: string; slug: string; country: string },
      foodIds: string[],
      note: string,
      actor?: Actor,
    ) => Promise<string>,
    private readonly modes: string | undefined,
    private readonly newId: () => string,
    private readonly clock = Date.now,
  ) {}
  async sweep(limit = 10) {
    const now = this.clock();
    await this.gather(now);
    await this.repository.closeIdleAisles(now - AISLE_EXPIRY_MS, now);
    let reviewed = 0;
    for (const row of await this.repository.aislesWithDemand(
      now - AISLE_ACCOUNT_AGE_MS,
      limit,
    )) {
      if (foodReviewMode(this.modes, row.country) === "off") continue;
      try {
        if (await this.review(row)) reviewed += 1;
      } catch (error) {
        if (!(error instanceof ProviderError))
          console.error(
            JSON.stringify({ event: "aisle_review_failed", aisle: row.id }),
          );
      }
    }
    return reviewed;
  }
  /** Turns suggestions into demand. A name that's now an aisle closes. */
  private async gather(now: number) {
    const suggestions = await this.repository.unlinkedAisleSuggestions(50);
    if (!suggestions.length) return;
    const taken = new Set(
      (await this.repository.aisleOptions()).map((a) => categoryKey(a.name)),
    );
    for (const suggestion of suggestions) {
      const key = categoryKey(suggestion.name);
      await this.repository.linkAisleSuggestion(
        suggestion,
        {
          id: this.newId(),
          key,
          status: taken.has(key) ? "closed" : "gathering",
        },
        now,
      );
    }
  }
  private async review(row: AisleRow) {
    const now = this.clock();
    const provider = await this.textProvider();
    const text = provider
      ? await provider.describe({
          name: row.name,
          language: row.language,
          country: row.country,
        })
      : null;
    const valid = text !== null && generatedProblem(text) === null;
    const aisles = await this.repository.aisleOptions();
    const result = await this.decisions.evaluate({
      kind: "aisle_review",
      subject: { type: "aisle_proposal", id: row.id },
      userId: row.userId,
      state: {
        suggestion: {
          name: row.name,
          language: row.language,
          country: row.country,
          englishName: text?.englishName ?? null,
        },
        aisles: aisles.map((aisle) => aisle.name),
      },
      questions: questions(),
      safety: {
        text: [row.name, text?.englishName].filter(Boolean).join("\n"),
      },
    });
    if (result.status === "failed" || result.status === "over_budget")
      return false;
    const answers = result.answers ?? undefined;
    const stored = (reason: string): AisleReview => ({
      text: valid ? text : null,
      reason,
    });
    const settle = (status: Status, reason: string) =>
      this.repository.settleAisle(row.id, status, stored(reason), reason, now);
    if (result.outcome === "BLOCKED") await settle("closed", "blocked");
    else if (chance(answers, "sensible", "NO") >= AISLE_SENSIBLE)
      await settle("closed", "not_a_kind_of_product");
    else if (chance(answers, "same_aisle", "SAME") >= AISLE_SENSIBLE)
      await settle("closed", "same_as_an_aisle");
    else if (
      !valid ||
      chance(answers, "sensible", "YES") < AISLE_SENSIBLE ||
      chance(answers, "same_aisle", "NEW") < AISLE_SENSIBLE
    )
      await settle("queued", "uncertain");
    else if (foodReviewMode(this.modes, row.country) !== "auto")
      await settle("queued", "country_is_queue_only");
    else if (await this.overCap(row.countryId, now))
      await settle("queued", "over_cap");
    else
      try {
        await this.openAisle(row, text!, "Opened automatically on demand.");
      } catch {
        // Its name or address may be taken. Nothing waits on it.
        await settle("queued", "could_not_open");
      }
    return true;
  }
  private async overCap(countryId: string, now: number) {
    const [local, recent] = await Promise.all([
      this.repository.localAisleCount(countryId),
      this.repository.aislesOpenedSince(countryId, now - WEEK),
    ]);
    return local >= LOCAL_AISLES_PER_COUNTRY || recent >= 1;
  }
  private async openAisle(
    row: AisleRow,
    text: Pick<TextOutput, "englishName" | "slug">,
    note: string,
    actor?: Actor,
  ) {
    const categoryId = await this.open(
      `aisle-open-${row.id}`,
      {
        name: text.englishName,
        slug: text.slug,
        country: row.country,
      },
      await this.repository.aisleFoods(row.id),
      note,
      actor,
    );
    await this.repository.finishAisle(
      row.id,
      categoryId,
      row.countryId,
      note,
      this.clock(),
    );
    return categoryId;
  }
  /** An operator opens or closes a suggestion, within or beyond the caps. */
  async decide(actor: Actor, id: string, raw: unknown) {
    const input = operatorDecision.parse(raw);
    const row = await this.repository.aisleProposal(id);
    if (!row || !["gathering", "queued"].includes(row.status))
      throw new ApplicationError(
        "STALE_DECISION",
        "This suggestion changed. Refresh before deciding.",
        409,
      );
    if (input.decision === "close") {
      await this.repository.settleAisle(
        id,
        "closed",
        null,
        input.note,
        this.clock(),
      );
      return { status: "closed" };
    }
    const review = row.review ? (JSON.parse(row.review) as AisleReview) : null;
    const name = input.name ?? review?.text?.englishName ?? row.name;
    const slug = categorySlug(name);
    if (!slug)
      throw new ApplicationError(
        "AISLE_NEEDS_ENGLISH_NAME",
        "Give this aisle an English name first.",
      );
    return {
      status: "opened",
      categoryId: await this.openAisle(
        row,
        { englishName: name, slug },
        input.note,
        actor,
      ),
    };
  }
}
