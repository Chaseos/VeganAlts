CREATE TABLE `family_category_dimension_stats` (
	`product_family_id` text NOT NULL,
	`category_id` text NOT NULL,
	`dimension_id` text NOT NULL,
	`people_count` integer NOT NULL,
	`mean_sum` real NOT NULL,
	`recomputed_at` integer NOT NULL,
	PRIMARY KEY(`product_family_id`, `category_id`, `dimension_id`),
	FOREIGN KEY (`product_family_id`) REFERENCES `product_families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dimension_id`) REFERENCES `category_rating_dimensions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_family_category_dimension_stats_1" CHECK(people_count > 0 AND mean_sum BETWEEN people_count - 0.000001 AND people_count * 5 + 0.000001)
);
--> statement-breakpoint
CREATE INDEX `ix_family_category_dimension_stats_category` ON `family_category_dimension_stats` (`category_id`,`dimension_id`);--> statement-breakpoint
CREATE TABLE `family_category_stats` (
	`product_family_id` text NOT NULL,
	`category_id` text NOT NULL,
	`people_count` integer DEFAULT 0 NOT NULL,
	`mean_sum` real DEFAULT 0 NOT NULL,
	`raw_average` real,
	`bayesian_score` real,
	`enjoyment_people` integer DEFAULT 0 NOT NULL,
	`enjoyment_mean_sum` real DEFAULT 0 NOT NULL,
	`enjoyment_average` real,
	`enjoyment_score` real,
	`tried_count` integer DEFAULT 0 NOT NULL,
	`recent_count` integer DEFAULT 0 NOT NULL,
	`lead_product_id` text,
	`recomputed_at` integer NOT NULL,
	PRIMARY KEY(`product_family_id`, `category_id`),
	FOREIGN KEY (`product_family_id`) REFERENCES `product_families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_family_category_stats_1" CHECK(people_count >= 0 AND enjoyment_people >= 0 AND tried_count >= 0 AND recent_count >= 0),
	CONSTRAINT "ck_family_category_stats_2" CHECK(mean_sum >= 0 AND enjoyment_mean_sum >= 0)
);
--> statement-breakpoint
CREATE INDEX `ix_family_category_stats_closest` ON `family_category_stats` (`category_id`,"bayesian_score" desc,"people_count" desc);--> statement-breakpoint
CREATE INDEX `ix_family_category_stats_tastiest` ON `family_category_stats` (`category_id`,"enjoyment_score" desc,"enjoyment_people" desc);--> statement-breakpoint
ALTER TABLE `product_category_stats` ADD `enjoyment_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_category_stats` ADD `enjoyment_sum` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_category_stats` ADD `enjoyment_score` real;--> statement-breakpoint
ALTER TABLE `product_families` ADD `country_id` text REFERENCES countries(id) ON DELETE restrict;--> statement-breakpoint
CREATE INDEX `ix_product_families_brand_country` ON `product_families` (`brand_id`,`country_id`);--> statement-breakpoint
ALTER TABLE `products` ADD `flavor` text;--> statement-breakpoint
CREATE INDEX `ix_products_family` ON `products` (`product_family_id`);--> statement-breakpoint
ALTER TABLE `ratings` ADD `enjoyment` integer;--> statement-breakpoint
-- Milestone 7: every product belongs to one recipe line (product family) of
-- its own brand and country. A product without a line starts its own, named
-- after it, with a slug from its country code and slug.
INSERT INTO product_families(id,brand_id,country_id,canonical_name,slug,created_at,updated_at)
SELECT 'line-' || p.id, p.brand_id, p.country_id, p.name,
  CASE WHEN EXISTS(SELECT 1 FROM product_families f WHERE f.slug = lower(c.iso2) || '-' || p.slug)
    THEN lower(c.iso2) || '-' || p.slug || '-' || p.id
    ELSE lower(c.iso2) || '-' || p.slug END,
  p.created_at, p.updated_at
FROM products p JOIN countries c ON c.id = p.country_id
WHERE p.product_family_id IS NULL;
--> statement-breakpoint
UPDATE products SET product_family_id = 'line-' || id WHERE product_family_id IS NULL;
--> statement-breakpoint
-- An existing line whose products span countries or brands splits into one
-- line per country and brand. The group holding the line's own brand (then
-- the earliest product) keeps the line; each other group gets a copy named
-- the same.
CREATE TABLE m7_line_groups(family_id text NOT NULL, country_id text NOT NULL, brand_id text, first_product text NOT NULL, keep integer NOT NULL DEFAULT 0);
--> statement-breakpoint
INSERT INTO m7_line_groups(family_id,country_id,brand_id,first_product)
SELECT p.product_family_id, p.country_id, p.brand_id,
  (SELECT q.id FROM products q WHERE q.product_family_id = p.product_family_id AND q.country_id = p.country_id AND q.brand_id IS p.brand_id ORDER BY q.created_at, q.id LIMIT 1)
FROM products p GROUP BY p.product_family_id, p.country_id, p.brand_id;
--> statement-breakpoint
UPDATE m7_line_groups SET keep = 1 WHERE rowid IN (
  SELECT (SELECT g2.rowid FROM m7_line_groups g2
      JOIN products fp ON fp.id = g2.first_product
      JOIN product_families f ON f.id = g2.family_id
    WHERE g2.family_id = g.family_id
    ORDER BY (g2.brand_id IS f.brand_id) DESC, fp.created_at, fp.id LIMIT 1)
  FROM m7_line_groups g GROUP BY g.family_id);
--> statement-breakpoint
UPDATE product_families SET
  country_id = (SELECT g.country_id FROM m7_line_groups g WHERE g.family_id = product_families.id AND g.keep = 1),
  brand_id = (SELECT g.brand_id FROM m7_line_groups g WHERE g.family_id = product_families.id AND g.keep = 1)
WHERE id IN (SELECT family_id FROM m7_line_groups WHERE keep = 1);
--> statement-breakpoint
INSERT INTO product_families(id,brand_id,country_id,canonical_name,slug,created_at,updated_at)
SELECT 'line-' || g.first_product, g.brand_id, g.country_id, f.canonical_name,
  f.slug || '-' || lower(c.iso2) || '-' || fp.slug, f.created_at, f.updated_at
FROM m7_line_groups g
  JOIN product_families f ON f.id = g.family_id
  JOIN countries c ON c.id = g.country_id
  JOIN products fp ON fp.id = g.first_product
WHERE g.keep = 0;
--> statement-breakpoint
UPDATE products SET product_family_id = (
    SELECT 'line-' || g.first_product FROM m7_line_groups g
    WHERE g.family_id = products.product_family_id AND g.country_id = products.country_id AND g.brand_id IS products.brand_id AND g.keep = 0)
WHERE EXISTS(
  SELECT 1 FROM m7_line_groups g
  WHERE g.family_id = products.product_family_id AND g.country_id = products.country_id AND g.brand_id IS products.brand_id AND g.keep = 0);
--> statement-breakpoint
DROP TABLE m7_line_groups;
--> statement-breakpoint
-- A line has a country. Lines that predate this migration with no products
-- keep a NULL country until they are given one.
CREATE TRIGGER product_families_country_insert BEFORE INSERT ON product_families
WHEN NEW.country_id IS NULL
BEGIN SELECT RAISE(ABORT, 'a line needs a country'); END;
--> statement-breakpoint
CREATE TRIGGER product_families_line_update BEFORE UPDATE OF brand_id, country_id ON product_families
WHEN (NEW.country_id IS NULL AND OLD.country_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM products p WHERE p.product_family_id = NEW.id AND (p.country_id IS NOT NEW.country_id OR p.brand_id IS NOT NEW.brand_id))
BEGIN SELECT RAISE(ABORT, 'a line keeps its products'' brand and country'); END;
--> statement-breakpoint
CREATE TRIGGER product_families_in_use BEFORE DELETE ON product_families
WHEN EXISTS(SELECT 1 FROM products WHERE product_family_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'a line with products cannot be deleted'); END;
--> statement-breakpoint
-- A product is inserted into a line of its own brand and country and never
-- leaves one; moving to another line of the same brand and country is fine.
CREATE TRIGGER products_line_insert BEFORE INSERT ON products
WHEN NOT EXISTS(SELECT 1 FROM product_families f WHERE f.id = NEW.product_family_id AND f.country_id = NEW.country_id AND f.brand_id IS NEW.brand_id)
BEGIN SELECT RAISE(ABORT, 'a product needs a line of its brand and country'); END;
--> statement-breakpoint
CREATE TRIGGER products_line_update BEFORE UPDATE OF product_family_id, brand_id, country_id ON products
WHEN NOT EXISTS(SELECT 1 FROM product_families f WHERE f.id = NEW.product_family_id AND f.country_id = NEW.country_id AND f.brand_id IS NEW.brand_id)
BEGIN SELECT RAISE(ABORT, 'a product needs a line of its brand and country'); END;
--> statement-breakpoint
-- A flavor label is trimmed, never blank and at most 40 characters; NULL is
-- the line's original.
CREATE TRIGGER products_flavor_insert BEFORE INSERT ON products
WHEN NEW.flavor IS NOT NULL AND (typeof(NEW.flavor) <> 'text' OR NEW.flavor <> trim(NEW.flavor, ' ' || char(9) || char(10) || char(13)) OR NEW.flavor = '' OR length(NEW.flavor) > 40)
BEGIN SELECT RAISE(ABORT, 'a flavor is trimmed, not blank and at most 40 characters'); END;
--> statement-breakpoint
CREATE TRIGGER products_flavor_update BEFORE UPDATE OF flavor ON products
WHEN NEW.flavor IS NOT NULL AND (typeof(NEW.flavor) <> 'text' OR NEW.flavor <> trim(NEW.flavor, ' ' || char(9) || char(10) || char(13)) OR NEW.flavor = '' OR length(NEW.flavor) > 40)
BEGIN SELECT RAISE(ABORT, 'a flavor is trimmed, not blank and at most 40 characters'); END;
--> statement-breakpoint
-- The optional Tastiest answer is a whole number from 1 to 5.
CREATE TRIGGER ratings_enjoyment_insert BEFORE INSERT ON ratings
WHEN NEW.enjoyment IS NOT NULL AND (typeof(NEW.enjoyment) <> 'integer' OR NEW.enjoyment NOT BETWEEN 1 AND 5)
BEGIN SELECT RAISE(ABORT, 'enjoyment must be a whole number from 1 to 5'); END;
--> statement-breakpoint
CREATE TRIGGER ratings_enjoyment_update BEFORE UPDATE OF enjoyment ON ratings
WHEN NEW.enjoyment IS NOT NULL AND (typeof(NEW.enjoyment) <> 'integer' OR NEW.enjoyment NOT BETWEEN 1 AND 5)
BEGIN SELECT RAISE(ABORT, 'enjoyment must be a whole number from 1 to 5'); END;
