import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {randomBytes} from 'node:crypto';
import {populatedRecoveryFixture} from '../helpers/populatedRecovery.mjs';
import {request,checkout,verified,adverse,config,now as businessNow} from '../helpers/cowrieCommerce.mjs';
import {loadMigrationPlan,applyMigrationPlan} from '../../scripts/data-migrations.mjs';
import {D1Authority,createOperationId} from '../../scripts/authority-runtime.mjs';
import {createAuthorityService} from '../../worker/authorityService.mjs';
import {createJournaledDatabase} from '../../worker/authorityDatabase.mjs';
import {CommerceService,D1CommerceRepository,InMemoryCommerceRateLimiter} from '../../db/commerce.ts';
import {D1QuestionSelectionRepository} from '../../db/questionSelection.ts';
import {deriveAnonymousSubjectHash} from '../../app/anonymousSession.ts';
import {completeCowrieQuickPlay} from '../../db/cowrieCompletion.ts';
import {operatorRetentionPlan} from '../../db/retention.ts';
import {prepareAuthorityRestore} from '../../scripts/authority-restore-plan.mjs';
import {replayVerifiedAuthorityTail} from '../../scripts/authority-tail-restore.mjs';
import {verifyAuthorityBoundaryStep} from '../../worker/boundedAuthority.mjs';
import {materializeSegmentedSnapshot} from '../../scripts/worker-snapshot-restore.mjs';
import {importProductionRestore,verifyProductionRestoreStep,importMirrorRestore,verifyMirrorRestoreStep,importRetainedSourceRestore,verifyRetainedSourceRestoreStep} from '../../scripts/streamed-d1-restore.mjs';
import {recoveryHash,encryptRecord,decryptRecord} from '../../scripts/recovery-crypto.mjs';
import {finalizeProductionAuthorityRestore,finalizeMirrorAuthorityRestore,finalizeRetainedSourceAuthorityRestore} from '../../scripts/finalize-authority-restore.mjs';
import {assertRestoreReceipt} from '../../db/retention.ts';
import {Adapter} from '../helpers/cowrieCommerce.mjs';
import {createDriveRecordHeader,verifyDriveRecordHeader} from '../../scripts/drive-record-header.mjs';
import {discoverLatestAuthority,recoverSignedDriveIndex} from '../../scripts/discover-authority-tail.mjs';
import {encodeCommitHead,decodeCommitHead} from '../../scripts/drive-commit-head.mjs';
import {initialiseIndependentHead} from '../../scripts/initialise-independent-head.mjs';
const adapter=sql=>({query:async(s,p=[])=>sql.prepare(s).all(...p),batch:async rows=>{sql.exec('BEGIN');try{const result=rows.map(r=>{const results=sql.prepare(r.sql).all(...(r.params||[]));return {success:true,results,meta:{changes:/^(SELECT|PRAGMA)/i.test(r.sql)?0:sql.prepare('SELECT changes() n').get().n}};});sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}});

const ordered=(sql,table)=>sql.prepare('SELECT * FROM '+table+' ORDER BY '+sql.prepare('PRAGMA table_info('+table+')').all().filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>'"'+c.name+'"').join(',')).all();

