import { recoveryHash } from './recovery-crypto.mjs';
const valid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{10,160}$/.test(value);
/** index.reserve(name, proposedId) must persist atomically and return the winning ID.
 * Its durable state must survive process loss. Never substitute an in-memory map in production.
 * Access tokens are obtained only at request time, never returned or logged. */
export class DriveCustody {
  constructor({ folderId, accessToken, index, fetcher = (input, init) => globalThis.fetch(input, init) }) {
    if (!valid(folderId) || typeof accessToken !== 'function' || typeof index?.reserve !== 'function'
      || typeof index?.get !== 'function') throw Error('drive_custody_configuration');
    Object.assign(this, { folderId, accessToken, index, fetcher });
  }
  name(name) { if (!/^[a-zA-Z0-9_.-]{1,180}$/.test(name)) throw Error('custody_name'); return name; }
  async request(url, options = {}) {
    const token = await this.accessToken();
    if (typeof token !== 'string' || !token) throw Error('drive_authentication');
    try { return await this.fetcher(url, { ...options, redirect: 'manual', headers: { ...options.headers, Authorization: 'Bearer ' + token } }); }
    catch { throw Error('drive_transport'); }
  }
  async get(name) {
    const id = await this.index.get(this.name(name)); if (!id) return null;
    if (!valid(id)) throw Error('drive_file_identity');
    const response = await this.request('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media');
    if (response.status === 404) return null;
    if (!response.ok) throw Error('drive_download');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 4 * 1024 * 1024) throw Error('drive_file_bounds');
    return bytes;
  }
  async put(name, bytes) {
    this.name(name); bytes = Buffer.from(bytes);
    if (!bytes.length || bytes.length > 4 * 1024 * 1024) throw Error('drive_file_bounds');
    let id = await this.index.get(name);
    if (id) id = await this.index.reserve(name, id);
    if (!id) {
      const response = await this.request('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files');
      if (!response.ok) throw Error('drive_generate_id');
      const proposed = (await response.json()).ids?.[0]; if (!valid(proposed)) throw Error('drive_file_identity');
      id = await this.index.reserve(name, proposed);
    }
    if (!valid(id)) throw Error('drive_file_identity');
    const prior = await this.get(name);
    if (prior) { if (recoveryHash(prior) !== recoveryHash(bytes)) throw Error('custody_conflict'); return recoveryHash(bytes); }
    const boundary = 'wybp_' + crypto.randomUUID();
    const metadata = { id, name, parents: [this.folderId], mimeType: 'application/octet-stream', appProperties: { wybpRecovery: '1' } };
    const body = Buffer.concat([Buffer.from('--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify(metadata)
      + '\r\n--' + boundary + '\r\nContent-Type: application/octet-stream\r\n\r\n'), bytes, Buffer.from('\r\n--' + boundary + '--\r\n')]);
    const response = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body });
    if (!response.ok && response.status !== 409) throw Error('drive_upload');
    const downloaded = await this.get(name);
    if (!downloaded || recoveryHash(downloaded) !== recoveryHash(bytes)) throw Error('custody_conflict');
    return recoveryHash(bytes);
  }
  async list() {
    const names = [], seen = new Set(), pages = new Set(); let page;
    do {
      const query = new URLSearchParams({ q: "'" + this.folderId + "' in parents and trashed=false and appProperties has { key='wybpRecovery' and value='1' }",
        fields: 'nextPageToken,incompleteSearch,files(id,name)', pageSize: '1000' });
      if (page) query.set('pageToken', page);
      const response = await this.request('https://www.googleapis.com/drive/v3/files?' + query);
      if (!response.ok) throw Error('drive_inventory');
      const data = await response.json();
      if (data.incompleteSearch || !Array.isArray(data.files)) throw Error('drive_inventory_incomplete');
      for (const file of data.files) {
        this.name(file.name);
        if (seen.has(file.name) || await this.index.get(file.name) !== file.id) throw Error('drive_inventory_conflict');
        seen.add(file.name); names.push(file.name);
      }
      if (data.nextPageToken && pages.has(data.nextPageToken)) throw Error('drive_inventory_loop');
      if (data.nextPageToken) pages.add(data.nextPageToken);
      page = data.nextPageToken;
    } while (page);
    return names.sort();
  }
  async inventoryReceipt() {
    const files = [];
    for (const name of await this.list()) {
      const bytes = await this.get(name);
      if (!bytes) throw Error('drive_inventory_gap');
      files.push({ name, id: await this.index.get(name), sha256: recoveryHash(bytes),...(this.index.recoveryRecord?await this.index.recoveryRecord(name):{}) });
    }
    return { files, sha256: recoveryHash(Buffer.from(JSON.stringify(files))) };
  }
  /** The expected receipt comes from separately secured recovery custody, never
   * an untrusted archive. Recover mappings only after folder/name/bytes readback. */
  async recoverIndex(files, expectedReceipt) {
    if (!Array.isArray(files) || files.length > 10000 || !/^[a-f0-9]{64}$/.test(expectedReceipt)
      || recoveryHash(Buffer.from(JSON.stringify(files))) !== expectedReceipt) throw Error('drive_inventory_receipt');
    const seen = new Set();
    for (const file of files) {
      this.name(file.name);
      if (!valid(file.id) || !/^[a-f0-9]{64}$/.test(file.sha256) || seen.has(file.name)) throw Error('drive_inventory_conflict');
      seen.add(file.name);
      const response = await this.request('https://www.googleapis.com/drive/v3/files/' + file.id + '?fields=id,name,parents,trashed');
      if (!response.ok) throw Error('drive_recovery_metadata');
      const metadata = await response.json();
      if (metadata.id !== file.id || metadata.name !== file.name || metadata.trashed
        || !metadata.parents?.includes(this.folderId)) throw Error('drive_recovery_scope');
      const media = await this.request('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media');
      if (!media.ok) throw Error('drive_download');
      const bytes = Buffer.from(await media.arrayBuffer());
      if (bytes.length > 4 * 1024 * 1024 || recoveryHash(bytes) !== file.sha256) throw Error('drive_recovery_hash');
      const recovered=this.index.recoverReserve?await this.index.recoverReserve(file.name,file.id,file):await this.index.reserve(file.name,file.id);
      if (recovered !== file.id) throw Error('drive_index_conflict');
    }
    return files.length;
  }
  async remove(name) {
    const id = await this.index.get(this.name(name));
    if (!id) return;
    if (!valid(id)) throw Error('drive_file_identity');
    const response = await this.request('https://www.googleapis.com/drive/v3/files/' + id, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) throw Error('drive_delete');
    // Preserve the reservation until its approved expiry, preventing ID/name reuse.
  }
  async cleanupTemporary(_now, limit = 50) {
    if (!this.index.expired || !this.index.releaseExpired) throw Error('drive_cleanup_index_required');
    const rows = await this.index.expired(limit);
    for (const row of rows) {
      const response = await this.request('https://www.googleapis.com/drive/v3/files/' + row.fileId, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) throw Error('drive_delete');
      // Do not forget the stable ID until provider deletion is acknowledged.
      await this.index.releaseExpired(row.checkpoint);
    }
    return rows.length;
  }

}
