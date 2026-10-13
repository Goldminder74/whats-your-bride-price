import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { setup, credential, request, checkout, verified, adverse } from '../helpers/cowrieCommerce.mjs';
import { D1QuestionSelectionRepository } from '../../db/questionSelection.ts';
import { deriveAnonymousSubjectHash } from '../../app/anonymousSession.ts';
import { completeCowrieQuickPlay } from '../../db/cowrieCompletion.ts';
import { operatorRetentionPlan, restoreAuthorityPlan, restoreSuppressionPlan, assertRestoreReceipt } from '../../db/retention.ts';
import { loadMigrationPlan, applyMigrationPlan } from '../../scripts/data-migrations.mjs';
import { D1Authority } from '../../scripts/authority-runtime.mjs';
import { authoritySnapshot } from '../../worker/authoritySnapshot.mjs';
import { recoveryHash } from '../../scripts/recovery-crypto.mjs';
import { materializeWorkerSnapshot } from '../../scripts/worker-snapshot-restore.mjs';
import { providerRestorePlan, verifyProviderRestore, restorePages, finishRestore, recoveryAccess } from '../../scripts/d1-operational-recovery.mjs';
function adapter(sql){return {async query(s,p=[]){return sql.prepare(s).all(...p);},async batch(rows){sql.exec('BEGIN IMMEDIATE');try{const out=rows.map(r=>sql.prepare(r.sql).all(...r.params));sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};}

test('actual encrypted Worker pages restore accounting, closed wallets, holds and deletion suppression after interrupted import',async()=>{
 const c=await setup(),target=new DatabaseSync(':memory:'),key=randomBytes(32),files=new Map();let materialized;
 const now=Date.now(),proof='a'.repeat(64),custody={get:async name=>files.get(name)||null,list:async()=>[...files.keys()].sort(),put:async(name,bytes)=>{if(files.has(name))assert.deepEqual(files.get(name),bytes);else files.set(name,bytes);return recoveryHash(bytes);}};
 try{
  const started=await c.walletService.startQuickPlay({region:'west',anonymousSessionCredential:credential,idempotencyKey:'worker-restore-fixture'}),at=Date.UTC(2026,8,12,12);
  const selected=await new D1QuestionSelectionRepository(c.adapter).getAttempt(started.selection.attemptId,await deriveAnonymousSubjectHash(credential),at);
  await completeCowrieQuickPlay(c.adapter,{attemptId:started.selection.attemptId,anonymousSessionCredential:credential,idempotencyKey:'c'.repeat(32),avatarId:'adjoa',answers:selected.selection.questions.map(q=>({questionStableId:q.stableId,selectedOptionIds:q.acceptedAnswers[0]}))},at);
  const order=await c.service.startOrder(request(c));await c.service.webhook(await verified('checkout.session.completed',checkout(order)));
  await c.walletService.clear({anonymousSessionCredential:credential});await c.service.webhook(await verified('charge.refunded',adverse()));
  const wallet=c.database.prepare('SELECT id FROM cowrie_wallets').get().id,payment=c.database.prepare('SELECT id FROM commerce_orders').get().id,event=c.database.prepare("SELECT id FROM stripe_webhook_events WHERE event_type='charge.refunded'").get().id;
  const result=c.database.prepare('SELECT id FROM results').get().id;
  const actions=[{operation:'settlement',orderId:payment,eventId:event,reason:'verified_refund'},{operation:'close-wallet',walletId:wallet,evidenceHash:proof},{operation:'hold',id:'synthetic_recovery_hold',scope:'wallet',subjectId:wallet,reason:'legal',evidenceHash:proof},{operation:'erase',scope:'attempt',subjectId:started.selection.attemptId,evidenceHash:proof},{operation:'erase',scope:'result',subjectId:result,evidenceHash:proof}];
  for(const action of actions)await c.adapter.batch(operatorRetentionPlan(action,now).map(r=>c.adapter.prepare(r.sql).bind(...r.params)));
  const source=adapter(c.database),authority=new D1Authority(source,custody,key);await authority.initialise();
  const delivered=await authority.deliver('populated-worker',authoritySnapshot(source,custody,key,{pageSize:10}));
  materialized=await materializeWorkerSnapshot(custody,key,'populated-worker',delivered.receipt);
  assert.equal(materialized.runtimeAccess,'blocked_pending_fresh_receipt');
  await assert.rejects(materializeWorkerSnapshot(custody,randomBytes(32),'populated-worker',delivered.receipt));
  const plan=providerRestorePlan(materialized.database,{unboundRehearsal:true,pageSize:10}),db=adapter(target);applyMigrationPlan(target,await loadMigrationPlan());
  const stop=Math.floor(plan.pages.length/2);
  await assert.rejects(restorePages(db,'populated-recovery',plan.sha256,plan.pages,now,(_,index)=>{if(index===stop)throw Error('synthetic-interruption');}),/synthetic-interruption/);
  await assert.rejects(recoveryAccess(db,'populated-recovery',delivered.receipt),/blocked/);
  // A new adapter resumes the committed cursor; no source mutation or page replay.
  await restorePages(adapter(target),'populated-recovery',plan.sha256,plan.pages,now);
  await finishRestore(db,'populated-recovery',plan.sha256,()=>verifyProviderRestore(materialized.database,db,plan));
  await assert.rejects(recoveryAccess(db,'populated-recovery',delivered.receipt),/suppression/);
  const authorityPlan=restoreAuthorityPlan(c.database.prepare('SELECT * FROM retention_holds WHERE released_at IS NULL').all(),[],c.database.prepare('SELECT * FROM retention_closures').all(),now);
  const suppression=c.database.prepare('SELECT scope,subject_id subjectId,unavailable_at unavailableAt,forget_after forgetAfter FROM retention_suppression').all();
  const replay=[...authorityPlan,...restoreSuppressionPlan(suppression,delivered.receipt,now)];
  await db.batch(replay);await db.batch(replay);await assertRestoreReceipt({prepare:s=>({first:async()=>target.prepare(s).get()})},delivered.receipt);
  assert.equal(target.prepare('SELECT COUNT(*) n FROM cowrie_wallets').get().n,1);
  assert.equal(target.prepare('SELECT purchased_balance FROM cowrie_wallets').get().purchased_balance,0);
  assert.equal(target.prepare('SELECT closed_at FROM retention_closures').get().closed_at,now);
  assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_holds WHERE released_at IS NULL').get().n,1);
  assert.equal(target.prepare('SELECT status FROM quiz_attempts').get().status,'deleted');assert.equal(target.prepare('SELECT state FROM results').get().state,'deleted');
  assert.throws(()=>target.exec("UPDATE cowrie_wallets SET state='active'"),/cannot reopen/);
  assert.throws(()=>target.exec('UPDATE cowrie_wallets SET purchased_balance=99'),/cache mismatch/);
  assert.deepEqual(target.prepare('PRAGMA foreign_key_check').all(),[]);
  await restorePages(db,'populated-recovery',plan.sha256,plan.pages,now);
  assert.equal(target.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n,1);
  const removed=delivered.body.files[0];files.delete(removed.name);await assert.rejects(materializeWorkerSnapshot(custody,key,'populated-worker',delivered.receipt),/snapshot_file_gap/);
 }finally{materialized?.database.close();c.database.close();target.close();}
});
