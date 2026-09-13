import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  DataValidationError,
  assertPublicCode,
  assertSafeMediaObjectKey,
  buildMediaObjectKey,
  createOpaquePublicCode,
  toOwnerAnalyticsData,
  toPartyHostData,
  toPrivateAttempt,
  toPublicResult,
  toTrustedChallengeEntry,
  validateAnalyticsEventName,
  validateAnalyticsProperties,
  validateFeatureFlagOverride,
} from "../../db/dataContracts.ts";
import { ATOMICITY_CONTRACT, PARTY_JOIN_CAPACITY_SQL, UnboundDurableRepository } from "../../db/repositories.ts";
import { durableTableNames } from "../../db/schema.ts";
import {
  APPROVED_GAME_DATA_FILE_SHA256,
  assertDevelopmentSeedMatches,
  buildDevelopmentSeed,
  developmentSeedStatements,
} from "../../db/seeds/development.ts";
import { durableStorageReadiness } from "../../db/storageReadiness.ts";
import {
  applyMigrationPlan,
  createIsolatedDatabase,
  loadMigrationPlan,
} from "../../scripts/data-migrations.mjs";

const now = Date.UTC(2026, 7, 23, 12);
const codeA = "a".repeat(48);
const codeB = "b".repeat(48);

async function migratedDatabase() {
  const database = createIsolatedDatabase();
  const plan = await loadMigrationPlan();
  applyMigrationPlan(database, plan, { now });
  return { database, plan };
}

function applySeed(database, statements) {
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const statement of statements) database.prepare(statement.sql).run(...statement.params);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function insertAttempt(database, overrides = {}) {
  const values = {
    id: "attempt_synthetic_0001",
    editionId: "edition_west_v1",
    idempotency: "hash_idempotency_synthetic_0001",
    status: "in_progress",
    ...overrides,
  };
  database.prepare(`INSERT INTO quiz_attempts (
    id, edition_id, question_set_version, scoring_version, selected_question_versions_json,
    status, idempotency_key_hash, started_at, expires_at, version, created_at, updated_at
  ) VALUES (?, ?, 'approved-60-v1', 'binary-exact-set-v1', '[]', ?, ?, ?, ?, 1, ?, ?)`)
    .run(values.id, values.editionId, values.status, values.idempotency, now, now + 86_400_000, now, now);
  return values;
}

function insertResult(database, attempt, overrides = {}) {
  const values = {
    id: "result_synthetic_0001",
    slug: codeA,
    score: 8,
    total: 12,
    tier: 2,
    state: "active",
    ...overrides,
  };
  database.prepare(`INSERT INTO results (
    id, public_slug, attempt_id, edition_id, score, total, tier, scoring_version,
    question_set_version, scoring_snapshot_json, safe_avatar_id, safeguard_version,
    state, expires_at, version, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'binary-exact-set-v1', 'approved-60-v1', '{}', 'amara',
    'culture-score-v1', ?, ?, 1, ?, ?)`)
    .run(values.id, values.slug, attempt.id, attempt.editionId, values.score, values.total, values.tier, values.state, now + 86_400_000, now, now);
  return values;
}

test("migration plan is ordered and checksummed", async () => {
  const plan = await loadMigrationPlan();
  assert.equal(plan.length, 11);
  assert.equal(plan[0].id, "0000_loving_stepford_cuckoos");
  assert.equal(plan[1].id, "0001_same_vertigo");
  assert.equal(plan[2].id, "0002_little_inertia");
  assert.equal(plan[3].id, "0003_clever_joshua_kane");
  assert.equal(plan[4].id, "0004_yellow_bill_hollister");
  assert.equal(plan[5].id, "0005_special_gamma_corps");
  assert.equal(plan[6].id, "0006_regular_paibok");
  assert.equal(plan[7].id, "0007_ancient_yellow_claw");
  assert.equal(plan[8].id, "0008_simple_nocturne");
  assert.equal(plan[9].id, "0009_clammy_shooting_star");
  assert.match(plan[0].checksum, /^[0-9a-f]{64}$/);
});

