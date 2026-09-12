import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applyMigrationPlan, createIsolatedDatabase, loadMigrationPlan } from "../../scripts/data-migrations.mjs";

const now = Date.UTC(2026, 8, 9);
const owner = "a".repeat(64);
const recovery = "b".repeat(64);
const oldChecksums = Object.freeze([
  "3de5ecdbeb6f60cea664f10dcd5f95144d63bf343b9dd9c22d68c764cc1cdf6a",
  "8f311c1b0da59394e03811270a67e9b593ca39cef2dd9b964a51d8668675a816",
  "16750df69b0f23cc2f6c2b2e8c55689fd6a2473d7a0c4665a8b2ee4f7e1f64a7",
  "3eb81a835dcff39f8bc796483b2ca7de1a8f1c29dd218e5c43779f7edcc31fdb",
  "c649185f96cdce28aca0522330649b4688c9f1da93ea6eab0c08842b163b65bc",
  "a13ac6180fa745732266fc922f89d2cd1e10f5f9c88d90e4f310ff833b09701d",
  "a34516dbc54f58557dcebd37f31a5a9c212905865bc57fffd9ab56f95e38e52e",
  "10be0f218f97d556a5af73d29481eafce8a5ca3a0bfc56d22e1b33c4de119076",
  "1c0082c156e094b1af4641596301b6709a2750b0f9b291e96f57945e7f7cd1fe",
]);

function insertWallet(database, suffix = "1", overrides = {}) {
  const values = { id: `wallet_${suffix.repeat(32)}`, public: `cw_${suffix.repeat(32)}`, owner: suffix.repeat(64), recovery: (suffix === "f" ? "e" : "f").repeat(64), ...overrides };
  database.prepare(`INSERT INTO cowrie_wallets (id,public_reference,anonymous_owner_hash,state,free_quick_plays_consumed,purchased_balance,bonus_balance,recovery_credential_hash,recovery_credential_version,version,created_at,updated_at) VALUES (?,?,?,'active',0,0,0,?,1,1,?,?)`).run(values.id, values.public, values.owner, values.recovery, now, now);
  return values;
}

test("0009 is the only checksummed additive migration and upgrades 0008 without changing historical rows", async () => {
  const plan = await loadMigrationPlan();
  assert.equal(plan.length, 10);
  assert.deepEqual(plan.slice(0, 9).map((entry) => entry.checksum), oldChecksums);
  const migration = plan.at(-1);
  assert.equal(migration.id, "0009_clammy_shooting_star");
  const raw = await readFile(new URL("../../drizzle/0009_clammy_shooting_star.sql", import.meta.url));
  assert.equal(createHash("sha256").update(raw).digest("hex"), migration.checksum);
  assert.doesNotMatch(raw.toString(), /CREATE TABLE `(?!cowrie_wallets|cowrie_ledger|cowrie_purchase_allocations)/);
  assert.doesNotMatch(raw.toString(), /INSERT INTO [`"]?(questions|quiz_editions|commerce_orders)/i);
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, plan.slice(0, 9), { now });
    database.prepare("INSERT INTO quiz_editions (id,edition_key,name,region,version,status,created_at,updated_at) VALUES ('edition_preserved','west','Preserved','West',1,'active',?,?)").run(now, now);
    database.prepare("INSERT INTO quiz_attempts (id,edition_id,anonymous_subject_hash,question_set_version,scoring_version,selected_question_versions_json,status,idempotency_key_hash,started_at,expires_at,version,created_at,updated_at) VALUES ('historical_attempt','edition_preserved',?,'approved-60-v1','binary-exact-set-v1','[]','in_progress',?, ?,?,1,?,?)").run(owner, "1".repeat(64), now, now + 86400000, now, now);
    const before = { ...database.prepare("SELECT * FROM quiz_attempts WHERE id='historical_attempt'").get() };
    assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, [migration.id]);
    assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, []);
    assert.equal(database.prepare("SELECT name FROM quiz_editions WHERE id='edition_preserved'").get().name, "Preserved");
    const { cowrie_issued_at: issuedAt, ...after } = database.prepare("SELECT * FROM quiz_attempts WHERE id='historical_attempt'").get();
    assert.equal(issuedAt, null); assert.deepEqual(after, before);
    const column = database.prepare("PRAGMA table_info(quiz_attempts)").all().find(row => row.name === "cowrie_issued_at");
    assert.equal(column.type, "INTEGER"); assert.equal(column.notnull, 0); assert.equal(column.dflt_value, null);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally { database.close(); }
});

test("a failure after the issuance column and Cowrie tables are added rolls back the entire migration", async () => {
  const database = createIsolatedDatabase();
  try {
    const plan = await loadMigrationPlan(); applyMigrationPlan(database, plan.slice(0, 9), { now });
    const broken = { ...plan[9], statements: [...plan[9].statements, "SELECT * FROM deliberately_missing_cowrie_migration_table"] };
    assert.throws(() => applyMigrationPlan(database, [...plan.slice(0, 9), broken], { now }), /no such table/);
    assert.equal(database.prepare("PRAGMA table_info(quiz_attempts)").all().some(row => row.name === "cowrie_issued_at"), false);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name LIKE 'cowrie_%'").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM schema_migrations").get().count, 9);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, [plan[9].id]);
    assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, []);
  } finally { database.close(); }
});

