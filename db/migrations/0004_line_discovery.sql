CREATE TABLE `family_category_daily_stats` (
	`stat_date` text NOT NULL,
	`product_family_id` text NOT NULL,
	`category_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rating_count` integer DEFAULT 0 NOT NULL,
	`similarity_sum` integer DEFAULT 0 NOT NULL,
	`tried` integer DEFAULT 0 NOT NULL,
	`commented` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`stat_date`, `product_family_id`, `category_id`, `user_id`),
	FOREIGN KEY (`product_family_id`) REFERENCES `product_families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_family_category_daily_stats_1" CHECK(rating_count >= 0 AND similarity_sum BETWEEN rating_count AND rating_count * 5 AND tried IN (0, 1) AND commented IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX `ix_family_daily_category_date` ON `family_category_daily_stats` (`category_id`,"stat_date" desc);--> statement-breakpoint
CREATE TABLE `family_category_first_published` (
	`product_family_id` text NOT NULL,
	`category_id` text NOT NULL,
	`first_published_at` integer NOT NULL,
	PRIMARY KEY(`product_family_id`, `category_id`),
	FOREIGN KEY (`product_family_id`) REFERENCES `product_families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_family_first_published_category` ON `family_category_first_published` (`category_id`,"first_published_at" desc);--> statement-breakpoint
CREATE TABLE `family_category_trends` (
	`category_id` text NOT NULL,
	`product_family_id` text NOT NULL,
	`trending_score` real NOT NULL,
	`rank` integer NOT NULL,
	`inputs` text NOT NULL,
	`computed_at` integer NOT NULL,
	PRIMARY KEY(`category_id`, `product_family_id`),
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_family_id`) REFERENCES `product_families`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_family_category_trends_1" CHECK(json_valid(inputs) AND trending_score > 0 AND rank >= 1)
);
--> statement-breakpoint
CREATE INDEX `ix_family_trends_category_rank` ON `family_category_trends` (`category_id`,`rank`);--> statement-breakpoint
DROP TABLE `product_category_daily_stats`;--> statement-breakpoint
DROP TABLE `product_category_trends`;--> statement-breakpoint
DROP INDEX `ix_product_category_stats_trending`;--> statement-breakpoint
ALTER TABLE `product_category_stats` DROP COLUMN `trending_score`;--> statement-breakpoint
-- Milestone 7: when each line first appeared in each food, from every flavor
-- it has there now (published, eligible or not). Later refreshes only move a
-- date earlier.
INSERT INTO family_category_first_published(product_family_id,category_id,first_published_at)
SELECT p.product_family_id,pc.category_id,MIN(p.published_at)
FROM products p JOIN product_categories pc ON pc.product_id=p.id
WHERE p.published_at IS NOT NULL
GROUP BY p.product_family_id,pc.category_id;
