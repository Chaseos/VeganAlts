CREATE TABLE `product_category_trends` (
	`category_id` text NOT NULL,
	`product_version_id` text NOT NULL,
	`product_id` text NOT NULL,
	`trending_score` real NOT NULL,
	`inputs` text NOT NULL,
	`computed_at` integer NOT NULL,
	PRIMARY KEY(`category_id`, `product_version_id`),
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_trends_inputs" CHECK(json_valid(inputs))
);
--> statement-breakpoint
CREATE INDEX `ix_trends_category_score` ON `product_category_trends` (`category_id`,"trending_score" desc,`product_id`);--> statement-breakpoint
CREATE INDEX `ix_product_trials_created` ON `product_trials` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_products_country_published` ON `products` (`country_id`,"published_at" desc,"id" desc);--> statement-breakpoint
CREATE INDEX `ix_ratings_created` ON `ratings` (`created_at`);