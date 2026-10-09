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
CREATE INDEX `ix_category_features_order` ON `category_features` (`country_id`,`position`);--> statement-breakpoint
CREATE TABLE `category_merge_moves` (
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
	CONSTRAINT "ck_category_merge_move_type" CHECK("category_merge_moves"."entity_type" IN ('rating','membership','comment')),
	CONSTRAINT "ck_category_merge_move_role" CHECK("category_merge_moves"."role" IN ('moved','donor_wins','donor_loses','survivor_loses','membership_added','membership_existing','membership_removed','comment_moved'))
);
--> statement-breakpoint
CREATE INDEX `ix_category_merge_moves_role` ON `category_merge_moves` (`merge_id`,`role`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `ux_category_merge_active_donor` ON `category_merges` (`donor_id`) WHERE "category_merges"."active" = 1;--> statement-breakpoint
CREATE INDEX `ix_category_merge_survivor` ON `category_merges` (`survivor_id`,`active`);--> statement-breakpoint
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
CREATE INDEX `ix_category_proposals_queue` ON `category_proposals` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_category_proposals_user` ON `category_proposals` (`submitted_by`,`created_at`);--> statement-breakpoint
CREATE TABLE `category_slug_history` (
	`old_slug` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `categories` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Homepage features move from code to data. Existing environments keep the
-- previously hard-coded order wherever those categories exist.
INSERT INTO `category_features` (`country_id`, `category_id`, `position`, `updated_at`)
SELECT co.`id`, c.`id`, j.`key` + 1, 0
FROM json_each('["ground-beef","beef-burgers","milk","cheddar","butter","eggs"]') j
JOIN `categories` c ON c.`slug` = j.`value` AND c.`is_active` = 1
CROSS JOIN `countries` co WHERE co.`iso2` = 'US'
ON CONFLICT DO NOTHING;
