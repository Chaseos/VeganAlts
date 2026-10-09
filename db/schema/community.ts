import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/sqlite-core";
import {
  brands,
  countries,
  editProposals,
  retailers,
  profiles,
  products,
  productVersions,
  reports,
} from "./app";

export const brandAliases = sqliteTable("brand_aliases", {
  normalizedName: text("normalized_name").primaryKey(),
  alias: text("alias").notNull(),
  brandId: text("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "restrict" }),
});
export const retailerAliases = sqliteTable("retailer_aliases", {
  normalizedName: text("normalized_name").primaryKey(),
  alias: text("alias").notNull(),
  retailerId: text("retailer_id")
    .notNull()
    .references(() => retailers.id, { onDelete: "restrict" }),
});
export const productIdentityKeys = sqliteTable(
  "product_identity_keys",
  {
    identityKey: text("identity_key").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
  },
  (t) => [index("ix_product_identity_product").on(t.productId)],
);

export const catalogRevisions = sqliteTable("catalog_revisions", {
  productId: text("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(0),
  writeToken: text("write_token"),
});
export const formulaClassifications = sqliteTable(
  "formula_classifications",
  {
    productVersionId: text("product_version_id")
      .primaryKey()
      .references(() => productVersions.id, { onDelete: "restrict" }),
    veganStatus: text("vegan_status").notNull(),
    manufacturerLabel: text("manufacturer_label").notNull(),
    evidenceData: text("evidence_data").notNull(),
    certifications: text("certifications").notNull().default("[]"),
    reviewedBy: text("reviewed_by").references(() => profiles.userId, {
      onDelete: "set null",
    }),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "ck_formula_classification_status",
      sql`${t.veganStatus} IN ('vegan','appears_vegan','plant_based','under_review')`,
    ),
    check(
      "ck_formula_classification_label",
      sql`${t.manufacturerLabel} IN ('vegan','plant_based','neither','unknown')`,
    ),
    check(
      "ck_formula_classification_json",
      sql`json_valid(${t.evidenceData}) AND json_valid(${t.certifications})`,
    ),
  ],
);

// Payloads stay out of these operational receipts. Only held submissions have
// a row in pending_submissions; reserved IDs are not canonical catalog records.
export const submissionReceipts = sqliteTable(
  "submission_receipts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    inputHash: text("input_hash").notNull(),
    purpose: text("purpose").notNull().default("submission"),
    state: text("state").notNull().default("staging"),
    plannedProductId: text("planned_product_id").notNull(),
    plannedVersionId: text("planned_version_id").notNull(),
    productId: text("product_id").references(() => products.id, {
      onDelete: "restrict",
    }),
    activeToken: text("active_token"),
    leaseExpiresAt: integer("lease_expires_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("ux_submission_idempotency").on(t.userId, t.idempotencyKey),
    index("ix_submission_owner_created").on(t.userId, t.createdAt, t.id),
    index("ix_submission_expiry").on(t.state, t.expiresAt),
    check(
      "ck_submission_state",
      sql`${t.state} IN ('staging','review','publishing','published','rejected','expired')`,
    ),
  ],
);
export const pendingSubmissions = sqliteTable(
  "pending_submissions",
  {
    submissionId: text("submission_id")
      .primaryKey()
      .references(() => submissionReceipts.id, { onDelete: "restrict" }),
    proposedData: text("proposed_data").notNull(),
    reasons: text("reasons").notNull(),
    revision: integer("revision").notNull().default(0),
    resolvedBy: text("resolved_by").references(() => profiles.userId, {
      onDelete: "set null",
    }),
    resolutionNote: text("resolution_note"),
    resolvedAt: integer("resolved_at"),
    supersededBy: text("superseded_by").references(
      () => submissionReceipts.id,
      {
        onDelete: "restrict",
      },
    ),
  },
  (t) => [
    uniqueIndex("ux_pending_superseded_by").on(t.supersededBy),
    check(
      "ck_pending_payload_json",
      sql`json_valid(${t.proposedData}) AND json_valid(${t.reasons})`,
    ),
  ],
);

export const stagedBlobs = sqliteTable(
  "staged_blobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    contentHash: text("content_hash").notNull(),
    profile: text("profile").notNull(),
    inputBytes: integer("input_bytes").notNull(),
    state: text("state").notNull().default("pending"),
    activeAttemptId: text("active_attempt_id"),
    derivatives: text("derivatives"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("ux_staged_content_profile").on(
      t.userId,
      t.contentHash,
      t.profile,
    ),
    check(
      "ck_staged_blob_state",
      sql`${t.state} IN ('pending','processing','complete','failed','expired')`,
    ),
  ],
);
export const stagedAttempts = sqliteTable(
  "staged_attempts",
  {
    id: text("id").primaryKey(),
    blobId: text("blob_id")
      .notNull()
      .references(() => stagedBlobs.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    state: text("state").notNull(),
    inputBytes: integer("input_bytes").notNull(),
    leaseExpiresAt: integer("lease_expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("ix_staged_attempt_budget").on(t.createdAt, t.userId),
    index("ix_staged_attempt_blob").on(t.blobId),
    index("ix_staged_attempt_leases").on(t.state, t.leaseExpiresAt),
    check(
      "ck_staged_attempt_state",
      sql`${t.state} IN ('processing','committed','abandoned')`,
    ),
  ],
);
export const submissionUploads = sqliteTable(
  "submission_uploads",
  {
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissionReceipts.id, { onDelete: "restrict" }),
    slot: text("slot").notNull(),
    blobId: text("blob_id")
      .notNull()
      .references(() => stagedBlobs.id, { onDelete: "restrict" }),
    imageId: text("image_id").notNull(),
    createdAt: integer("created_at").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.submissionId, t.slot] }),
    uniqueIndex("ux_submission_image_id").on(t.imageId),
    index("ix_submission_upload_blob").on(t.blobId),
    check(
      "ck_submission_upload_slot",
      sql`${t.slot} IN ('front','back','ingredients','nutrition','prepared')`,
    ),
  ],
);
export const stagedUploadKeys = sqliteTable(
  "staged_upload_keys",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissionReceipts.id, { onDelete: "restrict" }),
    slot: text("slot").notNull(),
    contentHash: text("content_hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.idempotencyKey] })],
);
export const mediaPromotions = sqliteTable("media_promotions", {
  objectKey: text("object_key").primaryKey(),
  imageId: text("image_id").notNull(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => submissionReceipts.id, { onDelete: "restrict" }),
  leaseToken: text("lease_token").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const communityRecovery = sqliteTable("community_recovery", {
  prefix: text("prefix").primaryKey(),
  cursor: text("cursor"),
});

export const contributionReceipts = sqliteTable(
  "contribution_receipts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    operation: text("operation").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    inputHash: text("input_hash").notNull(),
    resultData: text("result_data").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.operation, t.idempotencyKey] })],
);
export const reportEvidence = sqliteTable("report_evidence", {
  reportId: text("report_id")
    .primaryKey()
    .references(() => reports.id, { onDelete: "restrict" }),
  evidenceData: text("evidence_data").notNull().default("[]"),
  revision: integer("revision").notNull().default(0),
});
export const moderationActions = sqliteTable(
  "moderation_actions",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    targetId: text("target_id").notNull(),
    productId: text("product_id").references(() => products.id, {
      onDelete: "restrict",
    }),
    beforeData: text("before_data").notNull(),
    afterData: text("after_data").notNull(),
    note: text("note").notNull(),
    reversedBy: text("reversed_by"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("ix_moderation_action_product").on(t.productId, t.createdAt),
    // Lets operators filter automated (system actor) decisions.
    index("ix_moderation_action_actor").on(t.actorId, t.createdAt),
  ],
);
export const duplicateConsolidations = sqliteTable(
  "duplicate_consolidations",
  {
    donorId: text("donor_id")
      .primaryKey()
      .references(() => products.id, { onDelete: "restrict" }),
    survivorId: text("survivor_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    actionId: text("action_id")
      .notNull()
      .references(() => moderationActions.id, { onDelete: "restrict" }),
    active: integer("active").notNull().default(1),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("ix_duplicate_survivor").on(t.survivorId, t.active),
    check("ck_duplicate_different", sql`${t.donorId} <> ${t.survivorId}`),
  ],
);
// Automated decision records: structured answers only, never prompts or prose.
export const moderationDecisions = sqliteTable(
  "moderation_decisions",
  {
    id: text("id").primaryKey(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    kind: text("kind").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    policyVersion: integer("policy_version").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputHash: text("input_hash").notNull(),
    userId: text("user_id").references(() => profiles.userId, {
      onDelete: "restrict",
    }),
    status: text("status").notNull(),
    outcome: text("outcome"),
    charged: integer("charged").notNull().default(0),
    resultData: text("result_data"),
    reusedFrom: text("reused_from"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    errorCode: text("error_code"),
    leaseExpiresAt: integer("lease_expires_at"),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (t) => [
    index("ix_decision_subject").on(t.subjectType, t.subjectId, t.createdAt),
    index("ix_decision_reuse")
      .on(
        t.kind,
        t.schemaVersion,
        t.policyVersion,
        t.model,
        t.inputHash,
        t.createdAt,
      )
      .where(sql`${t.status} = 'completed'`),
    index("ix_decision_budget")
      .on(t.createdAt)
      .where(sql`${t.charged} = 1`),
    index("ix_decision_account_budget")
      .on(t.userId, t.createdAt)
      .where(sql`${t.charged} = 1`),
    index("ix_decision_leases")
      .on(t.leaseExpiresAt)
      .where(sql`${t.status} = 'reserved'`),
    check(
      "ck_decision_subject",
      sql`${t.subjectType} IN ('submission','comment','edit_proposal','category_proposal')`,
    ),
    check(
      "ck_decision_status",
      sql`${t.status} IN ('reserved','completed','reused','failed','over_budget')`,
    ),
    check(
      "ck_decision_outcome",
      sql`${t.outcome} IS NULL OR ${t.outcome} IN ('READY','NEEDS_REVIEW','NEEDS_CHANGES','BLOCKED')`,
    ),
    // A failed or unaccounted evaluation can never carry an approving outcome.
    check(
      "ck_decision_failure_reviews",
      sql`(${t.status} = 'reserved' AND ${t.outcome} IS NULL) OR (${t.status} IN ('completed','reused') AND ${t.outcome} IS NOT NULL) OR (${t.status} IN ('failed','over_budget') AND ${t.outcome} = 'NEEDS_REVIEW')`,
    ),
    check(
      "ck_decision_result",
      sql`${t.resultData} IS NULL OR json_valid(${t.resultData})`,
    ),
  ],
);

// Milestone 5: the shared allergen vocabulary, each country's declared-allergen
// list, and community-confirmed declarations per formula version. A version
// without a declaration is "not confirmed"; only accepted proposals write one.
export const allergens = sqliteTable(
  "allergens",
  {
    key: text("key").primaryKey(),
    label: text("label").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check(
      "ck_allergens_key",
      sql.raw(
        "key GLOB '[a-z]*' AND key NOT GLOB '*[^a-z_]*' AND length(key) BETWEEN 2 AND 30",
      ),
    ),
  ],
);
export const countryAllergens = sqliteTable(
  "country_allergens",
  {
    countryId: text("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "cascade" }),
    allergenKey: text("allergen_key")
      .notNull()
      .references(() => allergens.key, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    // The country's own wording ("Soya", "Wheat and triticale").
    label: text("label"),
  },
  (t) => [
    primaryKey({ columns: [t.countryId, t.allergenKey] }),
    index("ix_country_allergens_position").on(t.countryId, t.position),
  ],
);
export const productVersionAllergenDeclarations = sqliteTable(
  "product_version_allergen_declarations",
  {
    productVersionId: text("product_version_id")
      .primaryKey()
      .references(() => productVersions.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    evidenceData: text("evidence_data").notNull(),
    sourceProposalId: text("source_proposal_id").references(
      () => editProposals.id,
      { onDelete: "set null" },
    ),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check(
      "ck_allergen_declarations_status",
      sql.raw("status IN ('declared', 'none_declared')"),
    ),
    check(
      "ck_allergen_declarations_evidence",
      sql.raw("json_valid(evidence_data)"),
    ),
  ],
);
export const productVersionAllergens = sqliteTable(
  "product_version_allergens",
  {
    productVersionId: text("product_version_id")
      .notNull()
      .references(() => productVersionAllergenDeclarations.productVersionId, {
        onDelete: "cascade",
      }),
    allergenKey: text("allergen_key")
      .notNull()
      .references(() => allergens.key, { onDelete: "restrict" }),
    presence: text("presence").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.productVersionId, t.allergenKey] }),
    index("ix_product_version_allergens_key").on(
      t.allergenKey,
      t.productVersionId,
    ),
    check(
      "ck_product_version_allergens_presence",
      sql.raw("presence IN ('contains', 'may_contain')"),
    ),
  ],
);
