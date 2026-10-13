import { z } from "zod";
import { allergenDeclaration } from "./allergens";

export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const key = z.string().regex(/^[a-zA-Z0-9_-]{16,100}$/);
export const shortText = z.string().trim().min(2).max(160);
export const note = z.string().trim().min(8).max(2000);
// A flavor label on top of a line's base recipe (milestone 7): "Strawberry",
// "Spicy". The database holds the same rule.
export const flavorText = z.string().trim().min(1).max(40);
// An ISO 3166-1 alpha-2 code in either case; the country must also be active.
export const countryCode = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((value) => value.toUpperCase());
export const evidenceUrl = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an HTTPS source URL without credentials.");
export const imageSlot = z.enum([
  "front",
  "back",
  "ingredients",
  "nutrition",
  "prepared",
]);
export const manufacturerLabel = z.enum([
  "vegan",
  "plant_based",
  "neither",
  "unknown",
]);
export const veganStatus = z.enum([
  "vegan",
  "appears_vegan",
  "plant_based",
  "under_review",
]);
export const evidence = z
  .object({
    urls: z.array(evidenceUrl).max(5).default([]),
    imageIds: z.array(id).max(10).default([]),
    note,
  })
  .strict();
export const certification = z
  .object({ name: shortText, sourceUrl: evidenceUrl })
  .strict();
// A food suggested inside a submission (milestone 6): its aisle and any other
// names. It is decided by an operator before the product publishes.
export const newFood = z
  .object({
    name: shortText,
    aisleId: id,
    aliases: z.array(shortText).max(10).optional(),
  })
  .strict();
