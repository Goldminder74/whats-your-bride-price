// Private metered RPC adapter for the existing offline recovery algorithms.
// No source-database route, provider token, raw SQL endpoint or public bridge.
import {windowedDriveAudit} from './windowed-drive-audit.mjs';
import {verifyDriveRecordHeader} from './drive-record-header.mjs';
import {recoveryHash} from './recovery-crypto.mjs';
const fail=()=>{throw Error('retained_remote_custody_unavailable');};
export function retainedRemoteCustody({step,key,folders,upper,operationId,mode='recovery',windows=false}){
 if(!['recovery','custody'].includes(mode)||typeof step!=='function'||!Buffer.isBuffer(key)||key.length!==32||!Array.isArray(folders)||folders.length!==17||new Set(folders).size!==17||folders.some(f=>!/^[a-zA-Z0-9_-]{10,160}$/.test(f))||folders.includes('1-fO04arPlwSpuWQ7T2--yzTS5pHEXyxr')||typeof operationId!=='function')fail();
 const call=async command=>{const r=await step({id:operationId(),...command,kind:command.kind.replace(/^recovery-/,mode+'-')},upper);if(r?.billingKnown!==true||r.failed||!Object.hasOwn(r,'value')||r.rereadRequired)fail();return r.value;};
 // Exactly one current provider page per folder is cached. This is metadata
 // already authenticated by reconstruction and a signed header, never a guessed
 // replacement for an unverified mapping or a surviving source outbox.
 const parts=folders.map((folderId,folder)=>{const page=new Map(),window=windows?windowedDriveAudit({key,folderId,fetchWindow:async({cursor})=>call({kind:'recovery-list-window',folder,cursor})}):null;return {folderId,
  async auditPage({cursor=null,pageSize=25}={}){if(![10,25].includes(pageSize))fail();const value=window?await window({cursor,pageSize}):await call({kind:'recovery-list-page',folder,cursor,pageSize});page.clear();for(const f of value.files){if(f.mimeType==='application/vnd.google-apps.folder')continue;const h=verifyDriveRecordHeader({key,folderId,fileId:f.id,name:f.name},f.appProperties);if(!h)fail();page.set(f.name,{...h,id:f.id});}return value;},
  index:{activeCount:at=>call({kind:'recovery-index-count',folder,at}),get:async name=>{const r=page.get(name);if(!r)fail();return r.id;},recoveryRecord:async name=>{const r=page.get(name);if(!r)fail();return {createdAt:r.createdAt,expiresAt:r.expiresAt};},recoverReserve:async(name,id,clocks)=>{const r=page.get(name);if(!r||r.id!==id||r.createdAt!==clocks.createdAt||r.expiresAt!==clocks.expiresAt)fail();return id;}},
  async get(name){const r=await call({kind:'recovery-get',name});return r.ciphertext===null?null:Buffer.from(r.ciphertext,'base64');}
 };});
 return {all:parts,supportsCommitHead:true,publishCommitHead:async(event,head)=>{if(mode!=='custody'||event.sequence!==1)fail();return call({kind:'custody-bootstrap',name:event.operationId+'.intent',sha256:head});},check:async folder=>{if(!parts.includes(folder))fail();},readLatestCommitHead:()=>call({kind:'recovery-head'}),
  get:async name=>{const v=await call({kind:'recovery-get',name});return v.ciphertext===null?null:Buffer.from(v.ciphertext,'base64');},
  async put(name,bytes,clocks){const r=await call({kind:'recovery-put',name,ciphertext:Buffer.from(bytes).toString('base64'),clocks});if(r.sha256!==recoveryHash(bytes))fail();return r.sha256;}
 };
}
