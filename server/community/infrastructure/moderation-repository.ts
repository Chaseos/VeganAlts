import {
  normalizeDeclaration,
  type AllergenDeclaration,
} from "../domain/allergens";
import type { InboxFilter } from "../domain/contracts";
import { ApplicationError } from "../../shared/domain/errors";
import type { Actor, ContributionItem, QueueItem } from "../domain/contracts";
import type {
  FormulaClassification,
  ModerationAction,
  ProductSnapshot,
  ProposalRecord,
} from "../domain/moderation";
import { decodeCursor, encodeCursor } from "../domain/policy";
import { replay, type ReceiptWrite } from "./receipts";

export type BindValue = string | number | null;
export interface DecisionGuard {
  sql: string;
  values: BindValue[];
}
export interface ActionWrite {
  id: string;
  actor: Actor;
  kind: string;
  targetId: string;
  productId: string | null;
  before: unknown;
  after: unknown;
  note: string;
  now: number;
}
export interface ReportRecord {
  id: string;
  target_type: string;
  target_id: string;
  reason_code: string;
  note: string | null;
  status: string;
  revision: number;
  evidence_data: string;
  resolution_note: string | null;
}
/**
 * Responses of one stance from active accounts on a proposal: bound as a
 * parameter by default, or correlated with a column such as
 * `edit_proposals.id`.
 */
export const ACTIVE_RESPONSES = (
  stance: "confirm" | "disagree",
  proposal = "?",
) =>
  `(SELECT COUNT(*) FROM edit_proposal_responses r JOIN profiles p ON p.user_id=r.user_id AND p.account_state='active' WHERE r.proposal_id=${proposal} AND r.stance='${stance}')`;

