-- Owner-run demo seeding (scripts/seed-images.ts) records its processing
-- attempts as uncounted, so a reseed never spends the daily allowance that
-- web uploads share.
ALTER TABLE `media_attempts` ADD `counted` integer DEFAULT 1 NOT NULL;