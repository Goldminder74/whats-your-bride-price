import assert from "node:assert/strict";
import test from "node:test";
import { applyMigrationPlan, createIsolatedDatabase, loadMigrationPlan } from "../../scripts/data-migrations.mjs";
import { buildDevelopmentSeed, developmentSeedStatements } from "../../db/seeds/development.ts";
import { CowrieWalletService, D1CowrieWalletRepository } from "../../db/cowrieWallet.ts";
import { D1QuestionSelectionRepository } from "../../db/questionSelection.ts";
import { completeCowrieQuickPlay } from "../../db/cowrieCompletion.ts";
import { defaultAvatarId } from "../../app/avatarRegistry.ts";

const now = Date.UTC(2026, 8, 9);
class Statement {
  constructor(database, sql, params = []) { this.database = database; this.sql = sql; this.params = params; }
  bind(...params) { return new Statement(this.database, this.sql, params); }
  execute() { if (/^\s*(SELECT|WITH)\b/i.test(this.sql)) return { success: true, results: this.database.prepare(this.sql).all(...this.params).map(row => ({ ...row })), meta: { changes: 0 } }; const result = this.database.prepare(this.sql).run(...this.params); return { success: true, results: [], meta: { changes: Number(result.changes) } }; }
  async run() { return this.execute(); }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.params).map((row) => ({ ...row })), meta: {} }; }
  async first(column) { const row = this.database.prepare(this.sql).get(...this.params); return row ? column ? row[column] : { ...row } : null; }
}
class Adapter {
  constructor(database) { this.database = database; }
  prepare(sql) { return new Statement(this.database, sql); }
  async batch(statements) { this.database.exec("BEGIN IMMEDIATE"); try { const results = statements.map(statement => statement.execute()); this.database.exec("COMMIT"); return results; } catch (error) { this.database.exec("ROLLBACK"); throw error; } }
}
async function setup() {
  const database = createIsolatedDatabase(); applyMigrationPlan(database, await loadMigrationPlan(), { now });
  const seed = await buildDevelopmentSeed(); for (const statement of developmentSeedStatements(seed)) database.prepare(statement.sql).run(...statement.params);
  const prototype = { ...database.prepare("SELECT * FROM questions WHERE stable_id='west_q01'").get() };
  const columns = Object.keys(prototype);
  const insert = database.prepare(`INSERT INTO questions (${columns.map((name) => `"${name}"`).join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
  for (let index = 0; index < 18; index += 1) { const row = { ...prototype, id: `question_test_extra_${index}`, stable_id: `west_extra_${String(index).padStart(3, "0")}` }; insert.run(...columns.map((column) => row[column])); }
  const adapter = new Adapter(database); const selection = new D1QuestionSelectionRepository(adapter); const repository = new D1CowrieWalletRepository(adapter, selection);
  let byte = 1; const service = new CowrieWalletService(repository, { now: () => now, randomSource: (bytes) => { bytes.fill(byte++); return bytes; } });
  return { database, adapter, repository, service };
}
const owner = "a".repeat(32);
const request = (id) => ({ region: "west", anonymousSessionCredential: owner, idempotencyKey: `actual-d1-cowrie-${id}` });

async function paidSetup() {
  const context = await setup(); const { database, service } = context;
  const created = await service.createOrGet({ anonymousSessionCredential: owner });
  await service.startQuickPlay(request("free-one")); await service.startQuickPlay(request("free-two"));
  const wallet = database.prepare("SELECT * FROM cowrie_wallets").get();
  database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_achievement_key,reason_code,bonus_expires_at,created_at) VALUES (?,?,'bonus','bonus_credit',2,'bonus',?,'daily_streak_7:all:daily-streak-v1','daily_streak_7',?,?)`).run(`ledger_${"f".repeat(32)}`, wallet.id, "f".repeat(64), now + 180 * 86400000, now);
  return { ...context, created };
}

