import { recoveryHash } from './recovery-crypto.mjs';
import { assertRestoreReceipt } from '../db/retention.ts';
import { RETENTION_POLICY, RETENTION_DAY } from '../db/retentionPolicy.ts';
const WINDOW=RETENTION_POLICY.backupDays*RETENTION_DAY;
const json=x=>Buffer.from(JSON.stringify(x));
const reject=code=>{throw Error(code);};
export async function restorePages(db,job,manifestHash,pages,now=Date.now(),fault=()=>{},maxPages=Infinity){
  if(maxPages!==Infinity&&(!Number.isInteger(maxPages)||maxPages<1||maxPages>100))reject('restore_invocation_bounds');
  if(!Array.isArray(pages)||pages.some(page=>!Array.isArray(page)||!page.length||page.length>98))reject('restore_page_bounds');
  const planHash=recoveryHash(json(pages));
  const existing=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0];
  if(existing&&(existing.manifest_hash!==manifestHash||existing.head_hash!==planHash||existing.sequence!==pages.length||existing.kind!=='restore'||existing.expires_at<=now))reject('restore_checkpoint_conflict');
  if(!existing)await db.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,?5,?6,0,'importing',1,?3,?4)",params:[job,manifestHash,now,now+WINDOW,pages.length,planHash]},{sql:'DELETE FROM retention_restore',params:[]}]);
  let row=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0];if(row.state==='complete')return {complete:true,receiptRequired:true};
  let processed=0;
  for(let i=row.cursor;i<pages.length;i++){
    if(processed++>=maxPages)return {complete:false,paused:true,receiptRequired:true};
    const page=pages[i];if(page.some(s=>/retention_restore|operational_/i.test(s.sql)))reject('restore_reserved_tables');
    await db.batch([{sql:"UPDATE operational_recovery_checkpoints SET cursor=CASE WHEN cursor=?2 AND state='importing' THEN cursor+1 ELSE -1 END,version=version+1 WHERE id=?1",params:[job,i]},...page]);fault('page_committed',i);
    row=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0];if(row.cursor!==i+1)reject('restore_progress');
  }
  if((await db.query('PRAGMA foreign_key_check')).length)reject('restore_foreign_keys');
  // Completion is gated separately on a complete authoritative readback comparison.
  return {complete:false,imported:true,receiptRequired:true};
}
export async function finishRestore(db,job,manifestHash,verify){
  const row=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0];
  if(!row||row.manifest_hash!==manifestHash||row.cursor!==row.sequence||row.expires_at<=Date.now()||!await verify())reject('restore_reconciliation');
  if(row.state==='complete')return {complete:true,receiptRequired:true};
  await db.batch([{sql:"UPDATE operational_recovery_checkpoints SET state=CASE WHEN version=?3 AND cursor=sequence AND state='importing' THEN 'complete' ELSE 'invalid' END,version=version+1 WHERE id=?1 AND manifest_hash=?2",params:[job,manifestHash,row.version]}]);return {complete:true,receiptRequired:true};
}
export async function recoveryAccess(db,job,externalReceipt,now=Date.now()){
  const row=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0];
  if(!row||row.state!=='complete'||row.expires_at<=now)reject('recovery_access_blocked');
  await assertRestoreReceipt({prepare(sql){return {async first(){return (await db.query(sql))[0]||null;}};}},externalReceipt);return true;
}
