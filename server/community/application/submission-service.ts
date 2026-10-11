import { ApplicationError } from "../../shared/domain/errors";
import type {
  Actor,
  SubmissionIdentity,
  SubmissionInput,
  SubmissionReceipt,
  VeganStatus,
} from "../domain/contracts";
import { submissionInput } from "../domain/contracts";
import {
  active,
  administrator,
  decideSubmission,
  fingerprint,
  onlyUnreadablePhoto,
  provisionalClassification,
  SYSTEM_ACTOR,
} from "../domain/policy";
import { CommunityLookupRepository } from "../infrastructure/lookup-repository";
import { SubmissionRepository } from "../infrastructure/submission-repository";
import { StagedMediaRepository } from "../infrastructure/staged-media-repository";
import type { StagedMediaService } from "./staged-media-service";
import type { ReceiptWrite } from "../infrastructure/receipts";
import type { SubmissionContext } from "../infrastructure/lookup-repository";
import type { ModerationDecisionService } from "../../moderation/application/decision-service";
import { combineDecisions } from "../../moderation/domain/decisions";
import type { RatingOutcome } from "./publication-extras";
import { categoryKey } from "../../taxonomy/domain/taxonomy";

/** The deterministic checks a suggested food passes (the taxonomy module). */
export interface FoodChecks {
  readonly perDay: number;
  check(
    actor: Actor,
    food: { name: string; shelfId: string; country: string; aliases: string[] },
  ): Promise<void>;
}