test("empty database migration, schema tracking, dry-run and repeated execution are safe", async () => {
  const database = createIsolatedDatabase();
  try {
    const plan = await loadMigrationPlan();
    const dryRun = applyMigrationPlan(database, plan, { dryRun: true, now });
    assert.deepEqual(dryRun.pending, plan.map((migration) => migration.id));
    assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='results'").get().count, 0);
    assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, plan.map((migration) => migration.id));
    assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, []);
    assert.equal(database.prepare("SELECT count(*) AS count FROM schema_migrations").get().count, 11);
  } finally {
    database.close();
  }
});

test("upgrade from schema version 0000 to 0001 preserves existing question data", async () => {
  const database = createIsolatedDatabase();
  try {
    const plan = await loadMigrationPlan();
    applyMigrationPlan(database, plan.slice(0, 1), { now });
    database.prepare(`INSERT INTO quiz_editions
      (id, edition_key, name, region, version, status, created_at, updated_at)
      VALUES ('edition_west_v1','west','West Africa','Synthetic scope',1,'active',?,?)`).run(now, now);
    database.prepare(`INSERT INTO questions (
      id, stable_id, version, edition_id, category, question_kind, question_text,
      answer_options_json, correct_answer_json, explanation, scoring_weight, locale,
      publication_status, source_review_status, content_hash, published_at, created_at, updated_at
    ) VALUES (
      'question_west_q01_v1','west_q01',1,'edition_west_v1','SYNTHETIC','single','Synthetic question',
      '[{"id":"o1","text":"Synthetic option"}]','["o1"]','Synthetic explanation',1,'en',
      'published','approved',?, ?, ?, ?
    )`).run("d".repeat(64), now, now, now);
    assert.equal(database.prepare("SELECT count(*) AS count FROM pragma_table_info('questions') WHERE name='visual_start'").get().count, 0);
    assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, plan.slice(1).map((migration) => migration.id));
    const upgraded = database.prepare("SELECT question_text, visual_start FROM questions WHERE stable_id='west_q01'").get();
    assert.deepEqual({ ...upgraded }, { question_text: "Synthetic question", visual_start: null });
  } finally {
    database.close();
  }
});

test("all required tables and indexes exist and commerce is limited to the three approved tables", async () => {
  const { database } = await migratedDatabase();
  try {
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
    for (const table of durableTableNames) assert.ok(tables.includes(table), `missing table ${table}`);
    assert.ok(tables.includes("schema_migrations"));
    assert.deepEqual(tables.filter((table) => /(commerce|payment|order|stripe|card|bank|checkout|subscription|invoice)/i.test(table)).sort(), ["commerce_entitlements", "commerce_orders", "stripe_webhook_events"]);
    const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").all();
    assert.ok(indexes.length >= 42);
  } finally {
    database.close();
  }
});

test("seed reproduces exactly five editions and 60 approved questions", async () => {
  const gameData = await readFile(new URL("../../app/gameData.ts", import.meta.url));
  assert.equal(createHash("sha256").update(gameData).digest("hex"), APPROVED_GAME_DATA_FILE_SHA256);
  const seed = await buildDevelopmentSeed();
  assert.equal(seed.editions.length, 5);
  assert.equal(seed.questions.length, 60);
  assert.match(seed.contentChecksum, /^[0-9a-f]{64}$/);
  assert.equal(new Set(seed.questions.map((question) => question.stableId)).size, 60);
  assert.equal(new Set(seed.questions.map((question) => question.questionText)).size, 60);
  for (const question of seed.questions) {
    assert.equal(question.scoringWeight, 1);
    assert.equal(question.publicationStatus, "published");
    assert.equal(question.sourceReviewStatus, "approved");
    assert.equal(new Set(JSON.parse(question.answerOptionsJson).map((option) => option.text)).size, JSON.parse(question.answerOptionsJson).length);
  }
});

