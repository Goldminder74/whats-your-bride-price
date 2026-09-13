import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applyMigrationPlan, createIsolatedDatabase, loadMigrationPlan } from "../../scripts/data-migrations.mjs";
import { buildDevelopmentSeed, developmentSeedStatements } from "../../db/seeds/development.ts";
import { DAILY_STREAK_RETENTION_MS, DailyChallengeService, D1DailyChallengeRepository } from "../../db/dailyChallenge.ts";

const now = Date.parse("2026-09-06T12:00:00Z");

function seed(database, statements) {
  database.exec("BEGIN IMMEDIATE");
  try { for (const statement of statements) database.prepare(statement.sql).run(...statement.params); database.exec("COMMIT"); }
  catch (error) { database.exec("ROLLBACK"); throw error; }
}

class StatementAdapter {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new StatementAdapter(this.database, this.sql, values); }
  async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, results: [], meta: { changes: Number(result.changes || 0) } }; }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values).map((row) => ({ ...row })), meta: {} }; }
  async first(column) { const row = this.database.prepare(this.sql).get(...this.values); if (!row) return null; return column ? row[column] ?? null : { ...row }; }
}
class DatabaseAdapter {
  constructor(database) { this.database = database; }
  prepare(sql) { return new StatementAdapter(this.database, sql); }
  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); this.database.exec("COMMIT"); return results; }
    catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}

function deterministicRandom() { let byte = 1; return (value) => { value.fill(byte++); return value; }; }
function answers(selection) { return selection.questions.map((question) => ({ questionStableId: question.questionRef, selectedOptionIds: ["o1"] })); }

test("0008 is one checksummed additive migration and preserves populated 0007 rows", async () => {
  const plan = await loadMigrationPlan(); const migration = plan[8];
  assert.equal(plan.length, 11); assert.equal(migration.id, "0008_simple_nocturne");
  const raw = await readFile(new URL("../../drizzle/0008_simple_nocturne.sql", import.meta.url));
  assert.equal(createHash("sha256").update(raw).digest("hex"), migration.checksum);
  assert.doesNotMatch(raw.toString(), /INSERT INTO [`"]?questions|INSERT INTO [`"]?quiz_editions/i);
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, plan.slice(0, 8), { now });
    database.prepare(`INSERT INTO quiz_editions (id,edition_key,name,region,version,status,created_at,updated_at) VALUES ('edition_legacy','west','Legacy','West',1,'active',?,?)`).run(now, now);
    database.prepare(`INSERT INTO daily_challenges (id,challenge_date,edition_id,question_set_version,deterministic_seed_hash,selected_question_versions_json,state,expires_at,version,created_at,updated_at) VALUES ('daily_legacy','legacy-date','edition_legacy','legacy','legacy','[]','active',?,1,?,?)`).run(now + 1, now, now);
    database.prepare(`INSERT INTO quiz_attempts (id,edition_id,question_set_version,scoring_version,selected_question_versions_json,selection_policy_version,status,idempotency_key_hash,started_at,expires_at,version,created_at,updated_at) VALUES ('attempt_legacy','edition_legacy','legacy','legacy','[]','balanced-v1','in_progress','legacy-key',?,?,1,?,?)`).run(now, now + day, now, now);
    database.prepare(`INSERT INTO streaks (id,anonymous_subject_hash,streak_type,current_count,longest_count,last_qualifying_date,rule_version,expires_at,version,created_at,updated_at) VALUES ('streak_legacy','legacy-owner','legacy',2,4,NULL,'legacy',?,1,?,?)`).run(now + day, now, now);
    assert.deepEqual(applyMigrationPlan(database, plan.slice(0, 9), { now }).applied, [migration.id]);
    assert.deepEqual(applyMigrationPlan(database, plan.slice(0, 9), { now }).applied, []);
    assert.equal(database.prepare("SELECT play_mode,daily_challenge_id FROM quiz_attempts WHERE id='attempt_legacy'").get().play_mode, "random");
    assert.equal(database.prepare("SELECT scoring_version,selection_policy_version FROM daily_challenges WHERE id='daily_legacy'").get().scoring_version, "binary-exact-set-v1");
    assert.equal(database.prepare("SELECT current_count,longest_count,last_qualified_at FROM streaks WHERE id='streak_legacy'").get().longest_count, 4);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.throws(() => database.prepare(`INSERT INTO streaks (id,anonymous_subject_hash,streak_type,current_count,longest_count,last_qualifying_date,last_qualified_at,rule_version,expires_at,version,created_at,updated_at) VALUES ('bad',?,'daily:west',1,1,'2026-09-06',?,'daily-streak-v1',?,2,?,?)`).run("a".repeat(64), now, now + 1, now, now), /invalid versioned streak retention/);
  } finally { database.close(); }
});

