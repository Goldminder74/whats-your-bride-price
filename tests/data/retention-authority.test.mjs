import assert from "node:assert/strict";
import test from "node:test";
import {setup,request,checkout,verified,adverse,credential} from "../helpers/cowrieCommerce.mjs";
import {operatorRetentionPlan,runApprovedRetention,restoreSuppressionPlan,restoreAuthorityPlan,assertRestoreReceipt} from "../../db/retention.ts";
import {accountingDeadline,caseDeadline,RETENTION_DAY} from "../../db/retentionPolicy.ts";
import {runTestRetention} from "../../db/testRetention.ts";
import {main as operatorMain,retentionTargetSchema} from "../../scripts/private-retention.mjs";
import {D1QuestionSelectionRepository} from "../../db/questionSelection.ts";
import {deriveAnonymousSubjectHash} from "../../app/anonymousSession.ts";
import {completeCowrieQuickPlay} from "../../db/cowrieCompletion.ts";
import {Miniflare} from "miniflare";
import {loadMigrationPlan} from "../../scripts/data-migrations.mjs";

const at=Date.UTC(2026,9,8,12),proof="a".repeat(64);
const apply=async(c,action,now=at)=>c.adapter.batch(operatorRetentionPlan(action,now).map(row=>c.adapter.prepare(row.sql).bind(...row.params)));
const wallet=c=>c.database.prepare("SELECT id FROM cowrie_wallets LIMIT 1").get().id;
const closure=c=>({operation:"close-wallet",walletId:wallet(c),evidenceHash:proof});
const hold=c=>({operation:"hold",id:"hold_1",scope:"wallet",subjectId:wallet(c),reason:"legal",evidenceHash:proof});

test("calendar deadlines distinguish statutory filing dates and approved calendar retention",()=>{
  assert.equal(accountingDeadline(Date.UTC(2026,3,5,22,59)),Date.UTC(2032,1,1));
  assert.equal(accountingDeadline(Date.UTC(2026,3,5,23)),Date.UTC(2033,1,1));
  assert.equal(accountingDeadline(Date.UTC(2026,3,6)),Date.UTC(2033,1,1));
  assert.equal(caseDeadline("support",Date.UTC(2024,1,29,12)),Date.UTC(2025,1,28,12));
  assert.equal(caseDeadline("dispute",at),Date.UTC(2032,9,8,12));
  assert.throws(()=>caseDeadline("marketing",at));assert.throws(()=>accountingDeadline(NaN));
});

test("closure is operator-only, immutable, idempotent and cannot reopen or recover",async()=>{
  const c=await setup();try{
    await assert.rejects(apply(c,{operation:"unknown"}));
    assert.throws(()=>c.database.prepare("UPDATE cowrie_wallets SET closed_at=?").run(at),/operator closure/);
    await apply(c,closure(c));await apply(c,closure(c),at+1);
    assert.equal(c.database.prepare("SELECT closed_at,state FROM cowrie_wallets").get().closed_at,at);
    assert.equal(c.database.prepare("SELECT state FROM cowrie_wallets").get().state,"deleted");
    assert.throws(()=>c.database.prepare("UPDATE cowrie_wallets SET state='active',deleted_at=NULL,retention_expires_at=NULL").run(),/cannot reopen/);
    assert.throws(()=>c.database.prepare("UPDATE retention_closures SET closed_at=closed_at+1").run(),/immutable/);
    assert.throws(()=>c.database.prepare("DELETE FROM retention_closures").run(),/cannot be forgotten/);
    await assert.rejects(c.walletService.recover({walletReference:c.created.wallet.walletReference,anonymousSessionCredential:credential,recoveryCredential:c.created.recoveryCredential}));
  }finally{c.database.close();}
});

test("pending payments, purchased value, partial settlement, cases and holds prevent closure",async()=>{
  const c=await setup();try{
    await apply(c,hold(c));await assert.rejects(apply(c,closure(c)),/hold/);
    assert.throws(()=>c.database.prepare("DELETE FROM retention_holds").run(),/active holds/);
    await apply(c,{operation:"release-hold",id:"hold_1"});await apply(c,{operation:"release-hold",id:"hold_1"},at+1);
    await apply(c,{operation:"open-case",id:"support_1",walletId:wallet(c),kind:"support",evidenceHash:proof});
    await assert.rejects(apply(c,closure(c)),/unresolved case/);
    await apply(c,{operation:"close-case",id:"support_1",kind:"support"});
    const order=await c.service.startOrder(request(c));await assert.rejects(apply(c,closure(c)),/payment/);
    await c.service.webhook(await verified("checkout.session.completed",checkout(order)));await assert.rejects(apply(c,closure(c)),/reconciliation/);
    await c.service.webhook(await verified("charge.refunded",adverse(undefined,199,100)));await assert.rejects(apply(c,closure(c)));
    assert.equal(c.database.prepare("SELECT purchased_balance FROM cowrie_wallets").get().purchased_balance,5);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM retention_closures").get().n,0);
  }finally{c.database.close();}
});