test("development seed is idempotent and detects unexpected content differences", async () => {
  const { database } = await migratedDatabase();
  try {
    const seed = await buildDevelopmentSeed();
    const statements = developmentSeedStatements(seed);
    applySeed(database, statements);
    applySeed(database, statements);
    assert.equal(database.prepare("SELECT count(*) AS count FROM quiz_editions").get().count, 5);
    assert.equal(database.prepare("SELECT count(*) AS count FROM questions").get().count, 60);
    assert.throws(() => database.prepare("UPDATE questions SET question_text = 'tampered' WHERE stable_id = 'west_q01'").run(), /immutable/);
    const storedRows = database.prepare(`SELECT stable_id, question_text, answer_options_json,
      correct_answer_json, explanation, visual_start, scoring_weight, content_hash FROM questions ORDER BY stable_id`).all();
    assert.doesNotThrow(() => assertDevelopmentSeedMatches(storedRows, seed));
    assert.throws(() => assertDevelopmentSeedMatches(storedRows.map((row) => row.stable_id === "west_q01" ? { ...row, question_text: "tampered" } : row), seed), /Seed integrity mismatch for west_q01/);
  } finally {
    database.close();
  }
});

test("foreign keys, enum checks, JSON checks and score boundaries are enforced", async () => {
  const { database } = await migratedDatabase();
  try {
    assert.throws(() => insertAttempt(database), /FOREIGN KEY/);
    const seed = await buildDevelopmentSeed();
    applySeed(database, developmentSeedStatements(seed));
    assert.throws(() => insertAttempt(database, { status: "forged" }), /CHECK constraint/);
    const attempt = insertAttempt(database);
    assert.throws(() => database.prepare(`INSERT INTO answers (
      id, attempt_id, question_id, question_version, selected_option_ids_json,
      is_correct, score_awarded, answered_at, version, created_at, updated_at
    ) VALUES ('answer_synthetic_0001', ?, 'question_west_q01_v1', 2, '["o2"]', 1, 1, ?, 1, ?, ?)`)
      .run(attempt.id, now, now, now), /missing question version/);
    assert.throws(() => insertResult(database, attempt, { score: 13 }), /CHECK constraint/);
    assert.throws(() => insertResult(database, attempt, { slug: "AB72K" }), /192-bit/);
    assert.throws(() => database.prepare("UPDATE quiz_attempts SET selected_question_versions_json = 'bad' WHERE id = ?").run(attempt.id), /(CHECK constraint|selection authority is immutable)/);
  } finally {
    database.close();
  }
});

test("duplicate official completion, result slug and idempotency keys are rejected", async () => {
  const { database } = await migratedDatabase();
  try {
    const seed = await buildDevelopmentSeed();
    applySeed(database, developmentSeedStatements(seed));
    const attempt = insertAttempt(database);
    insertResult(database, attempt);
    assert.throws(() => insertResult(database, attempt, { id: "result_synthetic_0002", slug: codeB }), /UNIQUE constraint/);
    assert.throws(() => insertAttempt(database, { id: "attempt_synthetic_0002" }), /UNIQUE constraint/);
  } finally {
    database.close();
  }
});

test("completed result scoring snapshot is immutable", async () => {
  const { database } = await migratedDatabase();
  try {
    const seed = await buildDevelopmentSeed();
    applySeed(database, developmentSeedStatements(seed));
    const attempt = insertAttempt(database);
    insertResult(database, attempt);
    assert.throws(() => database.prepare("UPDATE results SET score=9 WHERE id='result_synthetic_0001'").run(), /immutable/);
    database.prepare("UPDATE results SET state='revoked', revoked_at=?, updated_at=? WHERE id='result_synthetic_0001'").run(now, now);
    assert.equal(database.prepare("SELECT state FROM results WHERE id='result_synthetic_0001'").get().state, "revoked");
  } finally {
    database.close();
  }
});

