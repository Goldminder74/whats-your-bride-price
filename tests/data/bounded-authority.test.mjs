import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {randomBytes} from 'node:crypto';
import {loadMigrationPlan,applyMigrationPlan} from '../../scripts/data-migrations.mjs';
import {D1Authority,createOperationId} from '../../scripts/authority-runtime.mjs';
import {createAuthorityService} from '../../worker/authorityService.mjs';
import {recoveryHash,decryptRecord,encryptRecord} from '../../scripts/recovery-crypto.mjs';
import {materializeSegmentedSnapshot} from '../../scripts/worker-snapshot-restore.mjs';
import {verifyAuthorityBoundaryStep,cleanupAuthoritySnapshotStep} from '../../worker/boundedAuthority.mjs';
async function fixture(events=0){
 const sql=new DatabaseSync(':memory:');applyMigrationPlan(sql,(await loadMigrationPlan()).slice(0,14));sql.exec('CREATE TABLE synthetic_records(id TEXT PRIMARY KEY)');
 const db={query:async(s,p=[])=>sql.prepare(s).all(...p),batch:async rows=>{sql.exec('BEGIN');try{const r=rows.map(v=>sql.prepare(v.sql).all(...(v.params||[])));sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const at=Date.now(),key=randomBytes(32),files=new Map(),clocks=new Map();let sequence=0,reads=0;
 const custody={folderId:'synthetic_authority_folder',index:{get:async name=>files.has(name)?'synthetic_file_'+[...files.keys()].indexOf(name):null,recoveryRecord:async name=>clocks.get(name),activeCount:async asOf=>[...files.keys()].filter(n=>clocks.get(n).expiresAt>asOf).length},
  get:async n=>{reads++;return files.get(n)||null;},put:async(n,b,retention)=>{if(files.has(n))assert.deepEqual(files.get(n),b);files.set(n,b);if(!clocks.has(n))clocks.set(n,retention||{createdAt:at,expiresAt:at+2592000000});return recoveryHash(b);},
  auditPage:async({cursor,pageSize})=>{const names=[...files.keys()].sort(),offset=cursor?Number(cursor):0;return {files:await Promise.all(names.slice(offset,offset+pageSize).map(async name=>({name,id:await custody.index.get(name),mimeType:'application/octet-stream',parents:[custody.folderId],appProperties:{wybpRecovery:'1'}}))),cursor:offset+pageSize<names.length?String(offset+pageSize):null};},
 };
 const authority=new D1Authority(db,custody,key,{now:()=>at});await authority.initialise();
 for(let i=0;i<events;i++)await authority.mutate(createOperationId(at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['synthetic_'+(++sequence)]}]);
 const options={db,custody,key,now:()=>at,alert:async()=>{},snapshot:async()=>{assert.fail('monolithic snapshot must not run');}};
 return {sql,db,key,files,clocks,custody,authority,at,options,reads:()=>reads};
}
test('bounded production boundary passes the old 10k event limit, retries safely and never opens early',async()=>{
 const f=await fixture(10001),restored=new DatabaseSync(':memory:');let progress=null,result,calls=0;
 try{
  do {const before=f.reads(),previous=progress;result=await createAuthorityService(f.options).deliverStep('synthetic_authority_stock',progress);assert.ok(f.reads()-before<=35,'every invocation has bounded custody reads');progress=result.progress;
   if(!result.complete){assert.equal(f.sql.prepare("SELECT state FROM operational_recovery_checkpoints WHERE id='journal'").get().state,'exporting');await assert.rejects(createAuthorityService(f.options).mutate(createOperationId(f.at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['must_not_write']}]),/writer_busy/);assert.equal(f.sql.prepare("SELECT state FROM operational_recovery_checkpoints WHERE id='authority-writer'").get().state,'idle');}
   if(calls===5){const replay=await createAuthorityService(f.options).deliverStep('synthetic_authority_stock',previous);assert.equal(replay.complete,result.complete);}
   assert.ok(++calls<4000,'bounded work includes separate independently verified commit files');
  }while(!result.complete);
  assert.ok(calls<=Math.ceil(f.files.size/10)+3*Math.ceil(10001/25)+40,'call count follows pages and bounded event batches');
  assert.equal(result.sequence,10001);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,10001);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM operational_authority_outbox WHERE delivery_receipt IS NULL').get().n,0);
  const body=decryptRecord(f.files.get('synthetic_authority_stock.boundary'),f.key,'synthetic_authority_stock.boundary');assert.equal(body.format,'wybp-authority-boundary-v2');assert.equal(body.sequence,10001);
  const materialized=await materializeSegmentedSnapshot(f.custody,f.key,body.snapshot,restored);assert.equal(materialized.runtimeAccess,'blocked_pending_fresh_receipt');assert.equal(restored.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,10001);
  assert.deepEqual(await createAuthorityService(f.options).deliverStep('synthetic_authority_stock',null),result);
  const checkpointSql=new DatabaseSync(':memory:');try{
   applyMigrationPlan(checkpointSql,(await loadMigrationPlan()).slice(0,14));const independent={query:async(s,p=[])=>{assert.ok(!s.includes('operational_authority_outbox'),'independent verification must not depend on source outbox');return checkpointSql.prepare(s).all(...p);},batch:async rows=>rows.map(r=>checkpointSql.prepare(r.sql).all(...r.params))};
   const pointer={name:'synthetic_authority_stock.boundary',sha256:result.receipt};let check,progress=null,count=0;
   do{const before=f.reads();check=await verifyAuthorityBoundaryStep(independent,f.custody,f.key,pointer,progress,{now:()=>f.at});progress=check.progress;assert.ok(f.reads()-before<=15);assert.equal(check.runtimeAccess,'blocked_pending_verified_import_and_latest_authority');assert.ok(++count<3000);}while(!check.verified);
   assert.equal(check.sequence,10001);assert.equal(checkpointSql.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
   const op=createOperationId(f.at),event={operationId:op,sequence:10002,previousHash:body.head,intentHash:'a'.repeat(64),statements:[],createdAt:f.at,expiresAt:f.at+2592000000};await f.custody.put(op+'.intent',encryptRecord(event,f.key,op+'.intent'));
   await assert.rejects(async()=>{let progress=null;for(let i=0;i<3000;i++){const r=await verifyAuthorityBoundaryStep(independent,f.custody,f.key,pointer,progress,{now:()=>f.at});progress=r.progress;if(r.verified)assert.fail('later authority must block older release');}});
   f.files.delete(op+'.intent');f.clocks.delete(op+'.intent');
  }finally{checkpointSql.close();}
  await createAuthorityService(f.options).mutate(createOperationId(f.at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['after_verified_boundary']}]);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,10002);
 }finally{restored.close();f.sql.close();}
});
test('unresolved intent and silently omitted indexed inventory fail closed, with no baseline advancement',async()=>{
 for(const cause of ['unknown','omitted','loop']){
  const f=await fixture(3);try{
   if(cause==='unknown'){const op=createOperationId(f.at),body={operationId:op,sequence:4,previousHash:(await f.authority.head()).head_hash,intentHash:'a'.repeat(64),statements:[],createdAt:f.at,expiresAt:f.at+2592000000};await f.custody.put(op+'.intent',encryptRecord(body,f.key,op+'.intent'));}
   const normal=f.custody.auditPage;let seen=0;f.custody.auditPage=async opts=>{const page=await normal(opts);if(cause==='omitted'&&page.files.length)page.files.pop();if(cause==='loop')page.cursor=++seen%2?'10':'0';return page;};
   let progress=null;await assert.rejects(async()=>{for(let i=0;i<100;i++){const r=await createAuthorityService(f.options).deliverStep('synthetic_bad_'+cause,progress);if(r.complete)assert.fail('unverified source released');progress=r.progress;}assert.fail('unbounded loop');});
   assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM operational_recovery_checkpoints WHERE id='baseline'").get().n,0);assert.equal((await f.authority.head()).state,'exporting');
  }finally{f.sql.close();}
 }
});
test('operational snapshot progress survives instance loss and lost checkpoint writes without caller-held state',async()=>{
 const f=await fixture(3);let fail=true;
 const db={...f.db,batch:async rows=>{if(fail&&rows.some(r=>r.params?.[0]==='bounded-scheduler:synthetic_durable_job')){fail=false;throw Error('synthetic_progress_crash');}return f.db.batch(rows);}};
 try{
  await assert.rejects(createAuthorityService({...f.options,db}).advanceSnapshot('synthetic_durable_job'),/synthetic_progress_crash/);
  await assert.rejects(createAuthorityService({...f.options,db}).ready(),/unavailable/);
  let result,calls=0;do{result=await createAuthorityService({...f.options,db}).advanceSnapshot('synthetic_durable_job');assert.ok(++calls<100);}while(!result.complete);
  assert.equal(result.sequence,3);assert.deepEqual(await createAuthorityService({...f.options,db}).advanceSnapshot('synthetic_durable_job'),result);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,3);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM operational_recovery_checkpoints WHERE id='baseline'").get().n,1);
  assert.equal(f.sql.prepare("SELECT state FROM operational_recovery_checkpoints WHERE id='bounded-scheduler:synthetic_durable_job'").get().state,'complete');
  assert.equal(await createAuthorityService({...f.options,db}).ready(),true);
 }finally{f.sql.close();}
});

