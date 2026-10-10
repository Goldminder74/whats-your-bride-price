import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMigrationPlan, applyMigrationPlan } from '../../scripts/data-migrations.mjs';
import { PrivateCustody, D1Authority, readBoundary, restorePages, finishRestore, recoveryAccess } from '../../scripts/d1-operational-recovery.mjs';
const at=Date.now();
const op=name=>'op_'+at+'_'+Buffer.from(name).toString('hex').padEnd(32,'0');
async function fixture(){
 const path=await mkdtemp(join(tmpdir(),'wybp-d1-recovery-')),sqlite=new DatabaseSync(':memory:');
 applyMigrationPlan(sqlite,await loadMigrationPlan());sqlite.exec('CREATE TABLE synthetic_records(id TEXT PRIMARY KEY,value INTEGER NOT NULL)');
 const db={async query(sql,params=[]){return sqlite.prepare(sql).all(...params);},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>sqlite.prepare(s.sql).all(...s.params));sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const custody=await PrivateCustody.create(join(path,'custody')),key=randomBytes(32),authority=new D1Authority(db,custody,key,{now:()=>at});await authority.initialise();
 return {path,sqlite,db,custody,key,authority,async close(){sqlite.close();await rm(path,{recursive:true,force:true});}};
}
const insert=id=>[{sql:'INSERT INTO synthetic_records VALUES(?1,?2)',params:[id,1]}];
async function snapshot(c){const data=Buffer.from('synthetic-encrypted-snapshot-placeholder');return {files:[{name:'snapshot.enc',sha256:await c.custody.put('snapshot.enc',data)}]};}
test('outbox and business mutation commit together; identical retries cannot double-apply',async()=>{
 const c=await fixture();try{
  const hash=await c.authority.mutate(op('one'),insert('one'));assert.equal(await c.authority.mutate(op('one'),insert('one')),hash);
  assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);
  await assert.rejects(c.authority.mutate(op('one'),insert('different')),/operation_conflict/);
  await assert.rejects(c.authority.mutate(op('bad'),[...insert('bad'),...insert('one')]));
  assert.equal(c.sqlite.prepare("SELECT COUNT(*) n FROM synthetic_records WHERE id='bad'").get().n,0);
  assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n,1);
  await assert.rejects(c.authority.deliver('blocked',()=>snapshot(c)),/unresolved_intent/);
 }finally{await c.close();}
});
test('commit-response loss and independent-delivery crashes resume without replay; later intent blocks old recovery',async()=>{
 const c=await fixture();try{
  let fail=true;c.authority.fault=stage=>{if(fail&&stage==='d1_committed')throw Error('crash');};
  await assert.rejects(c.authority.mutate(op('one'),insert('one')),/crash/);fail=false;await c.authority.mutate(op('one'),insert('one'));
  c.authority.fault=stage=>{if(stage==='independent_readback')throw Error('crash');};await assert.rejects(c.authority.deliver('boundary',()=>snapshot(c)),/crash/);
  await assert.rejects(c.authority.mutate(op('fenced'),insert('fenced')),/journal_unavailable/);
  c.authority.fault=()=>{};const result=await c.authority.deliver('boundary',()=>{throw Error('must reuse snapshot');});
  assert.equal((await c.authority.deliver('boundary',()=>{throw Error('must reuse boundary');})).receipt,result.receipt);
  assert.equal((await readBoundary(c.custody,c.key,'boundary',result.receipt,at)).sequence,1);
  c.authority.fault=stage=>{if(stage==='intent_durable')throw Error('crash');};await assert.rejects(c.authority.mutate(op('later'),insert('later')),/crash/);
  await assert.rejects(readBoundary(c.custody,c.key,'boundary',result.receipt,at),/later_or_missing/);
 }finally{await c.close();}
});
test('immutable custody rejects competing ciphertext and missing archive files',async()=>{
 const c=await fixture();try{
  const results=await Promise.allSettled([c.custody.put('same',Buffer.from('a')),c.custody.put('same',Buffer.from('b'))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const result=await c.authority.deliver('boundary',()=>snapshot(c));await rm(c.custody.file('snapshot.enc'));
  await assert.rejects(readBoundary(c.custody,c.key,'boundary',result.receipt,at),/snapshot_file_gap/);
 }finally{await c.close();}
});
test('interrupted imports checkpoint in the same transaction; failures do not advance; access requires reviewed receipt',async()=>{
 const c=await fixture();try{
  const pages=[insert('one'),insert('two')],hash='a'.repeat(64);
  await assert.rejects(restorePages(c.db,'restore',hash,pages,at,()=>{throw Error('crash');}),/crash/);
  assert.equal(c.sqlite.prepare("SELECT cursor FROM operational_recovery_checkpoints WHERE id='restore'").get().cursor,1);
  await assert.rejects(recoveryAccess(c.db,'restore',hash,at),/blocked/);
  await restorePages(c.db,'restore',hash,pages,at);assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,2);
  await assert.rejects(finishRestore(c.db,'restore',hash,async()=>false),/reconciliation/);
  await finishRestore(c.db,'restore',hash,async()=>true);await assert.rejects(recoveryAccess(c.db,'restore',hash,at),/suppression/);
  await assert.rejects(restorePages(c.db,'restore','b'.repeat(64),pages,at),/conflict/);
 }finally{await c.close();}
});
import { RehearsalD1, rehearsalTarget } from '../../scripts/d1-rehearsal-provider.mjs';
import { providerRestorePlan, verifyProviderRestore, cleanupRecovery } from '../../scripts/d1-operational-recovery.mjs';
import { setup, request, checkout, verified, adverse } from '../helpers/cowrieCommerce.mjs';
import { operatorRetentionPlan } from '../../db/retention.ts';
test('provider transport pins rehearsal identity, sanitises errors and resumes native snapshot bookmark',async()=>{
 const c=await fixture();try{
  const databaseId='11111111-2222-4333-8444-555555555555',calls=[];let polls=0;
  const fetch=async(url,options={})=>{
   calls.push({url:String(url),body:options.body,authorization:options.headers?.Authorization});
   if(String(url).endsWith('/export'))return Response.json({success:true,result:{at_bookmark:'fixed-bookmark',...(polls++?{status:'complete',result:{signed_url:'https://synthetic.r2.cloudflarestorage.com/dump.sql'}}:{})}});
   if(String(url).includes('cloudflarestorage.com'))return new Response('CREATE TABLE synthetic(id TEXT PRIMARY KEY);');
   return Response.json({success:true,result:{uuid:databaseId,name:rehearsalTarget.name}});
  };
  await assert.rejects(RehearsalD1.connect({...rehearsalTarget,databaseId:rehearsalTarget.protectedDatabaseId,token:'synthetic',fetch}),/target/);
  const provider=await RehearsalD1.connect({...rehearsalTarget,databaseId,token:'synthetic',fetch});
  await assert.rejects(provider.exportSnapshot(c.custody,c.key,'native',{maxPolls:1,pause:async()=>{}}),/pending_resume/);
  const result=await provider.exportSnapshot(c.custody,c.key,'native',{pause:async()=>{}});
  assert.equal(result.bookmark,'fixed-bookmark');assert.equal(JSON.parse(calls.filter(x=>x.url.endsWith('/export'))[1].body).current_bookmark,'fixed-bookmark');
  assert.equal(calls.find(x=>x.url.includes('cloudflarestorage.com')).authorization,undefined);
  const bad=await RehearsalD1.connect({...rehearsalTarget,databaseId,token:'synthetic',fetch:async(url)=>String(url).endsWith(databaseId)?Response.json({success:true,result:{uuid:databaseId,name:rehearsalTarget.name}}):new Response('sensitive SQL record',{status:500})});
  await assert.rejects(bad.query('SELECT sensitive'),e=>e.message==='d1_http_500');
 }finally{await c.close();}
});
test('offline paginated import preserves closed wallets, financial dependencies and holds; interrupted trigger installation stays unavailable',async()=>{
 const source=await setup(),c=await fixture();try{
  const order=await source.service.startOrder(request(source));assert.ok(order.publicOrderReference);
  await source.service.webhook(await verified('checkout.session.completed',checkout(order)));
  await source.walletService.clear({anonymousSessionCredential:'a'.repeat(32)});
  await source.service.webhook(await verified('charge.refunded',adverse()));
  const wallet=source.database.prepare('SELECT id FROM cowrie_wallets LIMIT 1').get().id;
  const payment=source.database.prepare('SELECT id FROM commerce_orders LIMIT 1').get().id,event=source.database.prepare("SELECT id FROM stripe_webhook_events WHERE event_type='charge.refunded'").get().id;
  for(const action of [{operation:'settlement',orderId:payment,eventId:event,reason:'verified_refund'},{operation:'close-wallet',walletId:wallet,evidenceHash:'a'.repeat(64)}]){
    await source.adapter.batch(operatorRetentionPlan(action,at).map(s=>source.adapter.prepare(s.sql).bind(...s.params)));
  }
  const plans=operatorRetentionPlan({operation:'hold',id:'synthetic_hold',scope:'wallet',subjectId:wallet,reason:'legal',evidenceHash:'a'.repeat(64)},at);
  await source.adapter.batch(plans.map(s=>source.adapter.prepare(s.sql).bind(...s.params)));
  const plan=providerRestorePlan(source.database,{unboundRehearsal:true,pageSize:10});
  let stopped=false;await assert.rejects(restorePages(c.db,'import',plan.sha256,plan.pages,at,(_,index)=>{if(index===3){stopped=true;throw Error('crash');}}),/crash/);assert.equal(stopped,true);
  await assert.rejects(recoveryAccess(c.db,'import','a'.repeat(64),at),/blocked/);
  await restorePages(c.db,'import',plan.sha256,plan.pages,at);
  await finishRestore(c.db,'import',plan.sha256,()=>verifyProviderRestore(source.database,c.db,plan));
  assert.equal(c.sqlite.prepare('SELECT purchased_balance FROM cowrie_wallets LIMIT 1').get().purchased_balance,0);
  assert.equal(c.sqlite.prepare('SELECT closed_at FROM retention_closures LIMIT 1').get().closed_at,at);
  assert.throws(()=>c.sqlite.exec("UPDATE cowrie_wallets SET state='active'"),/deleted wallet cannot reopen/);
  assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM retention_holds WHERE released_at IS NULL').get().n,1);
  assert.throws(()=>c.sqlite.exec('UPDATE cowrie_wallets SET purchased_balance=99'),/cowrie balance cache mismatch/);
  await assert.rejects(recoveryAccess(c.db,'import','a'.repeat(64),at),/suppression/);
 }finally{source.database.close();await c.close();}
});
test('bounded retirement requires a fresh full boundary, expires records at the approved window and rejects retired-operation replay',async()=>{
 const c=await fixture();try{
  await c.authority.mutate(op('one'),insert('one'));await c.authority.deliver('first',()=>snapshot(c));
  let clock=at+29*86400000;c.authority.now=()=>clock;
  const next=await c.authority.deliver('next',()=>snapshot(c));
  clock=at+30*86400000;
  const result=await cleanupRecovery(c.authority,'next',next.receipt,{now:clock,limit:2});assert.equal(result.outbox,1);assert.equal(result.files,2);
  assert.equal((await cleanupRecovery(c.authority,'next',next.receipt,{now:clock,limit:2})).outbox,0);
  await assert.rejects(c.authority.mutate(op('one'),insert('one')),/authority_operation/);
  await assert.rejects(readBoundary(c.custody,c.key,'first',next.receipt,clock));
  assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);
 }finally{await c.close();}
});
import { captureProviderBoundary, materializeBoundary, prepareProviderRestore, createOperationId } from '../../scripts/d1-operational-recovery.mjs';
test('failed precommit is explicitly aborted under a source fence; committed changes cannot be cancelled',async()=>{
 const c=await fixture();try{
  await c.authority.mutate(op('one'),insert('one'));await assert.rejects(c.authority.mutate(op('bad'),insert('one')));
  await c.authority.abortUncommitted(op('bad'),'abort');await assert.rejects(c.authority.mutate(op('bad'),insert('one')),/aborted/);
  const result=await c.authority.deliver('safe',()=>snapshot(c));await readBoundary(c.custody,c.key,'safe',result.receipt,at);
  await assert.rejects(c.authority.abortUncommitted(op('one'),'badabort'),/cannot_abort/);
 }finally{await c.close();}
});
test('concurrent requests never apply twice and conflicting sequence claims roll back business changes',async()=>{
 const c=await fixture();try{
  const duplicate=await Promise.allSettled([c.authority.mutate(op('same'),insert('same')),c.authority.mutate(op('same'),insert('same'))]);
  assert.ok(duplicate.some(x=>x.status==='fulfilled'));await c.authority.mutate(op('same'),insert('same'));
  assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);
  const race=await Promise.allSettled([c.authority.mutate(op('left'),insert('left')),c.authority.mutate(op('right'),insert('right'))]);
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,2);
  assert.match(createOperationId(at),/^op_\d{13}_[a-f0-9]{32}$/);
 }finally{await c.close();}
});
test('native snapshot becomes a complete encrypted independent archive and can restore after local/source loss',async()=>{
 const c=await fixture();try{
  let snapshotDatabase;
  const provider={async query(sql,params=[]){return snapshotDatabase.prepare(sql).all(...params);},async exportSnapshot(custody,key,id){const sql='CREATE TABLE synthetic_snapshot(id TEXT PRIMARY KEY,value TEXT); INSERT INTO synthetic_snapshot VALUES(\'one\',\'private synthetic value\');';
    snapshotDatabase=new DatabaseSync(':memory:');snapshotDatabase.exec(sql);
    const {encryptRecord}=await import('../../scripts/operational-backup.mjs');const name=id+'.sql.enc',bytes=encryptRecord({sql,bookmark:'synthetic-bookmark'},key,name);return {sql,bookmark:'synthetic-bookmark',sha256:await custody.put(name,bytes)};}};
  const original=join(c.path,'original'),result=await captureProviderBoundary(c.authority,provider,'full',original);
  snapshotDatabase.close();await rm(original,{recursive:true,force:true});
  const readback=await materializeBoundary(c.custody,c.key,'full',result.receipt,join(c.path,'independent'));
  const {AuthorityJournal}=await import('../../scripts/operational-backup.mjs');const history=await AuthorityJournal.openHistory(join(readback.directory,'local-journal.sqlite'),c.key);
  const review={manifestHash:readback.archive.sha256,schemaHash:readback.archive.schemaHash,journalHead:history.verify().head,financialReconciliation:true,holdsReconciled:true,caseAuthorityReconciled:true,reviewedThrough:Date.now()};history.close();
  await prepareProviderRestore(readback.directory,c.key,review,join(c.path,'restored.sqlite'));
  const restored=new DatabaseSync(join(c.path,'restored.sqlite'));try{assert.equal(restored.prepare('SELECT value FROM synthetic_snapshot').get().value,'private synthetic value');}finally{restored.close();}
 }finally{await c.close();}
});
import { expireRecoveryArtifacts } from '../../scripts/d1-operational-recovery.mjs';
test('failed custody never extends the 30-day window; bounded expiry blocks access and preserves business records',async()=>{
 const c=await fixture();try{
  await c.authority.mutate(op('one'),insert('one'));const first=await c.authority.deliver('first',()=>snapshot(c));
  c.authority.fault=stage=>{if(stage==='intent_durable')throw Error('crash');};await assert.rejects(c.authority.mutate(op('pending'),insert('pending')),/crash/);
  const now=at+30*86400000;await assert.rejects(readBoundary(c.custody,c.key,'first',first.receipt,now),/expired/);
  let total=0;for(let i=0;i<10;i++){const result=await expireRecoveryArtifacts(c.authority,{now,limit:2});assert.ok(result.outbox<=2&&result.checkpoints<=2&&result.files<=2);total+=result.outbox+result.checkpoints+result.files;}
  assert.ok(total>0);assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n,0);
  assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM operational_recovery_checkpoints').get().n,0);
  assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM synthetic_records').get().n,1);
  assert.equal((await expireRecoveryArtifacts(c.authority,{now,limit:2})).outbox,0);
  await assert.rejects(recoveryAccess(c.db,'restore','a'.repeat(64),now),/blocked/);
 }finally{await c.close();}
});
test('approved bounded retention uses the same atomic outbox; unsupported pragmas remain rejected',async()=>{
 const c=await fixture();try{
  await c.authority.retention(op('purge'),at,50);assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM operational_authority_outbox').get().n,1);
  await assert.rejects(c.authority.mutate(op('unsafe'),[{sql:'PRAGMA foreign_keys=OFF',params:[]}]),/sql_scope/);
 }finally{await c.close();}
});
import { RemoteCustody } from '../../scripts/d1-operational-recovery.mjs';
test('independent paginated storage resolves lost upload responses and identical duplicate delivery; conflicting copies reject',async()=>{
 const files=new Map();let calls=0;
 const transport={async list(cursor){const rows=[...files.values()].map(row=>({id:row.id,name:row.name,sha256:row.sha256,privateOwner:row.privateOwner})),offset=Number(cursor||0);return {files:rows.slice(offset,offset+1),nextCursor:offset+1<rows.length?String(offset+1):null};},async download(id){return files.get(id).bytes;},async upload(name,bytes,sha256){const id=String(++calls);files.set(id,{id,name,bytes,sha256,privateOwner:true});if(calls===1)throw Error('lost response');},async remove(id){files.delete(id);}};
 const custody=new RemoteCustody(transport),bytes=Buffer.from('synthetic ciphertext');assert.match(await custody.put('one.enc',bytes),/^[a-f0-9]{64}$/);await custody.put('one.enc',bytes);assert.equal(files.size,1);
 await transport.upload('one.enc',bytes);assert.deepEqual(await custody.get('one.enc'),bytes);await custody.put('two.enc',bytes);assert.deepEqual(await custody.list(),['one.enc','two.enc']);
 await transport.upload('one.enc',Buffer.from('conflict'));await assert.rejects(custody.get('one.enc'),/duplicate_conflict/);
 files.delete(String(calls));await custody.remove('one.enc');assert.deepEqual(await custody.list(),['two.enc']);
 files.values().next().value.privateOwner=false;await assert.rejects(custody.list(),/inventory_conflict/);
});
test('authority delivery exceeds a provider batch/page, resumes partial acknowledgements and covers every operation',async()=>{
 const c=await fixture();try{
  for(let i=0;i<105;i++)await c.authority.mutate(createOperationId(at),insert(String(i)));
  let failed=false;c.authority.fault=stage=>{if(stage==='outbox_acknowledged'&&!failed){failed=true;throw Error('crash');}};
  await assert.rejects(c.authority.deliver('paged',()=>snapshot(c)),/crash/);assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM operational_authority_outbox WHERE delivery_receipt IS NOT NULL').get().n,50);
  c.authority.fault=()=>{};const final=await c.authority.deliver('paged',()=>{throw Error('must reuse boundary');});assert.equal(final.body.sequence,105);
  assert.equal(c.sqlite.prepare('SELECT COUNT(*) n FROM operational_authority_outbox WHERE delivery_receipt IS NOT NULL').get().n,105);
  assert.equal((await c.authority.head()).state,'idle');await readBoundary(c.custody,c.key,'paged',final.receipt,at);
 }finally{await c.close();}
});
import { resumeJournalAfterRestore } from '../../scripts/d1-operational-recovery.mjs';
test('restoration continues the pinned independent chain; subsequent authority invalidates the older restore boundary',async()=>{
 const c=await fixture();try{
  await c.authority.mutate(op('one'),insert('one'));const boundary=await c.authority.deliver('old',()=>snapshot(c));
  c.sqlite.exec('DELETE FROM operational_authority_outbox; DELETE FROM operational_recovery_checkpoints');
  c.sqlite.prepare("INSERT INTO operational_recovery_checkpoints VALUES('restore','restore',?,1,?,1,'complete',1,?,?)").run('a'.repeat(64),'a'.repeat(64),at,at+30*86400000);
  await assert.rejects(resumeJournalAfterRestore(c.authority,'old',boundary.receipt,'restore'),/suppression/);
  c.sqlite.prepare("INSERT INTO retention_restore VALUES('active',?,?)").run(boundary.receipt,at);
  await resumeJournalAfterRestore(c.authority,'old',boundary.receipt,'restore');await resumeJournalAfterRestore(c.authority,'old',boundary.receipt,'restore');
  await c.authority.mutate(op('two'),insert('two'));assert.equal((await c.authority.head()).sequence,2);
  await assert.rejects(readBoundary(c.custody,c.key,'old',boundary.receipt,at),/later_or_missing/);
  const newer=await c.authority.deliver('new',()=>snapshot(c));assert.equal(newer.body.base.sequence,1);assert.equal((await readBoundary(c.custody,c.key,'new',newer.receipt,at)).sequence,2);
 }finally{await c.close();}
});
test('crashed local ciphertext uploads are invisible to recovery and removed within the same bounded backup window',async()=>{
 const c=await fixture();try{
  const {writeFile,utimes}=await import('node:fs/promises'),file=c.custody.file('crashed.uploading');await writeFile(file,Buffer.from('partial synthetic ciphertext'));await utimes(file,new Date(at),new Date(at));
  assert.deepEqual(await c.custody.list(),[]);assert.equal(await c.custody.cleanupTemporary(at+30*86400000-1,1),0);assert.equal(await c.custody.cleanupTemporary(at+30*86400000,1),1);assert.equal(await c.custody.cleanupTemporary(at+30*86400000,1),0);
 }finally{await c.close();}
});

