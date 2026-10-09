import { ApplicationError } from "../../shared/domain/errors";
import { ACTIVE_RESPONSES } from "./moderation-repository";
import { productSearchStatements } from "../../catalog/infrastructure/search-index";
import type { Actor, ProductChange, RetailerInput } from "../domain/contracts";
import type {
  CatalogPatch,
  ProductSnapshot,
  ProposalRecord,
} from "../domain/moderation";
import type { ChangePlan, NewFormula } from "../domain/change-policy";
import { normalizeName, slug } from "../domain/policy";
import { imageInsertStatements } from "./submission-repository";
import type { StagedAttachment } from "./staged-media-repository";
import {
  ModerationRepository,
  type ActionWrite,
  type DecisionGuard,
} from "./moderation-repository";
import type { ReceiptWrite } from "./receipts";

export class CatalogDecisionRepository {
  constructor(private readonly repository: ModerationRepository) {}
  private get db() {
    return this.repository.db;
  }
  /** A category retired after a proposal was made can no longer gain members. */
  async validateCategories(input: ProductChange) {
    if (input.kind !== "category_add") return;
    const eligible = await this.db
      .prepare(
        "SELECT 1 FROM categories WHERE id=? AND is_active=1 AND is_rankable=1",
      )
      .bind(input.categoryId)
      .first();
    if (!eligible)
      throw new ApplicationError(
        "CATEGORY_UNAVAILABLE",
        "That category is retired or no longer ranked. Reject this proposal instead.",
        409,
      );
  }
  async validateRelationships(snapshot: ProductSnapshot, input: ProductChange) {
    if (input.kind !== "relationships") return;
    if (input.productFamilyId) {
      const family = await this.db
        .prepare(
          "SELECT id FROM product_families WHERE id=? AND (brand_id IS NULL OR brand_id=?)",
        )
        .bind(input.productFamilyId, snapshot.brandId)
        .first();
      if (!family)
        throw new ApplicationError(
          "INVALID_FAMILY",
          "Choose a family belonging to this brand.",
        );
    }
    if (input.relatedProductId) {
      const related = await this.db
        .prepare(
          "SELECT id FROM products WHERE id=? AND country_id=? AND lifecycle_status<>'hidden'",
        )
        .bind(input.relatedProductId, snapshot.countryId)
        .first();
      if (!related)
        throw new ApplicationError(
          "INVALID_RELATIONSHIP",
          "Related variants must belong to this country. Use families for cross-country equivalents.",
        );
    }
  }
  async acceptProposal(
    action: ActionWrite,
    proposal: ProposalRecord,
    snapshot: ProductSnapshot,
    plan: ChangePlan,
    images: StagedAttachment[],
    evidenceReceiptId: string | undefined,
    evidenceToken: string | undefined,
    receipt: ReceiptWrite,
    support?: { confirmations: number },
  ) {
    const guard: DecisionGuard = {
      sql: "EXISTS(SELECT 1 FROM edit_proposals WHERE id=? AND status='pending' AND updated_at=?) AND EXISTS(SELECT 1 FROM catalog_revisions WHERE product_id=? AND revision=?)",
      values: [
        proposal.id,
        proposal.updated_at,
        snapshot.id,
        snapshot.revision,
      ],
    };
    if (plan.after.familyId) {
      guard.sql +=
        " AND EXISTS(SELECT 1 FROM product_families WHERE id=? AND (brand_id IS NULL OR brand_id=?))";
      guard.values.push(plan.after.familyId, snapshot.brandId);
    }
    // Only newly linked products must be visible. Existing links to a later
    // archived duplicate are preserved history and stay valid for reversal.
    const added = [
      ...new Set(
        (plan.after.relationships ?? [])
          .map((r) => r.productId)
          .filter(
            (id) => !snapshot.relationships.some((r) => r.productId === id),
          ),
      ),
    ];
    // Automatic acceptance relies on active confirmations at commit time, so
    // a confirmer suspended meanwhile no longer counts.
    if (support) {
      guard.sql += ` AND ${ACTIVE_RESPONSES("confirm")}>=? AND ${ACTIVE_RESPONSES("disagree")}=0`;
      guard.values.push(proposal.id, support.confirmations, proposal.id);
    }
    // A renamed product must own its new identity key, not lose a race for it.
    if (plan.after.identityKey) {
      guard.sql +=
        " AND NOT EXISTS(SELECT 1 FROM product_identity_keys WHERE identity_key=? AND product_id<>?)";
      guard.values.push(plan.after.identityKey, snapshot.id);
    }
    // Fences a retirement that lands between validation and this batch.
    const categories = [...new Set(plan.after.addedCategories ?? [])];
    if (categories.length) {
      guard.sql +=
        " AND (SELECT COUNT(*) FROM categories WHERE id IN(SELECT value FROM json_each(?)) AND is_active=1 AND is_rankable=1)=?";
      guard.values.push(JSON.stringify(categories), categories.length);
    }
    if (added.length) {
      guard.sql +=
        " AND (SELECT COUNT(*) FROM products WHERE id IN(SELECT value FROM json_each(?)) AND country_id=? AND lifecycle_status<>'hidden')=?";
      guard.values.push(
        JSON.stringify(added),
        snapshot.countryId,
        added.length,
      );
    }
    if (evidenceReceiptId) {
      guard.sql +=
        " AND EXISTS(SELECT 1 FROM submission_receipts WHERE id=? AND state='publishing' AND active_token=? AND lease_expires_at>?)";
      guard.values.push(evidenceReceiptId, evidenceToken ?? null, action.now);
    }
    return this.repository.commit(
      action,
      guard,
      (fence) => [
        ...this.patchStatements(
          snapshot,
          plan.after,
          action.actor,
          action.now,
          fence,
          plan.newFormula,
          images,
          // Promoted evidence belongs to the contributor who uploaded it.
          proposal.submitted_by,
        ),
        this.db
          .prepare(
            `UPDATE edit_proposals SET status='accepted',resolved_by=?,resolution_note=?,resolved_at=?,updated_at=? WHERE id=? AND ${fence.sql}`,
          )
          .bind(
            action.actor.id,
            action.note,
            action.now,
            action.now,
            proposal.id,
            ...fence.values,
          ),
        ...(evidenceReceiptId
          ? [
              this.db
                .prepare(
                  `UPDATE submission_receipts SET state='published',product_id=?,active_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND ${fence.sql}`,
                )
                .bind(
                  snapshot.id,
                  action.now,
                  evidenceReceiptId,
                  ...fence.values,
                ),
            ]
          : []),
      ],
      receipt,
    );
  }
  patchStatements(
    snapshot: ProductSnapshot,
    patch: CatalogPatch,
    actor: Actor,
    now: number,
    fence: DecisionGuard,
    newFormula?: NewFormula,
    images: StagedAttachment[] = [],
    imagesSubmittedBy = actor.id,
  ) {
    const statements: D1PreparedStatement[] = [];
    const { sql, values } = fence;
    if (patch.currentVersionId) {
      statements.push(
        this.db
          .prepare(
            `UPDATE product_versions SET is_current=0,updated_at=? WHERE product_id=? AND is_current=1 AND ${sql}`,
          )
          .bind(now, snapshot.id, ...values),
      );
      if (newFormula)
        statements.push(
          this.db
            .prepare(
              `INSERT INTO product_versions(id,product_id,version_label,is_current,effective_from,effective_date,effective_date_precision,change_summary,created_by,created_at,updated_at) SELECT ?,?,?,1,?,?,?,?,?,?,? WHERE ${sql}`,
            )
            .bind(
              newFormula.id,
              snapshot.id,
              newFormula.label,
              newFormula.date.timestamp,
              newFormula.date.date,
              newFormula.date.precision,
              newFormula.summary,
              actor.id,
              now,
              now,
              ...values,
            ),
        );
      else
        statements.push(
          this.db
            .prepare(
              `UPDATE product_versions SET is_current=1,updated_at=? WHERE id=? AND product_id=? AND ${sql}`,
            )
            .bind(now, patch.currentVersionId, snapshot.id, ...values),
        );
    }
    if (patch.classification) {
      const c = patch.classification.value;
      if (c)
        statements.push(
          this.db
            .prepare(
              `INSERT INTO formula_classifications(product_version_id,vegan_status,manufacturer_label,evidence_data,certifications,reviewed_by,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${sql}
        ON CONFLICT(product_version_id) DO UPDATE SET vegan_status=excluded.vegan_status,manufacturer_label=excluded.manufacturer_label,evidence_data=excluded.evidence_data,certifications=excluded.certifications,reviewed_by=excluded.reviewed_by,updated_at=excluded.updated_at`,
            )
            .bind(
              patch.classification.versionId,
              c.veganStatus,
              c.manufacturerLabel,
              JSON.stringify(c.evidence),
              JSON.stringify(c.certifications),
              c.reviewedBy,
              now,
              ...values,
            ),
        );
      else
        statements.push(
          this.db
            .prepare(
              `DELETE FROM formula_classifications WHERE product_version_id=? AND ${sql}`,
            )
            .bind(patch.classification.versionId, ...values),
        );
    }
    if (patch.currentVersionId || patch.classification)
      statements.push(
        this.db
          .prepare(
            `UPDATE products SET vegan_status=COALESCE((SELECT f.vegan_status FROM formula_classifications f JOIN product_versions v ON v.id=f.product_version_id WHERE v.product_id=products.id AND v.is_current=1),?),manufacturer_label=COALESCE((SELECT f.manufacturer_label FROM formula_classifications f JOIN product_versions v ON v.id=f.product_version_id WHERE v.product_id=products.id AND v.is_current=1),?),updated_at=? WHERE id=? AND ${sql}`,
          )
          .bind(
            patch.legacyProjection?.veganStatus ?? snapshot.veganStatus,
            patch.legacyProjection?.manufacturerLabel ??
              snapshot.manufacturerLabel,
            now,
            snapshot.id,
            ...values,
          ),
      );
    if (patch.lifecycleStatus !== undefined)
      statements.push(
        this.db
          .prepare(
            `UPDATE products SET lifecycle_status=?,updated_at=? WHERE id=? AND ${sql}`,
          )
          .bind(patch.lifecycleStatus, now, snapshot.id, ...values),
      );
    if (patch.familyId !== undefined)
      statements.push(
        this.db
          .prepare(
            `UPDATE products SET product_family_id=?,updated_at=? WHERE id=? AND ${sql}`,
          )
          .bind(patch.familyId, now, snapshot.id, ...values),
      );
    for (const c of patch.categories ?? [])
      statements.push(
        this.db
          .prepare(
            `UPDATE product_categories SET ranking_eligible=?,updated_at=? WHERE product_id=? AND category_id=? AND ${sql}`,
          )
          .bind(Number(c.eligible), now, snapshot.id, c.categoryId, ...values),
      );
    if (patch.relationships) {
      statements.push(
        this.db
          .prepare(
            `DELETE FROM product_relationships WHERE from_product_id=? AND ${sql}`,
          )
          .bind(snapshot.id, ...values),
      );
      for (const r of patch.relationships)
        statements.push(
          this.db
            .prepare(
              `INSERT INTO product_relationships(from_product_id,to_product_id,relation_type,created_by,created_at) SELECT ?,?,?,?,? WHERE ${sql}`,
            )
            .bind(snapshot.id, r.productId, r.type, actor.id, now, ...values),
        );
      statements.push(
        this.db
          .prepare(
            `UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=? AND ${sql}`,
          )
          .bind(snapshot.id, ...values),
      );
    }
    // Free unique accepted slots before activating the desired replacement set.
    for (const image of patch.imageStates ?? [])
      if (image.state !== "accepted")
        statements.push(
          this.db
            .prepare(
              `UPDATE product_images SET state=?,updated_at=? WHERE id=? AND ${sql}`,
            )
            .bind(image.state, now, image.id, ...values),
        );
    for (const image of patch.imageStates ?? [])
      if (image.state === "accepted")
        statements.push(
          this.db
            .prepare(
              `UPDATE product_images SET state='accepted',updated_at=? WHERE id=? AND ${sql}`,
            )
            .bind(now, image.id, ...values),
        );
    for (const comment of patch.commentStates ?? [])
      statements.push(
        this.db
          .prepare(
            `UPDATE comments SET moderation_state=?,updated_at=max(updated_at+1,?) WHERE id=? AND product_id=? AND ${sql}`,
          )
          .bind(comment.state, now, comment.id, snapshot.id, ...values),
      );
    if (images.length)
      statements.push(
        ...imageInsertStatements(
          this.db,
          patch.currentVersionId ?? snapshot.versionId,
          imagesSubmittedBy,
          images,
          now,
          sql,
          values.filter((v): v is string | number => v !== null),
        ),
      );
    if (patch.retailer) {
      statements.push(
        this.db
          .prepare(
            `UPDATE product_retailers SET status=?,updated_at=? WHERE product_id=? AND retailer_id=? AND ${sql}`,
          )
          .bind(
            patch.retailer.status,
            now,
            snapshot.id,
            patch.retailer.retailerId,
            ...values,
          ),
      );
      statements.push(
        this.db
          .prepare(
            `UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=? AND ${sql}`,
          )
          .bind(snapshot.id, ...values),
      );
    }
    if (patch.name !== undefined)
      statements.push(
        this.db
          .prepare(
            `UPDATE products SET name=?,updated_at=? WHERE id=? AND ${sql}`,
          )
          .bind(patch.name, now, snapshot.id, ...values),
      );
    // The new name also identifies the product for duplicate checks; earlier
    // keys stay so the former name still resolves to the same product.
    if (patch.identityKey)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO product_identity_keys(identity_key,product_id) SELECT ?,? WHERE ${sql} ON CONFLICT(identity_key) DO NOTHING`,
          )
          .bind(patch.identityKey, snapshot.id, ...values),
      );
    if (patch.manufacturerUrl !== undefined)
      statements.push(
        this.db
          .prepare(
            `UPDATE products SET manufacturer_url=?,updated_at=? WHERE id=? AND ${sql}`,
          )
          .bind(patch.manufacturerUrl, now, snapshot.id, ...values),
      );
    if (patch.aliases) {
      const aliases = JSON.stringify(patch.aliases);
      statements.push(
        this.db
          .prepare(
            `DELETE FROM product_aliases WHERE product_id=? AND alias COLLATE NOCASE NOT IN (SELECT value FROM json_each(?)) AND ${sql}`,
          )
          .bind(snapshot.id, aliases, ...values),
        this.db
          .prepare(
            `INSERT INTO product_aliases(id,product_id,alias,created_at) SELECT lower(hex(randomblob(16))),?,value,? FROM json_each(?) WHERE ${sql} ON CONFLICT DO NOTHING`,
          )
          .bind(snapshot.id, now, aliases, ...values),
        this.db
          .prepare(
            `UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=? AND ${sql}`,
          )
          .bind(snapshot.id, ...values),
      );
    }
    if (patch.addedCategories?.length)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO product_categories(product_id,category_id,ranking_eligible,created_by,created_at,updated_at)
            SELECT ?,c.id,1,?,?,? FROM categories c JOIN json_each(?) j ON j.value=c.id WHERE c.is_active=1 AND c.is_rankable=1 AND ${sql}
            ON CONFLICT(product_id,category_id) DO UPDATE SET ranking_eligible=1,updated_at=excluded.updated_at`,
          )
          .bind(
            snapshot.id,
            actor.id,
            now,
            now,
            JSON.stringify(patch.addedCategories),
            ...values,
          ),
      );
    if (patch.removedCategories?.length) {
      const removed = JSON.stringify(patch.removedCategories);
      // Ratings keep their membership; only an unrated link is removed.
      statements.push(
        this.db
          .prepare(
            `UPDATE product_categories SET ranking_eligible=0,updated_at=? WHERE product_id=? AND category_id IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM ratings r JOIN product_versions v ON v.id=r.product_version_id WHERE v.product_id=product_categories.product_id AND r.category_id=product_categories.category_id) AND ${sql}`,
          )
          .bind(now, snapshot.id, removed, ...values),
        this.db
          .prepare(
            `DELETE FROM product_categories WHERE product_id=? AND category_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM ratings r JOIN product_versions v ON v.id=r.product_version_id WHERE v.product_id=product_categories.product_id AND r.category_id=product_categories.category_id) AND ${sql}`,
          )
          .bind(snapshot.id, removed, ...values),
      );
    }
    if (patch.allergens) {
      const { versionId, value } = patch.allergens;
      // Rows go first: a "none declared" declaration may not keep any.
      statements.push(
        this.db
          .prepare(
            `DELETE FROM product_version_allergens WHERE product_version_id=? AND ${sql}`,
          )
          .bind(versionId, ...values),
      );
      if (!value)
        statements.push(
          this.db
            .prepare(
              `DELETE FROM product_version_allergen_declarations WHERE product_version_id=? AND ${sql}`,
            )
            .bind(versionId, ...values),
        );
      else {
        statements.push(
          this.db
            .prepare(
              `INSERT INTO product_version_allergen_declarations(product_version_id,status,evidence_data,source_proposal_id,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${sql}
            ON CONFLICT(product_version_id) DO UPDATE SET status=excluded.status,evidence_data=excluded.evidence_data,source_proposal_id=excluded.source_proposal_id,updated_at=excluded.updated_at`,
            )
            .bind(
              versionId,
              value.status,
              JSON.stringify(value.evidence ?? {}),
              value.proposalId ?? null,
              now,
              now,
              ...values,
            ),
        );
        if (value.status === "declared")
          statements.push(
            ...[
              ...value.contains.map((key) => [key, "contains"] as const),
              ...value.mayContain.map((key) => [key, "may_contain"] as const),
            ].map(([key, presence]) =>
              this.db
                .prepare(
                  `INSERT INTO product_version_allergens(product_version_id,allergen_key,presence) SELECT ?,?,? WHERE ${sql}`,
                )
                .bind(versionId, key, presence, ...values),
            ),
          );
      }
    }
    if (patch.consolidation && !patch.consolidation.active)
      statements.push(
        this.db
          .prepare(
            `UPDATE duplicate_consolidations SET active=0 WHERE donor_id=? AND ${sql}`,
          )
          .bind(snapshot.id, ...values),
      );
    // The search document holds names, aliases, brand and categories.
    if (
      patch.lifecycleStatus !== undefined ||
      patch.name !== undefined ||
      patch.aliases ||
      patch.addedCategories?.length ||
      patch.removedCategories?.length
    )
      statements.push(
        ...productSearchStatements(
          this.db,
          snapshot.id,
          sql,
          values.filter((v): v is string | number => v !== null),
        ),
      );
    return statements;
  }
  async acceptRetailer(
    action: ActionWrite,
    proposal: ProposalRecord,
    input: RetailerInput,
    receipt: ReceiptWrite,
  ) {
    const aliases = [
      ...new Set([input.name, ...input.aliases].map(normalizeName)),
    ];
    const guard: DecisionGuard = {
      sql: `EXISTS(SELECT 1 FROM edit_proposals WHERE id=? AND status='pending' AND updated_at=?) AND NOT EXISTS(SELECT 1 FROM retailers WHERE normalized_name IN (${aliases.map(() => "?").join(",")})) AND NOT EXISTS(SELECT 1 FROM retailer_aliases WHERE normalized_name IN (${aliases.map(() => "?").join(",")}))`,
      values: [proposal.id, proposal.updated_at, ...aliases, ...aliases],
    };
    return this.repository.commit(
      action,
      guard,
      (fence) => [
        this.db
          .prepare(
            `INSERT INTO retailers(id,canonical_name,normalized_name,slug,website_url,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${fence.sql}`,
          )
          .bind(
            proposal.target_id,
            input.name,
            normalizeName(input.name),
            `${slug(input.name)}-${proposal.target_id.slice(-8)}`,
            input.websiteUrl,
            action.now,
            action.now,
            ...fence.values,
          ),
        ...[
          ...new Map(
            [input.name, ...input.aliases].map((name) => [
              normalizeName(name),
              name,
            ]),
          ).entries(),
        ].map(([normalized, name]) =>
          this.db
            .prepare(
              `INSERT INTO retailer_aliases(normalized_name,alias,retailer_id) SELECT ?,?,? WHERE ${fence.sql}`,
            )
            .bind(normalized, name, proposal.target_id, ...fence.values),
        ),
        this.db
          .prepare(
            `INSERT INTO retailer_markets(retailer_id,country_id,created_at,updated_at) SELECT ?,id,?,? FROM countries WHERE iso2='US' AND is_active=1 AND ${fence.sql}`,
          )
          .bind(proposal.target_id, action.now, action.now, ...fence.values),
        this.db
          .prepare(
            `UPDATE edit_proposals SET status='accepted',resolved_by=?,resolution_note=?,resolved_at=?,updated_at=? WHERE id=? AND ${fence.sql}`,
          )
          .bind(
            action.actor.id,
            action.note,
            action.now,
            action.now,
            proposal.id,
            ...fence.values,
          ),
      ],
      receipt,
    );
  }
}
