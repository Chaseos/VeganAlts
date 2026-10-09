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
CREATE INDEX `ix_product_category_dimension_stats_category` ON `product_category_dimension_stats` (`category_id`,`dimension_id`);--> statement-breakpoint
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
-- D1 has no foreign_keys switch; nothing references the ledger, and the copy
-- keeps every merge_id valid.
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_category_merge_moves` (
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
	CONSTRAINT "ck_category_merge_move_type" CHECK("__new_category_merge_moves"."entity_type" IN ('rating','membership','comment','dimension')),
	CONSTRAINT "ck_category_merge_move_role" CHECK("__new_category_merge_moves"."role" IN ('moved','donor_wins','donor_loses','survivor_loses','membership_added','membership_existing','membership_removed','comment_moved','dimension_added'))
);
--> statement-breakpoint
INSERT INTO `__new_category_merge_moves`("merge_id", "entity_type", "entity_id", "product_id", "role", "partner_id", "prior_counted", "prior_eligible", "created_at") SELECT "merge_id", "entity_type", "entity_id", "product_id", "role", "partner_id", "prior_counted", "prior_eligible", "created_at" FROM `category_merge_moves`;--> statement-breakpoint
DROP TABLE `category_merge_moves`;--> statement-breakpoint
ALTER TABLE `__new_category_merge_moves` RENAME TO `category_merge_moves`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE INDEX `ix_category_merge_moves_role` ON `category_merge_moves` (`merge_id`,`role`);
--> statement-breakpoint
-- A dimension keeps its key and food for life, so answers, sorts and merge
-- ledgers can follow it by key.
CREATE TRIGGER category_rating_dimensions_fixed BEFORE UPDATE OF key,category_id ON category_rating_dimensions
WHEN NEW.key<>OLD.key OR NEW.category_id<>OLD.category_id BEGIN
  SELECT RAISE(ABORT,'a dimension keeps its key and category');
END;
--> statement-breakpoint
-- A rating that changes food (merges and their reversal) takes its detail
-- answers to the same-key dimensions of the new food; one must exist.
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
-- Detail answers are canonical rating data: concurrent formula writers retry.
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
-- Existing counted ratings have no recency answer yet.
INSERT INTO product_category_familiarity_stats(product_version_id,category_id,recency,overall_similarity,rating_count,recomputed_at)
SELECT r.product_version_id,r.category_id,COALESCE(r.conventional_recency,'unanswered'),r.overall_similarity,COUNT(*),CAST(unixepoch('subsecond')*1000 AS INTEGER)
FROM ratings r JOIN product_versions v ON v.id=r.product_version_id JOIN product_categories pc ON pc.product_id=v.product_id AND pc.category_id=r.category_id
WHERE r.is_counted=1
GROUP BY r.product_version_id,r.category_id,COALESCE(r.conventional_recency,'unanswered'),r.overall_similarity;
