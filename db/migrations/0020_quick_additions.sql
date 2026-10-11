-- Reviewed additive replacement for the generated table rebuild: existing
-- classifications stay checked, and an unchecked formula can only carry the
-- appears_vegan placeholder (never Vegan or Under Review).
ALTER TABLE `formula_classifications` ADD `ingredients_checked` integer DEFAULT 1 NOT NULL CONSTRAINT "ck_formula_ingredients_checked" CHECK("ingredients_checked" IN (0,1) AND ("ingredients_checked"=1 OR "vegan_status"='appears_vegan'));--> statement-breakpoint
ALTER TABLE `pending_submissions` ADD `category_proposal_id` text REFERENCES category_proposals(id);--> statement-breakpoint
CREATE INDEX `ix_pending_submissions_proposal` ON `pending_submissions` (`category_proposal_id`) WHERE "pending_submissions"."category_proposal_id" IS NOT NULL;
