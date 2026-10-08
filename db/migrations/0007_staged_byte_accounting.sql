ALTER TABLE `submission_uploads` ADD `created_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE submission_uploads SET created_at=(SELECT created_at FROM submission_receipts WHERE id=submission_id) WHERE created_at=0;
