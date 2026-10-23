import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {randomBytes} from 'node:crypto';
import {setup,request,checkout,verified,adverse,config,credential,now as businessAt} from '../helpers/cowrieCommerce.mjs';
import {loadMigrationPlan,applyMigrationPlan} from '../../scripts/data-migrations.mjs';
import {createAuthorityService} from '../../worker/authorityService.mjs';
import {createJournaledDatabase} from '../../worker/authorityDatabase.mjs';
import {D1Authority,createOperationId} from '../../scripts/authority-runtime.mjs';
import {CommerceService,D1CommerceRepository,InMemoryCommerceRateLimiter} from '../../db/commerce.ts';
import {D1QuestionSelectionRepository} from '../../db/questionSelection.ts';import {deriveAnonymousSubjectHash} from '../../app/anonymousSession.ts';import {completeCowrieQuickPlay} from '../../db/cowrieCompletion.ts';
import {operatorRetentionPlan} from '../../db/retention.ts';
import {encryptRecord,decryptRecord,recoveryHash} from '../../scripts/recovery-crypto.mjs';
import {createDriveRecordHeader} from '../../scripts/drive-record-header.mjs';
import {verifyAuthorityBoundaryStep,boundedAuthorityStep} from '../../worker/boundedAuthority.mjs';
import {prepareAuthorityRestore} from '../../scripts/authority-restore-plan.mjs';
import {importProductionRestore,verifyProductionRestoreStep} from '../../scripts/streamed-d1-restore.mjs';
import {initialiseRecoveryMirror,replayRecoveryMirrorStep,acknowledgeMirrorSnapshotStep} from '../../worker/recoveryMirror.mjs';
import {advanceRecoveryMirrorSnapshot} from '../../worker/recoveryMirrorCapture.mjs';
import {discoverLatestAuthority,recoverSignedDriveIndex} from '../../scripts/discover-authority-tail.mjs';
import {materializeSegmentedSnapshot} from '../../scripts/worker-snapshot-restore.mjs';
import {replayVerifiedAuthorityTail} from '../../scripts/authority-tail-restore.mjs';
const identity={role:'recovery-mirror',name:'wybp-capacity-recovery-d1-r002',id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'};
const adapter=sql=>({query:async(s,p=[])=>sql.prepare(s).all(...p),batch:async rows=>{sql.exec('BEGIN');try{const result=rows.map(r=>({success:true,results:sql.prepare(r.sql).all(...(r.params||[])),meta:{changes:/^(SELECT|PRAGMA)/i.test(r.sql)?0:Number(sql.prepare('SELECT changes() n').get().n)}}));sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}});
async function fixture(){
 const c=await setup(),at=Date.now(),key=randomBytes(32),mirror=new DatabaseSync(':memory:'),stage=new DatabaseSync(':memory:'),journal=new DatabaseSync(':memory:'),recovered=new DatabaseSync(':memory:'),files=new Map(),ids=new Map(),clocks=new Map();let independentHead=null,audits=0;
 const migrations=await loadMigrationPlan();applyMigrationPlan(mirror,migrations);applyMigrationPlan(journal,migrations);
 const custody={folderId:'synthetic_mirror_folder',supportsCommitHead:true,index:{get:async n=>ids.get(n)||null,recoveryRecord:async n=>clocks.get(n),recoverReserve:async(n,id,r)=>{if(ids.has(n))assert.equal(ids.get(n),id);if(clocks.has(n))assert.deepEqual(clocks.get(n),{createdAt:r.createdAt,expiresAt:r.expiresAt});ids.set(n,id);clocks.set(n,{createdAt:r.createdAt,expiresAt:r.expiresAt});return id;},activeCount:async t=>[...clocks.values()].filter(r=>r.expiresAt>t).length},
 get:async n=>ids.has(n)?files.get(n)?.bytes||null:null,put:async(n,b,clock={createdAt:at,expiresAt:at+2592000000})=>{if(files.has(n))assert.deepEqual(files.get(n).bytes,b);else{const id='synthetic_mirror_file_'+files.size;ids.set(n,id);clocks.set(n,clock);files.set(n,{id,bytes:b,properties:createDriveRecordHeader({key,folderId:custody.folderId,fileId:id,name:n},{sha256:recoveryHash(b),...clock,event:n.endsWith('.intent')?decryptRecord(b,key,n):null})});}return recoveryHash(b);},
 readLatestCommitHead:async()=>independentHead,publishCommitHead:async(e,h)=>{independentHead={sequence:e.sequence,head:h,createdAt:e.createdAt,expiresAt:e.expiresAt};return independentHead;},
 auditPage:async({cursor,pageSize})=>{audits++;const names=[...files.keys()].sort(),offset=Number(cursor||0);return {files:names.slice(offset,offset+pageSize).map(n=>({id:files.get(n).id,name:n,mimeType:'application/octet-stream',parents:[custody.folderId],appProperties:files.get(n).properties})),cursor:offset+pageSize<names.length?String(offset+pageSize):null};}};
 const source=adapter(c.database),target=adapter(mirror),authority=new D1Authority(source,custody,key,{now:()=>at});await authority.initialise();
 const service=()=>createAuthorityService({db:source,custody,key,now:()=>at,alert:async()=>{},snapshot:async()=>assert.fail('no monolithic capture')});
 const start=await c.walletService.startQuickPlay({region:'west',anonymousSessionCredential:credential,idempotencyKey:'synthetic_mirror_initial'}),selected=await new D1QuestionSelectionRepository(c.adapter).getAttempt(start.selection.attemptId,await deriveAnonymousSubjectHash(credential),businessAt);
 await completeCowrieQuickPlay(c.adapter,{attemptId:start.selection.attemptId,anonymousSessionCredential:credential,idempotencyKey:'c'.repeat(32),avatarId:'adjoa',answers:selected.selection.questions.map(q=>({questionStableId:q.stableId,selectedOptionIds:q.acceptedAnswers[0]}))},businessAt);
 // Physical historical stock makes capture span multiple independently verified
 // segments. These clones are not measured application completions.
 const original=c.database.prepare('SELECT * FROM quiz_attempts LIMIT 1').get(),result=c.database.prepare('SELECT * FROM results LIMIT 1').get(),answers=c.database.prepare('SELECT * FROM answers').all();
 const insert=(table,record)=>{const fields=Object.keys(record),statement=c.database.prepare('INSERT INTO '+table+'('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+')');return next=>statement.run(...fields.map(k=>next[k]));},addAttempt=insert('quiz_attempts',original),addResult=insert('results',result),addAnswer=insert('answers',answers[0]);
 c.database.exec('BEGIN');try{for(let i=1;i<1000;i++){const id='synthetic_mirror_stock_'+i;addAttempt({...original,id,idempotency_key_hash:randomBytes(32).toString('hex')});addResult({...result,id:'synthetic_mirror_result_'+i,attempt_id:id,public_slug:randomBytes(24).toString('hex')});for(const[j,a]of answers.entries())addAnswer({...a,id:'synthetic_mirror_answer_'+i+'_'+j,attempt_id:id});}c.database.exec('COMMIT');}catch(error){c.database.exec('ROLLBACK');throw error;}
 const order=await c.service.startOrder(request(c));await c.service.webhook(await verified('checkout.session.completed',checkout(order)));
 let captured;do{captured=await service().advanceSnapshot('synthetic_mirror_bootstrap');}while(!captured.complete);
 const baseline={name:'synthetic_mirror_bootstrap.boundary',sha256:captured.receipt},prepared=await prepareAuthorityRestore({checkpointDatabase:adapter(journal),sourceDatabase:stage,custody,key,boundary:baseline,id:'synthetic_mirror_import',now:()=>at}),options={role:'production-ops',databaseName:'wybp-prod-d1-r001',databaseId:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9',job:'recovery_mirror_seed',maxPages:25,boundarySha256:baseline.sha256,snapshotSha256:prepared.provenance.snapshotSha256,now:at};
 let imported;do{imported=await importProductionRestore(target,custody,key,prepared.plan,options);}while(!imported.imported);let checked;do{checked=await verifyProductionRestoreStep(target,custody,key,prepared.plan,options);}while(!checked.verified);
 const verify=async pointer=>{let result,p=null,n=0;do{result=await verifyAuthorityBoundaryStep(adapter(journal),custody,key,pointer,p,{now:()=>at});p=result.progress;assert.ok(++n<5000);}while(!result.verified);return result;};
 await initialiseRecoveryMirror(target,custody,key,prepared.plan,baseline,await verify(baseline),{identity,job:options.job,now:()=>at});
 return {...c,source,target,mirror,stage,journal,recovered,key,custody,files,ids,clocks,authority,service,order,start,at,verify,audits:()=>audits,close(){for(const db of [c.database,mirror,stage,journal,recovered])db.close();key.fill(0);}};
}

test('mirror replay preserves real financial/closure/deletion/hold authority through crashes; capture never fences source or scans historical inventory',async()=>{
 const f=await fixture(),options={identity,now:()=>f.at};
 try{
  const commerce=new CommerceService(new D1CommerceRepository(createJournaledDatabase(f.adapter,f.service(),{now:()=>f.at})),new InMemoryCommerceRateLimiter(),config,()=>businessAt,{cowriePurchasesEnabled:true});
  await commerce.webhook(await verified('charge.refunded',adverse()));
  const wallet=f.database.prepare('SELECT id FROM cowrie_wallets LIMIT 1').get().id,order=f.database.prepare('SELECT id FROM commerce_orders LIMIT 1').get().id,event=f.database.prepare("SELECT id FROM stripe_webhook_events WHERE event_type='charge.refunded'").get().id,result=f.database.prepare('SELECT id FROM results LIMIT 1').get().id;
  for(const action of [{operation:'settlement',orderId:order,eventId:event,reason:'verified_refund'},{operation:'close-wallet',walletId:wallet,evidenceHash:'a'.repeat(64)},{operation:'hold',id:'synthetic_mirror_hold',scope:'wallet',subjectId:wallet,reason:'legal',evidenceHash:'a'.repeat(64)},{operation:'erase',scope:'attempt',subjectId:f.start.selection.attemptId,evidenceHash:'a'.repeat(64)},{operation:'erase',scope:'result',subjectId:result,evidenceHash:'a'.repeat(64)}])await f.service().transact(createOperationId(f.at),operatorRetentionPlan(action,f.at));
  let lost=true;await assert.rejects(replayRecoveryMirrorStep(f.source,f.target,f.custody,f.key,{...options,fault:()=>{if(lost){lost=false;throw Error('synthetic_committed_reply_lost');}}}),/synthetic_committed_reply_lost/);
  await assert.rejects(advanceRecoveryMirrorSnapshot(f.target,f.custody,f.key,'synthetic_unsealed',options),/authority_writer_busy/);
  await assert.rejects(boundedAuthorityStep(f.target,f.custody,f.key,'synthetic_unsealed',null,{now:()=>f.at,mirrorIdentity:identity}),/bounded_authority_unavailable/);
  let replay;do{replay=await replayRecoveryMirrorStep(f.source,f.target,f.custody,f.key,options);}while(!replay.caughtUp);
  const protectedTables=['commerce_orders','cowrie_ledger','stripe_webhook_events','cowrie_wallets','retention_holds','retention_closures','retention_suppression','quiz_attempts','answers','results'];
  const rows=(db,t)=>db.prepare('SELECT * FROM '+t+' ORDER BY 1').all();for(const t of protectedTables)assert.deepEqual(rows(f.mirror,t),rows(f.database,t),t);
  const before=f.audits();for(let i=0;i<10000;i++){const n='synthetic_history_'+i+'.enc';await f.custody.put(n,encryptRecord({synthetic:true,index:i},f.key,n));}
  let captured,calls=0,writes=0,overlapped=0;do{
   let capturing=true;const capture=(async()=>{try{return await advanceRecoveryMirrorSnapshot(f.target,f.custody,f.key,'synthetic_mirror_live',options);}finally{capturing=false;}})();
   const write=f.service().mutate(createOperationId(f.at),operatorRetentionPlan({operation:'hold',id:'synthetic_during_capture_'+writes++,scope:'wallet',subjectId:wallet,reason:'legal',evidenceHash:'b'.repeat(64)},f.at)).then(()=>{if(capturing)overlapped++;});
   [captured]=await Promise.all([capture,write]);calls++;
   assert.equal((await f.authority.head()).state,'idle');assert.equal(await f.service().ready(),true);
   if(!captured.complete)assert.equal((await replayRecoveryMirrorStep(f.source,f.target,f.custody,f.key,options)).pausedForSnapshot,true);
   assert.ok(calls<120);
  }while(!captured.complete);
  assert.equal(f.audits(),before,'routine capture must not enumerate10k historical objects');assert.ok(writes>10,'source writes must complete throughout capture');
  assert.ok(overlapped>0,'source writes must finish while capture is still in flight');
  assert.equal(f.mirror.prepare("SELECT COUNT(*) n FROM operational_recovery_checkpoints WHERE id LIKE 'bounded-seen:synthetic_mirror_live:%' OR id LIKE 'bounded-page:synthetic_mirror_live:%'").get().n,0);
  const pointer={name:'synthetic_mirror_live.boundary',sha256:captured.receipt},body=decryptRecord(f.files.get(pointer.name).bytes,f.key,pointer.name);assert.equal(body.version,4);assert.equal(body.inventory.requiredOnRecovery,true);
  let ack;do{ack=await acknowledgeMirrorSnapshotStep(f.source,f.custody,f.key,pointer,{now:()=>f.at});assert.equal((await f.authority.head()).state,'idle');}while(!ack.complete);
  assert.deepEqual(await acknowledgeMirrorSnapshotStep(f.source,f.custody,f.key,pointer,{now:()=>f.at}),{complete:true,sequence:body.sequence});
  await assert.rejects(f.verify(pointer),'a stale snapshot may not release newer authority');
  f.ids.clear();f.clocks.clear();await recoverSignedDriveIndex({custody:f.custody,key:f.key,maxFiles:20000,maxPages:2000,now:()=>f.at});
  const discovered=await discoverLatestAuthority({database:f.stage,custody:f.custody,key:f.key,snapshot:pointer,id:'synthetic_mirror_latest',writersStopped:true,maxFiles:20000,maxPages:2000,now:()=>f.at});
  const verifiedLatest=await f.verify(discovered.boundary),latest=decryptRecord(f.files.get(discovered.boundary.name).bytes,f.key,discovered.boundary.name);
  await materializeSegmentedSnapshot(f.custody,f.key,latest.snapshot,f.recovered);await replayVerifiedAuthorityTail({database:f.recovered,custody:f.custody,key:f.key,pointer:discovered.boundary,verification:verifiedLatest,now:()=>f.at});
  for(const t of protectedTables)assert.deepEqual(rows(f.recovered,t),rows(f.database,t),t+' latest after mirror cut');
  assert.equal(f.recovered.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);assert.deepEqual(f.recovered.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log(JSON.stringify({localOnly:true,physicalGames:1000,physicalAnswers:12000,historyObjects:10000,sourceWritesDuringSnapshot:writes,overlappedWrites:overlapped,captureCalls:calls,routineInventoryCalls:0,routineSeenRows:0,latestRecoveryVerified:true}));
 }finally{f.close();}
});

test('mirror identity and committed-prefix failures cannot bootstrap application data or release a partial cut',async()=>{
 const f=await fixture(),options={identity,now:()=>f.at};try{
  await assert.rejects(replayRecoveryMirrorStep(f.source,f.target,f.custody,f.key,{...options,identity:{...identity,id:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'}}));
  const wallet=f.database.prepare('SELECT id FROM cowrie_wallets LIMIT 1').get().id;await f.service().mutate(createOperationId(f.at),operatorRetentionPlan({operation:'hold',id:'synthetic_mirror_bad_event',scope:'wallet',subjectId:wallet,reason:'legal',evidenceHash:'a'.repeat(64)},f.at));
  const last=f.database.prepare('SELECT * FROM operational_authority_outbox ORDER BY sequence DESC LIMIT 1').get(),file=f.files.get(last.operation_id+'.intent');f.files.set(last.operation_id+'.intent',{...file,bytes:Buffer.from('synthetic_corruption')});
  await assert.rejects(replayRecoveryMirrorStep(f.source,f.target,f.custody,f.key,options));assert.equal(f.mirror.prepare('SELECT COUNT(*) n FROM retention_holds').get().n,0);assert.equal((await f.authority.head()).state,'idle');assert.equal(f.mirror.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
 }finally{f.close();}
});

test('lost capture progress resumes on the mirror; corrupted publication cannot advance the source baseline',async()=>{
 const f=await fixture(),options={identity,now:()=>f.at};try{
  let lost=true;const flaky={...f.target,batch:async rows=>{const result=await f.target.batch(rows);if(lost&&rows.some(r=>r.params?.[0]==='mirror-capture:synthetic_mirror_resume')){lost=false;throw Error('synthetic_capture_receipt_lost');}return result;}};
  await assert.rejects(advanceRecoveryMirrorSnapshot(flaky,f.custody,f.key,'synthetic_mirror_resume',options),/synthetic_capture_receipt_lost/);assert.equal((await f.authority.head()).state,'idle');
  let done,n=0;do{done=await advanceRecoveryMirrorSnapshot(flaky,f.custody,f.key,'synthetic_mirror_resume',options);assert.ok(++n<120);}while(!done.complete);
  const pointer={name:'synthetic_mirror_resume.boundary',sha256:done.receipt},body=decryptRecord(f.files.get(pointer.name).bytes,f.key,pointer.name),base=f.database.prepare("SELECT * FROM operational_recovery_checkpoints WHERE id='baseline'").get();
  const forged={...body,id:'synthetic_mirror_forged',head:'f'.repeat(64),capture:{...body.capture,head:'f'.repeat(64)}},name=forged.id+'.boundary',bytes=encryptRecord(forged,f.key,name);await f.custody.put(name,bytes);
  await assert.rejects(acknowledgeMirrorSnapshotStep(f.source,f.custody,f.key,{name,sha256:recoveryHash(bytes)},{now:()=>f.at}));assert.deepEqual(f.database.prepare("SELECT * FROM operational_recovery_checkpoints WHERE id='baseline'").get(),base);
  const count=f.files.size;assert.deepEqual(await advanceRecoveryMirrorSnapshot(flaky,f.custody,f.key,'synthetic_mirror_resume',options),done);assert.equal(f.files.size,count);assert.equal(f.mirror.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
 }finally{f.close();}
});
