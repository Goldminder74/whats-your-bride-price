import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ApprovedBenchmarkBudget,BENCHMARK_PHASES} from '../../scripts/approved-benchmark-budget.mjs';
import {ApprovedBenchmarkDriver} from '../../scripts/approved-benchmark-driver.mjs';
const hash='a'.repeat(64);
test('verified shared pacing permits overlapping actions rather than serialising response latency',async()=>{
 const f=fixture(),resolvers=[];f.adapter.sharedPacing=true;let active=0,peak=0;
 f.adapter.execute=async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>resolvers.push(resolve));active--;return {usage:{...Object.fromEntries(Object.keys(BENCHMARK_PHASES.B.caps).map(k=>[k,0])),external:1},receiptSha256:hash,result:{ok:true}};};
 try{
  const actions=Array.from({length:10},(_,i)=>f.driver.action({id:'parallel_'+i,kind:'result'}));
  for(let i=0;i<50;i++)await Promise.resolve();assert.equal(peak,8);assert.equal(resolvers.length,8);
  for(const resolve of resolvers.splice(0))resolve();for(let i=0;i<50;i++)await Promise.resolve();
  for(const resolve of resolvers.splice(0))resolve();await Promise.all(actions);
  assert.equal(f.driver.receipt().observedActions,10);assert.equal(f.budget.receipt().used.external,10);
 }finally{f.db.close();}
});
function fixture(phase='B'){
 let at=Date.UTC(2026,9,15),calls=0;
 const db=new DatabaseSync(':memory:');
 const preflight={reviewAvailable:true,verifiedAt:at,evidenceSha256:hash,account:'b6b22a9a87b5758725e5c499782160af',netlifyTeam:'goldminder74',autoTopups:false,standardPaidQuoted:true,standardPaidConfirmed:true,workerCpuLimitMs:100,usageGBPPerUSD:.96,subscriptionGBP:4.8,maximumUsageGBP:2.6,currentWholeAccountGBP:9,otherSubscriptionsKnown:true,netlifyCreditsAvailable:400,includedWritesAvailable:5100000,includedReadsAvailable:71000000,includedStorageBytesAvailable:250000000};
 const budget=new ApprovedBenchmarkBudget(db,{runId:'driver_fixture',phase,preflight,now:()=>at});
 const zero=Object.fromEntries(Object.keys(BENCHMARK_PHASES.B.caps).map(k=>[k,0]));
 const resources=Object.fromEntries(['site','worker','database'].map((k,i)=>[k,{name:['wybp-capacity-private-r002','wybp-capacity-worker-r002','wybp-capacity-d1-r002'][i],id:'11111111-1111-4111-8111-111111111111',account:preflight.account,teamSlug:'goldminder74'}]));
 const adapter={phase,upperBound:()=>({...zero,external:1}),verifyInventory:async()=>({usage:{...zero,external:1},receiptSha256:hash,result:{syntheticOnly:true,privateIngressVerified:true,commerce:false,webhook:false,cron:false,cpuLimitMs:100,partitionCount:16,eligiblePerRegion:[30,30,30,30,30],sourceSha256:hash}}),execute:async c=>{
  calls++;
  const result=c.kind==='start'?{selectionHash:hash,ownerHash:hash,attemptHash:hash,questionCount:12}:c.kind==='answer'?{accepted:true,question:c.question,attemptHash:hash}:c.kind==='recover'?{selectionHash:hash,attemptHash:hash,answerCount:7,chargeCount:0,additionalAttempts:0}:c.kind==='complete'?{persisted:true,answerCount:12,attemptHash:hash,accountingVerified:true,ownershipVerified:true,completionReceipt:hash}:{resultVerified:true,assetsVerified:true,sharingVerified:true};
  return {usage:{...zero,external:1},receiptSha256:hash,result};
 }};
 const driver=new ApprovedBenchmarkDriver({budget,adapter,resources,now:()=>at,pause:async ms=>{at+=ms;}});
 return {driver,budget,adapter,db,calls:()=>calls,resources};
}
test('real budget counts only receipt-verified completion after twelve answers and exact recovery',async()=>{
 const f=fixture();try{
  await f.driver.initialise();await f.driver.game({identity:'synthetic_1',region:'west',startAfterMs:0,questionIntervalMs:1,recoverAfterQuestion:7});
  assert.equal(f.budget.receipt().completedGames,1);assert.equal(f.calls(),16);assert.equal(f.driver.receipt().observedActions,17);
 }finally{f.db.close();}
});
test('outage orchestration bounds fixture arrivals and pass counts; synthetic adapter is not throughput evidence',async()=>{
 const f=fixture('C'),counts={purge:0,flush:0,arrivals:0};let remaining=36000;
 f.adapter.execute=async c=>{
  let result;
  if(c.kind==='fixture'){assert.equal(c.agedAnswers,36000);assert.equal(c.dependentRows,7000);result={agedAnswers:36000,dependentRows:7000,syntheticOnly:true,holdsVerified:true};}
  else if(c.kind==='arrivals'){counts.arrivals+=c.rows;result={unexpiredRows:c.rows};}
  else if(c.kind==='purge'){counts.purge++;assert.equal(c.limit,100);const deleted=Math.min(75,remaining);remaining-=deleted;result={deleted,remainingExpired:remaining,protectedRowsChanged:0};}
  else if(c.kind==='flush'){counts.flush++;assert.equal(c.limit,25);result={chainVerified:true,durableReadback:true,remainingBacklog:0};}
  else result={accountingVerified:true,holdsVerified:true,closedWalletsBlocked:true,deletionsSuppressed:true,interruptedResumeVerified:true,prematureAccess:false};
  return {result,usage:f.adapter.upperBound(),receiptSha256:hash};
 };
 try{const result=await f.driver.runOutage();assert.deepEqual(counts,{purge:480,flush:480,arrivals:3000});assert.equal(remaining,0);assert.equal(result.budget.completedGames,0);assert.ok(result.budget.elapsedMs<3600000);}finally{f.db.close();}
});
test('incomplete games never count as completed',async()=>{
 const f=fixture();try{await f.driver.game({identity:'incomplete_1',region:'east',startAfterMs:0,answerCount:4},true);assert.equal(f.budget.receipt().completedGames,0);assert.equal(f.calls(),5);}finally{f.db.close();}
});

