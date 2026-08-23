# Durable data dictionary

Status: Prompt 7 local foundation only

Hosting target: ChatGPT Sites

Storage state: inactive. Repository configuration has no D1 or R2 binding. This document describes a future D1-compatible model and does not claim that any durable record is being written.

## Conventions

- SQLite table and column names use snake case. TypeScript projections use camel case.
- All times are UTC epoch milliseconds unless a field is explicitly an ISO calendar date such as `challenge_date`.
- Internal `id` values are opaque and never used in public URLs.
- Public result slugs, challenge codes and party codes are independent 192-bit lowercase hexadecimal values. The application validator requires exactly 48 hexadecimal characters.
- `version` is the row-shape or mutable-record version. Question, scoring, rule and generation versions are separate named fields.
- JSON fields must pass SQLite JSON validation and central TypeScript shape validation before write.
- Private photos, original filenames, raw sessions, deletion tokens, full URLs, full user agents and secrets are not columns in this schema.
- A question is playable only when `publication_status = 'published'` and `source_review_status = 'approved'`. Published means product release state. Approved means source and cultural review state. Both are required.

## Common lifecycle fields

Where applicable, `created_at` and `updated_at` record UTC lifecycle times, `expires_at` schedules retention or public availability, `revoked_at` ends public authority without erasing the audit record, `anonymized_at` records removal of identity linkage, and `deleted_at` marks deletion or tombstoning. State checks constrain each table to its documented lifecycle.

## Prompt 8 local identity and media contracts

These contracts do not add tables or activate storage.

| Contract | Fields or representation | Lifetime and authority | Prohibited destinations |
| --- | --- | --- | --- |
| Anonymous functional session | Version `1`, 128-bit lowercase hexadecimal raw ID, `createdAt`, `expiresAt` | Tab-scoped `sessionStorage`, 24 hours maximum, non-authoritative; rotated after expiry and user-clearable | URLs, metadata, share or nomination links, diagnostics, logs, events, recovery, D1 and R2. Any later durable subject must use an approved server-side pseudonymous or salted-hash representation |
| Reviewed display name | Optional NFC string, trimmed and internal whitespace collapsed, at most 30 grapheme clusters | In-memory for the current page only | Recovery, analytics, URLs, filenames, media keys and unreviewed public projection. Controls, null, unsafe invisible or bidi formatting and angle brackets are invalid |
| Approved avatar ID | One of the 12 stable IDs in `app/avatarRegistry.ts` | Safe local and public presentation identifier; invalid or retired IDs resolve to the default allowlisted avatar | Presentation markup and arbitrary remote URLs |
| Original photo | Function-local `File` and byte buffer | Only during validation and decode; never authoritative | All persistence, URLs, events, logs, metadata, public projections, D1 and R2 |
| Sanitised private photo | Browser-created JPEG, maximum 1600 px side, quality 0.90, maximum 3 MB, in-memory Blob and object URL | At most 30 minutes and cleared earlier on removal, replacement, avatar choice, restart, failure, cancellation or unmount | Recovery, analytics, query or share URLs, Open Graph, dynamic public metadata, challenge preview, server response, D1, R2 and media keys |
| Deletion credential verifier | Version, internal target record ID, record-bound SHA-256 token hash, issue and expiry time, rotation | Proposed D1-private service state; bearer issued once, verifier expires after 30 days | Raw bearer-token storage, public projections, analytics, logs and URLs |

The current schema has `results.deletion_token_hash`, lifecycle states, anonymisation, revocation and deletion timestamps, and operation idempotency hashes needed for later repository integration. `db/deletionReadiness.ts` supplies the tested cryptographic service contract only. No migration or endpoint is activated by Prompt 8.

## Tables

### `quiz_editions`

Purpose: versioned registry of the five approved regional editions.

Fields: `id`, `edition_key` (west, east, central, north or south), `name`, `region` descriptor, `version`, `status` (active or retired), `created_at`, `updated_at`, `retired_at`.

Relationships: parent of questions, attempts, results, challenges, daily challenges, seals, parties and region-scoped media.

Indexes: `quiz_editions_key_version_uq` uniquely resolves a version; `quiz_editions_status_idx` finds active editions.

