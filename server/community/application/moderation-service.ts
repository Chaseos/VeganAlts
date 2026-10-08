import { ApplicationError } from "../../shared/domain/errors";
import {
  changeInput,
  retailerInput,
  type Actor,
  type ConsolidationInput,
  type ReviewDecision,
  type ReviewKind,
} from "../domain/contracts";
import { administrator, active } from "../domain/policy";
import {
  assertCompensable,
  assertProposalCurrent,
  planProductChange,
  hasCatalogChanges,
  type ProposalBaseline,
} from "../domain/change-policy";
import type { CatalogPatch } from "../domain/moderation";
import {
  ModerationRepository,
  type ActionWrite,
} from "../infrastructure/moderation-repository";
import { CatalogDecisionRepository } from "../infrastructure/catalog-decision-repository";
import { QueueDecisionRepository } from "../infrastructure/queue-decision-repository";
import { DuplicateRepository } from "../infrastructure/duplicate-repository";
import { SubmissionRepository } from "../infrastructure/submission-repository";
import { receiptWrite, type ReceiptWrite } from "../infrastructure/receipts";
import type { StagedAttachment } from "../infrastructure/staged-media-repository";
import type { StagedMediaService } from "./staged-media-service";
import type { SubmissionService } from "./submission-service";

export class ModerationService {
  constructor(
    private readonly repository: ModerationRepository,
    private readonly catalog: CatalogDecisionRepository,
    private readonly queue: QueueDecisionRepository,
    private readonly duplicates: DuplicateRepository,
    private readonly receipts: SubmissionRepository,
    private readonly submissions: SubmissionService,
    private readonly media: StagedMediaService,
    private readonly newId: () => string,
    private readonly clock = Date.now,
  ) {}
  async inbox(actor: Actor, cursor: string | null) {
    administrator(actor);
    return this.repository.inbox(cursor);
  }
  contributions(actor: Actor, cursor: string | null) {
    active(actor);
    return this.repository.contributions(actor.id, cursor);
  }
  detail(actor: Actor, kind: ReviewKind, id: string) {
    active(actor);
    return this.queue.detail(kind, id, actor);
  }
  async product(actor: Actor, productId: string) {
    administrator(actor);
    return {
      product: await this.repository.snapshot(productId),
      actions: await this.repository.actions(productId),
    };
  }
  async decide(
    actor: Actor,
    key: string,
    kind: ReviewKind,
    id: string,
    input: ReviewDecision,
  ) {
    administrator(actor);
    const now = this.clock(),
      receipt = await receiptWrite(
        actor.id,
        `moderate-${kind}`,
        key,
        { id, ...input },
        now,
      );
    const prior = await this.repository.replay<{
      actionId: string;
      productId: string | null;
    }>(receipt);
    if (prior) return prior;
    const action: ActionWrite = {
      id: this.newId(),
      actor,
      kind: `${kind}_${input.decision}`,
      targetId: id,
      productId: null,
      before: {},
      after: {},
      note: input.note,
      now,
    };
    if (
      input.veganStatus &&
      (kind !== "submission" || input.decision !== "accept")
    )
      throw new ApplicationError(
        "INVALID_DECISION",
        "Only an accepted submission takes a reviewed classification.",
      );
    if (kind === "comment")
      return this.decideComment(action, id, input, receipt);
    if (kind === "submission") {
      if (input.effect !== "none")
        throw new ApplicationError(
          "INVALID_DECISION",
          "Submission decisions do not support this effect.",
        );
      const detail = await this.queue.detail(kind, id, actor);
      action.before = { review: detail };
      if (input.decision === "accept")
        return this.submissions.approve(
          actor,
          id,
          detail.proposed,
          input.expectedRevision,
          input.note,
          receipt,
          input.veganStatus,
        );
      if (input.decision !== "reject" && input.decision !== "follow_up")
        throw new ApplicationError(
          "INVALID_DECISION",
          "Choose accept, reject, or request follow-up.",
        );
      return this.queue.submissionDecision(
        action,
        input.expectedRevision,
        input.decision,
        receipt,
      );
    }
    if (kind === "report") {
      const report = await this.repository.report(id);
      if (!report)
        throw new ApplicationError("NOT_FOUND", "Report not found.", 404);
      if (report.revision !== input.expectedRevision)
        throw new ApplicationError(
          "STALE_DECISION",
          "The report has new evidence. Refresh before deciding.",
          409,
        );
      if (!["resolve", "dismiss", "follow_up"].includes(input.decision))
        throw new ApplicationError(
          "INVALID_DECISION",
          "Choose resolve, dismiss, or request follow-up.",
        );
      const productId = await this.queue.reportProduct(report),
        snapshot = productId ? await this.repository.snapshot(productId) : null;
      const before: CatalogPatch = {},
        after: CatalogPatch = {};
      if (input.effect !== "none") {
        if (
          input.decision !== "resolve" ||
          !snapshot ||
          snapshot.lifecycleStatus === "hidden" ||
          input.expectedProductRevision !== snapshot.revision
        )
          throw new ApplicationError(
            "STALE_PRODUCT",
            "Review the current product before applying this change.",
            409,
          );
        if (input.effect === "hide_comment") {
          const comment =
            report.target_type === "comment"
              ? await this.repository.comment(report.target_id)
              : null;
          if (!comment || comment.moderation_state !== "visible")
            throw new ApplicationError(
              "INVALID_DECISION",
              "Select a visible reported comment to hide it.",
            );
          before.commentStates = [{ id: comment.id, state: "visible" }];
          after.commentStates = [{ id: comment.id, state: "hidden" }];
        } else if (input.effect === "under_review") {
          if (
            report.target_type !== "product" ||
            report.reason_code !== "ingredient_concern"
          )
            throw new ApplicationError(
              "INVALID_DECISION",
              "Under Review requires an assessed ingredient concern.",
            );
          before.classification = {
            versionId: snapshot.versionId,
            value: snapshot.classification,
          };
          before.legacyProjection = {
            veganStatus: snapshot.veganStatus,
            manufacturerLabel: snapshot.manufacturerLabel,
          };
          after.classification = {
            versionId: snapshot.versionId,
            value: {
              veganStatus: "under_review",
              manufacturerLabel: snapshot.manufacturerLabel,
              evidence: {
                urls: JSON.parse(report.evidence_data) as string[],
                imageIds: [],
                note: input.note,
              },
              certifications: snapshot.classification?.certifications ?? [],
              reviewedBy: actor.id,
            },
          };
        } else {
          const image = snapshot.images.find((i) => i.id === report.target_id);
          if (report.target_type !== "product_image" || !image)
            throw new ApplicationError(
              "INVALID_DECISION",
              "Select a valid photo report to remove a photo.",
            );
          before.imageStates = [{ id: image.id, state: image.state }];
          after.imageStates = [{ id: image.id, state: "rejected" }];
        }
      }
      action.productId = productId;
      action.before = { ...before, review: report };
      action.after = {
        ...after,
        decision: input.decision,
        effect: input.effect,
      };
      return this.queue.reportDecision(
        action,
        report,
        input.decision as "resolve" | "dismiss" | "follow_up",
        snapshot,
        after,
        receipt,
      );
    }
    const proposal = await this.repository.proposal(id);
    if (!proposal)
      throw new ApplicationError("NOT_FOUND", "Proposal not found.", 404);
    action.before = { review: proposal };
    if (proposal.updated_at !== input.expectedRevision)
      throw new ApplicationError(
        "STALE_DECISION",
        "The proposal changed. Refresh before deciding.",
        409,
      );
    if (input.effect !== "none")
      throw new ApplicationError(
        "INVALID_DECISION",
        "Proposal decisions do not support this effect.",
      );
    if (input.decision !== "accept") {
      if (input.decision !== "reject" && input.decision !== "follow_up")
        throw new ApplicationError(
          "INVALID_DECISION",
          "Choose accept, reject, or request follow-up.",
        );
      return this.queue.proposalDecision(
        action,
        proposal,
        input.decision,
        receipt,
      );
    }
    if (proposal.status !== "pending")
      throw new ApplicationError(
        "STALE_DECISION",
        "This proposal has already been decided.",
        409,
      );
    if (proposal.target_type === "retailer")
      return this.catalog.acceptRetailer(
        { ...action, after: JSON.parse(proposal.proposed_data) as unknown },
        proposal,
        retailerInput.parse(JSON.parse(proposal.proposed_data)),
        receipt,
      );
    const change = changeInput.parse(JSON.parse(proposal.proposed_data)),
      snapshot = await this.repository.snapshot(change.productId);
    // The operator's reviewed product state fences their decision; the
    // contributor's drafting baseline only covers facts the change depends on.
    if (
      input.expectedProductRevision !== undefined &&
      input.expectedProductRevision !== snapshot.revision
    )
      throw new ApplicationError(
        "STALE_PRODUCT",
        "The product changed while you were reviewing. Refresh before deciding.",
        409,
      );
    assertProposalCurrent(
      snapshot,
      change,
      proposal.baseline_data
        ? (JSON.parse(proposal.baseline_data) as ProposalBaseline)
        : null,
    );
    await this.catalog.validateRelationships(snapshot, change);
    const plan = planProductChange(snapshot, change, actor.id, this.newId());
    let images: StagedAttachment[] = [],
      token: string | undefined;
    try {
      if (change.evidenceReceiptId) {
        token = this.newId();
        await this.receipts.claimEvidence(
          change.evidenceReceiptId,
          token,
          this.clock(),
        );
        images = await this.media.promote(
          change.evidenceReceiptId,
          snapshot.id,
          plan.newFormula?.id ?? snapshot.versionId,
          token,
        );
        const old = plan.newFormula
          ? []
          : snapshot.images.filter(
              (i) =>
                i.versionId === snapshot.versionId &&
                i.state === "accepted" &&
                images.some((image) => image.slot === i.slot),
            );
        plan.before.imageStates = [
          ...old.map((i) => ({ id: i.id, state: i.state })),
          ...images.map((i) => ({ id: i.imageId, state: "rejected" })),
        ];
        plan.after.imageStates = [
          ...old.map((i) => ({ id: i.id, state: "archived" })),
          ...images.map((i) => ({ id: i.imageId, state: "accepted" })),
        ];
        if (plan.after.classification?.value)
          plan.after.classification.value.evidence.imageIds = [
            ...new Set([
              ...plan.after.classification.value.evidence.imageIds,
              ...images.map((i) => i.imageId),
            ]),
          ];
      }
      return await this.catalog.acceptProposal(
        {
          ...action,
          now: this.clock(),
          productId: snapshot.id,
          before: { ...plan.before, review: proposal },
          after: plan.after,
        },
        proposal,
        snapshot,
        plan,
        images,
        change.evidenceReceiptId,
        token,
        receipt,
      );
    } catch (error) {
      if (change.evidenceReceiptId && token)
        await this.receipts.release(
          change.evidenceReceiptId,
          token,
          this.clock(),
        );
      throw error;
    }
  }
  async previewConsolidation(
    actor: Actor,
    donorId: string,
    survivorId: string,
  ) {
    administrator(actor);
    return this.duplicates.preview(
      await this.repository.snapshot(donorId),
      await this.repository.snapshot(survivorId),
    );
  }
  async consolidate(actor: Actor, key: string, input: ConsolidationInput) {
    administrator(actor);
    const now = this.clock(),
      receipt = await receiptWrite(actor.id, "consolidation", key, input, now);
    const prior = await this.repository.replay<{
      actionId: string;
      productId: string | null;
    }>(receipt);
    if (prior) return prior;
    const donor = await this.repository.snapshot(input.donorId),
      survivor = await this.repository.snapshot(input.survivorId);
    const before: CatalogPatch = {
        lifecycleStatus: donor.lifecycleStatus,
        consolidation: { survivorId: survivor.id, active: false },
      },
      after: CatalogPatch = {
        lifecycleStatus: "hidden",
        consolidation: { survivorId: survivor.id, active: true },
      };
    return this.duplicates.consolidate(
      {
        id: this.newId(),
        actor,
        kind: "consolidation",
        targetId: donor.id,
        productId: donor.id,
        before,
        after,
        note: input.note,
        now,
      },
      input,
      donor,
      survivor,
      receipt,
    );
  }
  /** Publish or hide a comment held by automated review; reversible. */
  private async decideComment(
    action: ActionWrite,
    id: string,
    input: ReviewDecision,
    receipt: ReceiptWrite,
  ) {
    const comment = await this.repository.comment(id);
    if (!comment || comment.deleted_at)
      throw new ApplicationError("NOT_FOUND", "Comment not found.", 404);
    if (
      comment.moderation_state !== "pending" ||
      comment.updated_at !== input.expectedRevision
    )
      throw new ApplicationError(
        "STALE_DECISION",
        "This comment changed. Refresh before deciding.",
        409,
      );
    if (
      (input.decision !== "accept" && input.decision !== "reject") ||
      input.effect !== "none"
    )
      throw new ApplicationError(
        "INVALID_DECISION",
        "Publish or hide the held comment.",
      );
    const snapshot = await this.repository.snapshot(comment.product_id);
    const after: CatalogPatch = {
      commentStates: [
        { id, state: input.decision === "accept" ? "visible" : "hidden" },
      ],
    };
    action.productId = comment.product_id;
    action.before = { commentStates: [{ id, state: "pending" }] };
    action.after = { ...after, decision: input.decision };
    return this.repository.commit(
      action,
      {
        sql: "EXISTS(SELECT 1 FROM comments WHERE id=? AND moderation_state='pending' AND updated_at=? AND deleted_at IS NULL)",
        values: [id, comment.updated_at],
      },
      (fence) =>
        this.catalog.patchStatements(
          snapshot,
          after,
          action.actor,
          action.now,
          fence,
        ),
      receipt,
    );
  }
  async reverse(
    actor: Actor,
    key: string,
    id: string,
    input: { expectedRevision: number; note: string },
  ) {
    administrator(actor);
    const now = this.clock(),
      receipt = await receiptWrite(
        actor.id,
        "reversal",
        key,
        { id, ...input },
        now,
      );
    const prior = await this.repository.replay<{
      actionId: string;
      productId: string | null;
    }>(receipt);
    if (prior) return prior;
    const original = await this.repository.action(id);
    if (!original?.product_id || original.kind === "reversal")
      throw new ApplicationError(
        "INVALID_REVERSAL",
        "This action has no reversible catalog changes.",
      );
    const snapshot = await this.repository.snapshot(original.product_id);
    if (snapshot.revision !== input.expectedRevision)
      throw new ApplicationError(
        "STALE_PRODUCT",
        "Refresh the current product before reversing this action.",
        409,
      );
    const before = JSON.parse(original.before_data) as CatalogPatch,
      after = JSON.parse(original.after_data) as CatalogPatch;
    if (!hasCatalogChanges(before))
      throw new ApplicationError(
        "INVALID_REVERSAL",
        "This action did not change the catalog.",
      );
    assertCompensable(snapshot, after, before);
    if (after.commentStates?.length) {
      const states = await this.repository.commentStates(
        after.commentStates.map((c) => c.id),
      );
      if (after.commentStates.some((c) => states.get(c.id) !== c.state))
        throw new ApplicationError(
          "REVERSAL_CONFLICT",
          "This comment changed after the decision. Review it before reversing.",
          409,
        );
    }
    return this.duplicates.reverse(
      {
        id: this.newId(),
        actor,
        kind: "reversal",
        targetId: id,
        productId: snapshot.id,
        before: after,
        after: before,
        note: input.note,
        now,
      },
      original,
      snapshot,
      before,
      receipt,
    );
  }
}
