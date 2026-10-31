import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {retainedCommissioningController} from '../../scripts/retained-commissioning.mjs';
import {retainedHash,retainedZero,RETAINED_PRIOR_USAGE,RETAINED_ACCOUNT} from '../../worker/retainedBenchmarkPolicy.mjs';
import {syntheticRetainedGrant,syntheticRetainedKey} from '../helpers/retainedBenchmark.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex'),vector=v=>({...retainedZero(),...v});
function fixture(){
 let at=Date.UTC(2026,9,31),journal=null,creates=0,disposals=0,phase='setup',measureAt=null,recoveryAt=null,serial=1,remoteLower=false;
 const key=Buffer.alloc(32,9),reserved=vector({external:300,transferBytes:300000}),upper=vector({external:2,transferBytes:2000}),carried={...RETAINED_PRIOR_USAGE,external:RETAINED_PRIOR_USAGE.external+reserved.external,transferBytes:RETAINED_PRIOR_USAGE.transferBytes+reserved.transferBytes};
 const preflight={account:RETAINED_ACCOUNT,ownerApproved:true,businessContractVerified:true,businessAccountPaid:true,businessTrial:false,custodyQuoteSha256:'d'.repeat(64),processingContractSha256:'e'.repeat(64),inventoryComplete:true,completeInventory:true,unknownPriorCharges:false,noAutomaticTopups:true,carryoverReconciled:true,observedAt:at,headroomVerified:true,forecastWithinAuthority:true,migrationPlanSha256:'1'.repeat(64),commissioningReserved:reserved,fixture:{synthetic:true,hostedUseApproved:true,notForHostedUse:false,syntheticContractKeyId:'private-synthetic-test',keyFingerprint:hash(key),artifactSha256:'2'.repeat(64),completed:495000,physicalAnswers:5940000,wallets:550000,purchaseContracts:15000}};
 let envelope=syntheticRetainedGrant(at,{preflightEvidenceSha256:retainedHash(preflight),carried});
 const closed={WYBP_PUBLIC_ACCESS_ENABLED:'false',WYBP_LIVE_WEBHOOK_ENABLED:'false',WYBP_OPERATIONS_ENABLED:'false',WYBP_RETAINED_BENCHMARK_ENABLED:'false'},base={manifest:{sourceCommitted:true,sourceRevision:'a'.repeat(40),releaseId:'3'.repeat(64)},config:{vars:{...closed}}},packages=new Map([['base',base]]),calls=[],rpc=[];
 const observed=()=>({phase,measureAt,recoveryAt,grantSha256:retainedHash(envelope.value),deadlineAt:envelope.value.endsAt,pending:0,stopped:phase==='cleanup',used:remoteLower?retainedZero():carried,resourceIdentity:{sourceId:journal.resources.source.id,mirrorId:journal.resources.mirror.id}});
 const provider={perform:async request=>{
  calls.push(structuredClone(request));let value;
  if(request.action==='inventory')value={complete:true,resources:[]};
  else if(request.action==='create'){creates++;const s=request.scope,id=s.kind==='d1'?String(serial++).padStart(8,'0')+'-1111-4111-8111-111111111111':s.kind==='worker'?s.name:'synthetic_private_folder_'+serial++;value={...s,id};}
  else if(request.action.startsWith('migrate-'))value={verified:true,migrationPlanSha256:request.migrationPlanSha256,businessRows:0};
  else if(request.action==='deploy-closed')value={releaseId:request.releaseId,publicAccess:false,livePayments:false,webhook:false,cron:false};
  else if(request.action==='install-approved-grant')value={grantSha256:request.grantSha256,deadlineAt:envelope.value.endsAt,publicAccess:false,webhook:false,cron:false};
  else if(request.action==='install-isolated-source-receipt')value={receipt:request.receipt,publicAccess:false,webhook:false,cron:false};
  else if(request.action==='deploy-recovery-target')value={releaseId:request.releaseId,grantSha256:request.grantSha256,mirrorId:request.resources.mirrorId,publicAccess:false,webhook:false,cron:false};
  else if(request.action==='delete')value={id:request.scope.id,absent:true,...(request.scope.kind==='worker'?{recorderRemoved:true}:{})};else assert.fail(request.action);
  const usage=vector({external:1,transferBytes:100});return {billingKnown:true,operationId:request.operationId,requestSha256:retainedHash(request),value,usage,receiptSha256:retainedHash({operationId:request.operationId,requestSha256:retainedHash(request),value,usage})};
 }};
 const operations={
  verifyRelease:async directory=>structuredClone(packages.get(directory)),
  materialize:async(directory,destination,resources)=>{const next={...structuredClone(base),manifest:{...base.manifest,releaseId:hash(destination)},config:{vars:{...closed,WYBP_BENCHMARK_DATABASE_ID:resources.sourceId,WYBP_MIRROR_DATABASE_ID:resources.mirrorId}}};packages.set(destination,next);return next.manifest;},
  connect:async()=>({operator:{phase:async(next,proof)=>{if(next==='measure'){assert.equal(phase,'setup');phase=next;measureAt=proof.measureStartsAt;}else if(next==='recovery'){assert.equal(phase,'measure');assert.ok(at>=measureAt+86400000);phase=next;recoveryAt=at;}else {assert.equal(next,'cleanup');phase=next;}}},dispose:async()=>{disposals++;}}),
  session:async()=>({readback:async()=>observed(),reconcile:async()=>({pending:false}),mark:async name=>{assert.equal(name,'recovery-incident');assert.equal(phase,'recovery');return recoveryAt;},loop:async(command,bounds,limits)=>{rpc.push({...command,...limits});return {[limits.done]:true,progress:'synthetic complete verification'};},call:async command=>{rpc.push(command);return {value:command.kind==='mirror-initialise'?{initialised:true}:{verified:true,receipt:'4'.repeat(64)}};},workload:async input=>{assert.equal(input.startsAt,measureAt);rpc.push({kind:'workload',...input});}}),
  fixture:async input=>{assert.equal(input.key,key);assert.equal(input.folders.length,17);rpc.push({kind:'fixture'});return {plan:{name:'retained_plan',sha256:'5'.repeat(64)},boundary:{name:'retained_fixture_base.boundary',sha256:'6'.repeat(64)}};},
  recover:async input=>{assert.equal(phase,'recovery');assert.equal(input.folders.length,17);rpc.push({kind:'full-recovery'});return {verified:true,elapsedMs:1000,runtimeAccess:'blocked'};}
 };
 const options=()=>({releaseDirectory:'base',envelope,approvalKey:syntheticRetainedKey,preflight,currentHeadroom:{...preflight,observedAt:at},readJournal:async()=>structuredClone(journal),writeJournal:async value=>{journal=structuredClone(value);},provider,controlUpper:upper,now:()=>at,operations});
 return {options,key,preflight,upper,provider,operations,calls,rpc,read:()=>structuredClone(journal),creates:()=>creates,disposals:()=>disposals,advance:n=>{at+=n;},lowerRemote:()=>{remoteLower=true;},resign:()=>{envelope=syntheticRetainedGrant(at,{preflightEvidenceSha256:retainedHash(preflight),carried});}};
}
async function commissioned(f){const c=await retainedCommissioningController(f.options());await c.provision();await c.configure('configured');await c.installApprovedGrant(f.options().currentHeadroom);await c.open({key:f.key,directory:'controller',headroom:f.options().currentHeadroom});return c;}

