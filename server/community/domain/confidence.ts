import { wilsonInterval } from "../../shared/domain/statistics";
import type { ProductChange } from "./contracts";
import type { ProductSnapshot } from "./moderation";
import { needsClassificationReview } from "./allergens";
import { citedEvidence } from "./change-policy";

const HOUR = 3_600_000;
export const DEFAULT_AUTO_APPLY = {
  // Hours a tier 2 proposal stays open for disagreement before automation.
  minAgeHours: 24,
  // Counted ratings at which a product is "established" (MODERATION §7).
  established: 25,
  confirmations: 1,
  establishedConfirmations: 3,
  perPass: 20,
};
export type AutoApplyPolicy = typeof DEFAULT_AUTO_APPLY;
export function autoApplyPolicy(value?: string): AutoApplyPolicy {
  if (!value) return { ...DEFAULT_AUTO_APPLY };
  const overrides: unknown = JSON.parse(value);
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
    throw new Error("Invalid proposal automation policy.");
  const result = { ...DEFAULT_AUTO_APPLY };
  for (const [name, count] of Object.entries(overrides)) {
    if (
      !(name in result) ||
      !Number.isSafeInteger(count) ||
      Number(count) < (name === "minAgeHours" ? 0 : 1)
    )
      throw new Error("Invalid proposal automation value.");
    result[name as keyof AutoApplyPolicy] = Number(count);
  }
  return result;
}

export type RiskTier = 1 | 2 | 3;
const EVIDENCE_SLOTS = new Set(["ingredients", "nutrition"]);
export const established = (
  snapshot: ProductSnapshot,
  policy: AutoApplyPolicy,
) => snapshot.countedRatings >= policy.established;

/**
 * MODERATION §6–7: tiers live in domain policy, never UI. Established
 * products raise discontinuation and reintroduction to protected changes;
 * other tier 2 changes instead need more confirmations.
 */
export function riskTier(
  change: ProductChange,
  snapshot: ProductSnapshot,
  policy: AutoApplyPolicy,
  slots: readonly string[] = [],
): RiskTier {
  const mature = established(snapshot, policy);
  switch (change.kind) {
    case "classification":
    case "reformulation":
      return 3;
    case "relationships":
      return change.categoryEligibility.length ? 3 : 2;
    case "discontinue":
      return mature ? 3 : 2;
    case "reintroduce":
      return change.sameFormula && !mature ? 2 : 3;
    case "packaging":
      return slots.some((s) => EVIDENCE_SLOTS.has(s)) ? 3 : 2;
    case "photo": {
      const filled = snapshot.images.some(
        (i) =>
          i.versionId === snapshot.versionId &&
          i.slot === change.slot &&
          i.state === "accepted",
      );
      if (!filled) return 1;
      // Replacing ingredient or nutrition photos changes classification
      // evidence, so only an operator may do it.
      return EVIDENCE_SLOTS.has(change.slot) ? 3 : 2;
    }
    case "alias":
      return 1;
    case "source_url":
      return snapshot.manufacturerUrl ? 2 : 1;
    case "rename":
    case "category_add":
    case "retailer_status":
      return 2;
    case "allergens":
      // Community-confirmable only against the formula's own label photo,
      // and never when it contradicts an animal-free classification.
      return !needsClassificationReview(change.declaration) &&
        citedEvidence(snapshot).some((i) => i.id === change.citedImageId)
        ? 2
        : 3;
  }
}

// Kinds automation may apply. Retailer availability has its own confirmation
// counters; tier 3 is never automatic.
const AUTOMATIC = new Set<ProductChange["kind"]>([
  "alias",
  "source_url",
  "rename",
  "packaging",
  "photo",
  "relationships",
  "discontinue",
  "reintroduce",
  "category_add",
  "allergens",
]);

/** Lower bound of independent support; disagreement lowers it. */
export function confidence(confirms: number, disagrees: number) {
  return wilsonInterval(confirms, confirms + disagrees).lower;
}

export interface AutoAcceptInput {
  tier: RiskTier;
  change: ProductChange;
  confirms: number;
  disagrees: number;
  established: boolean;
  ageMs: number;
  decision: string | null;
}
export function autoAcceptance(
  input: AutoAcceptInput,
  policy: AutoApplyPolicy,
): { eligible: boolean; reason: string } {
  if (
    input.tier === 3 ||
    !AUTOMATIC.has(input.change.kind) ||
    (input.change.kind === "allergens" &&
      needsClassificationReview(input.change.declaration))
  )
    return { eligible: false, reason: "protected" };
  // An enabled provider's READY is required; a disabled provider or an
  // unavailable check leaves the decision to an operator.
  if (input.decision !== "READY")
    return { eligible: false, reason: "automated_check" };
  if (input.tier === 1) return { eligible: true, reason: "tier_one" };
  if (input.disagrees > 0) return { eligible: false, reason: "disagreement" };
  const needed = input.established
    ? policy.establishedConfirmations
    : policy.confirmations;
  if (input.confirms < needed)
    return { eligible: false, reason: "confirmations" };
  if (input.ageMs < policy.minAgeHours * HOUR)
    return { eligible: false, reason: "age" };
  return { eligible: true, reason: "confirmed" };
}
