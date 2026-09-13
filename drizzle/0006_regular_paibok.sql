CREATE TABLE `commerce_entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`result_id` text NOT NULL,
	`anonymous_owner_hash` text NOT NULL,
	`product_key` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`granted_at` integer NOT NULL,
	`revoked_at` integer,
	`expires_at` integer,
	`retention_expires_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`,`result_id`,`anonymous_owner_hash`,`product_key`) REFERENCES `commerce_orders`(`id`,`result_id`,`anonymous_owner_hash`,`product_key`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_entitlements_product_ck" CHECK("commerce_entitlements"."product_key" = 'royal_reveal_v1'),
	CONSTRAINT "commerce_entitlements_owner_hash_ck" CHECK(length("commerce_entitlements"."anonymous_owner_hash") = 64 and "commerce_entitlements"."anonymous_owner_hash" = lower("commerce_entitlements"."anonymous_owner_hash") and "commerce_entitlements"."anonymous_owner_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "commerce_entitlements_state_ck" CHECK("commerce_entitlements"."state" in ('active','revoked','expired','deleted')),
	CONSTRAINT "commerce_entitlements_time_ck" CHECK("commerce_entitlements"."granted_at" > 0 and "commerce_entitlements"."created_at" > 0 and "commerce_entitlements"."updated_at" >= "commerce_entitlements"."created_at" and ("commerce_entitlements"."expires_at" is null or "commerce_entitlements"."expires_at" > "commerce_entitlements"."granted_at") and "commerce_entitlements"."retention_expires_at" > "commerce_entitlements"."granted_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_entitlements_order_uq` ON `commerce_entitlements` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_entitlements_active_result_owner_uq` ON `commerce_entitlements` (`result_id`,`anonymous_owner_hash`,`product_key`) WHERE "commerce_entitlements"."state" = 'active';--> statement-breakpoint
CREATE INDEX `commerce_entitlements_lookup_idx` ON `commerce_entitlements` (`result_id`,`anonymous_owner_hash`,`product_key`,`state`);--> statement-breakpoint
CREATE INDEX `commerce_entitlements_retention_idx` ON `commerce_entitlements` (`retention_expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `commerce_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`public_order_reference` text NOT NULL,
	`product_key` text NOT NULL,
	`result_id` text NOT NULL,
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
	CONSTRAINT "commerce_orders_public_reference_ck" CHECK(length("commerce_orders"."public_order_reference") = 35 and substr("commerce_orders"."public_order_reference",1,3) = 'rr_' and substr("commerce_orders"."public_order_reference",4) not glob '*[^0-9a-f]*'),
	CONSTRAINT "commerce_orders_product_price_ck" CHECK("commerce_orders"."product_key" = 'royal_reveal_v1' and "commerce_orders"."currency" = 'GBP' and "commerce_orders"."amount_minor" = 199),
	CONSTRAINT "commerce_orders_owner_hash_ck" CHECK(length("commerce_orders"."anonymous_owner_hash") = 64 and "commerce_orders"."anonymous_owner_hash" = lower("commerce_orders"."anonymous_owner_hash") and "commerce_orders"."anonymous_owner_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "commerce_orders_idempotency_hash_ck" CHECK(length("commerce_orders"."idempotency_hash") = 64 and "commerce_orders"."idempotency_hash" = lower("commerce_orders"."idempotency_hash") and "commerce_orders"."idempotency_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "commerce_orders_client_reference_ck" CHECK("commerce_orders"."client_reference_id" = "commerce_orders"."public_order_reference"),
	CONSTRAINT "commerce_orders_payment_link_ck" CHECK(length("commerce_orders"."stripe_payment_link_id") between 8 and 255 and "commerce_orders"."stripe_payment_link_id" glob 'plink_*' and "commerce_orders"."stripe_payment_link_id" not glob '*[^0-9A-Za-z_]*'),
	CONSTRAINT "commerce_orders_checkout_session_ck" CHECK("commerce_orders"."stripe_checkout_session_id" is null or (length("commerce_orders"."stripe_checkout_session_id") between 8 and 255 and "commerce_orders"."stripe_checkout_session_id" glob 'cs_*' and "commerce_orders"."stripe_checkout_session_id" not glob '*[^0-9A-Za-z_]*')),
	CONSTRAINT "commerce_orders_payment_intent_ck" CHECK("commerce_orders"."stripe_payment_intent_id" is null or (length("commerce_orders"."stripe_payment_intent_id") between 6 and 255 and "commerce_orders"."stripe_payment_intent_id" glob 'pi_*' and "commerce_orders"."stripe_payment_intent_id" not glob '*[^0-9A-Za-z_]*')),
	CONSTRAINT "commerce_orders_state_ck" CHECK("commerce_orders"."state" in ('pending','processing','paid','fulfilled','failed','refunded','disputed','expired','deleted','review_required')),
	CONSTRAINT "commerce_orders_consent_ck" CHECK(length("commerce_orders"."consent_notice_version") between 3 and 100 and "commerce_orders"."immediate_delivery_consent_at" >= "commerce_orders"."created_at"),
	CONSTRAINT "commerce_orders_time_ck" CHECK("commerce_orders"."created_at" > 0 and "commerce_orders"."updated_at" >= "commerce_orders"."created_at" and "commerce_orders"."pending_expires_at" > "commerce_orders"."created_at" and "commerce_orders"."retention_expires_at" > "commerce_orders"."pending_expires_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_public_reference_uq` ON `commerce_orders` (`public_order_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_client_reference_uq` ON `commerce_orders` (`client_reference_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_idempotency_hash_uq` ON `commerce_orders` (`idempotency_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_checkout_session_uq` ON `commerce_orders` (`stripe_checkout_session_id`) WHERE "commerce_orders"."stripe_checkout_session_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_payment_intent_uq` ON `commerce_orders` (`stripe_payment_intent_id`) WHERE "commerce_orders"."stripe_payment_intent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_entitlement_authority_uq` ON `commerce_orders` (`id`,`result_id`,`anonymous_owner_hash`,`product_key`);--> statement-breakpoint
CREATE INDEX `commerce_orders_result_owner_state_idx` ON `commerce_orders` (`result_id`,`anonymous_owner_hash`,`state`);--> statement-breakpoint
CREATE INDEX `commerce_orders_pending_expiry_idx` ON `commerce_orders` (`state`,`pending_expires_at`);--> statement-breakpoint
CREATE INDEX `commerce_orders_retention_idx` ON `commerce_orders` (`retention_expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `stripe_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`stripe_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`livemode` integer NOT NULL,
	`payload_sha256` text NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer,
	`processing_result` text DEFAULT 'received' NOT NULL,
	`order_id` text,
	`expires_at` integer NOT NULL,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_orders`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "stripe_webhook_events_id_ck" CHECK(length("stripe_webhook_events"."stripe_event_id") between 8 and 255 and "stripe_webhook_events"."stripe_event_id" glob 'evt_*' and "stripe_webhook_events"."stripe_event_id" not glob '*[^0-9A-Za-z_]*'),
	CONSTRAINT "stripe_webhook_events_type_ck" CHECK("stripe_webhook_events"."event_type" in ('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','charge.refunded','charge.dispute.created')),
	CONSTRAINT "stripe_webhook_events_livemode_ck" CHECK("stripe_webhook_events"."livemode" in (0,1)),
	CONSTRAINT "stripe_webhook_events_payload_hash_ck" CHECK(length("stripe_webhook_events"."payload_sha256") = 64 and "stripe_webhook_events"."payload_sha256" = lower("stripe_webhook_events"."payload_sha256") and "stripe_webhook_events"."payload_sha256" not glob '*[^0-9a-f]*'),
	CONSTRAINT "stripe_webhook_events_result_ck" CHECK("stripe_webhook_events"."processing_result" in ('received','processed','ignored','failed','review_required')),
	CONSTRAINT "stripe_webhook_events_time_ck" CHECK("stripe_webhook_events"."received_at" > 0 and ("stripe_webhook_events"."processed_at" is null or "stripe_webhook_events"."processed_at" >= "stripe_webhook_events"."received_at") and "stripe_webhook_events"."expires_at" > "stripe_webhook_events"."received_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_webhook_events_event_id_uq` ON `stripe_webhook_events` (`stripe_event_id`);--> statement-breakpoint
CREATE INDEX `stripe_webhook_events_order_idx` ON `stripe_webhook_events` (`order_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `stripe_webhook_events_retention_idx` ON `stripe_webhook_events` (`expires_at`,`deleted_at`);
