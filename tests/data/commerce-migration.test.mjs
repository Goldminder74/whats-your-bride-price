import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyMigrationPlan, createIsolatedDatabase, loadMigrationPlan } from "../../scripts/data-migrations.mjs";
import { buildDevelopmentSeed, developmentSeedStatements } from "../../db/seeds/development.ts";
import { D1ResultCompletionRepository, ResultCompletionService } from "../../db/resultCompletion.ts";
import { CommerceService, D1CommerceRepository, InMemoryCommerceRateLimiter, createReviewCommerceConfig } from "../../db/commerce.ts";
import { regions } from "../../app/gameData.ts";

const now = Date.UTC(2026, 7, 26, 12);
const day = 86_400_000;
const owner = "a".repeat(64);
const otherOwner = "b".repeat(64);

class LocalStatement {
  constructor(database,sql,values=[]){this.database=database;this.sql=sql;this.values=values;}
  bind(...values){return new LocalStatement(this.database,this.sql,values);}
  async run(){const result=this.database.prepare(this.sql).run(...this.values);return{success:true,meta:{changes:Number(result.changes||0)},results:[]};}
  async first(column){const row=this.database.prepare(this.sql).get(...this.values)||null;return column&&row?row[column]:row;}
  async all(){return{success:true,results:this.database.prepare(this.sql).all(...this.values),meta:{changes:0}};}
}
class LocalAtomicDatabase {
  constructor(database){this.database=database;}
  prepare(sql){return new LocalStatement(this.database,sql);}
  async batch(statements){this.database.exec("BEGIN IMMEDIATE");try{const results=[];for(const statement of statements)results.push(await statement.run());this.database.exec("COMMIT");return results;}catch(error){this.database.exec("ROLLBACK");throw error;}}
}

function completionAnswers(edition="west") { return regions[edition].questions.map((question,index)=>({questionStableId:`${edition}_q${String(index+1).padStart(2,"0")}`,selectedOptionIds:question.correct.map((option)=>`o${option+1}`)})); }

function seedResult(database) {
  database.prepare("INSERT INTO quiz_editions (id,edition_key,name,region,version,status,created_at,updated_at) VALUES ('edition-west','west','West Africa','west',1,'active',?,?)").run(now, now);
  database.prepare(`INSERT INTO quiz_attempts (id,edition_id,anonymous_subject_hash,question_set_version,scoring_version,selected_question_versions_json,status,idempotency_key_hash,started_at,completed_at,expires_at,version,created_at,updated_at)
    VALUES ('attempt-1','edition-west',?,'questions-v1','binary-exact-set-v1','[]','completed',?, ?, ?, ?,1,?,?)`)
    .run(owner, "c".repeat(64), now - day, now - 1_000, now + day, now - day, now);
  database.prepare(`INSERT INTO results (id,public_slug,attempt_id,edition_id,score,total,tier,scoring_version,question_set_version,scoring_snapshot_json,safeguard_version,visibility,state,version,created_at,updated_at)
    VALUES ('result-1',?,'attempt-1','edition-west',10,12,3,'binary-exact-set-v1','questions-v1','{}','culture-score-v1','private','active',1,?,?)`)
    .run("d".repeat(48), now - 1_000, now);
}

function insertOrder(database, overrides = {}) {
  const value = {
    id: "order-1", reference: `rr_${"1".repeat(32)}`, resultId: "result-1", owner,
    product: "royal_reveal_v1", currency: "GBP", amount: 199, state: "pending",
    paymentLinkId: "plink_review123", checkout: null, paymentIntent: null,
    idempotency: "e".repeat(64), ...overrides,
  };
  database.prepare(`INSERT INTO commerce_orders (
    id,public_order_reference,product_key,result_id,anonymous_owner_hash,currency,amount_minor,state,
    client_reference_id,stripe_payment_link_id,stripe_checkout_session_id,stripe_payment_intent_id,
    consent_notice_version,immediate_delivery_consent_at,pending_expires_at,retention_expires_at,
    idempotency_hash,version,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,1,?,?)`).run(
    value.id, value.reference, value.product, value.resultId, value.owner, value.currency, value.amount, value.state,
    value.reference, value.paymentLinkId, value.checkout, value.paymentIntent,
    "royal-reveal-immediate-delivery-v1", now, now + 30 * 60_000, now + 400 * day,
    value.idempotency, now, now,
  );
  return value;
}