const unique = <T>(a: T[]) => new Set(a).size === a.length;
// Milestone 6: name, brand, country, a food and a front photo are required;
// everything else is optional. New fields have no defaults, so an earlier
// payload normalizes (and fingerprints) exactly as before. Milestone 7: a
// product joins a recipe line of its brand and country (`lineId`) or starts
// one (`lineName`, which defaults to the product name), with an optional
// flavor label.
export const submissionInput = z
  .object({
    name: shortText,
    brand: shortText,
    country: countryCode,
    categoryIds: z.array(id).max(5).refine(unique, "Choose each food once."),
    newFood: newFood.optional(),
    imageSlots: z
      .array(imageSlot)
      .min(1)
      .max(4)
      .refine(
        (a) => a.includes("front") && unique(a),
        "Choose one front photo and no duplicate slots.",
      ),
    ingredientUrl: evidenceUrl.optional(),
    statusBasis: z.string().trim().max(2000).optional(),
    noKnownAnimalIngredients: z.boolean().optional(),
    manufacturerLabel: manufacturerLabel.optional(),
    // Applied once the product is published (the rating to its primary food).
    rating: z.number().int().min(1).max(5).optional(),
    // The optional Tastiest answer, saved with the rating.
    enjoyment: z.number().int().min(1).max(5).optional(),
    retailerIds: z
      .array(id)
      .max(10)
      .refine(unique, "Choose each store once.")
      .optional(),
    allergens: allergenDeclaration.optional(),
    flavor: flavorText.optional(),
    lineId: id.optional(),
    lineName: shortText.optional(),
    // Sold only part of the year; absent, it follows the food's season.
    seasonal: z.boolean().optional(),
    followUp: z
      .object({
        submissionId: id,
        expectedRevision: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => {
    const foods = v.categoryIds.length + (v.newFood ? 1 : 0);
    return foods >= 1 && foods <= 5;
  }, "Choose the food it replaces (up to five foods).")
  .refine(
    (v) => !(v.lineId && v.lineName),
    "Choose a listed line or name a new one, not both.",
  )
  .refine(
    (v) => v.enjoyment === undefined || v.rating !== undefined,
    "Say how close it is before how tasty it is.",
  );
export type SubmissionInput = z.infer<typeof submissionInput>;
export const submissionIdentity = z
  .object({
    name: shortText,
    brand: shortText,
    country: countryCode,
    // Duplicate matching ignores foods; they may still be undecided.
    categoryIds: z.array(id).max(5).default([]),
    // The line chosen for a new flavor: its flavors are siblings, never
    // near-duplicates.
    lineId: id.optional(),
  })
  .strict();
export type SubmissionIdentity = z.infer<typeof submissionIdentity> &
  Pick<SubmissionInput, "retailerIds">;
export type Evidence = z.infer<typeof evidence>;
export type Certification = z.infer<typeof certification>;
export type VeganStatus = z.infer<typeof veganStatus>;
// What readers see: a formula whose ingredients no one has confirmed reads as
// "unchecked" (milestone 6). It is derived on read and never written.
export type PublicVeganStatus = VeganStatus | "unchecked";
export type ManufacturerLabel = z.infer<typeof manufacturerLabel>;
export interface Actor {
  id: string;
  accountState: string;
  administrator: boolean;
}
// A brand Add a product suggests (milestone 7), with its products here.
export interface BrandSuggestion {
  id: string;
  slug: string;
  name: string;
  productCount: number;
}
// A brand's line in a country, as "Already listed from [brand]" shows it.
export interface BrandLine {
  lineId: string;
  name: string;
  foods: { id: string; slug: string; name: string }[];
  flavors: {
    productId: string;
    slug: string;
    name: string;
    flavor: string | null;
  }[];
}
export interface Candidate {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  countryId: string;
  exact: boolean;
}
export type SubmissionDecision = {
  decision: "READY" | "NEEDS_CHANGES" | "NEEDS_REVIEW" | "BLOCKED";
  reasons: string[];
  candidates: Candidate[];
};
export interface SubmissionReceipt {
  id: string;
  user_id: string;
  input_hash: string;
  purpose: "submission" | "evidence";
  state:
    "staging" | "review" | "publishing" | "published" | "rejected" | "expired";
  planned_product_id: string;
  planned_version_id: string;
  product_id: string | null;
  active_token: string | null;
  lease_expires_at: number | null;
  created_at: number;
  updated_at: number;
  expires_at: number;
}
export interface Classification {
  veganStatus: PublicVeganStatus;
  manufacturerLabel: ManufacturerLabel;
  evidence: Evidence;
  certifications: Certification[];
  reviewed: boolean;
}

export const reportReasons = {
  product: [
    "ingredient_concern",
    "incorrect_information",
    "duplicate",
    "discontinued",
    "wrong_category",
    // Milestone 7: a flavor that doesn't exist, or one in the wrong line.
    "flavor_not_real",
    "wrong_line",
    "misleading",
    "other",
  ],
  product_image: [
    "wrong_product",
    "outdated",
    "poor_quality",
    "inappropriate",
    "copyright",
    "other",
  ],
  comment: ["spam", "harassment", "off_topic", "misleading", "other"],
} as const;
export const reportInput = z
  .object({
    targetType: z.enum(["product", "product_image", "comment"]),
    targetId: id,
    reason: z.string().max(40),
    note: z.string().trim().max(2000).default(""),
    evidenceUrls: z.array(evidenceUrl).max(5).default([]),
  })
  .strict()
  .refine(
    (v) =>
      (reportReasons[v.targetType] as readonly string[]).includes(v.reason),
    "Choose a reason appropriate for this content.",
  );
export type ReportInput = z.infer<typeof reportInput>;

export const photoReason = z.enum([
  "missing",
  "outdated_packaging",
  "blurry",
  "wrong_market",
  "incorrect",
]);
const changeBase = {
  productId: id,
  expectedRevision: z.number().int().nonnegative(),
  evidence,
  evidenceReceiptId: id.optional(),
};
const formulaFields = {
  versionLabel: shortText,
  effectiveDate: z
    .string()
    .regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/)
    .optional(),
  veganStatus,
  manufacturerLabel,
  certifications: z.array(certification).max(5).default([]),
};
export const changeInput = z.discriminatedUnion("kind", [
  z
    .object({
      ...changeBase,
      kind: z.literal("reformulation"),
      ...formulaFields,
    })
    .strict(),
  z.object({ ...changeBase, kind: z.literal("packaging") }).strict(),
  z.object({ ...changeBase, kind: z.literal("discontinue") }).strict(),
  z
    .object({
      ...changeBase,
      kind: z.literal("reintroduce"),
      sameFormula: z.boolean(),
      ...formulaFields,
    })
    .strict(),
  z
    .object({
      ...changeBase,
      kind: z.literal("classification"),
      veganStatus,
      manufacturerLabel,
      certifications: z.array(certification).max(5).default([]),
      // The formula's accepted ingredients or nutrition photo. Checking an
      // unchecked formula against it is community-confirmable.
      citedImageId: id.optional(),
    })
    .strict(),
  z
    .object({
      ...changeBase,
      kind: z.literal("relationships"),
      // A different line of the same brand and country; null keeps the
      // current one, since every product is in a line.
      productFamilyId: id.nullable(),
      relatedProductId: id.optional(),
      // Flavors are lines now (milestone 7), so only these links remain.
      relationship: z.enum(["companion", "successor"]).optional(),
      categoryEligibility: z
        .array(z.object({ categoryId: id, eligible: z.boolean() }).strict())
        .max(20),
    })
    .strict(),
  z
    .object({
      ...changeBase,
      kind: z.literal("retailer_status"),
      retailerId: id,
      status: z.enum(["active", "uncertain", "not_current"]),
    })
    .strict(),
  // Established facts: the display name (identity and URL stay stable), a
  // search alias, the manufacturer source and an additional category.
  // A rename may also set the flavor label; null marks the line's original.
  z
    .object({
      ...changeBase,
      kind: z.literal("rename"),
      name: shortText,
      flavor: flavorText.nullable().optional(),
    })
    .strict(),
  // Sold only part of the year (milestone 7).
  z
    .object({
      ...changeBase,
      kind: z.literal("seasonal"),
      seasonal: z.boolean(),
    })
    .strict(),
  z
    .object({ ...changeBase, kind: z.literal("alias"), alias: shortText })
    .strict(),
  z
    .object({ ...changeBase, kind: z.literal("source_url"), url: evidenceUrl })
    .strict(),
  z
    .object({ ...changeBase, kind: z.literal("category_add"), categoryId: id })
    .strict(),
  // What the package says about allergens, optionally citing the formula's
  // accepted ingredients or nutrition photo (which lowers the risk tier).
  z
    .object({
      ...changeBase,
      kind: z.literal("allergens"),
      declaration: allergenDeclaration,
      citedImageId: id.optional(),
    })
    .strict(),
  // One canonical photo per slot: an empty slot is filled, a filled slot gets
  // a replacement proposal. Formula evidence uses the reformulation flow.
  z
    .object({
      ...changeBase,
      kind: z.literal("photo"),
      slot: imageSlot,
      reason: photoReason,
      evidenceReceiptId: id,
    })
    .strict(),
]);
export const responseInput = z
  .object({
    stance: z.enum(["confirm", "disagree", "evidence"]),
    note: z.string().trim().max(2000).default(""),
    urls: z.array(evidenceUrl).max(5).default([]),
  })
  .strict()
  .refine(
    (v) => v.stance === "confirm" || v.note.length >= 8 || v.urls.length > 0,
    "Explain the disagreement or add an evidence source.",
  );
export type ResponseInput = z.infer<typeof responseInput>;
export type ProductChange = z.infer<typeof changeInput>;
export const retailerInput = z
  .object({
    name: shortText,
    country: countryCode,
    websiteUrl: evidenceUrl,
    aliases: z.array(shortText).max(10).default([]),
    note,
  })
  .strict();
export type RetailerInput = z.infer<typeof retailerInput>;
// A stored retailer proposal: a new retailer, or (`marketFor`) an existing
// retailer proposed for another country.
export const retailerProposal = retailerInput.extend({
  marketFor: id.optional(),
});
export type RetailerProposal = z.infer<typeof retailerProposal>;
export const reviewDecision = z
  .object({
    decision: z.enum(["accept", "reject", "resolve", "dismiss", "follow_up"]),
    expectedRevision: z.number().int().nonnegative(),
    note,
    effect: z
      .enum(["none", "under_review", "remove_image", "hide_comment"])
      .default("none"),
    expectedProductRevision: z.number().int().nonnegative().optional(),
    // The operator-reviewed classification for an accepted submission.
    veganStatus: veganStatus.optional(),
  })
  .strict();
export type ReviewDecision = z.infer<typeof reviewDecision>;
export const reviewKind = z.enum([
  "submission",
  "proposal",
  "report",
  "comment",
  "category",
]);
export type ReviewKind = z.infer<typeof reviewKind>;
export const consolidationInput = z
  .object({
    donorId: id,
    survivorId: id,
    donorRevision: z.number().int().nonnegative(),
    survivorRevision: z.number().int().nonnegative(),
    note,
  })
  .strict();
export type ConsolidationInput = z.infer<typeof consolidationInput>;
// Operator line tools (milestone 7), on a product's moderation view: move the
// product to another line of its brand and country, or to a new line, and
// rename its line. Both are audited and reversible.
export const lineMoveInput = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    lineId: id.optional(),
    newLineName: shortText.optional(),
    note,
  })
  .strict()
  .refine(
    (v) => Boolean(v.lineId) !== Boolean(v.newLineName),
    "Choose a line or name a new one.",
  );
export type LineMoveInput = z.infer<typeof lineMoveInput>;
export const lineRenameInput = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    name: shortText,
    note,
  })
  .strict();
export type LineRenameInput = z.infer<typeof lineRenameInput>;
export const inboxFilter = z.enum([
  "all",
  "confirmation",
  "high_risk",
  "comments",
  "flagged",
]);
export type InboxFilter = z.infer<typeof inboxFilter>;
export interface QueueItem {
  id: string;
  kind: ReviewKind;
  title: string;
  status: string;
  priority: number;
  createdAt: number;
  revision: number;
  tier: number | null;
  confirms: number;
  disagrees: number;
  // An automated check held, corrected or could not evaluate the item.
  flagged: number;
  // The ISO code of the catalog the item belongs to, when it has one.
  country: string | null;
}
export interface ContributionItem {
  id: string;
  kind: string;
  title: string;
  status: string;
  createdAt: number;
  resolutionNote: string | null;
  productSlug: string | null;
}
