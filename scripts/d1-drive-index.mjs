import { recoveryHash } from './recovery-crypto.mjs';
import { RETENTION_POLICY, RETENTION_DAY } from '../db/retentionPolicy.ts';
const WINDOW = RETENTION_POLICY.backupDays * RETENTION_DAY;
const fileId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{10,160}$/.test(value);
/** File reservations are custody checkpoints, not financial/authority events.
 * No additional schema is needed: the opaque checkpoint ID contains the provider ID;
 * manifest_hash pins its folder/name identity and head_hash pins the reservation itself.
 * Reads do not extend the existing backup retention window. */
export class D1DriveIndex {
  constructor(db, folderId, { now = Date.now } = {}) {
    if (!db?.query || !db?.batch || !fileId(folderId)) throw Error('drive_index_configuration');
    Object.assign(this, { db, folderId, now });
    this.prefix = 'drive_file:' + recoveryHash(Buffer.from(folderId)) + ':';
  }
  identity(name) {
    if (!/^[a-zA-Z0-9_.-]{1,180}$/.test(name)) throw Error('custody_name');
    return recoveryHash(Buffer.from(JSON.stringify([this.folderId, name])));
  }
  async row(name) {
    const identity = this.identity(name);
    const prefix=this.prefix+identity+':';
    const rows = await this.db.query('SELECT * FROM operational_recovery_checkpoints WHERE id>=?1 AND id<?2', [prefix,prefix+'~']);
    if (rows.length > 1) throw Error('drive_index_conflict');
    return this.validateRow(name, rows[0]);
  }
  validateRow(name, row) {
    if (!row) return null;
    const identity = this.identity(name);
    const prefix = this.prefix + identity + ':', id = row.id.slice(prefix.length);
    if (row.kind!=='custody'||row.manifest_hash!==identity||!row.id.startsWith(prefix) || !fileId(id) || row.head_hash !== recoveryHash(Buffer.from(row.id))
      || row.state !== 'complete' || row.expires_at - row.created_at !== WINDOW) throw Error('drive_index_corrupt');
    return { ...row, fileId: id };
  }
  async get(name) { return (await this.row(name))?.fileId || null; }
  async getMany(names) {
    if (!Array.isArray(names) || names.length > 1000 || new Set(names).size !== names.length) throw Error('drive_index_bounds');
    const result = new Map();
    for (let offset = 0; offset < names.length; offset += 40) {
      const page = names.slice(offset, offset + 40), prefixes = page.map(name => this.prefix+this.identity(name)+':');
      // Two binds/range stay below D1's100-parameter limit. No unindexed kind/hash
      // predicate may turn this identity lookup into a retained-stock table scan.
      const rows = await this.db.query('SELECT * FROM operational_recovery_checkpoints WHERE '+prefixes.map((_,i)=>'(id>=?'+(i*2+1)+' AND id<?'+(i*2+2)+')').join(' OR '),prefixes.flatMap(prefix=>[prefix,prefix+'~']));
      for (const name of page) {
        const matching = rows.filter(row => row.manifest_hash === this.identity(name));
        if (matching.length > 1) throw Error('drive_index_conflict');
        result.set(name, this.validateRow(name, matching[0])?.fileId || null);
      }
    }
    return result;
  }
  async recoveryRecord(name) {const row=await this.row(name);return row?{createdAt:row.created_at,expiresAt:row.expires_at}:null;}
  async recoverReserve(name, proposedId, record) {
    if(!Number.isSafeInteger(record?.createdAt)||!Number.isSafeInteger(record?.expiresAt)
      ||record.createdAt>this.now()||record.expiresAt-record.createdAt!==WINDOW||record.expiresAt<=this.now())throw Error('drive_recovery_window');
    return this.reserve(name,proposedId,record);
  }
  async reserve(name, proposedId, recovery) {
    if (!fileId(proposedId)) throw Error('drive_file_identity');
    const identity = this.identity(name), id = this.prefix + identity + ':' + proposedId, at = this.now(), createdAt=recovery?.createdAt??at, expiresAt=recovery?.expiresAt??at+WINDOW;
    // D1 executes this conditional INSERT atomically: independent processes pick one winner.
    const prefix=this.prefix+identity+':';
    await this.db.batch([{ sql: "INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) SELECT ?1,'custody',?2,0,?3,0,'complete',1,?4,?5 WHERE NOT EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id>=?6 AND id<?7)",
      params: [id, identity, recoveryHash(Buffer.from(id)), createdAt, expiresAt,prefix,prefix+'~'] }]);
    const row = await this.row(name);
    if (!row || row.expires_at <= at) throw Error('drive_reservation_expired');
    if(recovery&&(row.fileId!==proposedId||row.created_at!==createdAt||row.expires_at!==expiresAt))throw Error('drive_recovery_conflict');
    return row.fileId;
  }

  async expired(limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw Error('cleanup_bounds');
    const rows = await this.db.query("SELECT id,head_hash FROM operational_recovery_checkpoints WHERE kind='custody' AND substr(id,1,?1)=?2 AND expires_at<=?3 ORDER BY id LIMIT ?4", [this.prefix.length,this.prefix,this.now(),limit]);
    return rows.map(row => {
      const id = row.id.slice(this.prefix.length + 65);
      if (!fileId(id) || recoveryHash(Buffer.from(row.id)) !== row.head_hash) throw Error('drive_index_corrupt');
      return { checkpoint: row.id, fileId: id };
    });
  }
  async releaseExpired(checkpoint) {
    if (!checkpoint.startsWith(this.prefix)) throw Error('drive_index_scope');
    await this.db.batch([{sql:"DELETE FROM operational_recovery_checkpoints WHERE id=?1 AND kind='custody' AND expires_at<=?2",params:[checkpoint,this.now()]}]);
  }
}
