import { recoveryHash } from '../scripts/recovery-crypto.mjs';
import { RETENTION_POLICY, RETENTION_DAY } from '../db/retentionPolicy.ts';
const WINDOW = RETENTION_POLICY.backupDays * RETENTION_DAY;
const LOCK = 'authority-writer';
/** A database fence shared by every service instance. An uncertain operation is
 * never unlocked by elapsed lease time: only its stable retry or reviewed recovery
 * may resolve it. This sacrifices availability to protect financial authority. */
export class D1WriterFence {
  constructor(db, { now = Date.now } = {}) { this.db = db; this.now = now; }
  async run(identity, intent, work) {
    const owner = recoveryHash(Buffer.from(identity)), manifest = recoveryHash(Buffer.from(intent));
    const at = this.now();
    const acquisition = await this.db.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'journal',?2,0,?2,0,'idle',1,?3,?4) ON CONFLICT(id) DO NOTHING",params:[LOCK,'0'.repeat(64),at,at+WINDOW]},
      {sql:"UPDATE operational_recovery_checkpoints SET state='importing',head_hash=?2,manifest_hash=?3,version=version+1 WHERE id=?1 AND expires_at>?4 AND (state='idle' OR (state='importing' AND head_hash=?2 AND manifest_hash=?3)) RETURNING version",params:[LOCK,owner,manifest,at]}]);
    const acquired = acquisition[1]?.results || acquisition[1];
    if (!Array.isArray(acquired) || acquired.length !== 1) throw Error('authority_writer_busy');
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
    if(row&&(row.state!=='idle'||row.expires_at<=this.now()))throw Error('authority_writer_unavailable');
    return true;
  }
}
