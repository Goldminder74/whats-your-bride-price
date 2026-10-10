ALTER TABLE `challenges` ADD `creation_idempotency_key_hash` text;--> statement-breakpoint
ALTER TABLE `challenges` ADD `revocation_token_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `challenges_creation_idempotency_hash_uq` ON `challenges` (`creation_idempotency_key_hash`) WHERE "challenges"."creation_idempotency_key_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `challenges_revocation_token_hash_uq` ON `challenges` (`revocation_token_hash`) WHERE "challenges"."revocation_token_hash" is not null;