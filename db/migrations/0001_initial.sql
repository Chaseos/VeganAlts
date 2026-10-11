-- VeganAlts schema, version 1.
-- The pre-release migrations were folded into this baseline before the first
-- release (owner decision, 2026-10-10). Every database starts here; later
-- schema changes are new, append-only migrations.
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_data` text,
	`after_data` text,
	`source_proposal_id` text,
	`source_report_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_proposal_id`) REFERENCES `edit_proposals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`website_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
, `normalized_name` text);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`is_rankable` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, `revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_categories_1" CHECK(is_rankable IN (0, 1)),
	CONSTRAINT "ck_categories_2" CHECK(is_active IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `category_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`country_id` text,
	`alias` text NOT NULL,
	`created_at` integer NOT NULL, `is_display_name` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `category_rating_dimensions` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_category_rating_dimensions_1" CHECK(is_active IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `countries` (
	`id` text PRIMARY KEY NOT NULL,
	`iso2` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "ck_countries_1" CHECK(is_active IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `edit_proposal_responses` (
	`proposal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`stance` text NOT NULL,
	`note` text,
	`evidence_data` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`proposal_id`, `user_id`),
	FOREIGN KEY (`proposal_id`) REFERENCES `edit_proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_edit_proposal_responses_1" CHECK(stance IN ('confirm', 'disagree', 'evidence'))
);
--> statement-breakpoint
CREATE TABLE `edit_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`submitted_by` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`change_type` text NOT NULL,
	`risk_tier` integer NOT NULL,
	`proposed_data` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_by` text,
	`resolution_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`resolved_at` integer, `baseline_data` text, `confirm_count` integer DEFAULT 0 NOT NULL, `disagree_count` integer DEFAULT 0 NOT NULL, `evidence_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`submitted_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_edit_proposals_1" CHECK(target_type IN ('product', 'product_version', 'product_image', 'product_category', 'product_retailer', 'retailer')),
	CONSTRAINT "ck_edit_proposals_2" CHECK(risk_tier BETWEEN 1 AND 3),
	CONSTRAINT "ck_edit_proposals_3" CHECK(status IN ('pending', 'accepted', 'rejected', 'superseded', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE `product_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`alias` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_categories` (
	`product_id` text NOT NULL,
	`category_id` text NOT NULL,
	`ranking_eligible` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`product_id`, `category_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_product_categories_1" CHECK(ranking_eligible IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `product_category_daily_stats` (
	`stat_date` text NOT NULL,
	`product_version_id` text NOT NULL,
	`category_id` text NOT NULL,
	`new_rating_count` integer DEFAULT 0 NOT NULL,
	`rating_sum` integer DEFAULT 0 NOT NULL,
	`new_trial_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`stat_date`, `product_version_id`, `category_id`),
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_product_category_daily_stats_1" CHECK(new_rating_count >= 0),
	CONSTRAINT "ck_product_category_daily_stats_2" CHECK(rating_sum >= 0),
	CONSTRAINT "ck_product_category_daily_stats_3" CHECK(new_trial_count >= 0),
	CONSTRAINT "ck_product_category_daily_stats_4" CHECK(comment_count >= 0)
);
--> statement-breakpoint
CREATE TABLE `product_category_stats` (
	`product_version_id` text NOT NULL,
	`category_id` text NOT NULL,
	`rating_count` integer DEFAULT 0 NOT NULL,
	`rating_sum` integer DEFAULT 0 NOT NULL,
	`raw_average` real,
	`bayesian_score` real,
	`tried_count` integer DEFAULT 0 NOT NULL,
	`recent_rating_count` integer DEFAULT 0 NOT NULL,
	`trending_score` real,
	`recomputed_at` integer NOT NULL,
	PRIMARY KEY(`product_version_id`, `category_id`),
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_product_category_stats_1" CHECK(rating_count >= 0),
	CONSTRAINT "ck_product_category_stats_2" CHECK(rating_sum >= 0),
	CONSTRAINT "ck_product_category_stats_3" CHECK(tried_count >= 0),
	CONSTRAINT "ck_product_category_stats_4" CHECK(recent_rating_count >= 0)
);
--> statement-breakpoint
CREATE TABLE `product_families` (
	`id` text PRIMARY KEY NOT NULL,
	`brand_id` text,
	`canonical_name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` text PRIMARY KEY NOT NULL,
	`product_version_id` text NOT NULL,
	`slot` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`full_r2_key` text NOT NULL,
	`thumbnail_r2_key` text,
	`full_width` integer,
	`full_height` integer,
	`mime_type` text DEFAULT 'image/webp' NOT NULL,
	`submitted_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, `evidence_r2_key` text, `evidence_width` integer, `evidence_height` integer,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submitted_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_product_images_1" CHECK(slot IN ('front', 'back', 'ingredients', 'nutrition', 'prepared')),
	CONSTRAINT "ck_product_images_2" CHECK(state IN ('pending', 'accepted', 'rejected', 'archived'))
);
--> statement-breakpoint
CREATE TABLE `product_relationships` (
	`from_product_id` text NOT NULL,
	`to_product_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`from_product_id`, `to_product_id`, `relation_type`),
	FOREIGN KEY (`from_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_product_relationships_1" CHECK(relation_type IN ('variant', 'specialty_flavor', 'companion', 'successor')),
	CONSTRAINT "ck_product_relationships_2" CHECK(from_product_id <> to_product_id)
);
--> statement-breakpoint
CREATE TABLE `product_retailers` (
	`product_id` text NOT NULL,
	`retailer_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`confirmation_count` integer DEFAULT 0 NOT NULL,
	`disagreement_count` integer DEFAULT 0 NOT NULL,
	`last_confirmed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`product_id`, `retailer_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`retailer_id`) REFERENCES `retailers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_product_retailers_1" CHECK(status IN ('active', 'uncertain', 'not_current')),
	CONSTRAINT "ck_product_retailers_2" CHECK(confirmation_count >= 0),
	CONSTRAINT "ck_product_retailers_3" CHECK(disagreement_count >= 0)
);
--> statement-breakpoint
CREATE TABLE `product_trials` (
	`user_id` text NOT NULL,
	`product_version_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `product_version_id`),
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`version_label` text,
	`effective_from` integer,
	`effective_to` integer,
	`is_current` integer DEFAULT 0 NOT NULL,
	`change_summary` text,
	`created_by` text,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, effective_date text, effective_date_precision text NOT NULL DEFAULT 'unknown'
  CONSTRAINT ck_formula_date_precision CHECK(effective_date_precision IN ('unknown','year','month','day')),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_product_versions_1" CHECK(is_current IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`country_id` text NOT NULL,
	`brand_id` text,
	`product_family_id` text,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`product_type` text DEFAULT 'packaged_food' NOT NULL,
	`lifecycle_status` text DEFAULT 'active' NOT NULL,
	`vegan_status` text DEFAULT 'appears_vegan' NOT NULL,
	`manufacturer_label` text DEFAULT 'unknown' NOT NULL,
	`manufacturer_url` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL, development_only integer NOT NULL DEFAULT 0
  CONSTRAINT ck_products_development CHECK(development_only IN (0, 1)), source_checked_at integer, data_notes text, `published_at` integer,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`product_family_id`) REFERENCES `product_families`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_products_1" CHECK(product_type IN ('packaged_food', 'restaurant_item', 'recipe', 'material')),
	CONSTRAINT "ck_products_2" CHECK(lifecycle_status IN ('active', 'under_review', 'discontinued', 'hidden')),
	CONSTRAINT "ck_products_3" CHECK(vegan_status IN ('vegan', 'appears_vegan', 'plant_based', 'under_review')),
	CONSTRAINT "ck_products_4" CHECK(manufacturer_label IN ('vegan', 'plant_based', 'neither', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`display_name` text,
	`avatar_url` text,
	`trust_level` integer DEFAULT 0 NOT NULL,
	`account_state` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_profiles_1" CHECK(trust_level >= 0),
	CONSTRAINT "ck_profiles_2" CHECK(account_state IN ('active', 'restricted', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE `rating_dimension_values` (
	`rating_id` text NOT NULL,
	`dimension_id` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`rating_id`, `dimension_id`),
	FOREIGN KEY (`rating_id`) REFERENCES `ratings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dimension_id`) REFERENCES `category_rating_dimensions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_rating_dimension_values_1" CHECK(typeof(score) = 'integer' AND score BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_version_id` text NOT NULL,
	`category_id` text NOT NULL,
	`overall_similarity` integer NOT NULL,
	`conventional_recency` text,
	`is_counted` integer DEFAULT 1 NOT NULL,
	`moderation_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_ratings_1" CHECK(typeof(overall_similarity) = 'integer' AND overall_similarity BETWEEN 1 AND 5),
	CONSTRAINT "ck_ratings_2" CHECK(conventional_recency IS NULL OR conventional_recency IN ( 'current_or_week', 'within_month', 'within_year', 'over_year', 'prefer_not_to_say' )),
	CONSTRAINT "ck_ratings_3" CHECK(is_counted IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason_code` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by` text,
	`resolution_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`reporter_user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_reports_1" CHECK(target_type IN ('product', 'product_version', 'product_image', 'comment', 'edit_proposal', 'profile')),
	CONSTRAINT "ck_reports_2" CHECK(status IN ('open', 'reviewing', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE `retailer_confirmations` (
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`retailer_id` text NOT NULL,
	`stance` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `product_id`, `retailer_id`),
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`retailer_id`) REFERENCES `retailers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_retailer_confirmations_1" CHECK(stance IN ('confirm', 'not_current'))
);
--> statement-breakpoint
CREATE TABLE `retailer_markets` (
	`retailer_id` text NOT NULL,
	`country_id` text NOT NULL,
	`market_name` text,
	`website_url` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`retailer_id`, `country_id`),
	FOREIGN KEY (`retailer_id`) REFERENCES `retailers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_retailer_markets_1" CHECK(is_active IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `retailers` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_name` text NOT NULL,
	`slug` text NOT NULL,
	`website_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
, `normalized_name` text);
--> statement-breakpoint
CREATE TABLE `formula_revisions` (
	`product_version_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`write_token` text,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`state` text NOT NULL,
	`lease_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `media_uploads`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_media_attempt_state" CHECK("media_attempts"."state" IN ('processing', 'committed', 'abandoned'))
);
--> statement-breakpoint
CREATE TABLE `media_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`product_version_id` text NOT NULL,
	`slot` text NOT NULL,
	`content_hash` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`active_attempt_id` text,
	`image_id` text,
	`failure_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_media_upload_slot" CHECK("media_uploads"."slot" IN ('front', 'back', 'ingredients', 'nutrition', 'prepared')),
	CONSTRAINT "ck_media_upload_state" CHECK("media_uploads"."state" IN ('pending', 'processing', 'complete', 'failed'))
);
--> statement-breakpoint
CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED, entity_id UNINDEXED, country_code UNINDEXED,
  title, subtitle, aliases, body,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TABLE `brand_aliases` (
	`normalized_name` text PRIMARY KEY NOT NULL,
	`alias` text NOT NULL,
	`brand_id` text NOT NULL,
	FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `catalog_revisions` (
	`product_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`write_token` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `community_recovery` (
	`prefix` text PRIMARY KEY NOT NULL,
	`cursor` text
);
--> statement-breakpoint
CREATE TABLE `contribution_receipts` (
	`user_id` text NOT NULL,
	`operation` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`input_hash` text NOT NULL,
	`result_data` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `operation`, `idempotency_key`),
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `duplicate_consolidations` (
	`donor_id` text PRIMARY KEY NOT NULL,
	`survivor_id` text NOT NULL,
	`action_id` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`donor_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`survivor_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`action_id`) REFERENCES `moderation_actions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_duplicate_different" CHECK("duplicate_consolidations"."donor_id" <> "duplicate_consolidations"."survivor_id")
);
--> statement-breakpoint
CREATE TABLE `formula_classifications` (
	`product_version_id` text PRIMARY KEY NOT NULL,
	`vegan_status` text NOT NULL,
	`manufacturer_label` text NOT NULL,
	`evidence_data` text NOT NULL,
	`certifications` text DEFAULT '[]' NOT NULL,
	`reviewed_by` text,
	`updated_at` integer NOT NULL, `ingredients_checked` integer DEFAULT 1 NOT NULL CONSTRAINT "ck_formula_ingredients_checked" CHECK("ingredients_checked" IN (0,1) AND ("ingredients_checked"=1 OR "vegan_status"='appears_vegan')),
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_formula_classification_status" CHECK("formula_classifications"."vegan_status" IN ('vegan','appears_vegan','plant_based','under_review')),
	CONSTRAINT "ck_formula_classification_label" CHECK("formula_classifications"."manufacturer_label" IN ('vegan','plant_based','neither','unknown')),
	CONSTRAINT "ck_formula_classification_json" CHECK(json_valid("formula_classifications"."evidence_data") AND json_valid("formula_classifications"."certifications"))
);
--> statement-breakpoint
CREATE TABLE `media_promotions` (
	`object_key` text PRIMARY KEY NOT NULL,
	`image_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`lease_token` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submission_receipts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `moderation_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`product_id` text,
	`before_data` text NOT NULL,
	`after_data` text NOT NULL,
	`note` text NOT NULL,
	`reversed_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `pending_submissions` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`proposed_data` text NOT NULL,
	`reasons` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`resolved_by` text,
	`resolution_note` text,
	`resolved_at` integer, `superseded_by` text REFERENCES submission_receipts(id), `category_proposal_id` text REFERENCES category_proposals(id),
	FOREIGN KEY (`submission_id`) REFERENCES `submission_receipts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_pending_payload_json" CHECK(json_valid("pending_submissions"."proposed_data") AND json_valid("pending_submissions"."reasons"))
);
--> statement-breakpoint
CREATE TABLE `product_identity_keys` (
	`identity_key` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `report_evidence` (
	`report_id` text PRIMARY KEY NOT NULL,
	`evidence_data` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `retailer_aliases` (
	`normalized_name` text PRIMARY KEY NOT NULL,
	`alias` text NOT NULL,
	`retailer_id` text NOT NULL,
	FOREIGN KEY (`retailer_id`) REFERENCES `retailers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `staged_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`blob_id` text NOT NULL,
	`user_id` text NOT NULL,
	`state` text NOT NULL,
	`input_bytes` integer NOT NULL,
	`lease_expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`blob_id`) REFERENCES `staged_blobs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_staged_attempt_state" CHECK("staged_attempts"."state" IN ('processing','committed','abandoned'))
);
--> statement-breakpoint
CREATE TABLE `staged_blobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`profile` text NOT NULL,
	`input_bytes` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`active_attempt_id` text,
	`derivatives` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_staged_blob_state" CHECK("staged_blobs"."state" IN ('pending','processing','complete','failed','expired'))
);
--> statement-breakpoint
CREATE TABLE `staged_upload_keys` (
	`user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`submission_id` text NOT NULL,
	`slot` text NOT NULL,
	`content_hash` text NOT NULL,
	PRIMARY KEY(`user_id`, `idempotency_key`),
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`submission_id`) REFERENCES `submission_receipts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `submission_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`input_hash` text NOT NULL,
	`purpose` text DEFAULT 'submission' NOT NULL,
	`state` text DEFAULT 'staging' NOT NULL,
	`planned_product_id` text NOT NULL,
	`planned_version_id` text NOT NULL,
	`product_id` text,
	`active_token` text,
	`lease_expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_submission_state" CHECK("submission_receipts"."state" IN ('staging','review','publishing','published','rejected','expired'))
);
--> statement-breakpoint
CREATE TABLE `submission_uploads` (
	`submission_id` text NOT NULL,
	`slot` text NOT NULL,
	`blob_id` text NOT NULL,
	`image_id` text NOT NULL, `created_at` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`submission_id`, `slot`),
	FOREIGN KEY (`submission_id`) REFERENCES `submission_receipts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`blob_id`) REFERENCES `staged_blobs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_submission_upload_slot" CHECK("submission_uploads"."slot" IN ('front','back','ingredients','nutrition','prepared'))
);
--> statement-breakpoint
CREATE TABLE `moderation_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`kind` text NOT NULL,
	`schema_version` integer NOT NULL,
	`policy_version` integer NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_hash` text NOT NULL,
	`user_id` text,
	`status` text NOT NULL,
	`outcome` text,
	`charged` integer DEFAULT 0 NOT NULL,
	`result_data` text,
	`reused_from` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`latency_ms` integer,
	`error_code` text,
	`lease_expires_at` integer,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_decision_subject" CHECK("moderation_decisions"."subject_type" IN ('submission','comment','edit_proposal','category_proposal')),
	CONSTRAINT "ck_decision_status" CHECK("moderation_decisions"."status" IN ('reserved','completed','reused','failed','over_budget')),
	CONSTRAINT "ck_decision_outcome" CHECK("moderation_decisions"."outcome" IS NULL OR "moderation_decisions"."outcome" IN ('READY','NEEDS_REVIEW','NEEDS_CHANGES','BLOCKED')),
	CONSTRAINT "ck_decision_failure_reviews" CHECK(("moderation_decisions"."status" = 'reserved' AND "moderation_decisions"."outcome" IS NULL) OR ("moderation_decisions"."status" IN ('completed','reused') AND "moderation_decisions"."outcome" IS NOT NULL) OR ("moderation_decisions"."status" IN ('failed','over_budget') AND "moderation_decisions"."outcome" = 'NEEDS_REVIEW')),
	CONSTRAINT "ck_decision_result" CHECK("moderation_decisions"."result_data" IS NULL OR json_valid("moderation_decisions"."result_data"))
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_version_id` text NOT NULL,
	`category_id` text,
	`body` text NOT NULL,
	`moderation_state` text DEFAULT 'visible' NOT NULL,
	`up_count` integer DEFAULT 0 NOT NULL,
	`down_count` integer DEFAULT 0 NOT NULL,
	`best_rank` integer DEFAULT 0 NOT NULL,
	`vote_revision` integer DEFAULT 0 NOT NULL,
	`vote_token` text,
	`decision_id` text,
	`edited_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_comments_1" CHECK(moderation_state IN ('pending', 'visible', 'hidden', 'removed')),
	CONSTRAINT "ck_comments_body" CHECK(length(body) BETWEEN 1 AND 4000),
	CONSTRAINT "ck_comments_counts" CHECK(up_count >= 0 AND down_count >= 0 AND best_rank >= 0)
);
--> statement-breakpoint
CREATE TABLE `comment_votes` (
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`comment_id`, `user_id`),
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_comment_votes_value" CHECK(value IN (-1, 1))
);
--> statement-breakpoint
CREATE TABLE `category_features` (
	`country_id` text NOT NULL,
	`category_id` text NOT NULL,
	`position` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`country_id`, `category_id`),
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `category_merges` (
	`id` text PRIMARY KEY NOT NULL,
	`donor_id` text NOT NULL,
	`survivor_id` text NOT NULL,
	`action_id` text NOT NULL,
	`state` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`page_token` text,
	`finalize_data` text,
	`reversed_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`donor_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`survivor_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`action_id`) REFERENCES `moderation_actions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_category_merge_different" CHECK("category_merges"."donor_id" <> "category_merges"."survivor_id"),
	CONSTRAINT "ck_category_merge_state" CHECK("category_merges"."state" IN ('transferring','complete','reversing','reversed')),
	CONSTRAINT "ck_category_merge_finalize" CHECK("category_merges"."finalize_data" IS NULL OR json_valid("category_merges"."finalize_data"))
);
--> statement-breakpoint
CREATE TABLE `category_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`submitted_by` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`country_id` text,
	`explanation` text NOT NULL,
	`proposed_data` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_by` text,
	`resolution_note` text,
	`resolved_category_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`submitted_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_category_proposals_status" CHECK("category_proposals"."status" IN ('pending','accepted','aliased','rejected')),
	CONSTRAINT "ck_category_proposals_data" CHECK(json_valid("category_proposals"."proposed_data"))
);
--> statement-breakpoint
CREATE TABLE `category_slug_history` (
	`old_slug` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `product_category_trends` (
	`category_id` text NOT NULL,
	`product_version_id` text NOT NULL,
	`product_id` text NOT NULL,
	`trending_score` real NOT NULL,
	`inputs` text NOT NULL,
	`computed_at` integer NOT NULL,
	PRIMARY KEY(`category_id`, `product_version_id`),
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_trends_inputs" CHECK(json_valid(inputs))
);
--> statement-breakpoint
CREATE TABLE `allergens` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "ck_allergens_key" CHECK(key GLOB '[a-z]*' AND key NOT GLOB '*[^a-z_]*' AND length(key) BETWEEN 2 AND 30)
);
--> statement-breakpoint
CREATE TABLE `country_allergens` (
	`country_id` text NOT NULL,
	`allergen_key` text NOT NULL,
	`position` integer NOT NULL,
	`label` text,
	PRIMARY KEY(`country_id`, `allergen_key`),
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`allergen_key`) REFERENCES `allergens`(`key`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `product_version_allergen_declarations` (
	`product_version_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`evidence_data` text NOT NULL,
	`source_proposal_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_proposal_id`) REFERENCES `edit_proposals`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_allergen_declarations_status" CHECK(status IN ('declared', 'none_declared')),
	CONSTRAINT "ck_allergen_declarations_evidence" CHECK(json_valid(evidence_data))
);
--> statement-breakpoint
CREATE TABLE `product_version_allergens` (
	`product_version_id` text NOT NULL,
	`allergen_key` text NOT NULL,
	`presence` text NOT NULL,
	PRIMARY KEY(`product_version_id`, `allergen_key`),
	FOREIGN KEY (`product_version_id`) REFERENCES `product_version_allergen_declarations`(`product_version_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`allergen_key`) REFERENCES `allergens`(`key`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_product_version_allergens_presence" CHECK(presence IN ('contains', 'may_contain'))
);
--> statement-breakpoint
CREATE TABLE `product_category_dimension_stats` (
	`product_version_id` text NOT NULL,
	`category_id` text NOT NULL,
	`dimension_id` text NOT NULL,
	`answer_count` integer NOT NULL,
	`answer_sum` integer NOT NULL,
	`recomputed_at` integer NOT NULL,
	PRIMARY KEY(`product_version_id`, `category_id`, `dimension_id`),
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dimension_id`) REFERENCES `category_rating_dimensions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_product_category_dimension_stats_1" CHECK(answer_count > 0 AND answer_sum BETWEEN answer_count AND answer_count * 5)
);
--> statement-breakpoint
CREATE TABLE `product_category_familiarity_stats` (
	`product_version_id` text NOT NULL,
	`category_id` text NOT NULL,
	`recency` text NOT NULL,
	`overall_similarity` integer NOT NULL,
	`rating_count` integer NOT NULL,
	`recomputed_at` integer NOT NULL,
	PRIMARY KEY(`product_version_id`, `category_id`, `recency`, `overall_similarity`),
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_product_category_familiarity_stats_1" CHECK(recency IN ('current_or_week', 'within_month', 'within_year', 'over_year', 'prefer_not_to_say', 'unanswered')),
	CONSTRAINT "ck_product_category_familiarity_stats_2" CHECK(overall_similarity BETWEEN 1 AND 5 AND rating_count > 0)
);
--> statement-breakpoint
CREATE TABLE "category_merge_moves" (
	`merge_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`product_id` text,
	`role` text NOT NULL,
	`partner_id` text,
	`prior_counted` integer,
	`prior_eligible` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`merge_id`, `entity_type`, `entity_id`),
	FOREIGN KEY (`merge_id`) REFERENCES `category_merges`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_category_merge_move_type" CHECK("category_merge_moves"."entity_type" IN ('rating','membership','comment','dimension')),
	CONSTRAINT "ck_category_merge_move_role" CHECK("category_merge_moves"."role" IN ('moved','donor_wins','donor_loses','survivor_loses','membership_added','membership_existing','membership_removed','comment_moved','dimension_added'))
);
--> statement-breakpoint
CREATE TABLE `category_countries` (
	`category_id` text NOT NULL,
	`country_id` text NOT NULL,
	`source` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`category_id`, `country_id`),
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_category_countries_source" CHECK("category_countries"."source" IN ('launch','proposal','product','operator'))
);
--> statement-breakpoint
-- The application-owned system actor and the global allergen list.
INSERT INTO `user` (`id`, `name`, `email`, `email_verified`, `created_at`, `updated_at`) VALUES ('veganalts-system', 'VeganAlts automation', 'automation@veganalts.invalid', 0, 0, 0);--> statement-breakpoint
--> statement-breakpoint
INSERT INTO `profiles` (`user_id`, `handle`, `display_name`, `account_state`, `created_at`, `updated_at`) VALUES ('veganalts-system', 'system', 'VeganAlts automation', 'active', 0, 0);
--> statement-breakpoint
INSERT INTO allergens(key,label,created_at) VALUES ('milk','Milk',unixepoch()*1000),('egg','Egg',unixepoch()*1000),('fish','Fish',unixepoch()*1000),('crustacean','Crustacean shellfish',unixepoch()*1000),('mollusc','Molluscs',unixepoch()*1000),('tree_nuts','Tree nuts',unixepoch()*1000),('peanut','Peanuts',unixepoch()*1000),('wheat','Wheat',unixepoch()*1000),('gluten','Gluten',unixepoch()*1000),('soy','Soy',unixepoch()*1000),('sesame','Sesame',unixepoch()*1000),('mustard','Mustard',unixepoch()*1000),('celery','Celery',unixepoch()*1000),('lupin','Lupin',unixepoch()*1000),('sulphites','Sulphites',unixepoch()*1000);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);
--> statement-breakpoint
CREATE INDEX `ix_audit_entity` ON `audit_log` (`entity_type`,`entity_id`,"created_at" desc);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_brands_slug` ON `brands` (`slug`);
--> statement-breakpoint
CREATE INDEX `ix_categories_parent_active` ON `categories` (`parent_id`,`is_active`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_categories_slug` ON `categories` (`slug`);
--> statement-breakpoint
CREATE INDEX `ix_category_aliases_alias` ON `category_aliases` ("alias" COLLATE NOCASE);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_category_aliases_category_id_country_id_alias` ON `category_aliases` (`category_id`,`country_id`,"alias" COLLATE NOCASE);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_category_rating_dimensions_category_id_key` ON `category_rating_dimensions` (`category_id`,`key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_countries_iso2` ON `countries` (`iso2`);
--> statement-breakpoint
CREATE INDEX `ix_edit_proposals_target` ON `edit_proposals` (`target_type`,`target_id`,`status`);
--> statement-breakpoint
CREATE INDEX `ix_edit_proposals_queue` ON `edit_proposals` (`status`,"risk_tier" desc,`created_at`);
--> statement-breakpoint
CREATE INDEX `ix_product_aliases_alias` ON `product_aliases` ("alias" COLLATE NOCASE);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_product_aliases_product_id_alias` ON `product_aliases` (`product_id`,"alias" COLLATE NOCASE);
--> statement-breakpoint
CREATE INDEX `ix_product_categories_category_eligible` ON `product_categories` (`category_id`,`ranking_eligible`,`product_id`);
--> statement-breakpoint
CREATE INDEX `ix_daily_stats_category_date` ON `product_category_daily_stats` (`category_id`,"stat_date" desc);
--> statement-breakpoint
CREATE INDEX `ix_product_category_stats_trending` ON `product_category_stats` (`category_id`,"trending_score" desc);
--> statement-breakpoint
CREATE INDEX `ix_product_category_stats_top` ON `product_category_stats` (`category_id`,"bayesian_score" desc,"rating_count" desc);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_product_families_slug` ON `product_families` (`slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_product_images_accepted_slot` ON `product_images` (`product_version_id`,`slot`) WHERE state = 'accepted';
--> statement-breakpoint
CREATE INDEX `ix_product_images_version_slot_state` ON `product_images` (`product_version_id`,`slot`,`state`);
--> statement-breakpoint
CREATE INDEX `ix_product_retailers_product_status` ON `product_retailers` (`product_id`,`status`);
--> statement-breakpoint
CREATE INDEX `ix_product_trials_version` ON `product_trials` (`product_version_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_product_versions_current` ON `product_versions` (`product_id`) WHERE is_current = 1;
--> statement-breakpoint
CREATE INDEX `ix_product_versions_product` ON `product_versions` (`product_id`,"effective_from" desc);
--> statement-breakpoint
CREATE INDEX `ix_products_brand_country` ON `products` (`brand_id`,`country_id`);
--> statement-breakpoint
CREATE INDEX `ix_products_country_status` ON `products` (`country_id`,`lifecycle_status`,"updated_at" desc);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_products_country_id_slug` ON `products` (`country_id`,`slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_profiles_handle` ON `profiles` ("handle" COLLATE NOCASE);
--> statement-breakpoint
CREATE INDEX `ix_ratings_user_updated` ON `ratings` (`user_id`,"updated_at" desc);
--> statement-breakpoint
CREATE INDEX `ix_ratings_version_category_counted` ON `ratings` (`product_version_id`,`category_id`,`is_counted`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_ratings_user_id_product_version_id_category_id` ON `ratings` (`user_id`,`product_version_id`,`category_id`);
--> statement-breakpoint
CREATE INDEX `ix_reports_target` ON `reports` (`target_type`,`target_id`,`status`);
--> statement-breakpoint
CREATE INDEX `ix_reports_queue` ON `reports` (`status`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_retailers_slug` ON `retailers` (`slug`);
--> statement-breakpoint
CREATE INDEX `ix_media_attempt_recovery` ON `media_attempts` (`state`,`lease_expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_media_upload_idempotency` ON `media_uploads` (`user_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `ix_media_upload_state_updated` ON `media_uploads` (`state`,`updated_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_category_aliases_global` ON `category_aliases` (`category_id`,"alias" COLLATE NOCASE) WHERE "category_aliases"."country_id" IS NULL;
--> statement-breakpoint
CREATE INDEX `ix_product_images_full_key` ON `product_images` (`full_r2_key`);
--> statement-breakpoint
CREATE INDEX `ix_product_images_thumbnail_key` ON `product_images` (`thumbnail_r2_key`);
--> statement-breakpoint
CREATE INDEX `ix_product_images_evidence_key` ON `product_images` (`evidence_r2_key`);
--> statement-breakpoint
CREATE INDEX `ix_media_attempt_created` ON `media_attempts` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ix_media_attempt_upload` ON `media_attempts` (`upload_id`);
--> statement-breakpoint
CREATE INDEX `ix_ratings_user_updated_id` ON `ratings` (`user_id`,"updated_at" desc,"id" desc);
--> statement-breakpoint
CREATE INDEX `ix_duplicate_survivor` ON `duplicate_consolidations` (`survivor_id`,`active`);
--> statement-breakpoint
CREATE INDEX `ix_moderation_action_product` ON `moderation_actions` (`product_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `ix_product_identity_product` ON `product_identity_keys` (`product_id`);
--> statement-breakpoint
CREATE INDEX `ix_staged_attempt_budget` ON `staged_attempts` (`created_at`,`user_id`);
--> statement-breakpoint
CREATE INDEX `ix_staged_attempt_blob` ON `staged_attempts` (`blob_id`);
--> statement-breakpoint
CREATE INDEX `ix_staged_attempt_leases` ON `staged_attempts` (`state`,`lease_expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_staged_content_profile` ON `staged_blobs` (`user_id`,`content_hash`,`profile`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_submission_idempotency` ON `submission_receipts` (`user_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `ix_submission_owner_created` ON `submission_receipts` (`user_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `ix_submission_expiry` ON `submission_receipts` (`state`,`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_submission_image_id` ON `submission_uploads` (`image_id`);
--> statement-breakpoint
CREATE INDEX `ix_submission_upload_blob` ON `submission_uploads` (`blob_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_brands_normalized` ON `brands` (`normalized_name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_retailers_normalized` ON `retailers` (`normalized_name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_reports_active_reporter_reason` ON `reports` (`reporter_user_id`,`target_type`,`target_id`,`reason_code`) WHERE "reports"."status" IN ('open','reviewing');
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_pending_superseded_by` ON `pending_submissions` (`superseded_by`);
--> statement-breakpoint
CREATE INDEX `ix_decision_subject` ON `moderation_decisions` (`subject_type`,`subject_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `ix_decision_reuse` ON `moderation_decisions` (`kind`,`schema_version`,`policy_version`,`model`,`input_hash`,`created_at`) WHERE "moderation_decisions"."status" = 'completed';
--> statement-breakpoint
CREATE INDEX `ix_decision_budget` ON `moderation_decisions` (`created_at`) WHERE "moderation_decisions"."charged" = 1;
--> statement-breakpoint
CREATE INDEX `ix_decision_account_budget` ON `moderation_decisions` (`user_id`,`created_at`) WHERE "moderation_decisions"."charged" = 1;
--> statement-breakpoint
CREATE INDEX `ix_decision_leases` ON `moderation_decisions` (`lease_expires_at`) WHERE "moderation_decisions"."status" = 'reserved';
--> statement-breakpoint
CREATE INDEX `ix_comments_version_created` ON `comments` (`product_version_id`,"created_at" desc);
--> statement-breakpoint
CREATE INDEX `ix_comments_version_best` ON `comments` (`product_version_id`,"best_rank" desc,"created_at" desc,"id" desc) WHERE moderation_state = 'visible' AND deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX `ix_comments_version_newest` ON `comments` (`product_version_id`,"created_at" desc,"id" desc) WHERE moderation_state = 'visible' AND deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX `ix_comments_product_newest` ON `comments` (`product_id`,"created_at" desc,"id" desc) WHERE moderation_state = 'visible' AND deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX `ix_comments_user_created` ON `comments` (`user_id`,"created_at" desc);
--> statement-breakpoint
CREATE INDEX `ix_comments_pending` ON `comments` (`created_at`) WHERE moderation_state = 'pending' AND deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX `ix_comments_created` ON `comments` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ix_comment_votes_user` ON `comment_votes` (`user_id`,"updated_at" desc);
--> statement-breakpoint
CREATE INDEX `ix_moderation_action_actor` ON `moderation_actions` (`actor_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `ix_category_features_order` ON `category_features` (`country_id`,`position`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_category_merge_active_donor` ON `category_merges` (`donor_id`) WHERE "category_merges"."active" = 1;
--> statement-breakpoint
CREATE INDEX `ix_category_merge_survivor` ON `category_merges` (`survivor_id`,`active`);
--> statement-breakpoint
CREATE INDEX `ix_category_proposals_queue` ON `category_proposals` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `ix_category_proposals_user` ON `category_proposals` (`submitted_by`,`created_at`);
--> statement-breakpoint
CREATE INDEX `ix_trends_category_score` ON `product_category_trends` (`category_id`,"trending_score" desc,`product_id`);
--> statement-breakpoint
CREATE INDEX `ix_product_trials_created` ON `product_trials` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ix_products_country_published` ON `products` (`country_id`,"published_at" desc,"id" desc);
--> statement-breakpoint
CREATE INDEX `ix_ratings_created` ON `ratings` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ix_country_allergens_position` ON `country_allergens` (`country_id`,`position`);
--> statement-breakpoint
CREATE INDEX `ix_product_version_allergens_key` ON `product_version_allergens` (`allergen_key`,`product_version_id`);
--> statement-breakpoint
CREATE INDEX `ix_retailer_markets_country` ON `retailer_markets` (`country_id`,`is_active`,`retailer_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_category_aliases_display` ON `category_aliases` (`category_id`,`country_id`) WHERE "category_aliases"."is_display_name" = 1;
--> statement-breakpoint
CREATE INDEX `ix_product_category_dimension_stats_category` ON `product_category_dimension_stats` (`category_id`,`dimension_id`);
--> statement-breakpoint
CREATE INDEX `ix_category_merge_moves_role` ON `category_merge_moves` (`merge_id`,`role`);
--> statement-breakpoint
CREATE INDEX `ix_category_countries_country` ON `category_countries` (`country_id`,`category_id`);
--> statement-breakpoint
CREATE INDEX `ix_pending_submissions_proposal` ON `pending_submissions` (`category_proposal_id`) WHERE "pending_submissions"."category_proposal_id" IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER ratings_category_insert BEFORE INSERT ON ratings
WHEN NOT EXISTS (
  SELECT 1 FROM product_versions v JOIN product_categories pc ON pc.product_id = v.product_id
  WHERE v.id = NEW.product_version_id AND pc.category_id = NEW.category_id
)
BEGIN SELECT RAISE(ABORT, 'rating category does not belong to product'); END;
--> statement-breakpoint
CREATE TRIGGER ratings_category_update BEFORE UPDATE OF product_version_id, category_id ON ratings
WHEN NOT EXISTS (
  SELECT 1 FROM product_versions v JOIN product_categories pc ON pc.product_id = v.product_id
  WHERE v.id = NEW.product_version_id AND pc.category_id = NEW.category_id
)
BEGIN SELECT RAISE(ABORT, 'rating category does not belong to product'); END;
--> statement-breakpoint
CREATE TRIGGER rating_dimension_insert BEFORE INSERT ON rating_dimension_values
WHEN NOT EXISTS (
  SELECT 1 FROM ratings r JOIN category_rating_dimensions d ON d.category_id = r.category_id
  WHERE r.id = NEW.rating_id AND d.id = NEW.dimension_id
)
BEGIN SELECT RAISE(ABORT, 'rating dimension does not belong to category'); END;
--> statement-breakpoint
CREATE TRIGGER rating_dimension_update BEFORE UPDATE OF rating_id, dimension_id ON rating_dimension_values
WHEN NOT EXISTS (
  SELECT 1 FROM ratings r JOIN category_rating_dimensions d ON d.category_id = r.category_id
  WHERE r.id = NEW.rating_id AND d.id = NEW.dimension_id
)
BEGIN SELECT RAISE(ABORT, 'rating dimension does not belong to category'); END;
--> statement-breakpoint
CREATE TRIGGER product_category_preserve_ratings BEFORE DELETE ON product_categories
WHEN EXISTS (
  SELECT 1 FROM ratings r JOIN product_versions v ON v.id = r.product_version_id
  WHERE v.product_id = OLD.product_id AND r.category_id = OLD.category_id
)
BEGIN SELECT RAISE(ABORT, 'set ranking_eligible=0 to preserve historical ratings'); END;
--> statement-breakpoint
CREATE TRIGGER formula_revision_create AFTER INSERT ON product_versions
BEGIN INSERT INTO formula_revisions (product_version_id) VALUES (NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER formula_revision_update AFTER UPDATE ON product_versions
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id = NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER rating_revision_insert AFTER INSERT ON ratings
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id = NEW.product_version_id; END;
--> statement-breakpoint
CREATE TRIGGER rating_revision_update AFTER UPDATE ON ratings
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id IN (NEW.product_version_id, OLD.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER rating_revision_delete AFTER DELETE ON ratings
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id = OLD.product_version_id; END;
--> statement-breakpoint
CREATE TRIGGER trial_revision_insert AFTER INSERT ON product_trials
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id = NEW.product_version_id; END;
--> statement-breakpoint
CREATE TRIGGER trial_revision_update AFTER UPDATE ON product_trials
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id IN (NEW.product_version_id, OLD.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER trial_revision_delete AFTER DELETE ON product_trials
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id = OLD.product_version_id; END;
--> statement-breakpoint
CREATE TRIGGER category_link_revision_insert AFTER INSERT ON product_categories
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id IN (SELECT id FROM product_versions WHERE product_id = NEW.product_id); END;
--> statement-breakpoint
CREATE TRIGGER category_link_revision_update AFTER UPDATE ON product_categories
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id IN (SELECT id FROM product_versions WHERE product_id IN (OLD.product_id, NEW.product_id)); END;
--> statement-breakpoint
CREATE TRIGGER category_link_revision_delete AFTER DELETE ON product_categories
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id IN (SELECT id FROM product_versions WHERE product_id = OLD.product_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_revision_create AFTER INSERT ON products BEGIN INSERT INTO catalog_revisions(product_id) VALUES(NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_product_update AFTER UPDATE ON products BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=NEW.id; UPDATE formula_revisions SET revision=revision+1 WHERE product_version_id IN (SELECT id FROM product_versions WHERE product_id=NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_country_eligibility AFTER UPDATE OF is_active ON countries BEGIN UPDATE formula_revisions SET revision=revision+1 WHERE product_version_id IN (SELECT v.id FROM product_versions v JOIN products p ON p.id=v.product_id WHERE p.country_id=NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_category_eligibility AFTER UPDATE OF is_active,is_rankable ON categories BEGIN UPDATE formula_revisions SET revision=revision+1 WHERE product_version_id IN (SELECT v.id FROM product_versions v JOIN product_categories pc ON pc.product_id=v.product_id WHERE pc.category_id=NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_product_versions_insert AFTER INSERT ON product_versions BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=NEW.product_id; END;
--> statement-breakpoint
CREATE TRIGGER catalog_product_versions_update AFTER UPDATE ON product_versions BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=NEW.product_id; END;
--> statement-breakpoint
CREATE TRIGGER catalog_product_versions_delete AFTER DELETE ON product_versions BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=OLD.product_id; END;
--> statement-breakpoint
CREATE TRIGGER catalog_product_categories_insert AFTER INSERT ON product_categories BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=NEW.product_id; END;
--> statement-breakpoint
CREATE TRIGGER catalog_product_categories_update AFTER UPDATE ON product_categories BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=NEW.product_id; END;
--> statement-breakpoint
CREATE TRIGGER catalog_product_categories_delete AFTER DELETE ON product_categories BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=OLD.product_id; END;
--> statement-breakpoint
CREATE TRIGGER catalog_product_images_insert AFTER INSERT ON product_images BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=NEW.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_product_images_update AFTER UPDATE ON product_images BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=NEW.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_product_images_delete AFTER DELETE ON product_images BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=OLD.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_formula_classifications_insert AFTER INSERT ON formula_classifications BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=NEW.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_formula_classifications_update AFTER UPDATE ON formula_classifications BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=NEW.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_formula_classifications_delete AFTER DELETE ON formula_classifications BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=OLD.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER product_version_allergens_insert BEFORE INSERT ON product_version_allergens BEGIN
  SELECT RAISE(ABORT,'allergen requires a declared label') WHERE NOT EXISTS(SELECT 1 FROM product_version_allergen_declarations d WHERE d.product_version_id=NEW.product_version_id AND d.status='declared');
  SELECT RAISE(ABORT,'allergen is not on the product country list') WHERE NOT EXISTS(SELECT 1 FROM product_versions v JOIN products p ON p.id=v.product_id JOIN country_allergens ca ON ca.country_id=p.country_id AND ca.allergen_key=NEW.allergen_key WHERE v.id=NEW.product_version_id);
END;
--> statement-breakpoint
CREATE TRIGGER product_version_allergens_update BEFORE UPDATE OF product_version_id,allergen_key ON product_version_allergens BEGIN
  SELECT RAISE(ABORT,'replace allergen rows instead of moving them');
END;
--> statement-breakpoint
CREATE TRIGGER product_version_allergen_declarations_status BEFORE UPDATE OF status ON product_version_allergen_declarations WHEN NEW.status='none_declared' BEGIN
  SELECT RAISE(ABORT,'remove allergen rows before declaring none') WHERE EXISTS(SELECT 1 FROM product_version_allergens a WHERE a.product_version_id=NEW.product_version_id);
END;
--> statement-breakpoint
CREATE TRIGGER catalog_allergen_declarations_insert AFTER INSERT ON product_version_allergen_declarations BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=NEW.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_allergen_declarations_update AFTER UPDATE ON product_version_allergen_declarations BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=NEW.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_allergen_declarations_delete AFTER DELETE ON product_version_allergen_declarations BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=OLD.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_version_allergens_insert AFTER INSERT ON product_version_allergens BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=NEW.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_version_allergens_delete AFTER DELETE ON product_version_allergens BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=OLD.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER category_aliases_display_insert BEFORE INSERT ON category_aliases WHEN NEW.is_display_name NOT IN (0,1) OR (NEW.is_display_name=1 AND NEW.country_id IS NULL) BEGIN
  SELECT RAISE(ABORT,'a display name must be a country-scoped alias');
END;
--> statement-breakpoint
CREATE TRIGGER category_aliases_display_update BEFORE UPDATE OF is_display_name,country_id ON category_aliases WHEN NEW.is_display_name NOT IN (0,1) OR (NEW.is_display_name=1 AND NEW.country_id IS NULL) BEGIN
  SELECT RAISE(ABORT,'a display name must be a country-scoped alias');
END;
--> statement-breakpoint
CREATE TRIGGER category_rating_dimensions_fixed BEFORE UPDATE OF key,category_id ON category_rating_dimensions
WHEN NEW.key<>OLD.key OR NEW.category_id<>OLD.category_id BEGIN
  SELECT RAISE(ABORT,'a dimension keeps its key and category');
END;
--> statement-breakpoint
CREATE TRIGGER rating_dimensions_follow_check BEFORE UPDATE OF category_id ON ratings
WHEN NEW.category_id<>OLD.category_id AND EXISTS(
  SELECT 1 FROM rating_dimension_values v JOIN category_rating_dimensions o ON o.id=v.dimension_id
  WHERE v.rating_id=NEW.id AND NOT EXISTS(SELECT 1 FROM category_rating_dimensions n WHERE n.category_id=NEW.category_id AND n.key=o.key)
) BEGIN
  SELECT RAISE(ABORT,'rating detail has no matching dimension in the new category');
END;
--> statement-breakpoint
CREATE TRIGGER rating_dimensions_follow AFTER UPDATE OF category_id ON ratings
WHEN NEW.category_id<>OLD.category_id BEGIN
  UPDATE rating_dimension_values SET dimension_id=(
    SELECT n.id FROM category_rating_dimensions o JOIN category_rating_dimensions n ON n.key=o.key AND n.category_id=NEW.category_id
    WHERE o.id=rating_dimension_values.dimension_id
  ) WHERE rating_id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER rating_dimension_revision_insert AFTER INSERT ON rating_dimension_values BEGIN
  UPDATE formula_revisions SET revision=revision+1 WHERE product_version_id=(SELECT product_version_id FROM ratings WHERE id=NEW.rating_id);
END;
--> statement-breakpoint
CREATE TRIGGER rating_dimension_revision_update AFTER UPDATE ON rating_dimension_values BEGIN
  UPDATE formula_revisions SET revision=revision+1 WHERE product_version_id=(SELECT product_version_id FROM ratings WHERE id=NEW.rating_id);
END;
--> statement-breakpoint
CREATE TRIGGER rating_dimension_revision_delete AFTER DELETE ON rating_dimension_values BEGIN
  UPDATE formula_revisions SET revision=revision+1 WHERE product_version_id=(SELECT product_version_id FROM ratings WHERE id=OLD.rating_id);
END;
--> statement-breakpoint
CREATE TRIGGER category_countries_food BEFORE INSERT ON category_countries
WHEN NOT EXISTS(SELECT 1 FROM categories WHERE id=NEW.category_id AND is_rankable=1) BEGIN
  SELECT RAISE(ABORT,'only foods are switched on per country');
END;
--> statement-breakpoint
CREATE TRIGGER category_countries_in_use BEFORE DELETE ON category_countries
WHEN EXISTS(
  SELECT 1 FROM product_categories pc JOIN products p ON p.id=pc.product_id
  WHERE pc.category_id=OLD.category_id AND p.country_id=OLD.country_id AND p.lifecycle_status<>'hidden'
) BEGIN
  SELECT RAISE(ABORT,'a food with products in a country stays on there');
END;
--> statement-breakpoint
CREATE TRIGGER category_countries_follow_membership AFTER INSERT ON product_categories BEGIN
  INSERT INTO category_countries(category_id,country_id,source,created_by,created_at)
  SELECT NEW.category_id,p.country_id,'product',NULL,CAST(unixepoch('subsecond')*1000 AS INTEGER)
  FROM products p JOIN categories c ON c.id=NEW.category_id AND c.is_rankable=1
  WHERE p.id=NEW.product_id AND p.lifecycle_status<>'hidden'
  AND NOT EXISTS(SELECT 1 FROM category_countries x WHERE x.category_id=NEW.category_id AND x.country_id=p.country_id);
END;
--> statement-breakpoint
CREATE TRIGGER category_countries_follow_restore AFTER UPDATE OF lifecycle_status ON products
WHEN OLD.lifecycle_status='hidden' AND NEW.lifecycle_status<>'hidden' BEGIN
  INSERT INTO category_countries(category_id,country_id,source,created_by,created_at)
  SELECT pc.category_id,NEW.country_id,'product',NULL,CAST(unixepoch('subsecond')*1000 AS INTEGER)
  FROM product_categories pc JOIN categories c ON c.id=pc.category_id AND c.is_rankable=1
  WHERE pc.product_id=NEW.id
  AND NOT EXISTS(SELECT 1 FROM category_countries x WHERE x.category_id=pc.category_id AND x.country_id=NEW.country_id);
END;
