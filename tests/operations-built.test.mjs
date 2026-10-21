import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, createFetchMock } from 'miniflare';
import { resolve } from 'node:path';

// Run after the documented Wrangler dry-run. This exercises the deployment package,
// not a source-only mock, including actual WorkerEntrypoint RPC boundaries.
test('compiled operations Worker denies HTTP and missing configuration through private RPC',async()=>{
  const mf=new Miniflare({workers:[
    {name:'ops',modules:true,scriptPath:resolve('outputs/netlify-worker/operations/operations.js'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:{WYBP_TEST_ALERT_APPROVED:'false'}},
    {name:'caller',modules:true,compatibilityDate:'2026-05-15',serviceBindings:{APP:{name:'ops',entrypoint:'ApplicationAuthority'},OP:{name:'ops',entrypoint:'RecoveryOperator'}},script:`export default {async fetch(request,env){try {switch(new URL(request.url).pathname){case '/snapshot':await env.OP.snapshot('op_synthetic');break;case '/snapshot-step':await env.OP.snapshotStep('op_synthetic',null);break;case '/heartbeat':await env.OP.verifyHeartbeat();break;case '/maintenance':await env.OP.maintain('op_synthetic',50);break;case '/hosted-disabled':await env.OP.hostedSynthetic('step',{});break;case '/keycopy':await env.OP.verifyIndependentKeyCopy();break;case '/index':await env.OP.reconstructSyntheticIndex([],null);break;case '/credentials':await env.OP.verifyCredentials();break;case '/read':await env.APP.readFence();break;case '/mutate':await env.APP.transact('invalid',[]);break;case '/test':await env.OP.testAlert();break;case '/runtime':await env.OP.runtime();break;default:throw Error('unexpected');}return new Response('unsafe');}catch(error){return new Response(error.message,{status:503});}}}`},
  ]});
  try {
    const ops=await mf.getWorker('ops');
    for(const method of ['GET','POST'])assert.equal((await ops.fetch('https://synthetic.invalid/admin',{method})).status,404);
    const caller=await mf.getWorker('caller');
    for(const [route,message] of [['snapshot','operational_snapshot_disabled'],['snapshot-step','operational_snapshot_disabled'],['heartbeat','operational_monitor_configuration'],['maintenance','operational_maintenance_disabled'],['hosted-disabled','hosted_synthetic_recovery_disabled'],['keycopy','independent_key_verification_failed'],['index','synthetic_index_recovery_failed'],['credentials','credential_verification_failed_configuration'],['read','authority_read_unavailable'],['mutate','authority_operation_unavailable'],['test','test_alert_not_approved']]){
      const response=await caller.fetch('https://synthetic.invalid/'+route);assert.equal(response.status,503);assert.equal(await response.text(),message);
    }
    const runtime=await caller.fetch('https://synthetic.invalid/runtime');assert.equal(runtime.status,503);assert.notEqual(await runtime.text(),'unsafe');
  }finally{await mf.dispose();}
});

test('compiled private credential probe refreshes OAuth and verifies encryption without returning credentials',async()=>{
 const agent=createFetchMock();agent.disableNetConnect();
 agent.get('https://oauth2.googleapis.com').intercept({path:'/token',method:'POST'}).reply(200,JSON.stringify({access_token:'synthetic-access',token_type:'Bearer',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'}));
 const mf=new Miniflare({workers:[
  {name:'ops',modules:true,scriptPath:resolve('outputs/netlify-worker/operations/operations.js'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],fetchMock:agent,bindings:{WYBP_AUTHORITY_ROLE:'production-ops',WYBP_AUTHORITY_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),WYBP_DRIVE_CLIENT_ID:'synthetic-client',WYBP_DRIVE_CLIENT_SECRET:'synthetic-secret',WYBP_DRIVE_REFRESH_TOKEN:'synthetic-refresh'}},
  {name:'caller',modules:true,compatibilityDate:'2026-05-15',serviceBindings:{OP:{name:'ops',entrypoint:'RecoveryOperator'}},script:`export default {async fetch(request,env){return Response.json(await env.OP.verifyCredentials());}}`}
 ]});
 try{const caller=await mf.getWorker('caller');const response=await caller.fetch('https://synthetic.invalid/');assert.deepEqual(await response.json(),{oauthRefreshVerified:true,encryptionRoundTripVerified:true});agent.assertNoPendingInterceptors();}finally{await mf.dispose();await agent.close();}
});

test('compiled heartbeat probe needs no database or activation and returns no monitoring credential',async()=>{
 const agent=createFetchMock();agent.disableNetConnect();
 agent.get('https://hc-ping.com').intercept({path:'/synthetic',method:'POST'}).reply(200,'OK');
 const mf=new Miniflare({workers:[
  {name:'ops',modules:true,scriptPath:resolve('outputs/netlify-worker/operations/operations.js'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],fetchMock:agent,bindings:{WYBP_AUTHORITY_ROLE:'production-ops',WYBP_HEARTBEAT_URL:'https://hc-ping.com/synthetic',WYBP_HEARTBEAT_HOST:'hc-ping.com',WYBP_OPERATIONS_ENABLED:'false'}},
  {name:'caller',modules:true,compatibilityDate:'2026-05-15',serviceBindings:{OP:{name:'ops',entrypoint:'RecoveryOperator'}},script:`export default {async fetch(request,env){return Response.json(await env.OP.verifyHeartbeat());}}`}
 ]});
 try{const caller=await mf.getWorker('caller');const response=await caller.fetch('https://synthetic.invalid/');assert.deepEqual(await response.json(),{accepted:true,synthetic:true});agent.assertNoPendingInterceptors();}finally{await mf.dispose();await agent.close();}
});
