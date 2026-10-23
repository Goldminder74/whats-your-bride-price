import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { loadMigrationPlan, applyMigrationPlan } from '../../scripts/data-migrations.mjs';
import { createOperationId, D1Authority, readBoundary } from '../../scripts/authority-runtime.mjs';
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

test('mutation acknowledgement waits for independent commit proof across every crash and readback boundary',async()=>{
 for(const stage of ['intent_durable','d1_committed','commit_uploaded','commit_verified','missing_copy']){
  const f=await fixture();try{
   const {D1WriterFence}=await import('../../worker/d1WriterFence.mjs');const fence=new D1WriterFence(f.options.db,{now:()=>f.at});
   const op=createOperationId(f.at),statements=[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['committed_once']}];let crash=true,uploaded=false;
   const originalGet=f.options.custody.get,originalPut=f.options.custody.put;
   f.options.custody.put=async(...args)=>{const result=await originalPut(...args);if(args[0].endsWith('.event'))uploaded=true;return result;};
   f.options.custody.get=async name=>crash&&stage==='missing_copy'&&uploaded&&name.endsWith('.event')?null:originalGet(name);
   const run=()=>fence.run(op,JSON.stringify(statements),db=>new D1Authority(db,f.options.custody,f.options.key,{now:()=>f.at,fault:s=>{if(crash&&s===stage)throw Error('synthetic_crash');}}).mutate(op,statements),{journalIdle:true});
   await assert.rejects(run(),/synthetic_crash|authority_commit_readback/);await assert.rejects(fence.ready(),/unavailable/);
   assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,stage==='intent_durable'?0:1);
   crash=false;const receipt=await run();await fence.ready();assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);
   assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n,1);
   assert.equal(recoveryHash(f.files.get(op+'.event')),receipt);assert.deepEqual(f.files.get(op+'.event'),f.files.get(op+'.intent'));
   assert.equal(await run(),receipt);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);
  }finally{f.sql.close();}
 }
});
test('authenticated metadata commits reuse immutable intents and preserve fail-closed retry and legacy boundary verification',async()=>{
 for(const stage of ['commit_uploaded','commit_verified','bad_marker','missing_marker']){
  const f=await fixture(),markers=new Map();let crash=true;try{
   f.options.custody.markCommitted=async(name,proof)=>{if(markers.has(name))assert.equal(markers.get(name),proof);markers.set(name,proof);};
   f.options.custody.readCommit=async name=>crash&&stage==='bad_marker'?'f'.repeat(64):crash&&stage==='missing_marker'?null:markers.get(name)||null;
   const op=createOperationId(f.at),statements=[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['metadata_committed']}];
   const authority=new D1Authority(f.options.db,f.options.custody,f.options.key,{now:()=>f.at,fault:s=>{if(crash&&stage===s)throw Error('synthetic_crash');}});
   await assert.rejects(authority.mutate(op,statements),/synthetic_crash|authority_commit_readback/);crash=false;
   const hash=await authority.mutate(op,statements);assert.equal(hash,recoveryHash(f.files.get(op+'.intent')));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);
   assert.equal([...f.files.keys()].filter(n=>n.endsWith('.event')).length,0);assert.match(markers.get(op+'.intent'),/^[a-f0-9]{64}$/);
   const service=createAuthorityService(f.options),receipt=await service.deliver('metadata_boundary');f.files.delete(op+'.event');
   assert.equal((await readBoundary(f.options.custody,f.options.key,'metadata_boundary',receipt,f.at)).sequence,1);
   markers.set(op+'.intent','e'.repeat(64));await assert.rejects(readBoundary(f.options.custody,f.options.key,'metadata_boundary',receipt,f.at),/undelivered_authority/);
  }finally{f.sql.close();}
 }
});
test('independent high-water publication must settle before a financial mutation is acknowledged or its writer released',async()=>{
 const f=await fixture(),markers=new Map();let lost=true,highWater=null;
 try{
  Object.assign(f.options.custody,{supportsCommitHead:true,markCommitted:async(n,p)=>markers.set(n,p),readCommit:async n=>markers.get(n),publishCommitHead:async(e,head)=>{highWater={sequence:e.sequence,head};if(lost){lost=false;throw Error('synthetic_head_response_lost');}return highWater;}});
  const service=createAuthorityService(f.options),op=createOperationId(f.at),statements=[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['independently_protected']}];
  await assert.rejects(service.mutate(op,statements),/synthetic_head_response_lost/);await assert.rejects(service.ready());assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);
  const receipt=await service.mutate(op,statements);await service.ready();assert.deepEqual(highWater,{sequence:1,head:receipt});assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);assert.equal(await service.mutate(op,statements),receipt);
 }finally{f.sql.close();}
});