test("0006 is additive, checksummed, supports empty and 0000-through-0005 upgrades, and is inert on replay", async () => {
  const plan = await loadMigrationPlan();
  assert.equal(plan.length, 10);
  assert.match(plan[6].id, /^0006_[a-z0-9_]+$/);
  assert.match(plan[6].checksum, /^[0-9a-f]{64}$/);
  assert.deepEqual(plan[6].statements.filter((statement) => /^CREATE TABLE/i.test(statement)).map((statement) => statement.match(/`([^`]+)`/)?.[1]).sort(), [
    "commerce_entitlements", "commerce_orders", "stripe_webhook_events",
  ]);
  for (const previousCount of [0, 6]) {
    const database = createIsolatedDatabase();
    try {
      if (previousCount) applyMigrationPlan(database, plan.slice(0, previousCount), { now });
      assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, plan.slice(previousCount).map(({ id }) => id));
      assert.deepEqual(applyMigrationPlan(database, plan, { now }).applied, []);
      assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    } finally { database.close(); }
  }
});

test("0000 through 0005 migration files still match the checksum ledger", async () => {
  const ledger = JSON.parse(await readFile(new URL("../../drizzle/migration-checksums.json", import.meta.url), "utf8"));
  for (const [name, expected] of Object.entries(ledger).filter(([name]) => /^000[0-5]_/.test(name))) {
    const bytes = await readFile(new URL(`../../drizzle/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, name);
  }
});

test("authoritative completion creates the durable owner-bound result used by the pending order", async () => {
  const database=createIsolatedDatabase();
  try {
    applyMigrationPlan(database,await loadMigrationPlan(),{now});
    for(const statement of developmentSeedStatements(await buildDevelopmentSeed()))database.prepare(statement.sql).run(...statement.params);
    const atomic=new LocalAtomicDatabase(database);let randomByte=1;
    const completion=new ResultCompletionService(new D1ResultCompletionRepository(atomic),{now:()=>now,randomSource:(bytes)=>{bytes.fill(randomByte++);return bytes;}});
    const rawCredential="01".repeat(16);const completed=await completion.complete({anonymousSessionCredential:rawCredential,idempotencyKey:"durable-result-order-1",avatarId:"adjoa",answers:completionAnswers()});
    const stored=database.prepare(`SELECT r.id,r.public_slug,r.score,r.total,r.visibility,r.state,qa.status,qa.anonymous_subject_hash,count(a.id) answer_count
      FROM results r JOIN quiz_attempts qa ON qa.id=r.attempt_id JOIN answers a ON a.attempt_id=qa.id
      WHERE r.public_slug=? GROUP BY r.id`).get(completed.resultSlug);
    assert.equal(stored.score,12);assert.equal(stored.total,12);assert.equal(stored.visibility,"private");assert.equal(stored.state,"active");assert.equal(stored.status,"completed");assert.equal(stored.answer_count,12);
    assert.doesNotMatch(JSON.stringify(stored),new RegExp(rawCredential));
    const commerce=new CommerceService(new D1CommerceRepository(atomic),new InMemoryCommerceRateLimiter(),createReviewCommerceConfig(),()=>now);
    const pending=await commerce.startOrder({productKey:"royal_reveal_v1",resultSlug:completed.resultSlug,anonymousSessionCredential:rawCredential,idempotencyKey:"a".repeat(32),immediateDeliveryConsent:true,consentNoticeVersion:"royal-reveal-immediate-delivery-v1"});
    const order=database.prepare("SELECT result_id,anonymous_owner_hash,client_reference_id,stripe_checkout_session_id FROM commerce_orders WHERE public_order_reference=?").get(pending.publicOrderReference);
    assert.equal(order.result_id,stored.id);assert.equal(order.anonymous_owner_hash,stored.anonymous_subject_hash);assert.equal(order.client_reference_id,pending.publicOrderReference);assert.equal(order.stripe_checkout_session_id,null);
    await assert.rejects(()=>commerce.startOrder({productKey:"royal_reveal_v1",resultSlug:completed.resultSlug,anonymousSessionCredential:"02".repeat(16),idempotencyKey:"b".repeat(32),immediateDeliveryConsent:true,consentNoticeVersion:"royal-reveal-immediate-delivery-v1"}),/result_unavailable/);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(),[]);
  } finally { database.close(); }
});

