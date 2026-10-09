import { ApplicationError } from "../../shared/domain/errors";
import type {
  ProductChange,
  ReportInput,
  RetailerInput,
  Actor,
} from "../domain/contracts";
import { normalizeName, type CommunityLimits } from "../domain/policy";
import { replay, type ReceiptWrite } from "./receipts";

export class ContributionRepository {
  constructor(
    private readonly db: D1Database,
    private readonly limits: CommunityLimits,
  ) {}
  replay<T>(receipt: ReceiptWrite) {
    return replay<T>(this.db, receipt);
  }
  private targetQuery(type: ReportInput["targetType"]) {
    const join =
      type === "product"
        ? "products p"
        : type === "product_image"
          ? "product_images t JOIN product_versions v ON v.id=t.product_version_id JOIN products p ON p.id=v.product_id"
          : "comments t JOIN product_versions v ON v.id=t.product_version_id JOIN products p ON p.id=v.product_id";
    const condition =
      type === "product"
        ? "p.id=?"
        : type === "product_image"
          ? "t.id=? AND t.state IN ('accepted','archived')"
          : "t.id=? AND t.moderation_state='visible' AND t.deleted_at IS NULL";
    return `SELECT p.id FROM ${join} JOIN countries c ON c.id=p.country_id WHERE ${condition} AND p.lifecycle_status<>'hidden' AND c.iso2='US' AND c.is_active=1`;
  }
  async target(type: ReportInput["targetType"], id: string) {
    const target = await this.db
      .prepare(this.targetQuery(type))
      .bind(id)
      .first<{ id: string }>();
    if (!target)
      throw new ApplicationError(
        "NOT_FOUND",
        "This content is unavailable.",
        404,
      );
    return target.id;
  }
  async report(
    actor: Actor,
    input: ReportInput,
    id: string,
    receipt: ReceiptWrite,
  ) {
    const select =
      "SELECT id FROM reports WHERE reporter_user_id=? AND target_type=? AND target_id=? AND reason_code=? AND status IN ('open','reviewing')";
    const values = [actor.id, input.targetType, input.targetId, input.reason];
    const guard = "EXISTS(SELECT 1 FROM audit_log WHERE id=?)";
    try {
      const results = await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,before_data,after_data,created_at)
          SELECT ?,?,'report_evidence_added','report',COALESCE((${select}),?),
          (SELECT json_object('note',note,'status',status,'evidence',(SELECT evidence_data FROM report_evidence WHERE report_id=reports.id)) FROM reports WHERE id=(${select})),?,?
          WHERE EXISTS(${this.targetQuery(input.targetType)}) AND EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND account_state='active')`,
          )
          .bind(
            id,
            actor.id,
            ...values,
            id,
            ...values,
            JSON.stringify(input),
            receipt.now,
            input.targetId,
            actor.id,
          ),
        // A repeat report adds its note to the active one instead of replacing
        // the earlier explanation; audit_log keeps each original submission.
        this.db
          .prepare(
            `INSERT INTO reports(id,reporter_user_id,target_type,target_id,reason_code,note,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}
          ON CONFLICT(reporter_user_id,target_type,target_id,reason_code) WHERE status IN ('open','reviewing') DO UPDATE SET note=CASE
            WHEN excluded.note='' OR instr(COALESCE(reports.note,''),excluded.note)>0 THEN reports.note
            WHEN COALESCE(reports.note,'')='' THEN excluded.note
            ELSE substr(reports.note||char(10)||char(10)||excluded.note,1,8000) END,updated_at=excluded.updated_at`,
          )
          .bind(id, ...values, input.note, receipt.now, receipt.now, id),
        this.db
          .prepare(
            `INSERT INTO report_evidence(report_id,evidence_data) SELECT id,? FROM reports WHERE id=(${select}) AND ${guard}
          ON CONFLICT(report_id) DO UPDATE SET evidence_data=(SELECT json_group_array(value) FROM (SELECT DISTINCT value FROM json_each(report_evidence.evidence_data) UNION SELECT value FROM json_each(excluded.evidence_data))),revision=report_evidence.revision+1`,
          )
          .bind(JSON.stringify(input.evidenceUrls), ...values, id),
        this.db
          .prepare(
            `INSERT INTO contribution_receipts(user_id,operation,idempotency_key,input_hash,result_data,created_at) SELECT ?,?,?,?,json_object('id',id),? FROM reports WHERE id=(${select}) AND ${guard}`,
          )
          .bind(
            receipt.userId,
            receipt.operation,
            receipt.key,
            receipt.hash,
            receipt.now,
            ...values,
            id,
          ),
      ]);
      if (!results[0]!.meta.changes)
        throw new ApplicationError(
          "NOT_FOUND",
          "This content is no longer available for reporting.",
          404,
        );
    } catch (error) {
      if (!(await replay(this.db, receipt))) throw error;
    }
    return (await replay<{ id: string }>(this.db, receipt))!;
  }
  /** Returns the photo slots attached to the evidence receipt. */
  /** An open proposal of the same photo for the same product slot. */
  duplicatePhoto(productId: string, slot: string, contentHash: string) {
    return this.db
      .prepare(
        `SELECT e.id,e.submitted_by FROM edit_proposals e
        JOIN submission_uploads u ON u.submission_id=json_extract(e.proposed_data,'$.evidenceReceiptId')
        JOIN staged_blobs b ON b.id=u.blob_id
        WHERE e.status='pending' AND e.target_type='product' AND e.target_id=? AND e.change_type='photo'
        AND json_extract(e.proposed_data,'$.slot')=? AND b.content_hash=? LIMIT 1`,
      )
      .bind(productId, slot, contentHash)
      .first<{ id: string; submitted_by: string }>();
  }
  async rankableCategory(categoryId: string) {
    return Boolean(
      await this.db
        .prepare(
          "SELECT 1 FROM categories WHERE id=? AND is_active=1 AND is_rankable=1",
        )
        .bind(categoryId)
        .first(),
    );
  }
  /**
   * One current stance per contributor. Counts are recomputed from the
   * responses in the same batch, so concurrent responses never drift, and the
   * proposal revision advances so any decision drafted before it is stale.
   */
  async respond(
    proposalId: string,
    actor: Actor,
    stance: "confirm" | "disagree" | "evidence",
    note: string,
    urls: string[],
    receipt: ReceiptWrite,
  ) {
    const counted = (value: string) =>
      `(SELECT COUNT(*) FROM edit_proposal_responses r JOIN profiles p ON p.user_id=r.user_id AND p.account_state='active' WHERE r.proposal_id=edit_proposals.id AND r.stance='${value}')`;
    const responded =
      "EXISTS(SELECT 1 FROM edit_proposal_responses WHERE proposal_id=? AND user_id=? AND updated_at=?)";
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO edit_proposal_responses(proposal_id,user_id,stance,note,evidence_data,created_at,updated_at)
          SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM edit_proposals WHERE id=? AND status='pending' AND target_type='product' AND submitted_by<>?)
          AND EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND account_state='active')
          ON CONFLICT(proposal_id,user_id) DO UPDATE SET stance=excluded.stance,note=excluded.note,evidence_data=excluded.evidence_data,updated_at=excluded.updated_at`,
        )
        .bind(
          proposalId,
          actor.id,
          stance,
          note || null,
          JSON.stringify({ urls }),
          receipt.now,
          receipt.now,
          proposalId,
          actor.id,
          actor.id,
        ),
      this.db
        .prepare(
          `UPDATE edit_proposals SET confirm_count=${counted("confirm")},disagree_count=${counted("disagree")},evidence_count=${counted("evidence")},updated_at=max(updated_at+1,?)
          WHERE id=? AND status='pending' AND ${responded}`,
        )
        .bind(receipt.now, proposalId, proposalId, actor.id, receipt.now),
      this.db
        .prepare(
          `INSERT INTO contribution_receipts(user_id,operation,idempotency_key,input_hash,result_data,created_at) SELECT ?,?,?,?,?,? WHERE ${responded}`,
        )
        .bind(
          receipt.userId,
          receipt.operation,
          receipt.key,
          receipt.hash,
          JSON.stringify({ proposalId, stance }),
          receipt.now,
          proposalId,
          actor.id,
          receipt.now,
        ),
    ]);
    if (!results[0]!.meta.changes)
      throw new ApplicationError(
        "PROPOSAL_CLOSED",
        "This proposal is closed, or it is your own proposal.",
        409,
      );
    return { proposalId, stance };
  }
  /** Open proposals on one product with response counts and the viewer's stance. */
  async openProposals(productId: string, viewerId: string) {
    return (
      await this.db
        .prepare(
          `SELECT e.id,e.change_type AS kind,e.risk_tier AS tier,e.proposed_data AS proposedData,e.note,e.created_at AS createdAt,
          e.confirm_count AS confirms,e.disagree_count AS disagrees,e.evidence_count AS evidence,e.submitted_by=? AS own,r.stance
          FROM edit_proposals e LEFT JOIN edit_proposal_responses r ON r.proposal_id=e.id AND r.user_id=?
          WHERE e.target_type='product' AND e.target_id=? AND e.status='pending' ORDER BY e.created_at DESC LIMIT 20`,
        )
        .bind(viewerId, viewerId, productId)
        .all<{
          id: string;
          kind: string;
          tier: number;
          proposedData: string;
          note: string;
          createdAt: number;
          confirms: number;
          disagrees: number;
          evidence: number;
          own: number;
          stance: string | null;
        }>()
    ).results;
  }
  async validateEvidence(actor: Actor, input: ProductChange, now: number) {
    let slots: string[] = [];
    if (input.evidenceReceiptId) {
      const row = await this.db
        .prepare(
          `SELECT id FROM submission_receipts WHERE id=? AND user_id=? AND purpose='evidence' AND planned_product_id=? AND state='staging' AND expires_at>?
        AND EXISTS(SELECT 1 FROM submission_uploads WHERE submission_id=submission_receipts.id)
        AND NOT EXISTS(SELECT 1 FROM submission_uploads u JOIN staged_blobs b ON b.id=u.blob_id WHERE u.submission_id=submission_receipts.id AND b.state<>'complete')`,
        )
        .bind(input.evidenceReceiptId, actor.id, input.productId, now)
        .first();
      if (!row)
        throw new ApplicationError(
          "EVIDENCE_REQUIRED",
          "Finish the evidence uploads for this product before submitting.",
          409,
        );
      slots = (
        await this.db
          .prepare("SELECT slot FROM submission_uploads WHERE submission_id=?")
          .bind(input.evidenceReceiptId)
          .all<{ slot: string }>()
      ).results.map((r) => r.slot);
    }
    for (const imageId of input.evidence.imageIds) {
      const row = await this.db
        .prepare(
          `SELECT i.id FROM product_images i JOIN product_versions v ON v.id=i.product_version_id WHERE i.id=? AND v.product_id=? AND i.state IN ('accepted','archived')
        UNION SELECT image_id AS id FROM submission_uploads WHERE image_id=? AND submission_id=?`,
        )
        .bind(
          imageId,
          input.productId,
          imageId,
          input.evidenceReceiptId ?? null,
        )
        .first();
      if (!row)
        throw new ApplicationError(
          "INVALID_EVIDENCE",
          "Choose evidence belonging to this product.",
        );
    }
    if (input.kind === "packaging" && !input.evidenceReceiptId)
      throw new ApplicationError(
        "EVIDENCE_REQUIRED",
        "Attach the updated packaging photos.",
      );
    return slots;
  }
  async propose(
    actor: Actor,
    input: ProductChange | RetailerInput,
    id: string,
    receipt: ReceiptWrite,
    baseline: unknown = null,
    tier: 1 | 2 | 3 = 2,
  ) {
    const product = "kind" in input;
    let guard = product
      ? "EXISTS(SELECT 1 FROM catalog_revisions r JOIN products p ON p.id=r.product_id WHERE r.product_id=? AND r.revision=? AND p.lifecycle_status<>'hidden')"
      : "1";
    const fence: (string | number)[] = product
      ? [input.productId, input.expectedRevision]
      : [];
    // Recheck evidence ownership inside the batch: concurrent proposals must
    // not both attach the same staged receipt.
    if (product && input.evidenceReceiptId) {
      guard +=
        " AND EXISTS(SELECT 1 FROM submission_receipts WHERE id=? AND user_id=? AND purpose='evidence' AND planned_product_id=? AND state='staging' AND expires_at>?)";
      fence.push(
        input.evidenceReceiptId,
        actor.id,
        input.productId,
        receipt.now,
      );
    }
    const accepted = "EXISTS(SELECT 1 FROM edit_proposals WHERE id=?)";
    const result = { id };
    const statements = [
      this.db
        .prepare(
          `INSERT INTO edit_proposals(id,submitted_by,target_type,target_id,change_type,risk_tier,proposed_data,baseline_data,note,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          id,
          actor.id,
          product ? "product" : "retailer",
          product ? input.productId : id,
          product ? input.kind : "retailer",
          tier,
          JSON.stringify(input),
          baseline === null ? null : JSON.stringify(baseline),
          product ? input.evidence.note : input.note,
          receipt.now,
          receipt.now,
          ...fence,
        ),
    ];
    if (product && input.evidenceReceiptId)
      statements.push(
        this.db
          .prepare(
            `UPDATE submission_receipts SET state='review',expires_at=?,updated_at=? WHERE id=? AND state='staging' AND ${accepted}`,
          )
          .bind(
            receipt.now + this.limits.reviewRetention,
            receipt.now,
            input.evidenceReceiptId,
            id,
          ),
      );
    statements.push(
      this.db
        .prepare(
          `INSERT INTO contribution_receipts(user_id,operation,idempotency_key,input_hash,result_data,created_at) SELECT ?,?,?,?,?,? WHERE ${accepted}`,
        )
        .bind(
          receipt.userId,
          receipt.operation,
          receipt.key,
          receipt.hash,
          JSON.stringify(result),
          receipt.now,
          id,
        ),
    );
    try {
      const results = await this.db.batch(statements);
      if (!results[0]!.meta.changes) {
        if (
          product &&
          input.evidenceReceiptId &&
          !(await this.db
            .prepare(
              "SELECT 1 FROM submission_receipts WHERE id=? AND state='staging'",
            )
            .bind(input.evidenceReceiptId)
            .first())
        )
          throw new ApplicationError(
            "EVIDENCE_CHANGED",
            "These photos are already attached to another proposal or expired. Upload them again for this proposal.",
            409,
          );
        throw new ApplicationError(
          "STALE_PRODUCT",
          "The product changed. Review its current details before proposing this change.",
          409,
        );
      }
    } catch (error) {
      const prior = await replay<{ id: string }>(this.db, receipt);
      if (prior) return prior;
      throw error;
    }
    return result;
  }
  async retailerExists(name: string) {
    return this.db
      .prepare(
        "SELECT id FROM retailers WHERE normalized_name=? OR id IN(SELECT retailer_id FROM retailer_aliases WHERE normalized_name=?)",
      )
      .bind(normalizeName(name), normalizeName(name))
      .first<{ id: string }>();
  }
  async confirm(
    actor: Actor,
    productId: string,
    retailerId: string,
    stance: "confirm" | "not_current",
    receipt: ReceiptWrite,
  ) {
    const valid = await this.db
      .prepare(
        `SELECT p.id,cr.revision FROM products p JOIN catalog_revisions cr ON cr.product_id=p.id JOIN retailer_markets m ON m.country_id=p.country_id JOIN countries c ON c.id=p.country_id
      WHERE p.id=? AND m.retailer_id=? AND m.is_active=1 AND p.lifecycle_status='active' AND c.iso2='US' AND c.is_active=1`,
      )
      .bind(productId, retailerId)
      .first<{ id: string; revision: number }>();
    if (!valid)
      throw new ApplicationError(
        "INVALID_RETAILER",
        "Choose an active retailer in this product's country.",
      );
    const relationship = await this.db
      .prepare(
        "SELECT status FROM product_retailers WHERE product_id=? AND retailer_id=?",
      )
      .bind(productId, retailerId)
      .first<{ status: string }>();
    if (stance === "not_current" && !relationship)
      throw new ApplicationError(
        "INVALID_RETAILER",
        "This product has no relationship with that retailer.",
      );
    const result = { productId, retailerId, stance };
    const guard =
        "EXISTS(SELECT 1 FROM contribution_receipts WHERE user_id=? AND operation=? AND idempotency_key=?)",
      fence = [receipt.userId, receipt.operation, receipt.key];
    try {
      const results = await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO contribution_receipts(user_id,operation,idempotency_key,input_hash,result_data,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM catalog_revisions cr JOIN products p ON p.id=cr.product_id JOIN retailer_markets m ON m.country_id=p.country_id JOIN countries c ON c.id=p.country_id WHERE cr.product_id=? AND cr.revision=? AND p.lifecycle_status='active' AND m.retailer_id=? AND m.is_active=1 AND c.is_active=1) AND EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND account_state='active')`,
          )
          .bind(
            receipt.userId,
            receipt.operation,
            receipt.key,
            receipt.hash,
            JSON.stringify(result),
            receipt.now,
            productId,
            valid.revision,
            retailerId,
            actor.id,
          ),
        this.db
          .prepare(
            `INSERT INTO product_retailers(product_id,retailer_id,created_at,updated_at) SELECT ?,?,?,? WHERE ${guard} ON CONFLICT DO NOTHING`,
          )
          .bind(productId, retailerId, receipt.now, receipt.now, ...fence),
        this.db
          .prepare(
            `INSERT INTO retailer_confirmations(user_id,product_id,retailer_id,stance,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${guard} ON CONFLICT(user_id,product_id,retailer_id) DO UPDATE SET stance=excluded.stance,updated_at=excluded.updated_at`,
          )
          .bind(
            actor.id,
            productId,
            retailerId,
            stance,
            receipt.now,
            receipt.now,
            ...fence,
          ),
        this.db
          .prepare(
            `UPDATE product_retailers SET confirmation_count=(SELECT COUNT(*) FROM retailer_confirmations WHERE product_id=? AND retailer_id=? AND stance='confirm'),disagreement_count=(SELECT COUNT(*) FROM retailer_confirmations WHERE product_id=? AND retailer_id=? AND stance='not_current'),last_confirmed_at=(SELECT MAX(updated_at) FROM retailer_confirmations WHERE product_id=? AND retailer_id=? AND stance='confirm'),updated_at=? WHERE product_id=? AND retailer_id=? AND ${guard}`,
          )
          .bind(
            productId,
            retailerId,
            productId,
            retailerId,
            productId,
            retailerId,
            receipt.now,
            productId,
            retailerId,
            ...fence,
          ),
        // Queue evidence without changing operator-owned availability status.
        this.db
          .prepare(
            `UPDATE edit_proposals SET status='withdrawn',resolution_note='Superseded by this contributor’s latest retailer stance.',resolved_at=?,updated_at=? WHERE submitted_by=? AND target_type='product' AND target_id=? AND change_type='retailer_status' AND status='pending' AND json_extract(proposed_data,'$.retailerId')=? AND ${guard}`,
          )
          .bind(
            receipt.now,
            receipt.now,
            actor.id,
            productId,
            retailerId,
            ...fence,
          ),
        ...(stance === "not_current"
          ? [
              this.db
                .prepare(
                  `INSERT INTO edit_proposals(id,submitted_by,target_type,target_id,change_type,risk_tier,proposed_data,baseline_data,note,created_at,updated_at) SELECT ?,?,'product',?,'retailer_status',2,?,?,?,?,? WHERE ${guard}`,
                )
                .bind(
                  crypto.randomUUID(),
                  actor.id,
                  productId,
                  JSON.stringify({
                    kind: "retailer_status",
                    productId,
                    expectedRevision: valid.revision + 1,
                    retailerId,
                    status: "not_current",
                    evidence: {
                      urls: [],
                      imageIds: [],
                      note: "A contributor reports that this retailer relationship is no longer current. Assess the current confirmations before deciding.",
                    },
                  }),
                  // Matches proposalBaseline: only this relationship's
                  // operator-owned status can make the concern stale. The
                  // revision fence above keeps the read consistent.
                  JSON.stringify({ retailer: relationship?.status ?? null }),
                  "Availability concern from a current contributor stance.",
                  receipt.now,
                  receipt.now,
                  ...fence,
                ),
            ]
          : []),
        // Fresh availability evidence fences a competing operator decision, but
        // does not touch formula scores or the operator-owned relationship status.
        this.db
          .prepare(
            `UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=? AND ${guard}`,
          )
          .bind(productId, ...fence),
      ]);
      if (!results[0]!.meta.changes)
        throw new ApplicationError(
          "STALE_PRODUCT",
          "The product changed. Refresh before confirming availability.",
          409,
        );
    } catch (error) {
      const prior = await replay<typeof result>(this.db, receipt);
      if (prior) return prior;
      throw error;
    }
    return result;
  }
}
