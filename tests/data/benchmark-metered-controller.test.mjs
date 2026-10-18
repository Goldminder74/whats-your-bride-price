import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {meteredBenchmarkController} from '../../scripts/benchmark-metered-controller.mjs';
import {benchmarkOperationBounds} from '../../scripts/benchmark-operation-bounds.mjs';
import {ApprovedBenchmarkBudget,BENCHMARK_PHASES} from '../../scripts/approved-benchmark-budget.mjs';
import {recoveryHash} from '../../scripts/recovery-crypto.mjs';
const at=Date.now(),facts={reviewAvailable:true,verifiedAt:at,evidenceSha256:'a'.repeat(64),account:'b6b22a9a87b5758725e5c499782160af',netlifyTeam:'goldminder74',autoTopups:false,standardPaidQuoted:true,standardPaidConfirmed:true,workerCpuLimitMs:100,usageGBPPerUSD:.96,subscriptionGBP:4.8,maximumUsageGBP:2.6,currentWholeAccountGBP:9,otherSubscriptionsKnown:true,netlifyCreditsAvailable:500,includedWritesAvailable:50000000,includedReadsAvailable:25000000000,includedStorageBytesAvailable:5000000000};
test('encrypted settled receipts survive controller replacement without another effect or counter reset',async()=>{
 const db=new DatabaseSync(':memory:'),directory=await mkdtemp(join(tmpdir(),'synthetic-metered-')),key=randomBytes(32);let calls=0;
 const budget=new ApprovedBenchmarkBudget(db,{runId:'synthetic_controller',phase:'C',preflight:facts,now:()=>at,preparing:true}),vector=Object.fromEntries(Object.keys(BENCHMARK_PHASES.C.caps).map(k=>[k,0]));vector.external=1;vector.writes=5;
 const adapter={upperBound:()=>({...vector}),execute:async()=>{calls++;const value={result:{verified:true},usage:{...vector}};return {...value,receiptSha256:recoveryHash(Buffer.from(JSON.stringify(value)))};}};
 try{
  const options={budget,adapter,key,directory},first=await meteredBenchmarkController(options);
  assert.deepEqual(await first({id:'setup_verified',kind:'synthetic'},{preparation:true}),{verified:true});
  const second=await meteredBenchmarkController(options);assert.deepEqual(await second({id:'setup_verified',kind:'synthetic'},{preparation:true}),{verified:true});assert.equal(calls,1);assert.equal(budget.receipt().used.writes,5);
  budget.beginMeasurement();adapter.execute=async()=>{calls++;throw Error('synthetic_unknown_response');};
  await assert.rejects(second({id:'unknown',kind:'synthetic'}),/readback_required/);assert.equal(calls,2);assert.equal(budget.receipt().uncertainActions,1);
  await assert.rejects(second({id:'unknown',kind:'synthetic'}));assert.equal(calls,2);assert.equal(budget.receipt().used.writes,10);
 }finally{db.close();await rm(directory,{recursive:true,force:true});}
});
test('operation admission bounds retain published caps and reject unsupported phases or commands',()=>{
 const bounds=benchmarkOperationBounds({phase:'C',storageBytes:1000000});
 for(const kind of ['fixture-step','fixture','purge','arrivals','capture','recover-index','restore-audit','restore-clear','restore-import','restore-verify']){
  const value=bounds({kind});assert.ok(value.internal<=500);for(const [k,n] of Object.entries(value))assert.ok(n>=0&&n<=BENCHMARK_PHASES.C.caps[k]);
 }
 assert.throws(()=>bounds({kind:'activate-commerce'}),/unavailable/);
 assert.throws(()=>benchmarkOperationBounds({phase:'A',storageBytes:0}),/unavailable/);
 assert.throws(()=>benchmarkOperationBounds({phase:'C',storageBytes:200000000})({kind:'capture'}),/unavailable/);
});