test("public result projection omits private fields and hides expired, revoked and anonymized records", () => {
  const record = {
    id: "result_synthetic_0001",
    publicSlug: codeA,
    editionKey: "west",
    score: 9,
    total: 12,
    tier: 3,
    scoringVersion: "binary-exact-set-v1",
    safeAvatarId: "amara",
    reviewedDisplayName: null,
    safeguardVersion: "culture-score-v1",
    visibility: "public",
    state: "active",
    createdAt: now,
    expiresAt: now + 1000,
    anonymousSubjectHash: "private-subject-hash",
    deletionTokenHash: "private-deletion-hash",
    scoringSnapshotJson: "{}",
  };
  const projection = toPublicResult(record, now);
  assert.deepEqual(Object.keys(projection).sort(), [
    "createdAt", "displayName", "edition", "expiresAt", "resultSlug", "safeAvatarId", "safeguard",
    "score", "scoringVersion", "tier", "total",
  ]);
  assert.equal(projection.displayName, "A challenger");
  assert.equal(toPublicResult({ ...record, visibility: "private" }, now), null);
  assert.equal(toPublicResult({ ...record, state: "revoked" }, now), null);
  assert.equal(toPublicResult({ ...record, state: "anonymized" }, now), null);
  assert.equal(toPublicResult({ ...record, expiresAt: now }, now), null);
});

test("private and owner-only projections fail closed without authorization", () => {
  const privateRecord = {
    id: "attempt_synthetic_0001",
    editionKey: "west",
    anonymousSubjectHash: "subject_hash",
    questionSetVersion: "approved-60-v1",
    scoringVersion: "binary-exact-set-v1",
    selectedQuestionVersionsJson: '[{"stableId":"west_q01","version":1}]',
    status: "in_progress",
    startedAt: now,
    completedAt: null,
    expiresAt: now + 1000,
  };
  assert.throws(() => toPrivateAttempt(privateRecord, false), /requires server-side authorization/);
  assert.equal(toPrivateAttempt(privateRecord, true).selectedQuestionVersions.length, 1);
  assert.throws(() => toOwnerAnalyticsData({
    eventName: "quiz_completed",
    propertiesJson: '{"edition":"west"}',
    botClassification: "human",
    occurredAt: now,
  }, false), /requires owner authorization/);
  assert.throws(() => toPartyHostData({
    partyCode: codeA,
    hostControlTokenHash: "e".repeat(64),
    edition: "west",
    maxPlayers: 20,
    playerCount: 0,
    state: "open",
    expiresAt: now + 1000,
  }, false), /requires host authorization/);
});

test("public codes are high-entropy shape, lowercase and unique in a synthetic sample", () => {
  const codes = new Set(Array.from({ length: 1000 }, () => createOpaquePublicCode()));
  assert.equal(codes.size, 1000);
  for (const code of codes) assert.equal(assertPublicCode(code), code);
  assert.throws(() => assertPublicCode("AB72K"), DataValidationError);
});

test("analytics taxonomy and properties reject arbitrary or identifying payloads", () => {
  assert.equal(validateAnalyticsEventName("quiz_completed"), "quiz_completed");
  assert.throws(() => validateAnalyticsEventName("message_sent"), DataValidationError);
  assert.deepEqual(validateAnalyticsProperties({ edition: "west", tier: 2 }), { edition: "west", tier: 2 });
  assert.throws(() => validateAnalyticsProperties({ name: "Synthetic Person" }), DataValidationError);
  assert.throws(() => validateAnalyticsProperties({ full_url: "https://example.invalid/private" }), DataValidationError);
  assert.throws(() => validateAnalyticsProperties({ edition: "x".repeat(2100) }), DataValidationError);
});

test("consent withdrawal can be recorded without disabling functional storage", async () => {
  const { database } = await migratedDatabase();
  try {
    database.prepare(`INSERT INTO consent_preferences (
      id, anonymous_subject_hash, notice_version, category_version, strictly_functional,
      first_party_statistical, marketing, decided_at, withdrawn_at, expires_at,
      version, created_at, updated_at
    ) VALUES ('consent_synthetic_0001','subject_hash_synthetic','notice-v1','categories-v1',1,0,0,?,?,?,?,?,?)`)
      .run(now, now, now + 1000, 1, now, now);
    const consent = database.prepare("SELECT strictly_functional, first_party_statistical, marketing, withdrawn_at FROM consent_preferences").get();
    assert.deepEqual({ ...consent }, { strictly_functional: 1, first_party_statistical: 0, marketing: 0, withdrawn_at: now });
    assert.throws(() => database.prepare("UPDATE consent_preferences SET strictly_functional = 0").run(), /CHECK constraint/);
  } finally {
    database.close();
  }
});

