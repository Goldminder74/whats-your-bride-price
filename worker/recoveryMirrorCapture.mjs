import {D1WriterFence} from './d1WriterFence.mjs';
import {boundedAuthorityStep} from './boundedAuthority.mjs';
import {assertMirrorIdentity} from './recoveryMirror.mjs';
import {recoveryHash} from '../scripts/recovery-crypto.mjs';
export async function advanceRecoveryMirrorSnapshot(mirror,custody,key,id,{identity,now=Date.now}={}){
 const target=assertMirrorIdentity(identity);if(!/^[a-zA-Z0-9_-]{1,65}$/.test(id||''))throw Error('mirror_snapshot_unavailable');
 const intent=recoveryHash(Buffer.from(JSON.stringify([target,id])));
 return new D1WriterFence(mirror,{now}).run('mirror-capture:'+id,intent,async db=>{
  const progressId='mirror-capture:'+id,prior=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[progressId]))[0];
  if(prior&&(prior.manifest_hash!==intent||prior.expires_at<=now()))throw Error('mirror_snapshot_unavailable');
  const result=await boundedAuthorityStep(db,custody,key,id,prior?.state==='complete'?null:prior?.head_hash||null,{now,mirrorIdentity:identity});
  const job=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',['bounded-job:'+id]))[0],value=result.complete?result.receipt:result.progress;
  if(!job||typeof value!=='string'||value.length>131072)throw Error('mirror_snapshot_unavailable');
  await db.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'export',?2,?3,?4,0,?5,1,?6,?7) ON CONFLICT(id) DO UPDATE SET head_hash=excluded.head_hash,state=excluded.state,version=version+1 WHERE version=?8 AND manifest_hash=excluded.manifest_hash",params:[progressId,intent,job.sequence,value,result.complete?'complete':'exporting',job.created_at,job.expires_at,prior?.version||0]}, {sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?1 AND manifest_hash=?2 AND head_hash=?3 AND state=?4) THEN 1 ELSE json('mirror_capture_progress') END",params:[progressId,intent,value,result.complete?'complete':'exporting']}]);
  return result.complete?{complete:true,receipt:result.receipt,sequence:result.sequence}:{complete:false,runtimeAccess:'blocked'};
 });
}
