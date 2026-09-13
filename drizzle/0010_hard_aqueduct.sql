PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
CREATE TABLE __0010_copy_verification(difference INTEGER NOT NULL CHECK(difference=0));
--> statement-breakpoint
CREATE TABLE __0010_webhook_backup AS SELECT * FROM stripe_webhook_events;
--> statement-breakpoint
CREATE TABLE `__new_commerce_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`public_order_reference` text NOT NULL,
	`product_key` text NOT NULL,
	`result_id` text,
	`cowrie_wallet_id` text,
	`stripe_payment_intent_hash` text,
	`anonymous_owner_hash` text NOT NULL,
	`currency` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`client_reference_id` text NOT NULL,
	`stripe_payment_link_id` text NOT NULL,
	`stripe_checkout_session_id` text,
	`stripe_payment_intent_id` text,
	`consent_notice_version` text NOT NULL,
	`immediate_delivery_consent_at` integer NOT NULL,
	`paid_at` integer,
	`fulfilled_at` integer,
	`refunded_at` integer,
	`disputed_at` integer,
	`expired_at` integer,
	`deleted_at` integer,
	`pending_expires_at` integer NOT NULL,
	`retention_expires_at` integer NOT NULL,
	`idempotency_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cowrie_wallet_id`) REFERENCES `cowrie_wallets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_orders_public_reference_ck" CHECK(length("__new_commerce_orders"."public_order_reference") = 35 and substr("__new_commerce_orders"."public_order_reference",1,3) = 'rr_' and substr("__new_commerce_orders"."public_order_reference",4) not glob '*[^0-9a-f]*'),
	CONSTRAINT "commerce_orders_product_price_ck" CHECK("__new_commerce_orders"."currency" = 'GBP' and typeof("__new_commerce_orders"."amount_minor") = 'integer' and (("__new_commerce_orders"."product_key" in ('royal_reveal_v1','cowrie_5_v1') and "__new_commerce_orders"."amount_minor" = 199) or ("__new_commerce_orders"."product_key" = 'cowrie_15_v1' and "__new_commerce_orders"."amount_minor" = 499) or ("__new_commerce_orders"."product_key" = 'cowrie_40_v1' and "__new_commerce_orders"."amount_minor" = 999))),
	CONSTRAINT "commerce_orders_target_ck" CHECK(("__new_commerce_orders"."product_key" = 'royal_reveal_v1' and "__new_commerce_orders"."result_id" is not null and "__new_commerce_orders"."cowrie_wallet_id" is null) or ("__new_commerce_orders"."product_key" in ('cowrie_5_v1','cowrie_15_v1','cowrie_40_v1') and "__new_commerce_orders"."result_id" is null and "__new_commerce_orders"."cowrie_wallet_id" is not null)),
	CONSTRAINT "commerce_orders_payment_intent_hash_ck" CHECK("__new_commerce_orders"."stripe_payment_intent_hash" is null or (length("__new_commerce_orders"."stripe_payment_intent_hash") = 64 and "__new_commerce_orders"."stripe_payment_intent_hash" not glob '*[^0-9a-f]*')),
	CONSTRAINT "commerce_orders_owner_hash_ck" CHECK(length("__new_commerce_orders"."anonymous_owner_hash") = 64 and "__new_commerce_orders"."anonymous_owner_hash" = lower("__new_commerce_orders"."anonymous_owner_hash") and "__new_commerce_orders"."anonymous_owner_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "commerce_orders_idempotency_hash_ck" CHECK(length("__new_commerce_orders"."idempotency_hash") = 64 and "__new_commerce_orders"."idempotency_hash" = lower("__new_commerce_orders"."idempotency_hash") and "__new_commerce_orders"."idempotency_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "commerce_orders_client_reference_ck" CHECK("__new_commerce_orders"."client_reference_id" = "__new_commerce_orders"."public_order_reference"),
	CONSTRAINT "commerce_orders_payment_link_ck" CHECK(length("__new_commerce_orders"."stripe_payment_link_id") between 8 and 255 and "__new_commerce_orders"."stripe_payment_link_id" glob 'plink_*' and "__new_commerce_orders"."stripe_payment_link_id" not glob '*[^0-9A-Za-z_]*'),
	CONSTRAINT "commerce_orders_checkout_session_ck" CHECK("__new_commerce_orders"."stripe_checkout_session_id" is null or (length("__new_commerce_orders"."stripe_checkout_session_id") between 8 and 255 and "__new_commerce_orders"."stripe_checkout_session_id" glob 'cs_*' and "__new_commerce_orders"."stripe_checkout_session_id" not glob '*[^0-9A-Za-z_]*')),
	CONSTRAINT "commerce_orders_payment_intent_ck" CHECK("__new_commerce_orders"."stripe_payment_intent_id" is null or (length("__new_commerce_orders"."stripe_payment_intent_id") between 6 and 255 and "__new_commerce_orders"."stripe_payment_intent_id" glob 'pi_*' and "__new_commerce_orders"."stripe_payment_intent_id" not glob '*[^0-9A-Za-z_]*')),
	CONSTRAINT "commerce_orders_state_ck" CHECK("__new_commerce_orders"."state" in ('pending','processing','paid','fulfilled','failed','refunded','disputed','expired','deleted','review_required')),
	CONSTRAINT "commerce_orders_consent_ck" CHECK(length("__new_commerce_orders"."consent_notice_version") between 3 and 100 and "__new_commerce_orders"."immediate_delivery_consent_at" >= "__new_commerce_orders"."created_at"),
	CONSTRAINT "commerce_orders_time_ck" CHECK("__new_commerce_orders"."created_at" > 0 and "__new_commerce_orders"."updated_at" >= "__new_commerce_orders"."created_at" and "__new_commerce_orders"."pending_expires_at" > "__new_commerce_orders"."created_at" and "__new_commerce_orders"."retention_expires_at" > "__new_commerce_orders"."pending_expires_at")
);
--> statement-breakpoint
INSERT INTO `__new_commerce_orders`("id", "public_order_reference", "product_key", "result_id", "cowrie_wallet_id", "stripe_payment_intent_hash", "anonymous_owner_hash", "currency", "amount_minor", "state", "client_reference_id", "stripe_payment_link_id", "stripe_checkout_session_id", "stripe_payment_intent_id", "consent_notice_version", "immediate_delivery_consent_at", "paid_at", "fulfilled_at", "refunded_at", "disputed_at", "expired_at", "deleted_at", "pending_expires_at", "retention_expires_at", "idempotency_hash", "version", "created_at", "updated_at") SELECT "id", "public_order_reference", "product_key", "result_id", NULL, NULL, "anonymous_owner_hash", "currency", "amount_minor", "state", "client_reference_id", "stripe_payment_link_id", "stripe_checkout_session_id", "stripe_payment_intent_id", "consent_notice_version", "immediate_delivery_consent_at", "paid_at", "fulfilled_at", "refunded_at", "disputed_at", "expired_at", "deleted_at", "pending_expires_at", "retention_expires_at", "idempotency_hash", "version", "created_at", "updated_at" FROM `commerce_orders`;--> statement-breakpoint
INSERT INTO __0010_copy_verification SELECT (SELECT COUNT(*) FROM commerce_orders)-(SELECT COUNT(*) FROM __new_commerce_orders);
--> statement-breakpoint
INSERT INTO __0010_copy_verification SELECT COUNT(*) FROM (SELECT "id","public_order_reference","product_key","result_id","anonymous_owner_hash","currency","amount_minor","state","client_reference_id","stripe_payment_link_id","stripe_checkout_session_id","stripe_payment_intent_id","consent_notice_version","immediate_delivery_consent_at","paid_at","fulfilled_at","refunded_at","disputed_at","expired_at","deleted_at","pending_expires_at","retention_expires_at","idempotency_hash","version","created_at","updated_at" FROM commerce_orders EXCEPT SELECT "id","public_order_reference","product_key","result_id","anonymous_owner_hash","currency","amount_minor","state","client_reference_id","stripe_payment_link_id","stripe_checkout_session_id","stripe_payment_intent_id","consent_notice_version","immediate_delivery_consent_at","paid_at","fulfilled_at","refunded_at","disputed_at","expired_at","deleted_at","pending_expires_at","retention_expires_at","idempotency_hash","version","created_at","updated_at" FROM __new_commerce_orders);
--> statement-breakpoint
DROP TABLE `commerce_orders`;--> statement-breakpoint
ALTER TABLE `__new_commerce_orders` RENAME TO `commerce_orders`;--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_public_reference_uq` ON `commerce_orders` (`public_order_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_client_reference_uq` ON `commerce_orders` (`client_reference_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_idempotency_hash_uq` ON `commerce_orders` (`idempotency_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_checkout_session_uq` ON `commerce_orders` (`stripe_checkout_session_id`) WHERE "commerce_orders"."stripe_checkout_session_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_payment_intent_uq` ON `commerce_orders` (`stripe_payment_intent_id`) WHERE "commerce_orders"."stripe_payment_intent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_entitlement_authority_uq` ON `commerce_orders` (`id`,`result_id`,`anonymous_owner_hash`,`product_key`);--> statement-breakpoint
CREATE INDEX `commerce_orders_result_owner_state_idx` ON `commerce_orders` (`result_id`,`anonymous_owner_hash`,`state`);--> statement-breakpoint
CREATE INDEX `commerce_orders_pending_expiry_idx` ON `commerce_orders` (`state`,`pending_expires_at`);--> statement-breakpoint
CREATE INDEX `commerce_orders_retention_idx` ON `commerce_orders` (`retention_expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `__new_cowrie_purchase_allocations` (
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
	CONSTRAINT "cowrie_allocations_id_ck" CHECK(length("__new_cowrie_purchase_allocations"."id") = 43 and substr("__new_cowrie_purchase_allocations"."id",1,11) = 'allocation_' and substr("__new_cowrie_purchase_allocations"."id",12) not glob '*[^0-9a-f]*'),
	CONSTRAINT "cowrie_allocations_product_ck" CHECK("__new_cowrie_purchase_allocations"."product_key" = 'cowrie_pack_v1' or ("__new_cowrie_purchase_allocations"."product_key" = 'cowrie_5_v1' and "__new_cowrie_purchase_allocations"."original_quantity" = 5) or ("__new_cowrie_purchase_allocations"."product_key" = 'cowrie_15_v1' and "__new_cowrie_purchase_allocations"."original_quantity" = 15) or ("__new_cowrie_purchase_allocations"."product_key" = 'cowrie_40_v1' and "__new_cowrie_purchase_allocations"."original_quantity" = 40)),
	CONSTRAINT "cowrie_allocations_quantity_ck" CHECK("__new_cowrie_purchase_allocations"."original_quantity" between 1 and 10000 and "__new_cowrie_purchase_allocations"."remaining_quantity" between 0 and "__new_cowrie_purchase_allocations"."original_quantity"),
	CONSTRAINT "cowrie_allocations_state_ck" CHECK("__new_cowrie_purchase_allocations"."state" in ('active','refunded','disputed','review_required','deleted')),
	CONSTRAINT "cowrie_allocations_idempotency_ck" CHECK(length("__new_cowrie_purchase_allocations"."fulfilment_idempotency_hash") = 64 and "__new_cowrie_purchase_allocations"."fulfilment_idempotency_hash" = lower("__new_cowrie_purchase_allocations"."fulfilment_idempotency_hash") and "__new_cowrie_purchase_allocations"."fulfilment_idempotency_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "cowrie_allocations_time_ck" CHECK("__new_cowrie_purchase_allocations"."created_at" > 0 and "__new_cowrie_purchase_allocations"."updated_at" >= "__new_cowrie_purchase_allocations"."created_at" and "__new_cowrie_purchase_allocations"."retention_expires_at" > "__new_cowrie_purchase_allocations"."created_at")
);
--> statement-breakpoint
INSERT INTO `__new_cowrie_purchase_allocations`("id", "order_id", "wallet_id", "product_key", "original_quantity", "remaining_quantity", "state", "fulfilment_idempotency_hash", "fulfilled_at", "refunded_at", "disputed_at", "deleted_at", "retention_expires_at", "version", "created_at", "updated_at") SELECT "id", "order_id", "wallet_id", "product_key", "original_quantity", "remaining_quantity", "state", "fulfilment_idempotency_hash", "fulfilled_at", "refunded_at", "disputed_at", "deleted_at", "retention_expires_at", "version", "created_at", "updated_at" FROM `cowrie_purchase_allocations`;--> statement-breakpoint
INSERT INTO __0010_copy_verification SELECT (SELECT COUNT(*) FROM cowrie_purchase_allocations)-(SELECT COUNT(*) FROM __new_cowrie_purchase_allocations);
--> statement-breakpoint
INSERT INTO __0010_copy_verification SELECT COUNT(*) FROM (SELECT "id", "order_id", "wallet_id", "product_key", "original_quantity", "remaining_quantity", "state", "fulfilment_idempotency_hash", "fulfilled_at", "refunded_at", "disputed_at", "deleted_at", "retention_expires_at", "version", "created_at", "updated_at" FROM cowrie_purchase_allocations EXCEPT SELECT "id", "order_id", "wallet_id", "product_key", "original_quantity", "remaining_quantity", "state", "fulfilment_idempotency_hash", "fulfilled_at", "refunded_at", "disputed_at", "deleted_at", "retention_expires_at", "version", "created_at", "updated_at" FROM __new_cowrie_purchase_allocations);
--> statement-breakpoint
DROP TABLE `cowrie_purchase_allocations`;--> statement-breakpoint
ALTER TABLE `__new_cowrie_purchase_allocations` RENAME TO `cowrie_purchase_allocations`;--> statement-breakpoint
CREATE UNIQUE INDEX `cowrie_allocations_order_uq` ON `cowrie_purchase_allocations` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cowrie_allocations_fulfilment_hash_uq` ON `cowrie_purchase_allocations` (`fulfilment_idempotency_hash`);--> statement-breakpoint
CREATE INDEX `cowrie_allocations_wallet_state_idx` ON `cowrie_purchase_allocations` (`wallet_id`,`state`);--> statement-breakpoint
CREATE INDEX `cowrie_allocations_retention_idx` ON `cowrie_purchase_allocations` (`retention_expires_at`,`deleted_at`);--> statement-breakpoint
UPDATE stripe_webhook_events SET order_id=(SELECT order_id FROM __0010_webhook_backup WHERE id=stripe_webhook_events.id);
--> statement-breakpoint
INSERT INTO __0010_copy_verification SELECT COUNT(*) FROM (SELECT * FROM __0010_webhook_backup EXCEPT SELECT * FROM stripe_webhook_events);
--> statement-breakpoint
INSERT INTO __0010_copy_verification SELECT (SELECT COUNT(*) FROM __0010_webhook_backup)-(SELECT COUNT(*) FROM stripe_webhook_events);
--> statement-breakpoint
ALTER TABLE stripe_webhook_events ADD payment_intent_hash TEXT CONSTRAINT stripe_webhook_events_payment_intent_hash_ck CHECK(payment_intent_hash IS NULL OR (length(payment_intent_hash)=64 AND payment_intent_hash NOT GLOB '*[^0-9a-f]*'));
--> statement-breakpoint
ALTER TABLE stripe_webhook_events ADD amount_minor INTEGER CONSTRAINT stripe_webhook_events_amount_ck CHECK(amount_minor IS NULL OR (typeof(amount_minor)='integer' AND amount_minor BETWEEN 0 AND 9007199254740991));
--> statement-breakpoint
ALTER TABLE stripe_webhook_events ADD amount_refunded_minor INTEGER CONSTRAINT stripe_webhook_events_refunded_amount_ck CHECK(amount_refunded_minor IS NULL OR (typeof(amount_refunded_minor)='integer' AND amount_refunded_minor BETWEEN 0 AND 9007199254740991 AND (amount_minor IS NULL OR amount_refunded_minor<=amount_minor)));
--> statement-breakpoint
CREATE INDEX stripe_webhook_events_payment_intent_received_idx ON stripe_webhook_events(payment_intent_hash,received_at) WHERE payment_intent_hash IS NOT NULL;
--> statement-breakpoint
INSERT INTO __0010_copy_verification SELECT COUNT(*) FROM pragma_foreign_key_check;
--> statement-breakpoint
DROP TABLE __0010_webhook_backup;
--> statement-breakpoint
DROP TABLE __0010_copy_verification;
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
--> statement-breakpoint
CREATE TRIGGER commerce_order_target_owner_insert BEFORE INSERT ON commerce_orders BEGIN
 SELECT CASE WHEN NEW.product_key='royal_reveal_v1' AND NOT EXISTS(SELECT 1 FROM results r JOIN quiz_attempts qa ON qa.id=r.attempt_id WHERE r.id=NEW.result_id AND qa.anonymous_subject_hash=NEW.anonymous_owner_hash) THEN RAISE(ABORT,'order owner mismatch') WHEN NEW.product_key!='royal_reveal_v1' AND NOT EXISTS(SELECT 1 FROM cowrie_wallets w WHERE w.id=NEW.cowrie_wallet_id AND w.anonymous_owner_hash=NEW.anonymous_owner_hash AND w.state='active') THEN RAISE(ABORT,'order owner mismatch') END;
 SELECT CASE WHEN NEW.stripe_payment_intent_id IS NOT NULL THEN RAISE(ABORT,'new payment intent requires hash') END;
END;
--> statement-breakpoint
CREATE TRIGGER commerce_order_target_immutable BEFORE UPDATE OF product_key,result_id,cowrie_wallet_id,anonymous_owner_hash,currency,amount_minor,stripe_payment_intent_id ON commerce_orders WHEN NEW.product_key IS NOT OLD.product_key OR NEW.result_id IS NOT OLD.result_id OR NEW.cowrie_wallet_id IS NOT OLD.cowrie_wallet_id OR NEW.anonymous_owner_hash IS NOT OLD.anonymous_owner_hash OR NEW.currency IS NOT OLD.currency OR NEW.amount_minor IS NOT OLD.amount_minor OR NEW.stripe_payment_intent_id IS NOT OLD.stripe_payment_intent_id BEGIN SELECT RAISE(ABORT,'order authority immutable'); END;
--> statement-breakpoint
CREATE TRIGGER cowrie_allocation_order_authority BEFORE INSERT ON cowrie_purchase_allocations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM commerce_orders o JOIN cowrie_wallets w ON w.id=o.cowrie_wallet_id WHERE o.id=NEW.order_id AND w.id=NEW.wallet_id AND w.anonymous_owner_hash=o.anonymous_owner_hash AND o.product_key=NEW.product_key AND o.product_key IN('cowrie_5_v1','cowrie_15_v1','cowrie_40_v1') AND o.state='fulfilled' AND NEW.original_quantity=CASE o.product_key WHEN 'cowrie_5_v1' THEN 5 WHEN 'cowrie_15_v1' THEN 15 WHEN 'cowrie_40_v1' THEN 40 END AND NEW.remaining_quantity=NEW.original_quantity) THEN RAISE(ABORT,'allocation authority mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER cowrie_allocation_identity_immutable BEFORE UPDATE OF order_id,wallet_id,product_key,original_quantity ON cowrie_purchase_allocations WHEN NEW.order_id IS NOT OLD.order_id OR NEW.wallet_id IS NOT OLD.wallet_id OR NEW.product_key IS NOT OLD.product_key OR NEW.original_quantity IS NOT OLD.original_quantity BEGIN SELECT RAISE(ABORT,'allocation authority immutable'); END;
--> statement-breakpoint
CREATE TRIGGER cowrie_purchase_credit_order_authority BEFORE INSERT ON cowrie_ledger WHEN NEW.entry_type='purchase_credit' BEGIN
 SELECT CASE WHEN NEW.bucket!='purchased' OR NOT EXISTS(SELECT 1 FROM cowrie_purchase_allocations a JOIN commerce_orders o ON o.id=a.order_id WHERE a.id=NEW.related_allocation_id AND o.id=NEW.related_order_id AND a.wallet_id=NEW.wallet_id AND o.cowrie_wallet_id=NEW.wallet_id AND a.product_key=o.product_key AND o.product_key IN('cowrie_5_v1','cowrie_15_v1','cowrie_40_v1') AND o.state='fulfilled' AND a.state='active' AND NEW.delta=a.original_quantity AND NEW.idempotency_domain='purchase' AND NOT EXISTS(SELECT 1 FROM cowrie_ledger credit WHERE credit.entry_type='purchase_credit' AND credit.related_order_id=o.id)) THEN RAISE(ABORT,'purchase authority mismatch') END;
END;

--> statement-breakpoint
CREATE UNIQUE INDEX commerce_orders_payment_intent_hash_uq ON commerce_orders(stripe_payment_intent_hash) WHERE stripe_payment_intent_hash IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER commerce_order_payment_binding_immutable BEFORE UPDATE OF stripe_payment_intent_hash,stripe_checkout_session_id,stripe_payment_link_id,client_reference_id ON commerce_orders WHEN (OLD.stripe_payment_intent_hash IS NOT NULL AND NEW.stripe_payment_intent_hash IS NOT OLD.stripe_payment_intent_hash) OR (OLD.stripe_checkout_session_id IS NOT NULL AND NEW.stripe_checkout_session_id IS NOT OLD.stripe_checkout_session_id) OR NEW.stripe_payment_link_id IS NOT OLD.stripe_payment_link_id OR NEW.client_reference_id IS NOT OLD.client_reference_id BEGIN SELECT RAISE(ABORT,'payment binding immutable'); END;
--> statement-breakpoint
CREATE TRIGGER commerce_order_adverse_pending_guard BEFORE UPDATE OF state,refunded_at,disputed_at ON commerce_orders WHEN NEW.refunded_at IS NOT NULL OR NEW.disputed_at IS NOT NULL BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM cowrie_ledger debit JOIN cowrie_purchase_allocations a ON a.id=debit.related_allocation_id JOIN quiz_attempts qa ON qa.id=debit.related_attempt_id WHERE a.order_id=NEW.id AND EXISTS(SELECT 1 FROM cowrie_wallets w WHERE w.id=a.wallet_id AND w.state='active') AND debit.entry_type='quick_play_debit' AND qa.cowrie_issued_at IS NULL AND qa.status='in_progress' AND NOT EXISTS(SELECT 1 FROM cowrie_ledger r WHERE r.reversal_of_ledger_id=debit.id)) THEN RAISE(ABORT,'unissued purchase requires settlement') END;
END;

