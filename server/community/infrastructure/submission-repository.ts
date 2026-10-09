import { ApplicationError } from "../../shared/domain/errors";
import { productSearchStatements } from "../../catalog/infrastructure/search-index";
import type {
  Actor,
  SubmissionInput,
  SubmissionReceipt,
  VeganStatus,
} from "../domain/contracts";
import {
  DAY,
  LEASE,
  normalizeName,
  slug,
  type CommunityLimits,
} from "../domain/policy";
import type { SubmissionContext } from "./lookup-repository";
import type { StagedAttachment } from "./staged-media-repository";
import { receiptStatement, type ReceiptWrite } from "./receipts";

// The single rule for releasing or revoking a publication lease. Held
// submissions and evidence for a still-pending proposal return to review.
// Evidence whose proposal was decided during the lease is closed, never reused.
// An interrupted automatic publication returns to staging.
export const RESTORED_RECEIPT_STATE = `CASE
  WHEN purpose='evidence' THEN CASE WHEN EXISTS(SELECT 1 FROM edit_proposals WHERE status='pending' AND json_extract(proposed_data,'$.evidenceReceiptId')=submission_receipts.id) THEN 'review' ELSE 'rejected' END
  WHEN EXISTS(SELECT 1 FROM pending_submissions WHERE submission_id=submission_receipts.id) THEN 'review'
  ELSE 'staging' END`;
