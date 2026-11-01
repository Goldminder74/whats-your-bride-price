CREATE TABLE `__0005_copy_verification` (
	`difference` integer NOT NULL,
	CONSTRAINT "__0005_copy_verification_zero_ck" CHECK (`difference` = 0)
);--> statement-breakpoint
CREATE TABLE `__new_analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`client_event_uuid` text,
	`event_schema_version` integer DEFAULT 0 NOT NULL,
	`analytics_session_hash` text,
	`event_name` text NOT NULL,
	`properties_json` text DEFAULT '{}' NOT NULL,
	`anonymous_subject_hash` text,
	`consent_notice_version` text,
	`bot_classification` text DEFAULT 'unknown' NOT NULL,
	`occurred_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`anonymized_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "analytics_events_uuid_ck" CHECK("__new_analytics_events"."client_event_uuid" is null or (length("__new_analytics_events"."client_event_uuid") = 36 and "__new_analytics_events"."client_event_uuid" = lower("__new_analytics_events"."client_event_uuid") and substr("__new_analytics_events"."client_event_uuid",9,1) = '-' and substr("__new_analytics_events"."client_event_uuid",14,1) = '-' and substr("__new_analytics_events"."client_event_uuid",15,1) = '4' and substr("__new_analytics_events"."client_event_uuid",19,1) = '-' and substr("__new_analytics_events"."client_event_uuid",20,1) in ('8','9','a','b') and substr("__new_analytics_events"."client_event_uuid",24,1) = '-' and "__new_analytics_events"."client_event_uuid" not glob '*[^0-9a-f-]*')),
	CONSTRAINT "analytics_events_session_hash_ck" CHECK("__new_analytics_events"."analytics_session_hash" is null or (length("__new_analytics_events"."analytics_session_hash") = 64 and "__new_analytics_events"."analytics_session_hash" = lower("__new_analytics_events"."analytics_session_hash") and "__new_analytics_events"."analytics_session_hash" not glob '*[^0-9a-f]*')),
	CONSTRAINT "analytics_events_version_ck" CHECK("__new_analytics_events"."event_schema_version" in (0,1)),
	CONSTRAINT "analytics_events_name_ck" CHECK(("__new_analytics_events"."event_schema_version" = 0 and "__new_analytics_events"."event_name" in ('entry_viewed','region_selected','avatar_selected','quiz_started','question_answered','quiz_completed','result_viewed','share_interface_selected','share_handoff_attempted','link_copied','referred_visit_received','challenge_accepted')) or ("__new_analytics_events"."event_schema_version" = 1 and "__new_analytics_events"."event_name" in ('app_visit','edition_select','quiz_start','first_question_start','quiz_complete','result_view','result_publish','result_unpublish','challenge_create','challenge_view','challenge_accept','challenge_complete','comparison_view','comparison_outcome','nomination_open','nomination_share_intent','nomination_share_handoff','referred_visit','referred_quiz_start','share_centre_open','share_intent','share_handoff','story_video_open','story_video_render_start','story_video_render_complete','story_video_render_failed','story_video_share_intent','story_video_share_handoff','story_video_download','story_static_fallback','consent_accept','consent_reject','consent_withdraw','offer_view','checkout_start','checkout_complete','purchase_complete','payment_failed','refund_complete') and "__new_analytics_events"."client_event_uuid" is not null and "__new_analytics_events"."analytics_session_hash" is not null)),
	CONSTRAINT "analytics_events_bot_ck" CHECK("__new_analytics_events"."bot_classification" in ('human','bot','crawler','unknown')),
	CONSTRAINT "analytics_events_json_ck" CHECK(json_valid("__new_analytics_events"."properties_json") and json_type("__new_analytics_events"."properties_json") = 'object' and length("__new_analytics_events"."properties_json") <= 2048),
	CONSTRAINT "analytics_events_retention_ck" CHECK("__new_analytics_events"."event_schema_version" = 0 or ("__new_analytics_events"."occurred_at" >= 0 and "__new_analytics_events"."expires_at" > "__new_analytics_events"."occurred_at" and "__new_analytics_events"."expires_at" - "__new_analytics_events"."occurred_at" <= 2592000000))
);
--> statement-breakpoint
INSERT INTO `__new_analytics_events`("id", "client_event_uuid", "event_schema_version", "analytics_session_hash", "event_name", "properties_json", "anonymous_subject_hash", "consent_notice_version", "bot_classification", "occurred_at", "expires_at", "anonymized_at", "deleted_at", "version", "created_at", "updated_at") SELECT "id", NULL, 0, NULL, "event_name", "properties_json", "anonymous_subject_hash", "consent_notice_version", "bot_classification", "occurred_at", "expires_at", "anonymized_at", "deleted_at", "version", "created_at", "updated_at" FROM `analytics_events`;--> statement-breakpoint
INSERT INTO `__0005_copy_verification` (`difference`) SELECT (SELECT count(*) FROM `analytics_events`) - (SELECT count(*) FROM `__new_analytics_events`);--> statement-breakpoint
DROP TABLE `analytics_events`;--> statement-breakpoint
ALTER TABLE `__new_analytics_events` RENAME TO `analytics_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_events_client_uuid_uq` ON `analytics_events` (`client_event_uuid`) WHERE "analytics_events"."client_event_uuid" is not null;--> statement-breakpoint
CREATE INDEX `analytics_events_session_time_idx` ON `analytics_events` (`analytics_session_hash`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `analytics_events_name_time_idx` ON `analytics_events` (`event_name`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `analytics_events_retention_idx` ON `analytics_events` (`expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `__new_referral_events` (
	`id` text PRIMARY KEY NOT NULL,
	`client_event_uuid` text,
	`event_schema_version` integer DEFAULT 0 NOT NULL,
	`analytics_session_hash` text,
	`referral_code` text,
	`challenge_id` text,
	`attempt_id` text,
	`event_type` text NOT NULL,
	`source` text DEFAULT 'unknown' NOT NULL,
	`anonymous_subject_hash` text,
	`occurred_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`anonymized_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "referral_events_uuid_ck" CHECK("__new_referral_events"."client_event_uuid" is null or (length("__new_referral_events"."client_event_uuid") = 36 and "__new_referral_events"."client_event_uuid" = lower("__new_referral_events"."client_event_uuid") and substr("__new_referral_events"."client_event_uuid",9,1) = '-' and substr("__new_referral_events"."client_event_uuid",14,1) = '-' and substr("__new_referral_events"."client_event_uuid",15,1) = '4' and substr("__new_referral_events"."client_event_uuid",19,1) = '-' and substr("__new_referral_events"."client_event_uuid",20,1) in ('8','9','a','b') and substr("__new_referral_events"."client_event_uuid",24,1) = '-' and "__new_referral_events"."client_event_uuid" not glob '*[^0-9a-f-]*')),
	CONSTRAINT "referral_events_session_hash_ck" CHECK("__new_referral_events"."analytics_session_hash" is null or (length("__new_referral_events"."analytics_session_hash") = 64 and "__new_referral_events"."analytics_session_hash" = lower("__new_referral_events"."analytics_session_hash") and "__new_referral_events"."analytics_session_hash" not glob '*[^0-9a-f]*')),
	CONSTRAINT "referral_events_version_ck" CHECK("__new_referral_events"."event_schema_version" in (0,1)),
	CONSTRAINT "referral_events_contract_ck" CHECK(("__new_referral_events"."event_schema_version" = 0 and "__new_referral_events"."event_type" in ('link_created','referred_visit_received','challenge_accepted','quiz_started','quiz_completed') and "__new_referral_events"."referral_code" is not null) or ("__new_referral_events"."event_schema_version" = 1 and "__new_referral_events"."event_type" in ('referred_visit','referred_quiz_start') and "__new_referral_events"."client_event_uuid" is not null and "__new_referral_events"."analytics_session_hash" is not null and "__new_referral_events"."referral_code" is null and "__new_referral_events"."challenge_id" is not null and "__new_referral_events"."source" in ('challenge','nomination'))),
	CONSTRAINT "referral_events_retention_ck" CHECK("__new_referral_events"."event_schema_version" = 0 or ("__new_referral_events"."occurred_at" >= 0 and "__new_referral_events"."expires_at" > "__new_referral_events"."occurred_at" and "__new_referral_events"."expires_at" - "__new_referral_events"."occurred_at" <= 2592000000))
);
--> statement-breakpoint
INSERT INTO `__new_referral_events`("id", "client_event_uuid", "event_schema_version", "analytics_session_hash", "referral_code", "challenge_id", "attempt_id", "event_type", "source", "anonymous_subject_hash", "occurred_at", "expires_at", "anonymized_at", "deleted_at", "version", "created_at", "updated_at") SELECT "id", NULL, 0, NULL, "referral_code", "challenge_id", "attempt_id", "event_type", "source", "anonymous_subject_hash", "occurred_at", "expires_at", "anonymized_at", "deleted_at", "version", "created_at", "updated_at" FROM `referral_events`;--> statement-breakpoint
INSERT INTO `__0005_copy_verification` (`difference`) SELECT (SELECT count(*) FROM `referral_events`) - (SELECT count(*) FROM `__new_referral_events`);--> statement-breakpoint
DROP TABLE `referral_events`;--> statement-breakpoint
ALTER TABLE `__new_referral_events` RENAME TO `referral_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `referral_events_client_uuid_uq` ON `referral_events` (`client_event_uuid`) WHERE "referral_events"."client_event_uuid" is not null;--> statement-breakpoint
CREATE INDEX `referral_events_challenge_type_time_idx` ON `referral_events` (`challenge_id`,`event_type`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `referral_events_session_time_idx` ON `referral_events` (`analytics_session_hash`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `referral_events_retention_idx` ON `referral_events` (`expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `__new_share_events` (
	`id` text PRIMARY KEY NOT NULL,
	`client_event_uuid` text,
	`event_schema_version` integer DEFAULT 0 NOT NULL,
	`analytics_session_hash` text,
	`result_id` text,
	`challenge_id` text,
	`event_type` text NOT NULL,
	`channel` text NOT NULL,
	`anonymous_subject_hash` text,
	`occurred_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`anonymized_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "share_events_uuid_ck" CHECK("__new_share_events"."client_event_uuid" is null or (length("__new_share_events"."client_event_uuid") = 36 and "__new_share_events"."client_event_uuid" = lower("__new_share_events"."client_event_uuid") and substr("__new_share_events"."client_event_uuid",9,1) = '-' and substr("__new_share_events"."client_event_uuid",14,1) = '-' and substr("__new_share_events"."client_event_uuid",15,1) = '4' and substr("__new_share_events"."client_event_uuid",19,1) = '-' and substr("__new_share_events"."client_event_uuid",20,1) in ('8','9','a','b') and substr("__new_share_events"."client_event_uuid",24,1) = '-' and "__new_share_events"."client_event_uuid" not glob '*[^0-9a-f-]*')),
	CONSTRAINT "share_events_session_hash_ck" CHECK("__new_share_events"."analytics_session_hash" is null or (length("__new_share_events"."analytics_session_hash") = 64 and "__new_share_events"."analytics_session_hash" = lower("__new_share_events"."analytics_session_hash") and "__new_share_events"."analytics_session_hash" not glob '*[^0-9a-f]*')),
	CONSTRAINT "share_events_version_ck" CHECK("__new_share_events"."event_schema_version" in (0,1)),
	CONSTRAINT "share_events_contract_ck" CHECK(("__new_share_events"."event_schema_version" = 0 and "__new_share_events"."event_type" in ('share_interface_selected','share_handoff_attempted','link_copied') and "__new_share_events"."channel" in ('native','whatsapp','facebook','instagram','tiktok','clipboard','download','other')) or ("__new_share_events"."event_schema_version" = 1 and "__new_share_events"."event_type" in ('share_intent','share_handoff','nomination_share_intent','nomination_share_handoff','story_video_share_intent','story_video_share_handoff','story_video_download','story_static_fallback') and "__new_share_events"."channel" in ('whatsapp','facebook','facebook_story','instagram','tiktok','native','copy','download','static') and "__new_share_events"."client_event_uuid" is not null and "__new_share_events"."analytics_session_hash" is not null)),
	CONSTRAINT "share_events_retention_ck" CHECK("__new_share_events"."event_schema_version" = 0 or ("__new_share_events"."occurred_at" >= 0 and "__new_share_events"."expires_at" > "__new_share_events"."occurred_at" and "__new_share_events"."expires_at" - "__new_share_events"."occurred_at" <= 2592000000))
);
--> statement-breakpoint
INSERT INTO `__new_share_events`("id", "client_event_uuid", "event_schema_version", "analytics_session_hash", "result_id", "challenge_id", "event_type", "channel", "anonymous_subject_hash", "occurred_at", "expires_at", "anonymized_at", "deleted_at", "version", "created_at", "updated_at") SELECT "id", NULL, 0, NULL, "result_id", "challenge_id", "event_type", "channel", "anonymous_subject_hash", "occurred_at", "expires_at", "anonymized_at", "deleted_at", "version", "created_at", "updated_at" FROM `share_events`;--> statement-breakpoint
INSERT INTO `__0005_copy_verification` (`difference`) SELECT (SELECT count(*) FROM `share_events`) - (SELECT count(*) FROM `__new_share_events`);--> statement-breakpoint
DROP TABLE `share_events`;--> statement-breakpoint
ALTER TABLE `__new_share_events` RENAME TO `share_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `share_events_client_uuid_uq` ON `share_events` (`client_event_uuid`) WHERE "share_events"."client_event_uuid" is not null;--> statement-breakpoint
CREATE INDEX `share_events_type_channel_time_idx` ON `share_events` (`event_type`,`channel`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `share_events_session_time_idx` ON `share_events` (`analytics_session_hash`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `share_events_retention_idx` ON `share_events` (`expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `__new_consent_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`anonymous_subject_hash` text,
	`analytics_session_hash` text,
	`notice_version` text NOT NULL,
	`category_version` text NOT NULL,
	`strictly_functional` integer DEFAULT true NOT NULL,
	`first_party_statistical` integer DEFAULT false NOT NULL,
	`marketing` integer DEFAULT false NOT NULL,
	`decided_at` integer NOT NULL,
	`withdrawn_at` integer,
	`expires_at` integer NOT NULL,
	`anonymized_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "consent_preferences_functional_ck" CHECK("__new_consent_preferences"."strictly_functional" = 1),
	CONSTRAINT "consent_preferences_session_hash_ck" CHECK("__new_consent_preferences"."analytics_session_hash" is null or (length("__new_consent_preferences"."analytics_session_hash") = 64 and "__new_consent_preferences"."analytics_session_hash" = lower("__new_consent_preferences"."analytics_session_hash") and "__new_consent_preferences"."analytics_session_hash" not glob '*[^0-9a-f]*')),
	CONSTRAINT "consent_preferences_analytics_marketing_ck" CHECK("__new_consent_preferences"."analytics_session_hash" is null or "__new_consent_preferences"."marketing" = 0)
);
--> statement-breakpoint
INSERT INTO `__new_consent_preferences`("id", "anonymous_subject_hash", "analytics_session_hash", "notice_version", "category_version", "strictly_functional", "first_party_statistical", "marketing", "decided_at", "withdrawn_at", "expires_at", "anonymized_at", "deleted_at", "version", "created_at", "updated_at") SELECT "id", "anonymous_subject_hash", NULL, "notice_version", "category_version", "strictly_functional", "first_party_statistical", "marketing", "decided_at", "withdrawn_at", "expires_at", "anonymized_at", "deleted_at", "version", "created_at", "updated_at" FROM `consent_preferences`;--> statement-breakpoint
INSERT INTO `__0005_copy_verification` (`difference`) SELECT (SELECT count(*) FROM `consent_preferences`) - (SELECT count(*) FROM `__new_consent_preferences`);--> statement-breakpoint
DROP TABLE `consent_preferences`;--> statement-breakpoint
ALTER TABLE `__new_consent_preferences` RENAME TO `consent_preferences`;--> statement-breakpoint
CREATE UNIQUE INDEX `consent_preferences_subject_notice_uq` ON `consent_preferences` (`anonymous_subject_hash`,`notice_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `consent_preferences_session_notice_uq` ON `consent_preferences` (`analytics_session_hash`,`notice_version`) WHERE "consent_preferences"."analytics_session_hash" is not null;--> statement-breakpoint
CREATE INDEX `consent_preferences_expiry_idx` ON `consent_preferences` (`expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TRIGGER `analytics_events_client_uuid_cross_table`
BEFORE INSERT ON `analytics_events`
WHEN NEW.`client_event_uuid` IS NOT NULL AND (
  EXISTS (SELECT 1 FROM `referral_events` WHERE `client_event_uuid` = NEW.`client_event_uuid`)
  OR EXISTS (SELECT 1 FROM `share_events` WHERE `client_event_uuid` = NEW.`client_event_uuid`)
)
BEGIN
  SELECT RAISE(ABORT, 'client event UUID already used');
END;--> statement-breakpoint
CREATE TRIGGER `referral_events_client_uuid_cross_table`
BEFORE INSERT ON `referral_events`
WHEN NEW.`client_event_uuid` IS NOT NULL AND (
  EXISTS (SELECT 1 FROM `analytics_events` WHERE `client_event_uuid` = NEW.`client_event_uuid`)
  OR EXISTS (SELECT 1 FROM `share_events` WHERE `client_event_uuid` = NEW.`client_event_uuid`)
)
BEGIN
  SELECT RAISE(ABORT, 'client event UUID already used');
END;--> statement-breakpoint
CREATE TRIGGER `share_events_client_uuid_cross_table`
BEFORE INSERT ON `share_events`
WHEN NEW.`client_event_uuid` IS NOT NULL AND (
  EXISTS (SELECT 1 FROM `analytics_events` WHERE `client_event_uuid` = NEW.`client_event_uuid`)
  OR EXISTS (SELECT 1 FROM `referral_events` WHERE `client_event_uuid` = NEW.`client_event_uuid`)
)
BEGIN
  SELECT RAISE(ABORT, 'client event UUID already used');
END;--> statement-breakpoint
INSERT INTO `__0005_copy_verification` (`difference`) SELECT count(*) FROM pragma_foreign_key_check;--> statement-breakpoint
DROP TABLE `__0005_copy_verification`;
