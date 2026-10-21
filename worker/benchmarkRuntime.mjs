import {createAuthorityService,d1AuthorityAdapter} from './authorityService.mjs';
import {D1DriveIndex} from '../scripts/d1-drive-index.mjs';
import {DriveCustody} from '../scripts/drive-custody.mjs';
import {PartitionedDriveCustody} from '../scripts/partitioned-drive-custody.mjs';
import {driveAccessToken} from './driveOAuth.mjs';
import {benchmarkMeter} from './benchmarkMeter.mjs';
import {benchmarkGameService} from './benchmarkGameService.mjs';
import {benchmarkRetentionService} from './benchmarkRetentionService.mjs';
import {D1WriterFence} from './d1WriterFence.mjs';
import {authoritySnapshot} from './authoritySnapshot.mjs';
import {segmentedSnapshot} from './segmentedSnapshot.mjs';
import {D1Authority} from '../scripts/authority-runtime.mjs';
import {boundedCommissionStep} from './boundedCommission.mjs';
import {boundedSnapshotStep} from './boundedSnapshot.mjs';
import {recoveryHash,decryptRecord} from '../scripts/recovery-crypto.mjs';
import {importStreamedRestore,verifyStreamedRestoreStep,auditStreamedSourceStep,clearAuditedSyntheticTarget} from '../scripts/streamed-d1-restore.mjs';
import {recoverPinnedInventory,readPinnedInventoryFile} from '../scripts/segmented-drive-inventory.mjs';
import {assertBenchmarkResource,BENCHMARK_PHASES} from '../scripts/approved-benchmark-budget.mjs';
import {assertRestoreReceipt} from '../db/retention.ts';
import {D1QuestionSelectionRepository} from '../db/questionSelection.ts';
import {genericShareProjection,isSafeShareProjection} from '../app/shareProjection.ts';
import {buildShareCopy} from '../app/shareCopy.ts';
import {cleanupBenchmarkDrive} from '../scripts/benchmark-drive-cleanup.mjs';
import {sharedBenchmarkRequest} from './benchmarkPacingBridge.mjs';
import {validatePublicAppOrigin} from '../app/publicAppOrigin.ts';
const fail=()=>{throw Error('benchmark_runtime_unavailable');};
export const BENCHMARK_ORIGIN='https://wybp-capacity-private-r002.netlify.app';
export function benchmarkConfiguration(env,{requireFolders=true}={}){
 const resource={name:env.WYBP_BENCHMARK_DATABASE_NAME,id:env.WYBP_BENCHMARK_DATABASE_ID,account:env.CLOUDFLARE_ACCOUNT_ID};assertBenchmarkResource('database',resource);
 if(env.WYBP_AUTHORITY_ROLE!=='benchmark-ops'||env.WYBP_WORKER_NAME!=='wybp-capacity-worker-r002'||env.PUBLIC_APP_ORIGIN!==BENCHMARK_ORIGIN||!BENCHMARK_PHASES[env.WYBP_BENCHMARK_PHASE]||!/^synthetic_[a-zA-Z0-9_-]{1,48}$/.test(env.WYBP_BENCHMARK_RUN_ID||'')||!/^[a-f0-9]{64}$/.test(env.WYBP_BENCHMARK_SOURCE_SHA256||''))fail();
 if(Object.entries(env).some(([k,v])=>((k.startsWith('WYBP_FEATURE_')||['WYBP_OPERATIONS_ENABLED','WYBP_TEST_WEBHOOK_ENABLED','WYBP_TEST_RETENTION_ENABLED','WYBP_HOSTED_REHEARSAL_ENABLED'].includes(k))&&v==='true')||k.startsWith('WYBP_REVIEW_')&&v&&v!=='false'))fail();
 const key=Buffer.from(env.WYBP_BENCHMARK_KEY_BASE64||'','base64');
 if(key.length!==32||key.toString('base64')!==env.WYBP_BENCHMARK_KEY_BASE64)throw Error('benchmark_synthetic_key_required');
 if(![env.WYBP_DRIVE_CLIENT_ID,env.WYBP_DRIVE_CLIENT_SECRET,env.WYBP_DRIVE_REFRESH_TOKEN].every(v=>typeof v==='string'&&v.length>8))throw Error('benchmark_drive_credentials_required');
 let folders=[];if(requireFolders){try{folders=JSON.parse(env.WYBP_DRIVE_SHARD_FOLDER_IDS);}catch{fail();}
 if(!Array.isArray(folders)||folders.length!==16||new Set([env.WYBP_DRIVE_FOLDER_ID,...folders]).size!==17)fail();}
 return {resource,key,folders,phase:env.WYBP_BENCHMARK_PHASE,runId:env.WYBP_BENCHMARK_RUN_ID};
}
export async function provisionBenchmarkFolders(env,upper,{now=Date.now,pause,request}={}){
 const config=benchmarkConfiguration(env,{requireFolders:false});let meter;
 const paced=async(...args)=>(sharedBenchmarkRequest(env,meter)||request||fetch)(...args);
 meter=benchmarkMeter({phase:config.phase,upper,now,pause,request:paced});
 const accessToken=driveAccessToken({clientId:env.WYBP_DRIVE_CLIENT_ID,clientSecret:env.WYBP_DRIVE_CLIENT_SECRET,refreshToken:env.WYBP_DRIVE_REFRESH_TOKEN,fetcher:meter.fetcher,now});
 const parent='1-fO04arPlwSpuWQ7T2--yzTS5pHEXyxr';
 async function call(url,init={}){const token=await accessToken();const response=await meter.fetcher(url,{...init,headers:{...init.headers,Authorization:'Bearer '+token}});if(!response.ok)fail();return response.json();}
 try{
  const metadata=await call('https://www.googleapis.com/drive/v3/files/'+parent+'?fields=id,mimeType,trashed,permissions(type,role)');
  if(metadata.id!==parent||metadata.trashed||metadata.mimeType!=='application/vnd.google-apps.folder'||metadata.permissions?.length!==1||metadata.permissions[0].type!=='user'||metadata.permissions[0].role!=='owner')fail();
  const about=await call('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress),storageQuota');
  if(about.user?.emailAddress!=='ayo.m.ayeni@gmail.com'||!/^\d+$/.test(about.storageQuota?.limit||'')||!/^\d+$/.test(about.storageQuota?.usage||'')||BigInt(about.storageQuota.limit)-BigInt(about.storageQuota.usage)<250000000n)fail();
  async function folder(name,parentId){
   const query=new URLSearchParams({q:"'"+parentId+"' in parents and trashed=false and name='"+name+"'",fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,appProperties)',pageSize:'2'});
   const prior=await call('https://www.googleapis.com/drive/v3/files?'+query);
   if(prior.nextPageToken||prior.incompleteSearch||!Array.isArray(prior.files)||prior.files.length>1)fail();
   if(prior.files.length){const f=prior.files[0];if(f.mimeType!=='application/vnd.google-apps.folder'||f.appProperties?.wybpBenchmarkRun!==config.runId)fail();return f.id;}
   meter.add('driveObjects',1);
   const created=await call('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,parents:[parentId],mimeType:'application/vnd.google-apps.folder',appProperties:{wybpBenchmarkRun:config.runId}})});
   if(!/^[a-zA-Z0-9_-]{10,160}$/.test(created.id||''))fail();return created.id;
  }
  const root=await folder('wybp-capacity-r002-'+config.runId,parent),folders=[];
  for(let i=0;i<16;i++)folders.push(await folder('partition_'+String(i).padStart(2,'0'),root));
  const result={root,folders,privateParentVerified:true};return {result,usage:meter.receipt(),billingKnown:true,receiptSha256:recoveryHash(Buffer.from(JSON.stringify(result)))};
 }catch{return {result:{failed:true,code:'benchmark_drive_provisioning_unavailable'},usage:meter.observed(),billingKnown:meter.billingKnown(),receiptSha256:recoveryHash(Buffer.from('benchmark_drive_provisioning_unavailable'))};}
}
export function benchmarkRuntime(env,upper,{now=Date.now,pause,request}={}){
 const config=benchmarkConfiguration(env);let meter;
 const paced=async(...args)=>(sharedBenchmarkRequest(env,meter)||request||fetch)(...args);
 meter=benchmarkMeter({phase:config.phase,upper,now,pause,request:paced});
 const binding=meter.database(env.DB),db=d1AuthorityAdapter(binding);
 const accessToken=driveAccessToken({clientId:env.WYBP_DRIVE_CLIENT_ID,clientSecret:env.WYBP_DRIVE_CLIENT_SECRET,refreshToken:env.WYBP_DRIVE_REFRESH_TOKEN,fetcher:meter.fetcher,now});
 const make=folderId=>new DriveCustody({folderId,index:new D1DriveIndex(db,folderId,{now}),accessToken,fetcher:meter.fetcher,pageSize:10});
 const root=make(env.WYBP_DRIVE_FOLDER_ID),children=config.folders.map(make);
 const custody=new PartitionedDriveCustody(root,children,{async verifyFolder(id,parent){const response=await root.request('https://www.googleapis.com/drive/v3/files/'+id+'?fields=id,parents,mimeType,trashed');if(!response.ok)fail();const value=await response.json();return value.id===id&&!value.trashed&&value.mimeType==='application/vnd.google-apps.folder'&&value.parents?.includes(parent)===true;}});
 const service=createAuthorityService({db,custody,key:config.key,now,alert:async()=>{},snapshot:head=>authoritySnapshot(db,custody,config.key)(head),recoveryReady:()=>assertRestoreReceipt(binding,env.WYBP_RESTORE_RECEIPT_SHA256)});
 const invoke=async(method,args)=>{
  if(!['transact','readFence','flush','ready'].includes(method))fail();
  meter.add('internal',1);
  if(env.BENCHMARK_AUTHORITY){
   const remaining=Object.fromEntries(Object.entries(upper).map(([k,v])=>[k,k==='storageBytes'?v:v-meter.observed()[k]]));
   let result;const began=now();try{result=await env.BENCHMARK_AUTHORITY.invoke(method,args,remaining);}catch{meter.markUncertain();fail();}finally{meter.authorityTime(Math.max(0,now()-began));}
   if(result?.billingKnown!==true||!result.usage){meter.markUncertain();fail();}meter.merge(result.usage);if(result.timing)meter.mergeTiming(result.timing);
   if(result.failed)fail();return result.value;
  }
  // Only local compiled fixtures may omit the binding; hosted readiness below
  // requires it, so single-instance execution cannot masquerade as a hosted test.
  if(env.WYBP_BENCHMARK_LOCAL_FIXTURE!=='true')fail();return service[method](...args);
 };
 const authority={transact:(...args)=>invoke('transact',args),readFence:(...args)=>invoke('readFence',args)};
 const origin=validatePublicAppOrigin(BENCHMARK_ORIGIN,'test',undefined,{environment:'test',origin:BENCHMARK_ORIGIN});
 const game=benchmarkGameService({binding,authority,syntheticKey:config.key,databaseResource:config.resource,runId:config.runId,now,
  async verifyAssets(region){
   if(!env.ASSETS?.fetch)fail();
   const slug={west:'west-africa',east:'east-africa',central:'central-africa',north:'north-africa',south:'southern-africa'}[region];if(!slug)fail();
   for(const path of ['/regions/'+slug+'.webp','/avatars/adjoa-v2.webp','/quiz-art/'+region+'-0.webp','/quiz-art/'+region+'-7.webp']){
    meter.add('internal',1);const response=await env.ASSETS.fetch(new Request(BENCHMARK_ORIGIN+path));
    if(!response.ok||!(await response.arrayBuffer()).byteLength)fail();
   }return true;
  },
  async verifySharing(region){const projection=genericShareProjection('result',region,origin),copy=buildShareCopy(projection);return isSafeShareProjection(projection,origin)&&projection.displayName===null&&copy.completeText.includes(BENCHMARK_ORIGIN)&&copy.completeText.length<=700;},
 });
 async function inventory(){
  await service.ready();if(!env.BENCHMARK_AUTHORITY||env.WYBP_BENCHMARK_LOCAL_FIXTURE==='true')fail();
  const repository=new D1QuestionSelectionRepository(binding),eligiblePerRegion=[];
  for(const region of ['west','east','central','north','south'])eligiblePerRegion.push((await repository.getCandidates(region,now())).length);
  if(eligiblePerRegion.some(n=>n!==30))fail();
  return {syntheticOnly:true,commerce:false,webhook:false,cron:false,cpuLimitMs:100,partitionCount:16,eligiblePerRegion,sourceSha256:env.WYBP_BENCHMARK_SOURCE_SHA256};
 }
 async function captureStep(id,previous){
  if(!/^synthetic_[a-zA-Z0-9_-]{1,65}$/.test(id))fail();
  const writer=new D1WriterFence(db,{now});await writer.ready();
  const head=await new D1Authority(db,custody,config.key,{now}).freeze(id);
  await writer.ready();
  const result=await segmentedSnapshot(db,custody,config.key,{pageSize:50,pagesPerStep:5,now})(head,previous);
  await writer.ready();return result;
 }
 async function run(command){
  let result;
  try{
   if(command?.kind==='commission-step')result=await boundedCommissionStep(db,custody,config.key,command.progress||null,{now});
   else if(['fixture-step','fixture','purge','arrivals'].includes(command?.kind)){
    if(config.phase!=='C')fail();
    result=await benchmarkRetentionService({binding,db,authority,key:config.key,resource:config.resource,now}).execute(command);
   }
   else if(command?.kind==='inventory')result=await inventory();
   else if(command?.kind==='capture')result=await captureStep(command.captureId||command.id,command.previous||null);
   else if(command?.kind==='capture-bounded'){
    const writer=new D1WriterFence(db,{now});await writer.ready();const head=await new D1Authority(db,custody,config.key,{now}).freeze(command.captureId||command.id);
    const captured=await boundedSnapshotStep(db,custody,config.key,head,command.progress||null,{now});await writer.ready();result={...captured,pointer:captured.snapshot};
   }
   else if(command?.kind==='inspect-fence'){
    const head=await new D1Authority(db,custody,config.key,{now}).head();if(head?.state!=='exporting'||head.expires_at<=now())fail();
    result={fenceSha256:recoveryHash(Buffer.from(JSON.stringify(head))),expiresAt:head.expires_at};
   }
   else if(command?.kind==='inventory-info'){
    const head=await new D1Authority(db,custody,config.key,{now}).head();if(head?.state!=='exporting'||head.expires_at<=now())fail();
    let count=0;for(const c of custody.all){
     const expired=(await db.query('SELECT COUNT(*) n FROM operational_recovery_checkpoints WHERE id>=?1 AND id<?2 AND expires_at<=?3',[c.index.prefix,c.index.prefix+'~',now()]))[0]?.n;if(expired!==0)fail();
     count+=(await db.query('SELECT COUNT(*) n FROM operational_recovery_checkpoints WHERE id>=?1 AND id<?2',[c.index.prefix,c.index.prefix+'~']))[0]?.n;
    }result={count,folders:custody.all.map(c=>c.folderId),fenceSha256:recoveryHash(Buffer.from(JSON.stringify(head)))};
   }
   else if(command?.kind==='inventory-page'){
    const head=await new D1Authority(db,custody,config.key,{now}).head();if(head?.state!=='exporting'||head.expires_at<=now())fail();
    if(!/^synthetic_[a-zA-Z0-9_-]{1,65}$/.test(command.inventoryId||''))fail();
    const c=custody.all.find(c=>c.folderId===command.folderId);if(!c)fail();await custody.check(c);
    if(command.cursor!==undefined&&(typeof command.cursor!=='string'||command.cursor.length>8192))fail();
    const query=new URLSearchParams({q:"'"+c.folderId+"' in parents and trashed=false and appProperties has { key='wybpRecovery' and value='1' } and not name contains '"+command.inventoryId+".inventory.'",fields:'nextPageToken,incompleteSearch,files(id,name)',pageSize:'10',orderBy:'name'});if(command.cursor)query.set('pageToken',command.cursor);
    const response=await c.request('https://www.googleapis.com/drive/v3/files?'+query);if(!response.ok)fail();const value=await response.json();
    if(value.incompleteSearch||!Array.isArray(value.files)||value.files.length>10||(value.nextPageToken!==undefined&&typeof value.nextPageToken!=='string'))fail();
    const files=[];for(const file of value.files){if(await c.index.get(file.name)!==file.id)fail();const bytes=await c.get(file.name),clocks=await c.index.recoveryRecord(file.name);if(!bytes||!clocks||clocks.expiresAt<=now())fail();files.push({...file,folderId:c.folderId,sha256:recoveryHash(bytes),...clocks});}
    result={files,cursor:value.nextPageToken||null};
   }
   else if(command?.kind==='root-put'){
    if(!/^synthetic_[a-zA-Z0-9_-]{1,65}\.inventory\.(?:root|segment\d+)\.enc$/.test(command.name||'')||typeof command.ciphertext!=='string'||command.ciphertext.length>5600000)fail();
    const bytes=Buffer.from(command.ciphertext,'base64');if(bytes.toString('base64')!==command.ciphertext)fail();decryptRecord(bytes,config.key,command.name);
    const sha256=await root.put(command.name,bytes,command.retention);result={sha256,id:await root.index.get(command.name),...await root.index.recoveryRecord(command.name)};
   }
   else if(command?.kind==='root-get'){
    if(!/^synthetic_[a-zA-Z0-9_.-]+\.inventory\.(?:root|segment\d+)\.enc$/.test(command.name||''))fail();const bytes=await root.get(command.name);result={ciphertext:bytes?Buffer.from(bytes).toString('base64'):null};
   }
   else if(command?.kind==='simulate-index-loss'){
    if(!/^synthetic_[a-zA-Z0-9_-]{1,60}$/.test(command.job||''))fail();
    const prior=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[command.job]))[0];
    if(prior){if(prior.kind!=='restore'||prior.manifest_hash!==command.pointer?.sha256||prior.state!=='complete'||prior.expires_at<=now()||(await db.query('SELECT COUNT(*) n FROM retention_restore'))[0]?.n!==0)fail();return {result:{mappingsRemoved:prior.sequence,replayed:true,runtimeAccess:'blocked'},usage:meter.receipt(),billingKnown:true,receiptSha256:recoveryHash(Buffer.from(JSON.stringify({mappingsRemoved:prior.sequence,replayed:true,runtimeAccess:'blocked'})))};}
    const head=await new D1Authority(db,custody,config.key,{now}).head();if(head?.state!=='exporting'||head.expires_at<=now())fail();
    const inventory=await readPinnedInventoryFile(custody.all,config.key,command.pointer,now());
    const expected=inventory.count+inventory.segments.length+1;let count=0;
    for(const c of custody.all)count+=(await db.query('SELECT COUNT(*) n FROM operational_recovery_checkpoints WHERE id>=?1 AND id<?2',[c.index.prefix,c.index.prefix+'~']))[0]?.n;
    if(count!==expected)fail();
    await db.batch([{sql:'DELETE FROM retention_restore',params:[]},...custody.all.map(c=>({sql:'DELETE FROM operational_recovery_checkpoints WHERE id>=?1 AND id<?2',params:[c.index.prefix,c.index.prefix+'~']})),{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,?3,?2,?3,'complete',1,?4,?5)",params:[command.job,command.pointer.sha256,count,command.pointer.createdAt,command.pointer.expiresAt]}]);result={mappingsRemoved:count,runtimeAccess:'blocked'};
   }
   else if(command?.kind==='recover-index')result=await recoverPinnedInventory({db,custodies:custody.all,key:config.key,pointer:command.pointer,resource:config.resource,job:command.job,maxFiles:5,now:now()});
   else if(command?.kind==='flush'){
    const delivered=await service.flush(command.id,25);
    const proof=(await db.query("SELECT id,manifest_hash FROM operational_recovery_checkpoints WHERE kind='custody' AND id>='journal-chunk_' AND id<'journal-chunk_~' AND sequence=?1 AND expires_at>?2 ORDER BY id LIMIT 1",[delivered.sequence,now()]))[0];
    if(!proof)fail();const bytes=await custody.get(proof.id);if(!bytes||recoveryHash(bytes)!==proof.manifest_hash)fail();
    const chunk=decryptRecord(bytes,config.key,proof.id);if(chunk.sequence!==delivered.sequence||!Array.isArray(chunk.events)||chunk.events.length<1||chunk.events.length>25)fail();
    result={...delivered,chainVerified:true,durableReadback:true,remainingBacklog:delivered.pending};
   }
   else if(command?.kind==='custody-get'){
    if(!/^(synthetic_[a-zA-Z0-9_.-]+|op_\d{13}_[a-f0-9]{32}\.(?:intent|event|abort)|journal-chunk_\d+_\d+\.enc)$/.test(command.name||''))fail();
    const bytes=await custody.get(command.name);result={ciphertext:bytes?Buffer.from(bytes).toString('base64'):null};
   }
   else if(command?.kind==='custody-put'){
    if(!/^synthetic_[a-zA-Z0-9_.-]+\.enc$/.test(command.name||'')||typeof command.ciphertext!=='string'||command.ciphertext.length>5600000)fail();
    const bytes=Buffer.from(command.ciphertext,'base64');if(bytes.toString('base64')!==command.ciphertext)fail();decryptRecord(bytes,config.key,command.name);
    result={sha256:await custody.put(command.name,bytes,command.retention)};
   }
   else if(command?.kind==='restore-audit')result=await auditStreamedSourceStep(db,custody,config.key,command.pointer,{resource:config.resource,job:command.job,maxPages:5,now:now(),assertFrozen:async()=>{const head=await new D1Authority(db,custody,config.key,{now}).head();if(head?.state!=='exporting'||head.expires_at<=now())fail();return recoveryHash(Buffer.from(JSON.stringify(head)));}});
   else if(command?.kind==='restore-clear')result=await clearAuditedSyntheticTarget(db,custody,config.key,command.pointer,{resource:config.resource,job:command.job,now:now(),assertFrozen:async()=>{const head=await new D1Authority(db,custody,config.key,{now}).head();if(head?.state!=='exporting'||head.expires_at<=now())fail();return recoveryHash(Buffer.from(JSON.stringify(head)));}});
   else if(command?.kind==='restore-import')result=await importStreamedRestore(db,custody,config.key,command.pointer,{resource:config.resource,job:command.job,maxPages:5,now:now()});
   else if(command?.kind==='restore-verify')result=await verifyStreamedRestoreStep(db,custody,config.key,command.pointer,{job:command.job,maxPages:5,now:now()});
   else if(['start','answer','recover','complete','result'].includes(command?.kind))result=await game.execute(command);
   else fail();
   return {result,usage:meter.receipt(),timing:meter.timing(),billingKnown:true,receiptSha256:recoveryHash(Buffer.from(JSON.stringify(result)))};
  }catch(error){const code=error.message==='drive_oauth_refresh'&&['invalid_grant','invalid_client','unauthorized_client','invalid_scope'].includes(error.cause)?'benchmark_drive_'+error.cause:'benchmark_operation_unavailable';return {result:{failed:true,code},usage:meter.observed(),billingKnown:meter.billingKnown(),receiptSha256:recoveryHash(Buffer.from(code))};}
 }
 async function cleanup(stopped){
  await service.ready();
  const result=await cleanupBenchmarkDrive({root:env.WYBP_DRIVE_FOLDER_ID,folders:config.folders,runId:config.runId,stopped,
   request:(...args)=>root.request(...args),indexLookup:(folder,name)=>custody.all.find(c=>c.folderId===folder)?.index.get(name)});
  return {result,usage:meter.receipt(),billingKnown:true};
 }
 return {run,service,meter,config,custody,db,cleanup};
}
