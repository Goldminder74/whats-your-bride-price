import assert from "node:assert/strict";
import test from "node:test";
import {performance} from "node:perf_hooks";
import {readFile,writeFile,copyFile,mkdir,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,relative} from "node:path";
import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {Miniflare} from "miniflare";
import {setup,credential,Adapter,request,checkout,verified,adverse} from "../helpers/cowrieCommerce.mjs";
import {D1QuestionSelectionRepository} from "../../db/questionSelection.ts";
import {deriveAnonymousSubjectHash} from "../../app/anonymousSession.ts";
import {completeCowrieQuickPlay} from "../../db/cowrieCompletion.ts";
import {runApprovedRetention,operatorRetentionPlan,restoreAuthorityPlan,restoreSuppressionPlan,assertRestoreReceipt} from "../../db/retention.ts";
import {RETENTION_DAY} from "../../db/retentionPolicy.ts";
import {CowrieWalletService,D1CowrieWalletRepository} from "../../db/cowrieWallet.ts";
import {loadMigrationPlan} from "../../scripts/data-migrations.mjs";

export async function completedFixture() {
 const c=await setup();const started=await c.walletService.startQuickPlay({region:"west",anonymousSessionCredential:credential,idempotencyKey:"readiness-fixture"});
 const now=Date.UTC(2026,8,12,12);const selected=await new D1QuestionSelectionRepository(c.adapter).getAttempt(started.selection.attemptId,await deriveAnonymousSubjectHash(credential),now);
 await completeCowrieQuickPlay(c.adapter,{attemptId:started.selection.attemptId,anonymousSessionCredential:credential,idempotencyKey:"c".repeat(32),avatarId:"adjoa",answers:selected.selection.questions.map(q=>({questionStableId:q.stableId,selectedOptionIds:q.acceptedAnswers[0]}))},now);
 return c;
}
export function cloneCompleted(c,count) {
 const attempt={...c.database.prepare("SELECT * FROM quiz_attempts LIMIT 1").get()};const result={...c.database.prepare("SELECT * FROM results LIMIT 1").get()};const answers=c.database.prepare("SELECT * FROM answers").all();
 const insert=(table,row)=>{const cols=Object.keys(row);c.database.prepare(`INSERT INTO ${table}(${cols.join(",")}) VALUES(${cols.map(()=>"?").join(",")})`).run(...cols.map(k=>row[k]));};
 c.database.exec("BEGIN");try {for(let i=1;i<count;i++) {
  const id=`readiness_attempt_${i}`;insert("quiz_attempts",{...attempt,id,idempotency_key_hash:i.toString(16).padStart(64,"0")});
  insert("results",{...result,id:`readiness_result_${i}`,attempt_id:id,public_slug:i.toString(16).padStart(48,"0")});
  for(const [j,row] of answers.entries())insert("answers",{...row,id:`readiness_answer_${i}_${j}`,attempt_id:id});
 }c.database.exec("COMMIT");}catch(error){c.database.exec("ROLLBACK");throw error;}
 return result.expires_at;
}
test("bounded purge advances beyond its first page of expired attempts without starving later answers",async()=>{
 const c=await completedFixture();try {
  const expiry=cloneCompleted(c,120),limit=50,start=performance.now();let passes=0;
  while(c.database.prepare("SELECT COUNT(*) n FROM answers").get().n && passes<40) {
   const before=c.database.prepare("SELECT COUNT(*) n FROM answers").get().n;
   await runApprovedRetention(c.adapter,expiry,limit);const after=c.database.prepare("SELECT COUNT(*) n FROM answers").get().n;
   assert.ok(before-after>0,"eligible answer backlog must advance on every pass");assert.ok(before-after<=limit);passes++;
  }
  assert.equal(c.database.prepare("SELECT COUNT(*) n FROM answers").get().n,0);assert.deepEqual(c.database.prepare("PRAGMA foreign_key_check").all(),[]);
  console.log(JSON.stringify({fixture:"120 completed quizzes / 1440 answers",limit,passes,elapsedMs:Math.round(performance.now()-start)}));
 }finally {c.database.close();}
});

