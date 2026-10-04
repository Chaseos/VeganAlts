import { sql, desc } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
  check,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

// Authoritative application schema, translated from the retained SQL reference.
// FTS5 and cross-table integrity triggers live in reviewed custom migrations.

export const countries = sqliteTable(
  "countries",
  {
    id: text("id").primaryKey(),
    iso2: text("iso2").notNull(),
    name: text("name").notNull(),
    isActive: integer("is_active").notNull().default(sql.raw("1")),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_countries_iso2").on(table.iso2),
    check("ck_countries_1", sql.raw("is_active IN (0, 1)")),
  ],
);

export const profiles = sqliteTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references((): AnySQLiteColumn => user.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    trustLevel: integer("trust_level").notNull().default(sql.raw("0")),
    accountState: text("account_state").notNull().default(sql.raw("'active'")),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_profiles_handle").on(sql`${table.handle} COLLATE NOCASE`),
    check("ck_profiles_1", sql.raw("trust_level >= 0")),
    check(
      "ck_profiles_2",
      sql.raw("account_state IN ('active', 'restricted', 'suspended')"),
    ),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id").references(
      (): AnySQLiteColumn => categories.id,
      { onDelete: "restrict" },
    ),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    isRankable: integer("is_rankable").notNull().default(sql.raw("0")),
    isActive: integer("is_active").notNull().default(sql.raw("1")),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("ix_categories_parent_active").on(table.parentId, table.isActive),
    uniqueIndex("ux_categories_slug").on(table.slug),
    check("ck_categories_1", sql.raw("is_rankable IN (0, 1)")),
    check("ck_categories_2", sql.raw("is_active IN (0, 1)")),
  ],
);

export const categoryAliases = sqliteTable(
  "category_aliases",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references((): AnySQLiteColumn => categories.id, {
        onDelete: "cascade",
      }),
    countryId: text("country_id").references(
      (): AnySQLiteColumn => countries.id,
      { onDelete: "cascade" },
    ),
    alias: text("alias").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("ix_category_aliases_alias").on(sql`${table.alias} COLLATE NOCASE`),
    uniqueIndex("ux_category_aliases_category_id_country_id_alias").on(
      table.categoryId,
      table.countryId,
      sql`${table.alias} COLLATE NOCASE`,
    ),
    uniqueIndex("ux_category_aliases_global")
      .on(table.categoryId, sql`${table.alias} COLLATE NOCASE`)
      .where(sql`${table.countryId} IS NULL`),
  ],
);

export const categoryRatingDimensions = sqliteTable(
  "category_rating_dimensions",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references((): AnySQLiteColumn => categories.id, {
        onDelete: "cascade",
      }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(sql.raw("0")),
    isActive: integer("is_active").notNull().default(sql.raw("1")),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_category_rating_dimensions_category_id_key").on(
      table.categoryId,
      table.key,
    ),
    check("ck_category_rating_dimensions_1", sql.raw("is_active IN (0, 1)")),
  ],
);

export const brands = sqliteTable(
  "brands",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    websiteUrl: text("website_url"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("ux_brands_slug").on(table.slug)],
);

