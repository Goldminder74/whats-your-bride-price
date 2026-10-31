import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkMeter} from '../../worker/benchmarkMeter.mjs';
import {BENCHMARK_PHASES} from '../../scripts/approved-benchmark-budget.mjs';
const upper=()=>({...BENCHMARK_PHASES.B.caps});
test('real D1-shaped observations include batch, run, first, internal calls and peak storage',async()=>{
 const result=()=>({success:true,results:[{value:7}],meta:{rows_read:2,rows_written:3,size_after:400}});
 const binding={prepare:()=>({bind(){return this;},all:async()=>result(),run:async()=>result()}),batch:async rows=>rows.map(result)};
 const meter=benchmarkMeter({phase:'B',upper:upper()}),db=meter.database(binding);
 assert.equal(await db.prepare('SELECT value').first('value'),7);
 await db.prepare('UPDATE synthetic').run();await db.batch([db.prepare('SELECT value'),db.prepare('SELECT value')]);
 await meter.authority({readFence:async()=> 'synthetic'}).readFence();
 assert.equal(meter.receipt().reads,8);assert.equal(meter.receipt().writes,12);assert.equal(meter.receipt().storageBytes,400);assert.equal(meter.receipt().internal,1);
 await assert.rejects(db.batch([{}]),/meter_unavailable/);
});
test('unknown billing and observed overrun never become zero or successful receipts',async()=>{
 const broken=benchmarkMeter({phase:'B',upper:upper()});
 const db=broken.database({prepare:()=>({bind(){return this;},all:async()=>({success:true,results:[],meta:{}})}),batch:async()=>[]});
 await assert.rejects(db.prepare('SELECT 1').all(),/^Error: benchmark_meter_unavailable$/);assert.throws(()=>broken.receipt(),/meter_unavailable/);
 assert.equal(broken.billingKnown(),false);
 const lost=benchmarkMeter({phase:'B',upper:upper()});
 const lostDb=lost.database({prepare:()=>({bind(){return this;},all:async()=>{throw Error('synthetic_transport');}}),batch:async()=>[]});
 await assert.rejects(lostDb.prepare('SELECT 1').all(),/meter_unavailable/);assert.equal(lost.billingKnown(),false);
 const meter=benchmarkMeter({phase:'B',upper:{...upper(),writes:1}});assert.throws(()=>meter.add('writes',2),/meter_unavailable/);assert.throws(()=>meter.receipt(),/meter_unavailable/);
 assert.throws(()=>benchmarkMeter({phase:'B',upper:{writes:1}}),/meter_unavailable/);
});
test('every provider fetch is paced, byte counted, redirect denied and failed billing retained',async()=>{
 let clock=0;const times=[];
 const meter=benchmarkMeter({phase:'B',upper:upper(),now:()=>clock,pause:async ms=>{clock+=ms;},request:async(_input,init)=>{assert.equal(init.redirect,'manual');times.push(clock);return new Response('synthetic');}});
 for(let i=0;i<12;i++)await meter.fetcher('https://synthetic.invalid/',{method:'POST',body:'one'});
 assert.deepEqual(times,Array.from({length:12},(_,i)=>(i+1)*100));assert.equal(meter.receipt().external,12);assert.equal(meter.receipt().transferBytes,144);
 const broken=benchmarkMeter({phase:'B',upper:{...upper(),transferBytes:1},request:async()=>new Response('oversized')});
 await assert.rejects(broken.fetcher('https://synthetic.invalid/'),/unavailable/);assert.equal(broken.observed().transferBytes,9);assert.throws(()=>broken.receipt(),/unavailable/);
});