test('bounded chunks resume after each crash boundary without repeating financial mutations',async()=>{
 for(const stage of ['chunk_uploaded','chunk_verified','chunk_checkpointed']){
  const f=await fixture();try{
   const service=createAuthorityService(f.options);
   for(let i=0;i<3;i++)await service.mutate(createOperationId(f.at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['record_'+i]}]);
   const {D1WriterFence}=await import('../../worker/d1WriterFence.mjs');
   const writer=new D1WriterFence(f.options.db,{now:()=>f.at});let fail=true;
   const flush=()=>writer.run('chunk_retry','stable',db=>new D1Authority(db,f.options.custody,f.options.key,{now:()=>f.at,fault:s=>{if(fail&&s===stage)throw Error('synthetic_crash');}}).flush(2));
   await assert.rejects(flush(),/synthetic_crash/);await assert.rejects(writer.ready(),/unavailable/);
   fail=false;await flush();await writer.ready();
   let passes=0;while((await service.flush('continue',2)).pending){assert.ok(++passes<3,'bounded drain must make progress');}
   assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,3);
   assert.equal(f.sql.prepare("SELECT sequence FROM operational_recovery_checkpoints WHERE id='journal-delivery'").get().sequence,3);
   assert.equal([...f.files.keys()].filter(n=>n.startsWith('journal-chunk_')).length,2);
   const receipt=await service.deliver('chunk_snapshot');
   assert.equal((await readBoundary(f.options.custody,f.options.key,'chunk_snapshot',receipt,f.at)).sequence,3);
   const commits=[...f.files.keys()].filter(n=>n.endsWith('.event'));assert.equal(commits.length,3);
   for(const name of commits)assert.deepEqual(f.files.get(name),f.files.get(name.replace('.event','.intent')));
   const chunk=[...f.files.keys()].find(n=>n.startsWith('journal-chunk_')),saved=f.files.get(chunk);f.files.delete(chunk);
   await assert.rejects(readBoundary(f.options.custody,f.options.key,'chunk_snapshot',receipt,f.at),/chunk_readback/);
   f.files.set(chunk,saved);
   await service.mutate(createOperationId(f.at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['later_authority']}]);
   await assert.rejects(readBoundary(f.options.custody,f.options.key,'chunk_snapshot',receipt,f.at),/later_or_missing_intent/);
  }finally{f.sql.close();}
 }
});

test('chunk bounds, missing sequence and concurrent writers fail closed',async()=>{
 const f=await fixture();try{
  const service=createAuthorityService(f.options);
  await assert.rejects(service.flush('bad',26),/bounds/);
  const original=f.options.custody.put;let unblock,entered;
  const started=new Promise(resolve=>entered=resolve);
  f.options.custody.put=async(n,b,...rest)=>{if(n.endsWith('.intent')){entered();await new Promise(resolve=>unblock=resolve);}return original(n,b,...rest);};
  const mutation=service.mutate(createOperationId(f.at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['only']}]);await started;
  await assert.rejects(createAuthorityService(f.options).flush('parallel'),/writer_busy/);unblock();await mutation;
  f.sql.exec('DELETE FROM operational_authority_outbox');
  await assert.rejects(service.flush('gap'),/outbox_page_gap/);await assert.rejects(service.ready(),/unavailable/);
 }finally{f.sql.close();}
});

