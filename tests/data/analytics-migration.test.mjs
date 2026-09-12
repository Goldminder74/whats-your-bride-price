import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyMigrationPlan,
  createIsolatedDatabase,
  loadMigrationPlan,
} from "../../scripts/data-migrations.mjs";
import {
  ACTIVE_ANALYTICS_EVENT_NAMES,
  validateIngestibleEventName,
} from "../../db/analyticsContracts.ts";

const now = Date.UTC(2026, 7, 25, 12);
const day = 86_400_000;
const sessionHash = "a".repeat(64);
const uuidA = "123e4567-e89b-42d3-a456-426614174000";
const uuidB = "123e4567-e89b-42d3-b456-426614174001";

function insertLegacyRows(database) {
  database.prepare(`INSERT INTO analytics_events (
    id, event_name, properties_json, anonymous_subject_hash, consent_notice_version,
    bot_classification, occurred_at, expires_at, version, created_at, updated_at
  ) VALUES ('analytics_legacy_1','share_handoff_attempted','{"channel":"native"}',
    'legacy_analytics_subject','notice-legacy','human',?,?,?,?,?)`)
    .run(now - day, now + 90 * day, 7, now - day, now);
  database.prepare(`INSERT INTO referral_events (
    id, referral_code, event_type, source, anonymous_subject_hash, occurred_at,
    expires_at, version, created_at, updated_at
  ) VALUES ('referral_legacy_1','legacy-public-code','referred_visit_received','unknown',
    'legacy_referral_subject',?,?,?,?,?)`)
    .run(now - day, now + 90 * day, 4, now - day, now);
  database.prepare(`INSERT INTO share_events (
    id, event_type, channel, anonymous_subject_hash, occurred_at, expires_at,
    version, created_at, updated_at
  ) VALUES ('share_legacy_1','share_handoff_attempted','clipboard',
    'legacy_share_subject',?,?,?,?,?)`)
    .run(now - day, now + 90 * day, 3, now - day, now);
  database.prepare(`INSERT INTO consent_preferences (
    id, anonymous_subject_hash, notice_version, category_version, strictly_functional,
    first_party_statistical, marketing, decided_at, expires_at, version, created_at, updated_at
  ) VALUES ('consent_legacy_1','legacy_consent_subject','notice-legacy','categories-legacy',
    1,0,1,?,?,?,?,?)`)
    .run(now - day, now + 180 * day, 2, now - day, now);
}

function legacyRows(database) {
  return {
    analytics: { ...database.prepare("SELECT id,event_name,properties_json,anonymous_subject_hash,consent_notice_version,bot_classification,occurred_at,expires_at,version,created_at,updated_at FROM analytics_events WHERE id='analytics_legacy_1'").get() },
    referral: { ...database.prepare("SELECT id,referral_code,challenge_id,attempt_id,event_type,source,anonymous_subject_hash,occurred_at,expires_at,version,created_at,updated_at FROM referral_events WHERE id='referral_legacy_1'").get() },
    share: { ...database.prepare("SELECT id,result_id,challenge_id,event_type,channel,anonymous_subject_hash,occurred_at,expires_at,version,created_at,updated_at FROM share_events WHERE id='share_legacy_1'").get() },
    consent: { ...database.prepare("SELECT id,anonymous_subject_hash,notice_version,category_version,strictly_functional,first_party_statistical,marketing,decided_at,withdrawn_at,expires_at,version,created_at,updated_at FROM consent_preferences WHERE id='consent_legacy_1'").get() },
  };
}

function insertV1Analytics(database, overrides = {}) {
  const values = {
    id: `analytics_v1_${Math.random().toString(16).slice(2)}`,
    uuid: uuidA,
    name: "app_visit",
    properties: "{}",
    sessionHash,
    occurredAt: now,
    expiresAt: now + 30 * day,
    ...overrides,
  };
  database.prepare(`INSERT INTO analytics_events (
    id, client_event_uuid, event_schema_version, analytics_session_hash, event_name,
    properties_json, consent_notice_version, bot_classification, occurred_at, expires_at,
    version, created_at, updated_at
  ) VALUES (?,?,1,?,?,?,'analytics-notice-v1','human',?,?,1,?,?)`)
    .run(values.id, values.uuid, values.sessionHash, values.name, values.properties,
      values.occurredAt, values.expiresAt, values.occurredAt, values.occurredAt);
  return values;
}

