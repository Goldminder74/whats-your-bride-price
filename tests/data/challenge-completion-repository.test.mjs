import assert from "node:assert/strict";
import test from "node:test";
import { applyMigrationPlan, createIsolatedDatabase, loadMigrationPlan } from "../../scripts/data-migrations.mjs";
import { buildDevelopmentSeed, developmentSeedStatements, QUESTION_SET_VERSION, SCORING_VERSION } from "../../db/seeds/development.ts";
import { ChallengeAcceptanceService, D1ChallengeAcceptanceRepository } from "../../db/challengeAcceptance.ts";
import {
  CHALLENGE_DIFFICULTY_POLICY,
  CHALLENGE_SCORING_WEIGHT_POLICY,
  ChallengeCompletionService,
  D1ChallengeCompletionRepository,
} from "../../db/challengeCompletion.ts";
import { InMemoryChallengeRateLimiter } from "../../db/challengeService.ts";
import { regions } from "../../app/gameData.ts";

const now = Date.UTC(2026, 7, 24, 12);
const code = "1".repeat(48);
const subject = "a".repeat(64);

class LocalStatement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new LocalStatement(this.database, this.sql, values); }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) }, results: [] };
  }
  async first(column) {
    const row = this.database.prepare(this.sql).get(...this.values) || null;
    return column && row ? row[column] : row;
  }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: { changes: 0 } }; }
}