test('delayed chunk snapshots preserve original expiry and the existing checkpoint window',async()=>{
 const f=await fixture();try{
  const first=createAuthorityService(f.options);await first.mutate(createOperationId(f.at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['protected']}]);
  await first.flush('initial_chunk');
  const delayed=createAuthorityService({...f.options,now:()=>f.at+86400000});
  const receipt=await delayed.deliver('delayed_snapshot');
  const body=await readBoundary(f.options.custody,f.options.key,'delayed_snapshot',receipt,f.at+86400000);
  assert.equal(body.createdAt,f.at+86400000);assert.equal(body.expiresAt,f.at+30*86400000);
  const checkpoint=f.sql.prepare("SELECT * FROM operational_recovery_checkpoints WHERE id='baseline'").get();
  assert.equal(checkpoint.created_at,f.at);assert.equal(checkpoint.expires_at-checkpoint.created_at,30*86400000);
  await assert.rejects(readBoundary(f.options.custody,f.options.key,'delayed_snapshot',receipt,f.at+30*86400000),/boundary_expired/);
 }finally{f.sql.close();}
});
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
 await assert.rejects(service.ready(),/authority_writer_unavailable/);assert.deepEqual(f.alerts,[{component:'authority',status:'blocked',at:f.at}]);
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

test('independent service instances share the database writer fence during an interrupted intent upload',async()=>{
 const f=await fixture();try{let release,entered;const started=new Promise(r=>entered=r),put=f.options.custody.put;
 f.options.custody.put=async(n,b)=>{if(n.endsWith('.intent')){entered();await new Promise(r=>release=r);}return put(n,b);};
 const a=createAuthorityService(f.options),b=createAuthorityService(f.options),first=createOperationId(f.at),second=createOperationId(f.at);
 const pending=a.mutate(first,[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['one']}]);await started;
 await assert.rejects(b.mutate(second,[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['two']}]));
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,0);await assert.rejects(b.ready(),/authority_writer_unavailable/);
 release();await pending;f.options.custody.put=put;
 await b.mutate(second,[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['two']}]);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,2);
 }finally{f.sql.close();}
});
test('lost commit acknowledgement preserves a global fence; stable retry resolves without another accounting write',async()=>{
 const f=await fixture();try{const batch=f.options.db.batch;let lose=true;
 f.options.db.batch=async rows=>{const result=await batch(rows);if(lose&&rows.some(r=>r.sql.startsWith('INSERT INTO operational_authority_outbox'))){lose=false;throw Error('lost_ack');}return result;};
 const op=createOperationId(f.at),statements=[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['one']}];
 await assert.rejects(createAuthorityService(f.options).mutate(op,statements),/lost_ack/);
 const replacement=createAuthorityService(f.options);await assert.rejects(replacement.ready(),/authority_writer_unavailable/);
 await assert.rejects(replacement.mutate(createOperationId(f.at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['two']}]));
 await replacement.mutate(op,statements);assert.equal(await replacement.ready(),true);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n,1);
 }finally{f.sql.close();}
});

test('production factory rejects absent secrets and wrong role before touching a database or network',async()=>{
 const {configuredAuthorityService}=await import('../../worker/authorityService.mjs');let accessed=false;
 const env={WYBP_AUTHORITY_ROLE:'test',get DB(){accessed=true;throw Error('must_not_access');}};
 assert.throws(()=>configuredAuthorityService(env,{snapshot:async()=>{},alert:async()=>{}}),/authority_runtime_configuration/);assert.equal(accessed,false);
 assert.throws(()=>configuredAuthorityService({WYBP_AUTHORITY_ROLE:'production-ops',WYBP_AUTHORITY_DATABASE_NAME:'wybp-prod-d1-r001'},{snapshot:async()=>{},alert:async()=>{}}),/authority_runtime_configuration/);
});