export const productFamilies = sqliteTable(
  "product_families",
  {
    id: text("id").primaryKey(),
    brandId: text("brand_id").references((): AnySQLiteColumn => brands.id, {
      onDelete: "set null",
    }),
    canonicalName: text("canonical_name").notNull(),
    slug: text("slug").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("ux_product_families_slug").on(table.slug)],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    countryId: text("country_id")
      .notNull()
      .references((): AnySQLiteColumn => countries.id, {
        onDelete: "restrict",
      }),
    brandId: text("brand_id").references((): AnySQLiteColumn => brands.id, {
      onDelete: "set null",
    }),
    productFamilyId: text("product_family_id").references(
      (): AnySQLiteColumn => productFamilies.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    productType: text("product_type")
      .notNull()
      .default(sql.raw("'packaged_food'")),
    lifecycleStatus: text("lifecycle_status")
      .notNull()
      .default(sql.raw("'active'")),
    veganStatus: text("vegan_status")
      .notNull()
      .default(sql.raw("'appears_vegan'")),
    manufacturerLabel: text("manufacturer_label")
      .notNull()
      .default(sql.raw("'unknown'")),
    manufacturerUrl: text("manufacturer_url"),
    developmentOnly: integer("development_only").notNull().default(0),
    sourceCheckedAt: integer("source_checked_at"),
    dataNotes: text("data_notes"),
    createdBy: text("created_by").references(
      (): AnySQLiteColumn => profiles.userId,
      { onDelete: "set null" },
    ),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("ix_products_brand_country").on(table.brandId, table.countryId),
    index("ix_products_country_status").on(
      table.countryId,
      table.lifecycleStatus,
      desc(table.updatedAt),
    ),
    uniqueIndex("ux_products_country_id_slug").on(table.countryId, table.slug),
    check(
      "ck_products_1",
      sql.raw(
        "product_type IN ('packaged_food', 'restaurant_item', 'recipe', 'material')",
      ),
    ),
    check(
      "ck_products_2",
      sql.raw(
        "lifecycle_status IN ('active', 'under_review', 'discontinued', 'hidden')",
      ),
    ),
    check(
      "ck_products_3",
      sql.raw(
        "vegan_status IN ('vegan', 'appears_vegan', 'plant_based', 'under_review')",
      ),
    ),
    check(
      "ck_products_4",
      sql.raw(
        "manufacturer_label IN ('vegan', 'plant_based', 'neither', 'unknown')",
      ),
    ),
    check("ck_products_development", sql`${table.developmentOnly} IN (0, 1)`),
  ],
);

export const productAliases = sqliteTable(
  "product_aliases",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references((): AnySQLiteColumn => products.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("ix_product_aliases_alias").on(sql`${table.alias} COLLATE NOCASE`),
    uniqueIndex("ux_product_aliases_product_id_alias").on(
      table.productId,
      sql`${table.alias} COLLATE NOCASE`,
    ),
  ],
);

export const productVersions = sqliteTable(
  "product_versions",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references((): AnySQLiteColumn => products.id, { onDelete: "cascade" }),
    versionLabel: text("version_label"),
    effectiveFrom: integer("effective_from"),
    effectiveTo: integer("effective_to"),
    isCurrent: integer("is_current").notNull().default(sql.raw("0")),
    changeSummary: text("change_summary"),
    createdBy: text("created_by").references(
      (): AnySQLiteColumn => profiles.userId,
      { onDelete: "set null" },
    ),
    verifiedAt: integer("verified_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_product_versions_current")
      .on(table.productId)
      .where(sql.raw("is_current = 1")),
    index("ix_product_versions_product").on(
      table.productId,
      desc(table.effectiveFrom),
    ),
    check("ck_product_versions_1", sql.raw("is_current IN (0, 1)")),
  ],
);

export const productCategories = sqliteTable(
  "product_categories",
  {
    productId: text("product_id")
      .notNull()
      .references((): AnySQLiteColumn => products.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references((): AnySQLiteColumn => categories.id, {
        onDelete: "cascade",
      }),
    rankingEligible: integer("ranking_eligible")
      .notNull()
      .default(sql.raw("1")),
    createdBy: text("created_by").references(
      (): AnySQLiteColumn => profiles.userId,
      { onDelete: "set null" },
    ),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.categoryId] }),
    index("ix_product_categories_category_eligible").on(
      table.categoryId,
      table.rankingEligible,
      table.productId,
    ),
    check("ck_product_categories_1", sql.raw("ranking_eligible IN (0, 1)")),
  ],
);

