ALTER TABLE `edit_proposals` ADD `confirm_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `edit_proposals` ADD `disagree_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `edit_proposals` ADD `evidence_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `ix_moderation_action_actor` ON `moderation_actions` (`actor_id`,`created_at`);