test('exact isolated resources, closed deployment, actual helper orchestration and fresh recovery session share original limits',async()=>{
 const f=fixture(),c=await commissioned(f);assert.equal(f.creates(),20);assert.equal(c.status().stage,'installed');assert.equal(f.calls.some(v=>v.scope?.kind==='netlify'),false);assert.equal(f.calls.filter(v=>v.action==='create'&&v.scope.kind==='worker').length,1);
 const setup=await c.prepareFixture({sourceDatabase:{},key:f.key,directory:'synthetic-temp',upper:f.upper});assert.deepEqual(setup,{fullStockImported:true,mirrorVerified:true,applicationRoutesVerified:false});
 const kinds=f.rpc.map(v=>v.kind);assert.deepEqual(kinds,['fixture','source-import','source-verify','verify-boundary','source-finalize','mirror-import','mirror-verify','verify-boundary','mirror-initialise']);assert.equal(f.rpc[7].verificationRound,'commissioning-mirror-initialise');
 const startsAt=f.options().now()+1000;await c.startDay({routeEvidence:{verified:true,receiptSha256:'7'.repeat(64)},startsAt,assets:[],imageRequests:[],upper:f.upper});await assert.rejects(c.recover({key:f.key,directory:'restore-temp',upper:f.upper}));
 f.advance(86401000);const originalDeadline=c.status().deadlineAt,originalMirror=c.status().resources.mirror.id;await c.prepareRecoveryTarget({capacityEvidence:{verified:true,receiptSha256:'8'.repeat(64)},destination:'recovery-config'});assert.equal(f.creates(),21);assert.notEqual(c.status().resources.mirror.id,originalMirror);await assert.rejects(c.recover({key:f.key,directory:'restore-temp',upper:f.upper}));
 await c.open({key:f.key,directory:'fresh-recovery-controller',headroom:f.options().currentHeadroom});assert.deepEqual(await c.recover({key:f.key,directory:'restore-temp',upper:f.upper}),{verified:true,elapsedMs:1000,runtimeAccess:'blocked'});assert.equal(c.status().deadlineAt,originalDeadline);
 await c.beginCleanup();await c.cleanupFolders(f.upper);const cleanup=f.rpc.filter(v=>v.kind==='cleanup-batch');assert.deepEqual(cleanup.map(v=>v.folder),[...Array.from({length:16},(_,i)=>i+1),0]);await c.cleanupResources();assert.equal(c.status().stage,'closed');assert.equal(f.calls.filter(v=>v.action==='delete').length,21);assert.ok(f.disposals()>=2);assert.equal(c.status().pending,null);
});

