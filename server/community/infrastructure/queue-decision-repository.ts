import { ApplicationError } from "../../shared/domain/errors";
import type { Actor, ReviewKind, SubmissionReceipt } from "../domain/contracts";
import {
  contributorProduct,
  type CatalogPatch,
  type ContributorProduct,
  type ProductSnapshot,
  type ProposalRecord,
} from "../domain/moderation";
import {
  ModerationRepository,
  type ActionWrite,
  type DecisionGuard,
  type ReportRecord,
} from "./moderation-repository";
import { CatalogDecisionRepository } from "./catalog-decision-repository";
import type { ReceiptWrite } from "./receipts";
import { StagedMediaRepository } from "./staged-media-repository";

export class QueueDecisionRepository {
  constructor(
    private readonly repository: ModerationRepository,
    private readonly catalog: CatalogDecisionRepository,
    private readonly staged: StagedMediaRepository,
  ) {}
  private get db() {
    return this.repository.db;
  }
  /** Operator-only view of the latest automated decision for a subject. */
  async automated(
    subjectType:
      "submission" | "edit_proposal" | "comment" | "category_proposal",
    id: string,
    actor: Actor,
  ) {
    if (!actor.administrator) return null;
    const row = await this.db
      .prepare(
        "SELECT status,outcome,provider,model,result_data,error_code,created_at FROM moderation_decisions WHERE subject_type=? AND subject_id=? AND status<>'reserved' ORDER BY created_at DESC, id DESC LIMIT 1",
      )
      .bind(subjectType, id)
      .first<{
        status: string;
        outcome: string | null;
        provider: string;
        model: string;
        result_data: string | null;
        error_code: string | null;
        created_at: number;
      }>();
    if (!row) return null;
    const result = row.result_data
      ? (JSON.parse(row.result_data) as {
          answers: Record<string, { option: string; confidence: number }>;
          flags: string[];
        })
      : null;
    return {
      status: row.status,
      outcome: row.outcome,
      model: row.model,
      errorCode: row.error_code,
      createdAt: row.created_at,
      flags: result?.flags ?? [],
      answers: Object.entries(result?.answers ?? {}).map(([question, a]) => ({
        question,
        option: a.option,
        confidence: a.confidence,
      })),
    };
  }
  async detail(kind: ReviewKind, id: string, actor: Actor) {
    if (kind === "comment") {
      const row = actor.administrator
        ? await this.repository.comment(id)
        : null;
      if (!row)
        throw new ApplicationError("NOT_FOUND", "Comment not found.", 404);
      return {
        kind,
        id,
        status: row.deleted_at ? "deleted" : row.moderation_state,
        revision: row.updated_at,
        proposed: { body: row.body, author: row.handle },
        referenceLabels: {} as Record<string, string>,
        resolutionNote: null,
        evidenceReceiptId: null,
        images: [],
        automated: await this.automated("comment", id, actor),
        product: this.visibleProduct(
          await this.repository.snapshot(row.product_id),
          actor,
        ),
      };
    }
    if (kind === "submission") {
      const row = await this.db
        .prepare(
          "SELECT s.*,p.proposed_data,p.reasons,p.revision,p.resolution_note,p.resolved_at,p.superseded_by,prior.submission_id AS previous_submission_id FROM submission_receipts s LEFT JOIN pending_submissions p ON p.submission_id=s.id LEFT JOIN pending_submissions prior ON prior.superseded_by=s.id WHERE s.id=? AND (s.user_id=? OR ?=1)",
        )
        .bind(id, actor.id, Number(actor.administrator))
        .first<
          SubmissionReceipt & {
            proposed_data: string | null;
            reasons: string | null;
            revision: number | null;
            resolution_note: string | null;
            resolved_at: number | null;
            superseded_by: string | null;
            previous_submission_id: string | null;
          }
        >();
      if (!row)
        throw new ApplicationError("NOT_FOUND", "Submission not found.", 404);
      const proposed: unknown = row.proposed_data
        ? JSON.parse(row.proposed_data)
        : null;
      return {
        kind,
        id,
        status: row.superseded_by ? "superseded" : row.state,
        supersededBy: row.superseded_by,
        followUpOf: row.previous_submission_id,
        canFollowUp:
          row.user_id === actor.id &&
          row.state === "review" &&
          row.resolved_at === null &&
          Boolean(row.resolution_note) &&
          !row.superseded_by &&
          row.expires_at > Date.now(),
        revision: row.revision ?? 0,
        proposed,
        referenceLabels: await this.referenceLabels(proposed, null),
        reasons: row.reasons ? (JSON.parse(row.reasons) as string[]) : [],
        resolutionNote: row.resolution_note,
        evidenceReceiptId: row.id,
        images: await this.privateImages(row.id),
        automated: await this.automated("submission", id, actor),
        productId: row.product_id,
        publishedProduct: row.product_id
          ? await this.db
              .prepare("SELECT slug,name FROM products WHERE id=?")
              .bind(row.product_id)
              .first<{ slug: string; name: string }>()
          : null,
      };
    }
    if (kind === "proposal") {
      const row = await this.repository.proposal(id);
      if (!row || (!actor.administrator && row.submitted_by !== actor.id))
        throw new ApplicationError("NOT_FOUND", "Proposal not found.", 404);
      const proposed = JSON.parse(row.proposed_data) as Record<string, unknown>;
      const evidenceReceiptId =
        typeof proposed.evidenceReceiptId === "string"
          ? proposed.evidenceReceiptId
          : null;
      const product =
        row.target_type === "product"
          ? this.visibleProduct(
              await this.repository.snapshot(row.target_id),
              actor,
            )
          : null;
      return {
        kind,
        id,
        status: row.status,
        revision: row.updated_at,
        proposed,
        referenceLabels: await this.referenceLabels(proposed, product),
        resolutionNote: row.resolution_note,
        evidenceReceiptId,
        images: evidenceReceiptId
          ? await this.privateImages(evidenceReceiptId)
          : [],
        automated: await this.automated("edit_proposal", id, actor),
        product,
      };
    }
    const owner = await this.db
      .prepare("SELECT reporter_user_id FROM reports WHERE id=?")
      .bind(id)
      .first<string>("reporter_user_id");
    const row = await this.repository.report(id);
    if (!row || (!actor.administrator && owner !== actor.id))
      throw new ApplicationError("NOT_FOUND", "Report not found.", 404);
    const productId = await this.reportProduct(row);
    const product = productId
      ? this.visibleProduct(await this.repository.snapshot(productId), actor)
      : null;
    return {
      kind,
      id,
      status: row.status,
      revision: row.revision,
      proposed: {
        targetType: row.target_type,
        targetId: row.target_id,
        reason: row.reason_code,
        note: row.note,
        evidenceUrls: JSON.parse(row.evidence_data) as string[],
      },
      resolutionNote: row.resolution_note,
      product,
      referenceLabels: await this.referenceLabels(null, product),
      // Operators see the reported comment's text to judge it.
      reportedComment:
        actor.administrator && row.target_type === "comment"
          ? await this.repository.comment(row.target_id).then((c) =>
              c
                ? {
                    body: c.body,
                    author: c.handle,
                    state: c.moderation_state,
                  }
                : null,
            )
          : null,
    };
  }
  private visibleProduct(
    snapshot: ProductSnapshot,
    actor: Actor,
  ): ProductSnapshot | ContributorProduct {
    return actor.administrator ? snapshot : contributorProduct(snapshot);
  }
  private async referenceLabels(
    proposed: unknown,
    product: Pick<
      ProductSnapshot,
      "familyId" | "categories" | "relationships"
    > | null,
  ) {
    const input =
      proposed && typeof proposed === "object"
        ? (proposed as Record<string, unknown>)
        : {};
    const ids = [
      product?.familyId,
      ...(product?.categories.map((c) => c.categoryId) ?? []),
      ...(product?.relationships.map((r) => r.productId) ?? []),
      input.productFamilyId,
      input.relatedProductId,
      input.retailerId,
      ...(Array.isArray(input.categoryIds) ? input.categoryIds : []),
      ...(Array.isArray(input.categoryEligibility)
        ? input.categoryEligibility.map((c) => c?.categoryId)
        : []),
    ].filter((value): value is string => typeof value === "string");
    const query = JSON.stringify([...new Set(ids)]);
    const rows = await this.db
      .prepare(
        `SELECT id,name FROM categories WHERE id IN(SELECT value FROM json_each(?))
      UNION ALL SELECT id,canonical_name FROM product_families WHERE id IN(SELECT value FROM json_each(?))
      UNION ALL SELECT id,name FROM products WHERE id IN(SELECT value FROM json_each(?))
      UNION ALL SELECT id,canonical_name FROM retailers WHERE id IN(SELECT value FROM json_each(?))`,
      )
      .bind(query, query, query, query)
      .all<{ id: string; name: string }>();
    return Object.fromEntries(rows.results.map((r) => [r.id, r.name]));
  }
  private async privateImages(receiptId: string) {
    return (await this.staged.attachments(receiptId)).map((i) => ({
      id: i.imageId,
      slot: i.slot,
      state: i.state,
      hasEvidence: i.derivatives.some((d) => d.kind === "evidence"),
    }));
  }
  async reportProduct(report: ReportRecord) {
    if (report.target_type === "product") return report.target_id;
    if (
      report.target_type === "product_image" ||
      report.target_type === "comment"
    )
      return this.db
        .prepare(
          `SELECT v.product_id FROM ${report.target_type === "comment" ? "comments" : "product_images"} t JOIN product_versions v ON v.id=t.product_version_id WHERE t.id=?`,
        )
        .bind(report.target_id)
        .first<string>("product_id");
    return null;
  }
  reportDecision(
    action: ActionWrite,
    report: ReportRecord,
    decision: "resolve" | "dismiss" | "follow_up",
    snapshot: ProductSnapshot | null,
    patch: CatalogPatch,
    receipt: ReceiptWrite,
  ) {
    const guard: DecisionGuard = {
      sql: "EXISTS(SELECT 1 FROM reports r LEFT JOIN report_evidence e ON e.report_id=r.id WHERE r.id=? AND r.status IN ('open','reviewing') AND COALESCE(e.revision,0)=?)",
      values: [report.id, report.revision],
    };
    if (snapshot) {
      guard.sql +=
        " AND EXISTS(SELECT 1 FROM catalog_revisions WHERE product_id=? AND revision=?)";
      guard.values.push(snapshot.id, snapshot.revision);
    }
    return this.repository.commit(
      action,
      guard,
      (fence) => [
        ...(snapshot
          ? this.catalog.patchStatements(
              snapshot,
              patch,
              action.actor,
              action.now,
              fence,
            )
          : []),
        this.db
          .prepare(
            `UPDATE reports SET status=?,resolved_by=?,resolution_note=?,resolved_at=?,updated_at=? WHERE id=? AND ${fence.sql}`,
          )
          .bind(
            decision === "resolve"
              ? "resolved"
              : decision === "dismiss"
                ? "dismissed"
                : "reviewing",
            action.actor.id,
            action.note,
            decision === "follow_up" ? null : action.now,
            action.now,
            report.id,
            ...fence.values,
          ),
        this.db
          .prepare(
            `INSERT INTO report_evidence(report_id,revision) SELECT ?,1 WHERE ${fence.sql} ON CONFLICT(report_id) DO UPDATE SET revision=report_evidence.revision+1`,
          )
          .bind(report.id, ...fence.values),
      ],
      receipt,
    );
  }
  proposalDecision(
    action: ActionWrite,
    proposal: ProposalRecord,
    decision: "reject" | "follow_up",
    receipt: ReceiptWrite,
  ) {
    const guard = {
      sql: "EXISTS(SELECT 1 FROM edit_proposals WHERE id=? AND status='pending' AND updated_at=?)",
      values: [proposal.id, proposal.updated_at],
    };
    return this.repository.commit(
      action,
      guard,
      (fence) => [
        this.db
          .prepare(
            `UPDATE edit_proposals SET status=?,resolved_by=?,resolution_note=?,resolved_at=?,updated_at=? WHERE id=? AND ${fence.sql}`,
          )
          .bind(
            decision === "reject" ? "rejected" : "pending",
            action.actor.id,
            action.note,
            decision === "reject" ? action.now : null,
            Math.max(action.now, proposal.updated_at + 1),
            proposal.id,
            ...fence.values,
          ),
        ...(decision === "reject"
          ? [
              this.db
                .prepare(
                  `UPDATE submission_receipts SET state='rejected',updated_at=? WHERE id=(SELECT json_extract(proposed_data,'$.evidenceReceiptId') FROM edit_proposals WHERE id=?) AND state='review' AND ${fence.sql}`,
                )
                .bind(action.now, proposal.id, ...fence.values),
            ]
          : []),
      ],
      receipt,
    );
  }
  submissionDecision(
    action: ActionWrite,
    revision: number,
    decision: "reject" | "follow_up",
    receipt: ReceiptWrite,
  ) {
    const guard = {
      sql: "EXISTS(SELECT 1 FROM pending_submissions p JOIN submission_receipts s ON s.id=p.submission_id WHERE s.id=? AND s.state='review' AND p.revision=? AND p.resolved_at IS NULL)",
      values: [action.targetId, revision],
    };
    return this.repository.commit(
      action,
      guard,
      (fence) => [
        this.db
          .prepare(
            `UPDATE pending_submissions SET revision=revision+1,resolved_by=?,resolution_note=?,resolved_at=? WHERE submission_id=? AND ${fence.sql}`,
          )
          .bind(
            action.actor.id,
            action.note,
            decision === "reject" ? action.now : null,
            action.targetId,
            ...fence.values,
          ),
        ...(decision === "reject"
          ? [
              this.db
                .prepare(
                  `UPDATE submission_receipts SET state='rejected',updated_at=? WHERE id=? AND ${fence.sql}`,
                )
                .bind(action.now, action.targetId, ...fence.values),
            ]
          : []),
      ],
      receipt,
    );
  }
}