export const productRelationships = sqliteTable(
  "product_relationships",
  {
    fromProductId: text("from_product_id")
      .notNull()
      .references((): AnySQLiteColumn => products.id, { onDelete: "cascade" }),
    toProductId: text("to_product_id")
      .notNull()
      .references((): AnySQLiteColumn => products.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull(),
    createdBy: text("created_by").references(
      (): AnySQLiteColumn => profiles.userId,
      { onDelete: "set null" },
    ),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.fromProductId, table.toProductId, table.relationType],
    }),
    check(
      "ck_product_relationships_1",
      sql.raw(
        "relation_type IN ('variant', 'specialty_flavor', 'companion', 'successor')",
      ),
    ),
    check(
      "ck_product_relationships_2",
      sql.raw("from_product_id <> to_product_id"),
    ),
  ],
);

export const productTrials = sqliteTable(
  "product_trials",
  {
    userId: text("user_id")
      .notNull()
      .references((): AnySQLiteColumn => profiles.userId, {
        onDelete: "cascade",
      }),
    productVersionId: text("product_version_id")
      .notNull()
      .references((): AnySQLiteColumn => productVersions.id, {
        onDelete: "cascade",
      }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.productVersionId] }),
    index("ix_product_trials_version").on(table.productVersionId),
  ],
);

export const ratings = sqliteTable(
  "ratings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references((): AnySQLiteColumn => profiles.userId, {
        onDelete: "cascade",
      }),
    productVersionId: text("product_version_id")
      .notNull()
      .references((): AnySQLiteColumn => productVersions.id, {
        onDelete: "cascade",
      }),
    categoryId: text("category_id")
      .notNull()
      .references((): AnySQLiteColumn => categories.id, {
        onDelete: "restrict",
      }),
    overallSimilarity: integer("overall_similarity").notNull(),
    conventionalRecency: text("conventional_recency"),
    isCounted: integer("is_counted").notNull().default(sql.raw("1")),
    moderationNote: text("moderation_note"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("ix_ratings_user_updated").on(table.userId, desc(table.updatedAt)),
    index("ix_ratings_version_category_counted").on(
      table.productVersionId,
      table.categoryId,
      table.isCounted,
    ),
    uniqueIndex("ux_ratings_user_id_product_version_id_category_id").on(
      table.userId,
      table.productVersionId,
      table.categoryId,
    ),
    check(
      "ck_ratings_1",
      sql.raw(
        "typeof(overall_similarity) = 'integer' AND overall_similarity BETWEEN 1 AND 5",
      ),
    ),
    check(
      "ck_ratings_2",
      sql.raw(
        "conventional_recency IS NULL OR conventional_recency IN ( 'current_or_week', 'within_month', 'within_year', 'over_year', 'prefer_not_to_say' )",
      ),
    ),
    check("ck_ratings_3", sql.raw("is_counted IN (0, 1)")),
  ],
);

export const ratingDimensionValues = sqliteTable(
  "rating_dimension_values",
  {
    ratingId: text("rating_id")
      .notNull()
      .references((): AnySQLiteColumn => ratings.id, { onDelete: "cascade" }),
    dimensionId: text("dimension_id")
      .notNull()
      .references((): AnySQLiteColumn => categoryRatingDimensions.id, {
        onDelete: "cascade",
      }),
    score: integer("score").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ratingId, table.dimensionId] }),
    check(
      "ck_rating_dimension_values_1",
      sql.raw("typeof(score) = 'integer' AND score BETWEEN 1 AND 5"),
    ),
  ],
);