test("orders enforce exact product, price, idempotency and Stripe identifier uniqueness", async () => {
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, await loadMigrationPlan(), { now }); seedResult(database); insertOrder(database);
    assert.throws(() => insertOrder(database, { id: "order-2", reference: `rr_${"2".repeat(32)}` }), /UNIQUE constraint/);
    assert.throws(() => insertOrder(database, { id: "order-3", reference: `rr_${"3".repeat(32)}`, idempotency: "f".repeat(64), product: "other" }), /CHECK constraint/);
    assert.throws(() => insertOrder(database, { id: "order-4", reference: `rr_${"4".repeat(32)}`, idempotency: "1".repeat(64), currency: "USD" }), /CHECK constraint/);
    assert.throws(() => insertOrder(database, { id: "order-5", reference: `rr_${"5".repeat(32)}`, idempotency: "2".repeat(64), amount: 200 }), /CHECK constraint/);
    insertOrder(database, { id: "order-6", reference: `rr_${"6".repeat(32)}`, idempotency: "3".repeat(64), checkout: "cs_test_unique", paymentIntent: "pi_unique" });
    assert.throws(() => insertOrder(database, { id: "order-7", reference: `rr_${"7".repeat(32)}`, idempotency: "4".repeat(64), checkout: "cs_test_unique" }), /UNIQUE constraint/);
    assert.throws(() => insertOrder(database, { id: "order-8", reference: `rr_${"8".repeat(32)}`, idempotency: "5".repeat(64), paymentIntent: "pi_unique" }), /UNIQUE constraint/);
  } finally { database.close(); }
});

test("entitlements are result-and-owner bound, unique per order, and revocation is idempotent", async () => {
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, await loadMigrationPlan(), { now }); seedResult(database); insertOrder(database, { state: "fulfilled" });
    const insert = (id, entitlementOwner = owner) => database.prepare(`INSERT INTO commerce_entitlements (
      id,order_id,result_id,anonymous_owner_hash,product_key,state,granted_at,retention_expires_at,version,created_at,updated_at
    ) VALUES (?,'order-1','result-1',?,'royal_reveal_v1','active',?,?,1,?,?)`).run(id, entitlementOwner, now, now + 400 * day, now, now);
    insert("entitlement-1");
    assert.throws(() => insert("entitlement-2"), /UNIQUE constraint/);
    database.prepare("UPDATE commerce_entitlements SET state='revoked',revoked_at=?,updated_at=? WHERE id='entitlement-1' AND state='active'").run(now + 1, now + 1);
    const first = database.prepare("SELECT state,revoked_at FROM commerce_entitlements WHERE id='entitlement-1'").get();
    database.prepare("UPDATE commerce_entitlements SET state='revoked',revoked_at=coalesce(revoked_at,?),updated_at=? WHERE id='entitlement-1'").run(now + 2, now + 2);
    assert.equal(database.prepare("SELECT revoked_at FROM commerce_entitlements WHERE id='entitlement-1'").get().revoked_at, first.revoked_at);
    insertOrder(database, { id: "order-2", reference: `rr_${"2".repeat(32)}`, idempotency: "f".repeat(64), state: "fulfilled" });
    assert.throws(() => database.prepare(`INSERT INTO commerce_entitlements (
      id,order_id,result_id,anonymous_owner_hash,product_key,state,granted_at,retention_expires_at,version,created_at,updated_at
    ) VALUES ('entitlement-wrong-owner','order-2','result-1',?,'royal_reveal_v1','active',?,?,1,?,?)`)
      .run(otherOwner, now, now + 400 * day, now, now), /FOREIGN KEY constraint/);
  } finally { database.close(); }
});

test("webhook audit rows are minimal, controlled and replay-safe, with required indexes", async () => {
  const database = createIsolatedDatabase();
  try {
    applyMigrationPlan(database, await loadMigrationPlan(), { now });
    const insert = (id, eventId = "evt_review_1", type = "checkout.session.completed") => database.prepare(`INSERT INTO stripe_webhook_events (
      id,stripe_event_id,event_type,livemode,payload_sha256,received_at,processing_result,expires_at,version,created_at,updated_at
    ) VALUES (?,?,?,0,?,?, 'received',?,1,?,?)`).run(id, eventId, type, "f".repeat(64), now, now + 180 * day, now, now);
    insert("webhook-1");
    assert.throws(() => insert("webhook-2"), /UNIQUE constraint/);
    assert.throws(() => insert("webhook-3", "evt_review_3", "customer.created"), /CHECK constraint/);
    const columns = database.prepare("PRAGMA table_info('stripe_webhook_events')").all().map(({ name }) => name);
    assert.equal(columns.some((name) => /(payload_json|email|name|phone|address|card|receipt)/i.test(name)), false);
    const indexes = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type='index'").all().map(({ name }) => name));
    for (const name of [
      "commerce_orders_public_reference_uq", "commerce_orders_idempotency_hash_uq", "commerce_orders_checkout_session_uq",
      "commerce_orders_payment_intent_uq", "commerce_orders_result_owner_state_idx", "commerce_orders_retention_idx",
      "commerce_entitlements_order_uq", "commerce_entitlements_active_result_owner_uq", "commerce_entitlements_lookup_idx",
      "stripe_webhook_events_event_id_uq", "stripe_webhook_events_retention_idx",
    ]) assert.equal(indexes.has(name), true, name);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { database.close(); }
});
