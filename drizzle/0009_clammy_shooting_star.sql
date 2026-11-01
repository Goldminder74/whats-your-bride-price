ALTER TABLE `quiz_attempts` ADD `cowrie_issued_at` integer CONSTRAINT "quiz_attempts_cowrie_issued_at_ck" CHECK(`cowrie_issued_at` is null or (typeof(`cowrie_issued_at`) = 'integer' and `cowrie_issued_at` > 0 and `cowrie_issued_at` <= 8640000000000000 and `cowrie_issued_at` >= `started_at`));
--> statement-breakpoint
CREATE TABLE `cowrie_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet_id` text NOT NULL,
	`bucket` text NOT NULL,
	`entry_type` text NOT NULL,
	`delta` integer NOT NULL,
	`idempotency_domain` text NOT NULL,
	`idempotency_hash` text NOT NULL,
	`related_attempt_id` text,
	`related_achievement_key` text,
	`related_order_id` text,
	`related_allocation_id` text,
	`reason_code` text NOT NULL,
	`bonus_expires_at` integer,
	`reversal_of_ledger_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wallet_id`) REFERENCES `cowrie_wallets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`related_attempt_id`) REFERENCES `quiz_attempts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`related_order_id`) REFERENCES `commerce_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`related_allocation_id`) REFERENCES `cowrie_purchase_allocations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reversal_of_ledger_id`) REFERENCES `cowrie_ledger`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cowrie_ledger_id_ck" CHECK(length("cowrie_ledger"."id") = 39 and substr("cowrie_ledger"."id",1,7) = 'ledger_' and substr("cowrie_ledger"."id",8) not glob '*[^0-9a-f]*'),
	CONSTRAINT "cowrie_ledger_bucket_ck" CHECK("cowrie_ledger"."bucket" in ('purchased','bonus')),
	CONSTRAINT "cowrie_ledger_type_ck" CHECK("cowrie_ledger"."entry_type" in ('purchase_credit','bonus_credit','quick_play_debit','technical_reversal','bonus_expiry','refund_reversal','dispute_freeze','owner_correction')),
	CONSTRAINT "cowrie_ledger_domain_ck" CHECK("cowrie_ledger"."idempotency_domain" in ('purchase','bonus','quick_play','reversal','expiry','refund','dispute','owner')),
	CONSTRAINT "cowrie_ledger_hash_ck" CHECK(length("cowrie_ledger"."idempotency_hash") = 64 and "cowrie_ledger"."idempotency_hash" = lower("cowrie_ledger"."idempotency_hash") and "cowrie_ledger"."idempotency_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "cowrie_ledger_reason_ck" CHECK("cowrie_ledger"."reason_code" in ('verified_purchase','perfect_region_day','daily_streak_3','daily_streak_7','all_region_mastery','random_quick_play','delivery_failure','bonus_retention_expiry','verified_refund','verified_dispute','protected_owner_correction')),
	CONSTRAINT "cowrie_ledger_delta_ck" CHECK(("cowrie_ledger"."entry_type" = 'purchase_credit' and "cowrie_ledger"."bucket" = 'purchased' and "cowrie_ledger"."delta" > 0) or ("cowrie_ledger"."entry_type" = 'bonus_credit' and "cowrie_ledger"."bucket" = 'bonus' and "cowrie_ledger"."delta" between 1 and 3) or ("cowrie_ledger"."entry_type" = 'quick_play_debit' and "cowrie_ledger"."delta" = -1) or ("cowrie_ledger"."entry_type" = 'technical_reversal' and "cowrie_ledger"."delta" = 1 and "cowrie_ledger"."reversal_of_ledger_id" is not null) or ("cowrie_ledger"."entry_type" = 'bonus_expiry' and "cowrie_ledger"."bucket" = 'bonus' and "cowrie_ledger"."delta" < 0) or ("cowrie_ledger"."entry_type" = 'refund_reversal' and "cowrie_ledger"."bucket" = 'purchased' and "cowrie_ledger"."delta" < 0) or ("cowrie_ledger"."entry_type" = 'dispute_freeze' and "cowrie_ledger"."bucket" = 'purchased' and "cowrie_ledger"."delta" = 0) or ("cowrie_ledger"."entry_type" = 'owner_correction' and "cowrie_ledger"."delta" != 0)),
	CONSTRAINT "cowrie_ledger_bonus_expiry_ck" CHECK(("cowrie_ledger"."entry_type" = 'bonus_credit' and "cowrie_ledger"."bonus_expires_at" - "cowrie_ledger"."created_at" = 15552000000) or ("cowrie_ledger"."entry_type" != 'bonus_credit' and "cowrie_ledger"."bonus_expires_at" is null)),
	CONSTRAINT "cowrie_ledger_achievement_ck" CHECK("cowrie_ledger"."related_achievement_key" is null or (length("cowrie_ledger"."related_achievement_key") between 8 and 160 and "cowrie_ledger"."related_achievement_key" not glob '*[^a-z0-9:_-]*'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cowrie_ledger_idempotency_uq` ON `cowrie_ledger` (`idempotency_domain`,`idempotency_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `cowrie_ledger_reversal_uq` ON `cowrie_ledger` (`reversal_of_ledger_id`) WHERE "cowrie_ledger"."reversal_of_ledger_id" is not null and "cowrie_ledger"."entry_type" != 'bonus_expiry';--> statement-breakpoint
CREATE INDEX `cowrie_ledger_wallet_created_idx` ON `cowrie_ledger` (`wallet_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cowrie_ledger_bonus_expiry_idx` ON `cowrie_ledger` (`bucket`,`bonus_expires_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `cowrie_ledger_attempt_idx` ON `cowrie_ledger` (`related_attempt_id`,`entry_type`);--> statement-breakpoint
CREATE INDEX `cowrie_ledger_allocation_idx` ON `cowrie_ledger` (`related_allocation_id`,`entry_type`);--> statement-breakpoint
CREATE TABLE `cowrie_purchase_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`wallet_id` text NOT NULL,
	`product_key` text NOT NULL,
	`original_quantity` integer NOT NULL,
	`remaining_quantity` integer NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`fulfilment_idempotency_hash` text NOT NULL,
	`fulfilled_at` integer,
	`refunded_at` integer,
	`disputed_at` integer,
	`deleted_at` integer,
	`retention_expires_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`wallet_id`) REFERENCES `cowrie_wallets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cowrie_allocations_id_ck" CHECK(length("cowrie_purchase_allocations"."id") = 43 and substr("cowrie_purchase_allocations"."id",1,11) = 'allocation_' and substr("cowrie_purchase_allocations"."id",12) not glob '*[^0-9a-f]*'),
	CONSTRAINT "cowrie_allocations_product_ck" CHECK("cowrie_purchase_allocations"."product_key" = 'cowrie_pack_v1'),
	CONSTRAINT "cowrie_allocations_quantity_ck" CHECK("cowrie_purchase_allocations"."original_quantity" between 1 and 10000 and "cowrie_purchase_allocations"."remaining_quantity" between 0 and "cowrie_purchase_allocations"."original_quantity"),
	CONSTRAINT "cowrie_allocations_state_ck" CHECK("cowrie_purchase_allocations"."state" in ('active','refunded','disputed','review_required','deleted')),
	CONSTRAINT "cowrie_allocations_idempotency_ck" CHECK(length("cowrie_purchase_allocations"."fulfilment_idempotency_hash") = 64 and "cowrie_purchase_allocations"."fulfilment_idempotency_hash" = lower("cowrie_purchase_allocations"."fulfilment_idempotency_hash") and "cowrie_purchase_allocations"."fulfilment_idempotency_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "cowrie_allocations_time_ck" CHECK("cowrie_purchase_allocations"."created_at" > 0 and "cowrie_purchase_allocations"."updated_at" >= "cowrie_purchase_allocations"."created_at" and "cowrie_purchase_allocations"."retention_expires_at" > "cowrie_purchase_allocations"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cowrie_allocations_order_uq` ON `cowrie_purchase_allocations` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cowrie_allocations_fulfilment_hash_uq` ON `cowrie_purchase_allocations` (`fulfilment_idempotency_hash`);--> statement-breakpoint
CREATE INDEX `cowrie_allocations_wallet_state_idx` ON `cowrie_purchase_allocations` (`wallet_id`,`state`);--> statement-breakpoint
CREATE INDEX `cowrie_allocations_retention_idx` ON `cowrie_purchase_allocations` (`retention_expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `cowrie_wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`public_reference` text NOT NULL,
	`anonymous_owner_hash` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`free_quick_plays_consumed` integer DEFAULT 0 NOT NULL,
	`purchased_balance` integer DEFAULT 0 NOT NULL,
	`bonus_balance` integer DEFAULT 0 NOT NULL,
	`recovery_credential_hash` text NOT NULL,
	`recovery_credential_version` integer DEFAULT 1 NOT NULL,
	`last_access_idempotency_hash` text,
	`frozen_at` integer,
	`deleted_at` integer,
	`retention_expires_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "cowrie_wallets_id_ck" CHECK(length("cowrie_wallets"."id") = 39 and substr("cowrie_wallets"."id",1,7) = 'wallet_' and substr("cowrie_wallets"."id",8) not glob '*[^0-9a-f]*'),
	CONSTRAINT "cowrie_wallets_public_reference_ck" CHECK(length("cowrie_wallets"."public_reference") = 35 and substr("cowrie_wallets"."public_reference",1,3) = 'cw_' and substr("cowrie_wallets"."public_reference",4) not glob '*[^0-9a-f]*'),
	CONSTRAINT "cowrie_wallets_owner_hash_ck" CHECK(length("cowrie_wallets"."anonymous_owner_hash") = 64 and "cowrie_wallets"."anonymous_owner_hash" = lower("cowrie_wallets"."anonymous_owner_hash") and "cowrie_wallets"."anonymous_owner_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "cowrie_wallets_recovery_hash_ck" CHECK(length("cowrie_wallets"."recovery_credential_hash") = 64 and "cowrie_wallets"."recovery_credential_hash" = lower("cowrie_wallets"."recovery_credential_hash") and "cowrie_wallets"."recovery_credential_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "cowrie_wallets_access_hash_ck" CHECK("cowrie_wallets"."last_access_idempotency_hash" is null or (length("cowrie_wallets"."last_access_idempotency_hash") = 64 and "cowrie_wallets"."last_access_idempotency_hash" = lower("cowrie_wallets"."last_access_idempotency_hash") and "cowrie_wallets"."last_access_idempotency_hash" not glob '*[^0-9a-f]*')),
	CONSTRAINT "cowrie_wallets_state_ck" CHECK("cowrie_wallets"."state" in ('active','frozen','deleted')),
	CONSTRAINT "cowrie_wallets_balance_ck" CHECK("cowrie_wallets"."free_quick_plays_consumed" between 0 and 2 and "cowrie_wallets"."purchased_balance" >= 0 and "cowrie_wallets"."bonus_balance" >= 0),
	CONSTRAINT "cowrie_wallets_version_ck" CHECK("cowrie_wallets"."recovery_credential_version" >= 1 and "cowrie_wallets"."version" >= 1),
	CONSTRAINT "cowrie_wallets_lifecycle_ck" CHECK(("cowrie_wallets"."state" = 'active' and "cowrie_wallets"."frozen_at" is null and "cowrie_wallets"."deleted_at" is null and "cowrie_wallets"."retention_expires_at" is null) or ("cowrie_wallets"."state" = 'frozen' and "cowrie_wallets"."frozen_at" is not null and "cowrie_wallets"."deleted_at" is null and "cowrie_wallets"."retention_expires_at" is null) or ("cowrie_wallets"."state" = 'deleted' and "cowrie_wallets"."deleted_at" is not null and "cowrie_wallets"."retention_expires_at" > "cowrie_wallets"."deleted_at")),
	CONSTRAINT "cowrie_wallets_time_ck" CHECK("cowrie_wallets"."created_at" > 0 and "cowrie_wallets"."updated_at" >= "cowrie_wallets"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cowrie_wallets_public_reference_uq` ON `cowrie_wallets` (`public_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `cowrie_wallets_recovery_hash_uq` ON `cowrie_wallets` (`recovery_credential_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `cowrie_wallets_live_owner_uq` ON `cowrie_wallets` (`anonymous_owner_hash`) WHERE "cowrie_wallets"."state" in ('active','frozen');--> statement-breakpoint
CREATE INDEX `cowrie_wallets_owner_state_idx` ON `cowrie_wallets` (`anonymous_owner_hash`,`state`);--> statement-breakpoint
CREATE INDEX `cowrie_wallets_retention_idx` ON `cowrie_wallets` (`retention_expires_at`,`deleted_at`);
--> statement-breakpoint
CREATE TRIGGER `cowrie_wallet_initial_balance_guard`
BEFORE INSERT ON `cowrie_wallets`
WHEN NEW.`purchased_balance` != 0 OR NEW.`bonus_balance` != 0
BEGIN
	SELECT RAISE(ABORT, 'cowrie balances require ledger entries');
END;
--> statement-breakpoint
CREATE TRIGGER `cowrie_wallet_balance_cache_guard`
BEFORE UPDATE OF `purchased_balance`, `bonus_balance` ON `cowrie_wallets`
WHEN NEW.`purchased_balance` != COALESCE((SELECT SUM(`delta`) FROM `cowrie_ledger` WHERE `wallet_id`=NEW.`id` AND `bucket`='purchased'),0)
OR NEW.`bonus_balance` != COALESCE((SELECT SUM(`delta`) FROM `cowrie_ledger` WHERE `wallet_id`=NEW.`id` AND `bucket`='bonus'),0)
BEGIN
	SELECT RAISE(ABORT, 'cowrie balance cache mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `cowrie_ledger_append_only_update`
BEFORE UPDATE ON `cowrie_ledger`
BEGIN
	SELECT RAISE(ABORT, 'cowrie ledger is append only');
END;
--> statement-breakpoint
CREATE TRIGGER `cowrie_ledger_append_only_delete`
BEFORE DELETE ON `cowrie_ledger`
BEGIN
	SELECT RAISE(ABORT, 'cowrie ledger is append only');
END;
--> statement-breakpoint
CREATE TRIGGER `cowrie_ledger_active_wallet_guard`
BEFORE INSERT ON `cowrie_ledger`
BEGIN
	SELECT CASE
		WHEN NOT EXISTS (
			SELECT 1 FROM `cowrie_wallets`
			WHERE `id` = NEW.`wallet_id` AND `state` = 'active'
		) THEN RAISE(ABORT, 'cowrie wallet unavailable')
	END;
	SELECT CASE
		WHEN NEW.`bucket` = 'bonus' AND (
			SELECT `bonus_balance` FROM `cowrie_wallets` WHERE `id` = NEW.`wallet_id`
		) + NEW.`delta` < 0 THEN RAISE(ABORT, 'insufficient bonus cowries')
		WHEN NEW.`bucket` = 'purchased' AND (
			SELECT `purchased_balance` FROM `cowrie_wallets` WHERE `id` = NEW.`wallet_id`
		) + NEW.`delta` < 0 THEN RAISE(ABORT, 'insufficient purchased cowries')
	END;
END;
--> statement-breakpoint
CREATE TRIGGER `cowrie_ledger_reconcile_wallet`
AFTER INSERT ON `cowrie_ledger`
BEGIN
	UPDATE `cowrie_wallets`
	SET `purchased_balance` = `purchased_balance` + CASE WHEN NEW.`bucket` = 'purchased' THEN NEW.`delta` ELSE 0 END,
		`bonus_balance` = `bonus_balance` + CASE WHEN NEW.`bucket` = 'bonus' THEN NEW.`delta` ELSE 0 END,
		`version` = `version` + 1,
		`updated_at` = MAX(`updated_at`, NEW.`created_at`)
	WHERE `id` = NEW.`wallet_id` AND `state` = 'active';
END;
--> statement-breakpoint
CREATE TRIGGER `cowrie_attempt_issuance_immutable`
BEFORE UPDATE OF `cowrie_issued_at` ON `quiz_attempts`
WHEN OLD.`cowrie_issued_at` IS NOT NULL AND NEW.`cowrie_issued_at` IS NOT OLD.`cowrie_issued_at`
BEGIN
	SELECT RAISE(ABORT, 'cowrie issuance is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `cowrie_attempt_initially_unissued`
BEFORE INSERT ON `quiz_attempts`
WHEN NEW.`cowrie_issued_at` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'cowrie issuance requires persisted authority');
END;
--> statement-breakpoint
CREATE TRIGGER `cowrie_attempt_issuance_authority`
BEFORE UPDATE OF `cowrie_issued_at` ON `quiz_attempts`
WHEN OLD.`cowrie_issued_at` IS NULL AND NEW.`cowrie_issued_at` IS NOT NULL
BEGIN
	SELECT CASE WHEN OLD.`status` != 'in_progress' OR OLD.`deleted_at` IS NOT NULL
		OR OLD.`play_mode` != 'random' OR OLD.`selection_policy_version` != 'balanced-random-v2'
		OR NOT EXISTS (
			SELECT 1 FROM `cowrie_ledger` debit JOIN `cowrie_wallets` wallet ON wallet.`id`=debit.`wallet_id`
			WHERE debit.`related_attempt_id`=OLD.`id` AND debit.`entry_type`='quick_play_debit'
				AND debit.`idempotency_domain`='quick_play' AND debit.`idempotency_hash`=OLD.`idempotency_key_hash`
				AND wallet.`anonymous_owner_hash`=OLD.`anonymous_subject_hash` AND wallet.`state`='active'
				AND NOT EXISTS (SELECT 1 FROM `cowrie_ledger` reversal WHERE reversal.`reversal_of_ledger_id`=debit.`id`)
		) THEN RAISE(ABORT, 'cowrie issuance unavailable') END;
END;
--> statement-breakpoint
CREATE TRIGGER `cowrie_technical_reversal_authority`
BEFORE INSERT ON `cowrie_ledger`
WHEN NEW.`entry_type`='technical_reversal'
BEGIN
	SELECT CASE WHEN NEW.`idempotency_domain` != 'reversal' OR NEW.`reason_code` != 'delivery_failure'
		OR NOT EXISTS (
			SELECT 1 FROM `cowrie_ledger` debit JOIN `quiz_attempts` attempt ON attempt.`id`=debit.`related_attempt_id`
			WHERE debit.`id`=NEW.`reversal_of_ledger_id` AND debit.`wallet_id`=NEW.`wallet_id`
				AND debit.`bucket`=NEW.`bucket` AND debit.`entry_type`='quick_play_debit' AND debit.`delta`=-1
				AND debit.`idempotency_domain`='quick_play' AND debit.`idempotency_hash`=attempt.`idempotency_key_hash`
				AND NEW.`related_attempt_id`=attempt.`id` AND NEW.`related_allocation_id` IS debit.`related_allocation_id`
				AND attempt.`cowrie_issued_at` IS NULL AND attempt.`status`='abandoned'
				AND NOT EXISTS (SELECT 1 FROM `cowrie_ledger` reversal WHERE reversal.`reversal_of_ledger_id`=debit.`id`)
		) THEN RAISE(ABORT, 'cowrie reversal unavailable') END;
END;