Projection: safe edition key and approved display fields may be public. Internal ID and lifecycle administration remain private.

### `questions`

Purpose: immutable, versioned question bank.

Fields: `id`, `stable_id`, `version`, `edition_id`, optional `country_scope`, `subregion_scope`, `community_scope`, `category`, optional `difficulty`, `question_kind`, `question_text`, `answer_options_json`, `correct_answer_json`, `explanation`, optional `visual_start` preserving the existing image-option asset offset, `scoring_weight`, `locale`, `publication_status`, `source_review_status`, optional `sensitivity_notes`, `content_hash`, `published_at`, `retired_at`, `created_at`, `updated_at`.

Relationships: belongs to one edition; parent of answers and optional source records.

Indexes: `questions_stable_version_uq`; `questions_playable_idx` for edition and dual playable states; `questions_category_idx` for balanced selection.

Projection: live quiz selection may expose published text, options and explanation. Correct answers, sensitivity notes, unpublished versions and internal IDs are never part of a public result or challenge projection.

### `question_sources`

Purpose: reviewable evidence and claim linkage.

Fields: `id`, optional `question_id`, `title`, `organisation_or_author`, `url_or_reference`, optional `publication_date`, `access_date`, `source_type`, `review_status`, optional `reviewer`, `review_date`, `relevant_claim`, `version`, `created_at`, `updated_at`.

Relationships: optionally belongs to a specific question. A null question permits a collection-level source pending claim-level review.

Indexes: `question_sources_question_idx`; `question_sources_reference_uq` prevents duplicate claim links.

Projection: approved citation title, organisation and reference may be public. Reviewer identity and review administration are owner-only.

### `quiz_attempts`

Purpose: private server-authoritative attempt state, separate from a completed result.

Fields: `id`, `edition_id`, optional `anonymous_subject_hash`, `question_set_version`, `scoring_version`, `selected_question_versions_json`, `status`, `idempotency_key_hash`, optional safe `referral_code` and `challenge_code`, `started_at`, `completed_at`, `expires_at`, `anonymized_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Relationships: belongs to an edition; parent of answers; linked one-to-one from a result; may be linked from a challenge attempt and referral event.

Indexes: `quiz_attempts_idempotency_uq`; `quiz_attempts_subject_idx`; `quiz_attempts_expiry_idx`; `quiz_attempts_challenge_idx`.

Projection: `PrivateAttemptData` requires private authorisation. No attempt field appears in public result or challenge data.

### `answers`

Purpose: authoritative selected option identifiers and awarded score for audit and recomputation.

Fields: `id`, `attempt_id`, `question_id`, `question_version`, `selected_option_ids_json`, `is_correct`, `score_awarded`, `answered_at`, `version`, `created_at`, `updated_at`.

Relationships: belongs to one attempt and one exact question version.

Indexes: `answers_attempt_question_uq` prevents duplicate answers; `answers_attempt_idx` reconstructs order.

Projection: private only. Answer text and free text are not stored.

### `results`

Purpose: immutable official scoring snapshot and optional safe public result.

Fields: `id`, `public_slug`, `attempt_id`, `edition_id`, `score`, `total`, `tier`, `scoring_version`, `question_set_version`, `scoring_snapshot_json`, optional `safe_avatar_id`, optional `reviewed_display_name`, `safeguard_version`, `state`, `expires_at`, `revoked_at`, `anonymized_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Relationships: one result per attempt; parent of challenges, mastery seals, media and optional party-player completion.

Indexes: `results_public_slug_uq`; `results_attempt_uq`; `results_public_lookup_idx`; `results_edition_created_idx`.

Integrity: `results_scoring_immutable` aborts any update to the attempt, edition, score, total, tier, scoring version, question-set version or scoring snapshot.

`results_public_slug_format` rejects short, uppercase or non-hexadecimal public slugs before insertion.

Projection: `PublicResultData` contains only slug, edition, score, total, tier, safe avatar, scoring version, safeguard, creation and optional expiry, plus a reviewed display name only when present. Expired, revoked, anonymized and deleted states return no public projection.

### `challenges`

Purpose: safe invitation based on a verified result.