test("feature overrides are owner-only contracts and commerce stays blocked on Sites", async () => {
  assert.deepEqual(validateFeatureFlagOverride({
    flagName: "challenges", enabled: true, scopeType: "owner_preview", reason: "Synthetic preview",
    createdByOwnerId: "owner_synthetic_0001", expiresAt: now + 1000, now, hostingTarget: "chatgpt-sites",
  }), { flagName: "challenges", enabled: true });
  assert.throws(() => validateFeatureFlagOverride({
    flagName: "commerce", enabled: true, scopeType: "global", reason: "Not allowed",
    createdByOwnerId: "owner_synthetic_0001", expiresAt: now + 1000, now, hostingTarget: "chatgpt-sites",
  }), /commerce cannot be enabled/);
  const repository = new UnboundDurableRepository();
  assert.equal(repository.storageActive, false);
  assert.throws(() => repository.getFeatureFlagOverride("challenges", null), /Durable storage is not configured/);
});

test("media object keys exclude identity, filenames, raw sessions, queries and secrets", () => {
  const key = buildMediaObjectKey({
    edition: "east",
    contentHash: "c".repeat(64),
    generationVersion: "2.1",
    extension: "png",
    createdAt: new Date(now),
  });
  assert.equal(key, `generated/east/2026/08/${"c".repeat(64)}-v2.1.png`);
  assert.equal(assertSafeMediaObjectKey(key), key);
  for (const unsafe of ["generated/east/person@example.com.png", "generated/east/photo.jpg", "generated/east/x.png?token=secret", "../private.png"]) {
    assert.throws(() => assertSafeMediaObjectKey(unsafe), DataValidationError);
  }
});

test("challenge crawlers cannot create acceptance because no public write endpoint exists", async () => {
  const repository = new UnboundDurableRepository();
  assert.throws(() => repository.getTrustedChallengeEntry(codeA), /Durable storage is not configured/);
  assert.equal("acceptChallenge" in repository, false);
});

test("trusted challenge projections hide expired, revoked, exhausted and incompatible states", () => {
  const challenge = {
    publicCode: codeA,
    editionKey: "west",
    verifiedScoreToBeat: 8,
    total: 12,
    scoringVersion: "binary-exact-set-v1",
    safeInviterAvatarId: "amara",
    reviewedInviterName: null,
    state: "active",
    useLimit: 2,
    useCount: 0,
    expiresAt: now + 1000,
  };
  assert.equal(toTrustedChallengeEntry(challenge, now).verifiedScoreToBeat, 8);
  assert.equal(toTrustedChallengeEntry({ ...challenge, state: "revoked" }, now), null);
  assert.equal(toTrustedChallengeEntry({ ...challenge, expiresAt: now }, now), null);
  assert.equal(toTrustedChallengeEntry({ ...challenge, useCount: 2 }, now), null);
});

