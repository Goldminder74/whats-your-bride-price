import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {hostedBenchmarkAdapter} from '../../scripts/hosted-benchmark-adapter.mjs';
import {BENCHMARK_PHASES} from '../../scripts/approved-benchmark-budget.mjs';
import {benchmarkGameBounds} from '../../scripts/benchmark-game-bounds.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex');
test('game reservations cover observed operations without admitting unknown work or full storage',()=>{
 const assets=Object.fromEntries(['/regions/west-africa.webp','/avatars/adjoa-v2.webp','/quiz-art/west-0.webp','/quiz-art/west-7.webp'].map(path=>[path,{bytes:2000}]));
 const bound=benchmarkGameBounds({phase:'B',storageBytes:1000000,assets});
 assert.ok(bound({kind:'recover'}).internal>=247);assert.ok(bound({kind:'start'}).external>=21);
 assert.equal(bound({kind:'result',region:'west'}).transferBytes,4508000);
 assert.throws(()=>bound({kind:'restore'}),/unavailable/);
 assert.throws(()=>bound({kind:'result',region:'unknown'}),/unavailable/);
 assert.throws(()=>benchmarkGameBounds({phase:'B',storageBytes:70000000,assets}),/unavailable/);
 assert.throws(()=>benchmarkGameBounds({phase:'A',storageBytes:0,assets}),/unavailable/);
});
test('isolated adapter verifies ingress and source and counts actual synthetic transport',async()=>{
 const zero=Object.fromEntries(Object.keys(BENCHMARK_PHASES.B.caps).map(k=>[k,0]));let at=Date.now();const calls=[];
 const source='a'.repeat(64),asset=Buffer.from('synthetic asset'),secret='s'.repeat(32);
 const outcome=result=>({result,usage:{...zero,reads:7,writes:2},billingKnown:true,receiptSha256:digest(JSON.stringify(result))});
 const adapter=hostedBenchmarkAdapter({phase:'B',operator:{execute:async()=>outcome({sourceSha256:source})},access:'a'.repeat(32),controllerSecret:secret,workerOrigin:'https://wybp-capacity-worker-r002.synthetic.workers.dev',sourceSha256:source,assets:Object.fromEntries(['/avatars/adjoa-v2.webp','/regions/west-africa.webp','/quiz-art/west-0.webp'].map(path=>[path,{bytes:asset.length,sha256:digest(asset)}])),bounds:()=>({...zero,external:30,transferBytes:5000000,reads:100,writes:100}),now:()=>at,pause:async ms=>{at+=ms;},request:async(url,init)=>{
  calls.push(url);assert.equal(init.redirect,'manual');
  if(url.includes('workers.dev'))return new Response(null,{status:404});
  if(!init.headers.authorization)return new Response(null,{status:401});
  if(url.endsWith('.webp'))return new Response(asset);
  if(url.endsWith('/game')){assert.equal(init.headers['x-wybp-benchmark-signature'],createHmac('sha256',secret).update(init.headers['x-wybp-benchmark-time']+'\n'+init.body).digest('hex'));return Response.json(outcome(JSON.parse(init.body).command.kind==='start'?{answerPlan:Array.from({length:12},(_,i)=>({questionRef:'synthetic_question_'+i,selectedOptionIds:['synthetic_option'],assetRefs:i===0?['/quiz-art/west-0.webp']:[]}))}:{accepted:true}));}
  return new Response('private');
 }});
 const inventory=await adapter.verifyInventory();assert.equal(inventory.result.privateIngressVerified,true);assert.equal(inventory.usage.external,4);assert.equal(inventory.usage.reads,7);
 await adapter.execute({kind:'start',identity:'synthetic_test',region:'west'});const game=await adapter.execute({kind:'answer',identity:'synthetic_test',question:1});assert.equal(game.result.accepted,true);assert.equal(game.usage.external,2);assert.equal(game.usage.writes,2);assert.ok(game.usage.transferBytes>0);assert.equal(calls.length,9);
});
test('adapter cannot target another Worker or accept a malformed billing bound',()=>{
 const options={phase:'B',operator:{execute:async()=>{}},access:'a'.repeat(32),controllerSecret:'s'.repeat(32),workerOrigin:'https://other.synthetic.workers.dev',sourceSha256:'a'.repeat(64),assets:{},bounds:()=>({})};
 assert.throws(()=>hostedBenchmarkAdapter(options),/unavailable/);
 const adapter=hostedBenchmarkAdapter({...options,workerOrigin:'https://wybp-capacity-worker-r002.synthetic.workers.dev'});assert.throws(()=>adapter.upperBound({kind:'start'}),/unavailable/);
});

test('unknown RPC billing is never accepted as a complete numeric observation',async()=>{
 const upper={...BENCHMARK_PHASES.B.caps};
 const adapter=hostedBenchmarkAdapter({phase:'B',operator:{execute:async()=>({result:{failed:true},usage:Object.fromEntries(Object.keys(upper).map(k=>[k,0])),billingKnown:false,receiptSha256:'a'.repeat(64)})},access:'a'.repeat(32),controllerSecret:'s'.repeat(32),workerOrigin:'https://wybp-capacity-worker-r002.synthetic.workers.dev',sourceSha256:'a'.repeat(64),assets:{},bounds:()=>upper});
 await assert.rejects(adapter.execute({kind:'inventory'}),/unavailable/);
});
