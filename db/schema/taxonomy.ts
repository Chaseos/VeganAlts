import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
import { categories, countries, profiles } from "./app";
import { moderationActions } from "./community";

// Contributor proposals for a missing rankable category; always operator-reviewed.
export const categoryProposals = sqliteTable(
  "category_proposals",
  {
    id: text("id").primaryKey(),
    submittedBy: text("submitted_by")
      .notNull()
      .references(() => profiles.userId, { onDelete: "restrict" }),
    name: text("name").notNull(),
    parentId: text("parent_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    countryId: text("country_id").references(() => countries.id, {
      onDelete: "set null",
    }),
    explanation: text("explanation").notNull(),
    proposedData: text("proposed_data").notNull(),
    status: text("status").notNull().default("pending"),
    resolvedBy: text("resolved_by").references(() => profiles.userId, {
      onDelete: "set null",
    }),
    resolutionNote: text("resolution_note"),
    resolvedCategoryId: text("resolved_category_id").references(
      () => categories.id,
      { onDelete: "set null" },
    ),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (t) => [
    index("ix_category_proposals_queue").on(t.status, t.createdAt),
    index("ix_category_proposals_user").on(t.submittedBy, t.createdAt),
    check(
      "ck_category_proposals_status",
      sql`${t.status} IN ('pending','accepted','aliased','rejected')`,
    ),
    check("ck_category_proposals_data", sql`json_valid(${t.proposedData})`),
  ],
);

// A renamed slug keeps redirecting to its category.
export const categorySlugHistory = sqliteTable("category_slug_history", {
  oldSlug: text("old_slug").primaryKey(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "restrict" }),
  createdAt: integer("created_at").notNull(),
});

// A transfer merge: resumable pages, then a reversible completed state.
export const categoryMerges = sqliteTable(
  "category_merges",
  {
    id: text("id").primaryKey(),
    donorId: text("donor_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    survivorId: text("survivor_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    actionId: text("action_id")
      .notNull()
      .references(() => moderationActions.id, { onDelete: "restrict" }),
    state: text("state").notNull(),
    active: integer("active").notNull().default(1),
    pageToken: text("page_token"),
    finalizeData: text("finalize_data"),
    reversedBy: text("reversed_by"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("ux_category_merge_active_donor")
      .on(t.donorId)
      .where(sql`${t.active} = 1`),
    index("ix_category_merge_survivor").on(t.survivorId, t.active),
    check("ck_category_merge_different", sql`${t.donorId} <> ${t.survivorId}`),
    check(
      "ck_category_merge_state",
      sql`${t.state} IN ('transferring','complete','reversing','reversed')`,
    ),
    check(
      "ck_category_merge_finalize",
      sql`${t.finalizeData} IS NULL OR json_valid(${t.finalizeData})`,
    ),
  ],
);

// Every row a merge changed, with its prior values, so reversal is exact.
export const categoryMergeMoves = sqliteTable(
  "category_merge_moves",
  {
    mergeId: text("merge_id")
      .notNull()
      .references(() => categoryMerges.id, { onDelete: "restrict" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    productId: text("product_id"),
    role: text("role").notNull(),
    partnerId: text("partner_id"),
    priorCounted: integer("prior_counted"),
    priorEligible: integer("prior_eligible"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.mergeId, t.entityType, t.entityId] }),
    index("ix_category_merge_moves_role").on(t.mergeId, t.role),
    check(
      "ck_category_merge_move_type",
      sql`${t.entityType} IN ('rating','membership','comment')`,
    ),
    check(
      "ck_category_merge_move_role",
      sql`${t.role} IN ('moved','donor_wins','donor_loses','survivor_loses','membership_added','membership_existing','membership_removed','comment_moved')`,
    ),
  ],
);

// Homepage merchandising, independent of the hierarchy.
export const categoryFeatures = sqliteTable(
  "category_features",
  {
    countryId: text("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.countryId, t.categoryId] }),
    index("ix_category_features_order").on(t.countryId, t.position),
  ],
);
