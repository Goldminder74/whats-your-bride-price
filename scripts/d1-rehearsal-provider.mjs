// Operator-only Cloudflare transport. Authentication is injected at runtime, never persisted.
import { RETENTION_POLICY, RETENTION_DAY } from '../db/retentionPolicy.ts';
import { createHash } from 'node:crypto';
import { encryptRecord, decryptRecord, recoveryHash } from './operational-backup.mjs';
const CONSTRUCT=Symbol('verified-rehearsal-connection');
const ACCOUNT='b6b22a9a87b5758725e5c499782160af';
const NAME='wybp-restore-rehearsal-r001';
const PROTECTED='1a268b28-e6d5-4431-8f84-a886df9369f1';
const fail=code=>{throw Error(code);};
export function importStatement({sql,params=[]}){
 let index=0;const used=new Set();
 const literal=value=>{if(value===null)return 'NULL';if(typeof value==='string')return "'"+value.replaceAll("'","''")+"'";if(typeof value==='number'&&Number.isSafeInteger(value))return String(value);fail('d1_import_parameter_type');};
 const rendered=sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|\?(\d*)/g,(token,number)=>{
  if(!token.startsWith('?'))return token;
  const position=number?Number(number)-1:index;index=Math.max(index,position+1);
  if(position<0||position>=params.length)fail('d1_import_parameter_missing');used.add(position);return literal(params[position]);
 });
 if(used.size!==params.length)fail('d1_import_parameter_unused');return rendered.trim().replace(/;$/,'')+'\n;';
}
export class RehearsalD1 {
 static async connect({accountId,databaseId,token,fetch:request=globalThis.fetch}){
  if(accountId!==ACCOUNT||databaseId===PROTECTED||!/^[0-9a-f-]{36}$/.test(databaseId)||!token)fail('rehearsal_target_rejected');
  const db=new RehearsalD1(databaseId,token,request,CONSTRUCT);
  const info=await db.call('',undefined,'GET');if(info.uuid!==databaseId||info.name!==NAME)fail('rehearsal_identity_mismatch');return db;
 }
 constructor(id,token,request,proof){if(proof!==CONSTRUCT)fail('verified_connection_required');this.id=id;this.request=request;Object.defineProperty(this,'token',{value:token});}
 async call(suffix,body,method='POST'){
  const response=await this.request(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${this.id}${suffix}`,{method,headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  // Provider error text can contain SQL/record values; only stable codes leave this boundary.
  if(!response.ok)fail('d1_http_'+response.status);const envelope=await response.json();
  if(envelope.success!==true)fail('d1_operation_rejected');return envelope.result;
 }
 async query(sql,params=[]){const result=await this.call('/query',{sql,params});if(!Array.isArray(result)||result.some(x=>x.success!==true))fail('d1_query_rejected');return result.flatMap(x=>x.results||[]);}
 async batch(statements){
  if(!Array.isArray(statements)||!statements.length||statements.length>100)fail('d1_batch_bounds');
  if(statements.some(s=>/CREATE\s+TRIGGER/i.test(s.sql))){
   const result=await this.importSQL(statements.map(importStatement).join('\n'));
   return statements.map((_,index)=>({success:true,results:[],meta:index===0?result.meta:{}}));
  }
  const result=await this.call('/query',{batch:statements});if(!Array.isArray(result)||result.length!==statements.length||result.some(x=>x.success!==true))fail('d1_batch_rejected');return result;
 }
 async importSQL(sql,{maxPolls=60,pause=()=>new Promise(resolve=>setTimeout(resolve,1000))}={}){
  if(typeof sql!=='string'||!sql.length||Buffer.byteLength(sql)>32*1024*1024)fail('d1_import_size');
  const bytes=Buffer.from(sql),etag=createHash('md5').update(bytes).digest('hex');
  let result=await this.call('/import',{action:'init',etag});
  if(result.upload_url){
   let url;try{url=new URL(result.upload_url);}catch{fail('d1_import_upload_origin');}
   if(url.protocol!=='https:'||!url.hostname.endsWith('.cloudflarestorage.com')||url.username||url.password)fail('d1_import_upload_origin');
   let response;try{response=await this.request(url,{method:'PUT',body:bytes,redirect:'error'});}catch{fail('d1_import_upload_failed');}
   if(!response.ok||response.headers.get('etag')?.replace(/^"|"$/g,'')!==etag)fail('d1_import_upload_integrity');
   result=await this.call('/import',{action:'ingest',filename:result.filename,etag});
  }
  for(let i=0;i<maxPolls;i++){
   if(result.status==='complete'&&result.success===true)return result.result;
   if(result.status==='error'||!result.at_bookmark)fail('d1_import_rejected');
   await pause();result=await this.call('/import',{action:'poll',current_bookmark:result.at_bookmark});
  }
  fail('d1_import_pending_resume');
 }
 async exportSnapshot(custody,key,id,{maxPolls=20,pause=()=>new Promise(resolve=>setTimeout(resolve,1000)),fault=()=>{}}={}){
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))fail('snapshot_id');
  const now=Date.now();
  const complete=await custody.get(id+'.sql.enc');if(complete){const record=decryptRecord(complete,key,id+'.sql.enc');if(record.expiresAt<=now)fail('snapshot_expired');return {sql:record.sql,bookmark:record.bookmark,sha256:recoveryHash(complete)};}
  let checkpoint;
  const names=(await custody.list()).filter(n=>n.startsWith(id+'.poll-')&&n.endsWith('.enc')).sort();
  if(names.length){checkpoint=decryptRecord(await custody.get(names.at(-1)),key,names.at(-1));if(checkpoint.expiresAt<=now)fail('snapshot_expired');}
  for(let i=names.length;i<names.length+maxPolls;i++){
   const result=await this.call('/export',{output_format:'polling',...(checkpoint?.bookmark?{current_bookmark:checkpoint.bookmark}:{})});
   if(result.status==='error'||!result.at_bookmark)fail('d1_export_rejected');
   if(checkpoint&&checkpoint.bookmark!==result.at_bookmark)fail('d1_export_bookmark_changed');
   checkpoint={bookmark:result.at_bookmark,createdAt:checkpoint?.createdAt||now,expiresAt:checkpoint?.expiresAt||now+RETENTION_POLICY.backupDays*RETENTION_DAY};const name=id+'.poll-'+String(i).padStart(6,'0')+'.enc';
   await custody.put(name,encryptRecord(checkpoint,key,name));fault('export_polled');
   if(result.status==='complete'){
    let url;try{url=new URL(result.result?.signed_url);}catch{fail('d1_export_download_origin');}if(url.protocol!=='https:'||!url.hostname.endsWith('.cloudflarestorage.com')||url.username||url.password)fail('d1_export_download_origin');
    let response;try{response=await this.request(url,{redirect:'error'});}catch{fail('d1_export_download_failed');}if(!response.ok)fail('d1_export_download_failed');
    const sql=await response.text();if(Buffer.byteLength(sql)>32*1024*1024)fail('rehearsal_export_size');
    const name=id+'.sql.enc',bytes=encryptRecord({sql,...checkpoint},key,name);await custody.put(name,bytes);fault('export_downloaded');
    return {sql,bookmark:checkpoint.bookmark,sha256:recoveryHash(bytes)};
   }
   await pause();
  }
  fail('d1_export_pending_resume');
 }
}
export const rehearsalTarget=Object.freeze({accountId:ACCOUNT,name:NAME,protectedDatabaseId:PROTECTED});