export interface Publication {
  productId: string;
  slug: string;
  receiptId: string;
  decision: "READY";
}
export class SubmissionRepository {
  constructor(
    private readonly db: D1Database,
    private readonly limits: CommunityLimits,
  ) {}
  get(id: string) {
    return this.db
      .prepare("SELECT * FROM submission_receipts WHERE id=?")
      .bind(id)
      .first<SubmissionReceipt>();
  }
  byKey(userId: string, key: string) {
    return this.db
      .prepare(
        "SELECT * FROM submission_receipts WHERE user_id=? AND idempotency_key=?",
      )
      .bind(userId, key)
      .first<SubmissionReceipt>();
  }
  followUpSource(id: string, userId: string) {
    return this.db
      .prepare(
        `SELECT s.state,s.expires_at,p.* FROM submission_receipts s
      JOIN pending_submissions p ON p.submission_id=s.id WHERE s.id=? AND s.user_id=?`,
      )
      .bind(id, userId)
      .first<{
        state: SubmissionReceipt["state"];
        expires_at: number;
        proposed_data: string;
        revision: number;
        resolution_note: string | null;
        resolved_at: number | null;
        superseded_by: string | null;
      }>();
  }
  async reviewReasons(id: string) {
    const row = await this.db
      .prepare("SELECT reasons FROM pending_submissions WHERE submission_id=?")
      .bind(id)
      .first<{ reasons: string }>();
    return row ? (JSON.parse(row.reasons) as string[]) : [];
  }
  async reserve(
    userId: string,
    key: string,
    hash: string,
    ids: { receiptId: string; productId: string; versionId: string },
    now: number,
    purpose: "submission" | "evidence" = "submission",
  ) {
    await this.db
      .prepare(
        `INSERT INTO submission_receipts(id,user_id,idempotency_key,input_hash,purpose,planned_product_id,planned_version_id,created_at,updated_at,expires_at)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM submission_receipts WHERE user_id=? AND purpose=? AND created_at>=?) < ?
      ON CONFLICT(user_id,idempotency_key) DO NOTHING`,
      )
      .bind(
        ids.receiptId,
        userId,
        key,
        hash,
        purpose,
        ids.productId,
        ids.versionId,
        now,
        now,
        now + this.limits.stagingRetention,
        userId,
        purpose,
        Math.floor(now / DAY) * DAY,
        purpose === "evidence"
          ? this.limits.evidencePerDay
          : this.limits.submissionsPerDay,
      )
      .run();
    const receipt = await this.db
      .prepare(
        "SELECT * FROM submission_receipts WHERE user_id=? AND idempotency_key=?",
      )
      .bind(userId, key)
      .first<SubmissionReceipt>();
    if (!receipt)
      throw new ApplicationError(
        "SUBMISSION_LIMIT",
        purpose === "evidence"
          ? "Today's evidence upload allowance is exhausted. Please try again tomorrow."
          : "Today's submission allowance is exhausted. Please try again tomorrow.",
        429,
      );
    if (receipt.input_hash !== hash || receipt.purpose !== purpose)
      throw new ApplicationError(
        "IDEMPOTENCY_CONFLICT",
        "This request key was used for different details. Start a new submission.",
        409,
      );
    return receipt;
  }
  async hold(
    receipt: SubmissionReceipt,
    input: SubmissionInput,
    reasons: string[],
    now: number,
    token: string,
  ) {
    // The new receipt becomes reviewable only if the original request still
    // awaits this contributor. The same fence closes it and records the link.
    const fence =
      "EXISTS(SELECT 1 FROM submission_receipts WHERE id=? AND state='review' AND active_token=?)";
    const guard = [receipt.id, token];
    const statements = [
      this.db
        .prepare(
          `UPDATE submission_receipts SET state='review',active_token=?,updated_at=?,expires_at=? WHERE id=? AND state='staging' AND expires_at>?
          AND EXISTS(SELECT 1 FROM profiles WHERE user_id=submission_receipts.user_id AND account_state='active')
          ${
            input.followUp
              ? `AND EXISTS(SELECT 1 FROM submission_receipts s JOIN pending_submissions p ON p.submission_id=s.id
            WHERE s.id=? AND s.user_id=? AND s.state='review' AND s.expires_at>? AND p.revision=?
            AND p.resolved_at IS NULL AND p.resolution_note IS NOT NULL AND p.superseded_by IS NULL)`
              : ""
          }`,
        )
        .bind(
          token,
          now,
          now + this.limits.reviewRetention,
          receipt.id,
          now,
          ...(input.followUp
            ? [
                input.followUp.submissionId,
                receipt.user_id,
                now,
                input.followUp.expectedRevision,
              ]
            : []),
        ),
      this.db
        .prepare(
          `INSERT INTO pending_submissions(submission_id,proposed_data,reasons) SELECT ?,?,? WHERE ${fence} ON CONFLICT DO NOTHING`,
        )
        .bind(
          receipt.id,
          JSON.stringify(input),
          JSON.stringify(reasons),
          ...guard,
        ),
    ];
    if (input.followUp)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,before_data,after_data,created_at)
        SELECT ?,?,'submission_amended','submission',submission_id,
          json_object('proposed',json(proposed_data),'revision',revision,'resolutionNote',resolution_note),?,?
        FROM pending_submissions WHERE submission_id=? AND ${fence}`,
          )
          .bind(
            token,
            receipt.user_id,
            JSON.stringify({ supersededBy: receipt.id, proposed: input }),
            now,
            input.followUp.submissionId,
            ...guard,
          ),
        this.db
          .prepare(
            `UPDATE pending_submissions SET revision=revision+1,superseded_by=?,resolved_at=?
        WHERE submission_id=? AND ${fence}`,
          )
          .bind(receipt.id, now, input.followUp.submissionId, ...guard),
        this.db
          .prepare(
            `UPDATE submission_receipts SET updated_at=? WHERE id=? AND ${fence}`,
          )
          .bind(now, input.followUp.submissionId, ...guard),
      );
    statements.push(
      this.db
        .prepare(
          `UPDATE submission_receipts SET active_token=NULL WHERE id=? AND active_token=?`,
        )
        .bind(...guard),
    );
    const results = await this.db.batch(statements);
    if (
      !results[0]!.meta.changes &&
      (await this.get(receipt.id))?.state !== "review"
    )
      throw new ApplicationError(
        "SUBMISSION_CHANGED",
        "This submission changed. Refresh its status.",
        409,
      );
  }
  async claim(
    receipt: SubmissionReceipt,
    token: string,
    now: number,
    reviewRevision?: number,
  ) {
    const from = reviewRevision === undefined ? "staging" : "review";
    const result = await this.db
      .prepare(
        `UPDATE submission_receipts SET state='publishing',active_token=?,lease_expires_at=?,updated_at=?
      WHERE id=? AND state=? AND expires_at>? AND EXISTS(SELECT 1 FROM profiles WHERE user_id=submission_receipts.user_id AND account_state='active')
      ${reviewRevision === undefined ? "" : "AND EXISTS(SELECT 1 FROM pending_submissions WHERE submission_id=submission_receipts.id AND revision=? AND resolved_at IS NULL)"}`,
      )
      .bind(
        token,
        now + LEASE,
        now,
        receipt.id,
        from,
        now,
        ...(reviewRevision === undefined ? [] : [reviewRevision]),
      )
      .run();
    return result.meta.changes === 1;
  }
  /** Closes a receipt blocked by an explicit abuse rule; media expires normally. */
  async block(id: string, now: number) {
    await this.db
      .prepare(
        "UPDATE submission_receipts SET state='rejected',updated_at=? WHERE id=? AND state='staging'",
      )
      .bind(now, id)
      .run();
  }
  async release(id: string, token: string, now: number) {
    await this.db
      .prepare(
        `UPDATE submission_receipts SET state=${RESTORED_RECEIPT_STATE},active_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND state='publishing' AND active_token=?`,
      )
      .bind(now, id, token)
      .run();
  }
  async claimEvidence(id: string, token: string, now: number) {
    const result = await this.db
      .prepare(
        "UPDATE submission_receipts SET state='publishing',active_token=?,lease_expires_at=?,updated_at=? WHERE id=? AND purpose='evidence' AND state='review' AND expires_at>? AND EXISTS(SELECT 1 FROM profiles WHERE user_id=submission_receipts.user_id AND account_state='active')",
      )
      .bind(token, now + LEASE, now, id, now)
      .run();
    if (!result.meta.changes)
      throw new ApplicationError(
        "EVIDENCE_CHANGED",
        "This evidence expired or is being reviewed. Refresh before retrying.",
        409,
      );
  }
  async publication(receipt: SubmissionReceipt): Promise<Publication | null> {
    if (receipt.state !== "published" || !receipt.product_id) return null;
    const product = await this.db
      .prepare("SELECT slug FROM products WHERE id=?")
      .bind(receipt.product_id)
      .first<{ slug: string }>();
    return product
      ? {
          productId: receipt.product_id,
          slug: product.slug,
          receiptId: receipt.id,
          decision: "READY",
        }
      : null;
  }
  async publish(
    actor: Actor,
    receipt: SubmissionReceipt,
    input: SubmissionInput,
    context: SubmissionContext,
    classification: { veganStatus: VeganStatus; reviewedBy: string | null },
    images: StagedAttachment[],
    token: string,
    newBrandId: string,
    auditId: string,
    now: number,
    resolutionNote?: string,
    operation?: ReceiptWrite,
  ): Promise<Publication> {
    // Validate mutable catalog references again inside the publication transaction.
    // Image promotion may have taken long enough for a country or category to close.
    const guard = `EXISTS(SELECT 1 FROM submission_receipts WHERE id=? AND state='publishing' AND active_token=? AND lease_expires_at>?)
      AND EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND account_state='active')
      AND EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND account_state='active')
      AND EXISTS(SELECT 1 FROM countries WHERE id=? AND is_active=1)
      AND (SELECT COUNT(*) FROM categories WHERE id IN (SELECT value FROM json_each(?)) AND is_active=1 AND is_rankable=1)=?
      AND (?='' OR EXISTS(SELECT 1 FROM products WHERE id=? AND country_id=? AND lifecycle_status<>'hidden'))
      AND (?='' OR EXISTS(SELECT 1 FROM product_families WHERE id=? AND (brand_id IS NULL OR brand_id=?)))`;
    const fence = [
      receipt.id,
      token,
      now,
      receipt.user_id,
      actor.id,
      context.countryId,
      JSON.stringify(input.categoryIds),
      input.categoryIds.length,
      input.relatedProductId ?? "",
      input.relatedProductId ?? "",
      context.countryId,
      input.productFamilyId ?? "",
      input.productFamilyId ?? "",
      context.brandId ?? "",
    ];
    const productId = receipt.planned_product_id,
      versionId = receipt.planned_version_id;
    const productSlug = `${slug(`${context.brandName} ${input.name}`)}-${productId.slice(-8)}`;
    const status = classification.veganStatus;
    const statements: D1PreparedStatement[] = [];
    if (!context.brandId)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${guard} ON CONFLICT(normalized_name) DO NOTHING`,
          )
          .bind(
            newBrandId,
            context.brandName,
            normalizeName(context.brandName),
            `${slug(context.brandName)}-${newBrandId.slice(-8)}`,
            now,
            now,
            ...fence,
          ),
      );
    statements.push(
      this.db
        .prepare(
          `INSERT INTO products(id,country_id,brand_id,product_family_id,name,slug,vegan_status,manufacturer_label,manufacturer_url,created_by,published_at,created_at,updated_at)
        SELECT ?,?,COALESCE(?,(SELECT id FROM brands WHERE normalized_name=?)),?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          productId,
          context.countryId,
          // A brand matched by name or alias keeps its identity; only a new
          // brand is resolved by the normalized key inserted above.
          context.brandId,
          normalizeName(context.brandName),
          input.productFamilyId ?? null,
          input.name,
          productSlug,
          status,
          input.manufacturerLabel,
          input.ingredientUrl ?? null,
          receipt.user_id,
          now,
          now,
          now,
          ...fence,
        ),
      this.db
        .prepare(
          `INSERT INTO product_identity_keys(identity_key,product_id) SELECT ?,? WHERE ${guard}`,
        )
        .bind(context.identity, productId, ...fence),
      this.db
        .prepare(
          `INSERT INTO product_versions(id,product_id,version_label,is_current,change_summary,created_by,created_at,updated_at) SELECT ?,?,'Original formula',1,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          versionId,
          productId,
          "Community submission. Ingredient evidence has not yet been independently verified.",
          receipt.user_id,
          now,
          now,
          ...fence,
        ),
      ...input.categoryIds.map((categoryId) =>
        this.db
          .prepare(
            `INSERT INTO product_categories(product_id,category_id,ranking_eligible,created_by,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
          )
          .bind(
            productId,
            categoryId,
            input.specialtyFlavor ? 0 : 1,
            receipt.user_id,
            now,
            now,
            ...fence,
          ),
      ),
      this.db
        .prepare(
          `INSERT INTO formula_classifications(product_version_id,vegan_status,manufacturer_label,evidence_data,reviewed_by,updated_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          versionId,
          status,
          input.manufacturerLabel,
          JSON.stringify({
            urls: input.ingredientUrl ? [input.ingredientUrl] : [],
            imageIds: images
              .filter((i) => i.slot === "ingredients")
              .map((i) => i.imageId),
            note: input.statusBasis,
          }),
          classification.reviewedBy,
          now,
          ...fence,
        ),
      ...imageInsertStatements(
        this.db,
        versionId,
        receipt.user_id,
        images,
        now,
        guard,
        fence,
      ),
    );
    if (input.relatedProductId && input.relationship)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO product_relationships(from_product_id,to_product_id,relation_type,created_by,created_at) SELECT ?,?,?,?,? WHERE ${guard}`,
          )
          .bind(
            productId,
            input.relatedProductId,
            input.relationship,
            receipt.user_id,
            now,
            ...fence,
          ),
      );
    if (operation)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO contribution_receipts(user_id,operation,idempotency_key,input_hash,result_data,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
          )
          .bind(
            operation.userId,
            operation.operation,
            operation.key,
            operation.hash,
            JSON.stringify({
              productId,
              slug: productSlug,
              receiptId: receipt.id,
              decision: "READY",
            }),
            now,
            ...fence,
          ),
      );
    statements.push(
      ...productSearchStatements(this.db, productId, guard, fence),
      this.db
        .prepare(
          `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,after_data,created_at) SELECT ?,?,'product_published','product',?,?,? WHERE ${guard}`,
        )
        .bind(
          auditId,
          actor.id,
          productId,
          JSON.stringify({
            submissionId: receipt.id,
            input,
            resolutionNote: resolutionNote ?? null,
          }),
          now,
          ...fence,
        ),
      this.db
        .prepare(
          `UPDATE pending_submissions SET resolved_by=?,resolution_note=?,resolved_at=?,revision=revision+1 WHERE submission_id=? AND ${guard}`,
        )
        .bind(
          actor.id,
          resolutionNote ?? "Published after deterministic validation.",
          now,
          receipt.id,
          ...fence,
        ),
      this.db
        .prepare(
          `UPDATE submission_receipts SET state='published',product_id=?,updated_at=?,active_token=NULL,lease_expires_at=NULL WHERE id=? AND ${guard}`,
        )
        .bind(productId, now, receipt.id, ...fence),
    );
    const result = await this.db.batch(statements);
    if (!result.at(-1)!.meta.changes)
      throw new ApplicationError(
        "SUBMISSION_CHANGED",
        "Publication expired. Refresh and retry.",
        409,
      );
    return {
      productId,
      slug: productSlug,
      receiptId: receipt.id,
      decision: "READY",
    };
  }
}

export function imageInsertStatements(
  db: D1Database,
  versionId: string,
  userId: string,
  images: StagedAttachment[],
  now: number,
  guard: string,
  fence: (string | number)[],
  replace = false,
) {
  return images.flatMap((image) => {
    const full = image.derivatives.find((d) => d.kind === "full"),
      thumbnail = image.derivatives.find((d) => d.kind === "thumbnail"),
      evidence = image.derivatives.find((d) => d.kind === "evidence");
    if (!full || !thumbnail) throw new Error("Missing derivative.");
    return [
      ...(replace
        ? [
            db
              .prepare(
                `UPDATE product_images SET state='archived',updated_at=? WHERE product_version_id=? AND slot=? AND state='accepted' AND ${guard}`,
              )
              .bind(now, versionId, image.slot, ...fence),
          ]
        : []),
      db
        .prepare(
          `INSERT INTO product_images(id,product_version_id,slot,state,full_r2_key,thumbnail_r2_key,evidence_r2_key,full_width,full_height,evidence_width,evidence_height,submitted_by,created_at,updated_at)
        SELECT ?,?,?,'accepted',?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          image.imageId,
          versionId,
          image.slot,
          full.key,
          thumbnail.key,
          evidence?.key ?? null,
          full.width,
          full.height,
          evidence?.width ?? null,
          evidence?.height ?? null,
          userId,
          now,
          now,
          ...fence,
        ),
      db
        .prepare(
          `UPDATE staged_blobs SET derivatives=?,state='complete',updated_at=? WHERE id=? AND ${guard}`,
        )
        .bind(JSON.stringify(image.derivatives), now, image.blobId, ...fence),
    ];
  });
}
