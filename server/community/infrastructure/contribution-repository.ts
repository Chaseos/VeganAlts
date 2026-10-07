import { ApplicationError } from "../../shared/domain/errors";
import type {
  ProductChange,
  ReportInput,
  RetailerInput,
  Actor,
} from "../domain/contracts";
import { DAY, normalizeName, type CommunityLimits } from "../domain/policy";
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
        this.db
          .prepare(
            `INSERT INTO reports(id,reporter_user_id,target_type,target_id,reason_code,note,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}
          ON CONFLICT(reporter_user_id,target_type,target_id,reason_code) WHERE status IN ('open','reviewing') DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at`,
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
  async validateEvidence(actor: Actor, input: ProductChange, now: number) {
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
  }
  async propose(
    actor: Actor,
    input: ProductChange | RetailerInput,
    id: string,
    receipt: ReceiptWrite,
  ) {
    const product = "kind" in input;
    const guard = product
      ? "EXISTS(SELECT 1 FROM catalog_revisions r JOIN products p ON p.id=r.product_id WHERE r.product_id=? AND r.revision=? AND p.lifecycle_status<>'hidden')"
      : "1";
    const fence = product ? [input.productId, input.expectedRevision] : [];
    const accepted = "EXISTS(SELECT 1 FROM edit_proposals WHERE id=?)";
    const result = { id };
    const statements = [
      this.db
        .prepare(
          `INSERT INTO edit_proposals(id,submitted_by,target_type,target_id,change_type,risk_tier,proposed_data,note,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          id,
          actor.id,
          product ? "product" : "retailer",
          product ? input.productId : id,
          product ? input.kind : "retailer",
          product && input.kind === "classification" ? 3 : 2,
          JSON.stringify(input),
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
            `UPDATE submission_receipts SET state='review',expires_at=?,updated_at=? WHERE id=? AND ${accepted}`,
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
      if (!results[0]!.meta.changes)
        throw new ApplicationError(
          "STALE_PRODUCT",
          "The product changed. Review its current details before proposing this change.",
          409,
        );
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
    if (
      stance === "not_current" &&
      !(await this.db
        .prepare(
          "SELECT product_id FROM product_retailers WHERE product_id=? AND retailer_id=?",
        )
        .bind(productId, retailerId)
        .first())
    )
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
                  `INSERT INTO edit_proposals(id,submitted_by,target_type,target_id,change_type,risk_tier,proposed_data,note,created_at,updated_at) SELECT ?,?,'product',?,'retailer_status',2,?,?,?,? WHERE ${guard}`,
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
  async retailerSummaries(productId: string, now: number) {
    const rows = await this.db
      .prepare(
        `SELECT r.id,r.canonical_name AS name,r.website_url AS websiteUrl,pr.status,pr.confirmation_count AS contributorCount,pr.disagreement_count AS disagreementCount,pr.last_confirmed_at AS lastConfirmedAt,
      (SELECT COUNT(*) FROM retailer_confirmations rc WHERE rc.product_id=pr.product_id AND rc.retailer_id=pr.retailer_id AND rc.stance='confirm' AND rc.updated_at>=?) AS recentContributorCount
      FROM product_retailers pr JOIN retailers r ON r.id=pr.retailer_id WHERE pr.product_id=? ORDER BY pr.status,r.canonical_name`,
      )
      .bind(now - 180 * DAY, productId)
      .all<{
        id: string;
        name: string;
        websiteUrl: string | null;
        status: string;
        contributorCount: number;
        disagreementCount: number;
        lastConfirmedAt: number | null;
        recentContributorCount: number;
      }>();
    return rows.results.map((row) => ({
      ...row,
      stale: !row.lastConfirmedAt || row.lastConfirmedAt < now - 180 * DAY,
    }));
  }
}
