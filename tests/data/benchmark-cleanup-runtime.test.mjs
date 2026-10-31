import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkCleanupRuntime} from '../../worker/benchmarkCleanupRuntime.mjs';
import {BENCHMARK_PHASES} from '../../scripts/approved-benchmark-budget.mjs';
const root='synthetic_cleanup_root',folders=Array.from({length:16},(_,i)=>'synthetic_cleanup_child_'+i),runId='synthetic_cleanup';
function fixture({busy=false,foreign=false}={}){
 let now=Date.now(),calls=0,deletes=0,removed=false;
 const env={WYBP_BENCHMARK_DATABASE_NAME:'wybp-capacity-d1-r002',WYBP_BENCHMARK_DATABASE_ID:'11111111-1111-4111-8111-111111111111',CLOUDFLARE_ACCOUNT_ID:'b6b22a9a87b5758725e5c499782160af',WYBP_AUTHORITY_ROLE:'benchmark-ops',WYBP_WORKER_NAME:'wybp-capacity-worker-r002',PUBLIC_APP_ORIGIN:'https://wybp-capacity-private-r002.netlify.app',WYBP_BENCHMARK_PHASE:'B',WYBP_BENCHMARK_RUN_ID:runId,WYBP_BENCHMARK_SOURCE_SHA256:'a'.repeat(64),WYBP_BENCHMARK_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),WYBP_DRIVE_CLIENT_ID:'synthetic-client',WYBP_DRIVE_CLIENT_SECRET:'synthetic-secret',WYBP_DRIVE_REFRESH_TOKEN:'synthetic-refresh',WYBP_DRIVE_FOLDER_ID:root,WYBP_DRIVE_SHARD_FOLDER_IDS:JSON.stringify(folders),BENCHMARK_PACING:{getByName(){assert.fail('expired measurement coordinator must not be reopened');}}};
 env.DB={prepare(sql){assert.match(sql,/SELECT state,expires_at FROM operational_recovery_checkpoints/);return {bind(){return this;},async all(){return {success:true,results:busy?[{state:'importing',expires_at:now+10000}]:[],meta:{rows_read:1,rows_written:0,size_after:4096}};}};},batch(){assert.fail('cleanup cannot mutate authority or restore state');}};
 const request=async(url,init={})=>{
  calls++;assert.ok(!init.method||['GET','POST','DELETE'].includes(init.method));
  if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'synthetic-access',token_type:'Bearer',expires_in:3600});
  if(init.method==='DELETE'){assert.equal(url,'https://www.googleapis.com/drive/v3/files/'+root);deletes++;removed=true;return new Response(null,{status:204});}
  if(url.includes('/'+root+'?'))return removed?new Response(null,{status:404}):Response.json({id:root,name:'wybp-capacity-r002-'+runId,parents:['1-fO04arPlwSpuWQ7T2--yzTS5pHEXyxr'],mimeType:'application/vnd.google-apps.folder',trashed:false,appProperties:{wybpBenchmarkRun:runId},permissions:[{type:'user',role:'owner'}]});
  const q=new URL(url).searchParams.get('q');assert.ok([root,...folders].some(id=>q.startsWith("'"+id+"'")));
  return Response.json({files:q.startsWith("'"+root+"'")?folders.map((id,i)=>({id,name:'partition_'+String(i).padStart(2,'0'),mimeType:'application/vnd.google-apps.folder',appProperties:{wybpBenchmarkRun:runId}})):foreign?[{id:'synthetic_foreign_file',name:'foreign.txt'}]:[]});
 };
 const upper={...Object.fromEntries(Object.keys(BENCHMARK_PHASES.B.caps).map(k=>[k,0])),external:30,reads:10,storageBytes:4096,transferBytes:100000};
 return {env,upper,options:{now:()=>now,pause:async ms=>{now+=ms;},request},calls:()=>calls,deletes:()=>deletes};
}
test('stopped failed preparation cleans only verified disposable contents without a restore receipt or expired coordinator',async()=>{
 const f=fixture(),outcome=await benchmarkCleanupRuntime(f.env,true,f.upper,f.options);
 assert.deepEqual(outcome.result,{removed:true,folders:17,files:0,parentPreserved:true});assert.equal(outcome.billingKnown,true);assert.equal(f.deletes(),1);assert.equal(outcome.usage.external,21);assert.equal(outcome.usage.writes,0);
});
test('unconfirmed stop, unresolved writer, foreign contents and exhausted envelope all prevent deletion',async()=>{
 const stopped=fixture();await assert.rejects(benchmarkCleanupRuntime(stopped.env,false,stopped.upper,stopped.options),/stop_required/);assert.equal(stopped.calls(),0);
 const busy=fixture({busy:true});await assert.rejects(benchmarkCleanupRuntime(busy.env,true,busy.upper,busy.options),/writer_unavailable/);assert.equal(busy.calls(),0);
 const foreign=fixture({foreign:true});await assert.rejects(benchmarkCleanupRuntime(foreign.env,true,foreign.upper,foreign.options),/scope_unverified/);assert.equal(foreign.deletes(),0);
 const bounded=fixture();bounded.upper.external=2;await assert.rejects(benchmarkCleanupRuntime(bounded.env,true,bounded.upper,bounded.options));assert.equal(bounded.deletes(),0);
});
