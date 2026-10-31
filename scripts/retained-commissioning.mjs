// Explicit isolated commissioning only. Importing this module performs no I/O.
// Provider authentication, encrypted journal storage and effect receipts are
// supplied by the operator; this module never reads a credential or signs a grant.
import {createHash} from 'node:crypto';
import {verifyRetainedGrant,retainedCustodyEvidence,retainedHash,retainedVector,retainedZero,RETAINED_PRIOR_USAGE,RETAINED_CAPS,RETAINED_GAUGES,RETAINED_ACCOUNT} from '../worker/retainedBenchmarkPolicy.mjs';
import {assertRetainedHeadroom} from './retained-headroom.mjs';
import {verifyRetainedRelease,materializeRetainedRelease} from './retained-release.mjs';
import {connectRetainedOperator} from './retained-operator-connection.mjs';
import {retainedHostedSession} from './retained-hosted-session.mjs';
import {prepareRetainedFixtureSession} from './retained-fixture-session.mjs';
import {retainedFullRecovery} from './retained-full-recovery.mjs';
const fail=()=>{throw Error('retained_commissioning_reconciliation_required');};
const digest=v=>createHash('sha256').update(v).digest('hex'),sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const folder=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{10,160}$/.test(v)&&v!=='1-fO04arPlwSpuWQ7T2--yzTS5pHEXyxr';
const closed=Object.freeze({WYBP_PUBLIC_ACCESS_ENABLED:'false',WYBP_LIVE_WEBHOOK_ENABLED:'false',WYBP_OPERATIONS_ENABLED:'false',WYBP_RETAINED_BENCHMARK_ENABLED:'false'});
export function assertHostedRetainedFixture(fixture){
 if(fixture?.synthetic!==true||fixture.hostedUseApproved!==true||fixture.notForHostedUse!==false||fixture.syntheticContractKeyId==='public-local-fixture-07'||!sha(fixture.keyFingerprint)||!sha(fixture.artifactSha256)||fixture.completed!==495000||fixture.physicalAnswers!==5940000||fixture.wallets!==550000||fixture.purchaseContracts!==15000)fail();
}
const defaults={verifyRelease:verifyRetainedRelease,materialize:materializeRetainedRelease,connect:connectRetainedOperator,session:retainedHostedSession,fixture:prepareRetainedFixtureSession,recover:retainedFullRecovery};
export async function retainedCommissioningController({releaseDirectory,envelope,approvalKey,preflight,currentHeadroom=preflight,readJournal,writeJournal,provider,controlUpper,now=Date.now,fault=async()=>{},operations=defaults}){
 const grant=verifyRetainedGrant(envelope,approvalKey,now()),grantHash=retainedHash(grant),release=await operations.verifyRelease(releaseDirectory);
 assertRetainedHeadroom(currentHeadroom,now());assertHostedRetainedFixture(preflight?.fixture);
 if(release.manifest.sourceCommitted!==true||release.manifest.sourceRevision!==grant.sourceRevision||preflight?.ownerApproved!==true||preflight.account!==RETAINED_ACCOUNT||preflight.businessContractVerified!==true||!retainedCustodyEvidence(preflight,grant)||preflight.inventoryComplete!==true||preflight.completeInventory!==true||preflight.noAutomaticTopups!==true||preflight.carryoverReconciled!==true||preflight.unknownPriorCharges!==false||retainedHash(preflight)!==grant.preflightEvidenceSha256||!sha(preflight.migrationPlanSha256)||!Number.isSafeInteger(preflight.observedAt)||preflight.observedAt>now()||typeof readJournal!=='function'||typeof writeJournal!=='function'||typeof provider?.perform!=='function')fail();
 const reserved=retainedVector(preflight.commissioningReserved),upper=retainedVector(controlUpper);
 if(upper.external<1||upper.transferBytes<1||Object.keys(RETAINED_CAPS).some(k=>grant.carried[k]>Math.floor(RETAINED_CAPS[k]*.8)))fail();
 // All local control effects, INCLUDING their unknown outcomes and resource
 // cleanup, are prepaid in the signed carried vector. Hosted initialization
 // cannot forget them; proven-unused reservation is deliberately not refunded.
 for(const k of Object.keys(RETAINED_CAPS))if(RETAINED_GAUGES.includes(k)?grant.carried[k]<Math.max(RETAINED_PRIOR_USAGE[k],reserved[k]):grant.carried[k]<RETAINED_PRIOR_USAGE[k]+reserved[k])fail();
 let state=await readJournal(),connection,session;
 if(state===null){state={version:1,grantHash,deadline:grant.endsAt,releaseId:release.manifest.releaseId,used:retainedZero(),resources:{},effects:{},pending:null,stage:'provision',prepared:null,setup:null};await writeJournal(structuredClone(state));}
 if(state?.version!==1||state.grantHash!==grantHash||state.deadline!==grant.endsAt||state.releaseId!==release.manifest.releaseId||!state.resources||!state.effects)fail();retainedVector(state.used);if(Object.keys(RETAINED_CAPS).some(k=>state.used[k]>reserved[k]))fail();
 const save=()=>writeJournal(structuredClone(state)),active=()=>{if(now()>=grant.endsAt)fail();};
 const outcomeValid=(outcome,request)=>{
  if(outcome?.billingKnown!==true||!Object.hasOwn(outcome,'value')||outcome.operationId!==request.operationId||outcome.requestSha256!==retainedHash(request)||!sha(outcome.receiptSha256)||outcome.receiptSha256!==retainedHash({operationId:outcome.operationId,requestSha256:outcome.requestSha256,value:outcome.value,usage:outcome.usage}))fail();
  retainedVector(outcome.usage);if(Object.keys(RETAINED_CAPS).some(k=>outcome.usage[k]>upper[k]))fail();
 };
 const effect=async(id,args)=>{
  active();const request={...args,operationId:'retained_control_'+grant.id.slice(9)+'_'+id},identity=retainedHash(request),prior=state.effects[id];
  if(prior){if(prior.identity!==identity)fail();return structuredClone(prior.value);}
  if(state.pending){if(state.pending.identity!==identity||!state.pending.outcome)fail();outcomeValid(state.pending.outcome,request);state.effects[id]={identity,value:state.pending.outcome.value,receiptSha256:state.pending.outcome.receiptSha256};state.pending=null;await save();return structuredClone(state.effects[id].value);}
  const used={...state.used};for(const k of Object.keys(RETAINED_CAPS)){used[k]=RETAINED_GAUGES.includes(k)?Math.max(used[k],upper[k]):used[k]+upper[k];if(used[k]>reserved[k])fail();}
  state.used=used;state.pending={id,identity,request,upper};await save();await fault('intent-before-effect',id);
  const outcome=await provider.perform(request);await fault('reply-before-journal',id);outcomeValid(outcome,request);state.pending.outcome=outcome;await save();await fault('receipt-before-settlement',id);
  state.effects[id]={identity,value:outcome.value,receiptSha256:outcome.receiptSha256};state.pending=null;await save();return structuredClone(outcome.value);
 };
 const named=[{key:'source',kind:'d1',name:'wybp-capacity-d1-r002'},{key:'mirror',kind:'d1',name:'wybp-capacity-recovery-d1-r002'},{key:'root',kind:'drive-folder',name:'wybp-retained-'+grant.id},...Array.from({length:16},(_,i)=>({key:'shard'+i,kind:'drive-folder',name:'shard-'+String(i).padStart(2,'0')})),{key:'worker',kind:'worker',name:'wybp-capacity-worker-r002'}];
 const validateResource=(spec,value)=>{
  if(!value||Object.keys(value).sort().join()!=='id,kind,name,parentId,private'||value.kind!==spec.kind||value.name!==spec.name||value.private!==true||value.parentId!==(spec.key.startsWith('shard')?state.resources.root.id:null))fail();
  if(spec.kind==='d1'&&(!uuid(value.id)||['a5b2b409-ed08-48c9-ac1d-36699fc6c4b9','1a268b28-e6d5-4431-8f84-a886df9369f1'].includes(value.id))||spec.kind==='drive-folder'&&!folder(value.id)||spec.kind==='worker'&&value.id!==spec.name)fail();
  if(Object.entries(state.resources).some(([key,v])=>key!==spec.key&&v.id===value.id))fail();
 };
 const resources=()=>({account:RETAINED_ACCOUNT,inventoryComplete:true,journalled:true,sourceId:state.resources.source?.id,mirrorId:state.resources.mirror?.id});
 const folders=()=>[state.resources.root.id,...Array.from({length:16},(_,i)=>state.resources['shard'+i].id)];
 const checkRemote=async()=>{const r=await session.readback();if(r.grantSha256!==grantHash||r.deadlineAt!==grant.endsAt||r.resourceIdentity?.sourceId!==state.resources.source.id||r.resourceIdentity?.mirrorId!==state.resources.mirror.id||r.pending||r.stopped&&r.phase!=='cleanup')fail();retainedVector(r.used);if(Object.keys(RETAINED_CAPS).some(k=>r.used[k]<grant.carried[k]))fail();return r;};
 return {
  async provision(){
   if(state.stage!=='provision')return structuredClone(state.resources);
   for(const spec of named){
    if(state.resources[spec.key]){validateResource(spec,state.resources[spec.key]);continue;}
    const parentId=spec.key.startsWith('shard')?state.resources.root.id:null,scope={kind:spec.kind,name:spec.name,parentId,private:true};
    const inventory=await effect('inventory_'+spec.key,{action:'inventory',scope});if(inventory?.complete!==true||!Array.isArray(inventory.resources)||inventory.resources.length)fail();
    const value=await effect('create_'+spec.key,{action:'create',scope});validateResource(spec,value);state.resources[spec.key]=value;await save();
   }
   state.stage='configure';await save();return structuredClone(state.resources);
  },
  async configure(destination){
   if(state.stage!=='configure')fail();
   let materialized=state.materialized;
   if(!materialized){const result=await operations.materialize(releaseDirectory,destination,resources());materialized={directory:destination,releaseId:result.releaseId};state.materialized=materialized;await save();}
   if(materialized.directory!==destination)fail();
   const verified=await operations.verifyRelease(destination);if(verified.manifest.releaseId!==materialized.releaseId||verified.config.vars.WYBP_BENCHMARK_DATABASE_ID!==state.resources.source.id||verified.config.vars.WYBP_MIRROR_DATABASE_ID!==state.resources.mirror.id||Object.keys(closed).some(k=>verified.config.vars[k]!==closed[k])||verified.config.triggers||verified.config.routes)fail();
   const migrated=await effect('migrations',{action:'migrate-isolated',resources:resources(),migrationPlanSha256:preflight.migrationPlanSha256});if(migrated?.verified!==true||migrated.migrationPlanSha256!==preflight.migrationPlanSha256)fail();
   const deployed=await effect('deploy',{action:'deploy-closed',resources:resources(),releaseId:materialized.releaseId,flags:closed,folderIds:folders()});if(deployed?.releaseId!==materialized.releaseId||deployed.publicAccess!==false||deployed.livePayments!==false||deployed.webhook!==false||deployed.cron!==false)fail();
   state.stage='inactive';await save();return {releaseId:materialized.releaseId,grantInstalled:false};
  },
  async installApprovedGrant(headroom){
   if(!['inactive','installed'].includes(state.stage))fail();assertRetainedHeadroom(headroom,now());
   const installed=await effect('install_grant',{action:'install-approved-grant',grantSha256:grantHash,releaseId:state.materialized.releaseId,flags:{...closed,WYBP_RETAINED_BENCHMARK_ENABLED:'true'}});
   if(installed?.grantSha256!==grantHash||installed.deadlineAt!==grant.endsAt||installed.publicAccess!==false||installed.webhook!==false||installed.cron!==false)fail();state.stage='installed';await save();return {grantInstalled:true,deadlineAt:grant.endsAt};
  },
  async open({key,directory,headroom}){
   if(!['installed','fixture','ready','measure','recovery','cleanup'].includes(state.stage)||!Buffer.isBuffer(key)||key.length!==32||key.equals(Buffer.alloc(32,7))||digest(key)!==preflight.fixture.keyFingerprint)fail();assertRetainedHeadroom(headroom,now());
   connection=await operations.connect({releaseDirectory:state.materialized.directory,envelope,approvalKey,preflight,currentHeadroom:headroom,now});
   try{session=await operations.session({directory,releaseDirectory:state.materialized.directory,envelope,approvalKey,key,preflight,currentHeadroom:headroom,operator:connection.operator,now});await checkRemote();}catch(error){await connection.dispose();connection=null;session=null;throw error;}
   if(state.stage==='recovery'){if(state.recoveryTargetPrepared!==true)fail();await session.mark('recovery-incident');state.recoverySessionOpened=true;await save();}
   return {connected:true,deadlineAt:grant.endsAt};
  },
  async prepareFixture({sourceDatabase,key,directory,upper:rpcUpper}){
   if(!session||!['installed','fixture'].includes(state.stage)||digest(key)!==preflight.fixture.keyFingerprint)fail();assertHostedRetainedFixture(preflight.fixture);retainedVector(rpcUpper);await session.reconcile();await checkRemote();
   if(!state.prepared){state.prepared=await operations.fixture({session,sourceDatabase,key,folders:folders(),upper:rpcUpper,directory,now});state.stage='fixture';await save();}
   const p=state.prepared,job='recovery_retained_fixture';
   await session.loop({kind:'source-import',plan:p.plan,boundary:p.boundary,job},rpcUpper,{done:'imported',maxSteps:40000});
   await session.loop({kind:'source-verify',plan:p.plan,boundary:p.boundary,job},rpcUpper,{done:'verified',maxSteps:40000});
   const verification=await session.loop({kind:'verify-boundary',boundary:p.boundary,verificationRound:'commissioning-source-finalize'},rpcUpper,{done:'verified',maxSteps:100000});
   const source=(await session.call({kind:'source-finalize',plan:p.plan,boundary:p.boundary,verification,job},rpcUpper)).value;if(source?.verified!==true||!sha(source.receipt))fail();
   await session.loop({kind:'mirror-import',plan:p.plan,boundary:p.boundary,job},rpcUpper,{done:'imported',maxSteps:40000});
   await session.loop({kind:'mirror-verify',plan:p.plan,boundary:p.boundary,job},rpcUpper,{done:'verified',maxSteps:40000});
   const mirrorVerification=await session.loop({kind:'verify-boundary',boundary:p.boundary,verificationRound:'commissioning-mirror-initialise'},rpcUpper,{done:'verified',maxSteps:100000});
   const mirror=(await session.call({kind:'mirror-initialise',plan:p.plan,boundary:p.boundary,verification:mirrorVerification,job},rpcUpper)).value;if(mirror?.initialised!==true)fail();
   const enabled=await effect('source_receipt',{action:'install-isolated-source-receipt',receipt:source.receipt,resources:resources(),flags:{...closed,WYBP_RETAINED_BENCHMARK_ENABLED:'true'}});if(enabled?.receipt!==source.receipt||enabled.publicAccess!==false||enabled.webhook!==false||enabled.cron!==false)fail();
   state.setup={sourceReceipt:source.receipt,boundary:p.boundary};state.stage='ready';await save();return {fullStockImported:true,mirrorVerified:true,applicationRoutesVerified:false};
  },
  async startDay({routeEvidence,startsAt,assets,imageRequests,upper:rpcUpper}){
   if(!session||state.stage!=='ready'||routeEvidence?.verified!==true||!sha(routeEvidence.receiptSha256))fail();active();await checkRemote();
   await connection.operator.phase('measure',{receiptSha256:routeEvidence.receiptSha256,fullStockVerified:true,mirrorVerified:true,applicationRoutesVerified:true,measureStartsAt:startsAt});
   await session.workload({startsAt,assets,imageRequests,upper:rpcUpper});state.stage='measure';state.measureStartsAt=startsAt;await save();return {scheduled:true,measuredCompletions:0};
  },
  async prepareRecoveryTarget({capacityEvidence,destination}){
   if(!session||!['measure','recovery'].includes(state.stage)||capacityEvidence?.verified!==true||!sha(capacityEvidence.receiptSha256)||now()<state.measureStartsAt+24*3600000)fail();
   if(state.stage==='measure'){const remote=await checkRemote();if(remote.phase==='measure')await connection.operator.phase('recovery',{capacityVerified:true,receiptSha256:capacityEvidence.receiptSha256});else if(remote.phase!=='recovery'||!Number.isSafeInteger(remote.recoveryAt)||remote.recoveryAt<state.measureStartsAt+24*3600000)fail();state.stage='recovery';await save();}
   await checkRemote();state.originalMirror||=structuredClone(state.resources.mirror);await save();
   const removed=await effect('remove_old_mirror',{action:'delete',scope:state.originalMirror});if(removed?.absent!==true||removed.id!==state.originalMirror.id)fail();
   const scope={kind:'d1',name:'wybp-capacity-recovery-d1-r002',parentId:null,private:true},replacement=await effect('replace_mirror',{action:'create',scope});validateResource(named[1],replacement);if(replacement.id===state.originalMirror.id)fail();state.resources.mirror=replacement;await save();
   if(!state.recoveryMaterialized){const result=await operations.materialize(releaseDirectory,destination,resources());state.recoveryMaterialized={directory:destination,releaseId:result.releaseId};await save();}if(state.recoveryMaterialized.directory!==destination)fail();
   const migrated=await effect('recovery_migrations',{action:'migrate-isolated-mirror',resources:resources(),migrationPlanSha256:preflight.migrationPlanSha256});if(migrated?.verified!==true||migrated.migrationPlanSha256!==preflight.migrationPlanSha256||migrated.businessRows!==0)fail();
   const rebound=await effect('recovery_deploy',{action:'deploy-recovery-target',resources:resources(),releaseId:state.recoveryMaterialized.releaseId,grantSha256:grantHash,flags:{...closed,WYBP_RETAINED_BENCHMARK_ENABLED:'true'},folderIds:folders()});
   if(rebound?.releaseId!==state.recoveryMaterialized.releaseId||rebound.grantSha256!==grantHash||rebound.mirrorId!==replacement.id||rebound.publicAccess!==false||rebound.webhook!==false||rebound.cron!==false)fail();
   await connection.dispose();connection=null;session=null;state.materialized=state.recoveryMaterialized;state.recoveryTargetPrepared=true;state.recoverySessionOpened=false;await save();return {mirrorReplaced:true,reconnectRequired:true,deadlineAt:grant.endsAt};
  },
  async recover({key,directory,upper:rpcUpper}){
   if(!session||state.stage!=='recovery'||state.recoveryTargetPrepared!==true||state.recoverySessionOpened!==true)fail();await checkRemote();return operations.recover({session,key,folders:folders(),snapshot:state.setup.boundary,directory,upper:rpcUpper,now});
  },
  async beginCleanup(){
   if(!session)fail();await connection.operator.phase('cleanup',{});state.stage='cleanup';await save();return {cleanupOnly:true};
  },
  async cleanupFolders(upperBound){
   if(!session||state.stage!=='cleanup')fail();retainedVector(upperBound);
   for(let i=1;i<17;i++)await session.loop({kind:'cleanup-batch',folder:i},upperBound,{done:'complete',maxSteps:100000});
   await session.loop({kind:'cleanup-batch',folder:0},upperBound,{done:'complete',maxSteps:100000});state.filesRemoved=true;await save();return {filesRemoved:true,resourceDeletionStillRequired:true};
  },
  async cleanupResources(){
   if(state.stage!=='cleanup'||state.filesRemoved!==true)fail();await connection?.dispose();connection=null;session=null;
   for(const spec of [...named.filter(v=>v.key.startsWith('shard')),named.find(v=>v.key==='root'),...named.filter(v=>['source','mirror','worker'].includes(v.key))]){
    const resource=state.resources[spec.key];validateResource(spec,resource);const removed=await effect('cleanup_'+spec.key,{action:'delete',scope:resource});if(removed?.absent!==true||removed.id!==resource.id||spec.key==='worker'&&removed.recorderRemoved!==true)fail();
   }
   state.stage='closed';await save();return {syntheticResourcesRemoved:true,financialDataTouched:false};
  },
  async dispose(){await connection?.dispose();connection=null;session=null;},
  status:()=>({stage:state.stage,grantSha256:state.grantHash,deadlineAt:state.deadline,pending:state.pending?{id:state.pending.id,unknown:!state.pending.outcome}:null,controlReserved:structuredClone(state.used),resources:structuredClone(state.resources)})
 };
}
