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
const slug = "a".repeat(48);
const subjectHash = "b".repeat(64);

function applySeed(database, statements) {
  for (const statement of statements) database.prepare(statement.sql).run(...statement.params);
}

function insertHistoricalResult(database) {
  database.prepare(`INSERT INTO quiz_attempts (
    id, edition_id, anonymous_subject_hash, question_set_version, scoring_version,
    selected_question_versions_json, status, idempotency_key_hash, started_at,
    completed_at, expires_at, version, created_at, updated_at
  ) VALUES ('attempt_visibility_history','edition_west_v1',?,?,?,?,
    'completed','visibility_history_idempotency',?,?,?,1,?,?)`)
    .run(subjectHash, QUESTION_SET_VERSION, SCORING_VERSION, "[]", now - 1000, now, now + 86_400_000, now - 1000, now);
  database.prepare(`INSERT INTO results (
    id, public_slug, attempt_id, edition_id, score, total, tier, scoring_version,
    question_set_version, scoring_snapshot_json, safe_avatar_id, reviewed_display_name,
    safeguard_version, state, expires_at, version, created_at, updated_at
  ) VALUES ('result_visibility_history',?,'attempt_visibility_history','edition_west_v1',
    9,12,3,?,?,'{}','adjoa','Synthetic owner','culture-score-v1','active',?,1,?,?)`)
    .run(slug, SCORING_VERSION, QUESTION_SET_VERSION, now + 86_400_000, now, now);
}

test("migration 0004 is additive, ordered, checksummed and repeatable", async () => {
  const plan = await loadMigrationPlan();
  assert.equal(plan.length, 5);
  assert.equal(plan[4].id, "0004_yellow_bill_hollister");
  assert.equal(plan[4].checksum, "c649185f96cdce28aca0522330649b4688c9f1da93ea6eab0c08842b163b65bc");
  assert.equal(plan[4].statements.length, 1);
  assert.match(plan[4].statements[0], /^ALTER TABLE `results` ADD `visibility`/);
  for (const previousCount of [0, 4]) {
    const database = createIsolatedDatabase();
    try {
      if (previousCount) applyMigrationPlan(database, plan.slice(0, previousCount), { now });
      assert.deepEqual(
        applyMigrationPlan(database, plan, { now }).applied,
        plan.slice(previousCount).map((migration) => migration.id),
      );
      assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, []);
      const column = database.prepare("SELECT name, type, \"notnull\" AS required, dflt_value FROM pragma_table_info('results') WHERE name='visibility'").get();
      assert.deepEqual({ ...column }, { name: "visibility", type: "TEXT", required: 1, dflt_value: "'private'" });
    } finally { database.close(); }
  }
});

test("historical active results remain intact and become private", async () => {
  const plan = await loadMigrationPlan();
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, plan.slice(0, 4), { now });
    applySeed(database, developmentSeedStatements(await buildDevelopmentSeed()));
    insertHistoricalResult(database);
    applyMigrationPlan(database, plan, { now });
    const row = database.prepare(`SELECT public_slug, score, total, state, visibility,
      reviewed_display_name FROM results WHERE id='result_visibility_history'`).get();
    assert.deepEqual({ ...row }, {
      public_slug: slug,
      score: 9,
      total: 12,
      state: "active",
      visibility: "private",
      reviewed_display_name: "Synthetic owner",
    });
  } finally { database.close(); }
});

test("visibility accepts only private or public", async () => {
  const plan = await loadMigrationPlan();
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, plan, { now });
    applySeed(database, developmentSeedStatements(await buildDevelopmentSeed()));
    insertHistoricalResult(database);
    database.prepare("UPDATE results SET visibility='public' WHERE id='result_visibility_history'").run();
    assert.equal(database.prepare("SELECT visibility FROM results WHERE id='result_visibility_history'").get().visibility, "public");
    assert.throws(
      () => database.prepare("UPDATE results SET visibility='friends' WHERE id='result_visibility_history'").run(),
      /results_visibility_ck|CHECK constraint/,
    );
  } finally { database.close(); }
});
