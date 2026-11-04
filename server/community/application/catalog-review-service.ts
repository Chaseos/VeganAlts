import { z } from "zod";
import { ApplicationError } from "../../shared/domain/errors";
import type { Actor } from "../domain/contracts";
import { administrator, slug } from "../domain/policy";
import type { CatalogPatch } from "../domain/moderation";
import { ModerationRepository } from "../infrastructure/moderation-repository";
import { CatalogDecisionRepository } from "../infrastructure/catalog-decision-repository";
import { receiptWrite } from "../infrastructure/receipts";

const correction = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    decision: z.enum(["exclude", "hold", "reclassify"]),
    categoryId: z.string().min(1).optional(),
    newLineName: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().min(8).max(2000),
  })
  .strict()
  .refine((v) =>
    v.decision === "reclassify"
      ? !!v.categoryId
      : !v.categoryId && !v.newLineName,
  );

/** Owner-reviewed catalog cleanup, using the same fenced patches, history and reversal as moderation. */
export class CatalogReviewService {
  constructor(
    private readonly repository: ModerationRepository,
    private readonly catalog: CatalogDecisionRepository,
    private readonly newId: () => string,
    private readonly clock = Date.now,
  ) {}

  async apply(actor: Actor, key: string, productId: string, raw: unknown) {
    administrator(actor);
    const input = correction.parse(raw),
      now = this.clock();
    const receipt = await receiptWrite(
      actor.id,
      "catalog-review",
      key,
      { productId, ...input },
      now,
    );
    const prior = await this.repository.replay<{
      actionId: string;
      productId: string;
    }>(receipt);
    if (prior) return prior;
    const snapshot = await this.repository.snapshot(productId);
    if (
      snapshot.revision !== input.expectedRevision ||
      snapshot.lifecycleStatus === "hidden"
    )
      throw new ApplicationError(
        "STALE_PRODUCT",
        "Review the current product before applying this catalog decision.",
        409,
      );
    const before: CatalogPatch = {},
      after: CatalogPatch = {};
    const guard = {
      sql: "EXISTS(SELECT 1 FROM catalog_revisions WHERE product_id=? AND revision=?)",
      values: [productId, snapshot.revision] as (string | number | null)[],
    };
    if (input.decision === "exclude" || input.decision === "hold") {
      before.lifecycleStatus = snapshot.lifecycleStatus;
      // Holds leave public discovery and contribution pickers too, until an
      // operator resolves the missing evidence and reverses this decision.
      after.lifecycleStatus = "hidden";
    } else {
      before.categories = snapshot.categories;
      after.categories = snapshot.categories.map((c) => ({
        ...c,
        eligible: c.categoryId === input.categoryId,
      }));
      if (input.categoryId) {
        const category = await this.repository.db
          .prepare(
            "SELECT id FROM categories WHERE id=? AND is_active=1 AND is_rankable=1",
          )
          .bind(input.categoryId)
          .first();
        if (!category)
          throw new ApplicationError(
            "INVALID_CATEGORY",
            "Choose an active rankable food.",
          );
        guard.sql +=
          " AND EXISTS(SELECT 1 FROM categories WHERE id=? AND is_active=1 AND is_rankable=1)";
        guard.values.push(input.categoryId);
        if (
          !snapshot.categories.some((c) => c.categoryId === input.categoryId)
        ) {
          before.removedCategories = [input.categoryId];
          after.addedCategories = [input.categoryId];
        }
      }
      if (input.newLineName) {
        const id = `line-${this.newId()}`;
        before.familyId = snapshot.familyId;
        after.familyId = id;
        after.newLine = {
          id,
          name: input.newLineName,
          slug: `${snapshot.countryCode}-${slug(input.newLineName)}-${id.slice(-8)}`,
        };
      }
    }
    return this.repository.commit(
      {
        id: this.newId(),
        actor,
        kind: "catalog_review",
        targetId: productId,
        productId,
        before,
        after,
        note: input.note,
        now,
      },
      guard,
      (fence) =>
        this.catalog.patchStatements(snapshot, after, actor, now, fence),
      receipt,
    );
  }
}
