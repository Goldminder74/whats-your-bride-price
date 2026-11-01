CREATE TABLE `operational_authority_outbox` (
	`sequence` integer PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`intent_hash` text NOT NULL,
	`previous_hash` text NOT NULL,
	`event_hash` text NOT NULL,
	`encrypted_event` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`delivery_receipt` text,
	`acknowledged_at` integer,
	CONSTRAINT "operational_outbox_window_ck" CHECK("operational_authority_outbox"."expires_at" - "operational_authority_outbox"."created_at" = 2592000000),
	CONSTRAINT "operational_outbox_sequence_ck" CHECK("operational_authority_outbox"."sequence" > 0),
	CONSTRAINT "operational_outbox_ack_ck" CHECK(("operational_authority_outbox"."delivery_receipt" is null and "operational_authority_outbox"."acknowledged_at" is null) or ("operational_authority_outbox"."delivery_receipt" is not null and "operational_authority_outbox"."acknowledged_at" >= "operational_authority_outbox"."created_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operational_authority_outbox_operation_id_unique` ON `operational_authority_outbox` (`operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `operational_authority_outbox_event_hash_unique` ON `operational_authority_outbox` (`event_hash`);--> statement-breakpoint
CREATE TABLE `operational_recovery_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`sequence` integer DEFAULT 0 NOT NULL,
	`head_hash` text NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "operational_checkpoint_window_ck" CHECK("operational_recovery_checkpoints"."expires_at" - "operational_recovery_checkpoints"."created_at" = 2592000000),
	CONSTRAINT "operational_checkpoint_kind_ck" CHECK("operational_recovery_checkpoints"."kind" in ('journal','export','restore','custody')),
	CONSTRAINT "operational_checkpoint_state_ck" CHECK("operational_recovery_checkpoints"."state" in ('idle','exporting','importing','complete')),
	CONSTRAINT "operational_checkpoint_progress_ck" CHECK("operational_recovery_checkpoints"."sequence" >= 0 and "operational_recovery_checkpoints"."cursor" >= 0 and "operational_recovery_checkpoints"."version" >= 1)
);

--> statement-breakpoint
CREATE TRIGGER operational_outbox_fence BEFORE INSERT ON operational_authority_outbox BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM operational_recovery_checkpoints WHERE id='journal' AND kind='journal' AND state='idle' AND sequence=NEW.sequence-1 AND head_hash=NEW.previous_hash AND expires_at>NEW.created_at) THEN RAISE(ABORT,'operational authority fence mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER operational_outbox_immutable BEFORE UPDATE OF sequence,operation_id,intent_hash,previous_hash,event_hash,encrypted_event,created_at,expires_at ON operational_authority_outbox BEGIN
 SELECT RAISE(ABORT,'operational authority is immutable');
END;
