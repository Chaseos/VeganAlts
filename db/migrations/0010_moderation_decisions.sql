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
CREATE INDEX `ix_decision_subject` ON `moderation_decisions` (`subject_type`,`subject_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_decision_reuse` ON `moderation_decisions` (`kind`,`schema_version`,`policy_version`,`model`,`input_hash`,`created_at`) WHERE "moderation_decisions"."status" = 'completed';--> statement-breakpoint
CREATE INDEX `ix_decision_budget` ON `moderation_decisions` (`created_at`) WHERE "moderation_decisions"."charged" = 1;--> statement-breakpoint
CREATE INDEX `ix_decision_account_budget` ON `moderation_decisions` (`user_id`,`created_at`) WHERE "moderation_decisions"."charged" = 1;--> statement-breakpoint
CREATE INDEX `ix_decision_leases` ON `moderation_decisions` (`lease_expires_at`) WHERE "moderation_decisions"."status" = 'reserved';