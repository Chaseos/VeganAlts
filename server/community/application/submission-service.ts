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
  provisionalStatus,
} from "../domain/policy";
import { CommunityLookupRepository } from "../infrastructure/lookup-repository";
import { SubmissionRepository } from "../infrastructure/submission-repository";
import { StagedMediaRepository } from "../infrastructure/staged-media-repository";
import type { StagedMediaService } from "./staged-media-service";
import type { ReceiptWrite } from "../infrastructure/receipts";
import type { SubmissionContext } from "../infrastructure/lookup-repository";
import type { ModerationDecisionService } from "../../moderation/application/decision-service";
import { combineDecisions } from "../../moderation/domain/decisions";

export class SubmissionService {
  constructor(
    private readonly repository: SubmissionRepository,
    private readonly lookup: CommunityLookupRepository,
    private readonly staged: StagedMediaRepository,
    private readonly media: StagedMediaService,
    private readonly decisions: ModerationDecisionService,
    private readonly newId: () => string,
    private readonly clock = Date.now,
  ) {}
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
    // Automated evidence checks run only after every deterministic gate and
    // can only make the decision more restrictive.
    const automated = await this.decisions.evaluate({
      kind: "submission",
      subject: { type: "submission", id: receipt.id },
      userId: actor.id,
      ...(await this.decisionInput(receipt, input, context)),
    });
    const outcome = combineDecisions(decision.decision, automated.outcome);
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
      );
      return { ...decision, decision: outcome, reasons, receiptId };
    }
    // READY implies the contributor evidence supports a provisional status.
    return this.publish(actor, receipt, input, {
      veganStatus: provisionalStatus(input)!,
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
    // Approval is the operator review of an unconfirmed classification; it
    // must never fall back to a provisional status the evidence did not support.
    const status = veganStatus ?? provisionalStatus(input);
    if (!status)
      throw new ApplicationError(
        "CLASSIFICATION_REQUIRED",
        "Choose the reviewed ingredient classification before publishing this submission.",
      );
    await this.validateImages(receipt, input);
    return this.publish(
      actor,
      receipt,
      input,
      { veganStatus: status, reviewedBy: veganStatus ? actor.id : null },
      expectedRevision,
      note,
      operation,
    );
  }
  private async publish(
    actor: Actor,
    receipt: SubmissionReceipt,
    input: SubmissionInput,
    classification: { veganStatus: VeganStatus; reviewedBy: string | null },
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
      return await this.repository.publish(
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
          categories: await this.lookup.categoryNames(input.categoryIds),
          manufacturerLabel: input.manufacturerLabel,
          contributorNote: input.statusBasis,
        },
        images: images.map((i, index) => ({
          position: index + 1,
          claimedSlot: i.slot,
        })),
      },
      images,
      context: {
        slots: images.map((i) => i.slot),
        ingredientPhotoRequired: !input.ingredientUrl,
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
      !images.some((i) => i.slot === "front") ||
      (!input.ingredientUrl && !images.some((i) => i.slot === "ingredients"))
    )
      throw new ApplicationError(
        "EVIDENCE_REQUIRED",
        "Finish the front photo and ingredient evidence uploads before submitting.",
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
