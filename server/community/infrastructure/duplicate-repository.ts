import { ApplicationError } from "../../shared/domain/errors";
import type { ConsolidationInput } from "../domain/contracts";
import type {
  CatalogPatch,
  ProductSnapshot,
  ModerationAction,
} from "../domain/moderation";
import { CatalogDecisionRepository } from "./catalog-decision-repository";
import {
  ModerationRepository,
  type ActionWrite,
} from "./moderation-repository";
import type { ReceiptWrite } from "./receipts";

export class DuplicateRepository {
  constructor(
    private readonly repository: ModerationRepository,
    private readonly catalog: CatalogDecisionRepository,
  ) {}
  private get db() {
    return this.repository.db;
  }
  async preview(donor: ProductSnapshot, survivor: ProductSnapshot) {
    this.validate(donor, survivor);
    const counts = await this.db
      .prepare(
        `SELECT
      (SELECT COUNT(*) FROM ratings r JOIN product_versions v ON v.id=r.product_version_id WHERE v.product_id=?) AS ratings,
      (SELECT COUNT(*) FROM comments c JOIN product_versions v ON v.id=c.product_version_id WHERE v.product_id=?) AS comments,
      (SELECT COUNT(*) FROM product_images i JOIN product_versions v ON v.id=i.product_version_id WHERE v.product_id=?) AS photos,
      (SELECT COUNT(*) FROM retailer_confirmations WHERE product_id=?) AS retailerConfirmations,
      (SELECT COUNT(*) FROM product_versions WHERE product_id=?) AS formulas`,
      )
      .bind(donor.id, donor.id, donor.id, donor.id, donor.id)
      .first();
    return {
      donor,
      survivor,
      archivedContributions: counts,
      policy:
        "The survivor keeps its metadata and scores. All duplicate contributions remain archived under the duplicate, with no transfer.",
    };
  }
  private validate(donor: ProductSnapshot, survivor: ProductSnapshot) {
    if (donor.id === survivor.id || donor.countryId !== survivor.countryId)
      throw new ApplicationError(
        "INVALID_DUPLICATE",
        "Choose two different products in the same country.",
      );
    if (
      donor.lifecycleStatus === "hidden" ||
      survivor.lifecycleStatus === "hidden"
    )
      throw new ApplicationError(
        "INVALID_DUPLICATE",
        "Choose two currently visible products.",
        409,
      );
  }
  async consolidate(
    action: ActionWrite,
    input: ConsolidationInput,
    donor: ProductSnapshot,
    survivor: ProductSnapshot,
    receipt: ReceiptWrite,
  ) {
    this.validate(donor, survivor);
    const guard = {
      sql: `EXISTS(SELECT 1 FROM catalog_revisions d JOIN products dp ON dp.id=d.product_id JOIN catalog_revisions s ON s.product_id=? JOIN products sp ON sp.id=s.product_id WHERE d.product_id=? AND d.revision=? AND s.revision=? AND dp.country_id=sp.country_id AND dp.lifecycle_status<>'hidden' AND sp.lifecycle_status<>'hidden') AND NOT EXISTS(SELECT 1 FROM duplicate_consolidations WHERE active=1 AND (donor_id IN (?,?) OR survivor_id=?))`,
      values: [
        survivor.id,
        donor.id,
        input.donorRevision,
        input.survivorRevision,
        donor.id,
        survivor.id,
        donor.id,
      ],
    };
    return this.repository.commit(
      action,
      guard,
      (fence) => [
        ...this.catalog.patchStatements(
          donor,
          { lifecycleStatus: "hidden" },
          action.actor,
          action.now,
          fence,
        ),
        this.db
          .prepare(
            `INSERT INTO duplicate_consolidations(donor_id,survivor_id,action_id,active,created_at) SELECT ?,?,?,1,? WHERE ${fence.sql} ON CONFLICT(donor_id) DO UPDATE SET survivor_id=excluded.survivor_id,action_id=excluded.action_id,active=1,created_at=excluded.created_at`,
          )
          .bind(donor.id, survivor.id, action.id, action.now, ...fence.values),
      ],
      receipt,
    );
  }
  async reverse(
    action: ActionWrite,
    original: ModerationAction,
    snapshot: ProductSnapshot,
    patch: CatalogPatch,
    receipt: ReceiptWrite,
  ) {
    const guard = {
      sql: "EXISTS(SELECT 1 FROM moderation_actions WHERE id=? AND reversed_by IS NULL) AND EXISTS(SELECT 1 FROM catalog_revisions WHERE product_id=? AND revision=?)",
      values: [original.id, snapshot.id, snapshot.revision],
    };
    if (original.kind === "consolidation") {
      guard.sql +=
        " AND EXISTS(SELECT 1 FROM duplicate_consolidations WHERE donor_id=? AND action_id=? AND active=1)";
      guard.values.push(snapshot.id, original.id);
    }
    return this.repository.commit(
      action,
      guard,
      (fence) => [
        ...this.catalog.patchStatements(
          snapshot,
          patch,
          action.actor,
          action.now,
          fence,
        ),
        this.db
          .prepare(
            `UPDATE moderation_actions SET reversed_by=? WHERE id=? AND ${fence.sql}`,
          )
          .bind(action.id, original.id, ...fence.values),
      ],
      receipt,
    );
  }
}