async function preparePaid(context, suffix = "prepared") {
  const { service, repository } = context;
  const commit = repository.commitIssuance.bind(repository);
  const reverse = repository.reverseUnissued.bind(repository);
  repository.commitIssuance = async () => { throw new Error("injected before issuance"); };
  repository.reverseUnissued = async () => false;
  try { await assert.rejects(service.startQuickPlay(request(suffix)), /cowrie_access_conflict/); }
  finally { repository.commitIssuance = commit; repository.reverseUnissued = reverse; }
  const row = context.database.prepare("SELECT qa.*,debit.wallet_id FROM quiz_attempts qa JOIN cowrie_ledger debit ON debit.related_attempt_id=qa.id WHERE debit.entry_type='quick_play_debit' AND qa.cowrie_issued_at IS NULL AND qa.status='in_progress' ORDER BY qa.created_at LIMIT 1").get();
  assert.ok(row); assert.equal(row.cowrie_issued_at, null);
  return { walletId: row.wallet_id, ownerHash: row.anonymous_subject_hash, idempotencyHash: row.idempotency_key_hash, now };
}

function terminalState(database, transition) {
  const attempt = database.prepare("SELECT id,status,cowrie_issued_at FROM quiz_attempts WHERE idempotency_key_hash=?").get(transition.idempotencyHash);
  const debits = database.prepare("SELECT COUNT(*) count FROM cowrie_ledger WHERE entry_type='quick_play_debit' AND idempotency_hash=?").get(transition.idempotencyHash).count;
  const reversals = database.prepare("SELECT COUNT(*) count FROM cowrie_ledger WHERE entry_type='technical_reversal' AND related_attempt_id=?").get(attempt.id).count;
  assert.equal(debits, 1); assert.equal(reversals, attempt.cowrie_issued_at === null ? 1 : 0);
  assert.equal(attempt.status, attempt.cowrie_issued_at === null ? "abandoned" : "in_progress");
  assert.equal(database.prepare("SELECT bonus_balance FROM cowrie_wallets WHERE id=?").get(transition.walletId).bonus_balance, reversals ? 2 : 1);
  assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  return attempt;
}

test("paid issuance accepts a valid UTC integer once and SQL cannot clear, replace or insert the marker", async () => {
  const context = await paidSetup(); const { database, repository } = context;
  try {
    const transition = await preparePaid(context);
    const id = database.prepare("SELECT id FROM quiz_attempts WHERE idempotency_key_hash=?").get(transition.idempotencyHash).id;
    const selection = new D1QuestionSelectionRepository(context.adapter);
    assert.equal(await selection.getAttempt(id, transition.ownerHash, now), null);
    assert.equal(await selection.judgeAttemptAnswer(id, transition.ownerHash, "west_q01", ["o1"], now), null);
    for (const invalid of [0, -1, now + 0.5, "invalid", 8640000000000001]) assert.throws(() => database.prepare("UPDATE quiz_attempts SET cowrie_issued_at=? WHERE id=?").run(invalid, id), /cowrie_issued_at_ck/);
    assert.equal(await repository.commitIssuance({ ...transition, now: now + 1 }), true);
    assert.equal(await repository.commitIssuance({ ...transition, now: now + 2 }), true);
    assert.equal(database.prepare("SELECT cowrie_issued_at FROM quiz_attempts WHERE id=?").get(id).cowrie_issued_at, now + 1);
    assert.throws(() => database.prepare("UPDATE quiz_attempts SET cowrie_issued_at=NULL WHERE id=?").run(id), /immutable/);
    assert.throws(() => database.prepare("UPDATE quiz_attempts SET cowrie_issued_at=? WHERE id=?").run(now + 3, id), /immutable/);
    assert.throws(() => database.prepare("INSERT INTO quiz_attempts (id,cowrie_issued_at) VALUES ('forged',?)").run(now), /persisted authority/);
    assert.ok(await selection.getAttempt(id, transition.ownerHash, now + 2));
    assert.equal(await repository.reverseUnissued(transition), false); terminalState(database, transition);
  } finally { database.close(); }
});

