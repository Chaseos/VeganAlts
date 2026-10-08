import {
  ApplicationError,
  assertActiveAccount,
} from "../../shared/domain/errors";
import type {
  Actor,
  SubmissionInput,
  Candidate,
  SubmissionDecision,
  VeganStatus,
} from "./contracts";

export const DAY = 86_400_000;
export const LEASE = 5 * 60_000;
export const DEFAULT_LIMITS = {
  images: 3,
  submissionBytes: 30 * 1024 * 1024,
  accountBytes: 100 * 1024 * 1024,
  submissionsPerDay: 5,
  // Evidence receipts for proposals have their own allowance.
  evidencePerDay: 10,
  concurrentUploads: 2,
  processingPerDay: 50,
  // One account cannot spend the whole environment's processing budget.
  accountProcessingPerDay: 20,
  // Unsuccessful attempts per processing key per UTC day.
  retries: 3,
  stagingRetention: DAY,
  reviewRetention: 30 * DAY,
};
export type CommunityLimits = typeof DEFAULT_LIMITS;
export function communityLimits(value?: string): CommunityLimits {
  if (!value) return { ...DEFAULT_LIMITS };
  const overrides: unknown = JSON.parse(value);
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
    throw new Error("Invalid community limits.");
  const result = { ...DEFAULT_LIMITS };
  for (const [name, count] of Object.entries(overrides)) {
    if (!(name in result) || !Number.isSafeInteger(count) || Number(count) <= 0)
      throw new Error("Invalid community limit.");
    result[name as keyof CommunityLimits] = Number(count);
  }
  return result;
}
// Application-owned account that records automated decisions (migration 0012).
export const SYSTEM_ACTOR_ID = "veganalts-system";
export const SYSTEM_ACTOR: Actor = {
  id: SYSTEM_ACTOR_ID,
  accountState: "active",
  administrator: false,
};
export function active(actor: Actor) {
  assertActiveAccount(actor);
}
export function administrator(actor: Actor) {
  active(actor);
  if (!actor.administrator)
    throw new ApplicationError(
      "FORBIDDEN",
      "Administrator access is required.",
      403,
    );
}
export function normalizeName(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[\s'’.,&()\/-]/g, "");
}
export function productName(value: string) {
  // Remove package quantities only, never flavor/formula words or bare numbers.
  return normalizeName(
    value
      .replace(
        /\b\d+(?:\.\d+)?\s*(?:fl\.?\s*oz|oz|ounces?|g|grams?|kg|ml|litres?|liters?|lbs?|pounds?)\b/gi,
        "",
      )
      .replace(/\b\d+\s*(?:pack|count|ct)\b/gi, ""),
  );
}
export function identityKey(countryId: string, brand: string, name: string) {
  return `${countryId}:${normalizeName(brand)}:${productName(name)}`;
}
export function slug(value: string) {
  return (
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 75) || "product"
  );
}
// The classification contributor evidence supports without operator review.
// Null means an operator must choose one before publication.
export function provisionalStatus(input: SubmissionInput): VeganStatus | null {
  if (input.noKnownAnimalIngredients) return "appears_vegan";
  return input.manufacturerLabel === "plant_based" ? "plant_based" : null;
}
export function decideSubmission(
  input: SubmissionInput,
  candidates: Candidate[],
): SubmissionDecision {
  if (candidates.some((c) => c.exact))
    return {
      decision: "NEEDS_CHANGES",
      reasons: [
        "This product or package-size variation is already in the catalog. Use the existing product.",
      ],
      candidates,
    };
  const reasons = [];
  if (input.followUp)
    reasons.push("Updated evidence must be reviewed by an operator.");
  if (candidates.length)
    reasons.push("A related catalog entry needs an identity check.");
  if (input.specialtyFlavor)
    reasons.push("A specialty flavor needs a category-eligibility review.");
  if (input.relatedProductId || input.productFamilyId)
    reasons.push("The proposed product relationship needs review.");
  if (!provisionalStatus(input))
    reasons.push("The ingredient classification needs review.");
  return {
    decision: reasons.length ? "NEEDS_REVIEW" : "READY",
    reasons,
    candidates,
  };
}
export function effectiveDate(value?: string) {
  if (!value) return { date: null, precision: "unknown", timestamp: null };
  const parts = value.split("-").map(Number);
  const [year, month = 1, day = 1] = parts;
  if (!year || year < 1900 || year > 2200)
    throw new ApplicationError(
      "INVALID_DATE",
      "Use an effective year between 1900 and 2200.",
    );
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new ApplicationError("INVALID_DATE", "Use a valid effective date.");
  return {
    date: value,
    precision: ["unknown", "year", "month", "day"][parts.length]!,
    timestamp: date.getTime(),
  };
}
export async function fingerprint(value: unknown) {
  const bytes =
    value instanceof Uint8Array
      ? value
      : new TextEncoder().encode(JSON.stringify(value));
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function encodeCursor(createdAt: number, id: string) {
  return btoa(JSON.stringify([createdAt, id]));
}
export function decodeCursor(value: string | null) {
  if (!value) return null;
  try {
    if (value.length > 300) throw new Error();
    const tuple: unknown = JSON.parse(atob(value));
    if (
      !Array.isArray(tuple) ||
      tuple.length !== 2 ||
      !Number.isSafeInteger(tuple[0]) ||
      typeof tuple[1] !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(tuple[1])
    )
      throw new Error();
    return { createdAt: tuple[0] as number, id: tuple[1] };
  } catch {
    throw new ApplicationError("INVALID_CURSOR", "This page link is invalid.");
  }
}
