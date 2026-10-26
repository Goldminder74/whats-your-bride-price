import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {retainedHash,retainedZero,RETAINED_CAPS,installedRetainedGrant,verifyRetainedGrant} from '../../worker/retainedBenchmarkPolicy.mjs';
import {RetainedBenchmarkLedger} from '../../worker/retainedBenchmarkLedger.mjs';
import {retainedMeter} from '../../worker/retainedBenchmarkMeter.mjs';
import {syntheticRetainedEnv,syntheticRetainedGrant,syntheticRetainedKey} from '../helpers/retainedBenchmark.mjs';
const h=n=>retainedHash(n),vector=(p={})=>({...retainedZero(),...p});
test('new experiment requires installed exact signed authority; old, expired, live and wrong-target configurations fail closed',()=>{
 const at=1000000000000,env=syntheticRetainedEnv(at);assert.equal(installedRetainedGrant(env,at).kind,'retained-direct-v1');
 for(const change of [{WYBP_RETAINED_BENCHMARK_ENABLED:'false'},{WYBP_AUTHORITY_ROLE:'production-ops'},{WYBP_BENCHMARK_DATABASE_ID:'a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'},{WYBP_MIRROR_DATABASE_ID:env.WYBP_BENCHMARK_DATABASE_ID},{WYBP_PUBLIC_ACCESS_ENABLED:'true'},{WYBP_LIVE_WEBHOOK_ENABLED:'true'},{WYBP_STRIPE_KEY:'sk_live_synthetic'},{WYBP_RETAINED_BENCHMARK_APPROVAL_KEY:'x'.repeat(43)}])assert.throws(()=>installedRetainedGrant({...env,...change},at));
 assert.throws(()=>installedRetainedGrant(env,at+112*3600000));assert.throws(()=>installedRetainedGrant(env,at-1));
 for(const change of [{kind:'B'},{maximumExperimentGBP:176},{priorUsageReconciled:false},{carried:vector({writes:150000001})},{caps:{...RETAINED_CAPS,writes:160000000}}])assert.throws(()=>verifyRetainedGrant(syntheticRetainedGrant(at,change),syntheticRetainedKey,at));
});
test('persistent admission retains consumed/unknown usage and deadline across crashes; duplicate reservations do not execute',()=>{
 const db=new DatabaseSync(':memory:');let at=1000000000000;const grant=syntheticRetainedGrant(at,{carried:vector({writes:177396,external:5163,storageBytes:80000000})}).value;
 try{
  const ledger=new RetainedBenchmarkLedger(db,grant,{now:()=>at}),upper=vector({writes:100,external:2,storageBytes:100000000});
  assert.equal(ledger.reserve(h('op'),h('command'),upper).execute,true);assert.equal(ledger.reserve(h('op'),h('command'),upper).execute,false);assert.equal(ledger.readback().used.writes,177496);
  at+=1000;const recovered=new RetainedBenchmarkLedger(db,grant,{now:()=>at,cold:true});assert.equal(recovered.readback().stopped,true);assert.equal(recovered.readback().pending,1);assert.equal(recovered.readback().deadlineAt,grant.endsAt);
  assert.throws(()=>recovered.reserve(h('new'),h('new'),upper));assert.equal(recovered.readback().used.external,5165);
  recovered.transition('cleanup',{});assert.equal(recovered.readback().pending,1);assert.equal(recovered.readback().used.writes,177496);
  assert.throws(()=>new RetainedBenchmarkLedger(db,{...grant,startsAt:at,endsAt:at+112*3600000},{now:()=>at}));
 }finally{db.close();}
});
test('settlement checks exact receipts, never refunds peak reservations, and reserves cleanup before ordinary effects',()=>{
 const db=new DatabaseSync(':memory:'),at=1000000000000,grant=syntheticRetainedGrant(at).value;
 try{
  const ledger=new RetainedBenchmarkLedger(db,grant,{now:()=>at}),upper=vector({writes:20,external:5,storageBytes:80000000}),escrow=vector({external:100,writes:500});
  assert.deepEqual(ledger.sizes({source:1234,mirror:2000}),{source:1234,mirror:2000});assert.deepEqual(ledger.sizes({source:0,mirror:3000}),{source:1234,mirror:3000});assert.throws(()=>ledger.sizes({source:8000000001,mirror:1}));
  ledger.reserve(h('one'),h('identity'),upper,{escrow});ledger.settle(h('one'),h('identity'),vector({writes:10,external:3,storageBytes:1000}),h('receipt'));
  assert.equal(ledger.readback().used.writes,10);assert.equal(ledger.readback().used.storageBytes,80000000);
  assert.deepEqual(ledger.settle(h('one'),h('identity'),vector({writes:10,external:3,storageBytes:1000}),h('receipt')),{replay:true});
  assert.throws(()=>ledger.settle(h('one'),h('identity'),vector(),h('changed')));
  assert.throws(()=>ledger.reserve(h('cap'),h('cap'),vector({external:4000000}),{escrow}));
  ledger.transition('cleanup',{});assert.equal(ledger.reserve(h('delete'),h('exact-disposable-id'),vector({external:50,writes:10}),{cleanup:true}).execute,true);
  assert.throws(()=>ledger.reserve(h('delete2'),h('other'),vector({external:60}),{cleanup:true}));assert.equal(ledger.readback().cleanup.external,50);
  ledger.settle(h('delete'),h('exact-disposable-id'),vector({external:3,writes:2}),h('cleanup-receipt'));assert.equal(ledger.readback().cleanup.external,97);assert.equal(ledger.readback().used.external,6);
 }finally{db.close();}
});
test('measurement cannot start on an unverified snapshot or finish early or count a replayed completion twice',()=>{
 const db=new DatabaseSync(':memory:');let at=1000000000000;const grant=syntheticRetainedGrant(at).value;
 try{
  const ledger=new RetainedBenchmarkLedger(db,grant,{now:()=>at});assert.throws(()=>ledger.transition('measure',{receiptSha256:h('proof')}));
  ledger.transition('measure',{receiptSha256:h('proof'),fullStockVerified:true,mirrorVerified:true,applicationRoutesVerified:true});
  assert.equal(ledger.completed(h('attempt'),h('result')),true);assert.equal(ledger.completed(h('attempt'),h('result')),false);assert.throws(()=>ledger.completed(h('attempt'),h('different')));
  assert.throws(()=>ledger.transition('recovery',{receiptSha256:h('proof'),capacityVerified:true}));at+=24*3600000;assert.throws(()=>ledger.completed(h('late'),h('result')));assert.throws(()=>ledger.transition('recovery',{receiptSha256:h('proof'),capacityVerified:true}));
 }finally{db.close();}
});
test('meter counts provider transfer and source/mirror storage separately; missing billing and unknown I/O cannot become zero',async()=>{
 const meter=retainedMeter(RETAINED_CAPS,{provider:async()=>({billingKnown:true,response:new Response('abc'),timing:{pacingWaitMs:17,fetchMs:5}})});
 const binding=size=>({prepare:()=>({bind(){return this;},all:async()=>({success:true,results:[{n:1}],meta:{rows_read:8,rows_written:2,size_after:size}})}),batch:async()=>[]});
 await meter.database(binding(100)).prepare('SELECT 1').all();await meter.database(binding(80),{mirror:true}).prepare('SELECT 1').all();assert.equal(meter.receipt().storageBytes,180);assert.equal(meter.receipt().writes,4);
 await meter.fetcher('https://www.googleapis.com/drive/v3/files/synthetic',{method:'POST',body:'ab'});assert.equal(meter.receipt().transferBytes,5);assert.equal(meter.receipt().external,1);assert.equal(meter.timing().providerWaitMs,17);
 const bad=retainedMeter(RETAINED_CAPS,{provider:async()=>{throw Error('unknown');}});await assert.rejects(bad.fetcher('https://www.googleapis.com/drive/v3/files/synthetic'));assert.equal(bad.billingKnown(),false);assert.throws(()=>bad.receipt());
 const noMeta=retainedMeter(RETAINED_CAPS);await assert.rejects(noMeta.database(binding(undefined)).prepare('SELECT 1').all());assert.equal(noMeta.billingKnown(),false);
});

