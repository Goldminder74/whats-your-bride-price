import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { resolve } from 'node:path';

// Run after the documented Wrangler dry-run. This exercises the deployment package,
// not a source-only mock, including actual WorkerEntrypoint RPC boundaries.
test('compiled operations Worker denies HTTP and missing configuration through private RPC',async()=>{
  const mf=new Miniflare({workers:[
    {name:'ops',modules:true,scriptPath:resolve('outputs/netlify-worker/operations/operations.js'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:{WYBP_TEST_ALERT_APPROVED:'false'}},
    {name:'caller',modules:true,compatibilityDate:'2026-05-15',serviceBindings:{APP:{name:'ops',entrypoint:'ApplicationAuthority'},OP:{name:'ops',entrypoint:'RecoveryOperator'}},script:`export default {async fetch(request,env){try {switch(new URL(request.url).pathname){case '/read':await env.APP.readFence();break;case '/mutate':await env.APP.transact('invalid',[]);break;case '/test':await env.OP.testAlert();break;case '/runtime':await env.OP.runtime();break;default:throw Error('unexpected');}return new Response('unsafe');}catch(error){return new Response(error.message,{status:503});}}}`},
  ]});
  try {
    const ops=await mf.getWorker('ops');
    for(const method of ['GET','POST'])assert.equal((await ops.fetch('https://synthetic.invalid/admin',{method})).status,404);
    const caller=await mf.getWorker('caller');
    for(const [route,message] of [['read','authority_read_unavailable'],['mutate','authority_operation_unavailable'],['test','test_alert_not_approved']]){
      const response=await caller.fetch('https://synthetic.invalid/'+route);assert.equal(response.status,503);assert.equal(await response.text(),message);
    }
    const runtime=await caller.fetch('https://synthetic.invalid/runtime');assert.equal(runtime.status,503);assert.notEqual(await runtime.text(),'unsafe');
  }finally{await mf.dispose();}
});