Fields: `id`, `public_code`, optional `inviter_result_id`, `edition_id`, `verified_score_to_beat`, `total`, `scoring_version`, optional `safe_inviter_avatar_id`, optional `reviewed_inviter_name`, nullable `creation_idempotency_key_hash`, nullable `revocation_token_hash`, `state`, optional `use_limit`, `use_count`, `expires_at`, `revoked_at`, `anonymized_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Relationships: belongs to edition and optional inviter result; parent of challenge attempts; optional event and media linkage.

Indexes: `challenges_public_code_uq`; `challenges_creation_idempotency_hash_uq` (unique, partial where non-null); `challenges_revocation_token_hash_uq` (unique, partial where non-null); `challenges_lookup_idx`; `challenges_inviter_idx`.

Projection: `TrustedChallengeEntryData` contains only public code, edition, verified score and total, compatible scoring version, safe avatar, reviewed inviter name and expiry. A crawler read never creates acceptance.

`challenges_public_code_format` rejects guessable short codes and malformed codes before insertion.

New challenge creation requires both verifier fields to be exactly 64 lowercase hexadecimal characters at the application boundary. Only domain-separated SHA-256 hashes are stored. The database columns remain nullable solely for compatibility with historical rows, and a historical row without a revocation verifier cannot be revoked by token.

### `challenge_attempts`

Purpose: idempotent explicit acceptance and completion comparison.

Fields: `id`, `challenge_id`, `recipient_attempt_id`, `idempotency_key_hash`, `scoring_version`, `outcome`, `state`, `accepted_at`, `completed_at`, `expires_at`, `anonymized_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Relationships: belongs to a challenge and private recipient attempt.

Indexes: `challenge_attempts_challenge_attempt_uq`; `challenge_attempts_idempotency_uq`; `challenge_attempts_challenge_idx`.

Projection: private comparison state only. A later result page may expose an outcome label through a separate safe composition.

### `referral_events`

Purpose: honest referral-funnel facts.

Fields: `id`, `referral_code`, optional `challenge_id`, optional `attempt_id`, `event_type`, `source`, optional `anonymous_subject_hash`, `occurred_at`, `expires_at`, `anonymized_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Event values: link created, referred visit received, challenge accepted, quiz started and quiz completed.

Indexes: `referral_events_code_time_idx`; `referral_events_retention_idx`.

Projection: owner-only aggregate analytics. Raw events never appear publicly.

### `share_events`

Purpose: honest share-interface facts without claiming delivery or publication.

Fields: `id`, optional `result_id`, optional `challenge_id`, `event_type`, `channel`, optional `anonymous_subject_hash`, `occurred_at`, `expires_at`, `anonymized_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Event values: share interface selected, share handoff attempted and link copied. There is intentionally no sent or published value.

Indexes: `share_events_result_time_idx`; `share_events_retention_idx`.

Projection: owner-only aggregate analytics.

### `daily_challenges`

Purpose: deterministic date and edition selection, inactive until its feature is approved.

Fields: `id`, `challenge_date`, `edition_id`, `question_set_version`, `deterministic_seed_hash`, `selected_question_versions_json`, `state`, `expires_at`, `version`, `created_at`, `updated_at`.

Indexes: `daily_challenges_date_edition_uq`; `daily_challenges_state_date_idx`.

Projection: active date, edition and safe question selection only after the daily-challenge feature is enabled.

### `streaks`

Purpose: privacy-minimised continuity record linked to a hashed approved anonymous identity.

Fields: `id`, `anonymous_subject_hash`, `streak_type`, `current_count`, `longest_count`, optional `last_qualifying_date`, `rule_version`, `expires_at`, `anonymized_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Indexes: `streaks_subject_type_uq`; `streaks_expiry_idx`.

Projection: private functional state only.

### `mastery_seals`

Purpose: auditable seal under the exact rule and result that qualified.

Fields: `id`, `anonymous_subject_hash`, `edition_id`, `result_id`, `rule_version`, `earned_at`, `state`, `revoked_at`, `anonymized_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Indexes: `mastery_seals_subject_edition_rule_uq`; `mastery_seals_subject_idx`.

Projection: private mastery state; a public composition may show an approved seal count without identity linkage.

### `parties`

Purpose: future capped party session.

