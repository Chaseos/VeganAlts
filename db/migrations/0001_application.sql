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
CREATE INDEX `ix_audit_entity` ON `audit_log` (`entity_type`,`entity_id`,"created_at" desc);--> statement-breakpoint
CREATE TABLE `brands` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`website_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_brands_slug` ON `brands` (`slug`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`is_rankable` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_categories_1" CHECK(is_rankable IN (0, 1)),
	CONSTRAINT "ck_categories_2" CHECK(is_active IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `ix_categories_parent_active` ON `categories` (`parent_id`,`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_categories_slug` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `category_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`country_id` text,
	`alias` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_category_aliases_alias` ON `category_aliases` ("alias" COLLATE NOCASE);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_category_aliases_category_id_country_id_alias` ON `category_aliases` (`category_id`,`country_id`,"alias" COLLATE NOCASE);--> statement-breakpoint
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
CREATE UNIQUE INDEX `ux_category_rating_dimensions_category_id_key` ON `category_rating_dimensions` (`category_id`,`key`);--> statement-breakpoint
CREATE TABLE `comment_reactions` (
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction` text DEFAULT 'helpful' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`comment_id`, `user_id`, `reaction`),
	FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_comment_reactions_1" CHECK(reaction = 'helpful')
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_version_id` text NOT NULL,
	`category_id` text,
	`body` text NOT NULL,
	`moderation_state` text DEFAULT 'visible' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_comments_1" CHECK(moderation_state IN ('visible', 'hidden', 'removed'))
);
--> statement-breakpoint
CREATE INDEX `ix_comments_version_created` ON `comments` (`product_version_id`,"created_at" desc);--> statement-breakpoint
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
CREATE UNIQUE INDEX `ux_countries_iso2` ON `countries` (`iso2`);--> statement-breakpoint
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
	`resolved_at` integer,
	FOREIGN KEY (`submitted_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_edit_proposals_1" CHECK(target_type IN ('product', 'product_version', 'product_image', 'product_category', 'product_retailer', 'retailer')),
	CONSTRAINT "ck_edit_proposals_2" CHECK(risk_tier BETWEEN 1 AND 3),
	CONSTRAINT "ck_edit_proposals_3" CHECK(status IN ('pending', 'accepted', 'rejected', 'superseded', 'withdrawn'))
);
--> statement-breakpoint
CREATE INDEX `ix_edit_proposals_target` ON `edit_proposals` (`target_type`,`target_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_edit_proposals_queue` ON `edit_proposals` (`status`,"risk_tier" desc,`created_at`);--> statement-breakpoint
CREATE TABLE `product_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`alias` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_product_aliases_alias` ON `product_aliases` ("alias" COLLATE NOCASE);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_product_aliases_product_id_alias` ON `product_aliases` (`product_id`,"alias" COLLATE NOCASE);--> statement-breakpoint
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
CREATE INDEX `ix_product_categories_category_eligible` ON `product_categories` (`category_id`,`ranking_eligible`,`product_id`);--> statement-breakpoint
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
CREATE INDEX `ix_daily_stats_category_date` ON `product_category_daily_stats` (`category_id`,"stat_date" desc);--> statement-breakpoint
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
CREATE INDEX `ix_product_category_stats_trending` ON `product_category_stats` (`category_id`,"trending_score" desc);--> statement-breakpoint
CREATE INDEX `ix_product_category_stats_top` ON `product_category_stats` (`category_id`,"bayesian_score" desc,"rating_count" desc);--> statement-breakpoint
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
CREATE UNIQUE INDEX `ux_product_families_slug` ON `product_families` (`slug`);--> statement-breakpoint
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
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submitted_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_product_images_1" CHECK(slot IN ('front', 'back', 'ingredients', 'nutrition', 'prepared')),
	CONSTRAINT "ck_product_images_2" CHECK(state IN ('pending', 'accepted', 'rejected', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_product_images_accepted_slot` ON `product_images` (`product_version_id`,`slot`) WHERE state = 'accepted';--> statement-breakpoint
CREATE INDEX `ix_product_images_version_slot_state` ON `product_images` (`product_version_id`,`slot`,`state`);--> statement-breakpoint
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
CREATE INDEX `ix_product_retailers_product_status` ON `product_retailers` (`product_id`,`status`);--> statement-breakpoint
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
CREATE INDEX `ix_product_trials_version` ON `product_trials` (`product_version_id`);--> statement-breakpoint
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
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_product_versions_1" CHECK(is_current IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_product_versions_current` ON `product_versions` (`product_id`) WHERE is_current = 1;--> statement-breakpoint
CREATE INDEX `ix_product_versions_product` ON `product_versions` (`product_id`,"effective_from" desc);--> statement-breakpoint
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
	`updated_at` integer NOT NULL,
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
CREATE INDEX `ix_products_brand_country` ON `products` (`brand_id`,`country_id`);--> statement-breakpoint
CREATE INDEX `ix_products_country_status` ON `products` (`country_id`,`lifecycle_status`,"updated_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_products_country_id_slug` ON `products` (`country_id`,`slug`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `ux_profiles_handle` ON `profiles` ("handle" COLLATE NOCASE);--> statement-breakpoint
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
CREATE INDEX `ix_ratings_user_updated` ON `ratings` (`user_id`,"updated_at" desc);--> statement-breakpoint
CREATE INDEX `ix_ratings_version_category_counted` ON `ratings` (`product_version_id`,`category_id`,`is_counted`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_ratings_user_id_product_version_id_category_id` ON `ratings` (`user_id`,`product_version_id`,`category_id`);--> statement-breakpoint
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
CREATE INDEX `ix_reports_target` ON `reports` (`target_type`,`target_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_reports_queue` ON `reports` (`status`,`created_at`);--> statement-breakpoint
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
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_retailers_slug` ON `retailers` (`slug`);