test("failed attempt insertion cannot commit a debit, allowance or orphan financial row", async () => {
  const context = await paidSetup(); const { database, adapter, service } = context;
  try {
    const batch = adapter.batch.bind(adapter); const before = database.prepare("SELECT * FROM cowrie_wallets").get();
    adapter.batch = async statements => {
      if (!statements.some(statement => statement.sql.startsWith("INSERT INTO quiz_attempts"))) return batch(statements);
      database.exec("BEGIN IMMEDIATE");
      try { statements[0].execute(); throw new Error("injected attempt creation failure"); }
      finally { database.exec("ROLLBACK"); }
    };
    await assert.rejects(service.startQuickPlay(request("failed-creation")), /cowrie_access_conflict/);
    assert.deepEqual({ ...database.prepare("SELECT * FROM cowrie_wallets").get() }, { ...before });
    assert.equal(database.prepare("SELECT COUNT(*) count FROM cowrie_ledger WHERE entry_type='quick_play_debit'").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM quiz_attempts").get().count, 2);
    // Foreign-key ordering makes a debit before its attempt structurally impossible.
    assert.throws(() => database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_attempt_id,reason_code,created_at) VALUES (?,?,'bonus','quick_play_debit',-1,'quick_play',?,'missing_attempt','random_quick_play',?)`).run(`ledger_${"e".repeat(32)}`, before.id, "e".repeat(64), now), /FOREIGN KEY/);
    assert.equal(database.prepare("SELECT bonus_balance FROM cowrie_wallets").get().bonus_balance, 2);
  } finally { database.close(); }
});

for (const phase of ["after attempt creation", "immediately before marker update"]) {
  test(`failure ${phase} automatically restores one Cowrie and retires the unissued attempt`, async () => {
    const context = await paidSetup(); const { database, repository, service } = context;
    try {
      if (phase === "after attempt creation") {
        const projection = repository.getExpiredBonusBalance.bind(repository); let count = 0;
        repository.getExpiredBonusBalance = async (...args) => { if (++count === 2) throw new Error("injected projection failure"); return projection(...args); };
      } else repository.commitIssuance = async () => { throw new Error("injected marker failure"); };
      await assert.rejects(service.startQuickPlay(request("preissue-failure")), /cowrie_access_conflict/);
      const row = database.prepare("SELECT qa.idempotency_key_hash,qa.anonymous_subject_hash,debit.wallet_id FROM quiz_attempts qa JOIN cowrie_ledger debit ON debit.related_attempt_id=qa.id WHERE debit.entry_type='quick_play_debit'").get();
      const transition = { walletId: row.wallet_id, ownerHash: row.anonymous_subject_hash, idempotencyHash: row.idempotency_key_hash, now };
      const attempt = terminalState(database, transition);
      assert.equal(await repository.reverseUnissued(transition), false);
      assert.equal(await repository.commitIssuance(transition).catch(() => false), false);
      assert.equal(await new D1QuestionSelectionRepository(context.adapter).getAttempt(attempt.id, transition.ownerHash, now), null);
      await assert.rejects(service.startQuickPlay(request("preissue-failure")), /cowrie_access_conflict/);
    } finally { database.close(); }
  });
}

test("post-issuance return failure does not refund and the same key recovers the exact issued ordering", async () => {
  const context = await paidSetup(); const { database, repository, service } = context;
  try {
    const commit = repository.commitIssuance.bind(repository);
    repository.commitIssuance = async input => { await commit(input); throw new Error("injected response/network loss after commit"); };
    await assert.rejects(service.startQuickPlay(request("network-failure")), /cowrie_access_conflict/);
    const row = database.prepare("SELECT qa.*,debit.wallet_id FROM quiz_attempts qa JOIN cowrie_ledger debit ON debit.related_attempt_id=qa.id WHERE debit.entry_type='quick_play_debit'").get();
    const transition = { walletId: row.wallet_id, ownerHash: row.anonymous_subject_hash, idempotencyHash: row.idempotency_key_hash, now };
    terminalState(database, transition); repository.commitIssuance = commit;
    const retry = await service.startQuickPlay(request("network-failure"));
    assert.equal(retry.selection.attemptId, row.id); assert.equal(retry.access, "bonus");
    assert.deepEqual(retry.selection.questions.map(question => ({ stableId: question.questionRef, version: question.version, optionOrder: question.options.map(option => option.id) })), JSON.parse(row.selected_question_versions_json));
    assert.equal(database.prepare("SELECT cowrie_issued_at FROM quiz_attempts WHERE id=?").get(row.id).cowrie_issued_at, row.cowrie_issued_at);
    assert.doesNotMatch(JSON.stringify(retry), /cowrie_issued|cowrieIssued|idempotency.*hash|owner.*hash|ledger_/);
    terminalState(database, transition);
  } finally { database.close(); }
});

for (const winner of ["issuance", "reversal"]) {
  test(`${winner} wins the concurrent conditional transition and the other terminal outcome cannot succeed`, async () => {
    const context = await paidSetup(); const { database, repository } = context;
    try {
      const transition = await preparePaid(context);
      let release; const winnerCommitted = new Promise(resolve => { release = resolve; });
      const batch = context.adapter.batch.bind(context.adapter);
      context.adapter.batch = async statements => {
        const issuance = statements[0].sql.includes("SET cowrie_issued_at=");
        const reversal = statements[0].sql.includes("SET status='abandoned'");
        if ((issuance && winner === "reversal") || (reversal && winner === "issuance")) await winnerCommitted;
        const results = await batch(statements);
        if ((issuance && winner === "issuance") || (reversal && winner === "reversal")) release();
        return results;
      };
      const operations = winner === "issuance" ? [repository.commitIssuance(transition), repository.reverseUnissued(transition)] : [repository.reverseUnissued(transition), repository.commitIssuance(transition)];
      assert.deepEqual(await Promise.all(operations), [true, false]);
      const attempt = terminalState(database, transition);
      assert.equal(await repository.reverseUnissued(transition), false);
      if (winner === "reversal") {
        assert.equal(await repository.commitIssuance(transition), false);
        assert.equal(await new D1QuestionSelectionRepository(context.adapter).getAttempt(attempt.id, transition.ownerHash, now), null);
        await assert.rejects(context.service.startQuickPlay(request("prepared")), /cowrie_access_conflict/);
        const next = await context.service.startQuickPlay(request("new-key")); assert.notEqual(next.selection.attemptId, attempt.id); assert.equal(next.wallet.bonusBalance, 1);
      }
    } finally { database.close(); }
  });
}

test("two concurrent pre-issuance retries and a double-clicked paid start return one issued attempt and debit", async () => {
  for (const prepared of [true, false]) {
    const context = await paidSetup(); const { database, service } = context;
    try {
      if (prepared) await preparePaid(context, "double-click");
      const [first, second] = await Promise.all([service.startQuickPlay(request("double-click")), service.startQuickPlay(request("double-click"))]);
      assert.deepEqual(first.selection, second.selection); assert.equal(first.access, "bonus"); assert.equal(second.access, "bonus");
      const row = database.prepare("SELECT * FROM quiz_attempts WHERE id=?").get(first.selection.attemptId);
      terminalState(database, { walletId: database.prepare("SELECT id FROM cowrie_wallets").get().id, ownerHash: row.anonymous_subject_hash, idempotencyHash: row.idempotency_key_hash, now });
      assert.equal(database.prepare("SELECT COUNT(*) count FROM quiz_attempts").get().count, 3);
    } finally { database.close(); }
  }
});

test("wallet recovery settles pending funded attempts once before rebinding and preserves consumed free plays", async () => {
  const context = await paidSetup(); const { database, service } = context;
  try {
    const raw = context.created.recoveryCredential;
    const transition = await preparePaid(context, "recover-pending");
    const recovered = await service.recover({ walletReference: database.prepare("SELECT public_reference FROM cowrie_wallets").get().public_reference, recoveryCredential: raw, anonymousSessionCredential: "b".repeat(32) });
    assert.equal(recovered.wallet.bonusBalance, 2); assert.equal(recovered.wallet.freeQuickPlaysRemaining, 0);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM cowrie_ledger WHERE entry_type='technical_reversal'").get().count, 1);
    assert.equal(database.prepare("SELECT status FROM quiz_attempts WHERE idempotency_key_hash=?").get(transition.idempotencyHash).status, "abandoned");
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(await context.repository.commitIssuance(transition), false);
  } finally { database.close(); }
});

test("an unissued reversed bonus retains its original expiry even if the remaining credit already expired", async () => {
  const context = await paidSetup(); const { database, repository } = context;
  try {
    const transition = await preparePaid(context);
    const expiredAt = now + 180 * 86400000;
    assert.equal(await repository.expireBonuses({ walletId: transition.walletId, now: expiredAt, limit: 1 }), 1);
    assert.equal(await repository.reverseUnissued({ ...transition, now: expiredAt }), true);
    assert.equal(await repository.getExpiredBonusBalance(transition.walletId, expiredAt), 1);
    assert.equal(await repository.expireBonuses({ walletId: transition.walletId, now: expiredAt, limit: 1 }), 1);
    assert.equal(await repository.expireBonuses({ walletId: transition.walletId, now: expiredAt, limit: 1 }), 0);
    assert.equal(database.prepare("SELECT bonus_balance FROM cowrie_wallets").get().bonus_balance, 0);
  } finally { database.close(); }
});

test("purchased reversal restores the exact allocation once and purchased value never expires", async () => {
  const context = await paidSetup(); const { database, adapter, service, repository } = context;
  try {
    const first = database.prepare("SELECT id FROM quiz_attempts ORDER BY created_at,id LIMIT 1").get().id;
    const selection = await new D1QuestionSelectionRepository(adapter).getAttempt(first, database.prepare("SELECT anonymous_owner_hash FROM cowrie_wallets").get().anonymous_owner_hash, now);
    const completion = await completeCowrieQuickPlay(adapter, { attemptId: first, anonymousSessionCredential: owner, idempotencyKey: "purchase-test-result", avatarId: defaultAvatarId, answers: selection.selection.questions.map(question => ({ questionStableId: question.stableId, selectedOptionIds: [question.answerOptions.find(option => !question.acceptedAnswers.some(accepted => accepted.length === 1 && accepted[0] === option.id)).id] })) }, now);
    assert.ok(database.prepare("SELECT id FROM results WHERE public_slug=?").get(completion.resultSlug).id);
    const wallet = database.prepare("SELECT * FROM cowrie_wallets").get();
    // Synthetic local, authoritative Cowrie allocation; no provider is contacted.
    const reference = `rr_${"d".repeat(32)}`;
    database.prepare(`INSERT INTO commerce_orders (id,public_order_reference,product_key,cowrie_wallet_id,anonymous_owner_hash,currency,amount_minor,state,client_reference_id,stripe_payment_link_id,consent_notice_version,immediate_delivery_consent_at,pending_expires_at,retention_expires_at,idempotency_hash,version,created_at,updated_at) VALUES ('order_cowrie_test',?,'cowrie_5_v1',?,?,'GBP',199,'fulfilled',?,'plink_localfixture','royal-reveal-immediate-delivery-v1',?,?,?, ?,1,?,?)`).run(reference, wallet.id, wallet.anonymous_owner_hash, reference, now, now + 1800000, now + 400 * 86400000, "d".repeat(64), now, now);
    const allocation = `allocation_${"d".repeat(32)}`;
    database.prepare(`INSERT INTO cowrie_purchase_allocations (id,order_id,wallet_id,product_key,original_quantity,remaining_quantity,state,fulfilment_idempotency_hash,fulfilled_at,retention_expires_at,version,created_at,updated_at) VALUES (?,'order_cowrie_test',?,'cowrie_5_v1',5,5,'active',?,?,?,1,?,?)`).run(allocation, wallet.id, "d".repeat(64), now, now + 400 * 86400000, now, now);
    database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_order_id,related_allocation_id,reason_code,created_at) VALUES (?,?,'purchased','purchase_credit',5,'purchase',?,'order_cowrie_test',?,'verified_purchase',?)`).run(`ledger_${"d".repeat(32)}`, wallet.id, "d".repeat(64), allocation, now);
    await service.startQuickPlay(request("consume-bonus-one")); await service.startQuickPlay(request("consume-bonus-two"));
    const transition = await preparePaid(context, "purchased-pending");
    assert.equal(database.prepare("SELECT purchased_balance FROM cowrie_wallets").get().purchased_balance, 4);
    assert.equal(database.prepare("SELECT remaining_quantity FROM cowrie_purchase_allocations").get().remaining_quantity, 4);
    assert.equal(await repository.reverseUnissued(transition), true); assert.equal(await repository.reverseUnissued(transition), false);
    assert.equal(database.prepare("SELECT purchased_balance FROM cowrie_wallets").get().purchased_balance, 5);
    assert.equal(database.prepare("SELECT remaining_quantity FROM cowrie_purchase_allocations").get().remaining_quantity, 5);
    assert.equal(await repository.commitIssuance(transition), false);
    const next = await service.startQuickPlay(request("purchased-new-key")); assert.equal(next.access, "purchased"); assert.equal(next.wallet.purchasedBalance, 4);
    assert.equal(await repository.expireBonuses({ walletId: wallet.id, now: now + 181 * 86400000, limit: 100 }), 0);
    assert.equal(database.prepare("SELECT purchased_balance FROM cowrie_wallets").get().purchased_balance, 4);
    assert.equal(database.prepare("SELECT remaining_quantity FROM cowrie_purchase_allocations").get().remaining_quantity, 4);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally { database.close(); }
});

test("paid retries remain rate-limited and browser issuance metadata is never accepted for completion", async () => {
  const context = await paidSetup(); const { database, service, adapter } = context;
  try {
    const issued = await service.startQuickPlay(request("bounded-retry"));
    let limited = false;
    for (let index = 0; index < 25; index += 1) {
      try { await service.startQuickPlay(request("bounded-retry")); } catch (error) { assert.equal(error.code, "cowrie_rate_limited"); limited = true; break; }
    }
    assert.equal(limited, true);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM cowrie_ledger WHERE entry_type='quick_play_debit'").get().count, 1);
    const body = { attemptId: issued.selection.attemptId, anonymousSessionCredential: owner, idempotencyKey: "rejected-marker-request", avatarId: defaultAvatarId, answers: [] };
    for (const key of ["cowrie_issued_at", "cowrieIssuedAt"]) await assert.rejects(completeCowrieQuickPlay(adapter, { ...body, [key]: now }, now), /field_not_allowed/);
  } finally { database.close(); }
});

test("actual D1 SQL issues two free attempts, one bonus-first paid attempt and inert retries", async () => {
  const { database, repository, service } = await setup();
  try {
    await service.createOrGet({ anonymousSessionCredential: owner });
    const first = await service.startQuickPlay(request("first")); const second = await service.startQuickPlay(request("second"));
    assert.equal(first.wallet.freeQuickPlaysRemaining, 1); assert.equal(second.wallet.freeQuickPlaysRemaining, 0);
    const wallet = database.prepare("SELECT * FROM cowrie_wallets").get();
    database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_achievement_key,reason_code,bonus_expires_at,created_at) VALUES (?,?,'bonus','bonus_credit',1,'bonus',?,'perfect_region_day:west:2026-09-09','perfect_region_day',?,?)`).run(`ledger_${"d".repeat(32)}`, wallet.id, "d".repeat(64), now + 180 * 86_400_000, now);
    const third = await service.startQuickPlay(request("third")); assert.equal(third.access, "bonus"); assert.equal(third.wallet.bonusBalance, 0);
    const retry = await service.startQuickPlay(request("third")); assert.equal(retry.selection.attemptId, third.selection.attemptId);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM cowrie_ledger WHERE entry_type='quick_play_debit'").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM quiz_attempts").get().count, 3);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    const stored = await repository.getAttemptByIdempotencyHash(database.prepare("SELECT idempotency_key_hash FROM quiz_attempts WHERE id=?").get(third.selection.attemptId).idempotency_key_hash, wallet.anonymous_owner_hash, now);
    assert.deepEqual(stored.selection.optionOrders, third.selection.questions.map((question) => question.options.map((option) => option.id)));
  } finally { database.close(); }
});

test("authoritative Cowrie completion uses the issued question versions, persists one result and awards once", async () => {
  const { database, adapter, service } = await setup();
  try {
    await service.createOrGet({ anonymousSessionCredential: owner });
    const issued = await service.startQuickPlay(request("completion"));
    const body = { attemptId: issued.selection.attemptId, anonymousSessionCredential: owner, idempotencyKey: "completion-request-0001", avatarId: defaultAvatarId,
      answers: issued.selection.questions.map(question => { const row = database.prepare("SELECT accepted_answers_json,correct_answer_json FROM questions WHERE stable_id=? AND version=?").get(question.questionRef, question.version); return { questionStableId: question.questionRef, selectedOptionIds: JSON.parse(row.accepted_answers_json)[0] || JSON.parse(row.correct_answer_json) }; }) };
    await assert.rejects(completeCowrieQuickPlay(adapter, { ...body, score: 12 }, now));
    await assert.rejects(completeCowrieQuickPlay(adapter, { ...body, anonymousSessionCredential: "b".repeat(32) }, now));
    const completed = await completeCowrieQuickPlay(adapter, body, now);
    assert.equal(completed.completed, true);
    assert.deepEqual(await completeCowrieQuickPlay(adapter, body, now), completed);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM quiz_attempts").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM answers").get().count, 12);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM results").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM cowrie_ledger WHERE entry_type='bonus_credit'").get().count, 1);
    assert.equal(database.prepare("SELECT score FROM results").get().score, 12);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally { database.close(); }
});

test("actual D1 optimistic guard prevents a stale request from consuming an allowance or debit", async () => {
  const { database, repository, service } = await setup();
  try {
    await service.createOrGet({ anonymousSessionCredential: owner }); const wallet = await repository.getWalletByOwner(database.prepare("SELECT anonymous_owner_hash FROM cowrie_wallets").get().anonymous_owner_hash);
    const first = await service.startQuickPlay(request("stale"));
    const stored = await repository.getAttemptByIdempotencyHash(database.prepare("SELECT idempotency_key_hash FROM quiz_attempts WHERE id=?").get(first.selection.attemptId).idempotency_key_hash, wallet.anonymousOwnerHash, now);
    assert.equal(await repository.issueQuickPlay({ wallet, idempotencyHash: "e".repeat(64), ledgerId: `ledger_${"e".repeat(32)}`, attemptId: `attempt_${"e".repeat(48)}`, selection: stored.selection, startedAt: now, expiresAt: now + 86400000, access: "free" }), false);
    assert.equal(database.prepare("SELECT free_quick_plays_consumed FROM cowrie_wallets").get().free_quick_plays_consumed, 1);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM quiz_attempts").get().count, 1);
  } finally { database.close(); }
});

test("actual D1 expiry is exact, FIFO, bounded and inert on repetition while forged bonus claims fail", async () => {
  const { database, repository, service } = await setup();
  try {
    await service.createOrGet({ anonymousSessionCredential: owner }); const wallet = database.prepare("SELECT * FROM cowrie_wallets").get();
    const credit = database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_achievement_key,reason_code,bonus_expires_at,created_at) VALUES (?,?,'bonus','bonus_credit',?,'bonus',?,'perfect_region_day:west:2026-09-09','perfect_region_day',?,?)`);
    credit.run(`ledger_${"1".repeat(32)}`, wallet.id, 2, "1".repeat(64), now + 180 * 86400000, now);
    database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,reason_code,created_at) VALUES (?,?,'bonus','quick_play_debit',-1,'quick_play',?,'random_quick_play',?)`).run(`ledger_${"2".repeat(32)}`, wallet.id, "2".repeat(64), now + 1);
    credit.run(`ledger_${"3".repeat(32)}`, wallet.id, 1, "3".repeat(64), now + 360 * 86400000 - 1, now + 180 * 86400000 - 1);
    assert.equal(await repository.expireBonuses({ walletId: wallet.id, now: now + 180 * 86400000 - 1, limit: 1 }), 0);
    assert.equal(await repository.expireBonuses({ walletId: wallet.id, now: now + 180 * 86400000, limit: 1 }), 1);
    assert.equal(await repository.expireBonuses({ walletId: wallet.id, now: now + 180 * 86400000, limit: 1 }), 0);
    assert.equal(database.prepare("SELECT bonus_balance FROM cowrie_wallets").get().bonus_balance, 1);
    assert.equal(await repository.awardBonus({ ledgerId: `ledger_${"4".repeat(32)}`, walletId: wallet.id, achievementKey: "perfect_region_day:west:2026-09-09", idempotencyHash: "4".repeat(64), quantity: 1, now }), false);
    assert.throws(() => database.prepare("UPDATE cowrie_wallets SET bonus_balance=50 WHERE id=?").run(wallet.id), /cache mismatch/);
  } finally { database.close(); }
});
