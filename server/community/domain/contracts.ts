import { z } from "zod";

export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const key = z.string().regex(/^[a-zA-Z0-9_-]{16,100}$/);
export const shortText = z.string().trim().min(2).max(160);
export const note = z.string().trim().min(8).max(2000);
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
export const submissionInput = z
  .object({
    name: shortText,
    brand: shortText,
    country: z.literal("US"),
    categoryIds: z
      .array(id)
      .min(1)
      .max(5)
      .refine(
        (a) => new Set(a).size === a.length,
        "Choose each category once.",
      ),
    imageSlots: z
      .array(imageSlot)
      .min(1)
      .max(3)
      .refine(
        (a) => a.includes("front") && new Set(a).size === a.length,
        "Choose one front photo and no duplicate slots.",
      ),
    ingredientUrl: evidenceUrl.optional(),
    statusBasis: note,
    noKnownAnimalIngredients: z.boolean(),
    manufacturerLabel,
    productFamilyId: id.optional(),
    relatedProductId: id.optional(),
    relationship: z
      .enum(["variant", "specialty_flavor", "companion", "successor"])
      .optional(),
    specialtyFlavor: z.boolean().default(false),
    followUp: z
      .object({
        submissionId: id,
        expectedRevision: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (v) => v.imageSlots.includes("ingredients") || Boolean(v.ingredientUrl),
    "Add an ingredient-panel photo or a manufacturer ingredient source.",
  )
  .refine(
    (v) => Boolean(v.relatedProductId) === Boolean(v.relationship),
    "Choose both a related product and relationship.",
  );
export type SubmissionInput = z.infer<typeof submissionInput>;
export const submissionIdentity = z
  .object({
    name: shortText,
    brand: shortText,
    country: z.literal("US"),
    categoryIds: z.array(id).min(1).max(5),
  })
  .strict();
export type SubmissionIdentity = z.infer<typeof submissionIdentity> &
  Pick<SubmissionInput, "productFamilyId" | "relatedProductId">;
export type Evidence = z.infer<typeof evidence>;
export type Certification = z.infer<typeof certification>;
export type VeganStatus = z.infer<typeof veganStatus>;
export type ManufacturerLabel = z.infer<typeof manufacturerLabel>;
export interface Actor {
  id: string;
  accountState: string;
  administrator: boolean;
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
  veganStatus: VeganStatus;
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
    })
    .strict(),
  z
    .object({
      ...changeBase,
      kind: z.literal("relationships"),
      productFamilyId: id.nullable(),
      relatedProductId: id.optional(),
      relationship: z
        .enum(["variant", "specialty_flavor", "companion", "successor"])
        .optional(),
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
  z
    .object({ ...changeBase, kind: z.literal("rename"), name: shortText })
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
    country: z.literal("US"),
    websiteUrl: evidenceUrl,
    aliases: z.array(shortText).max(10).default([]),
    note,
  })
  .strict();
export type RetailerInput = z.infer<typeof retailerInput>;
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
