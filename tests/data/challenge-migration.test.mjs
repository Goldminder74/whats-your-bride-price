import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertSha256Hash } from "../../db/challengeService.ts";
import {
  applyMigrationPlan,
  createIsolatedDatabase,
  loadMigrationPlan,
} from "../../scripts/data-migrations.mjs";

const now = Date.UTC(2026, 7, 24, 12);
const code = (character) => character.repeat(48);
const hash = (character) => character.repeat(64);

function insertEdition(database) {
  database.prepare(`INSERT INTO quiz_editions
    (id, edition_key, name, region, version, status, created_at, updated_at)
    VALUES ('edition_west_v1','west','West Africa','Synthetic scope',1,'active',?,?)`).run(now, now);
}

function insertChallenge(database, overrides = {}) {
  const values = {
    id: "challenge_synthetic_0001",
    publicCode: code("a"),
    creationHash: null,
    revocationHash: null,
    ...overrides,
  };
  database.prepare(`INSERT INTO challenges (
    id, public_code, inviter_result_id, creation_idempotency_key_hash, revocation_token_hash,
    edition_id, verified_score_to_beat, total, scoring_version, state, use_count,
    expires_at, version, created_at, updated_at
  ) VALUES (?, ?, NULL, ?, ?, 'edition_west_v1', 8, 12, 'binary-exact-set-v1', 'active', 0, ?, 1, ?, ?)`)
    .run(values.id, values.publicCode, values.creationHash, values.revocationHash, now + 1000, now, now);
  return values;
}

test("0002 is the sole additive challenge-security migration with the approved checksum", async () => {
  const plan = await loadMigrationPlan();
  assert.equal(plan.length, 3);
  assert.equal(plan[2].id, "0002_little_inertia");
  assert.equal(plan[2].checksum, "16750df69b0f23cc2f6c2b2e8c55689fd6a2473d7a0c4665a8b2ee4f7e1f64a7");
  assert.equal(plan[2].statements.length, 4);
  assert.match(plan[2].statements[0], /^ALTER TABLE `challenges` ADD `creation_idempotency_key_hash` text;$/);
  assert.match(plan[2].statements[1], /^ALTER TABLE `challenges` ADD `revocation_token_hash` text;$/);
  assert.match(plan[2].statements[2], /CREATE UNIQUE INDEX `challenges_creation_idempotency_hash_uq`[\s\S]+WHERE[\s\S]+is not null/);
  assert.match(plan[2].statements[3], /CREATE UNIQUE INDEX `challenges_revocation_token_hash_uq`[\s\S]+WHERE[\s\S]+is not null/);

  const checksums = JSON.parse(await readFile(new URL("../../drizzle/migration-checksums.json", import.meta.url), "utf8"));
  assert.deepEqual(checksums, {
    "0000_loving_stepford_cuckoos.sql": "3de5ecdbeb6f60cea664f10dcd5f95144d63bf343b9dd9c22d68c764cc1cdf6a",
    "0001_same_vertigo.sql": "8f311c1b0da59394e03811270a67e9b593ca39cef2dd9b964a51d8668675a816",
    "0002_little_inertia.sql": "16750df69b0f23cc2f6c2b2e8c55689fd6a2473d7a0c4665a8b2ee4f7e1f64a7",
  });
  for (const [name, expected] of Object.entries(checksums)) {
    const bytes = await readFile(new URL(`../../drizzle/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected);
  }
});

test("empty database applies all migrations once and repeated runner execution is inert", async () => {
  const database = createIsolatedDatabase();
  try {
    const plan = await loadMigrationPlan();
    assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, plan.map(({ id }) => id));
    assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, []);
    const columns = database.prepare("SELECT name FROM pragma_table_info('challenges')").all().map((row) => row.name);
    assert.ok(columns.includes("creation_idempotency_key_hash"));
    assert.ok(columns.includes("revocation_token_hash"));
  } finally { database.close(); }
});

test("upgrade from 0000 and 0001 preserves historical challenge rows and nullable compatibility", async () => {
  const database = createIsolatedDatabase();
  try {
    const plan = await loadMigrationPlan();
    applyMigrationPlan(database, plan.slice(0, 2), { now });
    insertEdition(database);
    database.prepare(`INSERT INTO challenges (
      id, public_code, inviter_result_id, edition_id, verified_score_to_beat, total,
      scoring_version, state, use_count, expires_at, version, created_at, updated_at
    ) VALUES ('challenge_historical_0001', ?, NULL, 'edition_west_v1', 7, 12,
      'binary-exact-set-v1', 'active', 0, ?, 1, ?, ?)`).run(code("b"), now + 1000, now, now);

    assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, ["0002_little_inertia"]);
    assert.deepEqual({ ...database.prepare(`SELECT id, creation_idempotency_key_hash, revocation_token_hash
      FROM challenges WHERE id='challenge_historical_0001'`).get() }, {
      id: "challenge_historical_0001",
      creation_idempotency_key_hash: null,
      revocation_token_hash: null,
    });
    insertChallenge(database, { id: "challenge_historical_0002", publicCode: code("c") });
    assert.equal(database.prepare("SELECT count(*) AS count FROM challenges WHERE creation_idempotency_key_hash IS NULL").get().count, 2);
  } finally { database.close(); }
});

test("unique partial indexes reject duplicate non-null hashes independently", async () => {
  const database = createIsolatedDatabase();
  try {
    const plan = await loadMigrationPlan();
    applyMigrationPlan(database, plan, { now });
    insertEdition(database);
    insertChallenge(database, { creationHash: hash("a"), revocationHash: hash("b") });
    assert.throws(() => insertChallenge(database, {
      id: "challenge_synthetic_0002", publicCode: code("d"), creationHash: hash("a"), revocationHash: hash("c"),
    }), /UNIQUE constraint failed: challenges\.creation_idempotency_key_hash/);
    assert.throws(() => insertChallenge(database, {
      id: "challenge_synthetic_0003", publicCode: code("e"), creationHash: hash("c"), revocationHash: hash("b"),
    }), /UNIQUE constraint failed: challenges\.revocation_token_hash/);
    const indexes = database.prepare("SELECT name, sql FROM sqlite_schema WHERE type='index' AND tbl_name='challenges' ORDER BY name").all();
    for (const name of ["challenges_creation_idempotency_hash_uq", "challenges_revocation_token_hash_uq"]) {
      const index = indexes.find((entry) => entry.name === name);
      assert.match(index?.sql || "", /CREATE UNIQUE INDEX[\s\S]+WHERE[\s\S]+is not null/);
    }
  } finally { database.close(); }
});

test("application validation rejects malformed hashes while accepting exact lowercase SHA-256", () => {
  assert.equal(assertSha256Hash(hash("a"), "creation_idempotency_key"), hash("a"));
  for (const malformed of ["", "a".repeat(63), "A".repeat(64), "g".repeat(64), "a".repeat(65)]) {
    assert.throws(() => assertSha256Hash(malformed, "creation_idempotency_key"), /invalid_creation_idempotency_key_hash/);
    assert.throws(() => assertSha256Hash(malformed, "revocation_token"), /invalid_revocation_token_hash/);
  }
});
