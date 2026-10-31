import test from 'node:test';import assert from 'node:assert/strict';
import {benchmarkDriveProbe} from '../../worker/benchmarkDriveProbe.mjs';
import {BENCHMARK_PHASES} from '../../scripts/approved-benchmark-budget.mjs';
const env={WYBP_BENCHMARK_PHASE:'B',WYBP_DRIVE_CLIENT_ID:'synthetic-client',WYBP_DRIVE_CLIENT_SECRET:'synthetic-secret',WYBP_DRIVE_REFRESH_TOKEN:'synthetic-refresh'};
const upper={...BENCHMARK_PHASES.B.caps};
test('private diagnostic whitelists OAuth rejection codes without exposing provider text or making file requests',async()=>{
 for(const code of ['invalid_grant','invalid_client','unauthorized_client','invalid_scope','untrusted-provider-text']){
  let calls=0;
  const output=await benchmarkDriveProbe(env,upper,{pause:async()=>{},request:async url=>{calls++;assert.equal(url,'https://oauth2.googleapis.com/token');return Response.json({error:code,error_description:'synthetic-secret-provider-body'},{status:400});}});
  assert.equal(calls,1);assert.equal(output.result.verified,false);assert.equal(output.result.driveFilesMutated,false);assert.equal(output.result.code,code==='untrusted-provider-text'?'unavailable':code);assert.equal(output.usage.external,1);assert.equal(output.billingKnown,true);assert.equal(JSON.stringify(output).includes('synthetic-'),false);
 }
});
test('successful refresh verifies usability without returning access tokens or touching Drive',async()=>{
 let calls=0;const output=await benchmarkDriveProbe(env,upper,{pause:async()=>{},request:async()=>{calls++;return Response.json({access_token:'synthetic-private-access',token_type:'Bearer',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'});}});
 assert.equal(calls,1);assert.deepEqual(output.result,{verified:true,stage:'oauth',driveFilesMutated:false});assert.equal(output.billingKnown,true);assert.equal(JSON.stringify(output).includes('synthetic'),false);
});
