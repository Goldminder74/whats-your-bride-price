import {retainedVector,retainedZero,RETAINED_CAPS,RETAINED_GAUGES} from './retainedBenchmarkPolicy.mjs';
const integer=n=>Number.isSafeInteger(n)&&n>=0,fail=()=>{throw Error('retained_meter_unknown');};
export function retainedMeter(upper,{now=Date.now,provider}={}){
 retainedVector(upper);if(Object.keys(RETAINED_CAPS).some(k=>upper[k]>RETAINED_CAPS[k]))fail();
 const used=retainedZero(),timing={databaseMs:0,providerWaitMs:0,providerFetchMs:0,authorityRpcMs:0};let known=true,sourceSize=0,mirrorSize=0;
 function add(k,n){if(!known||!Object.hasOwn(used,k)||!integer(n))fail();used[k]=RETAINED_GAUGES.includes(k)?Math.max(used[k],n):used[k]+n;if(used[k]>upper[k]){known=false;fail();}}
 function merge(v){retainedVector(v);for(const k of Object.keys(used))add(k,v[k]);}
 function database(binding,{mirror=false}={}){
  if(!binding?.prepare||!binding?.batch)fail();const plans=new WeakMap();
  async function observe(work){const at=now();try{
   const result=await work(),rows=Array.isArray(result)?result:[result];
   for(const r of rows){if(r?.success!==true||!integer(r.meta?.rows_read)||!integer(r.meta?.rows_written)||!integer(r.meta?.size_after)||r.meta.size_after>8000000000)fail();add('reads',r.meta.rows_read);add('writes',r.meta.rows_written);if(mirror)mirrorSize=Math.max(mirrorSize,r.meta.size_after);else sourceSize=Math.max(sourceSize,r.meta.size_after);add('storageBytes',sourceSize+mirrorSize);}return result;
  }catch{known=false;fail();}finally{timing.databaseMs+=Math.max(0,now()-at);}}
  function prepare(sql,args=[]){const raw=binding.prepare(sql).bind(...args),s={bind:(...p)=>prepare(sql,p),all:()=>observe(()=>raw.all()),run:()=>observe(()=>raw.run()),async first(column){const r=(await s.all()).results?.[0]??null;return column===undefined?r:r?.[column]??null;}};plans.set(s,raw);return s;}
  return {prepare,batch:rows=>{if(!Array.isArray(rows)||rows.some(r=>!plans.has(r)))fail();return observe(()=>binding.batch(rows.map(r=>plans.get(r))));}};
 }
 async function fetcher(input,init={}){
  if(typeof provider!=='function')fail();add('external',1);const body=init.body;
  const bytes=body==null?0:typeof body==='string'?Buffer.byteLength(body):body instanceof URLSearchParams?Buffer.byteLength(body.toString()):body instanceof ArrayBuffer||ArrayBuffer.isView(body)?body.byteLength:null;
  if(bytes===null)fail();add('transferBytes',bytes);
  const url=new URL(typeof input==='string'?input:input.url||String(input));
  if(url.hostname==='www.googleapis.com'&&url.pathname==='/upload/drive/v3/files'&&init.method==='POST'){
   if(!ArrayBuffer.isView(body))fail();const b=Buffer.from(body.buffer,body.byteOffset,body.byteLength),marker=Buffer.from('Content-Type: application/octet-stream\r\n\r\n'),start=b.indexOf(marker),end=b.lastIndexOf(Buffer.from('\r\n--'));if(start<0||end<start+marker.length)fail();add('driveObjects',1);add('driveBytes',end-start-marker.length);
  }
  try{
   const value=await provider(input,init);if(value?.billingKnown!==true||!value.response||!value.timing)fail();
   timing.providerWaitMs+=value.timing.pacingWaitMs;timing.providerFetchMs+=value.timing.fetchMs;
   const parts=[];let total=0;const reader=value.response.body?.getReader();if(reader)try{for(;;){const r=await reader.read();if(r.done)break;total+=r.value.byteLength;if(total>4000000)fail();add('transferBytes',r.value.byteLength);parts.push(Buffer.from(r.value));}}catch{await reader.cancel().catch(()=>{});fail();}
   return new Response(parts.length?Buffer.concat(parts):null,{status:value.response.status,headers:value.response.headers});
  }catch{known=false;fail();}
 }
 return {add,merge,database,fetcher,sizes:()=>({source:sourceSize,mirror:mirrorSize}),mergeSizes:v=>{if(!v||Object.keys(v).sort().join()!=='mirror,source'||Object.values(v).some(n=>!integer(n)||n>8000000000))fail();sourceSize=Math.max(sourceSize,v.source);mirrorSize=Math.max(mirrorSize,v.mirror);add('storageBytes',sourceSize+mirrorSize);},remaining:()=>Object.fromEntries(Object.keys(upper).map(k=>[k,RETAINED_GAUGES.includes(k)?upper[k]:upper[k]-used[k]])),markUnknown:()=>{known=false;},billingKnown:()=>known,observed:()=>({...used}),timing:()=>({...timing}),authorityTime:ms=>{if(!integer(ms))fail();timing.authorityRpcMs+=ms;},mergeTiming:v=>{if(!v||Object.keys(timing).some(k=>!integer(v[k])))fail();for(const k of Object.keys(timing))timing[k]+=v[k];},receipt:()=>{if(!known)fail();return {...used};}};
}
