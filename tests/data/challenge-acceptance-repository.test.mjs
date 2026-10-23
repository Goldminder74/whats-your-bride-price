import assert from "node:assert/strict";
import test from "node:test";
import {
  ChallengeAcceptanceService,
  D1ChallengeAcceptanceRepository,
} from "../../db/challengeAcceptance.ts";
import {
  ChallengeService,
  D1ChallengeRepository,
  InMemoryChallengeRateLimiter,
} from "../../db/challengeService.ts";
import {
  applyMigrationPlan,
  createIsolatedDatabase,
  loadMigrationPlan,
} from "../../scripts/data-migrations.mjs";

const now = Date.UTC(2026, 7, 24, 12);
const inviterSubject = "a".repeat(64);
const recipientSubject = "b".repeat(64);
const resultReference = "c".repeat(48);

class StatementAdapter {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new StatementAdapter(this.database, this.sql, values); }
  async run() {
    const outcome = this.database.sqlite.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(outcome.changes || 0) } };
  }
  async first(column) {
    const row = this.database.sqlite.prepare(this.sql).get(...this.values) || null;
    return row && column ? row[column] : row ? { ...row } : null;
  }
  async all() {
    return { success: true, results: this.database.sqlite.prepare(this.sql).all(...this.values).map((row) => ({ ...row })), meta: {} };
  }
}

class DatabaseAdapter {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) { return new StatementAdapter(this, sql); }
  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

async function fixture() {
  const sqlite = createIsolatedDatabase();
  applyMigrationPlan(sqlite, await loadMigrationPlan(), { now });
  sqlite.prepare(`INSERT INTO quiz_editions
    (id, edition_key, name, region, version, status, created_at, updated_at)
    VALUES ('edition_west_v1','west','West Africa','Synthetic scope',1,'active',?,?)`).run(now, now);
  sqlite.prepare(`INSERT INTO quiz_attempts (
    id, edition_id, anonymous_subject_hash, question_set_version, scoring_version,
    selected_question_versions_json, status, idempotency_key_hash, started_at,
    completed_at, expires_at, version, created_at, updated_at
  ) VALUES (
    'attempt_inviter_synthetic','edition_west_v1',?,'approved-60-v1','binary-exact-set-v1',
    ?,'completed',?, ?, ?, ?, 1, ?, ?
  )`).run(inviterSubject, JSON.stringify(Array.from({ length: 12 }, (_, index) => ({ stableId: `west_q${String(index + 1).padStart(2, "0")}`, version: 1 }))), "d".repeat(64), now - 10_000, now - 1000, now + 86_400_000, now - 10_000, now - 1000);
  sqlite.prepare(`INSERT INTO results (
    id, public_slug, attempt_id, edition_id, score, total, tier, scoring_version,
    question_set_version, scoring_snapshot_json, safe_avatar_id, reviewed_display_name,
    safeguard_version, state, expires_at, version, created_at, updated_at
  ) VALUES (
    'result_inviter_synthetic',?,'attempt_inviter_synthetic','edition_west_v1',10,12,3,
    'binary-exact-set-v1','approved-60-v1','{}','adjoa','Nia','culture-score-v1',
    'active',?,1,?,?
  )`).run(resultReference, now + 86_400_000, now - 1000, now - 1000);
  const database = new DatabaseAdapter(sqlite);
  const challengeCreation = new ChallengeService(
    new D1ChallengeRepository(database),
    new InMemoryChallengeRateLimiter(20),
    { now: () => now },
  );
  const created = await challengeCreation.create({
    resultReference,
    idempotencyKey: "create-challenge-test-key-0001",
    anonymousSubjectHash: inviterSubject,
  });
  const acceptance = new ChallengeAcceptanceService(
    new D1ChallengeAcceptanceRepository(database),
    new InMemoryChallengeRateLimiter(20),
    { now: () => now },
  );
  return { sqlite, acceptance, code: created.challenge.challengeCode };
}

test("D1 acceptance atomically consumes one use and creates linked minimal records", async () => {
  const { sqlite, acceptance, code } = await fixture();
  try {
    const response = await acceptance.accept({
      publicCode: code,
      idempotencyKey: "recipient-acceptance-key-0001",
      anonymousSubjectHash: recipientSubject,
    });
    assert.equal(response.accepted, true);
    assert.equal(response.reused, false);
    assert.equal(response.edition, "west");
    assert.equal(sqlite.prepare("SELECT use_count FROM challenges").get().use_count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM challenge_attempts").get().count, 1);
    const attempt = sqlite.prepare(`SELECT status, referral_code, challenge_code, anonymous_subject_hash
      FROM quiz_attempts WHERE id != 'attempt_inviter_synthetic'`).get();
    assert.deepEqual({ ...attempt }, {
      status: "in_progress",
      referral_code: code,
      challenge_code: code,
      anonymous_subject_hash: recipientSubject,
    });
    const authorities = sqlite.prepare(`SELECT selected_question_versions_json,question_set_version,
      selection_policy_version,selection_seed_reference FROM quiz_attempts ORDER BY id`).all();
    assert.deepEqual({ ...authorities[0] }, { ...authorities[1] });
    const stored = JSON.stringify(sqlite.prepare("SELECT * FROM challenge_attempts").get());
    assert.doesNotMatch(stored, /recipient-acceptance-key|privatePhoto|revocation/i);
  } finally { sqlite.close(); }
});

test("D1 repeated and concurrent acceptance reuses one record without consuming another use", async () => {
  const { sqlite, acceptance, code } = await fixture();
  try {
    const request = {
      publicCode: code,
      idempotencyKey: "recipient-concurrent-key-0001",
      anonymousSubjectHash: recipientSubject,
    };
    const [left, right] = await Promise.all([acceptance.accept(request), acceptance.accept(request)]);
    assert.equal(left.challengeCode, right.challengeCode);
    assert.equal([left, right].filter((entry) => entry.reused === false).length, 1);
    assert.equal(sqlite.prepare("SELECT use_count FROM challenges").get().use_count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM challenge_attempts").get().count, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM quiz_attempts").get().count, 2);
  } finally { sqlite.close(); }
});

test("D1 acceptance fails neutrally after challenge or inviter result becomes unavailable", async () => {
  const { sqlite, acceptance, code } = await fixture();
  try {
    sqlite.prepare("UPDATE results SET state='deleted'").run();
    await assert.rejects(
      acceptance.accept({
        publicCode: code,
        idempotencyKey: "recipient-unavailable-key-0001",
        anonymousSubjectHash: recipientSubject,
      }),
      (error) => error.code === "challenge_unavailable" && error.publicMessage === "This challenge is no longer available.",
    );
    assert.equal(sqlite.prepare("SELECT use_count FROM challenges").get().use_count, 0);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM challenge_attempts").get().count, 0);
  } finally { sqlite.close(); }
});
