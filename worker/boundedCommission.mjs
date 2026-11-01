import {boundedSnapshotStep} from './boundedSnapshot.mjs';
import {D1Authority} from '../scripts/authority-runtime.mjs';
import {D1WriterFence} from './d1WriterFence.mjs';
import {encryptRecord,decryptRecord,recoveryHash} from '../scripts/recovery-crypto.mjs';
const ZERO='0'.repeat(64),id='synthetic_benchmark_initial';
const fail=()=>{throw Error('bounded_commission_unavailable');};
const hash=v=>recoveryHash(Buffer.from(JSON.stringify(v)));
/** Initial isolated baseline only. Populated financial recovery cannot enter here.
 * Folder inventory, capture and readback are separate bounded calls. No progress
 * token grants access; only the final guarded D1 batch can publish its receipt.
 */
export async function boundedCommissionStep(db,custody,key,progress=null,{now=Date.now}={}){
 await new D1WriterFence(db,{now}).ready();
 for(const table of ['cowrie_wallets','commerce_orders','quiz_attempts','results','cowrie_ledger','retention_holds','retention_closures','operational_authority_outbox'])if((await db.query('SELECT COUNT(*) n FROM "'+table+'"'))[0]?.n!==0)fail();
 const authority=new D1Authority(db,custody,key,{now});let head=await authority.head();
 if(!head)head=await authority.initialise();
 if(head.sequence!==0||head.head_hash!==ZERO||head.expires_at<=now())fail();
 const aad=id+'.commission-progress';let state={version:1,phase:'inventory',folder:0,snapshotProgress:null};
 if(progress!==null){if(typeof progress!=='string'||progress.length>3000000)fail();state=decryptRecord(Buffer.from(progress,'base64'),key,aad);if(state.version!==1)fail();}
 const prior=(await db.query("SELECT receipt_hash FROM retention_restore WHERE id='active'"))[0];
 if(prior){
  const bytes=await custody.get(id+'.boundary');if(!bytes||recoveryHash(bytes)!==prior.receipt_hash)fail();
  const body=decryptRecord(bytes,key,id+'.boundary');if(body.format!=='wybp-initial-bounded-v1'||head.state!=='idle'||body.sequence!==0)fail();
  return {complete:true,verified:true,receipt:prior.receipt_hash};
 }
 head=await authority.freeze(id);
 if(state.fence&&state.fence!==hash(head))fail();state.fence=hash(head);
 let captured;
 if(state.phase==='inventory'){
  const all=custody.all||[custody],folder=all[state.folder];if(!folder)fail();
  if(custody.check)await custody.check(folder);
  for await(const page of folder.inventoryPages({maxPages:1,maxFiles:10}))for(const file of page){
   if(!new RegExp('^'+id+'\\.(?:schema\\.enc|segment\\d+\\.enc|snapshot-proof\\.enc|boundary)$').test(file.name))fail();
  }
  if(++state.folder===all.length)state.phase='capture';
 }else if(state.phase==='capture'){
  captured=await boundedSnapshotStep(db,custody,key,head,state.snapshotProgress,{now});state.snapshotProgress=captured.progress;
  if(captured.complete){
   const proof=await custody.get(captured.proof.name);if(!proof||recoveryHash(proof)!==captured.proof.sha256)fail();
   const body={version:1,format:'wybp-initial-bounded-v1',id,sequence:0,head:ZERO,createdAt:head.created_at,expiresAt:head.expires_at,snapshot:captured.snapshot,proof:captured.proof};
   const name=id+'.boundary',old=await custody.get(name),bytes=old||encryptRecord(body,key,name);
   if(old&&hash(decryptRecord(old,key,name))!==hash(body))fail();
   const receipt=await custody.put(name,bytes),copy=await custody.get(name);if(!copy||recoveryHash(copy)!==receipt)fail();
   await db.batch([
    {sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id='journal' AND state='exporting' AND manifest_hash=?1 AND sequence=0 AND head_hash=?2 AND expires_at=?3) AND NOT EXISTS(SELECT 1 FROM operational_authority_outbox) THEN 1 ELSE json('commission_fence_changed') END",params:[id,ZERO,head.expires_at]},
    {sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('baseline','custody',?1,0,?2,0,'complete',1,?3,?4)",params:[receipt,ZERO,head.created_at,head.expires_at]},
    {sql:"INSERT INTO retention_restore(id,receipt_hash,verified_at) VALUES('active',?1,?2)",params:[receipt,now()]},
    {sql:"UPDATE operational_recovery_checkpoints SET state='idle',version=version+1 WHERE id='journal' AND manifest_hash=?1",params:[id]},
   ]);
   return {complete:true,verified:true,receipt};
  }
 }else fail();
 return {complete:false,progress:encryptRecord(state,key,aad).toString('base64'),runtimeAccess:'blocked_pending_verified_boundary'};
}