test('cached HTTP retries still consume arrival/CPU/transfer allowance without a second domain ticket',()=>{const db=new DatabaseSync(':memory:'),at=1000000000000,ledger=new RetainedBenchmarkLedger(db,syntheticRetainedGrant(at).value,{now:()=>at});try{ledger.replayArrival(300);ledger.replayArrival(300);assert.equal(ledger.readback().used.external,2);assert.equal(ledger.readback().used.transferBytes,600);assert.equal(ledger.readback().used.workerCpuMs,200);assert.equal(ledger.readback().pending,0);ledger.stop();assert.throws(()=>ledger.replayArrival(300));}finally{db.close();}});

test('only instrumented successful overhead releases unused SQL and uncalled runner allowance; unknown reservations stay charged',()=>{const db=new DatabaseSync(':memory:'),at=1000000000000,ledger=new RetainedBenchmarkLedger(db,syntheticRetainedGrant(at).value,{now:()=>at});try{ledger.overhead({reads:48,writes:12,runnerInvocations:8});ledger.measuredOverhead({reserved:{reads:48,writes:12},charged:{reads:9,writes:7},unusedRunners:7});assert.equal(ledger.readback().used.doReads,9);assert.equal(ledger.readback().used.doWrites,7);assert.equal(ledger.readback().used.workerCpuMs,200);assert.equal(ledger.readback().used.internal,2);ledger.overhead({reads:48,writes:12});assert.equal(ledger.readback().used.doReads,57);assert.equal(ledger.readback().used.doWrites,19);assert.throws(()=>ledger.measuredOverhead({reserved:{reads:10,writes:10},charged:{reads:11,writes:9}}));assert.equal(ledger.readback().used.doReads,57);assert.equal(ledger.readback().deadlineAt,syntheticRetainedGrant(at).value.endsAt);}finally{db.close();}});

test('retained recorder sample compacts only settled child traces while unknown parents and I/O survive',async()=>{const {retainedRecorderFootprint}=await import('../helpers/retainedRecorderFootprint.mjs');const result=retainedRecorderFootprint(1000);assert.equal(result.settledIoRows,0);assert.equal(result.pendingIoRows,1);assert.equal(result.pendingParentReservations,1);assert.ok(result.projected1200000Parents<1600000000);});

test('start slots are reserved before effects, survive replacement and never reset the7350-start cap',()=>{const db=new DatabaseSync(':memory:'),at=1000000000000,grant=syntheticRetainedGrant(at).value;try{const ledger=new RetainedBenchmarkLedger(db,grant,{now:()=>at});assert.equal(ledger.started(h('first')),true);assert.equal(ledger.started(h('first')),false);const add=db.prepare('INSERT INTO retained_starts VALUES(?)');for(let i=1;i<7350;i++)add.run(h(i));db.prepare('UPDATE retained_start_count SET n=7350 WHERE id=1').run();const resumed=new RetainedBenchmarkLedger(db,grant,{now:()=>at});assert.equal(resumed.started(h('first')),false);assert.throws(()=>resumed.started(h('new')));assert.equal(db.prepare('SELECT n FROM retained_start_count WHERE id=1').get().n,7350);resumed.stop();assert.throws(()=>resumed.started(h('first')));}finally{db.close();}});
