import {WorkerEntrypoint} from 'cloudflare:workers';
import {retainedGameStep} from './retainedGameSteps.mjs';
import {retainedPressureBatch} from './retainedPressure.mjs';
import {createHmac} from 'node:crypto';
import {installedRetainedGrant,retainedHash,RETAINED_ORIGIN} from './retainedBenchmarkPolicy.mjs';
const fail=()=>{throw Error('retained_job_unavailable');};
export class RetainedJobRunner extends WorkerEntrypoint{
 async execute(job){
  installedRetainedGrant(this.env);const d=job.definition,step=job.step;
  if(d.flow==='pressure'){
   const state=job.state||{};
   if(!state.files){const batch=retainedPressureBatch(d,state,Buffer.from(this.env.WYBP_BENCHMARK_KEY_BASE64,'base64'));return {known:true,receipt:retainedHash(batch.files.map(f=>[f.name,retainedHash(f.ciphertext)])),done:false,state:batch};}
   const result=await this.env.RETAINED_OPERATOR.step({id:'retained_pressure_'+d.id.slice(0,24)+'_'+step,kind:'custody-put-batch',files:state.files},d.upper);
   if(result?.billingKnown!==true||result.failed||result.value?.objects?.length!==state.files.length)fail();
   return {known:true,receipt:result.receiptSha256,done:state.cursor.uploaded===d.count,state:{cursor:state.cursor}};
  }
  if(d.flow==='operator-loop'||d.flow==='cleanup-loop'){
   const command={...d.command,id:'retained_job_'+d.id.slice(0,20)+'_'+step,...(job.state?.progress?{progress:job.state.progress}:{}),...(job.state?.cursor?{cursor:job.state.cursor}:{})},r=await this.env.RETAINED_OPERATOR.step(command,d.upper);if(r?.billingKnown!==true||r.failed)fail();
   return {known:true,receipt:r.receiptSha256,done:d.doneField==='once'||r.value?.[d.doneField]===true,state:{progress:r.value?.progress||null,cursor:r.value?.cursor||null}};
  }
  if(!['game','incomplete','traffic'].includes(d.flow))fail();
  const credential=createHmac('sha256',this.env.WYBP_BENCHMARK_KEY_BASE64).update('synthetic-game:'+d.id).digest('hex').slice(0,32),state=job.state||{},id=retainedHash(['game-domain-id',d.id]).slice(0,32);
  const action=d.flow==='traffic'?{path:d.path,value:d.value}:retainedGameStep(d,state,step,credential,id),{path,value}=action;
  const method=value===undefined?'GET':'POST',body=value===undefined?'':JSON.stringify(value),url=RETAINED_ORIGIN+path,operation=retainedHash([d.id,step]),upperText=JSON.stringify(d.upper),at=String(Date.now()),identity=retainedHash([method,url,Buffer.from(body).toString('base64'),upperText]),signature=createHmac('sha256',this.env.WYBP_RETAINED_CONTROLLER_SECRET).update([at,operation,identity].join('\n')).digest('hex');
  const response=await this.env.RETAINED_APPLICATION.fetch(new Request(url,{method,headers:{authorization:'Bearer '+this.env.WYBP_PRIVATE_ACCESS_TOKEN,origin:RETAINED_ORIGIN,'sec-fetch-site':'same-origin','sec-fetch-mode':'cors','content-type':'application/json','x-wybp-time':at,'x-wybp-operation':operation,'x-wybp-upper':upperText,'x-wybp-signature':signature},...(body?{body}:{})}));
  if((d.flow==='traffic'?response.status!==d.expectedStatus:!response.ok)||!/^[a-f0-9]{64}$/.test(response.headers.get('x-wybp-receipt')||''))fail();
  if(action.selection){state.selection=await response.json();if(state.selection.questions?.length!==12)fail();}
  else if(action.completion){const result=await response.json();if(result.completed!==true)fail();state.resultSlug=result.resultSlug;}
  else if(action.answer){const reply=await response.json();if(reply.accepted!==true)fail();}
  else await response.arrayBuffer();
  // A deterministic3% of request steps repeat the exact operation identity.
  // The HTTP ledger counts this arrival but never replays its domain effects.
  if(d.retries===true&&parseInt(operation.slice(0,6),16)%100<3){const duplicate=await this.env.RETAINED_APPLICATION.fetch(new Request(url,{method,headers:{authorization:'Bearer '+this.env.WYBP_PRIVATE_ACCESS_TOKEN,origin:RETAINED_ORIGIN,'sec-fetch-site':'same-origin','sec-fetch-mode':'cors','content-type':'application/json','x-wybp-time':at,'x-wybp-operation':operation,'x-wybp-upper':upperText,'x-wybp-signature':signature},...(body?{body}:{})}));if(duplicate.status!==response.status||duplicate.headers.get('x-wybp-receipt')!==response.headers.get('x-wybp-receipt'))fail();await duplicate.arrayBuffer();}
  return {known:true,receipt:response.headers.get('x-wybp-receipt'),done:step+1===d.maxSteps,state};
 }
 fetch(){return new Response(null,{status:404});}
}
