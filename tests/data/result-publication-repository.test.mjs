import assert from "node:assert/strict";
import test from "node:test";
import { deriveAnonymousSubjectHash } from "../../app/anonymousSession.ts";
import { validatePublicAppOrigin } from "../../app/publicAppOrigin.ts";
import { InMemoryChallengeRateLimiter } from "../../db/challengeService.ts";
import { D1ResultPreviewRepository } from "../../db/resultMedia.ts";
import { D1ResultPublicationRepository, ResultPublicationService } from "../../db/resultPublication.ts";
import { D1PublicResultRepository, ResultService } from "../../db/resultService.ts";
import { applyMigrationPlan, createIsolatedDatabase, loadMigrationPlan } from "../../scripts/data-migrations.mjs";

const now = Date.UTC(2026, 7, 24, 12); const slug = "7".repeat(48); const sessionCredential = "01".repeat(16); const subjectHash = await deriveAnonymousSubjectHash(sessionCredential);
class StatementAdapter { constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; } bind(...values) { return new StatementAdapter(this.database, this.sql, values); } async run() { const value = this.database.sqlite.prepare(this.sql).run(...this.values); return { success: true, results: [], meta: { changes: Number(value.changes || 0) } }; } async first(column) { const row = this.database.sqlite.prepare(this.sql).get(...this.values) || null; return row && column ? row[column] : row ? { ...row } : null; } async all() { return { success: true, results: this.database.sqlite.prepare(this.sql).all(...this.values).map((row) => ({ ...row })), meta: {} }; } }
class DatabaseAdapter { constructor(sqlite) { this.sqlite = sqlite; } prepare(sql) { return new StatementAdapter(this, sql); } async batch(statements) { this.sqlite.exec("BEGIN IMMEDIATE"); try { const values = []; for (const statement of statements) values.push(await statement.run()); this.sqlite.exec("COMMIT"); return values; } catch (error) { this.sqlite.exec("ROLLBACK"); throw error; } } }

async function fixture() {
  const sqlite = createIsolatedDatabase(); applyMigrationPlan(sqlite, await loadMigrationPlan(), { now });
  sqlite.prepare("INSERT INTO quiz_editions (id,edition_key,name,region,version,status,created_at,updated_at) VALUES ('edition_west_v1','west','West Africa','Synthetic',1,'active',?,?)").run(now, now);
  sqlite.prepare(`INSERT INTO quiz_attempts (id,edition_id,anonymous_subject_hash,question_set_version,scoring_version,selected_question_versions_json,status,idempotency_key_hash,started_at,completed_at,expires_at,version,created_at,updated_at)
    VALUES ('attempt_result_publication','edition_west_v1',?,'approved-60-v1','binary-exact-set-v1','[]','completed','result_publication_idempotency',?,?,?,1,?,?)`).run(subjectHash, now - 1000, now - 500, now + 86_400_000, now - 1000, now - 500);
  sqlite.prepare(`INSERT INTO results (id,public_slug,attempt_id,edition_id,score,total,tier,scoring_version,question_set_version,scoring_snapshot_json,safe_avatar_id,reviewed_display_name,safeguard_version,state,expires_at,version,created_at,updated_at)
    VALUES ('result_publication',?,'attempt_result_publication','edition_west_v1',9,12,3,'binary-exact-set-v1','approved-60-v1','{}','adjoa','Private owner name','culture-score-v1','active',?,1,?,?)`).run(slug, now + 86_400_000, now - 500, now - 500);
  const adapter = new DatabaseAdapter(sqlite); const origin = validatePublicAppOrigin("http://127.0.0.1:3100", "test");
  return { sqlite, adapter, publication: new ResultPublicationService(new D1ResultPublicationRepository(adapter), new InMemoryChallengeRateLimiter(8), { now: () => now, publicOrigin: origin }), resultService: new ResultService(new D1PublicResultRepository(adapter), { now: () => now, publicOrigin: origin }) };
}

test("D1 publication changes only visibility and public reads remain authoritative", async () => {
  const { sqlite, publication, resultService } = await fixture();
  try {
    const before = sqlite.prepare("SELECT * FROM results WHERE id='result_publication'").get(); assert.equal(before.visibility, "private"); assert.equal(await resultService.getPublic(slug), null);
    const published = await publication.setVisibility({ resultSlug: slug, anonymousSessionCredential: sessionCredential, action: "publish" }); assert.equal(published.published, true); assert.equal(published.result.displayName, "A challenger");
    const after = sqlite.prepare("SELECT * FROM results WHERE id='result_publication'").get();
    for (const key of Object.keys(before)) if (!["visibility", "updated_at"].includes(key)) assert.deepEqual(after[key], before[key], `unexpected change to ${key}`);
    assert.equal(after.visibility, "public"); assert.ok(await resultService.getPublic(slug));
    await publication.setVisibility({ resultSlug: slug, anonymousSessionCredential: sessionCredential, action: "unpublish" }); assert.equal(sqlite.prepare("SELECT visibility FROM results WHERE id='result_publication'").get().visibility, "private"); assert.equal(await resultService.getPublic(slug), null);
  } finally { sqlite.close(); }
});

test("D1 publication rejects copied hashes and different session credentials without changing visibility", async () => {
  for (const anonymousSessionCredential of [subjectHash, "02".repeat(16)]) {
    const { sqlite, publication } = await fixture(); try { await assert.rejects(publication.setVisibility({ resultSlug: slug, anonymousSessionCredential, action: "publish" })); assert.equal(sqlite.prepare("SELECT visibility FROM results WHERE id='result_publication'").get().visibility, "private"); } finally { sqlite.close(); }
  }
});

test("D1 media metadata uses one safe public open-graph record and supports revocation", async () => {
  const { sqlite, adapter } = await fixture(); const repository = new D1ResultPreviewRepository(adapter, () => now);
  try {
    const record = Object.freeze({ resultId: "result_publication", resultSlug: slug, objectKey: `generated/west/2026/08/${"c".repeat(64)}-vog1.png`, contentHash: "c".repeat(64), mimeType: "image/png", width: 1200, height: 630, byteSize: 2000, generationVersion: "og1", expiresAt: now + 86_400_000, state: "ready" });
    assert.deepEqual(await repository.saveReady(record), record); assert.deepEqual(await repository.saveReady(record), record);
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM media_assets").get().count, 1); await repository.revokeForResult("result_publication"); assert.equal(await repository.getReadyForResult(slug), null); assert.equal(sqlite.prepare("SELECT state FROM media_assets").get().state, "revoked");
  } finally { sqlite.close(); }
});
