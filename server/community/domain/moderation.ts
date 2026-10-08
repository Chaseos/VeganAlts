import type {
  Certification,
  Evidence,
  ManufacturerLabel,
  VeganStatus,
} from "./contracts";

export interface FormulaClassification {
  veganStatus: VeganStatus;
  manufacturerLabel: ManufacturerLabel;
  evidence: Evidence;
  certifications: Certification[];
  reviewedBy: string | null;
}
export interface ProductSnapshot {
  id: string;
  name: string;
  slug: string;
  countryId: string;
  brandId: string | null;
  familyId: string | null;
  lifecycleStatus: string;
  veganStatus: VeganStatus;
  manufacturerLabel: ManufacturerLabel;
  revision: number;
  versionId: string;
  versionLabel: string | null;
  classification: FormulaClassification | null;
  categories: { categoryId: string; eligible: boolean }[];
  images: { id: string; versionId: string; slot: string; state: string }[];
  relationships: { productId: string; type: string }[];
  retailers: {
    retailerId: string;
    name: string;
    status: string;
    contributorCount: number;
    disagreementCount: number;
    lastConfirmedAt: number | null;
  }[];
}
export interface ProposalRecord {
  id: string;
  submitted_by: string;
  target_type: string;
  target_id: string;
  change_type: string;
  proposed_data: string;
  baseline_data: string | null;
  status: string;
  updated_at: number;
  resolution_note: string | null;
}
// Compensation restores only catalog fields affected by a decision. Raw ratings,
// comments, trials and retailer confirmations are never copied or deleted.
export interface CatalogPatch {
  legacyProjection?: {
    veganStatus: VeganStatus;
    manufacturerLabel: ManufacturerLabel;
  };
  lifecycleStatus?: string;
  currentVersionId?: string;
  classification?: { versionId: string; value: FormulaClassification | null };
  familyId?: string | null;
  categories?: { categoryId: string; eligible: boolean }[];
  imageStates?: { id: string; state: string }[];
  relationships?: { productId: string; type: string }[];
  retailer?: { retailerId: string; status: string };
  consolidation?: { survivorId: string; active: boolean };
}
export interface ModerationAction {
  id: string;
  kind: string;
  target_id: string;
  product_id: string | null;
  before_data: string;
  after_data: string;
  note: string;
  reversed_by: string | null;
  created_at: number;
}
export type ContributorProduct = Omit<
  ProductSnapshot,
  "classification" | "images"
> & {
  classification:
    (Omit<FormulaClassification, "reviewedBy"> & { reviewed: boolean }) | null;
  images: ProductSnapshot["images"];
};
// Contributors see the same facts as public readers: reviewer identities and
// rejected or pending photos remain operator-only moderation data.
export function contributorProduct(
  snapshot: ProductSnapshot,
): ContributorProduct {
  const { classification, images, ...product } = snapshot;
  return {
    ...product,
    classification: classification && {
      veganStatus: classification.veganStatus,
      manufacturerLabel: classification.manufacturerLabel,
      evidence: classification.evidence,
      certifications: classification.certifications,
      reviewed: classification.reviewedBy !== null,
    },
    images: images.filter((i) => ["accepted", "archived"].includes(i.state)),
  };
}
