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
    const rows = await this.db.query("SELECT * FROM operational_recovery_checkpoints WHERE kind='custody' AND manifest_hash=?1 AND id LIKE 'drive_file:%'", [identity]);
    if (rows.length > 1) throw Error('drive_index_conflict');
    const row = rows[0]; if (!row) return null;
    const prefix = this.prefix + identity + ':', id = row.id.slice(prefix.length);
    if (!row.id.startsWith(prefix) || !fileId(id) || row.head_hash !== recoveryHash(Buffer.from(row.id))
      || row.state !== 'complete' || row.expires_at - row.created_at !== WINDOW) throw Error('drive_index_corrupt');
    return { ...row, fileId: id };
  }
  async get(name) { return (await this.row(name))?.fileId || null; }
  async reserve(name, proposedId) {
    if (!fileId(proposedId)) throw Error('drive_file_identity');
    const identity = this.identity(name), id = this.prefix + identity + ':' + proposedId, at = this.now();
    // D1 executes this conditional INSERT atomically: independent processes pick one winner.
    await this.db.batch([{ sql: "INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) SELECT ?1,'custody',?2,0,?3,0,'complete',1,?4,?5 WHERE NOT EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE kind='custody' AND manifest_hash=?2 AND id LIKE 'drive_file:%')",
      params: [id, identity, recoveryHash(Buffer.from(id)), at, at + WINDOW] }]);
    const row = await this.row(name);
    if (!row || row.expires_at <= at) throw Error('drive_reservation_expired');
    return row.fileId;
  }

  async expired(limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw Error('cleanup_bounds');
    const rows = await this.db.query("SELECT id,head_hash FROM operational_recovery_checkpoints WHERE kind='custody' AND id LIKE ?1 AND expires_at<=?2 ORDER BY id LIMIT ?3", [this.prefix + '%', this.now(), limit]);
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