async function oldDatabaseWithRows() {
  const plan = await loadMigrationPlan();
  const database = createIsolatedDatabase();
  applyMigrationPlan(database, plan.slice(0, 5), { now });
  insertLegacyRows(database);
  return { database, plan };
}

test("0005 is ordered, checksummed, applies to empty and 0000-through-0004 databases, and is inert on replay", async () => {
  const plan = await loadMigrationPlan();
  assert.equal(plan.length, 10);
  assert.match(plan[5].id, /^0005_[a-z0-9_]+$/);
  assert.match(plan[5].checksum, /^[0-9a-f]{64}$/);
  for (const previousCount of [0, 5]) {
    const database = createIsolatedDatabase();
    try {
      if (previousCount) applyMigrationPlan(database, plan.slice(0, previousCount), { now });
      assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied,
        plan.slice(previousCount).map(({ id }) => id));
      assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, []);
    } finally { database.close(); }
  }
});

test("0005 checksum manifest detects migration tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "wybp-analytics-checksum-"));
  await cp(new URL("../../drizzle", import.meta.url), join(root, "drizzle"), { recursive: true });
  const plan = await loadMigrationPlan(root);
  const migration = plan[5];
  const migrationPath = join(root, "drizzle", migration.name);
  await writeFile(migrationPath, `${await readFile(migrationPath, "utf8")}\n-- tampered\n`);
  await assert.rejects(() => loadMigrationPlan(root), /checksum mismatch/i);
});

test("legacy rows, identifiers, event names, codes and attempted-handoff semantics survive without reinterpretation", async () => {
  const { database, plan } = await oldDatabaseWithRows();
  try {
    const before = legacyRows(database);
    applyMigrationPlan(database, plan, { now });
    assert.deepEqual(legacyRows(database), before);
    for (const table of ["analytics_events", "referral_events", "share_events"]) {
      const row = database.prepare(`SELECT client_event_uuid,event_schema_version,analytics_session_hash FROM ${table} LIMIT 1`).get();
      assert.deepEqual({ ...row }, { client_event_uuid: null, event_schema_version: 0, analytics_session_hash: null });
    }
    assert.equal(database.prepare("SELECT analytics_session_hash FROM consent_preferences").get().analytics_session_hash, null);
    assert.equal(database.prepare("SELECT event_type FROM share_events").get().event_type, "share_handoff_attempted");
  } finally { database.close(); }
});

test("version-1 event dictionary, UUID uniqueness, session hashes, retention and JSON bounds are enforced", async () => {
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, await loadMigrationPlan(), { now });
    for (const [index, name] of ACTIVE_ANALYTICS_EVENT_NAMES.entries()) {
      const variant = index % 4 === 0 ? "8" : index % 4 === 1 ? "9" : index % 4 === 2 ? "a" : "b";
      insertV1Analytics(database, { id: `analytics_allowed_${index}`, uuid: `123e4567-e89b-42d3-${variant}${String(index).padStart(3, "0")}-${String(index).padStart(12, "0")}`, name });
    }
    for (const name of ["message_sent", "content_posted", "delivery_confirmed"]) {
      assert.throws(() => insertV1Analytics(database, { id: `bad_${name}`, uuid: uuidB, name }), /CHECK constraint/);
    }
    assert.throws(() => insertV1Analytics(database, { id: "duplicate_uuid", uuid: "123e4567-e89b-42d3-8000-000000000000" }), /UNIQUE constraint/);
    assert.throws(() => insertV1Analytics(database, { id: "bad_uuid", uuid: "not-a-uuid" }), /CHECK constraint/);
    assert.throws(() => insertV1Analytics(database, { id: "raw_session", uuid: uuidB, sessionHash: "c".repeat(32) }), /CHECK constraint/);
    assert.throws(() => insertV1Analytics(database, { id: "long_retention", uuid: uuidB, expiresAt: now + 30 * day + 1 }), /CHECK constraint/);
    assert.throws(() => insertV1Analytics(database, { id: "bad_time", uuid: uuidB, occurredAt: -1 }), /CHECK constraint/);
    assert.throws(() => insertV1Analytics(database, { id: "bad_json", uuid: uuidB, properties: "{" }), /CHECK constraint/);
    assert.throws(() => insertV1Analytics(database, { id: "large_json", uuid: uuidB, properties: JSON.stringify({ value: "x".repeat(2049) }) }), /CHECK constraint/);
  } finally { database.close(); }
});

