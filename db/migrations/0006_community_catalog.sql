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
CREATE INDEX `ix_duplicate_survivor` ON `duplicate_consolidations` (`survivor_id`,`active`);--> statement-breakpoint
CREATE TABLE `formula_classifications` (
	`product_version_id` text PRIMARY KEY NOT NULL,
	`vegan_status` text NOT NULL,
	`manufacturer_label` text NOT NULL,
	`evidence_data` text NOT NULL,
	`certifications` text DEFAULT '[]' NOT NULL,
	`reviewed_by` text,
	`updated_at` integer NOT NULL,
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
CREATE INDEX `ix_moderation_action_product` ON `moderation_actions` (`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pending_submissions` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`proposed_data` text NOT NULL,
	`reasons` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`resolved_by` text,
	`resolution_note` text,
	`resolved_at` integer,
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
CREATE INDEX `ix_product_identity_product` ON `product_identity_keys` (`product_id`);--> statement-breakpoint
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
CREATE INDEX `ix_staged_attempt_budget` ON `staged_attempts` (`created_at`,`user_id`);--> statement-breakpoint
CREATE INDEX `ix_staged_attempt_blob` ON `staged_attempts` (`blob_id`);--> statement-breakpoint
CREATE INDEX `ix_staged_attempt_leases` ON `staged_attempts` (`state`,`lease_expires_at`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `ux_staged_content_profile` ON `staged_blobs` (`user_id`,`content_hash`,`profile`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `ux_submission_idempotency` ON `submission_receipts` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `ix_submission_owner_created` ON `submission_receipts` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `ix_submission_expiry` ON `submission_receipts` (`state`,`expires_at`);--> statement-breakpoint
CREATE TABLE `submission_uploads` (
	`submission_id` text NOT NULL,
	`slot` text NOT NULL,
	`blob_id` text NOT NULL,
	`image_id` text NOT NULL,
	PRIMARY KEY(`submission_id`, `slot`),
	FOREIGN KEY (`submission_id`) REFERENCES `submission_receipts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`blob_id`) REFERENCES `staged_blobs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_submission_upload_slot" CHECK("submission_uploads"."slot" IN ('front','back','ingredients','nutrition','prepared'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_submission_image_id` ON `submission_uploads` (`image_id`);--> statement-breakpoint
CREATE INDEX `ix_submission_upload_blob` ON `submission_uploads` (`blob_id`);--> statement-breakpoint
ALTER TABLE `brands` ADD `normalized_name` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_brands_normalized` ON `brands` (`normalized_name`);--> statement-breakpoint
-- Reviewed additive replacement for the generated table rebuild: retain all
-- dependent ratings, images and triggers. D1 cannot disable foreign keys.
ALTER TABLE product_versions ADD effective_date text;
--> statement-breakpoint
ALTER TABLE product_versions ADD effective_date_precision text NOT NULL DEFAULT 'unknown'
  CONSTRAINT ck_formula_date_precision CHECK(effective_date_precision IN ('unknown','year','month','day'));
--> statement-breakpoint
ALTER TABLE `products` ADD `published_at` integer;--> statement-breakpoint
ALTER TABLE `retailers` ADD `normalized_name` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_retailers_normalized` ON `retailers` (`normalized_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `ux_reports_active_reporter_reason` ON `reports` (`reporter_user_id`,`target_type`,`target_id`,`reason_code`) WHERE "reports"."status" IN ('open','reviewing');
--> statement-breakpoint
-- Reviewed backfill and cross-table fences. Historical classifications stay unknown.
UPDATE brands SET normalized_name=replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim(name)),' ',''),'''',''),'’',''),'.',''),',',''),'&',''),'-',''),'(',''),')',''),'/','');
--> statement-breakpoint
UPDATE retailers SET normalized_name=replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim(canonical_name)),' ',''),'''',''),'’',''),'.',''),',',''),'&',''),'-',''),'(',''),')',''),'/','');
--> statement-breakpoint
UPDATE products SET published_at=created_at;
--> statement-breakpoint
INSERT INTO catalog_revisions(product_id) SELECT id FROM products;
--> statement-breakpoint
INSERT OR IGNORE INTO product_identity_keys(identity_key,product_id) SELECT p.country_id||':'||COALESCE(b.normalized_name,'')||':'||replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim(p.name)),' ',''),'''',''),'’',''),'.',''),',',''),'&',''),'-',''),'(',''),')',''),'/','') ,p.id FROM products p LEFT JOIN brands b ON b.id=p.brand_id ORDER BY p.created_at,p.id;
--> statement-breakpoint
INSERT INTO formula_classifications(product_version_id,vegan_status,manufacturer_label,evidence_data,updated_at) SELECT v.id,p.vegan_status,p.manufacturer_label,json_object('urls',json('[]'),'imageIds',json('[]'),'note','Legacy classification; supporting evidence has not been reviewed.'),p.updated_at FROM product_versions v JOIN products p ON p.id=v.product_id WHERE v.is_current=1;
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
