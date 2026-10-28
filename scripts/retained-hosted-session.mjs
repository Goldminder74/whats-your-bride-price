// Private synthetic controller only. Importing this module cannot create a
// resource, load credentials, deploy, install a grant or start a measurement.
import {readFile,writeFile,mkdir,rename,realpath} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {verifyRetainedRelease} from './retained-release.mjs';
import {verifyRetainedGrant,retainedCustodyEvidence,retainedHash,retainedVector,RETAINED_ACCOUNT} from '../worker/retainedBenchmarkPolicy.mjs';
import {encryptRecord,decryptRecord} from './recovery-crypto.mjs';
import {assertRetainedHeadroom} from './retained-headroom.mjs';
const fail=()=>{throw Error('retained_session_requires_reconciliation');};
export async function retainedHostedSession({directory,releaseDirectory,envelope,approvalKey,key,preflight,currentHeadroom=preflight,operator,now=Date.now,fault=async()=>{}}){
 const grant=verifyRetainedGrant(envelope,approvalKey,now()),release=await verifyRetainedRelease(releaseDirectory);
 assertRetainedHeadroom(currentHeadroom,now());
 if(!Buffer.isBuffer(key)||key.length!==32||release.manifest.sourceCommitted!==true||release.manifest.sourceRevision!==grant.sourceRevision||preflight?.account!==RETAINED_ACCOUNT||preflight.ownerApproved!==true||preflight.businessContractVerified!==true||!retainedCustodyEvidence(preflight,grant)||preflight.completeInventory!==true||preflight.unknownPriorCharges!==false||preflight.noAutomaticTopups!==true||preflight.carryoverReconciled!==true||retainedHash(preflight)!==grant.preflightEvidenceSha256||!Number.isSafeInteger(preflight.observedAt)||preflight.observedAt>now()||typeof operator?.step!=='function'||typeof operator?.readback!=='function')fail();
 // Synthetic recovery may use a fresh temporary local workspace. Never place
 // a future customer's plaintext recovery database in this OneDrive checkout.
 const temporary=await realpath(tmpdir()),root=resolve(directory);if(!root.startsWith(temporary+sep))fail();await mkdir(root,{recursive:true});if(!(await realpath(root)).startsWith(temporary+sep))fail();
 const path=join(root,'retained-session.enc'),aad='retained-session:'+grant.id;
 let state;try{state=decryptRecord(await readFile(path),key,aad);}catch(e){if(e.code!=='ENOENT')fail();const server=await operator.readback();if(server.stopped||server.pending||!['setup','recovery'].includes(server.phase)||server.resourceIdentity?.sourceId!==release.config.vars.WYBP_BENCHMARK_DATABASE_ID||server.resourceIdentity?.mirrorId!==release.config.vars.WYBP_MIRROR_DATABASE_ID)fail();if(server.phase==='recovery'&&(!Number.isSafeInteger(server.recoveryAt)||server.recoveryAt>now()))fail();state={version:1,grantSha256:retainedHash(grant),releaseId:release.manifest.releaseId,deadline:grant.endsAt,next:0,pending:null,namespace:server.phase==='recovery'?'recovery_'+server.resourceIdentity.mirrorId.replaceAll('-',''):'setup',recoveryAt:server.recoveryAt||null};}
 if(state.version!==1||state.grantSha256!==retainedHash(grant)||state.releaseId!==release.manifest.releaseId||state.deadline!==grant.endsAt)fail();
 const save=async()=>{const staging=path+'.writing';await writeFile(staging,encryptRecord(state,key,aad),{flag:'w',mode:0o600});await rename(staging,path);};
 await save();
 const call=async(command,upper,scope,readRetry=0)=>{
  retainedVector(upper);if(now()>=grant.endsAt||state.next>=2000000||!command||Object.hasOwn(command,'id'))fail();
  const identity=retainedHash({command,upper});if(state.pending&&state.pending.identity!==identity)fail();
  if(!state.pending){state.pending={identity,command,upper,id:'retained_'+grant.id.slice(9)+'_'+state.namespace+'_'+state.next++,scope:scope||null};await save();}
  // An exact private retry retrieves the existing receipt; the Worker never
  // repeats pending/unknown work. A changed command cannot replace it.
  const result=await operator.step({...command,id:state.pending.id},upper);await fault('reply-before-checkpoint');
  if(result?.rereadRequired===true&&(command.kind.endsWith('-get')||/-list-(?:window|page)$/.test(command.kind))&&/^[a-f0-9]{64}$/.test(result.receiptSha256||'')&&readRetry<2){const savedScope=state.pending.scope;state.pending=null;state.lastReceipt=result.receiptSha256;await save();return call(command,upper,savedScope,readRetry+1);}
  if(result?.billingKnown!==true||result.failed||result.rereadRequired||!Object.hasOwn(result,'value')||!/^[a-f0-9]{64}$/.test(result.receiptSha256||''))fail();
  scope=state.pending.scope;state.pending=null;state.lastReceipt=result.receiptSha256;if(scope?.uploadCount){state.uploadCursor=(state.uploadCursor||0)+scope.uploadCount;}else if(scope){state.loops||={};state.loops[scope]=result.value;}await save();return result;
 };
 return {
  call,
  async reconcile(){if(state.pending)return call(state.pending.command,state.pending.upper,state.pending.scope);return {pending:false};},
  async loop(command,upper,{done='complete',maxSteps=20000}={}){
   if(!['complete','imported','verified','caughtUp'].includes(done)||!Number.isSafeInteger(maxSteps)||maxSteps<1||maxSteps>100000)fail();const scope=retainedHash({command,done});let value=state.loops?.[scope];if(value?.[done]===true)return value;
   for(let i=0;i<maxSteps;i++){value=(await call({...command,...(value?.progress?{progress:value.progress}:{}),...(value?.cursor?{cursor:value.cursor}:{})},upper,scope)).value;if(value?.[done]===true)return value;}
   fail();
  },
  async upload(records,bundleSha256,upper){
   if(bundleSha256!==preflight.artifactSha256||!/^[a-f0-9]{64}$/.test(bundleSha256)||state.uploadBundle&&state.uploadBundle!==bundleSha256)fail();state.uploadBundle=bundleSha256;await save();
   let index=0,batch=[],size=0,shard=-1,last=null;
   const flush=async()=>{if(!batch.length)return;const value=(await call({kind:'custody-put-batch',files:batch},upper,{uploadCount:batch.length})).value;if(value.objects?.length!==batch.length)fail();batch=[];size=0;};
   for await(const file of records){const part=parseInt(createHash('sha256').update(file.name).digest('hex').slice(0,2),16)%16,order=part.toString().padStart(2,'0')+':'+file.name;if(last!==null&&order<=last)fail();last=order;index++;if(index<=(state.uploadCursor||0))continue;const bytes=Buffer.byteLength(JSON.stringify(file));if(bytes>3000000)fail();if(batch.length&&(part!==shard||batch.length===25||size+bytes>3000000))await flush();shard=part;batch.push(file);size+=bytes;}
   await flush();return {uploaded:state.uploadCursor||0,bundleSha256};
  },
  async pressure({objects=1200000,upper}){
   if(objects!==preflight.pressureObjects||!Number.isInteger(objects)||objects<16||objects>1200000||objects%16)fail();retainedVector(upper);const status=await operator.readback();if(status.phase!=='setup'||status.stopped||status.pending)fail();const ids=[];
   for(let shard=0;shard<16;shard++){const id=retainedHash([grant.id,'pressure',shard]),count=objects/16;await operator.acceptJob({id,flow:'pressure',shard,count,paddingBytes:4500,due:now()+10000,upper,maxSteps:Math.ceil(count/25)*2});ids.push(id);}
   return {accepted:true,ids,requestedObjects:objects,qualification:'Generated encrypted inventory/storage pressure, not historical financial receipts or30 distinct full snapshots. Original generated clocks are persisted before upload.'};
  },
  async workload({startsAt,upper,assets,imageRequests}){
   if(!Array.isArray(assets)||assets.length!==12||assets.some(p=>!release.manifest.files['client'+p])||!Array.isArray(imageRequests)||imageRequests.length!==5||imageRequests.some(v=>!v?.questionStableId||!Array.isArray(v.selectedOptionIds)))fail();retainedVector(upper);
   const readback=await operator.readback();if(readback.phase!=='measure'||readback.measureAt!==startsAt||readback.pending||readback.stopped)fail();
   // These bounded streams are separate from completions and historical stock.
   // They use the compiled application, not a success counter or direct SQL.
   const traffic=async(group,path,value,count,ordinal)=>operator.acceptJob({id:retainedHash([grant.id,group,ordinal]),flow:'traffic',group,path,...(value?{value}:{}),expectedStatus:group==='abuse'?400:200,due:startsAt+ordinal*10,intervalMs:Math.floor(86400000/count),upper,maxSteps:count});
   for(const [i,path]of assets.entries())await traffic('asset',path,undefined,14000,i);
   await traffic('document','/',undefined,3000,12);await traffic('abuse','/questions/resume',{},12000,13);
   for(const [i,v]of imageRequests.entries())await traffic('image','/questions/image-answer',v,4800,14+i);
   await operator.dayPlan({startsAt,completed:5000,peakHour:500,incomplete:2150,recoveries:1000,upper});
   return {accepted:true,completedTarget:5000,incompleteTarget:2150,recoveryTarget:1000,assetRequests:168000,imageJudgements:24000,rejectedAbuseRequests:12000,qualification:'Scheduled targets only. Signed receipts, completion clocks, actual image/asset distribution and external-edge latency must be reviewed before accepting capacity.'};
  },
  async readback(){return operator.readback();},
  async recoveryPlan(value){
   if(!Number.isSafeInteger(state.recoveryAt))fail();
   if(value!==undefined){if(value?.version!==1||value.incidentAt!==state.recoveryAt||!/^[a-f0-9]{64}$/.test(value.initialSnapshotSha256||'')||!/^[a-f0-9]{64}$/.test(value.independentHeadSha256||'')||!/^[a-f0-9]{64}$/.test(value.plan?.sha256||'')||!/^[a-f0-9]{64}$/.test(value.boundary?.sha256||'')||value.accountingVerified!==true||JSON.stringify(value).length>10000||state.recoveryPlan&&retainedHash(state.recoveryPlan)!==retainedHash(value))fail();state.recoveryPlan=structuredClone(value);await save();}
   return state.recoveryPlan?structuredClone(state.recoveryPlan):null;
  },
  async mark(name){if(!['recovery-incident'].includes(name)||!Number.isSafeInteger(state.recoveryAt)||state.recoveryAt>now())fail();state.marks||={};if(!state.marks[name]){state.marks[name]=state.recoveryAt;await save();}if(state.marks[name]!==state.recoveryAt)fail();return state.marks[name];},
  checkpoint:()=>({grantSha256:state.grantSha256,releaseId:state.releaseId,deadline:state.deadline,next:state.next,pending:!!state.pending,lastReceipt:state.lastReceipt||null})
 };
}
