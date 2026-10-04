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
CREATE INDEX `ix_media_attempt_recovery` ON `media_attempts` (`state`,`lease_expires_at`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `ux_media_upload_idempotency` ON `media_uploads` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `ix_media_upload_state_updated` ON `media_uploads` (`state`,`updated_at`);--> statement-breakpoint
ALTER TABLE `product_images` ADD `evidence_r2_key` text;--> statement-breakpoint
ALTER TABLE `product_images` ADD `evidence_width` integer;--> statement-breakpoint
ALTER TABLE `product_images` ADD `evidence_height` integer;--> statement-breakpoint
-- D1 cannot disable foreign keys. Additive columns preserve dependent rows.
ALTER TABLE products ADD development_only integer NOT NULL DEFAULT 0
  CONSTRAINT ck_products_development CHECK(development_only IN (0, 1));
--> statement-breakpoint
ALTER TABLE products ADD source_checked_at integer;
--> statement-breakpoint
ALTER TABLE products ADD data_notes text;
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_category_aliases_global` ON `category_aliases` (`category_id`,"alias" COLLATE NOCASE) WHERE "category_aliases"."country_id" IS NULL;