import assert from "node:assert/strict";
import test from "node:test";
import { applyMigrationPlan, createIsolatedDatabase, loadMigrationPlan } from "../../scripts/data-migrations.mjs";
import { buildDevelopmentSeed, developmentSeedStatements } from "../../db/seeds/development.ts";
import { D1QuestionBankRepository } from "../../db/questionBankRepository.ts";
import { authorizeReproducibleSelectionSeed, D1QuestionSelectionRepository, selectQuestionSet } from "../../db/questionSelection.ts";

const now = Date.UTC(2026, 8, 1);

function seed(database, statements) {
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const statement of statements) database.prepare(statement.sql).run(...statement.params);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

class StatementAdapter {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new StatementAdapter(this.database, this.sql, values); }
  async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, results: [], meta: { changes: Number(result.changes || 0) } }; }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values).map((row) => ({ ...row })), meta: {} }; }
}
class DatabaseAdapter {
  constructor(database) { this.database = database; }
  prepare(sql) { return new StatementAdapter(this.database, sql); }
}

test("migration 0007 is additive, replay-inert and records the required selection authority", async () => {
  const database = createIsolatedDatabase();
  try {
    const plan = await loadMigrationPlan();
    assert.equal(plan[7].id, "0007_ancient_yellow_claw");
    assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, plan.map((migration) => migration.id));
    assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, []);
    const questionColumns = new Set(database.prepare("SELECT name FROM pragma_table_info('questions')").all().map((row) => row.name));
    for (const column of ["accepted_answers_json", "language", "reviewed_by", "reviewed_at", "valid_from", "valid_until", "image_provenance_json", "audio_provenance_json"]) assert.ok(questionColumns.has(column), column);
    const attemptColumns = new Set(database.prepare("SELECT name FROM pragma_table_info('quiz_attempts')").all().map((row) => row.name));
    assert.ok(attemptColumns.has("selection_policy_version"));
    assert.ok(attemptColumns.has("selection_seed_reference"));
    const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((row) => row.name);
    assert.ok(indexes.includes("questions_selection_idx"));
  } finally { database.close(); }
});

test("published or attempted question versions and their selection snapshots remain immutable", async () => {
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, await loadMigrationPlan(), { now });
    seed(database, developmentSeedStatements(await buildDevelopmentSeed()));
    assert.throws(() => database.prepare("UPDATE questions SET question_text='changed' WHERE stable_id='west_q01'").run(), /immutable/);
    assert.throws(() => database.prepare(`INSERT INTO question_sources
      (id,question_id,title,organisation_or_author,url_or_reference,access_date,source_type,review_status,version,created_at,updated_at)
      VALUES ('source_late','question_west_q01_v1','Late source','Synthetic org','https://example.org','2026-09-01','article','approved',1,?,?)`).run(now, now), /immutable/);
    const snapshot = JSON.stringify([{ stableId: "west_q01", version: 1 }]);
    database.prepare(`INSERT INTO quiz_attempts
      (id,edition_id,anonymous_subject_hash,question_set_version,scoring_version,selected_question_versions_json,
       selection_policy_version,selection_seed_reference,status,idempotency_key_hash,started_at,expires_at,version,created_at,updated_at)
      VALUES ('attempt_question_bank','edition_west_v1',?,'approved-60-v1','binary-exact-set-v1',?,'balanced-v1',?,'in_progress',?, ?, ?,1,?,?)`)
      .run("a".repeat(64), snapshot, "b".repeat(64), "c".repeat(64), now, now + 1000, now, now);
    assert.throws(() => database.prepare("UPDATE quiz_attempts SET selected_question_versions_json='[]' WHERE id='attempt_question_bank'").run(), /selection authority is immutable/);
    database.prepare(`INSERT INTO questions
      (id,stable_id,version,edition_id,category,difficulty,question_kind,question_text,answer_options_json,
       correct_answer_json,accepted_answers_json,explanation,scoring_weight,language,locale,publication_status,
       source_review_status,content_hash,created_at,updated_at)
      SELECT 'question_west_q01_v2','west_q01',2,edition_id,category,'introductory',question_kind,'Draft replacement',
       answer_options_json,correct_answer_json,accepted_answers_json,explanation,1,'en','en','draft','pending',?, ?, ?
      FROM questions WHERE stable_id='west_q01' AND version=1`).run("d".repeat(64), now, now);
    assert.equal(database.prepare("SELECT selected_question_versions_json FROM quiz_attempts WHERE id='attempt_question_bank'").get().selected_question_versions_json, snapshot);
    assert.equal(database.prepare("SELECT count(*) AS count FROM questions WHERE stable_id='west_q01'").get().count, 2);
    database.prepare("UPDATE questions SET publication_status='retired',retired_at=?,updated_at=? WHERE stable_id='west_q01' AND version=1").run(now, now);
    assert.throws(() => database.prepare("DELETE FROM questions WHERE stable_id='west_q01' AND version=1").run(), /immutable/);
    assert.throws(() => database.prepare(`INSERT INTO quiz_attempts
      (id,edition_id,question_set_version,scoring_version,selected_question_versions_json,selection_seed_reference,
       status,idempotency_key_hash,started_at,expires_at,version,created_at,updated_at)
      VALUES ('attempt_bad_seed','edition_west_v1','v','v','[]','NOT-A-HASH','in_progress','bad_seed_key',?,?,1,?,?)`).run(now, now + 1, now, now), /SHA-256/);
  } finally { database.close(); }
});

test("D1 catalogue and selection repositories map the verified bank and persist non-secret authority", async () => {
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, await loadMigrationPlan(), { now });
    seed(database, developmentSeedStatements(await buildDevelopmentSeed()));
    const adapter = new DatabaseAdapter(database);
    const document = await new D1QuestionBankRepository(adapter).list();
    assert.equal(document.questions.length, 60);
    assert.equal(document.questions.filter((question) => question.region === "west").length, 12);
    const repository = new D1QuestionSelectionRepository(adapter);
    const candidates = await repository.getCandidates("west", now);
    const selection = await selectQuestionSet({ candidates, region: "west", now, authorizedSeed: authorizeReproducibleSelectionSeed(new Uint8Array(32).fill(9), { authorized: true, purpose: "challenge" }) });
    assert.equal(selection.questions.length, 12);
    assert.equal(await repository.createAttempt({ id: "attempt_question_selection", editionId: "edition_west_v1", anonymousSubjectHash: "a".repeat(64), idempotencyKeyHash: "b".repeat(64), selection, startedAt: now, expiresAt: now + 1000 }), true);
    const attempt = database.prepare("SELECT selection_policy_version,selection_seed_reference,selected_question_versions_json FROM quiz_attempts WHERE id='attempt_question_selection'").get();
    assert.equal(attempt.selection_policy_version, "balanced-v1");
    assert.match(attempt.selection_seed_reference, /^[0-9a-f]{64}$/);
    assert.equal(JSON.parse(attempt.selected_question_versions_json).length, 12);
  } finally { database.close(); }
});
