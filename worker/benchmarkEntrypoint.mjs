import {WorkerEntrypoint} from 'cloudflare:workers';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {benchmarkRuntime,BENCHMARK_ORIGIN,provisionBenchmarkFolders} from './benchmarkRuntime.mjs';
import {netlifyIngress} from './netlifyIngress.ts';
const deny=()=>new Response(null,{status:404,headers:{'cache-control':'private, no-store'}});
const allowed=new Set(['start','answer','recover','complete','result']);
const equal=(a,b)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());

// Recovery/authority functions have private service bindings ONLY. There is no
// HTTP bridge to these methods, no scheduled handler and no Stripe endpoint.
export class BenchmarkAuthority extends WorkerEntrypoint {
 async invoke(method,args,upper){
  const runtime=benchmarkRuntime(this.env,upper);
  try{
   if(!['transact','readFence','flush','ready'].includes(method)||!Array.isArray(args))throw Error();
   const value=await runtime.service[method](...args);return {value,usage:runtime.meter.receipt(),billingKnown:true};
  }catch{return {failed:true,usage:runtime.meter.observed(),billingKnown:runtime.meter.billingKnown()};}
 }
 fetch(){return deny();}
}
export class BenchmarkPlayer extends WorkerEntrypoint {
 async execute(command,upper){
  if(!allowed.has(command?.kind))throw Error('benchmark_game_unavailable');
  const runtime=benchmarkRuntime(this.env,upper);runtime.meter.add('internal',1);return runtime.run(command);
 }
 fetch(){return deny();}
}
export class BenchmarkOperator extends WorkerEntrypoint {
 async provision(upper){return provisionBenchmarkFolders(this.env,upper);}
 async cleanup(stopped,upper){const runtime=benchmarkRuntime(this.env,upper);runtime.meter.add('internal',1);return runtime.cleanup(stopped);}
 async execute(command,upper){const runtime=benchmarkRuntime(this.env,upper);runtime.meter.add('internal',1);return runtime.run(command);}
 fetch(){return deny();}
}
export default {
 async fetch(request,env){
  return netlifyIngress(request,env,{environment:'test',origin:BENCHMARK_ORIGIN},async trusted=>{
   if(typeof env.WYBP_BENCHMARK_ACCESS!=='string'||env.WYBP_BENCHMARK_ACCESS.length<32||!equal(trusted.headers.get('authorization')||'','Basic '+env.WYBP_BENCHMARK_ACCESS))return new Response(null,{status:401,headers:{'www-authenticate':'Basic realm="Private synthetic benchmark"','cache-control':'private, no-store'}});
   const url=new URL(trusted.url);
   if(trusted.method==='GET'&&url.pathname==='/')return new Response('Private synthetic capacity benchmark. No customer payments.',{headers:{'content-type':'text/plain; charset=utf-8'}});
   if(['GET','HEAD'].includes(trusted.method)&&/^\/(?:regions|avatars|quiz-art)\/[a-zA-Z0-9_./-]+\.(?:webp|svg|png|jpg)$/.test(url.pathname)&&!url.pathname.includes('..'))return env.ASSETS.fetch(trusted);
   if(trusted.method!=='POST'||url.pathname!=='/game'||trusted.headers.get('origin')!==BENCHMARK_ORIGIN||!trusted.headers.get('content-type')?.startsWith('application/json'))return deny();
   try{
    const body=await trusted.text();if(Buffer.byteLength(body)>4096)throw Error();
    const timestamp=trusted.headers.get('x-wybp-benchmark-time')||'',signature=trusted.headers.get('x-wybp-benchmark-signature')||'';
    if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>30000||typeof env.WYBP_BENCHMARK_CONTROLLER_SECRET!=='string'||env.WYBP_BENCHMARK_CONTROLLER_SECRET.length<32||!/^[a-f0-9]{64}$/.test(signature))throw Error();
    const expected=createHmac('sha256',env.WYBP_BENCHMARK_CONTROLLER_SECRET).update(timestamp+'\n'+body).digest('hex');if(!equal(signature,expected))throw Error();
    const {command,upper}=JSON.parse(body);if(!allowed.has(command?.kind)||!/^synthetic_[a-zA-Z0-9_-]{1,60}$/.test(command.identity||''))throw Error();
    return Response.json(await env.BENCHMARK_PLAYER.execute(command,upper),{headers:{'cache-control':'private, no-store'}});
   }catch{return new Response(null,{status:503,headers:{'cache-control':'private, no-store'}});}
  });
 },
};
