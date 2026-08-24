import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMigrationPlan,
  createIsolatedDatabase,
  loadMigrationPlan,
} from "../../scripts/data-migrations.mjs";
import {
  buildDevelopmentSeed,
  developmentSeedStatements,
  QUESTION_SET_VERSION,
  SCORING_VERSION,
} from "../../db/seeds/development.ts";

const now = Date.UTC(2026, 7, 24, 12);
const subject = "a".repeat(64);
const code = "1".repeat(48);

function applySeed(database, statements) {
  for (const statement of statements) database.prepare(statement.sql).run(...statement.params);
}

async function preparedDatabase(migrationCount = 4) {
  const database = createIsolatedDatabase();
  const plan = await loadMigrationPlan();
  applyMigrationPlan(database, plan.slice(0, migrationCount), { now });
  applySeed(database, developmentSeedStatements(await buildDevelopmentSeed()));
  return { database, plan };
}

function insertAttempt(database, id, subjectHash, status = "in_progress") {
  database.prepare(`INSERT INTO quiz_attempts (
    id, edition_id, anonymous_subject_hash, question_set_version, scoring_version,
    selected_question_versions_json, status, idempotency_key_hash, challenge_code,
    started_at, completed_at, expires_at, version, created_at, updated_at
  ) VALUES (?, 'edition_west_v1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .run(
      id,
      subjectHash,
      QUESTION_SET_VERSION,
      SCORING_VERSION,
      JSON.stringify(Array.from({ length: 12 }, (_, index) => ({ stableId: `west_q${String(index + 1).padStart(2, "0")}`, version: 1 }))),
      status,
      `${id}_idempotency`,
      code,
      now,
      status === "completed" ? now : null,
      now + 86_400_000,
      now,
      now,
    );
}

function insertResult(database, id, attemptId, slug) {
  database.prepare(`INSERT INTO results (
    id, public_slug, attempt_id, edition_id, score, total, tier, scoring_version,
    question_set_version, scoring_snapshot_json, safe_avatar_id, safeguard_version,
    state, expires_at, version, created_at, updated_at
  ) VALUES (?, ?, ?, 'edition_west_v1', 9, 12, 3, ?, ?, ?, 'adjoa',
    'culture-score-v1', 'active', ?, 1, ?, ?)`)
    .run(id, slug, attemptId, SCORING_VERSION, QUESTION_SET_VERSION, JSON.stringify({
      scoringWeightPolicy: "uniform-binary-v1",
      difficultyPolicy: "approved-mixed-v1",
    }), now + 86_400_000, now, now);
}

function insertChallenge(database) {
  insertAttempt(database, "attempt_inviter", "b".repeat(64), "completed");
  insertResult(database, "result_inviter", "attempt_inviter", "9".repeat(48));
  database.prepare(`INSERT INTO challenges (
    id, public_code, inviter_result_id, edition_id, verified_score_to_beat, total,
    scoring_version, safe_inviter_avatar_id, reviewed_inviter_name, state,
    expires_at, version, created_at, updated_at
  ) VALUES ('challenge_review', ?, 'result_inviter', 'edition_west_v1', 9, 12,
    ?, 'adjoa', 'Nia', 'active', ?, 1, ?, ?)`)
    .run(code, SCORING_VERSION, now + 86_400_000, now, now);
}

function insertChallengeAttempt(database, id, attemptId, subjectHash, officialResultId = null, challengeId = "challenge_review") {
  database.prepare(`INSERT INTO challenge_attempts (
    id, challenge_id, recipient_attempt_id, recipient_subject_hash, official_result_id,
    is_official_comparison, idempotency_key_hash, scoring_version, outcome, state, accepted_at, completed_at,
    expires_at, version, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .run(
      id,
      challengeId,
      attemptId,
      subjectHash,
      officialResultId,
      officialResultId ? 1 : 0,
      `${id}_idempotency`,
      SCORING_VERSION,
      officialResultId ? "tied" : "pending",
      officialResultId ? "completed" : "accepted",
      now,
      officialResultId ? now : null,
      now + 86_400_000,
      now,
      now,
    );
}

function insertSecondChallenge(database) {
  database.prepare(`INSERT INTO challenges (
    id, public_code, inviter_result_id, edition_id, verified_score_to_beat, total,
    scoring_version, safe_inviter_avatar_id, reviewed_inviter_name, state,
    expires_at, version, created_at, updated_at
  ) VALUES ('challenge_review_two', ?, 'result_inviter', 'edition_west_v1', 9, 12,
    ?, 'adjoa', 'Nia', 'active', ?, 1, ?, ?)`)
    .run("2".repeat(48), SCORING_VERSION, now + 86_400_000, now, now);
}

test("Prompt 11 migration applies to empty and upgraded databases and is repeatable", async () => {
  const plan = await loadMigrationPlan();
  assert.equal(plan.length, 4);
  assert.equal(plan[3].id, "0003_clever_joshua_kane");
  for (const previousCount of [0, 1, 2, 3]) {
    const database = createIsolatedDatabase();
    try {
      if (previousCount > 0) applyMigrationPlan(database, plan.slice(0, previousCount), { now });
      const applied = applyMigrationPlan(database, plan, { now }).applied;
      assert.deepEqual(applied, plan.slice(previousCount).map((migration) => migration.id));
      assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, []);
      const columns = database.prepare("SELECT name FROM pragma_table_info('challenge_attempts')").all().map((row) => row.name);
      assert.ok(columns.includes("recipient_subject_hash"));
      assert.ok(columns.includes("official_result_id"));
      assert.ok(columns.includes("is_official_comparison"));
    } finally { database.close(); }
  }
});

test("historical challenge attempts remain valid with null comparison fields", async () => {
  const { database, plan } = await preparedDatabase(3);
  try {
    insertChallenge(database);
    insertAttempt(database, "attempt_historical", subject);
    database.prepare(`INSERT INTO challenge_attempts (
      id, challenge_id, recipient_attempt_id, idempotency_key_hash, scoring_version,
      outcome, state, accepted_at, expires_at, version, created_at, updated_at
    ) VALUES ('challenge_attempt_historical','challenge_review','attempt_historical',
      'historical_idempotency',?,'pending','accepted',?,?,1,?,?)`)
      .run(SCORING_VERSION, now, now + 86_400_000, now, now);
    applyMigrationPlan(database, plan, { now });
    const row = database.prepare(`SELECT recipient_subject_hash, official_result_id, is_official_comparison
      FROM challenge_attempts WHERE id='challenge_attempt_historical'`).get();
    assert.deepEqual({ ...row }, { recipient_subject_hash: null, official_result_id: null, is_official_comparison: 0 });
  } finally { database.close(); }
});

test("official comparison indexes reject duplicate recipient/challenge and duplicate result", async () => {
  const { database } = await preparedDatabase();
  try {
    insertChallenge(database);
    insertAttempt(database, "attempt_one", subject, "completed");
    insertResult(database, "result_one", "attempt_one", "7".repeat(48));
    insertChallengeAttempt(database, "challenge_attempt_one", "attempt_one", subject, "result_one");

    insertAttempt(database, "attempt_two", subject, "completed");
    insertResult(database, "result_two", "attempt_two", "8".repeat(48));
    assert.throws(
      () => insertChallengeAttempt(database, "challenge_attempt_two", "attempt_two", subject, "result_two"),
      /challenge_attempts_official_recipient_uq|UNIQUE constraint/,
    );

    insertSecondChallenge(database);
    assert.throws(
      () => insertChallengeAttempt(database, "challenge_attempt_three", "attempt_one", subject, "result_one", "challenge_review_two"),
      /challenge_attempts_official_result_uq|UNIQUE constraint/,
    );
  } finally { database.close(); }
});

test("official result foreign key rejects a missing result", async () => {
  const { database } = await preparedDatabase();
  try {
    insertChallenge(database);
    insertAttempt(database, "attempt_recipient", subject);
    assert.throws(
      () => insertChallengeAttempt(database, "challenge_attempt_invalid", "attempt_recipient", subject, "result_missing"),
      /official comparison requires an authoritative subject and matching result|FOREIGN KEY/,
    );
  } finally { database.close(); }
});

test("official result deletion clears the nullable comparison link", async () => {
  const { database } = await preparedDatabase();
  try {
    insertChallenge(database);
    insertAttempt(database, "attempt_recipient", subject, "completed");
    insertResult(database, "result_recipient", "attempt_recipient", "6".repeat(48));
    insertChallengeAttempt(database, "challenge_attempt_recipient", "attempt_recipient", subject, "result_recipient");

    database.prepare("DELETE FROM results WHERE id='result_recipient'").run();
    const row = database.prepare(`SELECT official_result_id, is_official_comparison
      FROM challenge_attempts WHERE id='challenge_attempt_recipient'`).get();
    assert.deepEqual({ ...row }, { official_result_id: null, is_official_comparison: 1 });
  } finally { database.close(); }
});

test("the durable official marker cannot be cleared, swapped or reclaimed after result deletion", async () => {
  const { database } = await preparedDatabase();
  try {
    insertChallenge(database);
    insertAttempt(database, "attempt_one", subject, "completed");
    insertResult(database, "result_one", "attempt_one", "7".repeat(48));
    insertChallengeAttempt(database, "challenge_attempt_one", "attempt_one", subject, "result_one");

    insertAttempt(database, "attempt_two", subject, "completed");
    insertResult(database, "result_two", "attempt_two", "8".repeat(48));
    assert.throws(
      () => database.prepare("UPDATE challenge_attempts SET official_result_id='result_two' WHERE id='challenge_attempt_one'").run(),
      /official comparison result cannot be replaced/,
    );

    database.prepare("DELETE FROM results WHERE id='result_one'").run();
    assert.throws(
      () => database.prepare("UPDATE challenge_attempts SET is_official_comparison=0 WHERE id='challenge_attempt_one'").run(),
      /official comparison marker is immutable/,
    );
    assert.throws(
      () => database.prepare("UPDATE challenge_attempts SET official_result_id='result_two' WHERE id='challenge_attempt_one'").run(),
      /official comparison result cannot be replaced/,
    );
    assert.throws(
      () => insertChallengeAttempt(database, "challenge_attempt_two", "attempt_two", subject, "result_two"),
      /challenge_attempts_official_recipient_uq|UNIQUE constraint/,
    );
  } finally { database.close(); }
});

test("official claims require a valid authoritative subject and matching result", async () => {
  const { database } = await preparedDatabase();
  try {
    insertChallenge(database);
    insertAttempt(database, "attempt_recipient", subject, "completed");
    insertResult(database, "result_recipient", "attempt_recipient", "6".repeat(48));
    assert.throws(
      () => insertChallengeAttempt(database, "challenge_attempt_bad_subject", "attempt_recipient", "A".repeat(64), "result_recipient"),
      /official comparison requires an authoritative subject and matching result/,
    );

    insertAttempt(database, "attempt_other", "c".repeat(64), "completed");
    assert.throws(
      () => insertChallengeAttempt(database, "challenge_attempt_mismatch", "attempt_other", "c".repeat(64), "result_recipient"),
      /official comparison requires an authoritative subject and matching result/,
    );
  } finally { database.close(); }
});

test("replay rows remain non-official", async () => {
  const { database } = await preparedDatabase();
  try {
    insertChallenge(database);
    insertAttempt(database, "attempt_official", subject, "completed");
    insertResult(database, "result_official", "attempt_official", "7".repeat(48));
    insertChallengeAttempt(database, "challenge_attempt_official", "attempt_official", subject, "result_official");
    insertAttempt(database, "attempt_replay", subject, "completed");
    insertChallengeAttempt(database, "challenge_attempt_replay", "attempt_replay", subject);
    const replay = database.prepare(`SELECT is_official_comparison, official_result_id
      FROM challenge_attempts WHERE id='challenge_attempt_replay'`).get();
    assert.deepEqual({ ...replay }, { is_official_comparison: 0, official_result_id: null });
  } finally { database.close(); }
});