for(const [type,reason] of [["charge.refunded","verified_refund"],["charge.dispute.created","verified_dispute"]])test(`${reason}: exact verified settlement required before frozen closure; accounting preserved`,async()=>{
  const c=await setup();try{
    const order=await c.service.startOrder(request(c));await c.service.webhook(await verified("checkout.session.completed",checkout(order)));
    await c.walletService.clear({anonymousSessionCredential:credential});await c.service.webhook(await verified(type,adverse()));
    await assert.rejects(apply(c,closure(c)),/payment/);
    const stored=c.database.prepare("SELECT id,retention_expires_at FROM commerce_orders").get();
    const event=c.database.prepare("SELECT id FROM stripe_webhook_events WHERE event_type=?").get(type);
    await assert.rejects(apply(c,{operation:"settlement",orderId:stored.id,eventId:event.id,reason:reason==="verified_refund"?"verified_dispute":"verified_refund"}));
    await apply(c,{operation:"settlement",orderId:stored.id,eventId:event.id,reason});
    await apply(c,{operation:"settlement",orderId:stored.id,eventId:event.id,reason},at+1);
    await apply(c,closure(c));
    const ledger=JSON.stringify(c.database.prepare("SELECT * FROM cowrie_ledger ORDER BY id").all());
    await runTestRetention(c.adapter,at+400*RETENTION_DAY,5);
    assert.equal(JSON.stringify(c.database.prepare("SELECT * FROM cowrie_ledger ORDER BY id").all()),ledger);
    assert.equal(c.database.prepare("SELECT reason FROM retention_settlements").get().reason,reason);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM cowrie_purchase_allocations").get().n,1);
    assert.ok(stored.retention_expires_at>=accountingDeadline(Date.UTC(2026,8,12)));
    assert.deepEqual(c.database.prepare("PRAGMA foreign_key_check").all(),[]);
  }finally{c.database.close();}
});

test("30-day minimisation is bounded, repeat-safe and cannot reconnect original owner/recovery credentials",async()=>{
  const c=await setup();try{
    await apply(c,closure(c));const before=c.database.prepare("SELECT anonymous_owner_hash,recovery_credential_hash FROM cowrie_wallets").get();
    await runApprovedRetention(c.adapter,at+30*RETENTION_DAY-1,1);assert.equal(c.database.prepare("SELECT ownership_minimized_at FROM cowrie_wallets").get().ownership_minimized_at,null);
    await apply(c,hold(c),at+1);await runApprovedRetention(c.adapter,at+30*RETENTION_DAY,1);assert.equal(c.database.prepare("SELECT ownership_minimized_at FROM cowrie_wallets").get().ownership_minimized_at,null);
    await apply(c,{operation:"release-hold",id:"hold_1"},at+30*RETENTION_DAY);
    await runApprovedRetention(c.adapter,at+30*RETENTION_DAY,1);const row=c.database.prepare("SELECT * FROM cowrie_wallets").get();
    assert.equal(row.anonymous_owner_hash,"0".repeat(64));assert.equal(row.recovery_credential_hash,"0".repeat(64));
    assert.throws(()=>c.database.prepare("UPDATE cowrie_wallets SET anonymous_owner_hash=?,recovery_credential_hash=?").run(before.anonymous_owner_hash,before.recovery_credential_hash),/closed identity cannot rotate|minimised ownership cannot reconnect/);
    assert.ok((await runApprovedRetention(c.adapter,at+30*RETENTION_DAY,1)).every(n=>n===0));
    await assert.rejects(runApprovedRetention(c.adapter,at,101));
  }finally{c.database.close();}
});

