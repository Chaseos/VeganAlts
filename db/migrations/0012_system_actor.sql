-- One application-owned account records automated decisions through the same
-- audited moderation path as operators. It has no linked sign-in account, an
-- unroutable .invalid address that no provider can claim, and the reserved
-- "system" handle. A plain INSERT fails loudly if the identifier is taken.
INSERT INTO `user` (`id`, `name`, `email`, `email_verified`, `created_at`, `updated_at`) VALUES ('veganalts-system', 'VeganAlts automation', 'automation@veganalts.invalid', 0, 0, 0);--> statement-breakpoint
INSERT INTO `profiles` (`user_id`, `handle`, `display_name`, `account_state`, `created_at`, `updated_at`) VALUES ('veganalts-system', 'system', 'VeganAlts automation', 'active', 0, 0);
