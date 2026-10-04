CREATE INDEX `ix_product_images_full_key` ON `product_images` (`full_r2_key`);--> statement-breakpoint
CREATE INDEX `ix_product_images_thumbnail_key` ON `product_images` (`thumbnail_r2_key`);--> statement-breakpoint
CREATE INDEX `ix_product_images_evidence_key` ON `product_images` (`evidence_r2_key`);--> statement-breakpoint
CREATE INDEX `ix_media_attempt_created` ON `media_attempts` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_media_attempt_upload` ON `media_attempts` (`upload_id`);