for(const mode of ['production','retained-source','mirror'])test(mode+': snapshot plus latest independent tail restores refund, hold, closure and deletion without recapturing or duplicate effects',async()=>{
 const restoreImport=mode==='production'?importProductionRestore:mode==='mirror'?importMirrorRestore:importRetainedSourceRestore,restoreVerify=mode==='production'?verifyProductionRestoreStep:mode==='mirror'?verifyMirrorRestoreStep:verifyRetainedSourceRestoreStep,restoreFinalize=mode==='production'?finalizeProductionAuthorityRestore:mode==='mirror'?finalizeMirrorAuthorityRestore:finalizeRetainedSourceAuthorityRestore;
 const targetIdentity=mode==='production'?{role:'production-ops',databaseName:'wybp-prod-d1-r001',databaseId:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'}:mode==='mirror'?{identity:{role:'recovery-mirror',name:'wybp-capacity-recovery-d1-r002',id:'22222222-2222-4222-8222-222222222222'}}:{resource:{name:'wybp-capacity-d1-r002',id:'11111111-1111-4111-8111-111111111111',account:'b6b22a9a87b5758725e5c499782160af'}};
 const c=await populatedRecoveryFixture(),scratch=new DatabaseSync(':memory:'),journal=new DatabaseSync(':memory:'),target=new DatabaseSync(':memory:'),replay=new DatabaseSync(':memory:'),unused=new DatabaseSync(':memory:');
 const at=Date.now(),key=randomBytes(32),files=new Map(),clocks=new Map(),ids=new Map(),db=adapter(c.database),second='b'.repeat(32);
 const custody={folderId:'synthetic_tail_custody',index:{get:async n=>ids.get(n)||null,recoveryRecord:async n=>clocks.get(n),activeCount:async time=>[...clocks.values()].filter(c=>c.expiresAt>time).length},
  get:async n=>files.get(n)||null,put:async(n,b,clock)=>{if(files.has(n))assert.deepEqual(files.get(n),b);else{ids.set(n,'synthetic_file_'+ids.size);clocks.set(n,clock||{createdAt:at,expiresAt:at+2592000000});}files.set(n,b);return recoveryHash(b);},
  auditPage:async({cursor,pageSize})=>{const names=[...files.keys()].sort(),offset=Number(cursor||0);return {files:names.slice(offset,offset+pageSize).map(name=>({name,id:ids.get(name),mimeType:'application/octet-stream',parents:[custody.folderId],appProperties:{wybpRecovery:'1'}})),cursor:offset+pageSize<names.length?String(offset+pageSize):null};},
 };
 let sourceClosed=false;
 try{
  const migrations=await loadMigrationPlan();applyMigrationPlan(journal,migrations);applyMigrationPlan(target,migrations);
  const created=await c.walletService.createOrGet({anonymousSessionCredential:second});
  const started=await c.walletService.startQuickPlay({region:'west',anonymousSessionCredential:second,idempotencyKey:'synthetic_later_deletion'});
  const selected=await new D1QuestionSelectionRepository(c.adapter).getAttempt(started.selection.attemptId,await deriveAnonymousSubjectHash(second),businessNow);
  await completeCowrieQuickPlay(c.adapter,{attemptId:started.selection.attemptId,anonymousSessionCredential:second,idempotencyKey:'d'.repeat(32),avatarId:'adjoa',answers:selected.selection.questions.map(q=>({questionStableId:q.stableId,selectedOptionIds:q.acceptedAnswers[0]}))},businessNow);
  const order=await c.service.startOrder({...request(c,'cowrie_5_v1','2'),walletReference:created.wallet.walletReference,anonymousSessionCredential:second});
  await c.service.webhook(await verified('checkout.session.completed',checkout(order,'cowrie_5_v1','pi_local_D_later')));
  const wallet=c.database.prepare('SELECT id FROM cowrie_wallets WHERE public_reference=?').get(created.wallet.walletReference)?.id;
  assert.ok(wallet);
  const authority=new D1Authority(db,custody,key,{now:()=>at});await authority.initialise();await authority.mutate(createOperationId(at),operatorRetentionPlan({operation:'open-case',id:'synthetic_root_live_case',walletId:wallet,kind:'support',evidenceHash:'a'.repeat(64)},at));
  const service=()=>createAuthorityService({db,custody,key,now:()=>at,alert:async()=>{},snapshot:async()=>assert.fail('tail must not use a monolithic snapshot')});
  let captured,calls=0;do{captured=await service().advanceSnapshot('synthetic_tail_base');assert.ok(++calls<120);}while(!captured.complete);
  const root={name:'synthetic_tail_base.boundary',sha256:captured.receipt},baseline=c.database.prepare("SELECT * FROM operational_recovery_checkpoints WHERE id='baseline'").get();
  const snapshots=[...files.keys()].filter(n=>/\.segment\d+\.enc$/.test(n));
  const commerce=new CommerceService(new D1CommerceRepository(createJournaledDatabase(c.adapter,service(),{now:()=>at})),new InMemoryCommerceRateLimiter(),config,()=>businessNow,{cowriePurchasesEnabled:true});
  await commerce.webhook(await verified('charge.refunded',adverse('pi_local_D_later')));
  const orderId=c.database.prepare('SELECT id FROM commerce_orders WHERE public_order_reference=?').get(order.publicOrderReference).id,eventId=c.database.prepare("SELECT id FROM stripe_webhook_events WHERE order_id=? AND event_type='charge.refunded'").get(orderId).id;
  await service().transact(createOperationId(at),operatorRetentionPlan({operation:'settlement',orderId,eventId,reason:'verified_refund'},at));
  const result=c.database.prepare('SELECT id FROM results WHERE attempt_id=?').get(started.selection.attemptId).id;
  for(const action of [{operation:'close-case',id:'synthetic_root_live_case',kind:'support'},{operation:'close-wallet',walletId:wallet,evidenceHash:'a'.repeat(64)},{operation:'hold',id:'synthetic_late_hold',scope:'wallet',subjectId:wallet,reason:'legal',evidenceHash:'a'.repeat(64)},{operation:'erase',scope:'attempt',subjectId:started.selection.attemptId,evidenceHash:'a'.repeat(64)},{operation:'erase',scope:'result',subjectId:result,evidenceHash:'a'.repeat(64)}])await service().transact(createOperationId(at),operatorRetentionPlan(action,at));
  let tail;do{tail=await service().advanceAuthorityTail('synthetic_tail_latest',root);if(!tail.complete)await assert.rejects(service().ready());assert.ok(++calls<220);}while(!tail.complete);
  const pointer={name:'synthetic_tail_latest.boundary',sha256:tail.receipt},body=decryptRecord(files.get(pointer.name),key,pointer.name);
  assert.equal(body.version,3);assert.equal(body.base.sequence,baseline.sequence);assert.deepEqual(body.snapshotAnchor,root);assert.deepEqual(c.database.prepare("SELECT * FROM operational_recovery_checkpoints WHERE id='baseline'").get(),baseline);
  assert.deepEqual([...files.keys()].filter(n=>/\.segment\d+\.enc$/.test(n)),snapshots);
  const acknowledged=c.database.prepare('SELECT operation_id,acknowledged_at,created_at,expires_at FROM operational_authority_outbox ORDER BY sequence').all();
  let again;do{again=await service().advanceAuthorityTail('synthetic_tail_repeated',root);assert.ok(++calls<320);}while(!again.complete);
  assert.deepEqual(c.database.prepare('SELECT operation_id,acknowledged_at,created_at,expires_at FROM operational_authority_outbox ORDER BY sequence').all(),acknowledged);
  const tables=['cowrie_wallets','cowrie_ledger','commerce_orders','stripe_webhook_events','retention_holds','retention_closures','retention_suppression','quiz_attempts','answers','results'];
  const expected=new Map(tables.map(table=>[table,ordered(c.database,table)]));
  c.database.close();sourceClosed=true;
  const independent={...adapter(journal),query:async(s,p=[])=>{assert.ok(!s.includes('operational_authority_outbox'),'verification cannot read source outbox');return journal.prepare(s).all(...p);}};
  let checked,progress=null;do{checked=await verifyAuthorityBoundaryStep(independent,custody,key,pointer,progress,{now:()=>at});progress=checked.progress;assert.ok(++calls<450);}while(!checked.verified);
  await materializeSegmentedSnapshot(custody,key,body.snapshot,replay);
  let interrupted=false;await assert.rejects(replayVerifiedAuthorityTail({database:replay,custody,key,pointer,verification:checked,now:()=>at,fault:()=>{if(!interrupted){interrupted=true;throw Error('synthetic_tail_response_lost');}}}),/synthetic_tail_response_lost/);
  await replayVerifiedAuthorityTail({database:replay,custody,key,pointer,verification:checked,now:()=>at});
  for(const table of tables)assert.deepEqual(ordered(replay,table),expected.get(table));
  const prepared=await prepareAuthorityRestore({checkpointDatabase:independent,sourceDatabase:scratch,custody,key,boundary:pointer,id:'synthetic_latest_import',now:()=>at});
  const options={...targetIdentity,boundarySha256:pointer.sha256,snapshotSha256:prepared.provenance.snapshotSha256,job:'recovery_latest_tail',maxPages:25,now:at};
  await assert.rejects(restoreImport(adapter(target),custody,key,prepared.plan,{...options,fault:()=>{throw Error('synthetic_import_response_lost');}}),/synthetic_import_response_lost/);
  let imported;do{imported=await restoreImport(adapter(target),custody,key,prepared.plan,options);assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);assert.ok(++calls<550);}while(!imported.imported);
  let verifiedTarget;do{verifiedTarget=await restoreVerify(adapter(target),custody,key,prepared.plan,options);assert.ok(++calls<650);}while(!verifiedTarget.verified);
  for(const table of tables)assert.deepEqual(ordered(target,table),expected.get(table));
  assert.deepEqual(target.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
  const releaseOptions={...options,now:()=>at};
  await assert.rejects(restoreFinalize(adapter(target),custody,key,prepared.plan,pointer,checked,releaseOptions),'pre-import inventory cannot release after new plan objects were added');
  assert.equal(target.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
  let fresh,freshProgress=null;do{fresh=await verifyAuthorityBoundaryStep(independent,custody,key,pointer,freshProgress,{now:()=>at});freshProgress=fresh.progress;assert.ok(++calls<750);}while(!fresh.verified);
  await assert.rejects(restoreFinalize(adapter(target),custody,key,prepared.plan,pointer,fresh,{...releaseOptions,databaseId:'wrong',identity:{...targetIdentity.identity,id:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'},resource:{...targetIdentity.resource,id:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'}}));
  let lost=true;const lostResponse={...adapter(target),batch:async rows=>{const result=await adapter(target).batch(rows);if(lost&&rows.some(r=>r.sql.startsWith('INSERT INTO retention_restore'))){lost=false;throw Error('synthetic_release_response_lost');}return result;}};
  await assert.rejects(restoreFinalize(lostResponse,custody,key,prepared.plan,pointer,fresh,releaseOptions),/synthetic_release_response_lost/);
  await assert.rejects(assertRestoreReceipt(new Adapter(target),'a'.repeat(64)));
  const released=await restoreFinalize(adapter(target),custody,key,prepared.plan,pointer,fresh,releaseOptions);
  assert.equal(released.sequence,tail.sequence);assert.equal(released.runtimeAccess,'blocked_pending_runtime_receipt_configuration');
  await assertRestoreReceipt(new Adapter(target),released.receipt);
  assert.deepEqual(await restoreFinalize(adapter(target),custody,key,prepared.plan,pointer,fresh,releaseOptions),released);
  for(const table of tables)assert.deepEqual(ordered(target,table),expected.get(table));
  const unknown=createOperationId(at),event={operationId:unknown,sequence:tail.sequence+1,previousHash:body.head,intentHash:'f'.repeat(64),statements:[],createdAt:at,expiresAt:at+2592000000};await custody.put(unknown+'.intent',encryptRecord(event,key,unknown+'.intent'));
  await assert.rejects(prepareAuthorityRestore({checkpointDatabase:independent,sourceDatabase:unused,custody,key,boundary:pointer,id:'synthetic_tail_stale',now:()=>at}));assert.equal(unused.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE type='table'").get().n,0);
 }finally{if(!sourceClosed)c.database.close();for(const sql of [scratch,journal,target,replay,unused])sql.close();key.fill(0);}
});
test('signed full inventory reconstructs lost IDs and discovers commits newer than the last checkpoint after source loss; interruptions and unknown intents stay blocked',async()=>{
 const c=await populatedRecoveryFixture(),stage=new DatabaseSync(':memory:'),journal=new DatabaseSync(':memory:'),restored=new DatabaseSync(':memory:'),key=randomBytes(32),at=Date.now(),files=new Map(),ids=new Map();let closed=false;
 let headProperties={};const folderId='synthetic_signed_folder',index={get:async n=>ids.get(n)?.fileId||null,recoveryRecord:async n=>{const r=ids.get(n);return r?{createdAt:r.createdAt,expiresAt:r.expiresAt}:null;},activeCount:async t=>[...ids.values()].filter(r=>r.expiresAt>t).length,recoverReserve:async(n,id,r)=>{const old=ids.get(n);if(old)assert.deepEqual(old,{fileId:id,createdAt:r.createdAt,expiresAt:r.expiresAt});else ids.set(n,{fileId:id,createdAt:r.createdAt,expiresAt:r.expiresAt});return id;}};
 const custody={folderId,index,get:async n=>ids.has(n)?files.get(n)?.bytes||null:null,put:async(n,bytes,clock={createdAt:at,expiresAt:at+2592000000})=>{const prior=files.get(n);if(prior){assert.deepEqual(prior.bytes,bytes);return recoveryHash(bytes);}const id='synthetic_signed_file_'+files.size;await index.recoverReserve(n,id,clock);const event=n.endsWith('.intent')?decryptRecord(bytes,key,n):null;files.set(n,{id,bytes,properties:createDriveRecordHeader({key,folderId,fileId:id,name:n},{sha256:recoveryHash(bytes),...clock,event})});return recoveryHash(bytes);},
  auditPage:async({cursor,pageSize})=>{const names=[...files.keys()].sort(),offset=Number(cursor||0);return {files:names.slice(offset,offset+pageSize).map(name=>({name,id:files.get(name).id,mimeType:'application/octet-stream',parents:[folderId],appProperties:files.get(name).properties})),cursor:offset+pageSize<names.length?String(offset+pageSize):null};},
  supportsCommitHead:true,initialiseCommitHead:async record=>{headProperties=encodeCommitHead(key,folderId,record);return record;},publishCommitHead:async(event,head)=>{headProperties=encodeCommitHead(key,folderId,{sequence:event.sequence,head,createdAt:event.createdAt,expiresAt:event.expiresAt});return decodeCommitHead(key,folderId,headProperties);},readLatestCommitHead:async()=>decodeCommitHead(key,folderId,headProperties),markCommitted:async(n,p)=>{files.get(n).properties.wybpCommitProof=p;},readCommit:async n=>files.get(n).properties.wybpCommitProof||null};
 try{
  applyMigrationPlan(journal,await loadMigrationPlan());const db=adapter(c.database),authority=new D1Authority(db,custody,key,{now:()=>at});await authority.initialise();
  const service=()=>createAuthorityService({db,custody,key,now:()=>at,alert:async()=>{},snapshot:async()=>assert.fail('no monolithic capture')});let capture,calls=0;do{capture=await service().advanceSnapshot('synthetic_signed_base');assert.ok(++calls<100);}while(!capture.complete);
  const snapshot={name:'synthetic_signed_base.boundary',sha256:capture.receipt};
  for(let i=0;i<28;i++)await service().transact(createOperationId(at),operatorRetentionPlan({operation:'hold',id:'synthetic_discovered_hold_'+i,scope:'wallet',subjectId:c.database.prepare("SELECT id FROM cowrie_wallets LIMIT 1").get().id,reason:'legal',evidenceHash:'a'.repeat(64)},at));
  let checkpoint;do{checkpoint=await service().advanceAuthorityTail('synthetic_signed_bootstrap',snapshot);assert.ok(++calls<180);}while(!checkpoint.complete);
  const checkpointPointer={name:'synthetic_signed_bootstrap.boundary',sha256:checkpoint.receipt};let verifiedBootstrap,bootstrapProgress=null;do{verifiedBootstrap=await verifyAuthorityBoundaryStep(adapter(journal),custody,key,checkpointPointer,bootstrapProgress,{now:()=>at});bootstrapProgress=verifiedBootstrap.progress;}while(!verifiedBootstrap.verified);
  await assert.rejects(initialiseIndependentHead(db,custody,key,checkpointPointer,{...verifiedBootstrap,verified:false},{now:()=>at}));headProperties={};assert.equal((await initialiseIndependentHead(db,custody,key,checkpointPointer,verifiedBootstrap,{now:()=>at})).sequence,28);
  const expected=c.database.prepare('SELECT * FROM retention_holds ORDER BY id').all();c.database.close();closed=true;ids.clear();
  const recovery={custody,key,now:()=>at,maxFiles:1000,maxPages:100};
  await assert.rejects(recoverSignedDriveIndex({...recovery,fault:()=>{throw Error('synthetic_index_response_lost');}}),/synthetic_index_response_lost/);
  await recoverSignedDriveIndex(recovery);for(const[n,f]of files){const r=verifyDriveRecordHeader({key,folderId,fileId:f.id,name:n},f.properties);assert.deepEqual(await index.recoveryRecord(n),{createdAt:r.createdAt,expiresAt:r.expiresAt});}
  const options={...recovery,database:stage,snapshot,id:'synthetic_discovered_latest',writersStopped:true};
  await assert.rejects(discoverLatestAuthority({...options,writersStopped:false}));
  const last=[...files].find(([name,f])=>name.endsWith('.intent')&&f.properties.wybpSequence==='28');files.delete(last[0]);ids.clear();await recoverSignedDriveIndex(recovery);await assert.rejects(discoverLatestAuthority(options),'missing final committed record cannot be hidden by total index loss');files.set(...last);ids.clear();await recoverSignedDriveIndex(recovery);
  await assert.rejects(discoverLatestAuthority({...options,fault:phase=>{if(phase==='segment_verified')throw Error('synthetic_discovery_response_lost');}}),/synthetic_discovery_response_lost/);
  const discovered=await discoverLatestAuthority(options);assert.equal(discovered.sequence,28);assert.equal(discovered.runtimeAccess,'blocked_pending_independent_inventory_and_verified_import');
  const prepared=await prepareAuthorityRestore({checkpointDatabase:adapter(journal),sourceDatabase:restored,custody,key,boundary:discovered.boundary,id:'synthetic_discovered_restore',now:()=>at});
  assert.match(prepared.plan.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(restored.prepare('SELECT * FROM retention_holds ORDER BY id').all(),expected);
  const intent=[...files.keys()].find(n=>n.endsWith('.intent')),file=files.get(intent),header=verifyDriveRecordHeader({key,folderId,fileId:file.id,name:intent},file.properties);assert.equal(header.sequence>=1,true);assert.equal((await custody.readLatestCommitHead()).sequence,28);
  const proof=file.properties.wybpCommitProof;file.properties.wybpCommitProof='f'.repeat(64);await assert.rejects(discoverLatestAuthority({...options,id:'synthetic_invalid_commit'}));file.properties.wybpCommitProof=proof;
  const unknown=createOperationId(at),e={operationId:unknown,sequence:29,previousHash:decryptRecord(files.get(discovered.boundary.name).bytes,key,discovered.boundary.name).head,statements:[{sql:'UPDATE quiz_attempts SET id=id WHERE id=?1',params:['missing']}],createdAt:at,expiresAt:at+2592000000};e.intentHash=recoveryHash(Buffer.from(JSON.stringify(e.statements)));await custody.put(unknown+'.intent',encryptRecord(e,key,unknown+'.intent'));
  await assert.rejects(discoverLatestAuthority({...options,id:'synthetic_uncommitted_tail'}));assert.equal(restored.prepare('SELECT COUNT(*) n FROM retention_restore').get().n,0);
 }finally{if(!closed)c.database.close();stage.close();journal.close();restored.close();key.fill(0);}
});
