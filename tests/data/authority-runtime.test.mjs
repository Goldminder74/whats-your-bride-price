import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { loadMigrationPlan, applyMigrationPlan } from '../../scripts/data-migrations.mjs';
import { createOperationId } from '../../scripts/authority-runtime.mjs';
import { recoveryHash } from '../../scripts/recovery-crypto.mjs';
import { createAuthorityService, d1AuthorityAdapter } from '../../worker/authorityService.mjs';
async function fixture() {
  const sql = new DatabaseSync(':memory:'); applyMigrationPlan(sql, await loadMigrationPlan());
  sql.exec('CREATE TABLE synthetic_records(id TEXT PRIMARY KEY)');
  const db = { async query(s,p=[]) { return sql.prepare(s).all(...p); }, async batch(rows) {
    sql.exec('BEGIN');try { const result=rows.map(r=>sql.prepare(r.sql).all(...r.params));sql.exec('COMMIT');return result; }
    catch(e){sql.exec('ROLLBACK');throw e;}
  }};
  const at=Date.now();await db.batch([{sql:"INSERT INTO operational_recovery_checkpoints VALUES('journal','journal',?1,0,?1,0,'idle',1,?2,?3)",params:['0'.repeat(64),at,at+30*86400000]}]);
  const files=new Map(), alerts=[];
  const custody={async get(n){return files.get(n)||null;},async put(n,b){if(files.has(n))assert.deepEqual(files.get(n),b);else files.set(n,b);return recoveryHash(b);},async list(){return [...files.keys()].sort();}};
  const options={db,custody,key:randomBytes(32),now:()=>at,alert:async event=>alerts.push(event),snapshot:async()=>{const bytes=Buffer.from('encrypted-synthetic');return {files:[{name:'snapshot.enc',sha256:await custody.put('snapshot.enc',bytes)}]};}};
  return {sql,options,files,alerts,at};
}
test('private runtime delivers verified authority and retries never repeat a mutation',async()=>{
 const f=await fixture();try {const service=createAuthorityService(f.options),op=createOperationId(f.at),statements=[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['one']}];
 await service.mutate(op,statements);await service.mutate(op,statements);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);
 assert.match(await service.deliver('boundary_one'),/^[a-f0-9]{64}$/);assert.equal(await service.ready(),true);assert.equal(f.alerts.length,0);
 }finally{f.sql.close();}
});
test('interrupted delivery fences access, emits no private detail, and resumes safely',async()=>{
 const f=await fixture();try {let fail=true;f.options.snapshot=async()=>{if(fail)throw Error('provider-secret-must-not-leak');const b=Buffer.from('encrypted');return {files:[{name:'s.enc',sha256:await f.options.custody.put('s.enc',b)}]};};
 const service=createAuthorityService(f.options);await assert.rejects(service.deliver('interrupted'));
 await assert.rejects(service.ready(),/authority_unavailable/);assert.deepEqual(f.alerts,[{component:'authority',status:'blocked',at:f.at}]);
 fail=false;await service.deliver('interrupted');assert.equal(await service.ready(),true);
 }finally{f.sql.close();}
});
test('database response failures and missing secure configuration fail closed',async()=>{
 assert.throws(()=>createAuthorityService({}),/authority_configuration/);
 const adapter=d1AuthorityAdapter({prepare(){return {bind(){return {async all(){return {success:false,results:[]};}};}};},async batch(){return [];}});
 await assert.rejects(adapter.query('SELECT 1'),/authority_query/);await assert.rejects(adapter.batch([{sql:'SELECT 1'}]),/authority_batch/);
});

test('delivery heartbeat occurs only after verified readback; monitor failures are visible',async()=>{
 const { authorityDeliveryTick }=await import('../../worker/authorityService.mjs');let delivered=false;
 const service={async deliver(){delivered=true;return 'a'.repeat(64);},async ready(){assert.equal(delivered,true);}};
 await assert.rejects(authorityDeliveryTick(service,'one',async()=>{throw Error('monitor_down');}),/monitor_down/);
 let called=false;await assert.rejects(authorityDeliveryTick({async deliver(){throw Error('delivery_down');}},'two',async()=>{called=true;}),/delivery_down/);assert.equal(called,false);
});

test('overlapping local invocation cannot cross a delivery fence',async()=>{
 const f=await fixture();try {let release,entered;const started=new Promise(r=>entered=r);
 f.options.snapshot=async()=>{entered();await new Promise(r=>release=r);const b=Buffer.from('encrypted');return {files:[{name:'s.enc',sha256:await f.options.custody.put('s.enc',b)}]};};
 const service=createAuthorityService(f.options),delivery=service.deliver('overlap');await started;
 await assert.rejects(service.mutate(createOperationId(f.at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['blocked']}]),/authority_busy/);
 release();await delivery;assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,0);
 }finally{f.sql.close();}
});