test("actual backup copies replay independent authority before access, preserve financial dependencies and re-minimise restored links",async()=>{
 const c=await completedFixture(),directory=await mkdtemp(join(tmpdir(),"wybp-restore-rehearsal-"));let restored;
 const at=Date.UTC(2026,9,8,12),proof="a".repeat(64);
 const apply=(action,time=at)=>c.adapter.batch(operatorRetentionPlan(action,time).map(r=>c.adapter.prepare(r.sql).bind(...r.params)));
 try {
  const order=await c.service.startOrder(request(c));await c.service.webhook(await verified("checkout.session.completed",checkout(order)));
  await c.walletService.clear({anonymousSessionCredential:credential});await c.service.webhook(await verified("charge.refunded",adverse()));
  const wallet={...c.database.prepare("SELECT * FROM cowrie_wallets").get()},attempt={...c.database.prepare("SELECT * FROM quiz_attempts").get()},result={...c.database.prepare("SELECT * FROM results").get()};
  const snapshot=join(directory,"before-operators.sqlite");c.database.prepare("VACUUM INTO ?").run(snapshot);
  const payment=c.database.prepare("SELECT * FROM commerce_orders").get(),event=c.database.prepare("SELECT id FROM stripe_webhook_events WHERE event_type='charge.refunded'").get();
  await apply({operation:"settlement",orderId:payment.id,eventId:event.id,reason:"verified_refund"});
  // Preserve necessary signed settlement in the provider snapshot through a reconciled finance replay.
  const settlement={...c.database.prepare("SELECT * FROM retention_settlements").get()};
  await apply({operation:"open-case",id:"rehearsal_support",walletId:wallet.id,kind:"support",evidenceHash:proof});await apply({operation:"close-case",id:"rehearsal_support",kind:"support"});
  await apply({operation:"close-wallet",walletId:wallet.id,evidenceHash:proof});
  await apply({operation:"hold",id:"rehearsal_legal",scope:"wallet",subjectId:wallet.id,reason:"legal",evidenceHash:proof},at+1);
  await apply({operation:"erase",scope:"attempt",subjectId:attempt.id,evidenceHash:proof});await apply({operation:"erase",scope:"result",subjectId:result.id,evidenceHash:proof});
  const manifest={policy:"retention-v1",databaseId:"11111111-2222-4333-8444-555555555555",reviewedThrough:at+2,backupWindowMaxDays:30,financialReconciliation:true,holdsReconciled:true,caseAuthorityReconciled:true,activeHolds:c.database.prepare("SELECT * FROM retention_holds WHERE released_at IS NULL").all(),cases:c.database.prepare("SELECT * FROM retention_cases").all(),closures:c.database.prepare("SELECT * FROM retention_closures").all(),entries:c.database.prepare("SELECT scope,subject_id subjectId,unavailable_at unavailableAt,forget_after forgetAfter FROM retention_suppression").all()};
  const journal=join(directory,"independent-authority.json"),bytes=Buffer.from(JSON.stringify(manifest));await writeFile(journal,bytes);const receipt=createHash("sha256").update(bytes).digest("hex");
  await copyFile(snapshot,join(directory,"restore.sqlite"));assert.deepEqual(await readFile(snapshot),await readFile(join(directory,"restore.sqlite")));
  restored=new DatabaseSync(join(directory,"restore.sqlite"));restored.exec("PRAGMA foreign_keys=ON");const adapter=new Adapter(restored);
  await assert.rejects(assertRestoreReceipt(adapter,receipt));
  const independentlyRead=JSON.parse(await readFile(journal,"utf8"));assert.equal(createHash("sha256").update(await readFile(journal)).digest("hex"),receipt);
  // This is the same immutable signed-event/ledger verification as a reconciled operator settlement.
  await adapter.batch(operatorRetentionPlan({operation:"settlement",orderId:settlement.order_id,eventId:settlement.event_id,reason:settlement.reason},settlement.settled_at).map(r=>adapter.prepare(r.sql).bind(...r.params)));
  const replay=[...restoreAuthorityPlan(independentlyRead.activeHolds,independentlyRead.cases,independentlyRead.closures,at+2),...restoreSuppressionPlan(independentlyRead.entries,receipt,at+2)];
  for(let i=0;i<2;i++)await adapter.batch(replay.map(r=>adapter.prepare(r.sql).bind(...r.params)));
  await assertRestoreReceipt(adapter,receipt);
  const service=new CowrieWalletService(new D1CowrieWalletRepository(adapter,new D1QuestionSelectionRepository(adapter)),{now:()=>at+2});
  await assert.rejects(service.projection({anonymousSessionCredential:credential}));await assert.rejects(service.recover({walletReference:wallet.public_reference,recoveryCredential:c.created.recoveryCredential,anonymousSessionCredential:"b".repeat(32)}));
  assert.throws(()=>restored.prepare("UPDATE cowrie_wallets SET state='active'").run(),/cannot reopen/);
  assert.equal(restored.prepare("SELECT status FROM quiz_attempts").get().status,"deleted");assert.equal(restored.prepare("SELECT state FROM results").get().state,"deleted");
  assert.equal(restored.prepare("SELECT closed_at FROM cowrie_wallets").get().closed_at,at);
  const ledger=restored.prepare("SELECT id,delta,related_order_id,related_allocation_id FROM cowrie_ledger ORDER BY id").all();
  await runApprovedRetention(adapter,at+31*RETENTION_DAY,50);assert.equal(restored.prepare("SELECT ownership_minimized_at FROM cowrie_wallets").get().ownership_minimized_at,null,"held proof retained");
  await adapter.batch(operatorRetentionPlan({operation:"release-hold",id:"rehearsal_legal"},at+31*RETENTION_DAY).map(r=>adapter.prepare(r.sql).bind(...r.params)));
  await runApprovedRetention(adapter,at+31*RETENTION_DAY,50);assert.equal(restored.prepare("SELECT anonymous_owner_hash FROM cowrie_wallets").get().anonymous_owner_hash,"0".repeat(64));
  assert.deepEqual(restored.prepare("SELECT id,delta,related_order_id,related_allocation_id FROM cowrie_ledger ORDER BY id").all(),ledger);
  assert.equal(restored.prepare("SELECT COUNT(*) n FROM commerce_orders").get().n,1);assert.equal(restored.prepare("SELECT COUNT(*) n FROM cowrie_purchase_allocations").get().n,1);
  assert.deepEqual(restored.prepare("PRAGMA foreign_key_check").all(),[]);
  // A two-day-old snapshot may still contain already-closed links that were minimised later.
  const linked=join(directory,"closed-before-minimisation.sqlite");c.database.prepare("VACUUM INTO ?").run(linked);
  const restoreClosed=new DatabaseSync(linked);try {const a=new Adapter(restoreClosed);await a.batch(operatorRetentionPlan({operation:"release-hold",id:"rehearsal_legal"},at+31*RETENTION_DAY).map(r=>a.prepare(r.sql).bind(...r.params)));await runApprovedRetention(a,at+31*RETENTION_DAY,50);assert.equal(restoreClosed.prepare("SELECT anonymous_owner_hash FROM cowrie_wallets").get().anonymous_owner_hash,"0".repeat(64));assert.throws(()=>restoreClosed.prepare("UPDATE cowrie_wallets SET state='active'").run(),/cannot reopen/);}finally{restoreClosed.close();}
  if(process.env.WYBP_REHEARSAL_EVIDENCE_OUTPUT) {
   const output=resolve(process.env.WYBP_REHEARSAL_EVIDENCE_OUTPUT),allowed=resolve("outputs/activation-preparation"),rel=relative(allowed,output);if(!rel||rel.startsWith("..")||rel.includes(":"))throw new Error("ignored_rehearsal_output_required");await mkdir(output,{recursive:false});
   for(const name of ["before-operators.sqlite","independent-authority.json","closed-before-minimisation.sqlite"])await copyFile(join(directory,name),join(output,name));
   await writeFile(join(output,"settlement.json"),JSON.stringify(settlement)+"\n");await writeFile(join(output,"README.txt"),"Synthetic local restore rehearsal only. No customer, bank or real Stripe data. Logical snapshot precedes operator changes; replay verified settlement before private closure/hold authority. Closed-before-minimisation snapshot represents capture at day 29 and recovery at day 31, within 30 days. No provider restore or live custody automation is claimed.\n");
  }
  console.log("PASS file-backed restore: checksum readback, reconciled settlement, original clocks, repeat-safe suppression, held proof, accounting lineage, re-minimisation and recovery denial.");
 }finally {restored?.close();c.database.close();await rm(directory,{recursive:true,force:true});}
});

