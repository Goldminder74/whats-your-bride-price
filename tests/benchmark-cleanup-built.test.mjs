import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {resolve,join,sep} from 'node:path';import {spawnSync} from 'node:child_process';import {Miniflare} from 'miniflare';
test('compiled stopped-run recovery stays private and cannot run without confirmed stop',async()=>{
 const parent=resolve('outputs'),temp=await mkdtemp(join(parent,'synthetic-cleanup-built-'));assert.ok(temp.startsWith(parent+sep));let mf;
 try{
  await writeFile(join(temp,'wrangler.json'),JSON.stringify({name:'wybp-local-cleanup-check',main:resolve('worker/benchmarkCleanupEntrypoint.mjs'),compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],workers_dev:false}));
  const build=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--config',join(temp,'wrangler.json'),'--outdir',join(temp,'compiled')],{encoding:'utf8',windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}});assert.equal(build.status,0,'cleanup package compiles');
  mf=new Miniflare({workers:[{name:'cleanup',modules:true,scriptPath:join(temp,'compiled/benchmarkCleanupEntrypoint.js'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],outboundService:()=>assert.fail('provider access forbidden')},{name:'caller',modules:true,compatibilityDate:'2026-05-15',serviceBindings:{OP:{name:'cleanup',entrypoint:'BenchmarkOperator'}},script:`export default {async fetch(request,env){try{await env.OP.reconcileCommittedWriter(false,{});return new Response('unexpected',{status:500});}catch(e){return Response.json({blocked:e.message.includes('stop_required')});}}}`} ]});
  const worker=await mf.getWorker('cleanup');for(const path of ['/','/game','/reconcileCommittedWriter'])assert.equal((await worker.fetch('https://synthetic.invalid'+path,{method:'POST'})).status,404);
  const caller=await mf.getWorker('caller');assert.deepEqual(await(await caller.fetch('https://synthetic.invalid')).json(),{blocked:true});
 }finally{await mf?.dispose();assert.ok(temp.startsWith(parent+sep));await rm(temp,{recursive:true,force:true});}
});