export const productCategoryStats = sqliteTable(
  "product_category_stats",
  {
    productVersionId: text("product_version_id")
      .notNull()
      .references((): AnySQLiteColumn => productVersions.id, {
        onDelete: "cascade",
      }),
    categoryId: text("category_id")
      .notNull()
      .references((): AnySQLiteColumn => categories.id, {
        onDelete: "cascade",
      }),
    ratingCount: integer("rating_count").notNull().default(sql.raw("0")),
    ratingSum: integer("rating_sum").notNull().default(sql.raw("0")),
    rawAverage: real("raw_average"),
    bayesianScore: real("bayesian_score"),
    triedCount: integer("tried_count").notNull().default(sql.raw("0")),
    recentRatingCount: integer("recent_rating_count")
      .notNull()
      .default(sql.raw("0")),
    trendingScore: real("trending_score"),
    recomputedAt: integer("recomputed_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.productVersionId, table.categoryId] }),
    index("ix_product_category_stats_trending").on(
      table.categoryId,
      desc(table.trendingScore),
    ),
    index("ix_product_category_stats_top").on(
      table.categoryId,
      desc(table.bayesianScore),
      desc(table.ratingCount),
    ),
    check("ck_product_category_stats_1", sql.raw("rating_count >= 0")),
    check("ck_product_category_stats_2", sql.raw("rating_sum >= 0")),
    check("ck_product_category_stats_3", sql.raw("tried_count >= 0")),
    check("ck_product_category_stats_4", sql.raw("recent_rating_count >= 0")),
  ],
);

export const productCategoryDailyStats = sqliteTable(
  "product_category_daily_stats",
  {
    statDate: text("stat_date").notNull(),
    productVersionId: text("product_version_id")
      .notNull()
      .references((): AnySQLiteColumn => productVersions.id, {
        onDelete: "cascade",
      }),
    categoryId: text("category_id")
      .notNull()
      .references((): AnySQLiteColumn => categories.id, {
        onDelete: "cascade",
      }),
    newRatingCount: integer("new_rating_count").notNull().default(sql.raw("0")),
    ratingSum: integer("rating_sum").notNull().default(sql.raw("0")),
    newTrialCount: integer("new_trial_count").notNull().default(sql.raw("0")),
    commentCount: integer("comment_count").notNull().default(sql.raw("0")),
  },
  (table) => [
    primaryKey({
      columns: [table.statDate, table.productVersionId, table.categoryId],
    }),
    index("ix_daily_stats_category_date").on(
      table.categoryId,
      desc(table.statDate),
    ),
    check(
      "ck_product_category_daily_stats_1",
      sql.raw("new_rating_count >= 0"),
    ),
    check("ck_product_category_daily_stats_2", sql.raw("rating_sum >= 0")),
    check("ck_product_category_daily_stats_3", sql.raw("new_trial_count >= 0")),
    check("ck_product_category_daily_stats_4", sql.raw("comment_count >= 0")),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references((): AnySQLiteColumn => profiles.userId, {
        onDelete: "cascade",
      }),
    productVersionId: text("product_version_id")
      .notNull()
      .references((): AnySQLiteColumn => productVersions.id, {
        onDelete: "cascade",
      }),
    categoryId: text("category_id").references(
      (): AnySQLiteColumn => categories.id,
      { onDelete: "set null" },
    ),
    body: text("body").notNull(),
    moderationState: text("moderation_state")
      .notNull()
      .default(sql.raw("'visible'")),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    index("ix_comments_version_created").on(
      table.productVersionId,
      desc(table.createdAt),
    ),
    check(
      "ck_comments_1",
      sql.raw("moderation_state IN ('visible', 'hidden', 'removed')"),
    ),
  ],
);

export const commentReactions = sqliteTable(
  "comment_reactions",
  {
    commentId: text("comment_id")
      .notNull()
      .references((): AnySQLiteColumn => comments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references((): AnySQLiteColumn => profiles.userId, {
        onDelete: "cascade",
      }),
    reaction: text("reaction").notNull().default(sql.raw("'helpful'")),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId, table.reaction] }),
    check("ck_comment_reactions_1", sql.raw("reaction = 'helpful'")),
  ],
);