test("representative local volume drains within the proposed seven-day schedule and repeat execution is inert",async()=>{
 const c=await completedFixture();try {
  const quizzes=1000,expiry=cloneCompleted(c,quizzes),start=performance.now(),times=[];let passes=0;
  while(c.database.prepare("SELECT COUNT(*) n FROM answers").get().n){const t=performance.now();await runApprovedRetention(c.adapter,expiry,50);times.push(performance.now()-t);assert.ok(++passes<=240);}
  assert.equal(passes,240);assert.ok((await runApprovedRetention(c.adapter,expiry,50)).every(n=>n===0));
  times.sort((a,b)=>a-b);console.log(JSON.stringify({engine:"file-compatible local SQLite",quizzes,answers:quizzes*12,limit:50,passes,elapsedMs:Math.round(performance.now()-start),p95PassMs:Math.round(times[Math.floor(times.length*.95)]),rowsPerSecond:Math.round(quizzes*12/((performance.now()-start)/1000)),scheduledHours:passes/4,theoreticalSevenDayAnswerCapacity:50*4*24*7}));
 }finally{c.database.close();}
});

test("real isolated D1 advances bounded child purge across parent pages",async()=>{
 const c=await completedFixture(),expiry=cloneCompleted(c,120);const mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('local only')}}",d1Databases:{DB:"rehearsal-local"}});
 try {
  const db=await mf.getD1Database("DB");for(const m of await loadMigrationPlan())await db.batch(m.statements.map(s=>db.prepare(s)));
  for(const table of ["quiz_editions","questions","quiz_attempts","answers","results","cowrie_wallets","cowrie_ledger"]){const rows=c.database.prepare(`SELECT * FROM ${table}`).all();for(let i=0;i<rows.length;i+=100)await db.batch(rows.slice(i,i+100).map(original=>{const r=table==="cowrie_wallets"?{...original,purchased_balance:0,bonus_balance:0}:original;const cols=Object.keys(r);return db.prepare(`INSERT INTO ${table}(${cols.join(",")}) VALUES(${cols.map(()=>"?").join(",")})`).bind(...cols.map(k=>r[k]));}));}
  const start=performance.now();let passes=0;while((await db.prepare("SELECT COUNT(*) n FROM answers").first()).n){await runApprovedRetention(db,expiry,50);assert.ok(++passes<=29);}
  assert.equal(passes,29);assert.deepEqual((await db.prepare("PRAGMA foreign_key_check").all()).results,[]);console.log(JSON.stringify({engine:"Miniflare D1",answers:1440,limit:50,passes,elapsedMs:Math.round(performance.now()-start)}));
 }finally{c.database.close();await mf.dispose();}
});