test("support/privacy expiry uses 12 months; refund/dispute evidence uses six years and active holds block purge",async()=>{
  const c=await setup();try{
    for(const kind of ["support","privacy","refund","dispute"]){await apply(c,{operation:"open-case",id:kind,walletId:wallet(c),kind,evidenceHash:proof});await apply(c,{operation:"close-case",id:kind,kind});await apply(c,{operation:"close-case",id:kind,kind},at+1);assert.equal(c.database.prepare("SELECT retain_until FROM retention_cases WHERE id=?").get(kind).retain_until,caseDeadline(kind,at));}
    await apply(c,hold(c));await runApprovedRetention(c.adapter,caseDeadline("support",at),1);assert.equal(c.database.prepare("SELECT COUNT(*) n FROM retention_cases").get().n,4);
    await apply(c,{operation:"release-hold",id:"hold_1"},caseDeadline("support",at));
    await runApprovedRetention(c.adapter,caseDeadline("support",at),1);assert.equal(c.database.prepare("SELECT COUNT(*) n FROM retention_cases").get().n,3);
    await runApprovedRetention(c.adapter,caseDeadline("support",at),1);assert.equal(c.database.prepare("SELECT COUNT(*) n FROM retention_cases").get().n,2);
  }finally{c.database.close();}
});

test("restore requires external receipt, suppresses erased ownership immediately and never changes purchased value",async()=>{
  const c=await setup();try{
    const order=await c.service.startOrder(request(c));await c.service.webhook(await verified("checkout.session.completed",checkout(order)));
    await assert.rejects(assertRestoreReceipt(c.adapter,proof));await assert.rejects(assertRestoreReceipt(c.adapter,undefined));
    const entries=[{scope:"wallet",subjectId:wallet(c),unavailableAt:at,forgetAfter:at+30*RETENTION_DAY}];
    const plan=restoreSuppressionPlan(entries,proof,at);
    for(let i=0;i<2;i++)await c.adapter.batch(plan.map(row=>c.adapter.prepare(row.sql).bind(...row.params)));
    await assertRestoreReceipt(c.adapter,proof);await assert.rejects(assertRestoreReceipt(c.adapter,"b".repeat(64)));
    assert.equal(c.database.prepare("SELECT purchased_balance,state FROM cowrie_wallets").get().purchased_balance,5);
    assert.equal(c.database.prepare("SELECT state FROM cowrie_wallets").get().state,"deleted");
    assert.throws(()=>restoreSuppressionPlan([{...entries[0],forgetAfter:at+60*RETENTION_DAY}],proof,at));
    assert.throws(()=>restoreSuppressionPlan(Array(101).fill(entries[0]),proof,at));
  }finally{c.database.close();}
});

test("private CLI requires explicit target/action approval and verifies current schema; never contacts hosted service in dry-run",async()=>{
  const target=await retentionTargetSchema();assert.equal(target.migrations.length,14);assert.match(target.schemaSha256,/^[0-9a-f]{64}$/);
  await assert.rejects(operatorMain([],{}),/input_required/);
  assert.equal((await operatorMain(["--export-suppression"],{})).dryRun,true);
});

test("expiry purges answer rows in bounded passes, anonymises ownership, preserves scores and denies reconnection",async()=>{
  const c=await setup();try{
    const started=await c.walletService.startQuickPlay({region:"west",anonymousSessionCredential:credential,idempotencyKey:"retention-completion"});
    const selected=await new D1QuestionSelectionRepository(c.adapter).getAttempt(started.selection.attemptId,await deriveAnonymousSubjectHash(credential),Date.UTC(2026,8,12,12));
    await completeCowrieQuickPlay(c.adapter,{attemptId:started.selection.attemptId,anonymousSessionCredential:credential,idempotencyKey:"c".repeat(32),avatarId:"adjoa",answers:selected.selection.questions.map(q=>({questionStableId:q.stableId,selectedOptionIds:q.acceptedAnswers[0]}))},Date.UTC(2026,8,12,12));
    const result=c.database.prepare("SELECT * FROM results").get();const attempt=c.database.prepare("SELECT * FROM quiz_attempts").get();
    await apply(c,{operation:"hold",id:"result_hold",scope:"result",subjectId:result.id,reason:"legal",evidenceHash:proof});
    await runApprovedRetention(c.adapter,result.expires_at,1);assert.equal(c.database.prepare("SELECT COUNT(*) n FROM answers").get().n,12);
    await apply(c,{operation:"release-hold",id:"result_hold"},result.expires_at);
    await runApprovedRetention(c.adapter,result.expires_at,1);assert.equal(c.database.prepare("SELECT COUNT(*) n FROM answers").get().n,11);
    assert.equal(c.database.prepare("SELECT anonymous_subject_hash FROM quiz_attempts").get().anonymous_subject_hash,null);
    const retained=c.database.prepare("SELECT * FROM results").get();assert.equal(retained.score,result.score);assert.equal(retained.scoring_snapshot_json,result.scoring_snapshot_json);assert.equal(retained.state,"anonymized");
    assert.throws(()=>c.database.prepare("UPDATE quiz_attempts SET status='completed',anonymous_subject_hash=?").run(attempt.anonymous_subject_hash),/cannot reconnect/);
    assert.throws(()=>c.database.prepare("UPDATE results SET state='active'").run(),/cannot reopen/);
    for(let i=0;i<11;i++)await runApprovedRetention(c.adapter,result.expires_at,1);
    assert.equal(c.database.prepare("SELECT COUNT(*) n FROM answers").get().n,0);
    assert.ok((await runApprovedRetention(c.adapter,result.expires_at,1)).every(n=>n===0));
    assert.deepEqual(c.database.prepare("PRAGMA foreign_key_check").all(),[]);
  }finally{c.database.close();}
});

