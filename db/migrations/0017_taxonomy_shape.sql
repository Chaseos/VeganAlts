ALTER TABLE `category_aliases` ADD `is_display_name` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_category_aliases_display` ON `category_aliases` (`category_id`,`country_id`) WHERE "category_aliases"."is_display_name" = 1;
--> statement-breakpoint
-- A display name is a country's own name for a food: 0 or 1, and always
-- scoped to a country (a global name is the category's name).
CREATE TRIGGER category_aliases_display_insert BEFORE INSERT ON category_aliases WHEN NEW.is_display_name NOT IN (0,1) OR (NEW.is_display_name=1 AND NEW.country_id IS NULL) BEGIN
  SELECT RAISE(ABORT,'a display name must be a country-scoped alias');
END;
--> statement-breakpoint
CREATE TRIGGER category_aliases_display_update BEFORE UPDATE OF is_display_name,country_id ON category_aliases WHEN NEW.is_display_name NOT IN (0,1) OR (NEW.is_display_name=1 AND NEW.country_id IS NULL) BEGIN
  SELECT RAISE(ABORT,'a display name must be a country-scoped alias');
END;
