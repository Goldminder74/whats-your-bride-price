import {BENCHMARK_PHASES} from '../scripts/approved-benchmark-budget.mjs';
const failure=()=>{throw Error('benchmark_meter_unavailable');};
const integer=n=>Number.isSafeInteger(n)&&n>=0;

/** Per-private-RPC observation. The controller MUST reserve this entire upper
 * vector in its durable SQLite journal before invoking the RPC. No responses,
 * SQL, URLs, identifiers, tokens or record contents enter a metric/exception.
 * This is not a provider currency cap or an alternative to durable admission.
 */
export function benchmarkMeter({phase,upper,now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms)),request=(input,init)=>globalThis.fetch(input,init)}){
 const limits=BENCHMARK_PHASES[phase],keys=Object.keys(limits?.caps||{});
 if(!limits||!upper||keys.length!==Object.keys(upper).length||keys.some(k=>!integer(upper[k])||upper[k]>limits.caps[k]))failure();
 const used=Object.fromEntries(keys.map(k=>[k,0]));let failed=false,nextFetch=now()+1000/limits.externalPerSecond,queue=Promise.resolve();
 function add(key,n){if(failed||!integer(n)||!Object.hasOwn(used,key))failure();used[key]=key==='storageBytes'?Math.max(used[key],n):used[key]+n;if(!integer(used[key])||used[key]>upper[key]){failed=true;failure();}}
 function observe(result){
  const rows=Array.isArray(result)?result:[result];
  for(const row of rows){if(row?.success!==true||!integer(row.meta?.rows_read)||!integer(row.meta?.rows_written)||!integer(row.meta?.size_after)){failed=true;failure();}
   add('reads',row.meta.rows_read);add('writes',row.meta.rows_written);add('storageBytes',row.meta.size_after);
  }return result;
 }
 function database(binding){
  if(!binding?.prepare||!binding?.batch)failure();const plans=new WeakMap();
  function prepare(sql,params=[]){
   const raw=binding.prepare(sql).bind(...params);
   const statement={bind:(...values)=>prepare(sql,values),all:()=>observedCall(()=>raw.all()),run:()=>observedCall(()=>raw.run()),
    async first(column){const result=await statement.all(),row=result.results?.[0]??null;return row&&column!==undefined?row[column]??null:row;}};
   plans.set(statement,raw);return statement;
  }
  return {prepare,async batch(statements){if(!Array.isArray(statements)||statements.some(s=>!plans.has(s)))failure();return observedCall(()=>binding.batch(statements.map(s=>plans.get(s))));}};
 }
 async function observedCall(work){try{return observe(await work());}catch{failed=true;failure();}}
 async function fetcher(input,init={}){
  // Serial provider requests share an invocation's rate clock. The controller
  // must serialize reservations across invocations; do not assume this is global.
  const work=queue.then(async()=>{
   if(failed)failure();const wait=nextFetch-now();if(wait>0)await pause(wait);
   nextFetch=now()+1000/limits.externalPerSecond;add('external',1);
   let bytes;
   if(init.body===undefined||init.body===null)bytes=0;
   else if(typeof init.body==='string')bytes=Buffer.byteLength(init.body);
   else if(init.body instanceof URLSearchParams)bytes=Buffer.byteLength(init.body.toString());
   else if(init.body instanceof ArrayBuffer||ArrayBuffer.isView(init.body))bytes=init.body.byteLength;
   else {failed=true;failure();} // Unmetered streaming uploads are forbidden.
   add('transferBytes',bytes);
   const url=new URL(typeof input==='string'?input:input.url||String(input));
   if(url.hostname==='www.googleapis.com'&&url.pathname==='/upload/drive/v3/files'&&init.method==='POST'){
    if(!ArrayBuffer.isView(init.body))failure();const raw=Buffer.from(init.body.buffer,init.body.byteOffset,init.body.byteLength),marker=Buffer.from('Content-Type: application/octet-stream\r\n\r\n');
    const start=raw.indexOf(marker),end=raw.lastIndexOf(Buffer.from('\r\n--'));if(start<0||end<start+marker.length)failure();
    add('driveObjects',1);add('driveBytes',end-start-marker.length);
   }
   let response;try{response=await request(input,{...init,redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{failed=true;failure();}
   const reader=response.body?.getReader(),parts=[];let total=0;
   if(reader){try{for(;;){const item=await reader.read();if(item.done)break;total+=item.value.byteLength;add('transferBytes',item.value.byteLength);if(total>4*1024*1024){failed=true;failure();}parts.push(item.value);}}catch{await reader.cancel().catch(()=>{});failed=true;failure();}}
   return new Response(parts.length?Buffer.concat(parts.map(p=>Buffer.from(p))):null,{status:response.status,statusText:response.statusText,headers:response.headers});
  });queue=work.catch(()=>{});return work;
 }
 function authority(service){return Object.fromEntries(['transact','readFence','flush','ready','mutate'].filter(k=>typeof service[k]==='function').map(k=>[k,async(...args)=>{add('internal',1);return service[k](...args);} ]));}
 function merge(value){if(!value||Object.keys(value).length!==keys.length||keys.some(k=>!integer(value[k]))){failed=true;failure();}for(const k of keys)add(k,value[k]);}
 return {database,fetcher,authority,add,merge,observed:()=>({...used}),billingKnown:()=>!failed,markUncertain:()=>{failed=true;},receipt(){if(failed)failure();return {...used};}};
}
