// Operator-only bounded transport. No application binding or public endpoint.
import {performance} from 'node:perf_hooks';
import {applyAuthorityRetentionAction} from '../worker/authorityService.mjs';
import {createOperationId} from './authority-runtime.mjs';
export function holdCapacityAttempt(service, attemptId, at) {
  return applyAuthorityRetentionAction(service, createOperationId(at), {
    operation:'hold',id:'capacity_hold',scope:'attempt',subjectId:attemptId,
    reason:'legal',evidenceHash:'a'.repeat(64),
  }, at);
}
export const CAPACITY_TARGET = Object.freeze({account:'b6b22a9a87b5758725e5c499782160af',name:'wybp-capacity-d1-r001'});
const protectedIds=new Set(['1a268b28-e6d5-4431-8f84-a886df9369f1','a5b2b409-ed08-48c9-ac1d-36699fc6c4b9']);
export class CapacityBudget {
  constructor({now=Date.now,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
    this.now=now;this.pause=pause;this.started=now();this.last=null;
    this.requests=0;this.reads=0;this.writes=0;this.bytes=0;this.timings=[];this.queue=Promise.resolve();
  }
  async admit({reserveWrites=0,reserveReads=0}={}) {
    const admission=this.queue.then(()=>this.admitSerial({reserveWrites,reserveReads}));
    this.queue=admission.catch(()=>{});
    return admission;
  }
  async admitSerial({reserveWrites=0,reserveReads=0}={}) {
    if(this.now()-this.started>=30*60*1000||this.requests>=800||this.writes+reserveWrites>=8000||this.reads+reserveReads>=80000||this.bytes>=80*1024*1024)throw Error('capacity_limit_stop');
    if(this.last!==null)await this.pause(Math.max(0,1000-(this.now()-this.last)));
    if(this.now()-this.started>=30*60*1000)throw Error('capacity_limit_stop');
    this.last=this.now();this.requests++;
  }
  observe(meta) {
    if(!Number.isSafeInteger(meta?.rows_read)||!Number.isSafeInteger(meta?.rows_written))throw Error('capacity_billing_unknown');
    this.reads+=meta.rows_read;this.writes+=meta.rows_written;
    if(this.reads>=80000||this.writes>=8000||Number(meta.size_after||0)>=8*1024*1024)throw Error('capacity_limit_stop');
  }
  receipt(){return {httpRequests:this.requests,billedRowsRead:this.reads,billedRowsWritten:this.writes,transferBytes:this.bytes,elapsedMs:this.now()-this.started};}
}
const construction=Symbol("capacity-connection");
export class CapacityD1 {
  static async connect({id,token,budget,fetch:request=globalThis.fetch}) {
    if(protectedIds.has(id)||!/^[a-f0-9-]{36}$/.test(id)||!token)throw Error('capacity_target_rejected');
    const db=new CapacityD1(id,token,budget,request,construction);
    const info=await db.call('',null,'GET');
    if(info.uuid!==id||info.name!==CAPACITY_TARGET.name)throw Error('capacity_identity_mismatch');
    return db;
  }
  constructor(id,token,budget,request,proof){if(proof!==construction)throw Error("capacity_connection_required");this.id=id;this.budget=budget;this.request=request;Object.defineProperty(this,'token',{value:token});}
  async requestBytes(url,options,reserve={}) {
    await this.budget.admit(reserve);const began=performance.now();
    const response=await this.request(url,{...options,redirect:'error'});
    if(!response.ok)throw Error('capacity_provider_http_'+response.status);
    const bytes=Buffer.from(await response.arrayBuffer());
    const upload=typeof options.body==='string'?Buffer.byteLength(options.body):
      ArrayBuffer.isView(options.body)||options.body instanceof ArrayBuffer?options.body.byteLength:0;
    this.budget.bytes+=bytes.length+upload;
    this.budget.timings.push(performance.now()-began);
    if(bytes.length>4*1024*1024||this.budget.bytes>=80*1024*1024)throw Error('capacity_transfer_stop');
    return {bytes,response};
  }
  async call(suffix,body,method='POST',reserve={}) {
    const {bytes}=await this.requestBytes(`https://api.cloudflare.com/client/v4/accounts/${CAPACITY_TARGET.account}/d1/database/${this.id}${suffix}`,{method,headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},reserve);
    const envelope=JSON.parse(bytes);if(envelope.success!==true)throw Error('capacity_provider_rejected');return envelope.result;
  }
  prepare(sql,params=[]) {
    const all=async()=>(await this.execute([{sql,params}]))[0];
    return {sql,params,bind:(...values)=>this.prepare(sql,values),all,run:all,async first(column){const row=(await all()).results[0]??null;return row&&column!==undefined?row[column]??null:row;}};
  }
  async execute(rows) {
    if(!Array.isArray(rows)||!rows.length||rows.length>100)throw Error('capacity_batch_bounds');
    const result=await this.call('/query',rows.length===1?rows[0]:{batch:rows},'POST',{reserveWrites:2000,reserveReads:5000});
    if(!Array.isArray(result)||result.length!==rows.length||result.some(row=>!row.success))throw Error('capacity_query_failed');
    for(const row of result)this.budget.observe(row.meta);
    return result;
  }
  batch(rows){return this.execute(rows.map(({sql,params=[]})=>({sql,params})));}
  async query(sql,params=[]){return (await this.execute([{sql,params}]))[0].results;}
}
