import {driveAccessToken} from './driveOAuth.mjs';
import {benchmarkMeter} from './benchmarkMeter.mjs';
import {sharedBenchmarkRequest} from './benchmarkPacingBridge.mjs';
// Private diagnostic only: token refresh has no Drive file mutation. Never return
// provider text, token, credential, URL or identity; unknown failures stay opaque.
export async function benchmarkDriveProbe(env,upper,{request,now=Date.now,pause}={}){
 let meter;
 const paced=(...args)=>(sharedBenchmarkRequest(env,meter)||request||((...v)=>globalThis.fetch(...v)))(...args);
 meter=benchmarkMeter({phase:env.WYBP_BENCHMARK_PHASE,upper,request:paced,now,pause});
 let result;
 try{
  const token=driveAccessToken({clientId:env.WYBP_DRIVE_CLIENT_ID,clientSecret:env.WYBP_DRIVE_CLIENT_SECRET,refreshToken:env.WYBP_DRIVE_REFRESH_TOKEN,fetcher:meter.fetcher,now});
  await token();result={verified:true,stage:'oauth',driveFilesMutated:false};
 }catch(error){
  const code=error.message==='drive_oauth_refresh'&&['invalid_grant','invalid_client','unauthorized_client','invalid_scope'].includes(error.cause)?error.cause:'unavailable';
  result={verified:false,stage:'oauth',code,driveFilesMutated:false};
 }
 return {result,usage:meter.observed(),billingKnown:meter.billingKnown()};
}