import { importStatement } from '../../scripts/d1-rehearsal-provider.mjs';
test('native schema import retains trigger bodies, binds safely and never forwards authentication to upload',async()=>{
 assert.equal(importStatement({sql:"SELECT '?1', ?1, ?2 -- ?3\n",params:["a'b",7]}),"SELECT '?1', 'a''b', 7 -- ?3\n;");
 assert.throws(()=>importStatement({sql:'SELECT ?1',params:[{}]}),/parameter_type/);
 const databaseId='11111111-2222-4333-8444-555555555555',calls=[];let etag;
 const request=async(url,options={})=>{
  calls.push({url:String(url),options});
  if(String(url).endsWith(databaseId))return Response.json({success:true,result:{uuid:databaseId,name:rehearsalTarget.name}});
  if(String(url).includes('cloudflarestorage.com'))return new Response('',{headers:{etag:'"'+etag+'"'}});
  const body=JSON.parse(options.body);
  if(body.action==='init'){etag=body.etag;return Response.json({success:true,result:{upload_url:'https://synthetic.r2.cloudflarestorage.com/schema',filename:'synthetic.sql'}});}
  return Response.json({success:true,result:{success:true,status:'complete',result:{meta:{rows_written:3},final_bookmark:'imported'}}});
 };
 const db=await RehearsalD1.connect({...rehearsalTarget,databaseId,token:'synthetic',fetch:request});
 const trigger="CREATE TRIGGER synthetic AFTER INSERT ON synthetic BEGIN SELECT CASE WHEN NEW.id=1 THEN 1 ELSE 0 END; SELECT 1; END;";
 const result=await db.batch([{sql:trigger,params:[]},{sql:'SELECT ?1',params:["safe'value"]}]);
 assert.equal(result.length,2);assert.equal(result[0].meta.rows_written,3);
 const upload=calls.find(c=>c.url.includes('cloudflarestorage.com'));
 assert.equal(upload.options.headers,undefined);assert.equal(upload.options.redirect,'error');
 assert.ok(upload.options.body.toString().includes(importStatement({sql:trigger,params:[]})));assert.doesNotMatch(upload.options.body.toString(),/;\s*;/);const compiled=new DatabaseSync(':memory:');try{compiled.exec('CREATE TABLE synthetic(id INTEGER)');compiled.exec(upload.options.body.toString());assert.equal(compiled.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE type='trigger' AND name='synthetic'").get().n,1);}finally{compiled.close();}assert.ok(upload.options.body.toString().includes("SELECT 'safe''value'\n;"));
});
