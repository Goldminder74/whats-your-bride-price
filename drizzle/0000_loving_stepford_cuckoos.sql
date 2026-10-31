CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
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
	CONSTRAINT "analytics_events_name_ck" CHECK("analytics_events"."event_name" in ('entry_viewed','region_selected','avatar_selected','quiz_started','question_answered','quiz_completed','result_viewed','share_interface_selected','share_handoff_attempted','link_copied','referred_visit_received','challenge_accepted')),
	CONSTRAINT "analytics_events_bot_ck" CHECK("analytics_events"."bot_classification" in ('human','bot','crawler','unknown')),
	CONSTRAINT "analytics_events_json_ck" CHECK(json_valid("analytics_events"."properties_json") and json_type("analytics_events"."properties_json") = 'object' and length("analytics_events"."properties_json") <= 2048)
);
--> statement-breakpoint
CREATE INDEX `analytics_events_name_time_idx` ON `analytics_events` (`event_name`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `analytics_events_retention_idx` ON `analytics_events` (`expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`question_id` text NOT NULL,
	`question_version` integer NOT NULL,
	`selected_option_ids_json` text NOT NULL,
	`is_correct` integer NOT NULL,
	`score_awarded` integer NOT NULL,
	`answered_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "answers_question_version_ck" CHECK("answers"."question_version" >= 1),
	CONSTRAINT "answers_score_ck" CHECK("answers"."score_awarded" between 0 and 100),
	CONSTRAINT "answers_options_json_ck" CHECK(json_valid("answers"."selected_option_ids_json") and json_type("answers"."selected_option_ids_json") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `answers_attempt_question_uq` ON `answers` (`attempt_id`,`question_id`);--> statement-breakpoint
CREATE INDEX `answers_attempt_idx` ON `answers` (`attempt_id`,`answered_at`);--> statement-breakpoint
CREATE TABLE `challenge_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`recipient_attempt_id` text NOT NULL,
	`idempotency_key_hash` text NOT NULL,
	`scoring_version` text NOT NULL,
	`outcome` text DEFAULT 'pending' NOT NULL,
	`state` text DEFAULT 'accepted' NOT NULL,
	`accepted_at` integer NOT NULL,
	`completed_at` integer,
	`expires_at` integer NOT NULL,
	`anonymized_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_attempt_id`) REFERENCES `quiz_attempts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "challenge_attempts_outcome_ck" CHECK("challenge_attempts"."outcome" in ('pending','beat','tied','not_beat','incompatible','unavailable')),
	CONSTRAINT "challenge_attempts_state_ck" CHECK("challenge_attempts"."state" in ('accepted','completed','expired','anonymized','deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `challenge_attempts_challenge_attempt_uq` ON `challenge_attempts` (`challenge_id`,`recipient_attempt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `challenge_attempts_idempotency_uq` ON `challenge_attempts` (`idempotency_key_hash`);--> statement-breakpoint
CREATE INDEX `challenge_attempts_challenge_idx` ON `challenge_attempts` (`challenge_id`,`state`);--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`public_code` text NOT NULL,
	`inviter_result_id` text,
	`edition_id` text NOT NULL,
	`verified_score_to_beat` integer NOT NULL,
	`total` integer NOT NULL,
	`scoring_version` text NOT NULL,
	`safe_inviter_avatar_id` text,
	`reviewed_inviter_name` text,
	`state` text DEFAULT 'active' NOT NULL,
	`use_limit` integer,
	`use_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`anonymized_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`inviter_result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`edition_id`) REFERENCES `quiz_editions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "challenges_score_ck" CHECK("challenges"."total" between 1 and 100 and "challenges"."verified_score_to_beat" between 0 and "challenges"."total"),
	CONSTRAINT "challenges_state_ck" CHECK("challenges"."state" in ('active','expired','revoked','unavailable','anonymized','deleted')),
	CONSTRAINT "challenges_use_ck" CHECK("challenges"."use_count" >= 0 and ("challenges"."use_limit" is null or ("challenges"."use_limit" > 0 and "challenges"."use_count" <= "challenges"."use_limit")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `challenges_public_code_uq` ON `challenges` (`public_code`);--> statement-breakpoint
CREATE INDEX `challenges_lookup_idx` ON `challenges` (`public_code`,`state`,`expires_at`);--> statement-breakpoint
CREATE INDEX `challenges_inviter_idx` ON `challenges` (`inviter_result_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `consent_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`anonymous_subject_hash` text NOT NULL,
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
	CONSTRAINT "consent_preferences_functional_ck" CHECK("consent_preferences"."strictly_functional" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consent_preferences_subject_notice_uq` ON `consent_preferences` (`anonymous_subject_hash`,`notice_version`);--> statement-breakpoint
CREATE INDEX `consent_preferences_expiry_idx` ON `consent_preferences` (`expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `daily_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge_date` text NOT NULL,
	`edition_id` text NOT NULL,
	`question_set_version` text NOT NULL,
	`deterministic_seed_hash` text NOT NULL,
	`selected_question_versions_json` text NOT NULL,
	`state` text DEFAULT 'planned' NOT NULL,
	`expires_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `quiz_editions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "daily_challenges_state_ck" CHECK("daily_challenges"."state" in ('planned','active','expired','cancelled')),
	CONSTRAINT "daily_challenges_questions_json_ck" CHECK(json_valid("daily_challenges"."selected_question_versions_json") and json_type("daily_challenges"."selected_question_versions_json") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_challenges_date_edition_uq` ON `daily_challenges` (`challenge_date`,`edition_id`);--> statement-breakpoint
CREATE INDEX `daily_challenges_state_date_idx` ON `daily_challenges` (`state`,`challenge_date`);--> statement-breakpoint
CREATE TABLE `feature_flag_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`flag_name` text NOT NULL,
	`enabled` integer NOT NULL,
	`scope_type` text NOT NULL,
	`scope_value_hash` text,
	`reason` text NOT NULL,
	`created_by_owner_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "feature_flag_overrides_name_ck" CHECK("feature_flag_overrides"."flag_name" in ('fast_entry','challenges','dynamic_results','story_video','first_party_analytics','daily_challenge','streaks','groom_mode','couples_mode','party_mode','premium_preview','commerce')),
	CONSTRAINT "feature_flag_overrides_scope_ck" CHECK("feature_flag_overrides"."scope_type" in ('global','edition','anonymous_subject','owner_preview')),
	CONSTRAINT "feature_flag_overrides_reason_ck" CHECK(length("feature_flag_overrides"."reason") between 3 and 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feature_flag_overrides_scope_uq` ON `feature_flag_overrides` (`flag_name`,`scope_type`,`scope_value_hash`,`expires_at`);--> statement-breakpoint
CREATE INDEX `feature_flag_overrides_active_idx` ON `feature_flag_overrides` (`flag_name`,`scope_type`,`expires_at`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `mastery_seals` (
	`id` text PRIMARY KEY NOT NULL,
	`anonymous_subject_hash` text NOT NULL,
	`edition_id` text NOT NULL,
	`result_id` text NOT NULL,
	`rule_version` text NOT NULL,
	`earned_at` integer NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`revoked_at` integer,
	`anonymized_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `quiz_editions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "mastery_seals_state_ck" CHECK("mastery_seals"."state" in ('active','revoked','anonymized','deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mastery_seals_subject_edition_rule_uq` ON `mastery_seals` (`anonymous_subject_hash`,`edition_id`,`rule_version`);--> statement-breakpoint
CREATE INDEX `mastery_seals_subject_idx` ON `mastery_seals` (`anonymous_subject_hash`,`state`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`media_type` text NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`result_id` text,
	`edition_id` text,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`content_hash` text NOT NULL,
	`generation_version` text NOT NULL,
	`privacy_classification` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`edition_id`) REFERENCES `quiz_editions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "media_assets_type_ck" CHECK("media_assets"."media_type" in ('result_portrait','open_graph','story_image','story_video','party_card')),
	CONSTRAINT "media_assets_mime_ck" CHECK("media_assets"."mime_type" in ('image/png','image/webp','video/mp4','video/webm')),
	CONSTRAINT "media_assets_dimensions_ck" CHECK("media_assets"."width" between 1 and 8192 and "media_assets"."height" between 1 and 8192 and "media_assets"."byte_size" between 1 and 52428800),
	CONSTRAINT "media_assets_privacy_ck" CHECK("media_assets"."privacy_classification" in ('private','safe_public','owner_only')),
	CONSTRAINT "media_assets_state_ck" CHECK("media_assets"."state" in ('pending','ready','expired','revoked','deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_object_key_uq` ON `media_assets` (`object_key`);--> statement-breakpoint
CREATE INDEX `media_assets_owner_idx` ON `media_assets` (`owner_type`,`owner_id`,`state`);--> statement-breakpoint
CREATE INDEX `media_assets_result_idx` ON `media_assets` (`result_id`,`state`);--> statement-breakpoint
CREATE INDEX `media_assets_expiry_idx` ON `media_assets` (`expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`public_code` text NOT NULL,
	`host_control_token_hash` text NOT NULL,
	`edition_id` text NOT NULL,
	`max_players` integer DEFAULT 20 NOT NULL,
	`leaderboard_rule_version` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`starts_at` integer,
	`closed_at` integer,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `quiz_editions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "parties_capacity_ck" CHECK("parties"."max_players" between 2 and 20),
	CONSTRAINT "parties_state_ck" CHECK("parties"."state" in ('open','started','closed','expired','revoked','deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parties_public_code_uq` ON `parties` (`public_code`);--> statement-breakpoint
CREATE INDEX `parties_lookup_idx` ON `parties` (`public_code`,`state`,`expires_at`);--> statement-breakpoint
CREATE TABLE `party_players` (
	`id` text PRIMARY KEY NOT NULL,
	`party_id` text NOT NULL,
	`player_public_id` text NOT NULL,
	`safe_avatar_id` text NOT NULL,
	`reviewed_display_name` text,
	`result_id` text,
	`score` integer,
	`rank_tie_breaker` text NOT NULL,
	`state` text DEFAULT 'joined' NOT NULL,
	`joined_at` integer NOT NULL,
	`completed_at` integer,
	`anonymized_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "party_players_score_ck" CHECK("party_players"."score" is null or "party_players"."score" between 0 and 100),
	CONSTRAINT "party_players_state_ck" CHECK("party_players"."state" in ('joined','playing','completed','left','anonymized','deleted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `party_players_party_public_uq` ON `party_players` (`party_id`,`player_public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `party_players_party_result_uq` ON `party_players` (`party_id`,`result_id`);--> statement-breakpoint
CREATE INDEX `party_players_leaderboard_idx` ON `party_players` (`party_id`,`score`,`completed_at`,`rank_tie_breaker`);--> statement-breakpoint
CREATE TABLE `question_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text,
	`title` text NOT NULL,
	`organisation_or_author` text NOT NULL,
	`url_or_reference` text NOT NULL,
	`publication_date` text,
	`access_date` text NOT NULL,
	`source_type` text NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`reviewer` text,
	`review_date` text,
	`relevant_claim` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "question_sources_status_ck" CHECK("question_sources"."review_status" in ('pending','in_review','approved','rejected')),
	CONSTRAINT "question_sources_type_ck" CHECK("question_sources"."source_type" in ('primary','academic','museum','heritage','book','article','oral_history','other'))
);
--> statement-breakpoint
CREATE INDEX `question_sources_question_idx` ON `question_sources` (`question_id`,`review_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `question_sources_reference_uq` ON `question_sources` (`question_id`,`url_or_reference`,`relevant_claim`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`stable_id` text NOT NULL,
	`version` integer NOT NULL,
	`edition_id` text NOT NULL,
	`country_scope` text,
	`subregion_scope` text,
	`community_scope` text,
	`category` text NOT NULL,
	`difficulty` text,
	`question_kind` text NOT NULL,
	`question_text` text NOT NULL,
	`answer_options_json` text NOT NULL,
	`correct_answer_json` text NOT NULL,
	`explanation` text NOT NULL,
	`scoring_weight` integer DEFAULT 1 NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`publication_status` text DEFAULT 'draft' NOT NULL,
	`source_review_status` text DEFAULT 'pending' NOT NULL,
	`sensitivity_notes` text,
	`content_hash` text NOT NULL,
	`published_at` integer,
	`retired_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `quiz_editions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "questions_version_ck" CHECK("questions"."version" >= 1),
	CONSTRAINT "questions_weight_ck" CHECK("questions"."scoring_weight" between 1 and 100),
	CONSTRAINT "questions_kind_ck" CHECK("questions"."question_kind" in ('single','multi','complete','image')),
	CONSTRAINT "questions_difficulty_ck" CHECK("questions"."difficulty" is null or "questions"."difficulty" in ('introductory','intermediate','advanced')),
	CONSTRAINT "questions_publication_ck" CHECK("questions"."publication_status" in ('draft','review','published','retired','rejected')),
	CONSTRAINT "questions_source_review_ck" CHECK("questions"."source_review_status" in ('pending','in_review','approved','rejected')),
	CONSTRAINT "questions_json_ck" CHECK(json_valid("questions"."answer_options_json") and json_type("questions"."answer_options_json") = 'array' and json_valid("questions"."correct_answer_json") and json_type("questions"."correct_answer_json") = 'array'),
	CONSTRAINT "questions_playable_dates_ck" CHECK("questions"."publication_status" != 'published' or ("questions"."source_review_status" = 'approved' and "questions"."published_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_stable_version_uq` ON `questions` (`stable_id`,`version`);--> statement-breakpoint
CREATE INDEX `questions_playable_idx` ON `questions` (`edition_id`,`publication_status`,`source_review_status`);--> statement-breakpoint
CREATE INDEX `questions_category_idx` ON `questions` (`edition_id`,`category`);--> statement-breakpoint
CREATE TABLE `quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`anonymous_subject_hash` text,
	`question_set_version` text NOT NULL,
	`scoring_version` text NOT NULL,
	`selected_question_versions_json` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`idempotency_key_hash` text NOT NULL,
	`referral_code` text,
	`challenge_code` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`expires_at` integer NOT NULL,
	`anonymized_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `quiz_editions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "quiz_attempts_status_ck" CHECK("quiz_attempts"."status" in ('in_progress','completed','abandoned','expired','anonymized','deleted')),
	CONSTRAINT "quiz_attempts_questions_json_ck" CHECK(json_valid("quiz_attempts"."selected_question_versions_json") and json_type("quiz_attempts"."selected_question_versions_json") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_attempts_idempotency_uq` ON `quiz_attempts` (`idempotency_key_hash`);--> statement-breakpoint
CREATE INDEX `quiz_attempts_subject_idx` ON `quiz_attempts` (`anonymous_subject_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `quiz_attempts_expiry_idx` ON `quiz_attempts` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `quiz_attempts_challenge_idx` ON `quiz_attempts` (`challenge_code`);--> statement-breakpoint
CREATE TABLE `quiz_editions` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_key` text NOT NULL,
	`name` text NOT NULL,
	`region` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`retired_at` integer,
	CONSTRAINT "quiz_editions_key_ck" CHECK("quiz_editions"."edition_key" in ('west','east','central','north','south')),
	CONSTRAINT "quiz_editions_status_ck" CHECK("quiz_editions"."status" in ('active','retired')),
	CONSTRAINT "quiz_editions_version_ck" CHECK("quiz_editions"."version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_editions_key_version_uq` ON `quiz_editions` (`edition_key`,`version`);--> statement-breakpoint
CREATE INDEX `quiz_editions_status_idx` ON `quiz_editions` (`status`);--> statement-breakpoint
CREATE TABLE `referral_events` (
	`id` text PRIMARY KEY NOT NULL,
	`referral_code` text NOT NULL,
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
	CONSTRAINT "referral_events_type_ck" CHECK("referral_events"."event_type" in ('link_created','referred_visit_received','challenge_accepted','quiz_started','quiz_completed'))
);
--> statement-breakpoint
CREATE INDEX `referral_events_code_time_idx` ON `referral_events` (`referral_code`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `referral_events_retention_idx` ON `referral_events` (`expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `results` (
	`id` text PRIMARY KEY NOT NULL,
	`public_slug` text NOT NULL,
	`attempt_id` text NOT NULL,
	`edition_id` text NOT NULL,
	`score` integer NOT NULL,
	`total` integer NOT NULL,
	`tier` integer NOT NULL,
	`scoring_version` text NOT NULL,
	`question_set_version` text NOT NULL,
	`scoring_snapshot_json` text NOT NULL,
	`safe_avatar_id` text,
	`reviewed_display_name` text,
	`safeguard_version` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`anonymized_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`edition_id`) REFERENCES `quiz_editions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "results_score_ck" CHECK("results"."total" between 1 and 100 and "results"."score" between 0 and "results"."total"),
	CONSTRAINT "results_tier_ck" CHECK("results"."tier" between 0 and 3),
	CONSTRAINT "results_state_ck" CHECK("results"."state" in ('active','expired','revoked','anonymized','deleted')),
	CONSTRAINT "results_snapshot_json_ck" CHECK(json_valid("results"."scoring_snapshot_json") and json_type("results"."scoring_snapshot_json") = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `results_public_slug_uq` ON `results` (`public_slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `results_attempt_uq` ON `results` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `results_public_lookup_idx` ON `results` (`public_slug`,`state`,`expires_at`);--> statement-breakpoint
CREATE INDEX `results_edition_created_idx` ON `results` (`edition_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `share_events` (
	`id` text PRIMARY KEY NOT NULL,
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
	CONSTRAINT "share_events_type_ck" CHECK("share_events"."event_type" in ('share_interface_selected','share_handoff_attempted','link_copied')),
	CONSTRAINT "share_events_channel_ck" CHECK("share_events"."channel" in ('native','whatsapp','facebook','instagram','tiktok','clipboard','download','other'))
);
--> statement-breakpoint
CREATE INDEX `share_events_result_time_idx` ON `share_events` (`result_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `share_events_retention_idx` ON `share_events` (`expires_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `streaks` (
	`id` text PRIMARY KEY NOT NULL,
	`anonymous_subject_hash` text NOT NULL,
	`streak_type` text NOT NULL,
	`current_count` integer DEFAULT 0 NOT NULL,
	`longest_count` integer DEFAULT 0 NOT NULL,
	`last_qualifying_date` text,
	`rule_version` text NOT NULL,
	`expires_at` integer NOT NULL,
	`anonymized_at` integer,
	`deleted_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "streaks_counts_ck" CHECK("streaks"."current_count" >= 0 and "streaks"."longest_count" >= "streaks"."current_count")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `streaks_subject_type_uq` ON `streaks` (`anonymous_subject_hash`,`streak_type`);--> statement-breakpoint
CREATE INDEX `streaks_expiry_idx` ON `streaks` (`expires_at`,`deleted_at`);
--> statement-breakpoint
CREATE TRIGGER `results_scoring_immutable`
BEFORE UPDATE OF `attempt_id`, `edition_id`, `score`, `total`, `tier`,
  `scoring_version`, `question_set_version`, `scoring_snapshot_json`
ON `results`
WHEN OLD.`attempt_id` != NEW.`attempt_id`
  OR OLD.`edition_id` != NEW.`edition_id`
  OR OLD.`score` != NEW.`score`
  OR OLD.`total` != NEW.`total`
  OR OLD.`tier` != NEW.`tier`
  OR OLD.`scoring_version` != NEW.`scoring_version`
  OR OLD.`question_set_version` != NEW.`question_set_version`
  OR OLD.`scoring_snapshot_json` != NEW.`scoring_snapshot_json`
BEGIN
  SELECT RAISE(ABORT, 'completed result scoring snapshots are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `answers_question_version_exists`
BEFORE INSERT ON `answers`
WHEN NOT EXISTS (
  SELECT 1 FROM `questions`
  WHERE `questions`.`id` = NEW.`question_id`
    AND `questions`.`version` = NEW.`question_version`
)
BEGIN
  SELECT RAISE(ABORT, 'answer references a missing question version');
END;
--> statement-breakpoint
CREATE TRIGGER `results_public_slug_format`
BEFORE INSERT ON `results`
WHEN length(NEW.`public_slug`) != 48
  OR NEW.`public_slug` != lower(NEW.`public_slug`)
  OR NEW.`public_slug` GLOB '*[^0-9a-f]*'
BEGIN
  SELECT RAISE(ABORT, 'result public slug must be a lowercase 192-bit hexadecimal code');
END;
--> statement-breakpoint
CREATE TRIGGER `challenges_public_code_format`
BEFORE INSERT ON `challenges`
WHEN length(NEW.`public_code`) != 48
  OR NEW.`public_code` != lower(NEW.`public_code`)
  OR NEW.`public_code` GLOB '*[^0-9a-f]*'
BEGIN
  SELECT RAISE(ABORT, 'challenge public code must be a lowercase 192-bit hexadecimal code');
END;
--> statement-breakpoint
CREATE TRIGGER `parties_public_code_format`
BEFORE INSERT ON `parties`
WHEN length(NEW.`public_code`) != 48
  OR NEW.`public_code` != lower(NEW.`public_code`)
  OR NEW.`public_code` GLOB '*[^0-9a-f]*'
BEGIN
  SELECT RAISE(ABORT, 'party public code must be a lowercase 192-bit hexadecimal code');
END;