test("0009 creates exactly the wallet tables, required indexes and append-only reconciliation triggers", async () => {
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, await loadMigrationPlan(), { now });
    const names = database.prepare("SELECT name,type FROM sqlite_master WHERE name LIKE 'cowrie_%' ORDER BY type,name").all();
    const tables = names.filter((row) => row.type === "table").map((row) => row.name);
    assert.deepEqual(tables, ["cowrie_ledger", "cowrie_purchase_allocations", "cowrie_wallets"]);
    for (const required of ["cowrie_wallets_live_owner_uq", "cowrie_ledger_idempotency_uq", "cowrie_ledger_reversal_uq", "cowrie_allocations_order_uq", "cowrie_ledger_append_only_update", "cowrie_ledger_append_only_delete", "cowrie_ledger_active_wallet_guard", "cowrie_ledger_reconcile_wallet"]) assert.ok(names.some((row) => row.name === required), required);
    const wallet = insertWallet(database, "1", { owner, recovery });
    database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,reason_code,created_at) VALUES (?,?, 'purchased','purchase_credit',3,'purchase',?,'verified_purchase',?)`).run(`ledger_${"2".repeat(32)}`, wallet.id, "2".repeat(64), now);
    database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_achievement_key,reason_code,bonus_expires_at,created_at) VALUES (?,?,'bonus','bonus_credit',2,'bonus',?,'daily_streak_7:west:2026-09-09','daily_streak_7',?,?)`).run(`ledger_${"3".repeat(32)}`, wallet.id, "3".repeat(64), now + 180 * 86_400_000, now);
    let balance = database.prepare("SELECT purchased_balance,bonus_balance FROM cowrie_wallets WHERE id=?").get(wallet.id);
    assert.equal(balance.purchased_balance, 3); assert.equal(balance.bonus_balance, 2);
    database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,reason_code,created_at) VALUES (?,?,'bonus','quick_play_debit',-1,'quick_play',?,'random_quick_play',?)`).run(`ledger_${"4".repeat(32)}`, wallet.id, "4".repeat(64), now + 1);
    balance = database.prepare("SELECT purchased_balance,bonus_balance FROM cowrie_wallets WHERE id=?").get(wallet.id);
    assert.equal(balance.purchased_balance, 3); assert.equal(balance.bonus_balance, 1);
    assert.throws(() => database.prepare("UPDATE cowrie_ledger SET delta=2 WHERE id=?").run(`ledger_${"2".repeat(32)}`), /append only/i);
    assert.throws(() => database.prepare("DELETE FROM cowrie_ledger WHERE id=?").run(`ledger_${"2".repeat(32)}`), /append only/i);
  } finally { database.close(); }
});

test("0009 enforces owner, hash, state, idempotency, bucket and non-negative balance integrity", async () => {
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, await loadMigrationPlan(), { now });
    const wallet = insertWallet(database, "5");
    assert.throws(() => insertWallet(database, "6", { owner: wallet.owner }), /UNIQUE/);
    assert.throws(() => insertWallet(database, "7", { owner: "BAD", recovery: "7".repeat(64) }), /cowrie_wallets_owner_hash_ck/);
    assert.throws(() => database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,reason_code,created_at) VALUES (?,?,'bonus','quick_play_debit',-1,'quick_play',?,'random_quick_play',?)`).run(`ledger_${"8".repeat(32)}`, wallet.id, "8".repeat(64), now), /insufficient bonus/i);
    database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_achievement_key,reason_code,bonus_expires_at,created_at) VALUES (?,?,'bonus','bonus_credit',1,'bonus',?,'perfect_region_day:west:2026-09-09','perfect_region_day',?,?)`).run(`ledger_${"9".repeat(32)}`, wallet.id, "9".repeat(64), now + 180 * 86_400_000, now);
    assert.throws(() => database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_achievement_key,reason_code,bonus_expires_at,created_at) VALUES (?,?,'bonus','bonus_credit',1,'bonus',?,'perfect_region_day:west:other','perfect_region_day',?,?)`).run(`ledger_${"a".repeat(32)}`, wallet.id, "9".repeat(64), now + 180 * 86_400_000, now), /UNIQUE/);
    assert.throws(() => database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,reason_code,created_at) VALUES (?,?,'mystery','quick_play_debit',-1,'quick_play',?,'random_quick_play',?)`).run(`ledger_${"b".repeat(32)}`, wallet.id, "b".repeat(64), now), /cowrie_ledger_bucket_ck/);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally { database.close(); }
});

test("a failed Cowrie transaction rolls back its allowance and attempt together", async () => {
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, await loadMigrationPlan(), { now });
    const wallet = insertWallet(database, "c");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("UPDATE cowrie_wallets SET free_quick_plays_consumed=1 WHERE id=?").run(wallet.id);
      database.prepare("INSERT INTO quiz_attempts (id) VALUES ('invalid')").run();
      database.exec("COMMIT");
      assert.fail("invalid attempt should fail");
    } catch { database.exec("ROLLBACK"); }
    assert.equal(database.prepare("SELECT free_quick_plays_consumed FROM cowrie_wallets WHERE id=?").get(wallet.id).free_quick_plays_consumed, 0);
  } finally { database.close(); }
});
