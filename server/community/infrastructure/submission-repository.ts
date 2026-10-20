import { ApplicationError } from "../../shared/domain/errors";
import {
  categorySearchStatements,
  productSearchStatements,
} from "../../catalog/infrastructure/search-index";
import { retailerConfirmationStatements } from "./contribution-repository";
import type { AllergenDeclaration } from "../domain/allergens";
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
import type { LineRefresh } from "../../ranking/infrastructure/line-refresh";

// The single rule for releasing or revoking a publication lease. Held
// submissions and evidence for a still-pending proposal return to review.
// Evidence whose proposal was decided during the lease is closed, never reused.
// An interrupted automatic publication returns to staging.
export const RESTORED_RECEIPT_STATE = `CASE
  WHEN purpose='evidence' THEN CASE WHEN EXISTS(SELECT 1 FROM edit_proposals WHERE status='pending' AND json_extract(proposed_data,'$.evidenceReceiptId')=submission_receipts.id) THEN 'review' ELSE 'rejected' END
  WHEN EXISTS(SELECT 1 FROM pending_submissions WHERE submission_id=submission_receipts.id) THEN 'review'
  ELSE 'staging' END`;
const EXTRAS = "submission-extras:";
/** What a published submission still owes: its rating and declaration. */
export interface PublicationExtrasMarker {
  userId: string;
  productId: string;
  versionId: string;
  categoryId: string | null;
  rating: number | null;
  // The Tastiest answer given with the rating (milestone 7); absent in
  // markers written before it.
  enjoyment?: number | null;
  allergens: AllergenDeclaration | null;
  citedImageId: string | null;
}
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
    private readonly lines: LineRefresh,
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
    // A food suggested with the product: a new proposal (fenced by the daily
    // allowance and an open country), or one a follow-up carries forward.
    food?: { proposalId: string; create: boolean; perDay: number },
  ) {
    // The new receipt becomes reviewable only if the original request still
    // awaits this contributor. The same fence closes it and records the link.
    const fence =
      "EXISTS(SELECT 1 FROM submission_receipts WHERE id=? AND state='review' AND active_token=?)";
    const guard = [receipt.id, token];
    const day = Math.floor(now / 86_400_000) * 86_400_000;
    // The receipt can be held: its contributor is active and, for a
    // follow-up, the original request still awaits them. A suggested food is
    // created under the same conditions, so it never outlives a failed hold.
    const holdable = [
      "EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND account_state='active')",
      ...(input.followUp
        ? [
            `EXISTS(SELECT 1 FROM submission_receipts s JOIN pending_submissions p ON p.submission_id=s.id
            WHERE s.id=? AND s.user_id=? AND s.state='review' AND s.expires_at>? AND p.revision=?
            AND p.resolved_at IS NULL AND p.resolution_note IS NOT NULL AND p.superseded_by IS NULL)`,
          ]
        : []),
    ].join(" AND ");
    const holdableValues = [
      receipt.user_id,
      ...(input.followUp
        ? [
            input.followUp.submissionId,
            receipt.user_id,
            now,
            input.followUp.expectedRevision,
          ]
        : []),
    ];
    const statements = [
      ...(food?.create && input.newFood
        ? [
            this.db
              .prepare(
                `INSERT INTO category_proposals(id,submitted_by,name,parent_id,country_id,explanation,proposed_data,created_at,updated_at)
                SELECT ?,?,?,?,(SELECT id FROM countries WHERE iso2=? AND is_active=1),'',?,?,?
                WHERE (SELECT COUNT(*) FROM category_proposals WHERE submitted_by=? AND created_at>=?) < ?
                AND EXISTS(SELECT 1 FROM countries WHERE iso2=? AND is_active=1)
                AND EXISTS(SELECT 1 FROM submission_receipts WHERE id=? AND state='staging' AND expires_at>?)
                AND NOT EXISTS(SELECT 1 FROM category_proposals WHERE id=?) AND ${holdable}`,
              )
              .bind(
                food.proposalId,
                receipt.user_id,
                input.newFood.name,
                input.newFood.aisleId,
                input.country,
                JSON.stringify({
                  name: input.newFood.name,
                  aisleId: input.newFood.aisleId,
                  country: input.country,
                  aliases: input.newFood.aliases ?? [],
                  exampleProducts: [`${input.brand} ${input.name}`],
                  submissionId: receipt.id,
                }),
                now,
                now,
                receipt.user_id,
                day,
                food.perDay,
                input.country,
                receipt.id,
                now,
                food.proposalId,
                ...holdableValues,
              ),
          ]
        : []),
      this.db
        .prepare(
          `UPDATE submission_receipts SET state='review',active_token=?,updated_at=?,expires_at=? WHERE id=? AND state='staging' AND expires_at>?
          AND ${holdable}
          ${food ? "AND EXISTS(SELECT 1 FROM category_proposals WHERE id=? AND status='pending')" : ""}`,
        )
        .bind(
          token,
          now,
          now + this.limits.reviewRetention,
          receipt.id,
          now,
          ...holdableValues,
          ...(food ? [food.proposalId] : []),
        ),
      this.db
        .prepare(
          `INSERT INTO pending_submissions(submission_id,proposed_data,reasons,category_proposal_id) SELECT ?,?,?,? WHERE ${fence} ON CONFLICT DO NOTHING`,
        )
        .bind(
          receipt.id,
          JSON.stringify(input),
          JSON.stringify(reasons),
          food?.proposalId ?? null,
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
        // A food the original suggested that this revision no longer carries
        // is withdrawn, unless another live submission still waits on it.
        this.db
          .prepare(
            `UPDATE category_proposals SET status='rejected',resolved_by=?,resolution_note=?,resolved_at=?,updated_at=?
            WHERE id=(SELECT category_proposal_id FROM pending_submissions WHERE submission_id=?) AND status='pending' AND id IS NOT ?
            AND ${fence}
            AND NOT EXISTS(SELECT 1 FROM pending_submissions p JOIN submission_receipts s ON s.id=p.submission_id AND s.state='review'
              WHERE p.category_proposal_id=category_proposals.id AND p.resolved_at IS NULL AND p.superseded_by IS NULL)`,
          )
          .bind(
            receipt.user_id,
            "Withdrawn: the contributor’s revised submission no longer suggests this food.",
            now,
            now,
            input.followUp.submissionId,
            food?.proposalId ?? null,
            ...guard,
          ),
      );
    statements.push(
      this.db
        .prepare(
          `UPDATE submission_receipts SET active_token=NULL WHERE id=? AND active_token=?`,
        )
        .bind(...guard),
    );
    const results = await this.db.batch(statements);
    const held = results[food?.create && input.newFood ? 1 : 0]!;
    if (
      !held.meta.changes &&
      (await this.get(receipt.id))?.state !== "review"
    ) {
      // A suggestion refused because the allowance was used up meanwhile
      // says so; any other refusal is a changed submission.
      if (
        food?.create &&
        ((await this.db
          .prepare(
            "SELECT COUNT(*) AS n FROM category_proposals WHERE submitted_by=? AND created_at>=?",
          )
          .bind(receipt.user_id, day)
          .first<number>("n")) ?? 0) >= food.perDay
      )
        throw new ApplicationError(
          "PROPOSAL_LIMIT",
          "You’ve suggested the most foods allowed today. Try again tomorrow, or choose an existing food.",
          429,
        );
      throw new ApplicationError(
        "SUBMISSION_CHANGED",
        "This submission changed. Refresh its status.",
        409,
      );
    }
  }
  async extras(receiptId: string) {
    const row = await this.db
      .prepare("SELECT cursor FROM community_recovery WHERE prefix=?")
      .bind(`${EXTRAS}${receiptId}`)
      .first<{ cursor: string }>();
    return row ? (JSON.parse(row.cursor) as PublicationExtrasMarker) : null;
  }
  /** Receipts whose extras are still waiting, oldest first, for the sweep. */
  async pendingExtras(limit = 20) {
    return (
      await this.db
        .prepare(
          "SELECT substr(prefix,?) AS id FROM community_recovery WHERE prefix LIKE ? ORDER BY prefix LIMIT ?",
        )
        .bind(EXTRAS.length + 1, `${EXTRAS}%`, limit)
        .all<{ id: string }>()
    ).results.map((row) => row.id);
  }
  async clearExtras(receiptId: string) {
    await this.db
      .prepare("DELETE FROM community_recovery WHERE prefix=?")
      .bind(`${EXTRAS}${receiptId}`)
      .run();
  }
  /** A suggested food's decision: its status, resolved food and note. */
  foodDecision(proposalId: string) {
    return this.db
      .prepare(
        "SELECT name,status,resolved_category_id AS resolvedId,resolution_note AS note FROM category_proposals WHERE id=?",
      )
      .bind(proposalId)
      .first<{
        name: string;
        status: string;
        resolvedId: string | null;
        note: string | null;
      }>();
  }
  /** The food a held submission suggested, and where its decision stands. */
  pendingFood(submissionId: string) {
    return this.db
      .prepare(
        `SELECT cp.id,cp.name,cp.parent_id AS aisleId,cp.status,cp.resolved_category_id AS resolvedId
        FROM pending_submissions p JOIN category_proposals cp ON cp.id=p.category_proposal_id WHERE p.submission_id=?`,
      )
      .bind(submissionId)
      .first<{
        id: string;
        name: string;
        aisleId: string | null;
        status: string;
        resolvedId: string | null;
      }>();
  }
  /**
   * Live submissions still waiting on a suggested food: in review, not
   * superseded, not yet sent a follow-up and still carrying the suggestion.
   */
  async waitingOnFood(proposalId: string) {
    return (
      await this.db
        .prepare(
          `SELECT p.submission_id AS id,p.proposed_data AS proposed,p.revision FROM pending_submissions p
          JOIN submission_receipts s ON s.id=p.submission_id AND s.state='review'
          WHERE p.category_proposal_id=? AND p.resolved_at IS NULL AND p.superseded_by IS NULL AND p.resolution_note IS NULL
          AND json_extract(p.proposed_data,'$.newFood') IS NOT NULL LIMIT 50`,
        )
        .bind(proposalId)
        .all<{ id: string; proposed: string; revision: number }>()
    ).results;
  }
  /** Decided suggestions that still have submissions waiting, for the sweep. */
  async decidedFoods(limit = 20) {
    return (
      await this.db
        .prepare(
          `SELECT DISTINCT cp.id FROM category_proposals cp JOIN pending_submissions p ON p.category_proposal_id=cp.id
          JOIN submission_receipts s ON s.id=p.submission_id AND s.state='review'
          WHERE cp.status<>'pending' AND p.resolved_at IS NULL AND p.superseded_by IS NULL AND p.resolution_note IS NULL
          AND json_extract(p.proposed_data,'$.newFood') IS NOT NULL LIMIT ?`,
        )
        .bind(limit)
        .all<{ id: string }>()
    ).results.map((row) => row.id);
  }
  /**
   * Replaces a waiting submission's details with the decided food (fenced on
   * its review revision), so an operator or the continuation publishes the
   * resolved product.
   */
  async resolveFood(
    submissionId: string,
    revision: number,
    input: SubmissionInput,
    reasons: string[],
  ) {
    const result = await this.db
      .prepare(
        "UPDATE pending_submissions SET proposed_data=?,reasons=?,revision=revision+1 WHERE submission_id=? AND revision=? AND resolved_at IS NULL",
      )
      .bind(
        JSON.stringify(input),
        JSON.stringify(reasons),
        submissionId,
        revision,
      )
      .run();
    return result.meta.changes > 0;
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
    classification: {
      veganStatus: VeganStatus;
      ingredientsChecked: boolean;
      reviewedBy: string | null;
    },
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
      AND (?='' OR EXISTS(SELECT 1 FROM product_families WHERE id=? AND country_id=? AND brand_id=?))`;
    const fence = [
      receipt.id,
      token,
      now,
      receipt.user_id,
      actor.id,
      context.countryId,
      JSON.stringify(input.categoryIds),
      input.categoryIds.length,
      input.lineId ?? "",
      input.lineId ?? "",
      context.countryId,
      context.brandId ?? "",
    ];
    const productId = receipt.planned_product_id,
      versionId = receipt.planned_version_id;
    const productSlug = `${slug(`${context.brandName} ${input.name}`)}-${productId.slice(-8)}`;
    // A product outside a chosen line starts its own, named by the
    // contributor ("Name without the flavor") or after the product.
    const familyId = input.lineId ?? `line-${productId}`;
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
    if (!input.lineId)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO product_families(id,brand_id,country_id,canonical_name,slug,created_at,updated_at)
          SELECT ?,COALESCE(?,(SELECT id FROM brands WHERE normalized_name=?)),?,?,(SELECT lower(iso2) FROM countries WHERE id=?)||'-'||?,?,? WHERE ${guard}`,
          )
          .bind(
            familyId,
            context.brandId,
            normalizeName(context.brandName),
            context.countryId,
            input.lineName ?? input.name,
            context.countryId,
            productSlug,
            now,
            now,
            ...fence,
          ),
      );
    statements.push(
      this.db
        .prepare(
          `INSERT INTO products(id,country_id,brand_id,product_family_id,name,flavor,seasonal,slug,vegan_status,manufacturer_label,manufacturer_url,created_by,published_at,created_at,updated_at)
        SELECT ?,?,COALESCE(?,(SELECT id FROM brands WHERE normalized_name=?)),?,?,?,COALESCE(?,(SELECT season_start IS NOT NULL FROM categories WHERE id=?),0),?,?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          productId,
          context.countryId,
          // A brand matched by name or alias keeps its identity; only a new
          // brand is resolved by the normalized key inserted above.
          context.brandId,
          normalizeName(context.brandName),
          familyId,
          input.name,
          input.flavor ?? null,
          // Unsaid, a product follows its food's season.
          input.seasonal === undefined ? null : Number(input.seasonal),
          input.categoryIds[0] ?? null,
          productSlug,
          status,
          input.manufacturerLabel ?? "unknown",
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
            // Every flavor counts (milestone 7); operators can exclude one.
            1,
            receipt.user_id,
            now,
            now,
            ...fence,
          ),
      ),
      this.db
        .prepare(
          `INSERT INTO formula_classifications(product_version_id,vegan_status,manufacturer_label,evidence_data,reviewed_by,ingredients_checked,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          versionId,
          status,
          input.manufacturerLabel ?? "unknown",
          JSON.stringify({
            urls: input.ingredientUrl ? [input.ingredientUrl] : [],
            imageIds: images
              .filter((i) => i.slot === "ingredients")
              .map((i) => i.imageId),
            // Evidence notes are at least 8 characters; the contributor's
            // note is optional.
            note:
              input.statusBasis && input.statusBasis.length >= 8
                ? input.statusBasis
                : "Added with the product; the contributor left no ingredient note.",
          }),
          classification.reviewedBy,
          classification.ingredientsChecked ? 1 : 0,
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
    // Stores chosen with the product: its contributor's "commonly found at".
    for (const retailerId of input.retailerIds ?? [])
      statements.push(
        ...retailerConfirmationStatements(
          this.db,
          {
            userId: receipt.user_id,
            productId,
            retailerId,
            stance: "confirm",
            now,
          },
          guard,
          fence,
        ),
      );
    // The contributor's rating and allergen declaration go through their own
    // write paths right after publication; this marker keeps them until done.
    if (input.rating || input.enjoyment || input.allergens)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO community_recovery(prefix,cursor) SELECT ?,? WHERE ${guard} ON CONFLICT(prefix) DO UPDATE SET cursor=excluded.cursor`,
          )
          .bind(
            `${EXTRAS}${receipt.id}`,
            JSON.stringify({
              userId: receipt.user_id,
              productId,
              versionId,
              categoryId: input.categoryIds[0] ?? null,
              rating: input.rating ?? null,
              enjoyment: input.enjoyment ?? null,
              allergens: input.allergens ?? null,
              citedImageId:
                images.find((i) => i.slot === "ingredients")?.imageId ??
                images.find((i) => i.slot === "nutrition")?.imageId ??
                null,
            } satisfies PublicationExtrasMarker),
            ...fence,
          ),
      );
    statements.push(
      ...productSearchStatements(this.db, productId, guard, fence),
      // A food this product switched on in its country becomes searchable.
      ...categorySearchStatements(this.db, productId, guard, fence),
      // The line the product starts or joins.
      ...this.lines.statements({ productIds: [productId] }, now),
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
