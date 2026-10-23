import {randomUUID,createHash} from 'node:crypto';
export function sharedBenchmarkRequest(env,meter){
 if(!env.BENCHMARK_PACING)return undefined;
 const pacing=env.BENCHMARK_PACING.getByName('synthetic_r002_shared');
 return async(input,init={})=>{
  const body=init.body==null?null:init.body instanceof URLSearchParams?new TextEncoder().encode(init.body.toString()):typeof init.body==='string'?new TextEncoder().encode(init.body):new Uint8Array(init.body.buffer||init.body,init.body.byteOffset||0,init.body.byteLength);
  const result=await pacing.dispatch({id:createHash('sha256').update(randomUUID()).digest('hex'),phase:env.WYBP_BENCHMARK_PHASE,url:typeof input==='string'?input:input.url,method:init.method||'GET',headers:Object.fromEntries(new Headers(init.headers)),body});
  if(result.billingKnown!==true)throw Error('benchmark_shared_billing_unknown');
  meter.coordinator(result.counters,result.timing);
  return new Response(result.body.length?result.body:null,{status:result.status,headers:result.headers});
 };
}
