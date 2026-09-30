ALTER TABLE `challenge_attempts` ADD `recipient_subject_hash` text;--> statement-breakpoint
ALTER TABLE `challenge_attempts` ADD `official_result_id` text REFERENCES results(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `challenge_attempts` ADD `is_official_comparison` integer DEFAULT 0 NOT NULL CONSTRAINT "challenge_attempts_official_marker_ck" CHECK (`is_official_comparison` in (0,1));--> statement-breakpoint
CREATE UNIQUE INDEX `challenge_attempts_official_recipient_uq` ON `challenge_attempts` (`challenge_id`,`recipient_subject_hash`) WHERE "challenge_attempts"."is_official_comparison" = 1 and "challenge_attempts"."recipient_subject_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `challenge_attempts_official_result_uq` ON `challenge_attempts` (`official_result_id`) WHERE "challenge_attempts"."official_result_id" is not null;--> statement-breakpoint
CREATE TRIGGER `challenge_attempts_official_insert_guard`
BEFORE INSERT ON `challenge_attempts`
WHEN NEW.`is_official_comparison` = 1 AND (
  NEW.`official_result_id` IS NULL
  OR NEW.`recipient_subject_hash` IS NULL
  OR length(NEW.`recipient_subject_hash`) != 64
  OR NEW.`recipient_subject_hash` != lower(NEW.`recipient_subject_hash`)
  OR NEW.`recipient_subject_hash` GLOB '*[^0-9a-f]*'
  OR NOT EXISTS (
    SELECT 1 FROM `quiz_attempts` qa
    WHERE qa.`id` = NEW.`recipient_attempt_id`
      AND qa.`anonymous_subject_hash` = NEW.`recipient_subject_hash`
  )
  OR NOT EXISTS (
    SELECT 1 FROM `results` r
    WHERE r.`id` = NEW.`official_result_id`
      AND r.`attempt_id` = NEW.`recipient_attempt_id`
  )
)
BEGIN
  SELECT RAISE(ABORT, 'official comparison requires an authoritative subject and matching result');
END;
--> statement-breakpoint
CREATE TRIGGER `challenge_attempts_official_claim_guard`
BEFORE UPDATE OF `is_official_comparison` ON `challenge_attempts`
WHEN OLD.`is_official_comparison` = 0 AND NEW.`is_official_comparison` = 1 AND (
  NEW.`official_result_id` IS NULL
  OR NEW.`recipient_subject_hash` IS NULL
  OR length(NEW.`recipient_subject_hash`) != 64
  OR NEW.`recipient_subject_hash` != lower(NEW.`recipient_subject_hash`)
  OR NEW.`recipient_subject_hash` GLOB '*[^0-9a-f]*'
  OR NOT EXISTS (
    SELECT 1 FROM `quiz_attempts` qa
    WHERE qa.`id` = NEW.`recipient_attempt_id`
      AND qa.`anonymous_subject_hash` = NEW.`recipient_subject_hash`
  )
  OR NOT EXISTS (
    SELECT 1 FROM `results` r
    WHERE r.`id` = NEW.`official_result_id`
      AND r.`attempt_id` = NEW.`recipient_attempt_id`
  )
)
BEGIN
  SELECT RAISE(ABORT, 'official comparison requires an authoritative subject and matching result');
END;
--> statement-breakpoint
CREATE TRIGGER `challenge_attempts_official_marker_immutable`
BEFORE UPDATE OF `is_official_comparison` ON `challenge_attempts`
WHEN OLD.`is_official_comparison` = 1 AND NEW.`is_official_comparison` != 1
BEGIN
  SELECT RAISE(ABORT, 'official comparison marker is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `challenge_attempts_official_subject_immutable`
BEFORE UPDATE OF `recipient_subject_hash` ON `challenge_attempts`
WHEN OLD.`is_official_comparison` = 1
  AND OLD.`recipient_subject_hash` IS NOT NEW.`recipient_subject_hash`
BEGIN
  SELECT RAISE(ABORT, 'official comparison subject is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `challenge_attempts_official_result_guard`
BEFORE UPDATE OF `official_result_id`, `is_official_comparison` ON `challenge_attempts`
WHEN NEW.`official_result_id` IS NOT NULL AND NEW.`is_official_comparison` != 1
BEGIN
  SELECT RAISE(ABORT, 'official result requires the official comparison marker');
END;
--> statement-breakpoint
CREATE TRIGGER `challenge_attempts_official_result_immutable`
BEFORE UPDATE OF `official_result_id` ON `challenge_attempts`
WHEN OLD.`is_official_comparison` = 1
  AND NEW.`official_result_id` IS NOT NULL
  AND OLD.`official_result_id` IS NOT NEW.`official_result_id`
BEGIN
  SELECT RAISE(ABORT, 'official comparison result cannot be replaced');
END;
