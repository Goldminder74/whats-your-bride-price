import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { applyMigrationPlan, createIsolatedDatabase, loadMigrationPlan } from "../../scripts/data-migrations.mjs";
import { buildDevelopmentSeed, developmentSeedStatements } from "../../db/seeds/development.ts";
import { D1QuestionSelectionRepository, MINIMUM_RANDOM_QUICK_PLAY_BANK, selectQuestionSet } from "../../db/questionSelection.ts";

const now = Date.UTC(2026, 8, 13, 12), hash = "a".repeat(64);
class Statement {
  constructor(db, sql, values = []) { Object.assign(this, { db, sql, values }); }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  async all() { return { success: true, results: this.db.prepare(this.sql).all(...this.values).map(r => ({ ...r })), meta: {} }; }
}
async function setup() {
  const db = createIsolatedDatabase(), plan = await loadMigrationPlan();
  applyMigrationPlan(db, plan.slice(0, 11), { now });
  for (const s of developmentSeedStatements(await buildDevelopmentSeed())) db.prepare(s.sql).run(...s.params);
  const before = db.prepare("SELECT * FROM questions ORDER BY id").all().map(r => ({ ...r }));
  applyMigrationPlan(db, plan, { now });
  return { db, plan, before, repository: new D1QuestionSelectionRepository({ prepare: sql => new Statement(db, sql) }) };
}
function draft(db, index = 1) {
  const id = `synthetic_evidence_${index}`;
  db.prepare(`INSERT INTO questions(id,stable_id,version,edition_id,category,difficulty,question_kind,
    question_text,answer_options_json,correct_answer_json,accepted_answers_json,explanation,scoring_weight,
    language,locale,publication_status,source_review_status,content_hash,created_at,updated_at)
    VALUES(?,?,1,'edition_west_v1','GEOGRAPHY','introductory','single',?,?,'["o1"]','[["o1"]]',?,1,
    'en','en-GB','draft','approved',?,?,?)`).run(id, "west_e_" + index.toString(16).padStart(24, "0"),
      `Synthetic isolated test ${index}`, JSON.stringify([{ id: "o1", text: "Ghana" }, { id: "o2", text: "Senegal" }, { id: "o3", text: "Mali" }, { id: "o4", text: "Nigeria" }]),
      "Synthetic isolated test explanation.", hash, now, now);
  return id;
}
function verification(db, questionId, overrides = {}) {
  const row = {
    id: "verification_" + "b".repeat(32), question_id: questionId, question_version: 1, question_content_sha256: hash,
    method: "machine_evidence_v1", status: "verified", risk_class: "low_objective", policy_version: "low-objective-evidence-v1",
    evidence_bundle_sha256: "c".repeat(64), source_count: 2, independent_source_count: 2, primary_source_count: 1,
    verified_at: now, recheck_at: now + 30 * 86_400_000, revoked_at: null, revocation_reason: null,
    created_at: now, updated_at: now, expires_at: now + 180 * 86_400_000, deleted_at: null, ...overrides,
  };
  db.prepare(`INSERT INTO question_evidence_verifications(${Object.keys(row).join(",")}) VALUES(${Object.keys(row).map(() => "?").join(",")})`).run(...Object.values(row));
}
function publish(db, id) { db.prepare("UPDATE questions SET publication_status='published',published_at=? WHERE id=?").run(now, id); }
test("0011 adds exactly one table without altering historical schema, questions or migration checksums", async () => {
  const { db, plan, before } = await setup();
  try {
    assert.equal(plan.length, 12); assert.equal(plan[11].id, "0011_useful_wendell_vaughn");
    const files = await readdir(new URL("../../drizzle/", import.meta.url));
    assert.deepEqual(files.filter(f => /^0011_.*\.sql$/.test(f)), ["0011_useful_wendell_vaughn.sql"]);
    assert.equal(files.some(f => /^0012_/.test(f)), false);
    assert.equal(plan[11].statements.filter(s => /^CREATE TABLE/.test(s)).length, 1);
    assert.ok(plan[11].statements.every(s => /^(CREATE TABLE|CREATE UNIQUE INDEX|CREATE INDEX|CREATE TRIGGER)/.test(s)));
    assert.deepEqual(db.prepare("SELECT * FROM questions ORDER BY id").all().map(r => ({ ...r })), before);
    assert.deepEqual(applyMigrationPlan(db, plan, { now }).applied, []);
    const ledger = JSON.parse(await readFile(new URL("../../drizzle/migration-checksums.json", import.meta.url)));
    for (const p of plan) assert.equal(createHash("sha256").update(await readFile(new URL(`../../drizzle/${p.name}`, import.meta.url))).digest("hex"), ledger[p.name]);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});
test("database rejects malformed authority, missing independence, human identity and wrong question versions", async () => {
  const { db } = await setup();
  try {
    const id = draft(db);
    for (const change of [{ id: "verification_bad" }, { question_version: 2 }, { question_content_sha256: "d".repeat(64) },
      { evidence_bundle_sha256: "C".repeat(64) }, { source_count: 1 }, { independent_source_count: 1 }, { primary_source_count: 0 },
      { method: "human" }, { risk_class: "sensitive" }, { policy_version: "arbitrary" }, { recheck_at: now },
      { recheck_at: now + 181 * 86_400_000 }, { status: "revoked" }, { status: "deleted" }, { expires_at: Date.UTC(2028, 0, 1) }]) {
      assert.throws(() => verification(db, id, change), undefined, JSON.stringify(change));
    }
    db.prepare("UPDATE questions SET reviewed_by='Synthetic human',reviewed_at=? WHERE id=?").run(now, id);
    assert.throws(() => verification(db, id), /without human identity/);
    db.prepare("UPDATE questions SET reviewed_by=NULL,reviewed_at=NULL,sensitivity_notes='Needs specialist review' WHERE id=?").run(id);
    assert.throws(() => verification(db, id), /low-risk/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM question_evidence_verifications").get().n, 0);
  } finally { db.close(); }
});
test("verification cannot publish, rewrite a question, manufacture a reviewer or mutate its evidence authority", async () => {
  const { db, repository } = await setup();
  try {
    const id = draft(db), before = db.prepare("SELECT * FROM questions WHERE id=?").get(id);
    verification(db, id);
    assert.deepEqual(db.prepare("SELECT * FROM questions WHERE id=?").get(id), before);
    assert.equal((await repository.getCandidates("west", now)).length, 12);
    assert.throws(() => verification(db, id, { id: "verification_" + "d".repeat(32) }), /UNIQUE/);
    for (const assignment of ["method='human'", "source_count=3", "evidence_bundle_sha256='" + "f".repeat(64) + "'", "question_version=2", "recheck_at=recheck_at+1"]) {
      assert.throws(() => db.exec("UPDATE question_evidence_verifications SET " + assignment), /immutable/);
    }
    publish(db, id); assert.equal((await repository.getCandidates("west", now)).length, 13);
    assert.throws(() => db.exec("UPDATE questions SET question_text='Changed' WHERE id='" + id + "'"), /immutable/);
  } finally { db.close(); }
});
test("expired, revoked, deleted or removed proof never falls back to the pre-engine route", async () => {
  for (const state of ["expired", "revoked", "deleted", "missing"]) {
    const { db, repository } = await setup();
    try {
      const id = draft(db); verification(db, id); publish(db, id);
      assert.equal((await repository.getCandidates("west", now)).length, 13);
      if (state === "missing") db.exec("DELETE FROM question_evidence_verifications");
      else if (state === "revoked") db.prepare("UPDATE question_evidence_verifications SET status='revoked',revoked_at=?,revocation_reason='ambiguity',updated_at=?").run(now, now);
      else if (state === "deleted") db.prepare("UPDATE question_evidence_verifications SET status='deleted',deleted_at=?,updated_at=?").run(now, now);
      else db.exec("UPDATE question_evidence_verifications SET status='expired'");
      assert.equal((await repository.getCandidates("west", now)).length, 12, state);
      if (state !== "missing") assert.throws(() => db.exec("UPDATE question_evidence_verifications SET status='verified',revoked_at=NULL,revocation_reason=NULL,deleted_at=NULL"), /immutable/);
    } finally { db.close(); }
  }
});
test("new publication without human review or evidence is ineligible while genuine human publication remains eligible", async () => {
  const { db, repository } = await setup();
  try {
    const id = draft(db); publish(db, id);
    assert.equal((await repository.getCandidates("west", now)).length, 12);
    const human = draft(db, 2);
    db.prepare("UPDATE questions SET reviewed_by='Synthetic legitimate reviewer',reviewed_at=? WHERE id=?").run(now, human);
    publish(db, human); assert.equal((await repository.getCandidates("west", now)).length, 13);
  } finally { db.close(); }
});
test("a genuine later human review remains an independent route after machine evidence is revoked", async () => {
  const { db, repository } = await setup();
  try {
    const id = draft(db); verification(db, id);
    db.prepare("UPDATE question_evidence_verifications SET status='revoked',revoked_at=?,revocation_reason='policy_withdrawn',updated_at=?").run(now, now);
    db.prepare("UPDATE questions SET reviewed_by='Synthetic independent human reviewer',reviewed_at=?,publication_status='published',published_at=? WHERE id=?").run(now, now, id);
    assert.equal((await repository.getCandidates("west", now)).length, 13);
  } finally { db.close(); }
});
test("canonical sixty stay exact and all regions still require thirty eligible questions for twelve unique random questions", async () => {
  const { db, repository, before } = await setup();
  try {
    for (const region of ["west", "east", "north", "central", "south"]) {
      const questions = await repository.getCandidates(region, now);
      assert.equal(questions.length, 12); assert.ok(questions.every(q => q.region === region));
      assert.equal(MINIMUM_RANDOM_QUICK_PLAY_BANK, 30);
      await assert.rejects(selectQuestionSet({ region, candidates: questions, now, minimumEligibleCount: MINIMUM_RANDOM_QUICK_PLAY_BANK }), e => e.required === 30);
    }
    assert.deepEqual(db.prepare("SELECT * FROM questions ORDER BY id").all().map(r => ({ ...r })), before);
  } finally { db.close(); }
});
