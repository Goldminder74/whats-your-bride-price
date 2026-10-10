CREATE TABLE `question_evidence_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`question_version` integer NOT NULL,
	`question_content_sha256` text NOT NULL,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`risk_class` text NOT NULL,
	`policy_version` text NOT NULL,
	`evidence_bundle_sha256` text NOT NULL,
	`source_count` integer NOT NULL,
	`independent_source_count` integer NOT NULL,
	`primary_source_count` integer NOT NULL,
	`verified_at` integer NOT NULL,
	`recheck_at` integer NOT NULL,
	`revoked_at` integer,
	`revocation_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "question_evidence_id_ck" CHECK(length("question_evidence_verifications"."id") = 45 and substr("question_evidence_verifications"."id",1,13) = 'verification_' and substr("question_evidence_verifications"."id",14) not glob '*[^0-9a-f]*'),
	CONSTRAINT "question_evidence_version_ck" CHECK("question_evidence_verifications"."question_version" >= 1),
	CONSTRAINT "question_evidence_method_ck" CHECK("question_evidence_verifications"."method" = 'machine_evidence_v1'),
	CONSTRAINT "question_evidence_status_ck" CHECK("question_evidence_verifications"."status" in ('verified','revoked','expired','deleted')),
	CONSTRAINT "question_evidence_risk_ck" CHECK("question_evidence_verifications"."risk_class" = 'low_objective'),
	CONSTRAINT "question_evidence_policy_ck" CHECK("question_evidence_verifications"."policy_version" = 'low-objective-evidence-v1'),
	CONSTRAINT "question_evidence_content_hash_ck" CHECK(length("question_evidence_verifications"."question_content_sha256") = 64 and "question_evidence_verifications"."question_content_sha256" not glob '*[^0-9a-f]*'),
	CONSTRAINT "question_evidence_bundle_hash_ck" CHECK(length("question_evidence_verifications"."evidence_bundle_sha256") = 64 and "question_evidence_verifications"."evidence_bundle_sha256" not glob '*[^0-9a-f]*'),
	CONSTRAINT "question_evidence_sources_ck" CHECK("question_evidence_verifications"."source_count" >= 2 and "question_evidence_verifications"."independent_source_count" >= 2 and "question_evidence_verifications"."independent_source_count" <= "question_evidence_verifications"."source_count" and "question_evidence_verifications"."primary_source_count" >= 1 and "question_evidence_verifications"."primary_source_count" <= "question_evidence_verifications"."source_count"),
	CONSTRAINT "question_evidence_policy_expiry_ck" CHECK("question_evidence_verifications"."expires_at" <= 1820793600000),
	CONSTRAINT "question_evidence_time_ck" CHECK("question_evidence_verifications"."verified_at" > 0 and "question_evidence_verifications"."created_at" >= "question_evidence_verifications"."verified_at" and "question_evidence_verifications"."updated_at" >= "question_evidence_verifications"."created_at" and "question_evidence_verifications"."recheck_at" > "question_evidence_verifications"."verified_at" and "question_evidence_verifications"."recheck_at" - "question_evidence_verifications"."verified_at" <= 15552000000 and "question_evidence_verifications"."expires_at" >= "question_evidence_verifications"."recheck_at"),
	CONSTRAINT "question_evidence_revocation_ck" CHECK(("question_evidence_verifications"."status" = 'revoked' and "question_evidence_verifications"."revoked_at" is not null and "question_evidence_verifications"."revocation_reason" is not null and "question_evidence_verifications"."revoked_at" >= "question_evidence_verifications"."verified_at" and "question_evidence_verifications"."revocation_reason" in ('source_unavailable','source_conflict','unsupported_claim','ambiguity','cultural_risk','duplicate','policy_withdrawn')) or ("question_evidence_verifications"."status" != 'revoked' and "question_evidence_verifications"."revoked_at" is null and "question_evidence_verifications"."revocation_reason" is null)),
	CONSTRAINT "question_evidence_deletion_ck" CHECK(("question_evidence_verifications"."status" = 'deleted' and "question_evidence_verifications"."deleted_at" is not null and "question_evidence_verifications"."deleted_at" >= "question_evidence_verifications"."verified_at") or ("question_evidence_verifications"."status" != 'deleted' and "question_evidence_verifications"."deleted_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `question_evidence_active_version_policy_uq` ON `question_evidence_verifications` (`question_id`,`question_version`,`policy_version`) WHERE "question_evidence_verifications"."status" = 'verified';--> statement-breakpoint
CREATE INDEX `question_evidence_eligibility_idx` ON `question_evidence_verifications` (`question_id`,`status`,`recheck_at`,`expires_at`);
--> statement-breakpoint
CREATE TRIGGER question_evidence_exact_version_insert
BEFORE INSERT ON question_evidence_verifications
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM questions q WHERE q.id=NEW.question_id AND q.version=NEW.question_version
      AND q.content_hash=NEW.question_content_sha256 AND q.reviewed_by IS NULL AND q.reviewed_at IS NULL
      AND q.sensitivity_notes IS NULL AND q.community_scope IS NULL
      AND q.publication_status NOT IN ('rejected','retired') AND q.retired_at IS NULL
  ) THEN RAISE(ABORT,'machine evidence requires an exact low-risk question version without human identity') END;
END;
--> statement-breakpoint
CREATE TRIGGER question_evidence_authority_immutable
BEFORE UPDATE ON question_evidence_verifications
WHEN NEW.id IS NOT OLD.id OR NEW.question_id IS NOT OLD.question_id
  OR NEW.question_version IS NOT OLD.question_version OR NEW.question_content_sha256 IS NOT OLD.question_content_sha256
  OR NEW.method IS NOT OLD.method OR NEW.risk_class IS NOT OLD.risk_class
  OR NEW.policy_version IS NOT OLD.policy_version OR NEW.evidence_bundle_sha256 IS NOT OLD.evidence_bundle_sha256
  OR NEW.source_count IS NOT OLD.source_count OR NEW.independent_source_count IS NOT OLD.independent_source_count
  OR NEW.primary_source_count IS NOT OLD.primary_source_count OR NEW.verified_at IS NOT OLD.verified_at
  OR NEW.recheck_at IS NOT OLD.recheck_at OR NEW.expires_at IS NOT OLD.expires_at
  OR NEW.created_at IS NOT OLD.created_at OR (OLD.status!='verified' AND NEW.status IS NOT OLD.status)
  OR NEW.updated_at<OLD.updated_at
BEGIN
  SELECT RAISE(ABORT,'machine evidence authority is immutable; create a new reviewed bundle');
END;
