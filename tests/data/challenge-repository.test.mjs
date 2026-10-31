import assert from "node:assert/strict";
import test from "node:test";
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
const subjectHash = "a".repeat(64);
const resultReference = "b".repeat(48);

class StatementAdapter {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }
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
  const plan = await loadMigrationPlan();
  applyMigrationPlan(sqlite, plan, { now });
  sqlite.prepare(`INSERT INTO quiz_editions
    (id, edition_key, name, region, version, status, created_at, updated_at)
    VALUES ('edition_west_v1','west','West Africa','Synthetic scope',1,'active',?,?)`).run(now, now);
  sqlite.prepare(`INSERT INTO quiz_attempts (
    id, edition_id, anonymous_subject_hash, question_set_version, scoring_version,
    selected_question_versions_json, status, idempotency_key_hash, started_at,
    completed_at, expires_at, version, created_at, updated_at
  ) VALUES (
    'attempt_synthetic_0001','edition_west_v1',?,'approved-60-v1','binary-exact-set-v1',
    '[]','completed',?, ?, ?, ?, 1, ?, ?
  )`).run(subjectHash, "c".repeat(64), now - 10_000, now - 1000, now + 86_400_000, now - 10_000, now - 1000);
  sqlite.prepare(`INSERT INTO results (
    id, public_slug, attempt_id, edition_id, score, total, tier, scoring_version,
    question_set_version, scoring_snapshot_json, safe_avatar_id, reviewed_display_name,
    safeguard_version, state, expires_at, version, created_at, updated_at
  ) VALUES (
    'result_synthetic_0001',?,'attempt_synthetic_0001','edition_west_v1',10,12,3,
    'binary-exact-set-v1','approved-60-v1','{}','amara','Ayo','culture-score-v1',
    'active',?,1,?,?
  )`).run(resultReference, now + 30 * 86_400_000, now - 1000, now - 1000);
  const adapter = new DatabaseAdapter(sqlite);
  const repository = new D1ChallengeRepository(adapter);
  const service = new ChallengeService(
    repository,
    new InMemoryChallengeRateLimiter(20),
    { now: () => now },
  );
  return { sqlite, service, repository };
}

test("D1 repository creates from joined authoritative result and stores only derived credentials", async () => {
  const { sqlite, service } = await fixture();
  try {
    const response = await service.create({
      resultReference,
      idempotencyKey: "repository-key-00000000000001",
      anonymousSubjectHash: subjectHash,
      score: 0,
      edition: "south",
      privatePhoto: "data:image/jpeg;base64,private",
    });
    assert.equal(response.challenge.scoreToBeat, 10);
    assert.equal(response.challenge.maximumScore, 12);
    assert.equal(response.challenge.edition, "west");
    const stored = sqlite.prepare(`SELECT creation_idempotency_key_hash, revocation_token_hash,
      verified_score_to_beat, total FROM challenges`).get();
    assert.match(stored.creation_idempotency_key_hash, /^[0-9a-f]{64}$/);
    assert.match(stored.revocation_token_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(stored.creation_idempotency_key_hash, "repository-key-00000000000001");
    assert.notEqual(stored.revocation_token_hash, response.revocationToken);
    assert.equal(stored.verified_score_to_beat, 10);
    assert.equal(stored.total, 12);
    assert.doesNotMatch(JSON.stringify(response.challenge), /photo|data:image|result_synthetic|attempt_synthetic|anonymous/i);
  } finally { sqlite.close(); }
});

test("D1 unique idempotency index makes repeated and concurrent requests return one row", async () => {
  const { sqlite, service } = await fixture();
  try {
    const input = {
      resultReference,
      idempotencyKey: "repository-concurrent-key-0001",
      anonymousSubjectHash: subjectHash,
    };
    const [first, second] = await Promise.all([service.create(input), service.create(input)]);
    assert.equal(first.challenge.challengeCode, second.challenge.challengeCode);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM challenges").get().count, 1);
    const repeated = await service.create(input);
    assert.equal(repeated.challenge.challengeCode, first.challenge.challengeCode);
    assert.equal(repeated.revocationTokenIssued, false);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM challenges").get().count, 1);
  } finally { sqlite.close(); }
});

test("D1 lifecycle returns active, expired and capability-revoked safe states", async () => {
  const { sqlite, service, repository } = await fixture();
  try {
    const created = await service.create({
      resultReference,
      idempotencyKey: "repository-lifecycle-key-00001",
      anonymousSubjectHash: subjectHash,
    });
    assert.equal((await service.getPublic(created.challenge.challengeCode)).status, "active");
    assert.equal(await service.revoke({ publicCode: created.challenge.challengeCode, revocationToken: "0".repeat(64) }), null);
    assert.equal((await service.revoke({
      publicCode: created.challenge.challengeCode,
      revocationToken: created.revocationToken,
    })).status, "revoked");
    assert.equal(sqlite.prepare("SELECT state FROM challenges").get().state, "revoked");

    sqlite.prepare("UPDATE challenges SET state='active', revoked_at=NULL, expires_at=?").run(now + 1);
    const expiredService = new ChallengeService(repository, new InMemoryChallengeRateLimiter(20), { now: () => now + 2 });
    assert.equal((await expiredService.getPublic(created.challenge.challengeCode)).status, "expired");
  } finally { sqlite.close(); }
});