--> statement-breakpoint
CREATE TRIGGER cowrie_refund_settlement_authority BEFORE INSERT ON cowrie_ledger WHEN NEW.entry_type='refund_reversal' BEGIN
 SELECT CASE WHEN NEW.bucket!='purchased' OR NEW.delta>=0 OR NEW.idempotency_domain!='refund' OR NEW.related_order_id IS NULL OR NEW.related_allocation_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM cowrie_purchase_allocations a JOIN commerce_orders o ON o.id=a.order_id JOIN cowrie_wallets w ON w.id=a.wallet_id JOIN cowrie_ledger credit ON credit.id=NEW.reversal_of_ledger_id
  WHERE a.id=NEW.related_allocation_id AND o.id=NEW.related_order_id AND a.wallet_id=NEW.wallet_id AND o.cowrie_wallet_id=w.id AND w.anonymous_owner_hash=o.anonymous_owner_hash AND a.product_key=o.product_key AND o.product_key IN('cowrie_5_v1','cowrie_15_v1','cowrie_40_v1') AND w.state IN('active','frozen') AND a.state='active'
   AND credit.entry_type='purchase_credit' AND credit.related_order_id=o.id AND credit.related_allocation_id=a.id AND credit.wallet_id=w.id AND NEW.delta>=-a.remaining_quantity AND NEW.delta>=-w.purchased_balance
   AND EXISTS(SELECT 1 FROM stripe_webhook_events e WHERE e.order_id=o.id AND e.payment_intent_hash=o.stripe_payment_intent_hash AND e.processing_result='received' AND ((NEW.reason_code='verified_refund' AND o.refunded_at IS NOT NULL AND o.disputed_at IS NULL AND o.state IN('refunded','review_required') AND e.event_type='charge.refunded' AND e.amount_minor=o.amount_minor AND e.amount_refunded_minor=e.amount_minor) OR (NEW.reason_code='verified_dispute' AND o.disputed_at IS NOT NULL AND o.state IN('disputed','review_required') AND e.event_type='charge.dispute.created' AND e.amount_minor>0 AND e.amount_minor<=o.amount_minor)))
 ) THEN RAISE(ABORT,'refund settlement authority mismatch') END;