class LocalAtomicDatabase {
  constructor(database) { this.database = database; }
  prepare(sql) { return new LocalStatement(this.database, sql); }
  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function seed(database, statements) {
  for (const statement of statements) database.prepare(statement.sql).run(...statement.params);
}

function selectedQuestions(edition = "west") {
  return JSON.stringify(Array.from({ length: 12 }, (_, index) => ({
    stableId: `${edition}_q${String(index + 1).padStart(2, "0")}`,
    version: 1,
  })));
}

function insertInviterAndChallenge(database) {
  database.prepare(`INSERT INTO quiz_attempts (
    id, edition_id, anonymous_subject_hash, question_set_version, scoring_version,
    selected_question_versions_json, status, idempotency_key_hash, started_at,
    completed_at, expires_at, version, created_at, updated_at
  ) VALUES ('attempt_inviter','edition_west_v1',?, ?, ?, ?, 'completed',
    'inviter_attempt_idempotency', ?, ?, ?, 1, ?, ?)`)
    .run("b".repeat(64), QUESTION_SET_VERSION, SCORING_VERSION, selectedQuestions(), now, now, now + 86_400_000, now, now);
  database.prepare(`INSERT INTO results (
    id, public_slug, attempt_id, edition_id, score, total, tier, scoring_version,
    question_set_version, scoring_snapshot_json, safe_avatar_id, reviewed_display_name,
    safeguard_version, state, expires_at, version, created_at, updated_at
  ) VALUES ('result_inviter', ?, 'attempt_inviter', 'edition_west_v1', 10, 12, 3,
    ?, ?, ?, 'adjoa', 'Nia', 'culture-score-v1', 'active', ?, 1, ?, ?)`)
    .run("9".repeat(48), SCORING_VERSION, QUESTION_SET_VERSION, JSON.stringify({
      scoringWeightPolicy: CHALLENGE_SCORING_WEIGHT_POLICY,
      difficultyPolicy: CHALLENGE_DIFFICULTY_POLICY,
    }), now + 86_400_000, now, now);
  database.prepare(`INSERT INTO challenges (
    id, public_code, inviter_result_id, edition_id, verified_score_to_beat, total,
    scoring_version, safe_inviter_avatar_id, reviewed_inviter_name, state,
    use_limit, use_count, expires_at, version, created_at, updated_at
  ) VALUES ('challenge_review', ?, 'result_inviter', 'edition_west_v1', 10, 12,
    ?, 'adjoa', 'Nia', 'active', 20, 0, ?, 1, ?, ?)`)
    .run(code, SCORING_VERSION, now + 86_400_000, now, now);
}

function correctAnswers(correctCount = 12) {
  return regions.west.questions.map((question, index) => ({
    questionStableId: `west_q${String(index + 1).padStart(2, "0")}`,
    selectedOptionIds: index < correctCount
      ? question.correct.map((option) => `o${option + 1}`)
      : [`o${question.correct.includes(0) ? 2 : 1}`],
  }));
}

async function setup() {
  const database = createIsolatedDatabase();
  applyMigrationPlan(database, await loadMigrationPlan(), { now });
  seed(database, developmentSeedStatements(await buildDevelopmentSeed()));
  insertInviterAndChallenge(database);
  const atomic = new LocalAtomicDatabase(database);
  const acceptance = new ChallengeAcceptanceService(
    new D1ChallengeAcceptanceRepository(atomic),
    new InMemoryChallengeRateLimiter(20),
    { now: () => now, randomSource(bytes) { bytes.fill(4); return bytes; } },
  );
  await acceptance.accept({
    publicCode: code,
    idempotencyKey: "recipient-acceptance-key-0001",
    anonymousSubjectHash: subject,
  });
  return { database, atomic };
}

function completion(atomic) {
  return new ChallengeCompletionService(new D1ChallengeCompletionRepository(atomic), {
    now: () => now + 100,
    randomSource(bytes) { bytes.fill(7); return bytes; },
  });
}

function completionInput(correctCount = 12) {
  return {
    publicCode: code,
    idempotencyKey: "recipient-completion-key-0001",
    anonymousSubjectHash: subject,
    answers: correctAnswers(correctCount),
  };
}

function insertSecondAcceptedAttempt(database) {
  database.prepare(`INSERT INTO quiz_attempts (
    id, edition_id, anonymous_subject_hash, question_set_version, scoring_version,
    selected_question_versions_json, status, idempotency_key_hash, challenge_code,
    started_at, expires_at, version, created_at, updated_at
  ) VALUES ('attempt_recipient_second','edition_west_v1',?, ?, ?, ?, 'in_progress',
    'recipient_second_attempt_idempotency', ?, ?, ?, 1, ?, ?)`)
    .run(subject, QUESTION_SET_VERSION, SCORING_VERSION, selectedQuestions(), code,
      now - 1_000, now + 86_400_000, now - 1_000, now - 1_000);
  database.prepare(`INSERT INTO challenge_attempts (
    id, challenge_id, recipient_attempt_id, recipient_subject_hash,
    idempotency_key_hash, scoring_version, outcome, state, accepted_at,
    expires_at, version, created_at, updated_at
  ) VALUES ('challenge_attempt_second','challenge_review','attempt_recipient_second',?,
    'recipient_second_challenge_idempotency',?,'pending','accepted',?,?,1,?,?)`)
    .run(subject, SCORING_VERSION, now - 1_000, now + 86_400_000, now - 1_000, now - 1_000);
}

test("authoritative completion persists answers, result, official comparison and mastery atomically", async () => {
  const { database, atomic } = await setup();
  try {
    const comparison = await completion(atomic).complete(completionInput(11));
    assert.equal(comparison.outcome, "beat");
    assert.equal(comparison.recipientScore, 11);
    assert.equal(database.prepare("SELECT count(*) AS count FROM answers").get().count, 12);
    assert.equal(database.prepare("SELECT count(*) AS count FROM results WHERE attempt_id != 'attempt_inviter'").get().count, 1);
    const challengeAttempt = database.prepare(`SELECT state, outcome, recipient_subject_hash,
      official_result_id, is_official_comparison FROM challenge_attempts`).get();
    assert.equal(challengeAttempt.state, "completed");
    assert.equal(challengeAttempt.outcome, "beat");
    assert.equal(challengeAttempt.recipient_subject_hash, subject);
    assert.match(challengeAttempt.official_result_id, /^result_/);
    assert.equal(challengeAttempt.is_official_comparison, 1);
    assert.equal(database.prepare("SELECT count(*) AS count FROM mastery_seals").get().count, 1);
    const linked = database.prepare(`SELECT count(*) AS count FROM challenge_attempts ca
      JOIN results r ON r.id=ca.official_result_id AND r.attempt_id=ca.recipient_attempt_id`).get().count;
    assert.equal(linked, 1);
  } finally { database.close(); }
});

test("duplicate and concurrent completion create exactly one official result and answer set", async () => {
  const { database, atomic } = await setup();
  try {
    const service = completion(atomic);
    const [left, right] = await Promise.all([service.complete(completionInput(10)), service.complete(completionInput(10))]);
    assert.deepEqual(left, right);
    assert.equal(database.prepare("SELECT count(*) AS count FROM answers").get().count, 12);
    assert.equal(database.prepare("SELECT count(*) AS count FROM results WHERE attempt_id != 'attempt_inviter'").get().count, 1);
    assert.equal(database.prepare("SELECT count(*) AS count FROM challenge_attempts WHERE is_official_comparison = 1").get().count, 1);
    assert.equal(database.prepare("SELECT count(*) AS count FROM mastery_seals").get().count, 1);
  } finally { database.close(); }
});

test("deleting an official result cannot release the recipient's first-comparison slot", async () => {
  const { database, atomic } = await setup();
  try {
    insertSecondAcceptedAttempt(database);
    const service = completion(atomic);
    assert.equal((await service.complete(completionInput(8))).outcome, "did_not_beat");

    const official = database.prepare(`SELECT id, official_result_id, is_official_comparison
      FROM challenge_attempts WHERE is_official_comparison = 1`).get();
    assert.equal(official.is_official_comparison, 1);
    database.prepare("DELETE FROM results WHERE id = ?").run(official.official_result_id);

    const deleted = database.prepare(`SELECT official_result_id, is_official_comparison
      FROM challenge_attempts WHERE id = ?`).get(official.id);
    assert.deepEqual({ ...deleted }, { official_result_id: null, is_official_comparison: 1 });
    const before = database.prepare(`SELECT
      (SELECT count(*) FROM results WHERE attempt_id != 'attempt_inviter') AS results,
      (SELECT count(*) FROM answers) AS answers,
      (SELECT count(*) FROM mastery_seals) AS seals,
      (SELECT count(*) FROM challenge_attempts WHERE state = 'completed') AS completions`).get();

    const retry = await service.complete({ ...completionInput(9), idempotencyKey: "recipient-completion-key-0002" });
    assert.equal(retry.outcome, "unavailable");
    assert.equal(retry.recipientScore, 8);
    assert.equal(retry.maximumScore, 12);
    assert.equal(retry.inviterScore, null);
    const after = database.prepare(`SELECT
      (SELECT count(*) FROM results WHERE attempt_id != 'attempt_inviter') AS results,
      (SELECT count(*) FROM answers) AS answers,
      (SELECT count(*) FROM mastery_seals) AS seals,
      (SELECT count(*) FROM challenge_attempts WHERE state = 'completed') AS completions`).get();
    assert.deepEqual({ ...after }, { ...before });
    assert.equal(database.prepare("SELECT count(*) AS count FROM challenge_attempts WHERE is_official_comparison = 1").get().count, 1);
    assert.deepEqual(
      { ...database.prepare("SELECT state, is_official_comparison FROM challenge_attempts WHERE id='challenge_attempt_second'").get() },
      { state: "accepted", is_official_comparison: 0 },
    );
  } finally { database.close(); }
});

test("configured replay completes only a non-official row", async () => {
  const { database, atomic } = await setup();
  try {
    insertSecondAcceptedAttempt(database);
    assert.equal((await completion(atomic).complete(completionInput(8))).outcome, "did_not_beat");
    const replay = new ChallengeCompletionService(new D1ChallengeCompletionRepository(atomic), {
      now: () => now + 200,
      allowReplay: true,
      randomSource(bytes) { bytes.fill(8); return bytes; },
    });
    await replay.complete({ ...completionInput(8), idempotencyKey: "recipient-completion-key-replay" });

    const rows = database.prepare(`SELECT recipient_attempt_id, official_result_id, is_official_comparison, state
      FROM challenge_attempts ORDER BY is_official_comparison DESC`).all();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].is_official_comparison, 1);
    assert.match(rows[0].official_result_id, /^result_/);
    assert.deepEqual(
      { ...rows[1] },
      {
        recipient_attempt_id: "attempt_recipient_second",
        official_result_id: null,
        is_official_comparison: 0,
        state: "completed",
      },
    );
    assert.equal(database.prepare("SELECT count(*) AS count FROM challenge_attempts WHERE is_official_comparison=1").get().count, 1);
  } finally { database.close(); }
});