export const retailers = sqliteTable(
  "retailers",
  {
    id: text("id").primaryKey(),
    canonicalName: text("canonical_name").notNull(),
    slug: text("slug").notNull(),
    websiteUrl: text("website_url"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("ux_retailers_slug").on(table.slug)],
);

export const retailerMarkets = sqliteTable(
  "retailer_markets",
  {
    retailerId: text("retailer_id")
      .notNull()
      .references((): AnySQLiteColumn => retailers.id, { onDelete: "cascade" }),
    countryId: text("country_id")
      .notNull()
      .references((): AnySQLiteColumn => countries.id, { onDelete: "cascade" }),
    marketName: text("market_name"),
    websiteUrl: text("website_url"),
    isActive: integer("is_active").notNull().default(sql.raw("1")),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.retailerId, table.countryId] }),
    check("ck_retailer_markets_1", sql.raw("is_active IN (0, 1)")),
  ],
);

export const productRetailers = sqliteTable(
  "product_retailers",
  {
    productId: text("product_id")
      .notNull()
      .references((): AnySQLiteColumn => products.id, { onDelete: "cascade" }),
    retailerId: text("retailer_id")
      .notNull()
      .references((): AnySQLiteColumn => retailers.id, { onDelete: "cascade" }),
    status: text("status").notNull().default(sql.raw("'active'")),
    confirmationCount: integer("confirmation_count")
      .notNull()
      .default(sql.raw("0")),
    disagreementCount: integer("disagreement_count")
      .notNull()
      .default(sql.raw("0")),
    lastConfirmedAt: integer("last_confirmed_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.retailerId] }),
    index("ix_product_retailers_product_status").on(
      table.productId,
      table.status,
    ),
    check(
      "ck_product_retailers_1",
      sql.raw("status IN ('active', 'uncertain', 'not_current')"),
    ),
    check("ck_product_retailers_2", sql.raw("confirmation_count >= 0")),
    check("ck_product_retailers_3", sql.raw("disagreement_count >= 0")),
  ],
);

export const retailerConfirmations = sqliteTable(
  "retailer_confirmations",
  {
    userId: text("user_id")
      .notNull()
      .references((): AnySQLiteColumn => profiles.userId, {
        onDelete: "cascade",
      }),
    productId: text("product_id")
      .notNull()
      .references((): AnySQLiteColumn => products.id, { onDelete: "cascade" }),
    retailerId: text("retailer_id")
      .notNull()
      .references((): AnySQLiteColumn => retailers.id, { onDelete: "cascade" }),
    stance: text("stance").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.productId, table.retailerId] }),
    check(
      "ck_retailer_confirmations_1",
      sql.raw("stance IN ('confirm', 'not_current')"),
    ),
  ],
);

export const productImages = sqliteTable(
  "product_images",
  {
    id: text("id").primaryKey(),
    productVersionId: text("product_version_id")
      .notNull()
      .references((): AnySQLiteColumn => productVersions.id, {
        onDelete: "cascade",
      }),
    slot: text("slot").notNull(),
    state: text("state").notNull().default(sql.raw("'pending'")),
    fullR2Key: text("full_r2_key").notNull(),
    thumbnailR2Key: text("thumbnail_r2_key"),
    evidenceR2Key: text("evidence_r2_key"),
    evidenceWidth: integer("evidence_width"),
    evidenceHeight: integer("evidence_height"),
    fullWidth: integer("full_width"),
    fullHeight: integer("full_height"),
    mimeType: text("mime_type").notNull().default(sql.raw("'image/webp'")),
    submittedBy: text("submitted_by").references(
      (): AnySQLiteColumn => profiles.userId,
      { onDelete: "set null" },
    ),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_product_images_accepted_slot")
      .on(table.productVersionId, table.slot)
      .where(sql.raw("state = 'accepted'")),
    index("ix_product_images_version_slot_state").on(
      table.productVersionId,
      table.slot,
      table.state,
    ),
    index("ix_product_images_full_key").on(table.fullR2Key),
    index("ix_product_images_thumbnail_key").on(table.thumbnailR2Key),
    index("ix_product_images_evidence_key").on(table.evidenceR2Key),
    check(
      "ck_product_images_1",
      sql.raw(
        "slot IN ('front', 'back', 'ingredients', 'nutrition', 'prepared')",
      ),
    ),
    check(
      "ck_product_images_2",
      sql.raw("state IN ('pending', 'accepted', 'rejected', 'archived')"),
    ),
  ],
);