test('lost create reply keeps its original reservation and refuses another creation or changed grant',async()=>{
 const f=fixture();let crash=true;const c=await retainedCommissioningController({...f.options(),fault:async(point,id)=>{if(crash&&point==='reply-before-journal'&&id==='create_source'){crash=false;throw Error('synthetic lost reply');}}});
 await assert.rejects(c.provision(),/synthetic lost reply/);assert.equal(f.creates(),1);const before=c.status(),resumed=await retainedCommissioningController(f.options());await assert.rejects(resumed.provision(),/reconciliation_required/);assert.equal(f.creates(),1);assert.deepEqual(resumed.status().controlReserved,before.controlReserved);assert.deepEqual(resumed.status().pending,{id:'create_source',unknown:true});f.advance(1);f.resign();await assert.rejects(retainedCommissioningController(f.options()),/reconciliation_required/);
});

test('crash after durable receipt resumes without repeating provider effect or refunding its full upper bound',async()=>{
 const f=fixture();let crash=true;const first=await retainedCommissioningController({...f.options(),fault:async(point,id)=>{if(crash&&point==='receipt-before-settlement'&&id==='create_source'){crash=false;throw Error('synthetic receipt crash');}}});await assert.rejects(first.provision(),/synthetic receipt crash/);const reserved=first.status().controlReserved.external;assert.equal(f.creates(),1);
 const resumed=await retainedCommissioningController(f.options());await resumed.provision();assert.equal(f.creates(),20);assert.equal(f.calls.filter(v=>v.action==='create'&&v.scope.name==='wybp-capacity-d1-r002').length,1);assert.equal(resumed.status().controlReserved.external,reserved+76);
});

test('public/local-only fixtures and missing prepaid commissioning allowance fail before provider effects',async()=>{
 for(const change of [{notForHostedUse:true},{syntheticContractKeyId:'public-local-fixture-07'},{hostedUseApproved:false},{purchaseContracts:0}]){const f=fixture();Object.assign(f.preflight.fixture,change);f.resign();await assert.rejects(retainedCommissioningController(f.options()),/reconciliation_required/);assert.equal(f.calls.length,0);}
 const f=fixture();f.preflight.commissioningReserved.external++;f.resign();await assert.rejects(retainedCommissioningController(f.options()),/reconciliation_required/);assert.equal(f.calls.length,0);
});

test('control bounds, private resource identity, expired authority and remote cumulative accounting fail closed',async()=>{
 const bounded=fixture(),c=await retainedCommissioningController({...bounded.options(),controlUpper:vector({external:301,transferBytes:1})});await assert.rejects(c.provision(),/reconciliation_required/);assert.equal(bounded.calls.length,0);await assert.rejects(retainedCommissioningController({...bounded.options(),controlUpper:retainedZero()}),/reconciliation_required/);
 const unsafe=fixture(),perform=unsafe.provider.perform;unsafe.provider.perform=async request=>{const r=await perform(request);if(request.action==='create'){r.value.private=false;r.receiptSha256=retainedHash({operationId:r.operationId,requestSha256:r.requestSha256,value:r.value,usage:r.usage});}return r;};const rejected=await retainedCommissioningController(unsafe.options());await assert.rejects(rejected.provision(),/reconciliation_required/);assert.equal(unsafe.creates(),1);
 const remote=fixture(),ready=await commissioned(remote);await ready.dispose();const callsBeforeWrongKey=remote.calls.length;for(const key of [Buffer.alloc(32,7),Buffer.alloc(32,8)])await assert.rejects(ready.open({key,directory:'controller',headroom:remote.options().currentHeadroom}),/reconciliation_required/);assert.equal(remote.calls.length,callsBeforeWrongKey);remote.lowerRemote();await assert.rejects(ready.open({key:remote.key,directory:'controller',headroom:remote.options().currentHeadroom}),/reconciliation_required/);
 const expired=fixture();expired.advance(112*3600000);await assert.rejects(retainedCommissioningController(expired.options()),/retained_benchmark_scope/);assert.equal(expired.calls.length,0);
});
