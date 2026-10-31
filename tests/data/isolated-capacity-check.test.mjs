import test from 'node:test';
import assert from 'node:assert/strict';
import {CapacityBudget,CapacityD1,holdCapacityAttempt} from '../../scripts/isolated-capacity-check.mjs';

test('baseline hold uses the actual authority contract with a distinct operation ID and complete plan',async()=>{
  const at=Date.UTC(2026,9,15),calls=[];
  const service={async transact(id,plan){calls.push({id,plan});return 'verified';}};
  assert.equal(await holdCapacityAttempt(service,'synthetic_attempt',at),'verified');
  assert.match(calls[0].id,new RegExp('^op_'+at+'_[a-f0-9]{32}$'));
  assert.equal(calls[0].plan.length,2);
  assert.deepEqual(calls[0].plan[1].params,['capacity_hold','attempt','synthetic_attempt','legal',at,'a'.repeat(64)]);
});

test('concurrent admissions remain globally paced and cannot exceed request cap',async()=>{
  let clock=0;const b=new CapacityBudget({now:()=>clock,pause:async ms=>{clock+=ms;}});
  await Promise.all([b.admit(),b.admit(),b.admit()]);
  assert.equal(clock,2000);assert.equal(b.requests,3);
  b.requests=799;
  const results=await Promise.allSettled([b.admit(),b.admit()]);
  assert.deepEqual(results.map(r=>r.status),['fulfilled','rejected']);
  assert.equal(b.requests,800);
});
test('capacity guard enforces pacing, 80% ceilings, deadline and known billing',async()=>{
  let clock=0;const b=new CapacityBudget({now:()=>clock,pause:async ms=>{clock+=ms;}});
  await b.admit();await b.admit();assert.equal(clock,1000);assert.equal(b.requests,2);
  b.observe({rows_read:4,rows_written:3,size_after:100});assert.equal(b.writes,3);
  assert.throws(()=>b.observe({}),/billing_unknown/);
  b.writes=6000;await assert.rejects(b.admit({reserveWrites:2000}),/limit_stop/);
  b.writes=0;b.requests=800;await assert.rejects(b.admit(),/limit_stop/);
  b.requests=0;clock=30*60*1000;await assert.rejects(b.admit(),/limit_stop/);
});
test('capacity transport rejects protected databases before any network request',async()=>{
  for(const id of ['1a268b28-e6d5-4431-8f84-a886df9369f1','a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'])
    await assert.rejects(CapacityD1.connect({id,token:'synthetic',budget:new CapacityBudget(),fetch:()=>{throw Error('must not call');}}),/target_rejected/);
});

test('capacity transport counts binary uploads and rejects an unexpected database identity',async()=>{
 let clock=0;const budget=new CapacityBudget({now:()=>clock,pause:async ms=>{clock+=ms;}});
 const id='140d6d9b-89d4-488f-acd3-c10990cabf11';
 const request=async(_url,options)=>new Response(options.method==='GET'?JSON.stringify({success:true,result:{uuid:id,name:'wybp-capacity-d1-r001'}}):'OK');
 const db=await CapacityD1.connect({id,token:'synthetic',budget,fetch:request});
 const before=budget.bytes;await db.requestBytes('https://synthetic.invalid/',{method:'PUT',body:Buffer.alloc(7)});
 assert.equal(budget.bytes-before,9);
 await assert.rejects(CapacityD1.connect({id,token:'synthetic',budget,fetch:async()=>new Response(JSON.stringify({success:true,result:{uuid:id,name:'unexpected'}}))}),/identity_mismatch/);
});