END;
--> statement-breakpoint
DROP TRIGGER cowrie_ledger_active_wallet_guard;
--> statement-breakpoint
CREATE TRIGGER cowrie_ledger_active_wallet_guard BEFORE INSERT ON cowrie_ledger BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cowrie_wallets WHERE id=NEW.wallet_id AND (state='active' OR (state='frozen' AND NEW.entry_type='refund_reversal' AND NEW.bucket='purchased' AND NEW.delta<0))) THEN RAISE(ABORT,'cowrie wallet unavailable') END;
 SELECT CASE WHEN NEW.bucket='bonus' AND (SELECT bonus_balance FROM cowrie_wallets WHERE id=NEW.wallet_id)+NEW.delta<0 THEN RAISE(ABORT,'insufficient bonus cowries') WHEN NEW.bucket='purchased' AND (SELECT purchased_balance FROM cowrie_wallets WHERE id=NEW.wallet_id)+NEW.delta<0 THEN RAISE(ABORT,'insufficient purchased cowries') END;
END;
--> statement-breakpoint
DROP TRIGGER cowrie_ledger_reconcile_wallet;
--> statement-breakpoint
CREATE TRIGGER cowrie_ledger_reconcile_wallet AFTER INSERT ON cowrie_ledger BEGIN
 UPDATE cowrie_wallets SET purchased_balance=purchased_balance+CASE WHEN NEW.bucket='purchased' THEN NEW.delta ELSE 0 END,bonus_balance=bonus_balance+CASE WHEN NEW.bucket='bonus' THEN NEW.delta ELSE 0 END,version=version+1,updated_at=MAX(updated_at,NEW.created_at) WHERE id=NEW.wallet_id AND (state='active' OR (state='frozen' AND NEW.entry_type='refund_reversal' AND NEW.bucket='purchased' AND NEW.delta<0));
END;

--> statement-breakpoint
CREATE TRIGGER stripe_webhook_verified_facts_immutable BEFORE UPDATE OF stripe_event_id,event_type,livemode,payload_sha256,payment_intent_hash,amount_minor,amount_refunded_minor ON stripe_webhook_events WHEN NEW.stripe_event_id IS NOT OLD.stripe_event_id OR NEW.event_type IS NOT OLD.event_type OR NEW.livemode IS NOT OLD.livemode OR NEW.payload_sha256 IS NOT OLD.payload_sha256 OR NEW.payment_intent_hash IS NOT OLD.payment_intent_hash OR NEW.amount_minor IS NOT OLD.amount_minor OR NEW.amount_refunded_minor IS NOT OLD.amount_refunded_minor BEGIN SELECT RAISE(ABORT,'verified webhook facts immutable'); END;
