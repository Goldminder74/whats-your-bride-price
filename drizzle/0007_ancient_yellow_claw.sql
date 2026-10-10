ALTER TABLE `questions` ADD `accepted_answers_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` ADD `language` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` ADD `reviewed_by` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `questions` ADD `valid_from` integer;--> statement-breakpoint
ALTER TABLE `questions` ADD `valid_until` integer;--> statement-breakpoint
ALTER TABLE `questions` ADD `image_provenance_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` ADD `audio_provenance_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX `questions_selection_idx` ON `questions` (`edition_id`,`publication_status`,`source_review_status`,`difficulty`,`valid_until`);--> statement-breakpoint
ALTER TABLE `quiz_attempts` ADD `selection_policy_version` text DEFAULT 'balanced-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE `quiz_attempts` ADD `selection_seed_reference` text;--> statement-breakpoint
CREATE TRIGGER `questions_version_material_immutable`
BEFORE UPDATE OF `stable_id`, `version`, `edition_id`, `country_scope`, `subregion_scope`, `community_scope`, `category`, `difficulty`, `question_kind`, `question_text`, `answer_options_json`, `correct_answer_json`, `accepted_answers_json`, `explanation`, `visual_start`, `scoring_weight`, `language`, `locale`, `sensitivity_notes`, `reviewed_by`, `reviewed_at`, `image_provenance_json`, `audio_provenance_json`, `content_hash`
ON `questions`
WHEN OLD.`published_at` IS NOT NULL
  OR EXISTS (
    SELECT 1
    FROM `quiz_attempts` AS attempt, json_each(attempt.`selected_question_versions_json`) AS selected
    WHERE json_extract(selected.value, '$.stableId') = OLD.`stable_id`
      AND json_extract(selected.value, '$.version') = OLD.`version`
  )
BEGIN
  SELECT RAISE(ABORT, 'question versions used or published are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `questions_version_delete_immutable`
BEFORE DELETE ON `questions`
WHEN OLD.`published_at` IS NOT NULL
  OR EXISTS (
    SELECT 1
    FROM `quiz_attempts` AS attempt, json_each(attempt.`selected_question_versions_json`) AS selected
    WHERE json_extract(selected.value, '$.stableId') = OLD.`stable_id`
      AND json_extract(selected.value, '$.version') = OLD.`version`
  )
BEGIN
  SELECT RAISE(ABORT, 'question versions used or published are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `question_sources_published_immutable_update`
BEFORE UPDATE ON `question_sources`
WHEN EXISTS (
  SELECT 1 FROM `questions` AS question
  WHERE question.`id` = OLD.`question_id` AND question.`published_at` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'sources for published question versions are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `question_sources_published_immutable_insert`
BEFORE INSERT ON `question_sources`
WHEN EXISTS (
  SELECT 1 FROM `questions` AS question
  WHERE question.`id` = NEW.`question_id` AND question.`published_at` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'sources for published question versions are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `question_sources_published_immutable_delete`
BEFORE DELETE ON `question_sources`
WHEN EXISTS (
  SELECT 1 FROM `questions` AS question
  WHERE question.`id` = OLD.`question_id` AND question.`published_at` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'sources for published question versions are immutable');
END;--> statement-breakpoint
CREATE TRIGGER `quiz_attempts_selection_seed_reference_insert`
BEFORE INSERT ON `quiz_attempts`
WHEN NEW.`selection_seed_reference` IS NOT NULL
  AND (
    length(NEW.`selection_seed_reference`) != 64
    OR NEW.`selection_seed_reference` != lower(NEW.`selection_seed_reference`)
    OR NEW.`selection_seed_reference` GLOB '*[^0-9a-f]*'
  )
BEGIN
  SELECT RAISE(ABORT, 'selection seed reference must be a lowercase SHA-256 value');
END;--> statement-breakpoint
CREATE TRIGGER `quiz_attempts_selection_seed_reference_update`
BEFORE UPDATE OF `selection_seed_reference`, `selection_policy_version`, `selected_question_versions_json`
ON `quiz_attempts`
WHEN OLD.`status` != 'in_progress'
  OR OLD.`selection_seed_reference` IS NOT NEW.`selection_seed_reference`
  OR OLD.`selection_policy_version` != NEW.`selection_policy_version`
  OR OLD.`selected_question_versions_json` != NEW.`selected_question_versions_json`
BEGIN
  SELECT RAISE(ABORT, 'attempt selection authority is immutable');
END;