test("transaction failure leaves no partial answers, result, seal or completed attempt", async () => {
  const { database, atomic } = await setup();
  try {
    const repository = new D1ChallengeCompletionRepository(atomic);
    const authority = await repository.getAcceptedAuthority(code, subject, now + 100);
    assert.ok(authority);
    const invalid = {
      authority,
      answers: authority.questions.map((question, index) => ({
        id: `answer_bad_${index}`,
        questionId: index ? question.id : "question_missing",
        questionVersion: question.version,
        selectedOptionIdsJson: '["o1"]',
        isCorrect: false,
        scoreAwarded: 0,
      })),
      resultId: "result_bad",
      resultPublicSlug: "7".repeat(48),
      completionIdempotencyHash: "d".repeat(64),
      score: 0,
      maximumScore: 12,
      tier: 0,
      scoringSnapshotJson: "{}",
      databaseOutcome: "not_beat",
      comparison: { edition: "west", editionLabel: "West Africa", inviterDisplayName: "Nia", inviterScore: 10, recipientScore: 0, maximumScore: 12, difference: -10, outcome: "did_not_beat", explanation: "Safe", masterySealAwarded: false, official: true, safeguard: "A playful culture score, never a measure of human worth." },
      official: true,
      masterySealId: null,
      completedAt: now + 100,
    };
    assert.equal((await repository.completeAtomically(invalid)).kind, "collision");
    assert.equal(database.prepare("SELECT count(*) AS count FROM answers").get().count, 0);
    assert.equal(database.prepare("SELECT count(*) AS count FROM results WHERE attempt_id != 'attempt_inviter'").get().count, 0);
    assert.equal(database.prepare("SELECT status FROM quiz_attempts WHERE id != 'attempt_inviter'").get().status, "in_progress");
    assert.equal(database.prepare("SELECT state FROM challenge_attempts").get().state, "accepted");
  } finally { database.close(); }
});

