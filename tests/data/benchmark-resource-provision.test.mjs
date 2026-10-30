import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionBenchmarkResources} from '../../scripts/benchmark-resource-provision.mjs';
const at=Date.now(),account='b6b22a9a87b5758725e5c499782160af';
const preflight={reviewAvailable:true,verifiedAt:at,evidenceSha256:'a'.repeat(64),account,netlifyTeam:'goldminder74',autoTopups:false,standardPaidQuoted:true,standardPaidConfirmed:true,workerCpuLimitMs:100,subscriptionGBP:4.8,maximumUsageGBP:2.6,currentWholeAccountGBP:8.64,usageGBPPerUSD:.96,otherSubscriptionsKnown:true,netlifyCreditsAvailable:506,includedWritesAvailable:49000000,includedReadsAvailable:24000000000,includedStorageBytesAvailable:4990000000};
function setup(){let journal=null;const resources={database:[],site:[]},calls=[];
 const input={preflight,now:()=>at,readJournal:async()=>structuredClone(journal),writeJournal:async value=>{journal=structuredClone(value);},inventory:async kind=>({complete:true,resources:resources[kind]}),create:async(kind,{name})=>{assert.equal(journal.resources[kind].state,'creating');calls.push(kind);const resource={name,id:kind==='database'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222',...(kind==='database'?{account}:{teamSlug:'goldminder74'})};resources[kind].push(resource);return resource;}};
 return {input,resources,calls};}
test('isolated provisioning journals before creation and reuses only its recorded exact resources',async()=>{
 const c=setup(),first=await provisionBenchmarkResources(c.input);
 assert.equal(first.database.name,'wybp-capacity-d1-r002');assert.deepEqual(c.calls,['database','site']);
 assert.deepEqual(await provisionBenchmarkResources(c.input),first);assert.deepEqual(c.calls,['database','site']);
 c.resources.site[0]={...c.resources.site[0],id:'33333333-3333-4333-8333-333333333333'};
 await assert.rejects(provisionBenchmarkResources(c.input),/reconciliation/);
});
test('lost creation response never causes a second POST or silently adopts a matching name',async()=>{
 const c=setup(),create=c.input.create;c.input.create=async(...args)=>{await create(...args);throw Error('synthetic_lost_response');};
 await assert.rejects(provisionBenchmarkResources(c.input),/synthetic_lost_response/);
 await assert.rejects(provisionBenchmarkResources(c.input),/reconciliation/);assert.deepEqual(c.calls,['database']);
});
test('unknown pagination, existing names and cost shortfalls stop before resource creation',async()=>{
 for(const change of [c=>{c.input.inventory=async()=>({complete:false,resources:[]});},c=>{c.resources.database.push({name:'wybp-capacity-d1-r002'});},c=>{c.input.preflight={...preflight,currentWholeAccountGBP:49};}]){
  const c=setup();change(c);await assert.rejects(provisionBenchmarkResources(c.input));assert.equal(c.calls.length,0);
 }
});