test("reserved commerce events exist in schema but active ingestion rejects them", () => {
  for (const name of ["offer_view", "checkout_start", "checkout_complete", "purchase_complete", "payment_failed", "refund_complete"]) {
    assert.throws(() => validateIngestibleEventName(name), /reserved|not active/i);
  }
});

test("version-1 referral rows discard public codes and consent rows cannot enable marketing", async () => {
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, await loadMigrationPlan(), { now });
    assert.throws(() => database.prepare(`INSERT INTO referral_events (
      id,client_event_uuid,event_schema_version,analytics_session_hash,referral_code,event_type,
      source,occurred_at,expires_at,version,created_at,updated_at
    ) VALUES ('ref_v1_bad',?,1,?,'raw-public-code','referred_visit','challenge',?,?,1,?,?)`)
      .run(uuidA, sessionHash, now, now + day, now, now), /CHECK constraint/);
    assert.throws(() => database.prepare(`INSERT INTO consent_preferences (
      id,anonymous_subject_hash,analytics_session_hash,notice_version,category_version,
      strictly_functional,first_party_statistical,marketing,decided_at,expires_at,version,created_at,updated_at
    ) VALUES ('consent_v1_bad',NULL,?,'analytics-notice-v1','analytics-v1',1,1,1,?,?,1,?,?)`)
      .run(sessionHash, now, now + 180 * day, now, now), /CHECK constraint/);
    database.prepare(`INSERT INTO consent_preferences (
      id,anonymous_subject_hash,analytics_session_hash,notice_version,category_version,
      strictly_functional,first_party_statistical,marketing,decided_at,expires_at,version,created_at,updated_at
    ) VALUES ('consent_v1_ok',NULL,?,'analytics-notice-v1','analytics-v1',1,1,0,?,?,1,?,?)`)
      .run(sessionHash, now, now + 180 * day, now, now);
    assert.throws(() => database.prepare(`INSERT INTO consent_preferences (
      id,anonymous_subject_hash,analytics_session_hash,notice_version,category_version,
      strictly_functional,first_party_statistical,marketing,decided_at,expires_at,version,created_at,updated_at
    ) VALUES ('consent_v1_duplicate',NULL,?,'analytics-notice-v1','analytics-v1',1,1,0,?,?,1,?,?)`)
      .run(sessionHash, now, now + 180 * day, now, now), /UNIQUE constraint/);
  } finally { database.close(); }
});

test("required indexes and foreign-key integrity survive the four-table rebuild", async () => {
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, await loadMigrationPlan(), { now });
    const names = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type='index'").all().map(({ name }) => name));
    for (const name of [
      "analytics_events_client_uuid_uq", "analytics_events_session_time_idx", "analytics_events_name_time_idx", "analytics_events_retention_idx",
      "referral_events_client_uuid_uq", "referral_events_challenge_type_time_idx", "referral_events_session_time_idx", "referral_events_retention_idx",
      "share_events_client_uuid_uq", "share_events_type_channel_time_idx", "share_events_session_time_idx", "share_events_retention_idx",
      "consent_preferences_session_notice_uq", "consent_preferences_expiry_idx",
    ]) assert.equal(names.has(name), true, name);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { database.close(); }
});

test("client event UUID replay is rejected across event tables", async () => {
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, await loadMigrationPlan(), { now });
    insertV1Analytics(database, { id: "analytics_cross_table", uuid: uuidA });
    assert.throws(() => database.prepare(`INSERT INTO share_events (
      id,client_event_uuid,event_schema_version,analytics_session_hash,event_type,channel,
      occurred_at,expires_at,version,created_at,updated_at
    ) VALUES ('share_cross_table',?,1,?,'share_handoff','native',?,?,1,?,?)`)
      .run(uuidA, sessionHash, now, now + day, now, now), /client event UUID already used/);
  } finally { database.close(); }
});

test("a failed 0005 replacement rolls back every table and leaves original rows intact", async () => {
  const { database, plan } = await oldDatabaseWithRows();
  try {
    const before = legacyRows(database);
    const migration = plan[5];
    const failingPlan = [{ ...migration, checksum: createHash("sha256").update("failing-test").digest("hex"), statements: [...migration.statements, "INSERT INTO table_that_does_not_exist VALUES (1)"] }];
    assert.throws(() => applyMigrationPlan(database, failingPlan, { now }), /table_that_does_not_exist/);
    assert.deepEqual(legacyRows(database), before);
    assert.equal(database.prepare("SELECT count(*) AS count FROM pragma_table_info('analytics_events') WHERE name='client_event_uuid'").get().count, 0);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { database.close(); }
});