test('completed snapshot scratch compacts in bounded retry-safe batches while authority, custody and other jobs remain intact',async()=>{
 const f=await fixture(12),id='synthetic_cleanup',prefixes=['bounded-op:'+id+':','bounded-page:'+id+':','bounded-seen:'+id+':'];
 const scratch=()=>f.sql.prepare('SELECT id FROM operational_recovery_checkpoints').all().filter(r=>prefixes.some(p=>r.id.startsWith(p))||r.id==='bounded-base:'+id);
 try{
  await assert.rejects(cleanupAuthoritySnapshotStep(f.db,f.custody,f.key,id,{now:()=>f.at}),/unavailable/);
  await createAuthorityService(f.options).advanceSnapshot(id);
  const incompleteCount=scratch().length;
  await assert.rejects(cleanupAuthoritySnapshotStep(f.db,f.custody,f.key,id,{now:()=>f.at}),/unavailable/);
  assert.equal(scratch().length,incompleteCount);
  let result,calls=0;do{result=await createAuthorityService(f.options).advanceSnapshot(id);assert.ok(++calls<100);}while(!result.complete);
  const retained=f.sql.prepare('SELECT * FROM operational_recovery_checkpoints').all().filter(r=>!scratch().some(s=>s.id===r.id));
  const originalClocks=f.sql.prepare('SELECT id,created_at,expires_at FROM operational_recovery_checkpoints WHERE id IN (?,?)').all('bounded-job:'+id,'bounded-receipt:'+id);
  const outbox=f.sql.prepare('SELECT * FROM operational_authority_outbox ORDER BY sequence').all(),files=new Map(f.files),clocks=new Map(f.clocks);
  assert.ok(scratch().length>25,'fixture requires multiple bounded deletion batches');
  f.sql.prepare("INSERT INTO operational_recovery_checkpoints SELECT 'bounded-op:synthetic_cleanup_other:protected',kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at FROM operational_recovery_checkpoints WHERE id=?").run('bounded-base:'+id);
  const archive=f.files.get(id+'.boundary');f.files.set(id+'.boundary',Buffer.from('corrupt synthetic archive'));
  await assert.rejects(cleanupAuthoritySnapshotStep(f.db,f.custody,f.key,id,{now:()=>f.at}),/unavailable/);f.files.set(id+'.boundary',archive);
  let lost=true;const db={...f.db,batch:async rows=>{const value=await f.db.batch(rows);if(lost&&rows.some(r=>r.sql.startsWith('DELETE FROM operational_recovery_checkpoints'))){lost=false;throw Error('synthetic_cleanup_response_lost');}return value;}};
  const before=scratch().length;await assert.rejects(createAuthorityService({...f.options,db}).cleanupSnapshotStep(id),/synthetic_cleanup_response_lost/);
  assert.equal(before-scratch().length,25);await assert.rejects(createAuthorityService({...f.options,db}).ready(),/unavailable/);
  let cleaned;do{cleaned=await createAuthorityService({...f.options,db}).cleanupSnapshotStep(id);assert.ok(cleaned.deleted<=25);assert.ok(++calls<120);}while(!cleaned.complete);
  assert.equal(cleaned.receipt,result.receipt);assert.equal(scratch().length,0);
  for(const row of retained)if(row.id!=='authority-writer')assert.deepEqual(f.sql.prepare('SELECT * FROM operational_recovery_checkpoints WHERE id=?').get(row.id),row);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM operational_recovery_checkpoints WHERE id='bounded-op:synthetic_cleanup_other:protected'").get().n,1);
  assert.deepEqual(f.sql.prepare('SELECT id,created_at,expires_at FROM operational_recovery_checkpoints WHERE id IN (?,?)').all('bounded-job:'+id,'bounded-receipt:'+id),originalClocks);
  assert.deepEqual(f.sql.prepare('SELECT * FROM operational_authority_outbox ORDER BY sequence').all(),outbox);assert.deepEqual(f.files,files);assert.deepEqual(f.clocks,clocks);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,12);assert.equal(await createAuthorityService(f.options).ready(),true);
  assert.deepEqual(await createAuthorityService(f.options).advanceSnapshot(id),result);
  assert.deepEqual(await createAuthorityService(f.options).cleanupSnapshotStep(id),cleaned);
 }finally{f.sql.close();}
});