test("operator erasure remains unavailable during a legal hold; release permits purge without reopening",async()=>{
  const c=await setup();try{
    const started=await c.walletService.startQuickPlay({region:"west",anonymousSessionCredential:credential,idempotencyKey:"private-held-erasure-1"});
    const subject=started.selection.attemptId;
    await apply(c,{operation:"hold",id:"held_erasure",scope:"attempt",subjectId:subject,reason:"legal",evidenceHash:proof});
    const owner=c.database.prepare("SELECT anonymous_subject_hash FROM quiz_attempts").get().anonymous_subject_hash;
    await apply(c,{operation:"erase",scope:"attempt",subjectId:subject,evidenceHash:proof});
    await runApprovedRetention(c.adapter,at,1);
    assert.equal(c.database.prepare("SELECT status,anonymous_subject_hash FROM quiz_attempts").get().status,"deleted");
    assert.equal(c.database.prepare("SELECT anonymous_subject_hash FROM quiz_attempts").get().anonymous_subject_hash,owner);
    await apply(c,{operation:"release-hold",id:"held_erasure"});await runApprovedRetention(c.adapter,at,1);
    assert.equal(c.database.prepare("SELECT anonymous_subject_hash FROM quiz_attempts").get().anonymous_subject_hash,null);
  }finally{c.database.close();}
});

test("concurrent closure loses safely to a newly established hold",async()=>{
  const c=await setup();try{
    c.adapter.beforeBatch=async()=>{for(const row of operatorRetentionPlan(hold(c),at))await c.adapter.prepare(row.sql).bind(...row.params).run();};
    await assert.rejects(apply(c,closure(c)),/hold/);assert.equal(c.database.prepare("SELECT COUNT(*) n FROM retention_closures").get().n,0);
  }finally{c.database.close();}
});

test("a scoped hold does not extend unrelated wallet retention",async()=>{
  const c=await setup();try{
    await apply(c,hold(c));const second=await c.walletService.createOrGet({anonymousSessionCredential:"b".repeat(32)});
    const other=c.database.prepare("SELECT id FROM cowrie_wallets WHERE public_reference=?").get(second.wallet.walletReference).id;
    await apply(c,{operation:"close-wallet",walletId:other,evidenceHash:proof});
    await runApprovedRetention(c.adapter,at+30*RETENTION_DAY,1);
    assert.equal(c.database.prepare("SELECT ownership_minimized_at FROM cowrie_wallets WHERE id=?").get(other).ownership_minimized_at,at+30*RETENTION_DAY);
    assert.equal(c.database.prepare("SELECT state FROM cowrie_wallets WHERE id=?").get(wallet(c)).state,"active");
  }finally{c.database.close();}
});

test("real local D1 enforces retention migration, deferred dependencies, operator guards and repeat-safe bounded purge",async()=>{
  const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('local');}}",compatibilityDate:"2026-05-15",d1Databases:["DB"]});
  try{
    const db=await mf.getD1Database("DB");for(const migration of await loadMigrationPlan())await db.batch(migration.statements.map(sql=>db.prepare(sql)));
    const applyPlan=plan=>db.batch(plan.map(row=>db.prepare(row.sql).bind(...row.params)));
    await applyPlan(operatorRetentionPlan({operation:"hold",id:"global_d1",scope:"global",subjectId:"all",reason:"legal",evidenceHash:proof},at));
    await applyPlan(operatorRetentionPlan({operation:"release-hold",id:"global_d1"},at));
    assert.ok((await runApprovedRetention(db,at,1)).every(n=>n===0));
    await applyPlan(restoreSuppressionPlan([],proof,at));await assertRestoreReceipt(db,proof);
    await assert.rejects(assertRestoreReceipt(db,"b".repeat(64)));
    assert.equal((await db.prepare("PRAGMA foreign_key_check").all()).results.length,0);
  }finally{await mf.dispose();}
});

