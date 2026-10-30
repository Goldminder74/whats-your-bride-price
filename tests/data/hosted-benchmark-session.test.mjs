import test from 'node:test';import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createHostedBenchmarkSession} from '../../scripts/hosted-benchmark-session.mjs';
import {BENCHMARK_PHASES} from '../../scripts/approved-benchmark-budget.mjs';import {recoveryHash} from '../../scripts/recovery-crypto.mjs';
const at=Date.now(),account='b6b22a9a87b5758725e5c499782160af',id='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64);
const facts={reviewAvailable:true,verifiedAt:at,evidenceSha256:hash,account,netlifyTeam:'goldminder74',autoTopups:false,standardPaidQuoted:true,standardPaidConfirmed:true,workerCpuLimitMs:100,usageGBPPerUSD:.96,subscriptionGBP:4.8,maximumUsageGBP:2.6,currentWholeAccountGBP:9,otherSubscriptionsKnown:true,netlifyCreditsAvailable:500,includedWritesAvailable:50000000,includedReadsAvailable:25000000000,includedStorageBytesAvailable:5000000000};
test('exact hosted session checks credentials/configuration before access and preserves setup receipts across instances',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'synthetic-session-')),key=randomBytes(32);let platforms=0,effects=0;
 const resources={database:{name:'wybp-capacity-d1-r002',id,account},site:{name:'wybp-capacity-private-r002',id,teamSlug:'goldminder74'},worker:{name:'wybp-capacity-worker-r002',id:'wybp-capacity-worker-r002',account}};
 const secrets={WYBP_BENCHMARK_KEY_BASE64:key.toString('base64'),WYBP_BENCHMARK_ACCESS:'synthetic-private-access-'.repeat(3),WYBP_BENCHMARK_CONTROLLER_SECRET:'synthetic-controller-'.repeat(3)};
 const hosted={phase:'B',cpuMs:100,schedules:0,offFlags:true,unsignedStatus:404,sourceSha256:hash,verifiedAt:at,databaseIds:[id],storageBytes:1000000,secretNames:['WYBP_DRIVE_CLIENT_ID','WYBP_DRIVE_CLIENT_SECRET','WYBP_DRIVE_REFRESH_TOKEN','WYBP_BENCHMARK_KEY_BASE64','WYBP_BENCHMARK_ACCESS','WYBP_BENCHMARK_CONTROLLER_SECRET','WYBP_NETLIFY_PROXY_SECRET']};
 const options={phase:'B',preflight:facts,resources,secrets,hosted,manifest:{synthetic:false,databaseId:id,siteId:id,workerOrigin:'https://wybp-capacity-worker-r002.synthetic.workers.dev',sourceSha256:hash,assetFiles:{}},directory,now:()=>at,platform:async configuration=>{platforms++;assert.equal(configuration.persist,false);assert.deepEqual(configuration.envFiles,[]);const config=JSON.parse(await readFile(configuration.configPath,'utf8'));assert.deepEqual(config.services,[{binding:'OP',service:'wybp-capacity-worker-r002',entrypoint:'BenchmarkOperator',remote:true}]);return {dispose:async()=>{},env:{OP:{execute:async()=>{throw Error('unexpected execution');},provision:async()=>{effects++;const result={root:'synthetic_folder_root',folders:Array.from({length:16},(_,i)=>'synthetic_folder_'+i)},usage=Object.fromEntries(Object.keys(BENCHMARK_PHASES.B.caps).map(k=>[k,0]));return {result,usage,billingKnown:true,receiptSha256:recoveryHash(Buffer.from(JSON.stringify(result)))};}}}};}};
 try{
  await assert.rejects(createHostedBenchmarkSession({...options,hosted:{...hosted,secretNames:[]}}),/secure_install/);assert.equal(platforms,0);
  await assert.rejects(createHostedBenchmarkSession({...options,hosted:{...hosted,cpuMs:30000}}));assert.equal(platforms,0);
  await assert.rejects(createHostedBenchmarkSession({...options,resources:{...resources,database:{...resources.database,name:'wybp-prod-d1-r001'}}}));assert.equal(platforms,0);
  const first=await createHostedBenchmarkSession(options),folders=await first.prepareDrive();await first.close();
  const second=await createHostedBenchmarkSession(options);assert.deepEqual(await second.prepareDrive(),folders);assert.equal(effects,1);assert.equal(second.budget.receipt().state,'preparing');await assert.rejects(second.run(),/commissioning/);await second.close();
  const previousFetch=globalThis.fetch;let requests=0,third;
  try{
   globalThis.fetch=async()=>{requests++;return new Response('private-provider-body-never-store',{status:503});};
   third=await createHostedBenchmarkSession({...options,hosted:{...hosted,folderCount:16,restoreReceiptPresent:true}});
   await assert.rejects(third.run(),/phase_failed_readback_required/);
   const saved=await readFile(join(directory,'phase-B-failure.json'),'utf8'),failure=JSON.parse(saved);
   assert.equal(failure.failed,true);assert.equal(failure.budget.state,'stopped');assert.equal(failure.budget.uncertainActions,1);
   assert.equal(failure.budget.completedGames,0);assert.ok(failure.budget.used.external>0);
   assert.equal(saved.includes('private-provider-body-never-store'),false);
   for(const secret of Object.values(secrets))assert.equal(saved.includes(secret),false);
   const observed=requests;await assert.rejects(third.run());assert.equal(requests,observed);
  }finally{globalThis.fetch=previousFetch;await third?.close();}
 }finally{await rm(directory,{recursive:true,force:true});}
});

