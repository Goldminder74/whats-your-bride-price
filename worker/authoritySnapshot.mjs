import { encryptRecord, decryptRecord, recoveryHash } from '../scripts/recovery-crypto.mjs';
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const encode = value => value instanceof Uint8Array ? { binary: Buffer.from(value).toString('base64') } : value;

/** All application writers must use the authority fence. A partial capture remains
 * fenced and resumes from immutable encrypted pages; no cross-provider atomicity. */
export function authoritySnapshot(db, custody, key, { pageSize = 50, maxPages = 1000 } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isInteger(maxPages) || maxPages < 1) throw Error('snapshot_bounds');
  return async head => {
    if (head?.state !== 'exporting' || !/^[a-zA-Z0-9_-]{1,80}$/.test(head.manifest_hash)) throw Error('snapshot_fence_required');
    const assertFence = async () => {
      const row = (await db.query("SELECT state,manifest_hash,sequence,head_hash FROM operational_recovery_checkpoints WHERE id='journal'"))[0];
      if (!row || row.state !== 'exporting' || row.manifest_hash !== head.manifest_hash || row.sequence !== head.sequence || row.head_hash !== head.head_hash) throw Error('snapshot_fence_changed');
    };
    await assertFence();
    const schema = await db.query("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name");
    // Outbox/Drive mappings have their own pinned authority inventory and recovery
    // protocol. Do not restore transient locks or old upload reservations as data.
    const tables = schema.filter(row => row.type === 'table' && !['operational_authority_outbox','operational_recovery_checkpoints','retention_restore'].includes(row.name));
    const files = [], counts = {}; let pages = 0;
    async function put(name, body) {
      const prior = await custody.get(name);
      const bytes = prior || encryptRecord(body, key, name);
      if (prior && JSON.stringify(decryptRecord(prior, key, name)) !== JSON.stringify(body)) throw Error('snapshot_retry_conflict');
      const sha256 = await custody.put(name, bytes);
      const downloaded = await custody.get(name);
      if (!downloaded || recoveryHash(downloaded) !== sha256 || JSON.stringify(decryptRecord(downloaded, key, name)) !== JSON.stringify(body)) throw Error('snapshot_readback');
      files.push({ name, sha256 });
    }
    await put(head.manifest_hash + '.schema.enc', { version: 1, schema });
    for (const table of tables) {
      await assertFence();
      const columns = await db.query('PRAGMA table_info(' + quote(table.name) + ')');
      const primary = columns.filter(column => column.pk).sort((a,b) => a.pk-b.pk);
      if (!primary.length) throw Error('snapshot_primary_key_required');
      const count = (await db.query('SELECT COUNT(*) AS n FROM ' + quote(table.name)))[0]?.n;
      if (!Number.isSafeInteger(count) || count < 0) throw Error('snapshot_count');
      counts[table.name] = count;
      const order = primary.map(column => quote(column.name)).join(',');
      for (let offset = 0; offset < count; offset += pageSize) {
        if (++pages > maxPages) throw Error('snapshot_capacity_exceeded');
        const rows = await db.query('SELECT * FROM ' + quote(table.name) + ' ORDER BY ' + order + ' LIMIT ?1 OFFSET ?2', [pageSize, offset]);
        if (rows.length !== Math.min(pageSize, count-offset)) throw Error('snapshot_page_gap');
        const encoded = rows.map(row => Object.fromEntries(Object.entries(row).map(([k,v]) => [k,encode(v)])));
        await put(head.manifest_hash + '.t' + tables.indexOf(table) + '.p' + offset + '.enc', { table: table.name, offset, rows: encoded });
      }
      if ((await db.query('SELECT COUNT(*) AS n FROM ' + quote(table.name)))[0]?.n !== count) throw Error('snapshot_count_changed');
    }
    await assertFence();
    return { format: 'wybp-d1-pages-v1', files, counts, pageSize };
  };
}
