import test from 'node:test';import assert from 'node:assert/strict';
import {approvedRetainedFixture} from '../helpers/approvedRetainedFixture.mjs';import {populateRetainedStock,populateRetainedPurchases} from '../../scripts/retained-stock-fixture.mjs';
test('99-day synthetic stock preserves real expiry/ownership and protected financial examples instead of cloning deleted gameplay',async()=>{
 const c=await approvedRetainedFixture({populated:true}),at=Date.now(),tables=['commerce_orders','cowrie_ledger','retention_holds','retention_closures','retention_suppression'],before=Object.fromEntries(tables.map(t=>[t,c.database.prepare('SELECT * FROM '+t+' ORDER BY 1').all()]));
 try{
  const report=populateRetainedStock(c.database,{completed:99,incomplete:10,wallets:120,at});assert.equal(c.database.prepare("SELECT COUNT(*) n FROM questions WHERE stable_id LIKE '%_d_extra_%'").get().n,0);assert.equal(c.database.prepare("SELECT COUNT(*) n FROM question_evidence_verifications").get().n,90);assert.equal(report.measuredCompletions,0);assert.equal(report.physicalAnswers,1188);
  for(const t of tables)assert.deepEqual(c.database.prepare('SELECT * FROM '+t+' ORDER BY 1').all(),before[t],t);
  assert.equal(c.database.prepare("SELECT COUNT(*) n FROM quiz_attempts WHERE id GLOB 'retained_attempt_*' AND status='completed' AND expires_at<=?").get(at).n,9);
  assert.equal(c.database.prepare("SELECT COUNT(*) n FROM quiz_attempts WHERE id GLOB 'retained_attempt_*' AND status='completed' AND expires_at-completed_at!=7776000000").get().n,0);
  assert.equal(c.database.prepare("SELECT COUNT(*) n FROM results r JOIN quiz_attempts a ON a.id=r.attempt_id WHERE r.id GLOB 'retained_result_*' AND (r.state!='active' OR a.status!='completed' OR a.deleted_at IS NOT NULL)").get().n,0);
  assert.equal(c.database.prepare("SELECT COUNT(*) n FROM quiz_attempts a JOIN cowrie_wallets w ON w.anonymous_owner_hash=a.anonymous_subject_hash WHERE a.id GLOB 'retained_attempt_*' AND w.state='active'").get().n,109);
  assert.equal(c.database.prepare("SELECT COUNT(*) n FROM answers WHERE attempt_id GLOB 'retained_attempt_*'").get().n,1188);assert.deepEqual(c.database.prepare('PRAGMA foreign_key_check').all(),[]);assert.throws(()=>populateRetainedStock(c.database,{completed:99,incomplete:10,wallets:120,at}),/already_started/);
 }finally{c.database.close();}
});
test('historical paid volume uses actual encrypted contracts and webhook accounting without external mail or duplicate fixture appends',async()=>{
 const c=await approvedRetainedFixture({populated:true}),key=Buffer.alloc(32,7),before=c.database.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n;
 try{const r=await populateRetainedPurchases(c,{count:3,key});assert.equal(r.historicalOrders,3);assert.equal(r.fixtureAcceptances,3);assert.equal(r.externalEmails,0);assert.equal(c.database.prepare('SELECT COUNT(*) n FROM commerce_orders').get().n,before+3);assert.equal(c.database.prepare("SELECT COUNT(*) n FROM purchase_confirmations WHERE state='sent' AND encrypted_recipient IS NULL").get().n,3);const raw=JSON.stringify(c.database.prepare('SELECT * FROM purchase_confirmations').all());assert.equal(raw.includes('synthetic@example.invalid'),false);assert.equal(raw.includes('Synthetic retained fixture address'),false);assert.deepEqual(c.database.prepare('PRAGMA foreign_key_check').all(),[]);await assert.rejects(populateRetainedPurchases(c,{count:3,key}),/already_started/);}finally{key.fill(0);c.database.close();}
});