const day = 86_400_000;
test("a failed 0008 rolls back columns, tables and its migration ledger row", async () => {
  const plan = await loadMigrationPlan(); const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, plan.slice(0, 8), { now });
    const migration = plan[8]; const failing = { ...migration, statements: [...migration.statements, "INSERT INTO table_that_does_not_exist VALUES (1)"] };
    assert.throws(() => applyMigrationPlan(database, [failing], { now }), /no such table/);
    assert.equal(database.prepare("SELECT count(*) count FROM schema_migrations WHERE migration_id=?").get(migration.id).count, 0);
    assert.equal(database.prepare("SELECT count(*) count FROM pragma_table_info('quiz_attempts') WHERE name='play_mode'").get().count, 0);
    assert.equal(database.prepare("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name='daily_challenge_completions'").get().count, 0);
  } finally { database.close(); }
});

test("D1 daily repository persists one official result atomically and practice cannot advance a streak", async () => {
  const database = createIsolatedDatabase();
  try {
    const plan = await loadMigrationPlan(); applyMigrationPlan(database, plan, { now });
    const development = await buildDevelopmentSeed(); seed(database, developmentSeedStatements(development));
    const repository = new D1DailyChallengeRepository(new DatabaseAdapter(database));
    const service = new DailyChallengeService(repository, { secret: "data-test-daily-secret-is-longer-than-thirty-two", streaksEnabled: true, now: () => now, randomSource: deterministicRandom() });
    const base = { region: "west", mode: "official", anonymousSessionCredential: "01".repeat(16) };
    const first = await service.start({ ...base, idempotencyKey: "official-concurrency-0001" });
    const concurrent = await service.start({ ...base, idempotencyKey: "official-concurrency-0002" });
    assert.deepEqual(first.questions, concurrent.questions); assert.equal(database.prepare("SELECT count(*) count FROM daily_challenges").get().count, 1);
    const [left, right] = await Promise.allSettled([
      service.complete({ attemptId: first.attemptId, anonymousSessionCredential: base.anonymousSessionCredential, avatarId: "adjoa", answers: answers(first) }),
      service.complete({ attemptId: concurrent.attemptId, anonymousSessionCredential: base.anonymousSessionCredential, avatarId: "adjoa", answers: answers(concurrent) }),
    ]);
    assert.ok([left, right].some((item) => item.status === "fulfilled"));
    assert.equal(database.prepare("SELECT count(*) count FROM daily_challenge_completions").get().count, 1);
    assert.equal(database.prepare("SELECT count(*) count FROM streaks").get().count, 1);
    const streak = database.prepare("SELECT current_count,longest_count,last_qualified_at,expires_at,version FROM streaks").get();
    assert.equal(streak.current_count, 1); assert.equal(streak.longest_count, 1); assert.equal(streak.expires_at - streak.last_qualified_at, DAILY_STREAK_RETENTION_MS); assert.equal(streak.version, 2);
    const practice = await service.start({ ...base, mode: "practice", idempotencyKey: "practice-completion-0001" });
    const practiceResult = await service.complete({ attemptId: practice.attemptId, anonymousSessionCredential: base.anonymousSessionCredential, avatarId: "adjoa", answers: answers(practice) });
    assert.equal(practiceResult.official, false); assert.equal(database.prepare("SELECT count(*) count FROM streaks").get().count, 1);
    await service.clearStreak({ anonymousSessionCredential: base.anonymousSessionCredential, idempotencyKey: "clear-streak-data-0001" });
    assert.equal(database.prepare("SELECT count(*) count FROM streaks").get().count, 0);
  } finally { database.close(); }
});
