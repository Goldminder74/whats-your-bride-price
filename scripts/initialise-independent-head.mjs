// One-time legacy metadata adoption after a COMPLETE independently verified cut.
// No clock-based unlock, outbox rewrite, new schema, application access or flag.
import {decryptRecord,recoveryHash} from './recovery-crypto.mjs';
import {D1WriterFence} from '../worker/d1WriterFence.mjs';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
const hash=x=>recoveryHash(Buffer.from(JSON.stringify(x))),fail=()=>{throw Error('independent_head_initialisation_unavailable');};
export async function initialiseIndependentHead(db,custody,key,pointer,verification,{now=Date.now}={}){
 if(custody.supportsCommitHead!==true||typeof custody.initialiseCommitHead!=='function'||!Buffer.isBuffer(key)||key.length!==32||!/^[a-f0-9]{64}$/.test(pointer?.sha256||'')||typeof verification?.progress!=='string'||verification.progress.length>3000000)fail();
 const bytes=await custody.get(pointer.name);if(!bytes||recoveryHash(bytes)!==pointer.sha256)fail();const body=decryptRecord(bytes,key,pointer.name),audit=decryptRecord(Buffer.from(verification.progress,'base64'),key,'verify-authority:'+pointer.sha256),at=now();
 if(![2,3].includes(body.version)||body.format!=='wybp-authority-boundary-v'+body.version||pointer.name!==body.id+'.boundary'||body.expiresAt<=at||body.createdAt>at||verification.verified!==true||audit.phase!=='complete'||audit.receipt!==pointer.sha256||!Number.isSafeInteger(audit.inventory?.total)||audit.inventory.asOf>at)fail();
 return new D1WriterFence(db,{now}).run('independent-head:'+body.id,hash(pointer),async fenced=>{
  const head=(await fenced.query("SELECT * FROM operational_recovery_checkpoints WHERE id='journal'"))[0];if(head?.state!=='idle'||head.sequence!==body.sequence||head.head_hash!==body.head||head.expires_at<=at)fail();
  let count=0;for(const folder of custody.all||[custody])count+=await folder.index.activeCount(audit.inventory.asOf);if(count!==audit.inventory.total)fail();
  if(body.sequence===0)return {verified:true,sequence:0,meaning:'first commit will create independent head'};
  const result=await custody.initialiseCommitHead({sequence:body.sequence,head:body.head,createdAt:body.expiresAt-RETENTION_POLICY.backupDays*RETENTION_DAY,expiresAt:body.expiresAt});
  if(result.sequence!==body.sequence||result.head!==body.head)fail();return {verified:true,sequence:result.sequence,runtimeAccess:'unchanged'};
 });
}
