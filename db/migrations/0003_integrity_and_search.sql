-- Reviewed SQLite features not represented by Drizzle's table schema.
CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED, entity_id UNINDEXED, country_code UNINDEXED,
  title, subtitle, aliases, body,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER ratings_category_insert BEFORE INSERT ON ratings
WHEN NOT EXISTS (
  SELECT 1 FROM product_versions v JOIN product_categories pc ON pc.product_id = v.product_id
  WHERE v.id = NEW.product_version_id AND pc.category_id = NEW.category_id
)
BEGIN SELECT RAISE(ABORT, 'rating category does not belong to product'); END;
--> statement-breakpoint
CREATE TRIGGER ratings_category_update BEFORE UPDATE OF product_version_id, category_id ON ratings
WHEN NOT EXISTS (
  SELECT 1 FROM product_versions v JOIN product_categories pc ON pc.product_id = v.product_id
  WHERE v.id = NEW.product_version_id AND pc.category_id = NEW.category_id
)
BEGIN SELECT RAISE(ABORT, 'rating category does not belong to product'); END;
--> statement-breakpoint
CREATE TRIGGER rating_dimension_insert BEFORE INSERT ON rating_dimension_values
WHEN NOT EXISTS (
  SELECT 1 FROM ratings r JOIN category_rating_dimensions d ON d.category_id = r.category_id
  WHERE r.id = NEW.rating_id AND d.id = NEW.dimension_id
)
BEGIN SELECT RAISE(ABORT, 'rating dimension does not belong to category'); END;
--> statement-breakpoint
CREATE TRIGGER rating_dimension_update BEFORE UPDATE OF rating_id, dimension_id ON rating_dimension_values
WHEN NOT EXISTS (
  SELECT 1 FROM ratings r JOIN category_rating_dimensions d ON d.category_id = r.category_id
  WHERE r.id = NEW.rating_id AND d.id = NEW.dimension_id
)
BEGIN SELECT RAISE(ABORT, 'rating dimension does not belong to category'); END;
--> statement-breakpoint
CREATE TRIGGER product_category_preserve_ratings BEFORE DELETE ON product_categories
WHEN EXISTS (
  SELECT 1 FROM ratings r JOIN product_versions v ON v.id = r.product_version_id
  WHERE v.product_id = OLD.product_id AND r.category_id = OLD.category_id
)
BEGIN SELECT RAISE(ABORT, 'set ranking_eligible=0 to preserve historical ratings'); END;
--> statement-breakpoint
INSERT INTO formula_revisions (product_version_id) SELECT id FROM product_versions;
--> statement-breakpoint
CREATE TRIGGER formula_revision_create AFTER INSERT ON product_versions
BEGIN INSERT INTO formula_revisions (product_version_id) VALUES (NEW.id); END;
--> statement-breakpoint
CREATE TRIGGER formula_revision_update AFTER UPDATE ON product_versions
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id = NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER rating_revision_insert AFTER INSERT ON ratings
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id = NEW.product_version_id; END;
--> statement-breakpoint
CREATE TRIGGER rating_revision_update AFTER UPDATE ON ratings
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id IN (NEW.product_version_id, OLD.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER rating_revision_delete AFTER DELETE ON ratings
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id = OLD.product_version_id; END;
--> statement-breakpoint
CREATE TRIGGER trial_revision_insert AFTER INSERT ON product_trials
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id = NEW.product_version_id; END;
--> statement-breakpoint
CREATE TRIGGER trial_revision_update AFTER UPDATE ON product_trials
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id IN (NEW.product_version_id, OLD.product_version_id); END;
--> statement-breakpoint
CREATE TRIGGER trial_revision_delete AFTER DELETE ON product_trials
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id = OLD.product_version_id; END;
--> statement-breakpoint
CREATE TRIGGER category_link_revision_insert AFTER INSERT ON product_categories
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id IN (SELECT id FROM product_versions WHERE product_id = NEW.product_id); END;
--> statement-breakpoint
CREATE TRIGGER category_link_revision_update AFTER UPDATE ON product_categories
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id IN (SELECT id FROM product_versions WHERE product_id IN (OLD.product_id, NEW.product_id)); END;
--> statement-breakpoint
CREATE TRIGGER category_link_revision_delete AFTER DELETE ON product_categories
BEGIN UPDATE formula_revisions SET revision = revision + 1 WHERE product_version_id IN (SELECT id FROM product_versions WHERE product_id = OLD.product_id); END;
