import { recoveryHash } from './recovery-crypto.mjs';
import {decryptRecord} from './recovery-crypto.mjs';
import {createDriveRecordHeader} from './drive-record-header.mjs';
import {encodeCommitHead,decodeCommitHead} from './drive-commit-head.mjs';
const valid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{10,160}$/.test(value);
/** index.reserve(name, proposedId) must persist atomically and return the winning ID.
 * Its durable state must survive process loss. Never substitute an in-memory map in production.
 * Access tokens are obtained only at request time, never returned or logged. */
export class DriveCustody {
  #recordKey;
  constructor({ folderId, accessToken, index, fetcher = (input, init) => globalThis.fetch(input, init), pageSize=1000,recordKey }) {
    if (!valid(folderId) || typeof accessToken !== 'function' || typeof index?.reserve !== 'function'
      || typeof index?.get !== 'function') throw Error('drive_custody_configuration');
    if(!Number.isInteger(pageSize)||pageSize<1||pageSize>1000)throw Error('drive_inventory_page_bounds');
    if(recordKey!==undefined&&(!Buffer.isBuffer(recordKey)||recordKey.length!==32))throw Error('drive_custody_configuration');this.#recordKey=recordKey;
    Object.assign(this, { folderId, accessToken, index, fetcher, pageSize });
  }
  name(name) { if (!/^[a-zA-Z0-9_.-]{1,180}$/.test(name)) throw Error('custody_name'); return name; }
  get supportsCommitHead(){return this.#recordKey!==undefined;}
  async commitHeadMetadata(){
    const response=await this.request('https://www.googleapis.com/drive/v3/files/'+this.folderId+'?fields=id,mimeType,trashed,appProperties');if(!response.ok)throw Error('drive_commit_head_unavailable');const m=await response.json();if(m.id!==this.folderId||m.trashed||m.mimeType!=='application/vnd.google-apps.folder')throw Error('drive_commit_head_unavailable');return m;
  }
  async readLatestCommitHead(){const m=await this.commitHeadMetadata();return decodeCommitHead(this.#recordKey,this.folderId,m.appProperties);}
  async initialiseCommitHead(record){
    const metadata=await this.commitHeadMetadata(),prior=decodeCommitHead(this.#recordKey,this.folderId,metadata.appProperties);
    if(prior){if(prior.sequence!==record.sequence||prior.head!==record.head)throw Error('drive_commit_head_conflict');return prior;}
    const response=await this.request('https://www.googleapis.com/drive/v3/files/'+this.folderId+'?fields=id',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({appProperties:{...metadata.appProperties,...encodeCommitHead(this.#recordKey,this.folderId,record)}})});
    if(!response.ok||JSON.stringify(await this.readLatestCommitHead())!==JSON.stringify(record))throw Error('drive_commit_head_unavailable');return record;
  }
  async publishCommitHead(event,head,sourceHead){
    const metadata=await this.commitHeadMetadata(),prior=decodeCommitHead(this.#recordKey,this.folderId,metadata.appProperties),record={sequence:event.sequence,head,createdAt:event.createdAt,expiresAt:event.expiresAt};
    if(prior?.sequence>record.sequence){if(sourceHead?.sequence!==prior.sequence||sourceHead.head_hash!==prior.head)throw Error('drive_commit_head_conflict');return prior;} // never bless an older restored fork
    if(prior?.sequence===record.sequence){if(prior.head!==record.head||prior.createdAt>record.createdAt||prior.expiresAt>record.expiresAt)throw Error('drive_commit_head_conflict');return prior;} // verified legacy adoption may retain an older expiry
    if(prior?prior.sequence!==record.sequence-1||prior.head!==event.previousHash:record.sequence!==1||event.previousHash!=='0'.repeat(64))throw Error('drive_commit_head_gap');
    const response=await this.request('https://www.googleapis.com/drive/v3/files/'+this.folderId+'?fields=id',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({appProperties:{...metadata.appProperties,...encodeCommitHead(this.#recordKey,this.folderId,record)}})});
    if(!response.ok||JSON.stringify(await this.readLatestCommitHead())!==JSON.stringify(record))throw Error('drive_commit_head_unavailable');return record;
  }
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
  async reserveFiles(files) {
    // Fixture/segmented archive preparation only. Winning IDs and original
    // clocks persist before upload; a lost reply cannot create a second file.
    if(!Array.isArray(files)||!files.length||files.length>25||new Set(files.map(f=>f.name)).size!==files.length||typeof this.index.recoverReserve!=='function')throw Error('drive_reservation_bounds');
    const result=[],missing=[];
    for(const f of files){this.name(f.name);if(!f.clocks)throw Error('drive_retention_index_required');const id=await this.index.get(f.name);if(id){if(!valid(id))throw Error('drive_file_identity');result.push({name:f.name,id:await this.index.recoverReserve(f.name,id,f.clocks)});}else missing.push(f);}
    if(missing.length){const response=await this.request('https://www.googleapis.com/drive/v3/files/generateIds?count='+missing.length+'&space=drive&type=files');if(!response.ok)throw Error('drive_generate_id');const ids=(await response.json()).ids;
      if(!Array.isArray(ids)||ids.length!==missing.length||ids.some(id=>!valid(id))||new Set(ids).size!==ids.length)throw Error('drive_file_identity');
      for(const [i,f]of missing.entries())result.push({name:f.name,id:await this.index.recoverReserve(f.name,ids[i],f.clocks)});
    }
    return result;
  }
  async put(name, bytes, retention, {createOnly=false}={}) {
    if(typeof createOnly!=='boolean')throw Error('drive_upload_scope');
    this.name(name); bytes = Buffer.from(bytes);
    if (!bytes.length || bytes.length > 4 * 1024 * 1024) throw Error('drive_file_bounds');
    let id = await this.index.get(name), newlyReserved = false;
    if (retention && typeof this.index.recoverReserve !== 'function') throw Error('drive_retention_index_required');
    const reserve = proposed => retention ? this.index.recoverReserve(name, proposed, retention) : this.index.reserve(name, proposed);
    if (id) id = await reserve(id);
    if (!id) {
      const response = await this.request('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files');
      if (!response.ok) throw Error('drive_generate_id');
      const proposed = (await response.json()).ids?.[0]; if (!valid(proposed)) throw Error('drive_file_identity');
      id = await reserve(proposed);
      newlyReserved = id === proposed;
    }
    if (!valid(id)) throw Error('drive_file_identity');
    // A provider-generated ID won by this reservation has no prior file to read.
    // A competing reservation or a process retry still checks the winning ID.
    // POST conflicts and every successful upload STILL require byte readback.
    const prior = newlyReserved || createOnly ? null : await this.get(name);
    if (prior) { if (recoveryHash(prior) !== recoveryHash(bytes)) throw Error('custody_conflict'); return recoveryHash(bytes); }
    const boundary = 'wybp_' + crypto.randomUUID();
    let properties={wybpRecovery:'1'};
    if(this.#recordKey){
      const clocks=await this.index.recoveryRecord(name);if(!clocks)throw Error('drive_retention_index_required');
      const event=name.endsWith('.intent')?decryptRecord(bytes,this.#recordKey,name):null;
      properties=createDriveRecordHeader({key:this.#recordKey,folderId:this.folderId,fileId:id,name},{sha256:recoveryHash(bytes),...clocks,event});
    }
    const metadata = { id, name, parents: [this.folderId], mimeType: 'application/octet-stream', appProperties: properties };
    const body = Buffer.concat([Buffer.from('--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + JSON.stringify(metadata)
      + '\r\n--' + boundary + '\r\nContent-Type: application/octet-stream\r\n\r\n'), bytes, Buffer.from('\r\n--' + boundary + '--\r\n')]);
    const response = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body });
    if (!response.ok && response.status !== 409) throw Error('drive_upload');
    const downloaded = await this.get(name);
    if (!downloaded || recoveryHash(downloaded) !== recoveryHash(bytes)) throw Error('custody_conflict');
    return recoveryHash(bytes);
  }
  async commitMetadata(name){
    this.name(name);if(!/^op_\d{13}_[a-f0-9]{32}\.intent$/.test(name))throw Error('drive_commit_scope');
    const id=await this.index.get(name);if(!valid(id))throw Error('drive_commit_scope');
    const response=await this.request('https://www.googleapis.com/drive/v3/files/'+id+'?fields=id,name,parents,trashed,appProperties');if(!response.ok)throw Error('drive_commit_readback');
    const metadata=await response.json();if(metadata.id!==id||metadata.name!==name||metadata.trashed||!metadata.parents?.includes(this.folderId)||metadata.appProperties?.wybpRecovery!=='1')throw Error('drive_commit_scope');return metadata;
  }
  async readCommit(name){const m=await this.commitMetadata(name),proof=m.appProperties.wybpCommitProof;if(proof!==undefined&&!/^[a-f0-9]{64}$/.test(proof))throw Error('drive_commit_conflict');return proof||null;}
  async markCommitted(name,proof){
    if(!/^[a-f0-9]{64}$/.test(proof||''))throw Error('drive_commit_scope');const m=await this.commitMetadata(name),prior=m.appProperties.wybpCommitProof;
    if(prior&&prior!==proof)throw Error('drive_commit_conflict');if(prior===proof)return;
    const response=await this.request('https://www.googleapis.com/drive/v3/files/'+m.id+'?fields=id',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({appProperties:{...m.appProperties,wybpCommitProof:proof}})});
    if(!response.ok)throw Error('drive_commit_update');if(await this.readCommit(name)!==proof)throw Error('drive_commit_readback');
  }
  async *inventoryPages({ maxPages = 100, maxFiles = 10000 } = {}) {
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10000 || !Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 100000) throw Error('drive_inventory_bounds');
    const seen = new Set(), pages = new Set(); let page, count = 0;
    do {
      if (++count > maxPages) throw Error('drive_inventory_capacity');
      const query = new URLSearchParams({ q: "'" + this.folderId + "' in parents and trashed=false and appProperties has { key='wybpRecovery' and value='1' }",
        fields: 'nextPageToken,incompleteSearch,files(id,name)', pageSize: String(this.pageSize) });
      if (page) query.set('pageToken', page);
      const response = await this.request('https://www.googleapis.com/drive/v3/files?' + query);
      if (!response.ok) throw Error('drive_inventory');
      const data = await response.json();
      if (data.incompleteSearch || !Array.isArray(data.files)) throw Error('drive_inventory_incomplete');
      if (data.files.length > this.pageSize || seen.size + data.files.length > maxFiles) throw Error('drive_inventory_capacity');
      const ids = this.index.getMany ? await this.index.getMany(data.files.map(file => file.name)) : null;
      for (const file of data.files) {
        this.name(file.name);
        if (seen.has(file.name) || (ids ? ids.get(file.name) : await this.index.get(file.name)) !== file.id) throw Error('drive_inventory_conflict');
        seen.add(file.name);
      }
      if (data.nextPageToken && pages.has(data.nextPageToken)) throw Error('drive_inventory_loop');
      if (data.nextPageToken) pages.add(data.nextPageToken);
      page = data.nextPageToken;
      yield data.files.map(file => ({ name: file.name, id: file.id }));
    } while (page);
  }
  /** One unfiltered parent page for a caller-persisted, fenced audit. A missing
   * app marker must not hide an unknown object from recovery/cleanup. */
  async auditPage({cursor=null,pageSize=10}={}) {
    return this.#audit({cursor,pageSize},25);
  }
  async auditWindow({cursor=null}={}) {return this.#audit({cursor,pageSize:50},50);}
  async #audit({cursor,pageSize},maximum) {
    if(!Number.isInteger(pageSize)||pageSize<1||pageSize>maximum||(cursor!==null&&(typeof cursor!=='string'||!cursor||cursor.length>4096)))throw Error('drive_audit_bounds');
    const query=new URLSearchParams({q:"'"+this.folderId+"' in parents and trashed=false",fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,parents,appProperties)',pageSize:String(pageSize),orderBy:'name'});if(cursor)query.set('pageToken',cursor);
    const response=await this.request('https://www.googleapis.com/drive/v3/files?'+query);if(!response.ok)throw Error('drive_audit_unavailable');
    const page=await response.json();if(page.incompleteSearch||!Array.isArray(page.files)||page.files.length>pageSize||(page.nextPageToken!==undefined&&(typeof page.nextPageToken!=='string'||!page.nextPageToken||page.nextPageToken.length>4096||page.nextPageToken===cursor)))throw Error('drive_audit_incomplete');
    for(const file of page.files)if(!valid(file.id)||typeof file.name!=='string'||!file.parents?.includes(this.folderId))throw Error('drive_audit_scope');
    return {files:page.files,cursor:page.nextPageToken||null};
  }
  async list(bounds) {
    const names = [];
    for await (const page of this.inventoryPages(bounds)) names.push(...page.map(file => file.name));
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
  async recoverIndex(files, expectedReceipt, fault=()=>{}) {
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
      await fault(file,seen.size);
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
