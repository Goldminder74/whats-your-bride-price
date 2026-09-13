import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { applyMigrationPlan, createIsolatedDatabase, loadMigrationPlan } from "../../scripts/data-migrations.mjs";
import { D1OwnerDashboardRepository, parseOwnerDashboardFilters } from "../../db/ownerDashboard.ts";

const now = Date.UTC(2026, 7, 27, 12);
const day = 86_400_000;

class TestStatement {
  values = [];
  constructor(database, query, log) { this.database = database; this.query = query; this.log = log; }
  bind(...values) { this.values = values; this.log.push({ query: this.query, values }); return this; }
  async all() { return { results: this.database.prepare(this.query).all(...this.values), meta: {} }; }
  async first() { return this.database.prepare(this.query).get(...this.values) || null; }
  async run() { const result = this.database.prepare(this.query).run(...this.values); return { results: [], meta: { changes: result.changes } }; }
}

class TestD1 {
  log = [];
  constructor(database) { this.database = database; }
  prepare(query) { return new TestStatement(this.database, query, this.log); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.all())); }
}

function insertConsent(database, hash, overrides = {}) {
  const values = { statistical: 1, marketing: 0, expiresAt: now + day, withdrawnAt: null, deletedAt: null, ...overrides };
  database.prepare(`INSERT INTO consent_preferences (
    id,anonymous_subject_hash,analytics_session_hash,notice_version,category_version,strictly_functional,
    first_party_statistical,marketing,decided_at,withdrawn_at,expires_at,deleted_at,version,created_at,updated_at
  ) VALUES (?,NULL,?,'analytics-notice-v1','first-party-statistical-v1',1,?,?,?,?,?,?,1,?,?)`).run(
    `consent_${hash[0]}`, hash, values.statistical, values.marketing, now - day, values.withdrawnAt,
    values.expiresAt, values.deletedAt, now - day, now - day,
  );
}

let uuidCounter = 0;
function insertEvent(database, hash, name, properties = {}, overrides = {}) {
  uuidCounter += 1;
  const uuid = `123e4567-e89b-42d3-8${String(uuidCounter).padStart(3, "0")}-${String(uuidCounter).padStart(12, "0")}`;
  const values = { occurredAt: now - 1_000, expiresAt: now + day, deletedAt: null, ...overrides };
  database.prepare(`INSERT INTO analytics_events (
    id,client_event_uuid,event_schema_version,analytics_session_hash,event_name,properties_json,consent_notice_version,
    bot_classification,occurred_at,expires_at,deleted_at,version,created_at,updated_at
  ) VALUES (?,?,1,?,?,?,'analytics-notice-v1','human',?,?,?,1,?,?)`).run(
    `event_${uuidCounter}`, uuid, hash, name, JSON.stringify(properties), values.occurredAt, values.expiresAt,
    values.deletedAt, values.occurredAt, values.occurredAt,
  );
}

function insertLegacyEvent(database) {
  database.prepare(`INSERT INTO analytics_events (
    id,client_event_uuid,event_schema_version,analytics_session_hash,event_name,properties_json,anonymous_subject_hash,
    consent_notice_version,bot_classification,occurred_at,expires_at,version,created_at,updated_at
  ) VALUES ('legacy',NULL,0,NULL,'entry_viewed','{}','legacy-subject','legacy','human',?,?,1,?,?)`).run(now - 1_000, now + day, now - 1_000, now - 1_000);
}

async function fixtureDatabase() {
  const database = createIsolatedDatabase();
  applyMigrationPlan(database, await loadMigrationPlan(), { now });
  const valid = "a".repeat(64); const unconsented = "b".repeat(64); const expiredConsent = "c".repeat(64); const withdrawn = "d".repeat(64); const deleted = "e".repeat(64); const expiredEvent = "f".repeat(64);
  insertConsent(database, valid);
  insertConsent(database, expiredConsent, { expiresAt: now });
  insertConsent(database, withdrawn, { withdrawnAt: now - 1 });
  insertConsent(database, deleted); insertConsent(database, expiredEvent);
  insertEvent(database, valid, "app_visit", { edition: "west", source: "direct", campaign: "none", surface: "entry" });
  insertEvent(database, valid, "quiz_start", { edition: "west", source: "direct", campaign: "none", surface: "quiz" });
  insertEvent(database, valid, "quiz_complete", { edition: "west", source: "direct", campaign: "none", surface: "quiz", durationBucket: "30_to_120s" });
  insertEvent(database, unconsented, "app_visit", { edition: "west", source: "direct", campaign: "none" });
  insertEvent(database, expiredConsent, "app_visit", { edition: "west", source: "direct", campaign: "none" });
  insertEvent(database, withdrawn, "app_visit", { edition: "west", source: "direct", campaign: "none" });
  insertEvent(database, deleted, "app_visit", { edition: "west", source: "direct", campaign: "none" }, { deletedAt: now - 1 });
  insertEvent(database, expiredEvent, "app_visit", { edition: "west", source: "direct", campaign: "none" }, { expiresAt: now });
  insertLegacyEvent(database);
  return database;
}

