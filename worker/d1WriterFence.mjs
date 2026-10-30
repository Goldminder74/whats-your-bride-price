import { recoveryHash } from '../scripts/recovery-crypto.mjs';
import { RETENTION_POLICY, RETENTION_DAY } from '../db/retentionPolicy.ts';
const WINDOW = RETENTION_POLICY.backupDays * RETENTION_DAY;
const LOCK = 'authority-writer';
// Typed local outcomes distinguish a rejected acquisition/read from an uncertain
// operation after acquisition. Provider text alone must never trigger replay.
export class AuthorityWriterAcquisitionBusy extends Error {constructor(){super('authority_writer_busy');}}
export class AuthorityWriterPending extends Error {constructor(){super('authority_writer_unavailable');}}
/** A database fence shared by every service instance. An uncertain operation is
 * never unlocked by elapsed lease time: only its stable retry or reviewed recovery
 * may resolve it. This sacrifices availability to protect financial authority. */
export class D1WriterFence {
  constructor(db, { now = Date.now } = {}) { this.db = db; this.now = now; }
  async run(identity, intent, work, {journalIdle=false}={}) {
    if(typeof journalIdle!=='boolean')throw Error('authority_writer_configuration');
    const owner = recoveryHash(Buffer.from(identity)), manifest = recoveryHash(Buffer.from(intent));
    const at = this.now();
    const acquisition = await this.db.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'journal',?2,0,?2,0,'idle',1,?3,?4) ON CONFLICT(id) DO NOTHING",params:[LOCK,'0'.repeat(64),at,at+WINDOW]},
      {sql:"UPDATE operational_recovery_checkpoints SET state='importing',head_hash=?2,manifest_hash=?3,version=version+1 WHERE id=?1 AND expires_at>?4 AND (state='idle' OR (state='importing' AND head_hash=?2 AND manifest_hash=?3)) AND (?5=0 OR EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id='journal' AND state='idle' AND expires_at>?4)) RETURNING version",params:[LOCK,owner,manifest,at,journalIdle?1:0]}]);
    const acquired = acquisition[1]?.results || acquisition[1];
    if (!Array.isArray(acquired) || acquired.length !== 1) {
      // An exporting/expired journal is a recovery block, not live contention.
      // Classify only after the failed atomic acquisition; no business work ran.
      const rows=await this.db.query('SELECT id,state,expires_at FROM operational_recovery_checkpoints WHERE id IN (?1,?2)',[LOCK,'journal']);
      const held=rows.find(row=>row.id===LOCK),journal=rows.find(row=>row.id==='journal');
      if(held?.state==='importing'&&held.expires_at>this.now()
        &&(!journalIdle||(journal?.state==='idle'&&journal.expires_at>this.now())))throw new AuthorityWriterAcquisitionBusy();
      throw Error('authority_writer_busy');
    }
    const version = acquired[0].version;
    const guard = () => ({sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?1 AND state='importing' AND head_hash=?2 AND manifest_hash=?3 AND expires_at>?4 AND version=?5) THEN 1 ELSE json('authority_writer_fenced') END",params:[LOCK,owner,manifest,this.now(),version]});
    await this.db.batch([guard()]);
    const fenced = {query:(sql,params)=>this.db.query(sql,params),batch: async rows=>{
      if(rows.length>99)throw Error('authority_batch_bounds');
      const results=await this.db.batch([guard(),...rows]);return results.slice(1);
    }};
    const result = await work(fenced);
    await this.db.batch([guard(),{sql:"UPDATE operational_recovery_checkpoints SET state='idle',version=version+1,created_at=?4,expires_at=?5 WHERE id=?1 AND head_hash=?2 AND manifest_hash=?3",params:[LOCK,owner,manifest,this.now(),this.now()+WINDOW]}]);
    return result;
  }
  async ready() {
    const row=(await this.db.query('SELECT state,expires_at FROM operational_recovery_checkpoints WHERE id=?1',[LOCK]))[0];
    if(row?.state==='importing'&&row.expires_at>this.now())throw new AuthorityWriterPending();
    if(row&&(row.state!=='idle'||row.expires_at<=this.now()))throw Error('authority_writer_unavailable');
    return true;
  }
}
