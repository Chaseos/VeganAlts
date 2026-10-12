ALTER TABLE `categories` ADD `position` integer;--> statement-breakpoint
ALTER TABLE `categories` ADD `season_start` integer;--> statement-breakpoint
ALTER TABLE `categories` ADD `season_end` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `seasonal` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Milestone 7: a food's season is two months (1-12, possibly wrapping past
-- December) or none; an aisle's default position is never negative. Each
-- test is null-safe, so a half season can't slip through as NULL.
CREATE TRIGGER categories_order_season_insert BEFORE INSERT ON categories
WHEN (NEW.season_start IS NULL) <> (NEW.season_end IS NULL)
  OR (NEW.season_start IS NOT NULL AND NEW.season_start NOT BETWEEN 1 AND 12)
  OR (NEW.season_end IS NOT NULL AND NEW.season_end NOT BETWEEN 1 AND 12)
  OR (NEW.position IS NOT NULL AND NEW.position < 0)
BEGIN SELECT RAISE(ABORT, 'invalid category position or season'); END;
--> statement-breakpoint
CREATE TRIGGER categories_order_season_update BEFORE UPDATE OF position, season_start, season_end ON categories
WHEN (NEW.season_start IS NULL) <> (NEW.season_end IS NULL)
  OR (NEW.season_start IS NOT NULL AND NEW.season_start NOT BETWEEN 1 AND 12)
  OR (NEW.season_end IS NOT NULL AND NEW.season_end NOT BETWEEN 1 AND 12)
  OR (NEW.position IS NOT NULL AND NEW.position < 0)
BEGIN SELECT RAISE(ABORT, 'invalid category position or season'); END;
--> statement-breakpoint
CREATE TRIGGER products_seasonal_insert BEFORE INSERT ON products
WHEN NEW.seasonal NOT IN (0, 1)
BEGIN SELECT RAISE(ABORT, 'seasonal must be 0 or 1'); END;
--> statement-breakpoint
CREATE TRIGGER products_seasonal_update BEFORE UPDATE OF seasonal ON products
WHEN NEW.seasonal NOT IN (0, 1)
BEGIN SELECT RAISE(ABORT, 'seasonal must be 0 or 1'); END;
