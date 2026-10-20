// Fixed isolated endpoints only. Credentials are supplied in memory by the
// secure operator process; this module never loads, prints or persists them.
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {BENCHMARK_PHASES} from './approved-benchmark-budget.mjs';
const origin='https://wybp-capacity-private-r002.netlify.app';
const fail=()=>{throw Error('hosted_benchmark_adapter_unavailable');};
const hash=value=>createHash('sha256').update(value).digest('hex');
const gameKinds=new Set(['start','answer','recover','complete','result']);

export function hostedBenchmarkAdapter({phase,operator,access,controllerSecret,workerOrigin,sourceSha256,assets,bounds,sharedPacing=false,now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms)),request=fetch}){
 const limits=BENCHMARK_PHASES[phase];
 if(!limits||typeof operator?.execute!=='function'||typeof access!=='string'||access.length<32||typeof controllerSecret!=='string'||controllerSecret.length<32||!/^https:\/\/wybp-capacity-worker-r002\.[a-z0-9-]+\.workers\.dev$/.test(workerOrigin||'')||!/^[a-f0-9]{64}$/.test(sourceSha256||'')||!assets||typeof bounds!=='function')fail();
 const keys=Object.keys(limits.caps),profiles=new WeakMap(),zero=()=>{const usage=Object.fromEntries(keys.map(k=>[k,0]));profiles.set(usage,{clientPacingMs:0,clientFetchMs:0,databaseMs:0,providerPacingMs:0,providerFetchMs:0,authorityRpcMs:0});return usage;};
 function timing(usage,value){const target=profiles.get(usage);if(!value||Object.keys(value).some(k=>!Object.hasOwn(target,k)||!Number.isSafeInteger(value[k])||value[k]<0))fail();for(const [k,n] of Object.entries(value))target[k]+=n;}
 if(sharedPacing&&typeof operator.dispatchHttp!=='function')fail();
 let nextRequest=now();const plans=new Map(),regions=new Map();
 async function http(url,{authenticated=false,method='GET',body,headers={}}={},usage){
  const delay=sharedPacing?0:nextRequest-now();if(delay>0)await pause(delay);
  nextRequest=now()+1000/limits.externalPerSecond;
  usage.external++;
  if(body)usage.transferBytes+=Buffer.byteLength(body);
  const sentHeaders={...headers,...(authenticated?{authorization:'Basic '+access}:{})};let response;
  if(sharedPacing){
   const result=await operator.dispatchHttp({id:hash(Buffer.from(randomUUID())),phase,url,method,headers:sentHeaders,body:body?new TextEncoder().encode(body):null});
   if(result.billingKnown!==true||!result.counters||['reads','writes','storageBytes'].some(k=>!Number.isSafeInteger(result.counters[k])||result.counters[k]<0))fail();
   timing(usage,{clientPacingMs:result.timing?.pacingWaitMs,clientFetchMs:result.timing?.fetchMs});
   usage.internal++;usage.reads+=result.counters.reads;usage.writes+=result.counters.writes;usage.storageBytes=Math.max(usage.storageBytes,result.counters.storageBytes);
   response=new Response(result.body.length?result.body:null,{status:result.status,headers:result.headers});
  }else response=await request(url,{method,body,headers:sentHeaders,redirect:'manual',signal:AbortSignal.timeout(30000)});
  const parts=[];let length=0;const reader=response.body?.getReader();
  try{if(reader)for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;usage.transferBytes+=part.value.byteLength;if(length>4000000)fail();parts.push(part.value);}}catch{await reader?.cancel().catch(()=>{});fail();}
  return {status:response.status,bytes:Buffer.concat(parts.map(p=>Buffer.from(p)))};
 }
 function merge(usage,observed){
  if(!observed||Object.keys(observed).length!==keys.length||keys.some(k=>!Number.isSafeInteger(observed[k])||observed[k]<0))fail();
  for(const k of keys)usage[k]=k==='storageBytes'?Math.max(usage[k],observed[k]):usage[k]+observed[k];
 }
 function upperBound(command){const value=bounds(command);if(!value||Object.keys(value).length!==keys.length||keys.some(k=>!Number.isSafeInteger(value[k])||value[k]<0||value[k]>limits.caps[k]))fail();return {...value};}
 async function invoke(command,usage){
  const upper=upperBound(command);
  // Reserve response/HTTP/asset overhead before passing the remainder to the
  // Worker. The durable driver has already admitted the whole upper vector.
  const remote={...upper,external:upper.external-8,transferBytes:upper.transferBytes-4000000};
  if(remote.external<0||remote.transferBytes<0)fail();
  let outcome;
  if(gameKinds.has(command.kind)){
   const body=JSON.stringify({command,upper:remote}),at=String(now());
   const response=await http(origin+'/game',{authenticated:true,method:'POST',body,headers:{origin,'content-type':'application/json','x-wybp-benchmark-time':at,'x-wybp-benchmark-signature':createHmac('sha256',controllerSecret).update(at+'\n'+body).digest('hex')}},usage);
   if(response.status!==200)fail();try{outcome=JSON.parse(response.bytes.toString());}catch{fail();}
  }else outcome=command.kind==='provision'?await operator.provision(remote):await operator.execute(command,remote);
  if(outcome?.billingKnown!==true)fail();
  merge(usage,outcome.usage);if(outcome.timing)timing(usage,outcome.timing);
  nextRequest=Math.max(nextRequest,now()+1000/limits.externalPerSecond);
  if(!outcome?.result||!/^[a-f0-9]{64}$/.test(outcome.receiptSha256||''))fail();
  if(!outcome.result.failed&&hash(Buffer.from(JSON.stringify(outcome.result)))!==outcome.receiptSha256)fail();
  return outcome.result;
 }
 async function checkAsset(path,usage){
  const expected=assets[path];if(!expected||!Number.isSafeInteger(expected.bytes)||!/^[a-f0-9]{64}$/.test(expected.sha256||''))fail();
  const response=await http(origin+path,{authenticated:true},usage);
  if(response.status!==200||response.bytes.length!==expected.bytes||hash(response.bytes)!==expected.sha256)fail();
 }
 function receipt(result,usage){return {result,usage,timing:{...profiles.get(usage)},receiptSha256:hash(Buffer.from(JSON.stringify({result,usage})))};}
 return {phase,pacedExternal:true,sharedPacing,upperBound,
  async verifyInventory(){
   const usage=zero();
   if((await http(origin+'/',{},usage)).status!==401||(await http(workerOrigin+'/',{},usage)).status!==404||(await http(origin+'/',{authenticated:true},usage)).status!==200)fail();
   await checkAsset('/avatars/adjoa-v2.webp',usage);
   const result=await invoke({kind:'inventory'},usage);
   if(result.failed||result.sourceSha256!==sourceSha256)fail();
   return receipt({...result,privateIngressVerified:true},usage);
  },
  async execute(command){
   let requestCommand=command;
   if(command.kind==='answer'){
    const plan=plans.get(command.identity);if(!plan||!Number.isInteger(command.question)||command.question<1||command.question>12)fail();
    requestCommand={...command,...plan[command.question-1]};
   }
   const usage=zero(),result=await invoke(requestCommand,usage);
   if(command.kind==='start'&&!result.failed){
    if(!Array.isArray(result.answerPlan)||result.answerPlan.length!==12||result.answerPlan.some(p=>typeof p.questionRef!=='string'||!Array.isArray(p.selectedOptionIds)||p.selectedOptionIds.length!==1||typeof p.selectedOptionIds[0]!=='string'||!Array.isArray(p.assetRefs)||p.assetRefs.length>8||p.assetRefs.some(path=>typeof path!=='string'||!path.startsWith('/quiz-art/'+command.region+'-')||!assets[path])))fail();
    plans.set(command.identity,result.answerPlan);regions.set(command.identity,command.region);
   }
   if(['start','recover'].includes(command.kind)&&!result.failed){
    const region=regions.get(command.identity),slug={west:'west-africa',east:'east-africa',central:'central-africa',north:'north-africa',south:'southern-africa'}[region];if(!slug)fail();
    for(const path of ['/regions/'+slug+'.webp','/avatars/adjoa-v2.webp'])await checkAsset(path,usage);
   }
   if(['answer','recover'].includes(command.kind)&&!result.failed){
    const entry=plans.get(command.identity)?.[command.kind==='answer'?command.question-1:7];if(!entry)fail();
    // Signed private responses are no-store. Exercise each displayed image,
    // including the current question after refresh, rather than two placeholders.
    for(const path of entry.assetRefs)await checkAsset(path,usage);
   }
   if(command.kind==='result'&&!result.failed){
    const region=command.region;
    const slug={west:'west-africa',east:'east-africa',central:'central-africa',north:'north-africa',south:'southern-africa'}[region];
    if(!slug)fail();
    for(const path of ['/regions/'+slug+'.webp','/avatars/adjoa-v2.webp','/quiz-art/'+region+'-0.webp','/quiz-art/'+region+'-7.webp'])await checkAsset(path,usage);
   }
   return receipt(result,usage);
  },
 };
}
