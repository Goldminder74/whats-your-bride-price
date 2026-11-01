// One bounded50-record provider window, preserving the existing10/25-record
// verifier contract. Cursors pin folder, provider page, offset and page digest.
// On process loss the same provider page is reread and checked, never guessed.
import {createHmac,timingSafeEqual} from 'node:crypto';import {recoveryHash} from './recovery-crypto.mjs';
const fail=()=>{throw Error('drive_window_unavailable');};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function windowedDriveAudit({fetchWindow,key,folderId}){
 if(typeof fetchWindow!=='function'||!Buffer.isBuffer(key)||key.length!==32||!/^[a-zA-Z0-9_-]{10,160}$/.test(folderId||''))fail();let cache=null;
 const mac=body=>createHmac('sha256',key).update('wybp-drive-window-v1:'+folderId+':'+body).digest(),encode=value=>{const body=Buffer.from(JSON.stringify(value)).toString('base64url');return 'dw1_'+body+'.'+mac(body).toString('hex');};
 return async({cursor=null,pageSize=10}={})=>{
  if(![10,25].includes(pageSize))fail();let state={version:1,provider:null,offset:0,digest:null,size:pageSize};
  if(cursor!==null){if(typeof cursor!=='string'||cursor.length>6000||!/^dw1_[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(cursor))fail();const [encoded,proof]=cursor.slice(4).split('.');if(!timingSafeEqual(Buffer.from(proof,'hex'),mac(encoded)))fail();state=JSON.parse(Buffer.from(encoded,'base64url'));if(state.version!==1||state.size!==pageSize||!Number.isInteger(state.offset)||state.offset<0||state.offset>=50||state.provider!==null&&(typeof state.provider!=='string'||state.provider.length>4096)||state.digest!==null&&!/^[a-f0-9]{64}$/.test(state.digest))fail();}
  // A null cursor begins a NEW independent census. Reusing the first window
  // from an earlier scan could hide files published between verification steps.
  if(cursor===null||!cache||cache.provider!==state.provider){const page=await fetchWindow({cursor:state.provider});if(!Array.isArray(page?.files)||page.files.length>50||page.cursor!==null&&(typeof page.cursor!=='string'||page.cursor.length>4096||page.cursor===state.provider))fail();cache={provider:state.provider,page,digest:recoveryHash(Buffer.from(JSON.stringify(canonical(page))))};}
  if(state.digest!==null&&state.digest!==cache.digest||state.offset>cache.page.files.length)fail();
  const nextOffset=state.offset+pageSize,next=nextOffset<cache.page.files.length?encode({...state,offset:nextOffset,digest:cache.digest}):cache.page.cursor===null?null:encode({version:1,provider:cache.page.cursor,offset:0,digest:null,size:pageSize});
  return {files:cache.page.files.slice(state.offset,nextOffset),cursor:next};
 };
}
export function recoveryWindowCustody(custody,key){for(const folder of custody.all||[custody]){if(typeof folder.auditWindow!=='function')fail();folder.auditPage=windowedDriveAudit({fetchWindow:input=>folder.auditWindow(input),key,folderId:folder.folderId});}return custody;}
