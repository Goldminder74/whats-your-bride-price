import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {prepareStreamedRestore,importStreamedRestore,verifyStreamedRestore,auditStreamedSourceStep,clearAuditedSyntheticTarget,importProductionRestore,verifyProductionRestoreStep} from '../../scripts/streamed-d1-restore.mjs';
import {populatedRecoveryFixture} from '../helpers/populatedRecovery.mjs';
import {loadMigrationPlan,applyMigrationPlan} from '../../scripts/data-migrations.mjs';
import {recoveryHash} from '../../scripts/recovery-crypto.mjs';
const resource={name:'wybp-capacity-d1-r002',id:'11111111-1111-4111-8111-111111111111',account:'b6b22a9a87b5758725e5c499782160af'};
function adapter(database){return {query:async(s,p=[])=>database.prepare(s).all(...p),batch:async statements=>{database.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');try{const results=statements.map(s=>database.prepare(s.sql).all(...(s.params||[])));database.exec('COMMIT');return results;}catch(e){database.exec('ROLLBACK');throw e;}}};}

test('private production import pins provenance and original expiry, resumes without duplicates and cannot grant access',async()=>{
 const c=await populatedRecoveryFixture(),target=new DatabaseSync(':memory:'),key=randomBytes(32),files=new Map(),at=Date.now();
 const custody={get:async n=>files.get(n)||null,put:async(n,b)=>{if(files.has(n))assert.deepEqual(files.get(n),b);files.set(n,b);return recoveryHash(b);}};
 const provenance={boundarySha256:'a'.repeat(64),snapshotSha256:'b'.repeat(64),createdAt:at-86400000,expiresAt:at+29*86400000};
 const options={role:'production-ops',databaseName:'wybp-prod-d1-r001',databaseId:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9',boundarySha256:provenance.boundarySha256,snapshotSha256:provenance.snapshotSha256,job:'recovery_synthetic_only',maxPages:1,now:at};
 try{
  applyMigrationPlan(target,await loadMigrationPlan());const db=adapter(target);
  const plan=await prepareStreamedRestore(c.database,custody,key,'synthetic_production_plan',{packPages:true,now:at,provenance});
  await assert.rejects(prepareStreamedRestore(c.database,custody,key,'synthetic_production_plan',{packPages:true,now:at,provenance:{...provenance,boundarySha256:'c'.repeat(64)}}));
  for(const altered of [{role:'production-app'},{databaseName:'wybp-capacity-d1-r002'},{databaseId:resource.id},{boundarySha256:'c'.repeat(64)}])await assert.rejects(importProductionRestore(db,custody,key,plan,{...options,...altered}));
  await assert.rejects(importStreamedRestore(db,custody,key,plan,{resource:{...resource,name:'wybp-prod-d1-r001'},job:'synthetic_illegal'}),/resource_scope/);
  let crash=true;await assert.rejects(importProductionRestore(db,custody,key,plan,{...options,fault:()=>{if(crash){crash=false;throw Error('lost_page_reply');}}}),/lost_page_reply/);
  let imported,calls=0;do{imported=await importProductionRestore(db,custody,key,plan,options);assert.ok(++calls<100);}while(!imported.imported);
  let result;do{result=await verifyProductionRestoreStep(db,custody,key,plan,options);assert.equal(result.runtimeAccess,result.verified?'blocked_pending_authority_suppression_receipt':'blocked_pending_verification');assert.ok(++calls<200);}while(!result.verified);
  assert.deepEqual(target.prepare('PRAGMA foreign_key_check').all(),[]);
  for(const table of ['cowrie_ledger','cowrie_wallets','commerce_orders','retention_holds','retention_closures'])assert.deepEqual(target.prepare('SELECT * FROM '+table+' ORDER BY 1').all(),c.database.prepare('SELECT * FROM '+table+' ORDER BY 1').all());
  assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
  assert.equal(target.prepare('SELECT expires_at FROM operational_recovery_checkpoints WHERE id=?').get(options.job).expires_at,provenance.expiresAt);
  await assert.rejects(importProductionRestore(db,custody,key,plan,{...options,job:'recovery_populated_must_reject'}));
  await assert.rejects(verifyProductionRestoreStep(db,custody,key,plan,{...options,now:provenance.expiresAt}));
 }finally{c.database.close();target.close();}
});

test('nullable primary keys fail explicitly rather than silently skipping rows on keyset resume',async()=>{
 const source=new DatabaseSync(':memory:'),files=new Map();
 try{source.exec('CREATE TABLE synthetic_nullable(id TEXT PRIMARY KEY,value TEXT); INSERT INTO synthetic_nullable VALUES(NULL,\'synthetic\')');
  const custody={get:async n=>files.get(n)||null,put:async(n,b)=>{files.set(n,b);return recoveryHash(b);}};
  await assert.rejects(prepareStreamedRestore(source,custody,randomBytes(32),'synthetic_null'),/unavailable/);
 }finally{source.close();}
});

test('text with embedded NUL is explicitly rejected rather than verified using a truncated quote',async()=>{
 const source=new DatabaseSync(':memory:'),files=new Map();
 try{source.exec('CREATE TABLE synthetic_text(id TEXT PRIMARY KEY,value TEXT)');source.prepare('INSERT INTO synthetic_text VALUES(?,?)').run('synthetic','before\0after');
  const custody={get:async n=>files.get(n)||null,put:async(n,b)=>{files.set(n,b);return recoveryHash(b);}};
  await assert.rejects(prepareStreamedRestore(source,custody,randomBytes(32),'synthetic_nul'),/unavailable/);
  assert.equal(files.has('synthetic_nul.restore.manifest.enc'),false);
 }finally{source.close();}
});

test('populated source audit resumes only under the same fence and never grants access',async()=>{
 const c=await populatedRecoveryFixture(),key=randomBytes(32),files=new Map();
 const custody={get:async n=>files.get(n)||null,put:async(n,b)=>{files.set(n,b);return recoveryHash(b);}};
 try{
  const pointer=await prepareStreamedRestore(c.database,custody,key,'synthetic_audit_plan',{packPages:true});
  const db=adapter(c.database),before=c.database.prepare('SELECT * FROM cowrie_ledger ORDER BY 1').all();let fence='a'.repeat(64);
  const options={resource,job:'synthetic_source',maxPages:1,assertFrozen:async()=>fence};
  assert.equal((await auditStreamedSourceStep(db,custody,key,pointer,options)).verified,false);
  fence='b'.repeat(64);await assert.rejects(auditStreamedSourceStep(db,custody,key,pointer,options),/unavailable/);
  fence='a'.repeat(64);let result;do{result=await auditStreamedSourceStep(db,custody,key,pointer,options);}while(!result.verified);
  assert.deepEqual(c.database.prepare('SELECT * FROM cowrie_ledger ORDER BY 1').all(),before);
  assert.equal(c.database.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
  assert.equal(result.sourceFenceSha256,fence);
  await assert.rejects(importStreamedRestore(db,custody,key,pointer,{resource,job:'synthetic_target'}));
  fence='b'.repeat(64);await assert.rejects(clearAuditedSyntheticTarget(db,custody,key,pointer,options),/unavailable/);
  assert.deepEqual(c.database.prepare('SELECT * FROM cowrie_ledger ORDER BY 1').all(),before);fence='a'.repeat(64);
  await assert.rejects((async()=>{for(;;)await clearAuditedSyntheticTarget(db,custody,key,pointer,{...options,fault:stage=>{if(stage==='clear_committed')throw Error('synthetic_lost_response');}});})(),/synthetic_lost_response/);
  assert.equal(c.database.prepare('SELECT COUNT(*) n FROM cowrie_ledger').get().n,0);
  await importStreamedRestore(db,custody,key,pointer,{resource,job:'synthetic_target',maxPages:1});
  const checkpoint=c.database.prepare('SELECT cursor FROM operational_recovery_checkpoints WHERE id=?').get('synthetic_target');
  assert.equal((await clearAuditedSyntheticTarget(db,custody,key,pointer,options)).replayed,true);
  assert.deepEqual(c.database.prepare('SELECT cursor FROM operational_recovery_checkpoints WHERE id=?').get('synthetic_target'),checkpoint);
 }finally{c.database.close();}
});
test('streamed encrypted plan imports accounting dependencies with bounded resume, original clocks and no access grant',async()=>{
 const c=await populatedRecoveryFixture(),target=new DatabaseSync(':memory:'),key=randomBytes(32),files=new Map(),job='synthetic_stream';
 const custody={get:async n=>files.get(n)||null,put:async(n,b)=>{if(files.has(n))assert.deepEqual(files.get(n),b);files.set(n,b);return recoveryHash(b);}};
 try{
  const at=Math.floor(Date.now()/60000)*60000;
  c.database.exec('BEGIN');
  const insert=c.database.prepare('INSERT INTO daily_operation_limits(id,rate_key_hash,action,window_started_at,request_count,expires_at,created_at,updated_at) VALUES(?,?,?, ?,1,?,?,?)');
  for(let i=0;i<51003;i++)insert.run('synthetic_stock_'+i,i.toString(16).padStart(64,'0'),'start',at,at+86400000,at,at);
  c.database.exec('COMMIT');
  applyMigrationPlan(target,await loadMigrationPlan());
  const typeSchema='CREATE TABLE synthetic_types(id TEXT PRIMARY KEY,whole REAL,fraction REAL,bytes BLOB,label TEXT)';
  c.database.exec(typeSchema);target.exec(typeSchema);
  c.database.prepare('INSERT INTO synthetic_types VALUES(?,?,?,?,?)').run('synthetic_types',1,1.125,Buffer.from([0,255,13]),'Àṣà: discovery');
  const pointer=await prepareStreamedRestore(c.database,custody,key,'synthetic_plan',{pageSize:5});
  assert.deepEqual(await prepareStreamedRestore(c.database,custody,key,'synthetic_plan',{pageSize:5,now:Date.now()+1000}),pointer);
  const db=adapter(target);let interrupted=false;
  await assert.rejects(importStreamedRestore(db,custody,key,pointer,{resource,job,maxPages:10,fault:(_stage,cursor)=>{if(cursor===3){interrupted=true;throw Error('synthetic_interrupt');}}}),/synthetic_interrupt/);
  assert.equal(interrupted,true);assert.equal(target.prepare('SELECT cursor FROM operational_recovery_checkpoints WHERE id=?').get(job).cursor,3);
  assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
  assert.equal(target.prepare("SELECT COUNT(*) n FROM daily_operation_limits WHERE id LIKE 'synthetic_stock_%'").get().n,0);
  await assert.rejects(verifyStreamedRestore(db,custody,key,pointer,{job}),/unavailable/);
  let result;do{result=await importStreamedRestore(db,custody,key,pointer,{resource,job,maxPages:10});assert.ok(result.runtimeAccess.startsWith('blocked_'));}while(!result.imported);
  assert.deepEqual(await verifyStreamedRestore(db,custody,key,pointer,{job}),{verified:true,runtimeAccess:'blocked_pending_authority_suppression_receipt'});
  assert.equal((await verifyStreamedRestore(db,custody,key,pointer,{job})).verified,true);
  assert.equal((await importStreamedRestore(db,custody,key,pointer,{resource,job})).imported,true);
  assert.equal(target.prepare("SELECT COUNT(*) n FROM daily_operation_limits WHERE id LIKE 'synthetic_stock_%'").get().n,51003);
  assert.deepEqual(target.prepare('SELECT *,typeof(whole) whole_type,typeof(fraction) fraction_type FROM synthetic_types').all(),c.database.prepare('SELECT *,typeof(whole) whole_type,typeof(fraction) fraction_type FROM synthetic_types').all());
  for(const table of ['cowrie_wallets','cowrie_ledger','commerce_orders','stripe_webhook_events','retention_holds','retention_closures','retention_suppression'])assert.deepEqual(target.prepare('SELECT * FROM '+table+' ORDER BY 1').all(),c.database.prepare('SELECT * FROM '+table+' ORDER BY 1').all());
  assert.throws(()=>target.exec("UPDATE cowrie_wallets SET state='active'"),/cannot reopen/);
  assert.throws(()=>target.exec('UPDATE cowrie_wallets SET purchased_balance=99'),/cache mismatch/);
  assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
  await assert.rejects(importStreamedRestore(db,custody,key,pointer,{resource:{...resource,id:'1a268b28-e6d5-4431-8f84-a886df9369f1'},job}),/scope/);
  await assert.rejects(importStreamedRestore(db,custody,key,pointer,{resource,job:'synthetic_other'}));
 }finally{c.database.close();target.close();}
});

test('packed import plans resume a committed page without duplicates and preserve accounting and suppression',async()=>{
 const c=await populatedRecoveryFixture(),target=new DatabaseSync(':memory:'),key=randomBytes(32),files=new Map();
 const custody={get:async n=>files.get(n)||null,put:async(n,b)=>{if(files.has(n))assert.deepEqual(files.get(n),b);files.set(n,b);return recoveryHash(b);}};
 try{
  applyMigrationPlan(target,await loadMigrationPlan());const pointer=await prepareStreamedRestore(c.database,custody,key,'synthetic_packed',{pageSize:5,packPages:true});
  assert.deepEqual(await prepareStreamedRestore(c.database,custody,key,'synthetic_packed',{pageSize:5,packPages:true}),pointer);
  await assert.rejects(prepareStreamedRestore(c.database,custody,key,'synthetic_packed',{pageSize:5,packPages:false}),/unavailable/);
  assert.equal([...files.keys()].some(n=>n.includes('.restore.page')),false);
  const db=adapter(target),job='synthetic_packed_import';
  await assert.rejects(importStreamedRestore(db,custody,key,pointer,{resource,job,maxPages:1,fault:()=>{throw Error('synthetic_interruption');}}),/synthetic_interruption/);
  let result;do{result=await importStreamedRestore(db,custody,key,pointer,{resource,job,maxPages:5});}while(!result.imported);
  assert.equal((await verifyStreamedRestore(db,custody,key,pointer,{job})).verified,true);
  for(const table of ['cowrie_wallets','cowrie_ledger','commerce_orders','retention_holds','retention_closures','retention_suppression'])assert.deepEqual(target.prepare('SELECT * FROM '+table+' ORDER BY 1').all(),c.database.prepare('SELECT * FROM '+table+' ORDER BY 1').all());
  assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);assert.equal((await importStreamedRestore(db,custody,key,pointer,{resource,job})).imported,true);
 }finally{c.database.close();target.close();}
});
