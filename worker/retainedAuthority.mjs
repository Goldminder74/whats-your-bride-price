import {WorkerEntrypoint} from 'cloudflare:workers';
import {installedRetainedGrant,retainedHash} from './retainedBenchmarkPolicy.mjs';
import {retainedMeter} from './retainedBenchmarkMeter.mjs';
import {createAuthorityService,d1AuthorityAdapter,purgeThroughAuthority} from './authorityService.mjs';
import {createJournaledDatabase} from './authorityDatabase.mjs';
import {D1DriveIndex} from '../scripts/d1-drive-index.mjs';
import {DriveCustody} from '../scripts/drive-custody.mjs';
import {PartitionedDriveCustody} from '../scripts/partitioned-drive-custody.mjs';
import {driveAccessToken} from './driveOAuth.mjs';
import {assertRestoreReceipt,operatorRetentionPlan} from '../db/retention.ts';
import {confirmationDraft,PurchaseConfirmations} from '../db/purchaseConfirmations.mjs';
import {initialiseRecoveryMirror,replayRecoveryMirrorStep,acknowledgeMirrorSnapshotStep} from './recoveryMirror.mjs';
import {advanceRecoveryMirrorSnapshot} from './recoveryMirrorCapture.mjs';
import {verifyAuthorityBoundaryStep} from './boundedAuthority.mjs';
import {importMirrorRestore,verifyMirrorRestoreStep,importRetainedSourceRestore,verifyRetainedSourceRestoreStep} from '../scripts/streamed-d1-restore.mjs';
import {finalizeMirrorAuthorityRestore,finalizeRetainedSourceAuthorityRestore} from '../scripts/finalize-authority-restore.mjs';
import {createOperationId} from '../scripts/authority-runtime.mjs';
import {encryptRecord,decryptRecord,recoveryHash} from '../scripts/recovery-crypto.mjs';
import {verifyDriveRecordHeader} from '../scripts/drive-record-header.mjs';
import {parseSellerDetails} from '../app/sellerDetails.ts';
import {recoveryWindowCustody} from '../scripts/windowed-drive-audit.mjs';
import {retainedFixtureUpload} from './retainedFixtureUpload.mjs';
import {cleanupRetainedBatch} from './retainedCleanup.mjs';
const fail=()=>{throw Error('retained_operation_unavailable');};
export function retainedRuntime(env,parent,upper,{recovery=false}={}){
 const grant=installedRetainedGrant(env);if(!/^[a-f0-9]{64}$/.test(parent||''))fail();
 const coordinator=env.RETAINED_COORDINATOR?.getByName(grant.id);if(!coordinator)fail();
 const key=Buffer.from(env.WYBP_BENCHMARK_KEY_BASE64||'','base64');if(key.length!==32||key.toString('base64')!==env.WYBP_BENCHMARK_KEY_BASE64)fail();
 const meter=retainedMeter(upper,{provider:async(input,init)=>{
  const r=await coordinator.dispatch(parent,String(input),{...init,headers:Object.fromEntries(new Headers(init.headers)),body:init.body instanceof URLSearchParams?init.body.toString():init.body});
  return {...r,response:new Response(r.body?.byteLength?r.body:null,{status:r.status,headers:r.headers})};
 }});meter.add('workerCpuMs',100);meter.add('internal',1);
 // Recovery intentionally does not even construct a source database adapter.
 const binding=recovery?null:meter.database(env.DB),db=binding?d1AuthorityAdapter(binding):null;
 const mirrorBinding=env.MIRROR_DB?meter.database(env.MIRROR_DB,{mirror:true}):null,mirror=mirrorBinding?d1AuthorityAdapter(mirrorBinding):null,indexDb=recovery?mirror:db;if(!indexDb)fail();
 let folders;try{folders=JSON.parse(env.WYBP_DRIVE_SHARD_FOLDER_IDS);}catch{fail();}
 if(!Array.isArray(folders)||folders.length!==16||new Set([env.WYBP_DRIVE_FOLDER_ID,...folders]).size!==17||[env.WYBP_DRIVE_FOLDER_ID,...folders].some(v=>typeof v!=='string'||!/^[a-zA-Z0-9_-]{10,160}$/.test(v))||env.WYBP_DRIVE_FOLDER_ID==='1-fO04arPlwSpuWQ7T2--yzTS5pHEXyxr')fail();
 const accessToken=driveAccessToken({clientId:env.WYBP_DRIVE_CLIENT_ID,clientSecret:env.WYBP_DRIVE_CLIENT_SECRET,refreshToken:env.WYBP_DRIVE_REFRESH_TOKEN,fetcher:meter.fetcher}),make=folderId=>new DriveCustody({folderId,index:new D1DriveIndex(indexDb,folderId),accessToken,fetcher:meter.fetcher,pageSize:10,recordKey:key});
 const root=make(env.WYBP_DRIVE_FOLDER_ID),custody=new PartitionedDriveCustody(root,folders.map(make),{async verifyFolder(id,parentId){const r=await root.request('https://www.googleapis.com/drive/v3/files/'+id+'?fields=id,parents,mimeType,trashed');if(!r.ok)fail();const v=await r.json();return v.id===id&&!v.trashed&&v.mimeType==='application/vnd.google-apps.folder'&&v.parents?.includes(parentId)===true;}});
 if(recovery)recoveryWindowCustody(custody,key);
 const service=recovery?null:createAuthorityService({db,custody,key,snapshot:async()=>{throw Error('source_monolithic_capture_forbidden');},alert:async()=>{},expectedRestoreReceipt:env.WYBP_RESTORE_RECEIPT_SHA256||null,recoveryReady:()=>assertRestoreReceipt(binding,env.WYBP_RESTORE_RECEIPT_SHA256)});
 return {grant,coordinator,key,meter,binding,db,mirrorBinding,mirror,custody,service,identity:{role:'recovery-mirror',name:env.WYBP_MIRROR_DATABASE_NAME,id:env.WYBP_MIRROR_DATABASE_ID},resource:{name:env.WYBP_BENCHMARK_DATABASE_NAME,id:env.WYBP_BENCHMARK_DATABASE_ID,account:env.CLOUDFLARE_ACCOUNT_ID}};
}
export class RetainedAuthority extends WorkerEntrypoint {
 async invoke(parent,upper,method,args){
  const r=retainedRuntime(this.env,parent,upper);
  try{
   let value;const allowed=['query','admit','transact','readFence','ready'];
   if(!Array.isArray(args)||args.length>8)fail();
   if(method==='publicSellerDetails'){value=parseSellerDetails(this.env.WYBP_PUBLIC_SELLER_DETAILS_JSON);if(value?.geographicalAddress!=='Synthetic seller address only')fail();}
   else if(allowed.includes(method)){if(typeof r.service[method]!=='function')fail();value=await r.service[method](...args);}
   else{
    const db=createJournaledDatabase(r.binding,r.service),store=new PurchaseConfirmations(db,r.key);await r.service.ready();
    if(method==='preparePurchaseConfirmation')value=confirmationDraft(args[0],r.key);
    else if(method==='checkPendingPurchaseConfirmation')value=await store.pendingMatches(...args);
    else if(method==='purchaseConfirmation')value=await store.owned(...args);
    else if(method==='recordPurchasePayment')value=await store.recordPayment(...args,Date.now());
    else if(method==='cancelPurchaseConfirmation')value=await store.cancelForOrder(args[0],Date.now());
    else if(method==='deliverPurchaseConfirmation'){
     await store.owned(args[0],args[1]);await store.ready(args[0],Date.now());
     if(!this.env.RETAINED_CONFIRMATION_MAIL?.send)fail();
     value=await store.deliver(args[0],payload=>this.env.RETAINED_CONFIRMATION_MAIL.send(payload));
    }else fail();
   }
   return {value,usage:r.meter.receipt(),sizes:r.meter.sizes(),timing:r.meter.timing(),billingKnown:true};
  }catch{r.meter.markUnknown();return {failed:true,usage:r.meter.observed(),billingKnown:false};}
 }
 fetch(){return new Response(null,{status:404});}
}
export class RetainedOperator extends WorkerEntrypoint {
 async step(command,upper){
  const env=this.env,grant=installedRetainedGrant(env),coordinator=env.RETAINED_COORDINATOR.getByName(grant.id),parent=retainedHash(command.id),identity=retainedHash(command);
  if(typeof command.id!=='string'||!/^retained_[a-zA-Z0-9_.-]{1,140}$/.test(command.id))fail();const cleanup=['cleanup-page','cleanup-delete','cleanup-batch'].includes(command.kind);
  const admission=await coordinator.reserve(parent,identity,upper,{cleanup,...(command.cleanupEscrow?{escrow:command.cleanupEscrow}:{})});if(!admission.execute){const cached=await coordinator.operatorResponse(parent);if(admission.state!=='settled'||!cached)fail();const envelope=JSON.parse(cached.body);if(envelope.bulkPut===true){if(!['custody-put','recovery-put','custody-put-batch'].includes(command.kind)||envelope.receipt!==cached.receipt)fail();return {value:command.kind==='custody-put-batch'?{objects:command.files.map(f=>({name:f.name,sha256:recoveryHash(Buffer.from(f.ciphertext,'base64'))}))}:{sha256:recoveryHash(Buffer.from(command.ciphertext,'base64'))},usage:cached.usage,receiptSha256:cached.receipt,billingKnown:true,replay:true};}if(!envelope.encrypted)return {execute:false,rereadRequired:true,receiptSha256:envelope.receipt};return decryptRecord(Buffer.from(envelope.encrypted,'base64'),Buffer.from(env.WYBP_BENCHMARK_KEY_BASE64,'base64'),'retained-op:'+parent);}
  const recovery=command.kind.startsWith('recovery-'),r=retainedRuntime(env,parent,upper,{recovery:recovery||cleanup});
  try{
   // Conservatively meter the authenticated remote-binding control ingress as
   // one additional request/invocation. Alarm-to-self RPC has no such ingress.
   if(command.controllerIngress===true){r.meter.add('external',1);r.meter.add('workerCpuMs',100);}else if(command.controllerIngress!==undefined)fail();
   const phase=await coordinator.phase(),options={identity:r.identity,resource:r.resource,job:command.job,maxPages:25,now:Date.now(),boundarySha256:command.boundary?.sha256,snapshotSha256:command.snapshotSha256};let value;
   if(cleanup&&phase!=='cleanup'||!cleanup&&(recovery&&phase!=='recovery'||!recovery&&phase==='recovery'))fail();
   if(cleanup){
    const folder=r.custody.all[command.folder];if(!folder)fail();await r.custody.check(folder);
    if(command.kind==='cleanup-page')value=await folder.auditPage({cursor:command.cursor||null,pageSize:25});
    else if(command.kind==='cleanup-batch'){
     value=await cleanupRetainedBatch({folder,folderIndex:command.folder,folders:r.custody.all,key:r.key});
    }else{
     if(!/^[a-zA-Z0-9_-]{10,160}$/.test(command.fileId||''))fail();
     const response=await folder.request('https://www.googleapis.com/drive/v3/files/'+command.fileId+'?fields=id,name,mimeType,parents,trashed,appProperties');
     if(response.status===404)value={deleted:true,alreadyAbsent:true};else{
      if(!response.ok)fail();const file=await response.json();
      if(file.id!==command.fileId||file.name!==command.name||file.trashed||!file.parents?.includes(folder.folderId)||!verifyDriveRecordHeader({key:r.key,folderId:folder.folderId,fileId:file.id,name:file.name},file.appProperties))fail();
      const deleted=await folder.request('https://www.googleapis.com/drive/v3/files/'+file.id,{method:'DELETE'});if(!deleted.ok&&deleted.status!==404)fail();value={deleted:true};
     }
    }
   }else if(command.kind==='custody-bootstrap'){
    if(phase!=='setup'||!/^op_\d{13}_[a-f0-9]{32}\.intent$/.test(command.name||''))fail();const bytes=await r.custody.get(command.name);if(!bytes||recoveryHash(bytes)!==command.sha256)fail();const event=decryptRecord(bytes,r.key,command.name);if(event.operationId+'.intent'!==command.name||event.sequence!==1||event.previousHash!=='0'.repeat(64)||JSON.stringify(event.statements)!==JSON.stringify([{sql:'UPDATE quiz_attempts SET id=id WHERE id=?1',params:['retained_attempt_0']}]))fail();const rows=await r.db.query("SELECT sequence,head_hash FROM operational_recovery_checkpoints WHERE id='journal'");if(rows.length&&(rows[0].sequence!==1||rows[0].head_hash!==command.sha256))fail();value=await r.custody.publishCommitHead(event,command.sha256,{sequence:1,head_hash:command.sha256});
   }else if(command.kind==='recovery-head'||command.kind==='custody-head')value=await r.custody.readLatestCommitHead();
   else if(['recovery-index-count','custody-index-count'].includes(command.kind)){const folder=r.custody.all[command.folder];if(!folder)fail();value=await folder.index.activeCount(command.at);}
   else if(command.kind==='recovery-index-page'){
    const folder=r.custody.all[command.folder];if(!folder)fail();await r.custody.check(folder);let cursor=command.cursor||null,count=0,page;for(let i=0;i<2;i++){page=await folder.auditPage({cursor,pageSize:25});count+=page.files.length;
    for(const file of page.files){if(file.mimeType==='application/vnd.google-apps.folder'){if(command.folder!==0||!r.custody.all.slice(1).some(c=>c.folderId===file.id))fail();continue;}
     const header=verifyDriveRecordHeader({key:r.key,folderId:folder.folderId,fileId:file.id,name:file.name},file.appProperties);if(!header||header.createdAt>Date.now())fail();if(header.expiresAt>Date.now())await folder.index.recoverReserve(file.name,file.id,header);
    }cursor=page.cursor;if(cursor===null)break;}value={cursor,complete:cursor===null,count,runtimeAccess:'blocked'};
   }
   else if(command.kind==='source-import'){if(phase!=='setup')fail();value=await importRetainedSourceRestore(r.db,r.custody,r.key,command.plan,options);}
   else if(command.kind==='source-verify'){if(phase!=='setup')fail();value=await verifyRetainedSourceRestoreStep(r.db,r.custody,r.key,command.plan,options);}
   else if(command.kind==='source-finalize'){if(phase!=='setup')fail();value=await finalizeRetainedSourceAuthorityRestore(r.db,r.custody,r.key,command.plan,command.boundary,command.verification,options);}
   else if(command.kind==='mirror-import'){if(phase!=='setup')fail();value=await importMirrorRestore(r.mirror,r.custody,r.key,command.plan,options);}
   else if(command.kind==='mirror-verify'){if(phase!=='setup')fail();value=await verifyMirrorRestoreStep(r.mirror,r.custody,r.key,command.plan,options);}
   else if(command.kind==='mirror-initialise'){if(phase!=='setup')fail();value=await initialiseRecoveryMirror(r.mirror,r.custody,r.key,command.plan,command.boundary,command.verification,{identity:r.identity,job:command.job});}
   else if(command.kind==='mirror-replay')value=await replayRecoveryMirrorStep(r.db,r.mirror,r.custody,r.key,{identity:r.identity});
   else if(command.kind==='mirror-capture')value=await advanceRecoveryMirrorSnapshot(r.mirror,r.custody,r.key,command.captureId,{identity:r.identity});
   else if(command.kind==='mirror-ack')value=await acknowledgeMirrorSnapshotStep(r.db,r.custody,r.key,command.boundary);
   else if(command.kind==='verify-boundary'||command.kind==='recovery-boundary'){if(!recovery)recoveryWindowCustody(r.custody,r.key);let progress=command.progress||null;for(let i=0;i<5;i++){value=await verifyAuthorityBoundaryStep(recovery?r.mirror:r.db,r.custody,r.key,command.boundary,progress);progress=value.progress;if(value.verified)break;}}
   else if(command.kind==='recovery-import')value=await importMirrorRestore(r.mirror,r.custody,r.key,command.plan,options);
   else if(command.kind==='recovery-verify')value=await verifyMirrorRestoreStep(r.mirror,r.custody,r.key,command.plan,options);
   else if(command.kind==='recovery-finalize')value=await finalizeMirrorAuthorityRestore(r.mirror,r.custody,r.key,command.plan,command.boundary,command.verification,options);
   else if(command.kind==='purge')value=await purgeThroughAuthority(r.binding,r.service,command.at,100);
   else if(command.kind==='retention-action')value=await r.service.transact(createOperationId(Date.now()),operatorRetentionPlan(command.action,Date.now()));
   else if(command.kind==='custody-reserve'){
    if(phase!=='setup'||!Array.isArray(command.files)||command.files.some(f=>!/^(retained_[a-zA-Z0-9_.-]{1,140}|op_\d{13}_[a-f0-9]{32}\.intent)$/.test(f.name||'')))fail();
    const groups=new Map();for(const f of command.files){const folder=await r.custody.existing(f.name),values=groups.get(folder)||[];values.push(f);groups.set(folder,values);}if(command.files.length>25)fail();
    value={reserved:[]};for(const [folder,files]of groups)value.reserved.push(...await folder.reserveFiles(files));
   }else if(command.kind==='custody-put-batch')value=await retainedFixtureUpload({custody:r.custody,key:r.key,phase},command.files);
   else if(command.kind==='custody-put'||command.kind==='recovery-put'){
    if(!/^(retained_[a-zA-Z0-9_.-]{1,140}|op_\d{13}_[a-f0-9]{32}\.intent)$/.test(command.name||''))fail();const bytes=Buffer.from(command.ciphertext||'','base64');if(bytes.length>3500000)fail();decryptRecord(bytes,r.key,command.name);value={sha256:await (await r.custody.existing(command.name)).put(command.name,bytes,command.clocks,{createOnly:phase==='setup'})};
   }else if(command.kind==='custody-get'||command.kind==='recovery-get'){const bytes=await r.custody.get(command.name);value={ciphertext:bytes?Buffer.from(bytes).toString('base64'):null};}
   else if(command.kind==='custody-list-window'||command.kind==='recovery-list-window'){
    const folder=r.custody.all[command.folder];if(!Number.isInteger(command.folder)||!folder)fail();await r.custody.check(folder);const page=await folder.auditWindow({cursor:command.cursor||null});value={...page,complete:page.cursor===null};
   }
   else if(command.kind==='custody-list-page'||command.kind==='recovery-list-page'){
    const folder=r.custody.all[command.folder],pageSize=command.pageSize??25;if(!folder||![10,25].includes(pageSize))fail();await r.custody.check(folder);const page=await folder.auditPage({cursor:command.cursor||null,pageSize});value={...page,complete:page.cursor===null};
   }else fail();
   r.meter.add('transferBytes',Buffer.byteLength(JSON.stringify(value)));const usage=r.meter.receipt(),receipt=retainedHash({value,usage}),outcome={value,usage,timing:r.meter.timing(),receiptSha256:receipt,billingKnown:true},packed=JSON.stringify(outcome),cache=['custody-put','recovery-put','custody-put-batch'].includes(command.kind)?{bulkPut:true,receipt}:/-list-(?:window|page)$/.test(command.kind)?{receipt,immutableReadOnly:true}:packed.length<70000?{encrypted:encryptRecord(outcome,r.key,'retained-op:'+parent).toString('base64'),receipt}:{receipt,immutableReadOnly:command.kind.endsWith('-get')};
   if(packed.length>=70000&&!command.kind.endsWith('-get'))fail();await coordinator.settle(parent,identity,usage,receipt,JSON.stringify(cache),null,r.meter.sizes());return outcome;
  }catch{await coordinator.stop();return {failed:true,reservationRetained:true,billingKnown:false};}
 }
 async acceptJob(definition,controllerIngress=false){const g=installedRetainedGrant(this.env);return this.env.RETAINED_COORDINATOR.getByName(g.id).acceptJob(definition,controllerIngress);}
 async dayPlan(definition,controllerIngress=false){const g=installedRetainedGrant(this.env);return this.env.RETAINED_COORDINATOR.getByName(g.id).dayPlan(definition,controllerIngress);}
 async jobStatus(id,controllerIngress=false){const g=installedRetainedGrant(this.env);return this.env.RETAINED_COORDINATOR.getByName(g.id).jobStatus(id,controllerIngress);}
 async phase(phase,proof,controllerIngress=false){const g=installedRetainedGrant(this.env);return this.env.RETAINED_COORDINATOR.getByName(g.id).transition(phase,proof,controllerIngress);}
 async readback(controllerIngress=false){const g=installedRetainedGrant(this.env),state=await this.env.RETAINED_COORDINATOR.getByName(g.id).readback(controllerIngress);return {...state,resourceIdentity:{sourceId:this.env.WYBP_BENCHMARK_DATABASE_ID,mirrorId:this.env.WYBP_MIRROR_DATABASE_ID}};}
 fetch(){return new Response(null,{status:404});}
}
