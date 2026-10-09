import type {
  Certification,
  Evidence,
  ManufacturerLabel,
  VeganStatus,
} from "./contracts";
import type { AllergenDeclaration } from "./allergens";

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
  manufacturerUrl: string | null;
  aliases: string[];
  // Counted ratings on the current formula; drives adaptive protection.
  countedRatings: number;
  revision: number;
  versionId: string;
  versionLabel: string | null;
  classification: FormulaClassification | null;
  categories: { categoryId: string; eligible: boolean }[];
  images: { id: string; versionId: string; slot: string; state: string }[];
  // The current formula's declaration (null: not confirmed yet) and the
  // product country's allergen list, in its own wording.
  allergens: AllergenDeclaration | null;
  allergenList: { key: string; label: string }[];
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
  created_at: number;
  confirm_count: number;
  disagree_count: number;
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
  name?: string;
  // Identity key for a new name; added on acceptance, never removed.
  identityKey?: string;
  manufacturerUrl?: string | null;
  aliases?: string[];
  // Categories this change links or unlinks. Unlinking keeps memberships that
  // ratings reference, marked ineligible, so raw ratings are never orphaned.
  addedCategories?: string[];
  removedCategories?: string[];
  imageStates?: { id: string; state: string }[];
  // Moderation visibility of comments on this product, never their text.
  commentStates?: { id: string; state: string }[];
  relationships?: { productId: string; type: string }[];
  retailer?: { retailerId: string; status: string };
  consolidation?: { survivorId: string; active: boolean };
  // A formula's declaration; null removes it.
  allergens?: {
    versionId: string;
    value:
      | (AllergenDeclaration & { evidence?: Evidence; proposalId?: string })
      | null;
  };
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