test("reviewed restore replays original case/closure/hold clocks and refuses conflicting authority",async()=>{
  const c=await setup();try{
    await apply(c,{operation:"open-case",id:"restore_support",walletId:wallet(c),kind:"support",evidenceHash:proof});
    await apply(c,{operation:"close-case",id:"restore_support",kind:"support"});await apply(c,closure(c));await apply(c,hold(c),at+1);
    const cases=c.database.prepare("SELECT * FROM retention_cases").all(),closures=c.database.prepare("SELECT * FROM retention_closures").all(),holds=c.database.prepare("SELECT * FROM retention_holds").all();
    const plan=restoreAuthorityPlan(holds,cases,closures,at+RETENTION_DAY);
    await c.adapter.batch(plan.map(row=>c.adapter.prepare(row.sql).bind(...row.params)));
    assert.equal(c.database.prepare("SELECT closed_at FROM retention_closures").get().closed_at,at);
    assert.equal(c.database.prepare("SELECT retain_until FROM retention_cases").get().retain_until,caseDeadline("support",at));
    assert.throws(()=>restoreAuthorityPlan(holds,[{...cases[0],retain_until:at+RETENTION_DAY}],closures,at+RETENTION_DAY),/clock_conflict/);
    const conflicting=restoreAuthorityPlan([{...holds[0],evidence_hash:"b".repeat(64)}],cases,closures,at+RETENTION_DAY);
    await assert.rejects(c.adapter.batch(conflicting.map(row=>c.adapter.prepare(row.sql).bind(...row.params))));
    assert.equal(c.database.prepare("SELECT evidence_hash FROM retention_holds").get().evidence_hash,proof);
  }finally{c.database.close();}
});

test("financial minimisation waits for statutory/claim periods and keeps immutable order amounts and allocation lineage",async()=>{
  const c=await setup();try{
    const order=await c.service.startOrder(request(c));await c.service.webhook(await verified("checkout.session.completed",checkout(order)));
    await c.walletService.clear({anonymousSessionCredential:credential});await c.service.webhook(await verified("charge.refunded",adverse()));
    const stored=c.database.prepare("SELECT * FROM commerce_orders").get();const event=c.database.prepare("SELECT id FROM stripe_webhook_events WHERE event_type='charge.refunded'").get();
    await apply(c,{operation:"settlement",orderId:stored.id,eventId:event.id,reason:"verified_refund"});await apply(c,closure(c));
    assert.throws(()=>c.database.prepare("INSERT INTO retention_order_minimisation(order_id,minimised_at) VALUES(?,?)").run(stored.id,at),/dependencies/);
    const until=c.database.prepare("SELECT financial_until FROM retention_closures").get().financial_until;
    await runApprovedRetention(c.adapter,until-1,1);assert.equal(c.database.prepare("SELECT anonymous_owner_hash FROM commerce_orders").get().anonymous_owner_hash,stored.anonymous_owner_hash);
    const ledger=JSON.stringify(c.database.prepare("SELECT * FROM cowrie_ledger ORDER BY id").all());
    await runApprovedRetention(c.adapter,until,1);const minimised=c.database.prepare("SELECT * FROM commerce_orders").get();assert.equal(minimised.anonymous_owner_hash,"0".repeat(64));assert.equal(minimised.amount_minor,stored.amount_minor);assert.equal(minimised.cowrie_wallet_id,stored.cowrie_wallet_id);
    assert.equal(JSON.stringify(c.database.prepare("SELECT * FROM cowrie_ledger ORDER BY id").all()),ledger);
    assert.throws(()=>c.database.prepare("UPDATE commerce_orders SET amount_minor=200").run(),/immutable|CHECK/);
    assert.throws(()=>c.database.prepare("UPDATE commerce_orders SET anonymous_owner_hash=?").run(stored.anonymous_owner_hash),/immutable/);
    assert.deepEqual(c.database.prepare("PRAGMA foreign_key_check").all(),[]);
    assert.ok((await runApprovedRetention(c.adapter,until,1)).every(n=>n===0));
  }finally{c.database.close();}
});