Fields: `id`, `public_code`, private `host_control_token_hash`, `edition_id`, `max_players` from 2 to 20, `leaderboard_rule_version`, `state`, `starts_at`, `closed_at`, `expires_at`, `revoked_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Indexes: `parties_public_code_uq`; `parties_lookup_idx`.

Projections: `PartyHostData` requires the private host credential and includes host control state. Public player routes never expose the token or its hash.

`parties_public_code_format` applies the same 192-bit public-code rule.

### `party_players`

Purpose: future safe participant and deterministic leaderboard row.

Fields: `id`, `party_id`, opaque `player_public_id`, `safe_avatar_id`, optional `reviewed_display_name`, optional `result_id`, optional `score`, `rank_tie_breaker`, `state`, `joined_at`, `completed_at`, `anonymized_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Indexes: `party_players_party_public_uq`; `party_players_party_result_uq`; `party_players_leaderboard_idx` orders score, completion and opaque tiebreak.

Projection: `PartyPlayerPublicData` contains only public player ID, safe avatar, reviewed display name if allowed, score, position and safe state.

### `media_assets`

Purpose: metadata for future R2-generated media. Binary bytes do not live in D1.

Fields: `id`, `object_key`, `media_type`, `owner_type`, `owner_id`, optional `result_id`, optional `edition_id`, `width`, `height`, `mime_type`, `byte_size`, `content_hash`, `generation_version`, `privacy_classification`, `state`, `expires_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Indexes: `media_assets_object_key_uq`; `media_assets_owner_idx`; `media_assets_result_idx`; `media_assets_expiry_idx`.

Object-key contract: `generated/{edition}/{YYYY}/{MM}/{sha256}-v{generation}.{extension}`. Names, emails, filenames, raw sessions, queries and secrets fail validation.

Projection: only `safe_public`, ready and unexpired metadata may later resolve to a public URL. Private photos remain excluded by default.

### `consent_preferences`

Purpose: remember versioned privacy choices without unnecessary identity.

Fields: `id`, `anonymous_subject_hash`, `notice_version`, `category_version`, required `strictly_functional`, `first_party_statistical`, `marketing`, `decided_at`, `withdrawn_at`, `expires_at`, `anonymized_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Indexes: `consent_preferences_subject_notice_uq`; `consent_preferences_expiry_idx`.

Projection: private preference only. Withdrawal sets optional categories false and records `withdrawn_at`; functional operation remains available.

### `analytics_events`

Purpose: future first-party, consent-aware, privacy-minimised measurement.

Fields: `id`, allowlisted `event_name`, bounded `properties_json`, optional `anonymous_subject_hash`, optional `consent_notice_version`, `bot_classification`, `occurred_at`, `expires_at`, `anonymized_at`, `deleted_at`, `version`, `created_at`, `updated_at`.

Indexes: `analytics_events_name_time_idx`; `analytics_events_retention_idx`.

Projection: `OwnerAnalyticsData` is owner-only. Public output, scoring and entitlements do not consume raw analytics.

### `feature_flag_overrides`

Purpose: expiring, auditable, server-authoritative owner override. No public mutation endpoint exists.

Fields: `id`, registered `flag_name`, `enabled`, `scope_type`, optional hashed `scope_value_hash`, `reason`, private `created_by_owner_id`, `expires_at`, `revoked_at`, `version`, `created_at`, `updated_at`.

Indexes: `feature_flag_overrides_scope_uq`; `feature_flag_overrides_active_idx`.

Projection: owner-only. Production code defaults remain authoritative when no valid record exists. The validator rejects an enabled commerce override on ChatGPT Sites.

### `schema_migrations`

Purpose: local and future migration-order evidence.

Fields: `migration_id`, SHA-256 `checksum`, `applied_at`, `runner_version`.

This table is created by the isolated runner before forward migrations. Applied checksum drift fails closed. Rollbacks are never automatic.

## Atomic operation contracts

Cloudflare documents D1 `batch()` as sequential and transactional: one failure aborts or rolls back the full batch. Future server repositories must use prepared statements and one batch for quiz completion/result creation, challenge acceptance, challenge comparison, streak compare-and-set, mastery-seal award and party capacity/join. Read replication sessions provide sequential read consistency but do not replace the write batch.

No active endpoint invokes these contracts in Prompt 7.