export class ModerationRepository {
  constructor(readonly db: D1Database) {}
  replay<T>(receipt: ReceiptWrite) {
    return replay<T>(this.db, receipt);
  }
  async snapshot(productId: string): Promise<ProductSnapshot> {
    const rows = await this.db.batch<Record<string, unknown>>([
      this.db
        .prepare(
          `SELECT p.id,p.name,p.slug,p.country_id AS countryId,p.brand_id AS brandId,p.product_family_id AS familyId,p.lifecycle_status AS lifecycleStatus,p.vegan_status AS veganStatus,p.manufacturer_label AS manufacturerLabel,p.manufacturer_url AS manufacturerUrl,r.revision,v.id AS versionId,v.version_label AS versionLabel,
          (SELECT COUNT(*) FROM ratings x WHERE x.product_version_id=v.id AND x.is_counted=1) AS countedRatings,
          (SELECT lower(iso2) FROM countries WHERE id=p.country_id) AS countryCode FROM products p JOIN catalog_revisions r ON r.product_id=p.id JOIN product_versions v ON v.product_id=p.id AND v.is_current=1 WHERE p.id=?`,
        )
        .bind(productId),
      this.db
        .prepare(
          `SELECT f.* FROM formula_classifications f JOIN product_versions v ON v.id=f.product_version_id WHERE v.product_id=? AND v.is_current=1`,
        )
        .bind(productId),
      this.db
        .prepare(
          "SELECT category_id AS categoryId,ranking_eligible AS eligible FROM product_categories WHERE product_id=? ORDER BY category_id",
        )
        .bind(productId),
      this.db
        .prepare(
          "SELECT i.id,i.product_version_id AS versionId,i.slot,i.state FROM product_images i JOIN product_versions v ON v.id=i.product_version_id WHERE v.product_id=? ORDER BY i.id",
        )
        .bind(productId),
      this.db
        .prepare(
          "SELECT to_product_id AS productId,relation_type AS type FROM product_relationships WHERE from_product_id=? ORDER BY to_product_id,relation_type",
        )
        .bind(productId),
      this.db
        .prepare(
          "SELECT alias FROM product_aliases WHERE product_id=? ORDER BY alias",
        )
        .bind(productId),
      this.db
        .prepare(
          "SELECT pr.retailer_id AS retailerId,r.canonical_name AS name,pr.status,pr.confirmation_count AS contributorCount,pr.disagreement_count AS disagreementCount,pr.last_confirmed_at AS lastConfirmedAt FROM product_retailers pr JOIN retailers r ON r.id=pr.retailer_id WHERE pr.product_id=? ORDER BY pr.retailer_id",
        )
        .bind(productId),
      this.db
        .prepare(
          `SELECT d.status,d.evidence_data AS evidence,d.source_proposal_id AS proposalId,(SELECT json_group_array(json_object('key',a.allergen_key,'presence',a.presence)) FROM product_version_allergens a WHERE a.product_version_id=d.product_version_id) AS allergens
          FROM product_version_allergen_declarations d JOIN product_versions v ON v.id=d.product_version_id WHERE v.product_id=? AND v.is_current=1`,
        )
        .bind(productId),
      this.db
        .prepare(
          "SELECT ca.allergen_key AS key,COALESCE(ca.label,a.label) AS label FROM country_allergens ca JOIN allergens a ON a.key=ca.allergen_key JOIN products p ON p.country_id=ca.country_id WHERE p.id=? ORDER BY ca.position",
        )
        .bind(productId),
    ]);
    const p = rows[0]!.results[0];
    if (!p) throw new ApplicationError("NOT_FOUND", "Product not found.", 404);
    const f = rows[1]!.results[0];
    // The selected SQL aliases define the repository boundary; JSON columns have
    // already passed the shared contracts at their write boundary.
    const classification: FormulaClassification | null = f
      ? {
          veganStatus: f.vegan_status as FormulaClassification["veganStatus"],
          manufacturerLabel:
            f.manufacturer_label as FormulaClassification["manufacturerLabel"],
          evidence: JSON.parse(
            String(f.evidence_data),
          ) as FormulaClassification["evidence"],
          certifications: JSON.parse(
            String(f.certifications),
          ) as FormulaClassification["certifications"],
          reviewedBy: f.reviewed_by as string | null,
        }
      : null;
    return {
      ...p,
      classification,
      categories: rows[2]!.results.map((r) => ({
        categoryId: String(r.categoryId),
        eligible: r.eligible === 1,
      })),
      images: rows[3]!.results,
      relationships: rows[4]!.results,
      aliases: rows[5]!.results.map((r) => String(r.alias)),
      retailers: rows[6]!.results,
      allergens: declarationRow(rows[7]!.results[0]),
      allergenSource: rows[7]!.results[0]
        ? {
            evidence: JSON.parse(String(rows[7]!.results[0].evidence)),
            proposalId: rows[7]!.results[0].proposalId ?? null,
          }
        : null,
      allergenList: rows[8]!.results,
    } as unknown as ProductSnapshot;
  }
  proposal(id: string) {
    return this.db
      .prepare("SELECT * FROM edit_proposals WHERE id=?")
      .bind(id)
      .first<ProposalRecord>();
  }
  report(id: string) {
    return this.db
      .prepare(
        "SELECT r.*,COALESCE(e.revision,0) AS revision,COALESCE(e.evidence_data,'[]') AS evidence_data FROM reports r LEFT JOIN report_evidence e ON e.report_id=r.id WHERE r.id=?",
      )
      .bind(id)
      .first<ReportRecord>();
  }
  action(id: string) {
    return this.db
      .prepare("SELECT * FROM moderation_actions WHERE id=?")
      .bind(id)
      .first<ModerationAction>();
  }
  async actions(productId: string) {
    return (
      await this.db
        .prepare(
          "SELECT * FROM moderation_actions WHERE product_id=? ORDER BY created_at DESC,id DESC LIMIT 50",
        )
        .bind(productId)
        .all<ModerationAction>()
    ).results;
  }
  async commit(
    action: ActionWrite,
    guard: DecisionGuard,
    build: (fence: DecisionGuard) => D1PreparedStatement[],
    receipt: ReceiptWrite,
  ) {
    const result = { actionId: action.id, productId: action.productId };
    const fence = {
      sql: "EXISTS(SELECT 1 FROM moderation_actions WHERE id=?)",
      values: [action.id],
    };
    try {
      const rows = await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO moderation_actions(id,actor_id,kind,target_id,product_id,before_data,after_data,note,created_at)
          SELECT ?,?,?,?,?,?,?,?,? WHERE (${guard.sql}) AND EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND account_state='active')`,
          )
          .bind(
            action.id,
            action.actor.id,
            action.kind,
            action.targetId,
            action.productId,
            JSON.stringify(action.before),
            JSON.stringify(action.after),
            action.note,
            action.now,
            ...guard.values,
            action.actor.id,
          ),
        ...build(fence),
        this.db
          .prepare(
            `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,before_data,after_data,source_proposal_id,source_report_id,created_at)
          SELECT ?,?,?,?, ?,?,?,?, ?,? WHERE ${fence.sql}`,
          )
          .bind(
            action.id,
            action.actor.id,
            action.kind,
            action.productId ? "product" : "moderation",
            action.productId ?? action.targetId,
            JSON.stringify(action.before),
            JSON.stringify({ value: action.after, note: action.note }),
            action.kind.startsWith("proposal_") ? action.targetId : null,
            action.kind.startsWith("report_") ? action.targetId : null,
            action.now,
            ...fence.values,
          ),
        this.db
          .prepare(
            `INSERT INTO contribution_receipts(user_id,operation,idempotency_key,input_hash,result_data,created_at) SELECT ?,?,?,?,?,? WHERE ${fence.sql}`,
          )
          .bind(
            receipt.userId,
            receipt.operation,
            receipt.key,
            receipt.hash,
            JSON.stringify(result),
            receipt.now,
            ...fence.values,
          ),
      ]);
      if (!rows[0]!.meta.changes)
        throw new ApplicationError(
          "STALE_DECISION",
          "This record changed. Refresh the review before deciding.",
          409,
        );
    } catch (error) {
      const prior = await replay<typeof result>(this.db, receipt);
      if (prior) return prior;
      throw error;
    }
    return result;
  }
  async brandName(brandId: string | null) {
    if (!brandId) return null;
    return this.db
      .prepare("SELECT name FROM brands WHERE id=?")
      .bind(brandId)
      .first<string>("name");
  }
  identityOwner(key: string) {
    return this.db
      .prepare(
        "SELECT product_id FROM product_identity_keys WHERE identity_key=?",
      )
      .bind(key)
      .first<string>("product_id");
  }
  /** Confirmations and disagreements from accounts that are still active. */
  async activeResponses(proposalId: string) {
    return (await this.db
      .prepare(
        `SELECT ${ACTIVE_RESPONSES("confirm")} AS confirms,${ACTIVE_RESPONSES("disagree")} AS disagrees`,
      )
      .bind(proposalId, proposalId)
      .first<{ confirms: number; disagrees: number }>())!;
  }
  /**
   * Pending product proposals automation may evaluate, oldest first. A stored
   * cursor rotates through them, so proposals that stay ineligible cannot
   * keep newer ones from ever being examined.
   */
  async automationCandidates(limit: number) {
    const page = async (at: number, after: string, count: number) =>
      (
        await this.db
          .prepare(
            // Active-account counts, not the stored ones: suspending a
            // disagreeing account must not exclude a proposal forever.
            `SELECT id,created_at FROM edit_proposals WHERE target_type='product' AND status='pending' AND risk_tier<=2
            AND ${ACTIVE_RESPONSES("disagree", "edit_proposals.id")}=0
            AND (risk_tier=1 OR ${ACTIVE_RESPONSES("confirm", "edit_proposals.id")}>0) AND (created_at>? OR (created_at=? AND id>?)) ORDER BY created_at,id LIMIT ?`,
          )
          .bind(at, at, after, count)
          .all<{ id: string; created_at: number }>()
      ).results;
    const cursor =
      (await this.db
        .prepare(
          "SELECT cursor FROM community_recovery WHERE prefix='proposal-automation'",
        )
        .first<string>("cursor")) ?? "";
    const [at, after] = cursor ? cursor.split(":") : ["-1", ""];
    let rows = await page(Number(at), after ?? "", limit);
    if (rows.length < limit && cursor) {
      const wrapped = await page(-1, "", limit - rows.length);
      rows = [
        ...rows,
        ...wrapped.filter((w) => !rows.some((r) => r.id === w.id)),
      ];
    }
    const last = rows.at(-1);
    await this.db
      .prepare(
        "INSERT INTO community_recovery(prefix,cursor) VALUES('proposal-automation',?) ON CONFLICT(prefix) DO UPDATE SET cursor=excluded.cursor",
      )
      .bind(rows.length < limit || !last ? "" : `${last.created_at}:${last.id}`)
      .run();
    return rows.map((r) => r.id);
  }
  async comment(id: string) {
    return this.db
      .prepare(
        "SELECT c.id,c.product_id,c.product_version_id,c.body,c.moderation_state,c.updated_at,c.created_at,c.deleted_at,pr.handle FROM comments c JOIN profiles pr ON pr.user_id=c.user_id WHERE c.id=?",
      )
      .bind(id)
      .first<{
        id: string;
        product_id: string;
        product_version_id: string;
        body: string;
        moderation_state: string;
        updated_at: number;
        created_at: number;
        deleted_at: number | null;
        handle: string;
      }>();
  }
  async commentStates(ids: string[]) {
    if (!ids.length) return new Map<string, string>();
    const rows = await this.db
      .prepare(
        "SELECT c.id,c.moderation_state FROM comments c JOIN json_each(?) j ON j.value=c.id",
      )
      .bind(JSON.stringify(ids))
      .all<{ id: string; moderation_state: string }>();
    return new Map(rows.results.map((r) => [r.id, r.moderation_state]));
  }
  async inbox(cursor: string | null, filter: InboxFilter = "all") {
    let point: [number, number, string] | null = null;
    if (cursor)
      try {
        const parsed: unknown = JSON.parse(atob(cursor));
        if (
          cursor.length > 300 ||
          !Array.isArray(parsed) ||
          parsed.length !== 3 ||
          !Number.isSafeInteger(parsed[0]) ||
          !Number.isSafeInteger(parsed[1]) ||
          typeof parsed[2] !== "string" ||
          !/^[\w-]{1,120}$/.test(parsed[2])
        )
          throw new Error();
        point = parsed as [number, number, string];
      } catch {
        throw new ApplicationError(
          "INVALID_CURSOR",
          "This inbox page link is invalid.",
        );
      }
    const rows = await this.db
      .prepare(
        `WITH inbox AS (
      SELECT s.id,'submission' AS kind,COALESCE(json_extract(p.proposed_data,'$.name'),'Submission') AS title,s.state AS status,2 AS priority,s.created_at AS createdAt,p.revision,NULL AS tier,0 AS confirms,0 AS disagrees,
        EXISTS(SELECT 1 FROM moderation_decisions d WHERE d.subject_type='submission' AND d.subject_id=s.id AND d.outcome<>'READY') AS flagged,
        upper(json_extract(p.proposed_data,'$.country')) AS country
        FROM submission_receipts s JOIN pending_submissions p ON p.submission_id=s.id WHERE s.state='review' AND p.resolved_at IS NULL
      UNION ALL SELECT r.id,'report',replace(r.reason_code,'_',' '),r.status,CASE WHEN r.reason_code='ingredient_concern' THEN 1 ELSE 3 END,r.created_at,COALESCE(e.revision,0),NULL,0,0,0,
        (SELECT co.iso2 FROM products pr JOIN countries co ON co.id=pr.country_id WHERE pr.id=CASE r.target_type
          WHEN 'product' THEN r.target_id
          WHEN 'product_image' THEN (SELECT v.product_id FROM product_images i JOIN product_versions v ON v.id=i.product_version_id WHERE i.id=r.target_id)
          ELSE (SELECT c.product_id FROM comments c WHERE c.id=r.target_id) END)
        FROM reports r LEFT JOIN report_evidence e ON e.report_id=r.id WHERE r.status IN ('open','reviewing')
      UNION ALL SELECT id,'proposal',replace(change_type,'_',' '),status,CASE WHEN change_type='classification' THEN 1 ELSE 2 END,created_at,updated_at,risk_tier,confirm_count,disagree_count,
        EXISTS(SELECT 1 FROM moderation_decisions d WHERE d.subject_type='edit_proposal' AND d.subject_id=edit_proposals.id AND d.outcome<>'READY'),
        CASE WHEN target_type='product' THEN (SELECT co.iso2 FROM products pr JOIN countries co ON co.id=pr.country_id WHERE pr.id=edit_proposals.target_id)
          ELSE upper(json_extract(proposed_data,'$.country')) END
        FROM edit_proposals WHERE status='pending'
      UNION ALL SELECT id,'category',name,status,2,created_at,updated_at,3,0,0,
        EXISTS(SELECT 1 FROM moderation_decisions d WHERE d.subject_type='category_proposal' AND d.subject_id=category_proposals.id AND d.outcome<>'READY'),
        (SELECT iso2 FROM countries WHERE id=category_proposals.country_id)
        FROM category_proposals WHERE status='pending'
      UNION ALL SELECT id,'comment','held comment',moderation_state,2,created_at,updated_at,NULL,0,0,
        EXISTS(SELECT 1 FROM moderation_decisions d WHERE d.subject_type='comment' AND d.subject_id=comments.id AND d.outcome<>'READY'),
        (SELECT co.iso2 FROM products pr JOIN countries co ON co.id=pr.country_id WHERE pr.id=comments.product_id)
        FROM comments WHERE moderation_state='pending' AND deleted_at IS NULL
    ) SELECT * FROM inbox WHERE (? IS NULL OR (priority,createdAt,kind||'_'||id)>(?,?,?))
      AND CASE ? WHEN 'confirmation' THEN kind='proposal' AND tier<=2
        WHEN 'high_risk' THEN (kind IN ('proposal','category') AND tier=3) OR priority=1
        WHEN 'comments' THEN kind='comment'
        WHEN 'flagged' THEN flagged=1
        ELSE 1 END
      ORDER BY priority,createdAt,kind||'_'||id LIMIT 31`,
      )
      .bind(
        point?.[0] ?? null,
        point?.[0] ?? 0,
        point?.[1] ?? 0,
        point?.[2] ?? "",
        filter,
      )
      .all<QueueItem>();
    const items = rows.results.slice(0, 30),
      last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.results.length > 30 && last
          ? btoa(
              JSON.stringify([
                last.priority,
                last.createdAt,
                `${last.kind}_${last.id}`,
              ]),
            )
          : null,
    };
  }
  async contributions(userId: string, cursor: string | null) {
    const point = decodeCursor(cursor);
    const rows = await this.db
      .prepare(
        `WITH items AS (
      SELECT s.id,'submission' AS kind,COALESCE(p.name,json_extract(ps.proposed_data,'$.name'),'Product submission') AS title,CASE WHEN ps.superseded_by IS NOT NULL THEN 'superseded' ELSE s.state END AS status,s.created_at AS createdAt,ps.resolution_note AS resolutionNote,p.slug AS productSlug FROM submission_receipts s LEFT JOIN pending_submissions ps ON ps.submission_id=s.id LEFT JOIN products p ON p.id=s.product_id WHERE s.user_id=? AND s.purpose='submission'
      UNION ALL SELECT ep.id,'proposal',replace(ep.change_type,'_',' '),ep.status,ep.created_at,ep.resolution_note,p.slug FROM edit_proposals ep LEFT JOIN products p ON p.id=ep.target_id WHERE ep.submitted_by=?
      UNION ALL SELECT id,'report',replace(reason_code,'_',' '),status,created_at,resolution_note,NULL FROM reports WHERE reporter_user_id=?
      UNION ALL SELECT id,'category',name,status,created_at,resolution_note,NULL FROM category_proposals WHERE submitted_by=?
    ) SELECT * FROM items WHERE ? IS NULL OR (createdAt,id)<(?,?) ORDER BY createdAt DESC,id DESC LIMIT 31`,
      )
      .bind(
        userId,
        userId,
        userId,
        userId,
        point?.createdAt ?? null,
        point?.createdAt ?? 0,
        point?.id ?? "",
      )
      .all<ContributionItem>();
    const items = rows.results.slice(0, 30),
      last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.results.length > 30 && last
          ? encodeCursor(last.createdAt, last.id)
          : null,
    };
  }
}

function declarationRow(
  row: Record<string, unknown> | undefined,
): AllergenDeclaration | null {
  if (!row) return null;
  if (row.status === "none_declared") return { status: "none_declared" };
  const rows = JSON.parse(String(row.allergens)) as {
    key: string;
    presence: string;
  }[];
  return normalizeDeclaration({
    status: "declared",
    contains: rows.filter((r) => r.presence === "contains").map((r) => r.key),
    mayContain: rows
      .filter((r) => r.presence === "may_contain")
      .map((r) => r.key),
  });
}
