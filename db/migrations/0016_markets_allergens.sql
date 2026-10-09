CREATE TABLE `allergens` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "ck_allergens_key" CHECK(key GLOB '[a-z]*' AND key NOT GLOB '*[^a-z_]*' AND length(key) BETWEEN 2 AND 30)
);
--> statement-breakpoint
CREATE TABLE `country_allergens` (
	`country_id` text NOT NULL,
	`allergen_key` text NOT NULL,
	`position` integer NOT NULL,
	`label` text,
	PRIMARY KEY(`country_id`, `allergen_key`),
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`allergen_key`) REFERENCES `allergens`(`key`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ix_country_allergens_position` ON `country_allergens` (`country_id`,`position`);--> statement-breakpoint
CREATE TABLE `product_version_allergen_declarations` (
	`product_version_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`evidence_data` text NOT NULL,
	`source_proposal_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_version_id`) REFERENCES `product_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_proposal_id`) REFERENCES `edit_proposals`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_allergen_declarations_status" CHECK(status IN ('declared', 'none_declared')),
	CONSTRAINT "ck_allergen_declarations_evidence" CHECK(json_valid(evidence_data))
);
--> statement-breakpoint
CREATE TABLE `product_version_allergens` (
	`product_version_id` text NOT NULL,
	`allergen_key` text NOT NULL,
	`presence` text NOT NULL,
	PRIMARY KEY(`product_version_id`, `allergen_key`),
	FOREIGN KEY (`product_version_id`) REFERENCES `product_version_allergen_declarations`(`product_version_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`allergen_key`) REFERENCES `allergens`(`key`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_product_version_allergens_presence" CHECK(presence IN ('contains', 'may_contain'))
);
--> statement-breakpoint
CREATE INDEX `ix_product_version_allergens_key` ON `product_version_allergens` (`allergen_key`,`product_version_id`);--> statement-breakpoint
CREATE INDEX `ix_retailer_markets_country` ON `retailer_markets` (`country_id`,`is_active`,`retailer_id`);
--> statement-breakpoint
-- The shared allergen vocabulary. Each country's list (country_allergens) is
-- written by the taxonomy seed, because country rows are seeded data.
INSERT INTO allergens(key,label,created_at) VALUES ('milk','Milk',unixepoch()*1000),('egg','Egg',unixepoch()*1000),('fish','Fish',unixepoch()*1000),('crustacean','Crustacean shellfish',unixepoch()*1000),('mollusc','Molluscs',unixepoch()*1000),('tree_nuts','Tree nuts',unixepoch()*1000),('peanut','Peanuts',unixepoch()*1000),('wheat','Wheat',unixepoch()*1000),('gluten','Gluten',unixepoch()*1000),('soy','Soy',unixepoch()*1000),('sesame','Sesame',unixepoch()*1000),('mustard','Mustard',unixepoch()*1000),('celery','Celery',unixepoch()*1000),('lupin','Lupin',unixepoch()*1000),('sulphites','Sulphites',unixepoch()*1000);
--> statement-breakpoint
-- An allergen row belongs to a declared label and to the product country's list.
CREATE TRIGGER product_version_allergens_insert BEFORE INSERT ON product_version_allergens BEGIN
  SELECT RAISE(ABORT,'allergen requires a declared label') WHERE NOT EXISTS(SELECT 1 FROM product_version_allergen_declarations d WHERE d.product_version_id=NEW.product_version_id AND d.status='declared');
  SELECT RAISE(ABORT,'allergen is not on the product country list') WHERE NOT EXISTS(SELECT 1 FROM product_versions v JOIN products p ON p.id=v.product_id JOIN country_allergens ca ON ca.country_id=p.country_id AND ca.allergen_key=NEW.allergen_key WHERE v.id=NEW.product_version_id);
END;
--> statement-breakpoint
CREATE TRIGGER product_version_allergens_update BEFORE UPDATE OF product_version_id,allergen_key ON product_version_allergens BEGIN
  SELECT RAISE(ABORT,'replace allergen rows instead of moving them');
END;
--> statement-breakpoint
CREATE TRIGGER product_version_allergen_declarations_status BEFORE UPDATE OF status ON product_version_allergen_declarations WHEN NEW.status='none_declared' BEGIN
  SELECT RAISE(ABORT,'remove allergen rows before declaring none') WHERE EXISTS(SELECT 1 FROM product_version_allergens a WHERE a.product_version_id=NEW.product_version_id);
END;
--> statement-breakpoint
CREATE TRIGGER catalog_allergen_declarations_insert AFTER INSERT ON product_version_allergen_declarations BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=NEW.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_allergen_declarations_update AFTER UPDATE ON product_version_allergen_declarations BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=NEW.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_allergen_declarations_delete AFTER DELETE ON product_version_allergen_declarations BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=OLD.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_version_allergens_insert AFTER INSERT ON product_version_allergens BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=NEW.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER catalog_version_allergens_delete AFTER DELETE ON product_version_allergens BEGIN UPDATE catalog_revisions SET revision=revision+1 WHERE product_id=(SELECT product_id FROM product_versions WHERE id=OLD.product_version_id); END;