export class SubmissionService {
  constructor(
    private readonly repository: SubmissionRepository,
    private readonly lookup: CommunityLookupRepository,
    private readonly staged: StagedMediaRepository,
    private readonly media: StagedMediaService,
    private readonly decisions: ModerationDecisionService,
    private readonly newId: () => string,
    private readonly clock = Date.now,
    private readonly foods: FoodChecks | null = null,
    // Applies the contributor's rating and declaration once published, and
    // says what became of the rating.
    private readonly afterPublish:
      ((receiptId: string) => Promise<{ rating: RatingOutcome }>) | null = null,
  ) {}
  /**
   * Why a suggested food can't be added, as a contributor-facing reason, or
   * null when it can (or a follow-up carries an undecided one forward).
   */
  private async foodProblem(actor: Actor, input: SubmissionInput) {
    const food = input.newFood;
    if (!food) return { problem: null, carry: null };
    if (input.followUp) {
      const earlier = await this.repository.pendingFood(
        input.followUp.submissionId,
      );
      if (
        earlier &&
        categoryKey(earlier.name) === categoryKey(food.name) &&
        earlier.shelfId === food.shelfId
      ) {
        if (earlier.status === "pending")
          return { problem: null, carry: earlier.id };
        return {
          problem:
            earlier.status === "rejected"
              ? `The food “${earlier.name}” wasn’t added. Choose an existing food.`
              : `“${earlier.name}” is listed now. Choose it from the foods.`,
          carry: null,
        };
      }
    }
    if (!this.foods)
      throw new ApplicationError(
        "FOOD_SUGGESTIONS_UNAVAILABLE",
        "Suggesting a food is unavailable right now. Choose an existing food.",
        503,
      );
    try {
      await this.foods.check(actor, {
        name: food.name,
        shelfId: food.shelfId,
        country: input.country,
        aliases: food.aliases ?? [],
      });
      return { problem: null, carry: null };
    } catch (error) {
      if (error instanceof ApplicationError)
        return { problem: error.message, carry: null };
      throw error;
    }
  }
  async preflight(actor: Actor, key: string, input: SubmissionInput) {
    active(actor);
    const prior = await this.repository.byKey(actor.id, key);
    if (prior) {
      if (
        prior.purpose !== "submission" ||
        prior.input_hash !== (await fingerprint(input))
      )
        throw new ApplicationError(
          "IDEMPOTENCY_CONFLICT",
          "This request key belongs to different details.",
          409,
        );
      return this.replayPreflight(prior, input);
    }
    if (input.followUp) await this.checkFollowUp(actor, input.followUp);
    const context = await this.lookup.context(input);
    const decision = decideSubmission(
      input,
      await this.lookup.candidates(input, context),
    );
    if (decision.decision === "NEEDS_CHANGES")
      return { ...decision, receiptId: null };
    const food = await this.foodProblem(actor, input);
    if (food.problem)
      return {
        ...decision,
        decision: "NEEDS_CHANGES" as const,
        reasons: [food.problem],
        receiptId: null,
      };
    const receipt = await this.repository.reserve(
      actor.id,
      key,
      await fingerprint(input),
      {
        receiptId: this.newId(),
        productId: this.newId(),
        versionId: this.newId(),
      },
      this.clock(),
    );
    return { ...decision, receiptId: receipt.id, state: receipt.state };
  }
  // A retried key reports the receipt's real outcome, never a blanket READY.
  private async replayPreflight(
    prior: SubmissionReceipt,
    input: SubmissionInput,
  ) {
    const publication = await this.repository.publication(prior);
    if (publication)
      return {
        ...publication,
        reasons: [],
        candidates: [],
        state: prior.state,
      };
    if (prior.state === "review")
      return {
        decision: "NEEDS_REVIEW" as const,
        reasons: await this.repository.reviewReasons(prior.id),
        candidates: [],
        receiptId: prior.id,
        state: prior.state,
      };
    if (prior.state !== "staging" || prior.expires_at <= this.clock())
      throw new ApplicationError(
        "SUBMISSION_CLOSED",
        prior.state === "publishing"
          ? "This submission is already being finalized. Refresh its status shortly."
          : "This submission has closed. Start a new submission.",
        409,
      );
    const context = await this.lookup.context(input);
    const decision = decideSubmission(
      input,
      await this.lookup.candidates(input, context),
    );
    return {
      ...decision,
      receiptId: decision.decision === "NEEDS_CHANGES" ? null : prior.id,
      state: prior.state,
    };
  }
  async checkIdentity(actor: Actor, input: SubmissionIdentity) {
    active(actor);
    return this.lookup.candidates(input, await this.lookup.context(input));
  }
  /**
   * "Is it one of these?" while someone types. Read-only; a name that is
   * only a package size simply has no matches yet.
   */
  async identityMatches(actor: Actor, input: SubmissionIdentity) {
    try {
      return await this.checkIdentity(actor, input);
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        error.code === "INVALID_IDENTITY"
      )
        return [];
      throw error;
    }
  }
  async evidenceReceipt(actor: Actor, key: string, productId: string) {
    active(actor);
    await this.lookup.contributableProduct(productId);
    const receipt = await this.repository.reserve(
      actor.id,
      key,
      await fingerprint({ productId }),
      { receiptId: this.newId(), productId, versionId: this.newId() },
      this.clock(),
      "evidence",
    );
    return { receiptId: receipt.id };
  }
  async revisionSource(actor: Actor, submissionId: string) {
    active(actor);
    const source = await this.repository.followUpSource(submissionId, actor.id);
    if (!source)
      throw new ApplicationError("NOT_FOUND", "Submission not found.", 404);
    if (
      source.state !== "review" ||
      source.expires_at <= this.clock() ||
      source.resolved_at !== null ||
      !source.resolution_note ||
      source.superseded_by
    )
      throw new ApplicationError(
        "SUBMISSION_CHANGED",
        "This submission is no longer awaiting your response. Refresh its status.",
        409,
      );
    return {
      submissionId,
      expectedRevision: source.revision,
      note: source.resolution_note,
      input: submissionInput.parse(JSON.parse(source.proposed_data)),
    };
  }
  private async checkFollowUp(
    actor: Actor,
    followUp: NonNullable<SubmissionInput["followUp"]>,
  ) {
    const source = await this.revisionSource(actor, followUp.submissionId);
    if (source.expectedRevision !== followUp.expectedRevision)
      throw new ApplicationError(
        "SUBMISSION_CHANGED",
        "The operator's request changed. Reopen your contribution before responding.",
        409,
      );
  }
  async finalize(actor: Actor, receiptId: string, input: SubmissionInput) {
    active(actor);
    const receipt = await this.owned(actor, receiptId);
    if (
      receipt.purpose !== "submission" ||
      receipt.input_hash !== (await fingerprint(input))
    )
      throw new ApplicationError(
        "IDEMPOTENCY_CONFLICT",
        "These details differ from the checked submission. Start a fresh check.",
        409,
      );
    const publication = await this.repository.publication(receipt);
    if (publication) return publication;
    if (receipt.state === "review")
      return { decision: "NEEDS_REVIEW" as const, receiptId: receipt.id };
    if (receipt.state === "rejected") {
      const latest = await this.decisions.latest("submission", receipt.id);
      if (latest?.outcome === "BLOCKED")
        return { ...this.blocked(latest.result_data), receiptId };
    }
    if (receipt.state !== "staging" || receipt.expires_at <= this.clock())
      throw new ApplicationError(
        "SUBMISSION_CLOSED",
        "This submission has expired or is already being finalized.",
        409,
      );
    if (input.followUp) await this.checkFollowUp(actor, input.followUp);
    const context = await this.lookup.context(input);
    const decision = decideSubmission(
      input,
      await this.lookup.candidates(input, context),
    );
    if (decision.decision === "NEEDS_CHANGES")
      return { ...decision, receiptId };
    await this.validateImages(receipt, input);
    // A suggested food is checked again (names and allowances move) and
    // assessed on its own before it is held with the product.
    const food = await this.foodProblem(actor, input);
    if (food.problem)
      return {
        ...decision,
        decision: "NEEDS_CHANGES" as const,
        reasons: [food.problem],
        receiptId,
      };
    const proposalId = food.carry ?? `${receipt.id}_food`;
    if (input.newFood && !food.carry) {
      const suggestion = await this.decisions.evaluate({
        kind: "category_proposal",
        subject: { type: "category_proposal", id: proposalId },
        userId: actor.id,
        state: {
          proposal: {
            name: input.newFood.name,
            explanation: input.statusBasis ?? "",
            aliases: input.newFood.aliases ?? [],
            exampleProducts: [`${input.brand} ${input.name}`],
          },
        },
      });
      if (suggestion.outcome === "BLOCKED") {
        await this.repository.block(receipt.id, this.clock());
        return {
          ...decision,
          decision: "BLOCKED" as const,
          reasons: suggestion.reasons,
          receiptId,
        };
      }
      if (suggestion.outcome === "NEEDS_CHANGES")
        return {
          ...decision,
          decision: "NEEDS_CHANGES" as const,
          reasons: suggestion.reasons,
          receiptId,
        };
    }
    // Automated evidence checks run only after every deterministic gate and
    // can only make the decision more restrictive.
    const automated = await this.decisions.evaluate({
      kind: "submission",
      subject: { type: "submission", id: receipt.id },
      userId: actor.id,
      ...(await this.decisionInput(receipt, input, context)),
    });
    // An ingredients photo the check could not read lowers the classification
    // to "Ingredients not checked yet" instead of holding the product.
    const unreadablePhoto = onlyUnreadablePhoto(automated);
    const outcome = combineDecisions(
      decision.decision,
      unreadablePhoto ? "READY" : automated.outcome,
    );
    if (outcome === "BLOCKED") {
      await this.repository.block(receipt.id, this.clock());
      return {
        ...decision,
        decision: outcome,
        reasons: automated.reasons,
        receiptId,
      };
    }
    if (outcome === "NEEDS_CHANGES")
      return {
        ...decision,
        decision: outcome,
        reasons: automated.reasons,
        receiptId,
      };
    if (outcome === "NEEDS_REVIEW") {
      const reasons = [
        ...new Set([
          ...decision.reasons,
          ...(automated.outcome === "NEEDS_REVIEW" ? automated.reasons : []),
        ]),
      ];
      await this.repository.hold(
        receipt,
        input,
        reasons,
        this.clock(),
        this.newId(),
        input.newFood
          ? {
              proposalId,
              create: !food.carry,
              perDay: this.foods?.perDay ?? 0,
            }
          : undefined,
      );
      return { ...decision, decision: outcome, reasons, receiptId };
    }
    return this.publish(actor, receipt, input, {
      ...provisionalClassification(input, { unreadablePhoto }),
      reviewedBy: null,
    });
  }
  async approve(
    actor: Actor,
    receiptId: string,
    rawInput: unknown,
    expectedRevision: number,
    note: string,
    operation?: ReceiptWrite,
    veganStatus?: VeganStatus,
  ) {
    administrator(actor);
    const receipt = await this.repository.get(receiptId);
    if (!receipt)
      throw new ApplicationError("NOT_FOUND", "Submission not found.", 404);
    if (receipt.state !== "review")
      throw new ApplicationError(
        "STALE_DECISION",
        "This submission has already been decided or is being published.",
        409,
      );
    const input = submissionInput.parse(rawInput);
    // The suggested food is decided first; its decision rewrites the details.
    if (input.newFood)
      throw new ApplicationError(
        "FOOD_PENDING",
        `Decide the suggested food “${input.newFood.name}” first. The product continues once it is decided.`,
        409,
      );
    // An operator's chosen classification is reviewed; without one the
    // product publishes with what the contributor's evidence supports, which
    // is "Ingredients not checked yet" when it supports nothing (or only a
    // photo the automated check could not read).
    const classification = veganStatus
      ? { veganStatus, ingredientsChecked: true, reviewedBy: actor.id }
      : {
          ...provisionalClassification(input, {
            unreadablePhoto: onlyUnreadablePhoto(
              await this.decisions.latestCheck("submission", receipt.id),
            ),
          }),
          reviewedBy: null,
        };
    await this.validateImages(receipt, input);
    return this.publish(
      actor,
      receipt,
      input,
      classification,
      expectedRevision,
      note,
      operation,
    );
  }
  /** The deterministic decision for details as they stand now. */
  async recheck(input: SubmissionInput) {
    const context = await this.lookup.context(input);
    return decideSubmission(
      input,
      await this.lookup.candidates(input, context),
    );
  }
  /**
   * Publishes a held submission whose suggested food was accepted and which
   * needs nothing else reviewed, as the audited system account.
   */
  async publishAfterFood(
    receiptId: string,
    input: SubmissionInput,
    revision: number,
    unreadablePhoto: boolean,
  ) {
    const receipt = await this.repository.get(receiptId);
    if (!receipt || receipt.state !== "review") return null;
    await this.validateImages(receipt, input);
    return this.publish(
      SYSTEM_ACTOR,
      receipt,
      input,
      {
        ...provisionalClassification(input, { unreadablePhoto }),
        reviewedBy: null,
      },
      revision,
      "Published after its suggested food was accepted.",
    );
  }
  private async publish(
    actor: Actor,
    receipt: SubmissionReceipt,
    input: SubmissionInput,
    classification: {
      veganStatus: VeganStatus;
      ingredientsChecked: boolean;
      reviewedBy: string | null;
    },
    revision?: number,
    note?: string,
    operation?: ReceiptWrite,
  ) {
    const token = this.newId();
    if (!(await this.repository.claim(receipt, token, this.clock(), revision)))
      throw new ApplicationError(
        "SUBMISSION_CHANGED",
        "This submission changed or is already being finalized. Refresh its status.",
        409,
      );
    try {
      const context = await this.lookup.context(input);
      const candidates = await this.lookup.candidates(input, context);
      if (candidates.some((c) => c.exact))
        throw new ApplicationError(
          "DUPLICATE_PRODUCT",
          "This product already exists. Use the canonical entry.",
          409,
        );
      const images = await this.media.promote(
        receipt.id,
        receipt.planned_product_id,
        receipt.planned_version_id,
        token,
      );
      const published = await this.repository.publish(
        actor,
        receipt,
        input,
        context,
        classification,
        images,
        token,
        this.newId(),
        this.newId(),
        this.clock(),
        note,
        operation,
      );
      // Publication is committed; its extras are retried hourly if this fails.
      const extras = await this.afterPublish?.(receipt.id).catch(() => {
        console.error(JSON.stringify({ event: "publication_extras_failed" }));
        return null;
      });
      // Only a submission with a rating says what became of it; a replayed
      // publication leaves it out.
      return input.rating
        ? { ...published, rating: extras?.rating ?? ("pending" as const) }
        : published;
    } catch (error) {
      await this.repository.release(receipt.id, token, this.clock());
      if (
        error instanceof Error &&
        /UNIQUE constraint failed: product_identity_keys/.test(error.message)
      )
        throw new ApplicationError(
          "DUPLICATE_PRODUCT",
          "Another contributor just published this product. Search for its canonical entry.",
          409,
        );
      throw error;
    }
  }
  private async decisionInput(
    receipt: SubmissionReceipt,
    input: SubmissionInput,
    context: SubmissionContext,
  ) {
    const images = await this.media.decisionImages(receipt.id);
    return {
      state: {
        product: {
          brand: context.brandName,
          name: input.name,
          country: input.country,
          // A suggested food is judged by its name, like the listed ones.
          categories: [
            ...(await this.lookup.categoryNames(input.categoryIds)),
            ...(input.newFood ? [input.newFood.name] : []),
          ],
          manufacturerLabel: input.manufacturerLabel ?? "unknown",
          contributorNote: input.statusBasis ?? "",
        },
        images: images.map((i, index) => ({
          position: index + 1,
          claimedSlot: i.slot,
        })),
      },
      images,
      context: {
        slots: images.map((i) => i.slot),
        // Only an ingredients photo without a source is checked as the
        // product's ingredient evidence.
        ingredientPhotoRequired:
          input.imageSlots.includes("ingredients") && !input.ingredientUrl,
      },
    };
  }
  private blocked(resultData: string | null) {
    const reasons = resultData
      ? (JSON.parse(resultData) as { reasons: string[] }).reasons
      : [];
    return {
      decision: "BLOCKED" as const,
      reasons,
      candidates: [],
    };
  }
  private async validateImages(
    receipt: SubmissionReceipt,
    input: SubmissionInput,
  ) {
    const images = await this.staged.attachments(receipt.id);
    if (
      images.length !== input.imageSlots.length ||
      images.some(
        (i) => i.state !== "complete" || !input.imageSlots.includes(i.slot),
      ) ||
      !images.some((i) => i.slot === "front")
    )
      throw new ApplicationError(
        "EVIDENCE_REQUIRED",
        "Finish uploading the photos before submitting.",
        409,
      );
  }
  private async owned(actor: Actor, id: string) {
    const receipt = await this.repository.get(id);
    if (!receipt || receipt.user_id !== actor.id)
      throw new ApplicationError("NOT_FOUND", "Submission not found.", 404);
    return receipt;
  }
}
