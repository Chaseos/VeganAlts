CREATE TABLE `category_countries` (
	`category_id` text NOT NULL,
	`country_id` text NOT NULL,
	`source` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`category_id`, `country_id`),
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_category_countries_source" CHECK("category_countries"."source" IN ('launch','proposal','product','operator'))
);
--> statement-breakpoint
CREATE INDEX `ix_category_countries_country` ON `category_countries` (`country_id`,`category_id`);--> statement-breakpoint
-- Launch availability: every active food in every active country, plus every
-- food that already has a visible product in a country. On a fresh database
-- this inserts nothing; the taxonomy seed writes launch availability.
INSERT OR IGNORE INTO category_countries(category_id,country_id,source,created_by,created_at)
SELECT c.id,co.id,'launch',NULL,CAST(unixepoch('subsecond')*1000 AS INTEGER)
FROM categories c CROSS JOIN countries co
WHERE c.is_rankable=1 AND c.is_active=1 AND co.is_active=1;
--> statement-breakpoint
INSERT OR IGNORE INTO category_countries(category_id,country_id,source,created_by,created_at)
SELECT DISTINCT pc.category_id,p.country_id,'product',NULL,CAST(unixepoch('subsecond')*1000 AS INTEGER)
FROM product_categories pc
JOIN products p ON p.id=pc.product_id AND p.lifecycle_status<>'hidden'
JOIN categories c ON c.id=pc.category_id AND c.is_rankable=1;
--> statement-breakpoint
-- Aisles and shelves are never country-scoped.
CREATE TRIGGER category_countries_food BEFORE INSERT ON category_countries
WHEN NOT EXISTS(SELECT 1 FROM categories WHERE id=NEW.category_id AND is_rankable=1) BEGIN
  SELECT RAISE(ABORT,'only foods are switched on per country');
END;
--> statement-breakpoint
-- A food stays on wherever it has a visible product.
CREATE TRIGGER category_countries_in_use BEFORE DELETE ON category_countries
WHEN EXISTS(
  SELECT 1 FROM product_categories pc JOIN products p ON p.id=pc.product_id
  WHERE pc.category_id=OLD.category_id AND p.country_id=OLD.country_id AND p.lifecycle_status<>'hidden'
) BEGIN
  SELECT RAISE(ABORT,'a food with products in a country stays on there');
END;
--> statement-breakpoint
-- Publication, category additions and merges all insert memberships, so one
-- trigger switches the food on in the product's country for every path.
-- The NOT EXISTS guard (not OR IGNORE) keeps the outer statement's conflict
-- policy from replacing an existing row.
CREATE TRIGGER category_countries_follow_membership AFTER INSERT ON product_categories BEGIN
  INSERT INTO category_countries(category_id,country_id,source,created_by,created_at)
  SELECT NEW.category_id,p.country_id,'product',NULL,CAST(unixepoch('subsecond')*1000 AS INTEGER)
  FROM products p JOIN categories c ON c.id=NEW.category_id AND c.is_rankable=1
  WHERE p.id=NEW.product_id AND p.lifecycle_status<>'hidden'
  AND NOT EXISTS(SELECT 1 FROM category_countries x WHERE x.category_id=NEW.category_id AND x.country_id=p.country_id);
END;
--> statement-breakpoint
CREATE TRIGGER category_countries_follow_restore AFTER UPDATE OF lifecycle_status ON products
WHEN OLD.lifecycle_status='hidden' AND NEW.lifecycle_status<>'hidden' BEGIN
  INSERT INTO category_countries(category_id,country_id,source,created_by,created_at)
  SELECT pc.category_id,NEW.country_id,'product',NULL,CAST(unixepoch('subsecond')*1000 AS INTEGER)
  FROM product_categories pc JOIN categories c ON c.id=pc.category_id AND c.is_rankable=1
  WHERE pc.product_id=NEW.id
  AND NOT EXISTS(SELECT 1 FROM category_countries x WHERE x.category_id=pc.category_id AND x.country_id=NEW.country_id);
END;