test("official result mismatch cannot be committed for the wrong recipient attempt", async () => {
  const { database, atomic } = await setup();
  try {
    const repository = new D1ChallengeCompletionRepository(atomic);
    const authority = await repository.getAcceptedAuthority(code, subject, now + 100);
    const mismatch = {
      authority,
      answers: [],
      resultId: "result_inviter",
      resultPublicSlug: "6".repeat(48),
      completionIdempotencyHash: "e".repeat(64),
      score: 10,
      maximumScore: 12,
      tier: 3,
      scoringSnapshotJson: "{}",
      databaseOutcome: "tied",
      comparison: { edition: "west", editionLabel: "West Africa", inviterDisplayName: "Nia", inviterScore: 10, recipientScore: 10, maximumScore: 12, difference: 0, outcome: "tied", explanation: "Safe", masterySealAwarded: true, official: true, safeguard: "A playful culture score, never a measure of human worth." },
      official: true,
      masterySealId: null,
      completedAt: now + 100,
    };
    assert.equal((await repository.completeAtomically(mismatch)).kind, "collision");
    assert.deepEqual(
      { ...database.prepare("SELECT official_result_id, is_official_comparison FROM challenge_attempts").get() },
      { official_result_id: null, is_official_comparison: 0 },
    );
    assert.equal(database.prepare("SELECT status FROM quiz_attempts WHERE id != 'attempt_inviter'").get().status, "in_progress");
  } finally { database.close(); }
});

test("public Prompt 9 projection remains free of recipient comparison data", async () => {
  const source = (await import("../../db/challengeService.ts")).toPublicChallengeProjection.toString();
  assert.doesNotMatch(source, /recipientSubject|recipientScore|officialResult|comparisonOutcome/);
});