test("D1 report query includes only version-1, consented, non-deleted and unexpired events", async () => {
  const database = await fixtureDatabase();
  try {
    const d1 = new TestD1(database); const repository = new D1OwnerDashboardRepository(d1);
    const snapshot = await repository.aggregate(parseOwnerDashboardFilters({ from: "2026-08-27", to: "2026-08-27" }, now), now);
    assert.deepEqual(Object.fromEntries(snapshot.counts.map((row) => [row.key, row.count])), { app_visit: 1, quiz_complete: 1, quiz_start: 1 });
    assert.equal(snapshot.uniqueSessions, 1);
    assert.deepEqual(snapshot.durations, [{ bucket: "30_to_120s", count: 1 }]);
  } finally { database.close(); }
});

test("date, edition, source and campaign values are bound parameters rather than SQL", async () => {
  const database = await fixtureDatabase();
  try {
    const d1 = new TestD1(database); const repository = new D1OwnerDashboardRepository(d1);
    const selected = parseOwnerDashboardFilters({ from: "2026-08-27", to: "2026-08-27", edition: "west", source: "direct", campaign: "none" }, now);
    const snapshot = await repository.aggregate(selected, now);
    assert.equal(snapshot.counts.find((row) => row.key === "quiz_complete").count, 1);
    assert.equal(d1.log.length, 7);
    for (const entry of d1.log) {
      assert.doesNotMatch(entry.query, /2026-08-27|\bwest\b|\bdirect\b/);
      assert.deepEqual(entry.values.slice(2), [selected.from, selected.toExclusive, "west", "direct", "none"]);
      assert.match(entry.query, /\?5 IS NULL OR edition=\?5/);
    }
  } finally { database.close(); }
});

test("server-side aggregates never return hashes, identifiers or raw properties JSON", async () => {
  const database = await fixtureDatabase();
  try {
    const snapshot = await new D1OwnerDashboardRepository(new TestD1(database)).aggregate(parseOwnerDashboardFilters({}, now), now);
    const output = JSON.stringify(snapshot);
    assert.doesNotMatch(output, /a{64}|analytics_session_hash|client_event_uuid|properties_json|legacy-subject|event_1/);
    assert.match(output, /uniqueSessions/);
  } finally { database.close(); }
});

test("report SQL uses existing time, session and retention predicates without deleting data", async () => {
  const database = await fixtureDatabase();
  try {
    const d1 = new TestD1(database); await new D1OwnerDashboardRepository(d1).aggregate(parseOwnerDashboardFilters({}, now), now);
    const sql = d1.log.map((entry) => entry.query).join("\n");
    assert.match(sql, /analytics_events e INNER JOIN valid_sessions/);
    assert.match(sql, /event_schema_version=1/); assert.match(sql, /deleted_at IS NULL/); assert.match(sql, /expires_at>\?2/);
    assert.doesNotMatch(sql, /\bDELETE\b|\bUPDATE\b|\bINSERT\b/i);
  } finally { database.close(); }
});

test("Prompt 20 migration remains intact after the separate Prompt 22 migration", async () => {
  const files = await readdir(new URL("../../drizzle", import.meta.url));
  assert.deepEqual(files.filter((name) => /^0007_.*\.sql$/.test(name)), ["0007_ancient_yellow_claw.sql"]);
  const ledger = JSON.parse(await readFile(new URL("../../drizzle/migration-checksums.json", import.meta.url), "utf8"));
  assert.equal(Object.keys(ledger).length, 11);
  assert.deepEqual(Object.keys(ledger).sort(), files.filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort());
});
