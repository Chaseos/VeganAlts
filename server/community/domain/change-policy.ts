import { ApplicationError } from "../../shared/domain/errors";
import type { ProductChange } from "./contracts";
import type {
  CatalogPatch,
  FormulaClassification,
  ProductSnapshot,
} from "./moderation";
import { effectiveDate } from "./policy";

export interface NewFormula {
  id: string;
  label: string;
  date: ReturnType<typeof effectiveDate>;
  summary: string;
}
export interface ChangePlan {
  before: CatalogPatch;
  after: CatalogPatch;
  newFormula?: NewFormula;
}
export function hasCatalogChanges(value: unknown) {
  return Boolean(
    value &&
    typeof value === "object" &&
    [
      "lifecycleStatus",
      "currentVersionId",
      "classification",
      "familyId",
      "categories",
      "imageStates",
      "relationships",
      "retailer",
      "consolidation",
    ].some((key) => Object.hasOwn(value, key)),
  );
}
export function planProductChange(
  snapshot: ProductSnapshot,
  input: ProductChange,
  actorId: string,
  newVersionId: string,
): ChangePlan {
  if (snapshot.lifecycleStatus === "hidden")
    throw new ApplicationError(
      "ARCHIVED_PRODUCT",
      "Archived products cannot receive catalog changes.",
      409,
    );
  if (snapshot.revision !== input.expectedRevision)
    throw new ApplicationError(
      "STALE_PRODUCT",
      "The catalog changed after this proposal was drafted. Request a fresh proposal.",
      409,
    );
  const before: CatalogPatch = {},
    after: CatalogPatch = {};
  if (["classification", "reformulation", "reintroduce"].includes(input.kind))
    before.legacyProjection = {
      veganStatus: snapshot.veganStatus,
      manufacturerLabel: snapshot.manufacturerLabel,
    };
  let newFormula: NewFormula | undefined;
  const classification = (versionId: string): FormulaClassification => {
    if (!("veganStatus" in input))
      throw new Error("Classification requires formula fields.");
    return {
      veganStatus: input.veganStatus,
      manufacturerLabel: input.manufacturerLabel,
      evidence: input.evidence,
      certifications: input.certifications,
      reviewedBy: actorId,
    };
  };
  switch (input.kind) {
    case "reformulation":
    case "reintroduce": {
      if (
        input.kind === "reintroduce" &&
        snapshot.lifecycleStatus !== "discontinued"
      )
        throw new ApplicationError(
          "INVALID_LIFECYCLE",
          "Only discontinued products can be reintroduced.",
          409,
        );
      if (
        input.kind === "reformulation" &&
        snapshot.lifecycleStatus === "discontinued"
      )
        throw new ApplicationError(
          "INVALID_LIFECYCLE",
          "Use reintroduction for a discontinued product.",
          409,
        );
      const same = input.kind === "reintroduce" && input.sameFormula;
      before.lifecycleStatus = snapshot.lifecycleStatus;
      after.lifecycleStatus = "active";
      if (!same) {
        before.currentVersionId = snapshot.versionId;
        after.currentVersionId = newVersionId;
        newFormula = {
          id: newVersionId,
          label: input.versionLabel,
          date: effectiveDate(input.effectiveDate),
          summary: input.evidence.note,
        };
        after.classification = {
          versionId: newVersionId,
          value: classification(newVersionId),
        };
        // Reversing formula publication changes only the current pointer. The
        // new formula and every contribution to it remain durable history.
      } else {
        before.classification = {
          versionId: snapshot.versionId,
          value: snapshot.classification,
        };
        after.classification = {
          versionId: snapshot.versionId,
          value: classification(snapshot.versionId),
        };
      }
      break;
    }
    case "classification":
      before.classification = {
        versionId: snapshot.versionId,
        value: snapshot.classification,
      };
      after.classification = {
        versionId: snapshot.versionId,
        value: classification(snapshot.versionId),
      };
      break;
    case "discontinue":
      if (snapshot.lifecycleStatus === "discontinued")
        throw new ApplicationError(
          "INVALID_LIFECYCLE",
          "This product is already discontinued.",
          409,
        );
      before.lifecycleStatus = snapshot.lifecycleStatus;
      after.lifecycleStatus = "discontinued";
      break;
    case "packaging":
      break;
    case "retailer_status": {
      const current = snapshot.retailers.find(
        (r) => r.retailerId === input.retailerId,
      );
      if (!current)
        throw new ApplicationError(
          "INVALID_RETAILER",
          "No relationship exists for that retailer.",
        );
      before.retailer = current;
      after.retailer = { retailerId: input.retailerId, status: input.status };
      break;
    }
    case "relationships":
      if (
        new Set(input.categoryEligibility.map((c) => c.categoryId)).size !==
          input.categoryEligibility.length ||
        input.categoryEligibility.some(
          (c) =>
            !snapshot.categories.some(
              (current) => current.categoryId === c.categoryId,
            ),
        )
      )
        throw new ApplicationError(
          "INVALID_CATEGORY",
          "Change eligibility only for existing product categories.",
        );
      if (
        Boolean(input.relatedProductId) !== Boolean(input.relationship) ||
        input.relatedProductId === snapshot.id
      )
        throw new ApplicationError(
          "INVALID_RELATIONSHIP",
          "Choose a different related product and a relationship.",
        );
      before.familyId = snapshot.familyId;
      after.familyId = input.productFamilyId;
      before.categories = snapshot.categories.filter((c) =>
        input.categoryEligibility.some((v) => v.categoryId === c.categoryId),
      );
      after.categories = input.categoryEligibility;
      if (input.relatedProductId && input.relationship) {
        before.relationships = snapshot.relationships;
        after.relationships = [
          ...snapshot.relationships.filter(
            (r) =>
              r.productId !== input.relatedProductId ||
              r.type !== input.relationship,
          ),
          { productId: input.relatedProductId, type: input.relationship },
        ].sort(
          (a, b) =>
            a.productId.localeCompare(b.productId) ||
            a.type.localeCompare(b.type),
        );
      }
      break;
  }
  return { before, after, newFormula };
}

export function assertCompensable(
  snapshot: ProductSnapshot,
  patch: CatalogPatch,
) {
  const conflict = () => {
    throw new ApplicationError(
      "REVERSAL_CONFLICT",
      "A later catalog change overlaps this action. Review the newer changes before reversing it.",
      409,
    );
  };
  if (
    patch.lifecycleStatus !== undefined &&
    patch.lifecycleStatus !== snapshot.lifecycleStatus
  )
    conflict();
  if (patch.currentVersionId && patch.currentVersionId !== snapshot.versionId)
    conflict();
  if (
    patch.classification &&
    (patch.classification.versionId !== snapshot.versionId ||
      JSON.stringify(patch.classification.value) !==
        JSON.stringify(snapshot.classification))
  )
    conflict();
  if (patch.familyId !== undefined && patch.familyId !== snapshot.familyId)
    conflict();
  if (
    patch.categories?.some(
      (c) =>
        snapshot.categories.find((x) => x.categoryId === c.categoryId)
          ?.eligible !== c.eligible,
    )
  )
    conflict();
  if (
    patch.imageStates?.some(
      (i) => snapshot.images.find((x) => x.id === i.id)?.state !== i.state,
    )
  )
    conflict();
  if (
    patch.retailer &&
    snapshot.retailers.find((r) => r.retailerId === patch.retailer!.retailerId)
      ?.status !== patch.retailer.status
  )
    conflict();
  if (
    patch.relationships &&
    JSON.stringify(patch.relationships) !==
      JSON.stringify(snapshot.relationships)
  )
    conflict();
}