test('verified paced adapter reserves aggregate provider traffic and enforces an inter-action gap',async()=>{
 const f=fixture();try{
  f.adapter.pacedExternal=true;
  const original=f.adapter.upperBound;f.adapter.upperBound=()=>({...original(),external:30});
  const start=f.budget.receipt().elapsedMs;
  await f.driver.initialise();
  await f.driver.action({id:'synthetic_paced',kind:'answer'});
  assert.ok(f.budget.receipt().elapsedMs-start>=100);
  assert.equal(f.budget.receipt().used.external,2);
 }finally{f.db.close();}
});

test('a failed action cancels future scheduled admissions instead of retaining hour-long timers',async()=>{
 const f=fixture();try{
  const driver=new ApprovedBenchmarkDriver({budget:f.budget,adapter:f.adapter,resources:f.resources,now:f.driver.now});
  const waiting=driver.wait(3500000);
  const cancelled=assert.rejects(waiting,/phase_stopped/);
  f.adapter.execute=async()=>{throw Error('synthetic_transport_loss');};
  await assert.rejects(driver.action({id:'synthetic_abort',kind:'answer'}),/action_uncertain/);
  await cancelled;
  assert.equal(f.budget.receipt().state,'stopped');
  await assert.rejects(driver.wait(0),/phase_stopped/);
 }finally{f.db.close();}
});
test('mismatched restored selection stops before further answers or completion',async()=>{
 const f=fixture(),original=f.adapter.execute;
 f.adapter.execute=async c=>{const result=await original(c);if(c.kind==='recover')result.result.selectionHash='b'.repeat(64);return result;};
 try{await assert.rejects(f.driver.game({identity:'bad_recovery',region:'west',startAfterMs:0,questionIntervalMs:1,recoverAfterQuestion:7}),/verification_failed/);assert.equal(f.budget.receipt().completedGames,0);assert.equal(f.budget.receipt().state,'stopped');assert.equal(f.budget.receipt().used.external,9);assert.equal(f.calls(),9);}finally{f.db.close();}
});
test('duplicate concurrent action executes once; lost response stops without retry',async()=>{
 const f=fixture();try{
  await Promise.all([f.driver.action({id:'same',kind:'result'}),f.driver.action({id:'same',kind:'result'})]);assert.equal(f.calls(),1);
  f.adapter.execute=async()=>{throw Error('private response never logged');};
  await assert.rejects(f.driver.action({id:'uncertain',kind:'result'}),/action_uncertain/);
  await assert.rejects(f.driver.action({id:'uncertain',kind:'result'}),/action_uncertain/);
  assert.equal(f.budget.receipt().uncertainActions,1);
 }finally{f.db.close();}
});
test('protected target and unverified inventory rejected before workload',async()=>{
 const f=fixture();try{
  assert.throws(()=>new ApprovedBenchmarkDriver({...f,resources:{...f.resources,database:{...f.resources.database,name:'wybp-prod-d1-r001'}}}),/resource_scope/);
  f.adapter.verifyInventory=async()=>({receiptSha256:hash,usage:f.adapter.upperBound(),result:{syntheticOnly:false}});
  await assert.rejects(f.driver.initialise(),/verification_failed/);assert.equal(f.calls(),0);assert.equal(f.budget.receipt().used.external,1);assert.equal(f.budget.receipt().state,'stopped');
 }finally{f.db.close();}
});