test("party capacity is constrained and an atomic join contract is present", async () => {
  const { database } = await migratedDatabase();
  try {
    const seed = await buildDevelopmentSeed();
    applySeed(database, developmentSeedStatements(seed));
    assert.throws(() => database.prepare(`INSERT INTO parties (
      id, public_code, host_control_token_hash, edition_id, max_players,
      leaderboard_rule_version, state, expires_at, version, created_at, updated_at
    ) VALUES ('party_synthetic_0001', ?, 'host_hash', 'edition_west_v1', 21, 'rank-v1', 'open', ?, 1, ?, ?)`).run(codeA, now + 1000, now, now), /CHECK constraint/);
    database.prepare(`INSERT INTO parties (
      id, public_code, host_control_token_hash, edition_id, max_players,
      leaderboard_rule_version, state, expires_at, version, created_at, updated_at
    ) VALUES ('party_synthetic_0002', ?, 'host_hash', 'edition_west_v1', 20, 'rank-v1', 'open', ?, 1, ?, ?)`).run(codeB, now + 1000, now, now);
    for (let index = 0; index < 21; index += 1) {
      database.prepare(PARTY_JOIN_CAPACITY_SQL).run(
        `party_player_row_${String(index).padStart(4, "0")}`,
        "party_synthetic_0002",
        `player_${String(index).padStart(4, "0")}`,
        "amara",
        null,
        `tie_${String(index).padStart(4, "0")}`,
        now,
      );
    }
    assert.equal(database.prepare("SELECT count(*) AS count FROM party_players WHERE party_id='party_synthetic_0002'").get().count, 20);
    assert.match(ATOMICITY_CONTRACT.join_party_with_capacity, /one D1 batch/);
    assert.equal(Object.keys(ATOMICITY_CONTRACT).length, 7);
  } finally {
    database.close();
  }
});

test("deletion and anonymisation states preserve auditability without public exposure", async () => {
  const { database } = await migratedDatabase();
  try {
    const seed = await buildDevelopmentSeed();
    applySeed(database, developmentSeedStatements(seed));
    const attempt = insertAttempt(database);
    insertResult(database, attempt);
    database.prepare("UPDATE results SET state='anonymized', reviewed_display_name=NULL, safe_avatar_id=NULL, anonymized_at=?, updated_at=? WHERE id=?").run(now, now, "result_synthetic_0001");
    const row = database.prepare("SELECT state, reviewed_display_name, safe_avatar_id, score FROM results WHERE id=?").get("result_synthetic_0001");
    assert.deepEqual({ ...row }, { state: "anonymized", reviewed_display_name: null, safe_avatar_id: null, score: 8 });
  } finally {
    database.close();
  }
});

test("incompatible scoring versions remain explicit rather than silently compared", async () => {
  const { database } = await migratedDatabase();
  try {
    const seed = await buildDevelopmentSeed();
    applySeed(database, developmentSeedStatements(seed));
    const attempt = insertAttempt(database);
    const result = insertResult(database, attempt);
    database.prepare(`INSERT INTO challenges (
      id, public_code, inviter_result_id, edition_id, verified_score_to_beat, total,
      scoring_version, state, expires_at, version, created_at, updated_at
    ) VALUES ('challenge_synthetic_0001', ?, ?, 'edition_west_v1', 8, 12, 'future-score-v2',
      'active', ?, 1, ?, ?)`).run(codeB, result.id, now + 1000, now, now);
    assert.notEqual(
      database.prepare("SELECT scoring_version FROM challenges WHERE id='challenge_synthetic_0001'").get().scoring_version,
      database.prepare("SELECT scoring_version FROM results WHERE id='result_synthetic_0001'").get().scoring_version,
    );
  } finally {
    database.close();
  }
});

test("binding readiness is honest and hosting configuration still has no D1 or R2", async () => {
  const hosting = JSON.parse(await readFile(new URL("../../.openai/hosting.json", import.meta.url), "utf8"));
  assert.deepEqual(durableStorageReadiness, {
    hostingTarget: "chatgpt-sites",
    d1Configured: false,
    r2Configured: false,
    active: false,
    proposedD1Binding: "DB",
    proposedR2Binding: "MEDIA",
  });
  assert.equal(hosting.d1, null);
  assert.equal(hosting.r2, null);
});

test("data-layer commerce schema excludes private media, secrets and financial instruments", async () => {
  const schema = await readFile(new URL("../../db/schema.ts", import.meta.url), "utf8");
  assert.doesNotMatch(schema, /photo_filename|original_photo|raw_session|deletion_token|card_number|bank_detail/i);
  assert.doesNotMatch(schema, /sqliteTable\(["'](?:payments?|cards?|bank_accounts?|invoices?|subscriptions?|customer_profiles?)/i);
  assert.doesNotMatch(schema, /webhook_payload|billing_address|customer_email|customer_name|phone_number|card_number|receipt_content/i);
});
