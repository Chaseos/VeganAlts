-- Rebuilds the never-written comments table and replaces helpful-only
-- reactions with one up/down usefulness vote per account. D1 cannot disable
-- foreign keys, so this fails closed unless both old tables are empty; the
-- migration command's preflight (db/upgrades/comment-rebuild.ts) checks first.
CREATE TABLE `_m4_comment_rebuild_guard` (`n` integer NOT NULL CHECK(`n` = 0));--> statement-breakpoint
INSERT INTO `_m4_comment_rebuild_guard` SELECT (SELECT COUNT(*) FROM `comments`) + (SELECT COUNT(*) FROM `comment_reactions`);--> statement-breakpoint
DROP TABLE `_m4_comment_rebuild_guard`;--> statement-breakpoint
DROP TABLE `comment_reactions`;--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
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
CREATE INDEX `ix_comments_version_created` ON `comments` (`product_version_id`,"created_at" desc);--> statement-breakpoint
CREATE INDEX `ix_comments_version_best` ON `comments` (`product_version_id`,"best_rank" desc,"created_at" desc,"id" desc) WHERE moderation_state = 'visible' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ix_comments_version_newest` ON `comments` (`product_version_id`,"created_at" desc,"id" desc) WHERE moderation_state = 'visible' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ix_comments_product_newest` ON `comments` (`product_id`,"created_at" desc,"id" desc) WHERE moderation_state = 'visible' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ix_comments_user_created` ON `comments` (`user_id`,"created_at" desc);--> statement-breakpoint
CREATE INDEX `ix_comments_pending` ON `comments` (`created_at`) WHERE moderation_state = 'pending' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ix_comments_created` ON `comments` (`created_at`);--> statement-breakpoint
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
CREATE INDEX `ix_comment_votes_user` ON `comment_votes` (`user_id`,"updated_at" desc);
