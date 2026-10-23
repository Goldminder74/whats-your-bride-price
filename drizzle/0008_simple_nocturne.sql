ALTER TABLE `daily_challenges` ADD `scoring_version` text DEFAULT 'binary-exact-set-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_challenges` ADD `selection_policy_version` text DEFAULT 'balanced-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `quiz_attempts` ADD `play_mode` text DEFAULT 'random' NOT NULL;--> statement-breakpoint
ALTER TABLE `quiz_attempts` ADD `daily_challenge_id` text REFERENCES `daily_challenges`(`id`) ON DELETE restrict;--> statement-breakpoint
CREATE INDEX `quiz_attempts_daily_idx` ON `quiz_attempts` (`daily_challenge_id`,`anonymous_subject_hash`,`status`);--> statement-breakpoint
ALTER TABLE `streaks` ADD `last_qualified_at` integer;--> statement-breakpoint
CREATE TABLE `daily_challenge_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`daily_challenge_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`result_id` text NOT NULL,
	`anonymous_subject_hash` text NOT NULL,
	`edition_id` text NOT NULL,
	`challenge_date` text NOT NULL,
	`scoring_version` text NOT NULL,
	`completed_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`daily_challenge_id`) REFERENCES `daily_challenges`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`result_id`) REFERENCES `results`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`edition_id`) REFERENCES `quiz_editions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "daily_completions_subject_hash_ck" CHECK(length(`anonymous_subject_hash`) = 64 and `anonymous_subject_hash` = lower(`anonymous_subject_hash`) and `anonymous_subject_hash` not glob '*[^0-9a-f]*'),
	CONSTRAINT "daily_completions_date_ck" CHECK(length(`challenge_date`) = 10 and `challenge_date` glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_completions_subject_day_uq` ON `daily_challenge_completions` (`daily_challenge_id`,`anonymous_subject_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_completions_attempt_uq` ON `daily_challenge_completions` (`attempt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_completions_result_uq` ON `daily_challenge_completions` (`result_id`);--> statement-breakpoint
CREATE INDEX `daily_completions_subject_date_idx` ON `daily_challenge_completions` (`anonymous_subject_hash`,`challenge_date`);--> statement-breakpoint
CREATE TABLE `daily_operation_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`rate_key_hash` text NOT NULL,
	`action` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "daily_operation_limits_hash_ck" CHECK(length(`rate_key_hash`) = 64 and `rate_key_hash` = lower(`rate_key_hash`) and `rate_key_hash` not glob '*[^0-9a-f]*'),
	CONSTRAINT "daily_operation_limits_action_ck" CHECK(`action` in ('start','complete','clear')),
	CONSTRAINT "daily_operation_limits_count_ck" CHECK(`request_count` between 1 and 100),
	CONSTRAINT "daily_operation_limits_time_ck" CHECK(`window_started_at` >= 0 and `expires_at` > `window_started_at` and `expires_at` - `window_started_at` <= 86400000)
);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_operation_limits_bucket_uq` ON `daily_operation_limits` (`rate_key_hash`,`action`,`window_started_at`);--> statement-breakpoint
CREATE INDEX `daily_operation_limits_expiry_idx` ON `daily_operation_limits` (`expires_at`);--> statement-breakpoint
CREATE TRIGGER `daily_challenges_v2_insert_guard`
BEFORE INSERT ON `daily_challenges`
WHEN NEW.`version` >= 2 AND (
  length(NEW.`challenge_date`) != 10 OR NEW.`challenge_date` NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  OR length(NEW.`deterministic_seed_hash`) != 64 OR NEW.`deterministic_seed_hash` != lower(NEW.`deterministic_seed_hash`)
  OR NEW.`deterministic_seed_hash` GLOB '*[^0-9a-f]*'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid versioned daily challenge authority');
END;--> statement-breakpoint
CREATE TRIGGER `daily_challenges_v2_update_guard`
BEFORE UPDATE OF `challenge_date`, `deterministic_seed_hash`, `version` ON `daily_challenges`
WHEN NEW.`version` >= 2 AND (
  length(NEW.`challenge_date`) != 10 OR NEW.`challenge_date` NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  OR length(NEW.`deterministic_seed_hash`) != 64 OR NEW.`deterministic_seed_hash` != lower(NEW.`deterministic_seed_hash`)
  OR NEW.`deterministic_seed_hash` GLOB '*[^0-9a-f]*'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid versioned daily challenge authority');
END;--> statement-breakpoint
CREATE TRIGGER `quiz_attempts_play_mode_insert_guard`
BEFORE INSERT ON `quiz_attempts`
WHEN NEW.`play_mode` NOT IN ('random','daily_official','daily_practice','challenge','comparison')
BEGIN
  SELECT RAISE(ABORT, 'invalid quiz attempt play mode');
END;--> statement-breakpoint
CREATE TRIGGER `quiz_attempts_play_mode_update_guard`
BEFORE UPDATE OF `play_mode` ON `quiz_attempts`
WHEN NEW.`play_mode` NOT IN ('random','daily_official','daily_practice','challenge','comparison')
BEGIN
  SELECT RAISE(ABORT, 'invalid quiz attempt play mode');
END;--> statement-breakpoint
CREATE TRIGGER `streaks_v2_insert_guard`
BEFORE INSERT ON `streaks`
WHEN NEW.`version` >= 2 AND (
  NEW.`streak_type` NOT IN ('daily:west','daily:east','daily:central','daily:north','daily:south')
  OR length(NEW.`anonymous_subject_hash`) != 64 OR NEW.`anonymous_subject_hash` != lower(NEW.`anonymous_subject_hash`)
  OR NEW.`anonymous_subject_hash` GLOB '*[^0-9a-f]*' OR NEW.`last_qualifying_date` IS NULL OR NEW.`last_qualified_at` IS NULL
  OR length(NEW.`last_qualifying_date`) != 10 OR NEW.`last_qualifying_date` NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  OR NEW.`expires_at` - NEW.`last_qualified_at` != 15552000000
)
BEGIN
  SELECT RAISE(ABORT, 'invalid versioned streak retention');
END;--> statement-breakpoint
CREATE TRIGGER `streaks_v2_update_guard`
BEFORE UPDATE ON `streaks`
WHEN NEW.`version` >= 2 AND (
  NEW.`streak_type` NOT IN ('daily:west','daily:east','daily:central','daily:north','daily:south')
  OR length(NEW.`anonymous_subject_hash`) != 64 OR NEW.`anonymous_subject_hash` != lower(NEW.`anonymous_subject_hash`)
  OR NEW.`anonymous_subject_hash` GLOB '*[^0-9a-f]*' OR NEW.`last_qualifying_date` IS NULL OR NEW.`last_qualified_at` IS NULL
  OR length(NEW.`last_qualifying_date`) != 10 OR NEW.`last_qualifying_date` NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  OR NEW.`expires_at` - NEW.`last_qualified_at` != 15552000000
)
BEGIN
  SELECT RAISE(ABORT, 'invalid versioned streak retention');
END;