test('a replacement generation fences a still-running previous instance even for the same retry identity',async()=>{
 const {D1WriterFence}=await import('../../worker/d1WriterFence.mjs'),f=await fixture();try{
 let release,entered;const started=new Promise(r=>entered=r),a=new D1WriterFence(f.options.db),b=new D1WriterFence(f.options.db);
 const old=a.run('same-retry','same-payload',async db=>{entered();await new Promise(r=>release=r);await db.batch([{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['stale']}]);});await started;
 await b.run('same-retry','same-payload',db=>db.batch([{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['replacement']}]));release();await assert.rejects(old);
 assert.deepEqual(f.sql.prepare('SELECT id FROM synthetic_records').all().map(r=>r.id),['replacement']);
 }finally{f.sql.close();}
});

test('independent arrivals wait for a live writer without exposing data early or duplicating mutation',async()=>{
 for(const method of ['mutate','ready','readFence']){const f=await fixture();try{
  let entered,release,held=false,waits=0;const started=new Promise(r=>entered=r),put=f.options.custody.put;
  f.options.custody.put=async(...args)=>{if(args[0].endsWith('.intent')&&!held){held=true;entered();await new Promise(r=>release=r);}return put(...args);};
  const first=createAuthorityService(f.options).mutate(createOperationId(f.at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['first']}]);await started;
  const second=createAuthorityService({...f.options,pause:async ms=>{assert.equal(ms,250);waits++;assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,0);release();await first;}});
  if(method==='mutate')await second.mutate(createOperationId(f.at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['second']}]);else await second[method]();
  assert.equal(waits,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,method==='mutate'?2:1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n,method==='mutate'?2:1);
 }finally{f.sql.close();}}
});

test('bounded contention never unlocks a crashed writer or executes a competing operation',async()=>{
 const f=await fixture();try{
  const {D1WriterFence}=await import('../../worker/d1WriterFence.mjs'),op=createOperationId(f.at),plan=[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['not_committed']}];
  await assert.rejects(new D1WriterFence(f.options.db,{now:()=>f.at}).run(op,JSON.stringify(plan),db=>new D1Authority(db,f.options.custody,f.options.key,{now:()=>f.at,fault:s=>{if(s==='intent_durable')throw Error('synthetic_crash');}}).mutate(op,plan),{journalIdle:true}));
  const before=f.sql.prepare("SELECT * FROM operational_recovery_checkpoints WHERE id='authority-writer'").get();let waits=0;const service=createAuthorityService({...f.options,pause:async()=>{waits++;}});
  await assert.rejects(service.mutate(createOperationId(f.at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['competitor']}]),/writer_busy/);assert.equal(waits,19);assert.deepEqual(f.sql.prepare("SELECT * FROM operational_recovery_checkpoints WHERE id='authority-writer'").get(),before);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,0);waits=0;await assert.rejects(service.ready(),/writer_unavailable/);assert.equal(waits,19);
 }finally{f.sql.close();}
});

test('lost post-commit response is never retried merely because provider text says writer_busy',async()=>{
 const f=await fixture();try{const original=f.options.db.batch;let lost=true,waits=0;f.options.db.batch=async rows=>{const result=await original(rows);if(lost&&rows.some(r=>r.sql.startsWith('INSERT INTO operational_authority_outbox'))){lost=false;throw Error('authority_writer_busy');}return result;};const service=createAuthorityService({...f.options,pause:async()=>{waits++;}}),op=createOperationId(f.at),plan=[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['committed_once']}];await assert.rejects(service.mutate(op,plan),/writer_busy/);assert.equal(waits,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);await service.mutate(op,plan);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n,1);
 }finally{f.sql.close();}
});

test('an exporting journal is an immediate recovery block, never a live-contention wait',async()=>{
 const f=await fixture();try{let waits=0;
  await f.options.db.batch([{sql:"UPDATE operational_recovery_checkpoints SET state='exporting' WHERE id='journal'",params:[]}]);
  const service=createAuthorityService({...f.options,pause:async()=>{waits++;}});
  await assert.rejects(service.mutate(createOperationId(f.at),[{sql:'INSERT INTO synthetic_records VALUES(?1)',params:['blocked']}]),/writer_busy/);
  assert.equal(waits,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,0);
 }finally{f.sql.close();}
});