export const editProposals = sqliteTable(
  "edit_proposals",
  {
    id: text("id").primaryKey(),
    submittedBy: text("submitted_by")
      .notNull()
      .references((): AnySQLiteColumn => profiles.userId, {
        onDelete: "cascade",
      }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    changeType: text("change_type").notNull(),
    riskTier: integer("risk_tier").notNull(),
    proposedData: text("proposed_data").notNull(),
    note: text("note"),
    status: text("status").notNull().default(sql.raw("'pending'")),
    resolvedBy: text("resolved_by").references(
      (): AnySQLiteColumn => profiles.userId,
      { onDelete: "set null" },
    ),
    resolutionNote: text("resolution_note"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (table) => [
    index("ix_edit_proposals_target").on(
      table.targetType,
      table.targetId,
      table.status,
    ),
    index("ix_edit_proposals_queue").on(
      table.status,
      desc(table.riskTier),
      table.createdAt,
    ),
    check(
      "ck_edit_proposals_1",
      sql.raw(
        "target_type IN ('product', 'product_version', 'product_image', 'product_category', 'product_retailer', 'retailer')",
      ),
    ),
    check("ck_edit_proposals_2", sql.raw("risk_tier BETWEEN 1 AND 3")),
    check(
      "ck_edit_proposals_3",
      sql.raw(
        "status IN ('pending', 'accepted', 'rejected', 'superseded', 'withdrawn')",
      ),
    ),
  ],
);

export const editProposalResponses = sqliteTable(
  "edit_proposal_responses",
  {
    proposalId: text("proposal_id")
      .notNull()
      .references((): AnySQLiteColumn => editProposals.id, {
        onDelete: "cascade",
      }),
    userId: text("user_id")
      .notNull()
      .references((): AnySQLiteColumn => profiles.userId, {
        onDelete: "cascade",
      }),
    stance: text("stance").notNull(),
    note: text("note"),
    evidenceData: text("evidence_data"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.proposalId, table.userId] }),
    check(
      "ck_edit_proposal_responses_1",
      sql.raw("stance IN ('confirm', 'disagree', 'evidence')"),
    ),
  ],
);

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    reporterUserId: text("reporter_user_id")
      .notNull()
      .references((): AnySQLiteColumn => profiles.userId, {
        onDelete: "cascade",
      }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reasonCode: text("reason_code").notNull(),
    note: text("note"),
    status: text("status").notNull().default(sql.raw("'open'")),
    resolvedBy: text("resolved_by").references(
      (): AnySQLiteColumn => profiles.userId,
      { onDelete: "set null" },
    ),
    resolutionNote: text("resolution_note"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (table) => [
    index("ix_reports_target").on(
      table.targetType,
      table.targetId,
      table.status,
    ),
    index("ix_reports_queue").on(table.status, table.createdAt),
    check(
      "ck_reports_1",
      sql.raw(
        "target_type IN ('product', 'product_version', 'product_image', 'comment', 'edit_proposal', 'profile')",
      ),
    ),
    check(
      "ck_reports_2",
      sql.raw("status IN ('open', 'reviewing', 'resolved', 'dismissed')"),
    ),
  ],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(
      (): AnySQLiteColumn => profiles.userId,
      { onDelete: "set null" },
    ),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    beforeData: text("before_data"),
    afterData: text("after_data"),
    sourceProposalId: text("source_proposal_id").references(
      (): AnySQLiteColumn => editProposals.id,
      { onDelete: "set null" },
    ),
    sourceReportId: text("source_report_id").references(
      (): AnySQLiteColumn => reports.id,
      { onDelete: "set null" },
    ),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("ix_audit_entity").on(
      table.entityType,
      table.entityId,
      desc(table.createdAt),
    ),
  ],
);
