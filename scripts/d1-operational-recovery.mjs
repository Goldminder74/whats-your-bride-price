import { readBoundary } from './authority-runtime.mjs';
export { D1Authority, createOperationId, custodyInventory, readBoundary } from './authority-runtime.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, link, unlink, open, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { encryptRecord, decryptRecord, recoveryHash, privatePath, AuthorityJournal, exportArchive, restoreArchive, verifyArchive } from './operational-backup.mjs';
import { assertRestoreReceipt } from '../db/retention.ts';
import { RETENTION_POLICY, RETENTION_DAY } from '../db/retentionPolicy.ts';
const WINDOW=RETENTION_POLICY.backupDays*RETENTION_DAY;
const json=x=>Buffer.from(JSON.stringify(x));
const reject=code=>{throw Error(code);};
const opTables=new Set(['operational_authority_outbox','operational_recovery_checkpoints','schema_migrations','d1_migrations','retention_restore']);
export class PrivateCustody {
  static async create(path){path=await privatePath(path);await mkdir(path,{recursive:true});return new PrivateCustody(path);}
  constructor(path){this.path=path;}
  file(name){if(!/^[a-zA-Z0-9_.-]+$/.test(name))reject('custody_name');return join(this.path,name);}
  async get(name){try{return await readFile(this.file(name));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async put(name,bytes){
    const staging=this.file(name+'.'+crypto.randomUUID()+'.uploading');
    const fd=await open(staging,'wx',0o600);try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
    try{await link(staging,this.file(name));}catch(e){if(e.code!=='EEXIST')throw e;}finally{await unlink(staging);}
    if(recoveryHash(await this.get(name))!==recoveryHash(bytes))reject('custody_conflict');return recoveryHash(bytes);
  }
  async list(){return (await readdir(this.path)).filter(n=>!n.endsWith('.uploading')).sort();}
  async remove(name){try{await unlink(this.file(name));}catch(e){if(e.code!=='ENOENT')throw e;}}
  async cleanupTemporary(now,limit){let removed=0;for(const name of (await readdir(this.path)).filter(n=>n.endsWith('.uploading')).sort()){
    if(removed>=limit)break;const stat=await lstat(this.file(name));if(stat.mtimeMs+WINDOW<=now){await this.remove(name);removed++;}}
    return removed;
  }
}
export async function archiveProviderSnapshot(sql,bookmark,directory,key){
  directory=await privatePath(directory);await mkdir(directory,{recursive:true});if(/\b(ATTACH|DETACH|load_extension)\b/i.test(sql))reject('snapshot_sql_scope');
  const path=join(directory,'provider.sqlite'),receipt=join(directory,'snapshot.enc'),hash=recoveryHash(Buffer.from(sql));let previous;
  try{previous=decryptRecord(await readFile(receipt),key,'snapshot');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(previous){if(previous.hash!==hash||previous.bookmark!==bookmark)reject('snapshot_source_changed');}
  else{
    const staging=path+'.writing',db=new DatabaseSync(staging);try{db.exec('PRAGMA foreign_keys=OFF');db.exec(sql);if(db.prepare('PRAGMA foreign_key_check').all().length)reject('snapshot_foreign_keys');}finally{db.close();}
    try{await link(staging,path);}catch(e){if(e.code!=='EEXIST')throw e;if(recoveryHash(await readFile(path))!==recoveryHash(await readFile(staging)))reject('snapshot_local_conflict');}finally{await unlink(staging);}
    const fd=await open(receipt,'wx',0o600);try{await fd.writeFile(encryptRecord({hash,bookmark},key,'snapshot'));await fd.sync();}finally{await fd.close();}
  }
  const journal=await AuthorityJournal.connect(path,join(directory,'local-journal.sqlite'),key);try{const archive=await exportArchive(journal,join(directory,'archive'),key);return {bookmark,archiveHash:archive.sha256,schemaHash:archive.schemaHash,directory,archive};}finally{journal.close();}
}
export async function captureProviderBoundary(authority,provider,id,directory){
 return authority.deliver(id,async()=>{
  const exported=await provider.exportSnapshot(authority.custody,authority.key,id);
  const captured=await archiveProviderSnapshot(exported.sql,exported.bookmark,directory,authority.key),files=[];
  const local=new DatabaseSync(join(directory,'provider.sqlite'),{readOnly:true});try{await verifyNativeSnapshot(local,provider);}finally{local.close();}
  for(const name of (await readdir(join(directory,'archive'))).filter(n=>n.endsWith('.enc'))){const target=id+'.archive.'+name,bytes=await readFile(join(directory,'archive',name));files.push({name:target,sha256:await authority.custody.put(target,bytes)});}
  const history=id+'.history.enc',rawHistory=(await readFile(join(directory,'local-journal.sqlite'))).toString('base64');
  let historyBytes=await authority.custody.get(history);if(historyBytes){if(decryptRecord(historyBytes,authority.key,history).bytes!==rawHistory)reject('snapshot_history_changed');}else historyBytes=encryptRecord({bytes:rawHistory,createdAt:Date.now(),expiresAt:Date.now()+WINDOW},authority.key,history);
  files.push({name:history,sha256:await authority.custody.put(history,historyBytes)});
  files.push({name:id+'.sql.enc',sha256:exported.sha256});
  return {files,bookmark:captured.bookmark,archiveHash:captured.archiveHash,schemaHash:captured.schemaHash};
 });
}
export async function prepareProviderRestore(directory,key,review,destination){
  const archive=await verifyArchive(join(directory,'archive'),key);if(archive.sha256!==review.manifestHash)reject('archive_review');
  const history=await AuthorityJournal.openHistory(join(directory,'local-journal.sqlite'),key);try{return await restoreArchive(join(directory,'archive'),destination,history,key,review);}finally{history.close();}
}
export async function restorePages(db,job,manifestHash,pages,now=Date.now(),fault=()=>{}){
  if(!Array.isArray(pages)||pages.some(page=>!Array.isArray(page)||!page.length||page.length>98))reject('restore_page_bounds');
  const planHash=recoveryHash(json(pages));
  const existing=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0];
  if(existing&&(existing.manifest_hash!==manifestHash||existing.head_hash!==planHash||existing.sequence!==pages.length||existing.kind!=='restore'||existing.expires_at<=now))reject('restore_checkpoint_conflict');
  if(!existing)await db.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,?5,?6,0,'importing',1,?3,?4)",params:[job,manifestHash,now,now+WINDOW,pages.length,planHash]},{sql:'DELETE FROM retention_restore',params:[]}]);
  let row=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0];if(row.state==='complete')return {complete:true,receiptRequired:true};
  for(let i=row.cursor;i<pages.length;i++){
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
export { opTables };
// Offline restore plan for a NEVER-BOUND rehearsal target. Final schema and data are verified
// before completion; historical rows must not fire live accounting side effects again.
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const valueSql=value=>value===null?'NULL':typeof value==='bigint'?String(value):typeof value==='number'?(Number.isSafeInteger(value)?String(value):reject('restore_unsafe_number')):value instanceof Uint8Array?"X'"+Buffer.from(value).toString('hex')+"'":"'"+String(value).replaceAll("'","''")+"'";
export function providerRestorePlan(source,{unboundRehearsal=false,pageSize=50}={}){
 if(!unboundRehearsal||!Number.isInteger(pageSize)||pageSize<1||pageSize>50)reject('offline_restore_required');
 const tables=source.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all().map(x=>x.name).filter(n=>!opTables.has(n));
 const triggers=source.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all().filter(x=>!x.name.startsWith('operational_'));
 const ordered=[],remaining=new Set(tables);
 while(remaining.size){const ready=[...remaining].filter(name=>source.prepare('PRAGMA foreign_key_list('+quote(name)+')').all().every(fk=>fk.table===name||!remaining.has(fk.table)));
  if(!ready.length)reject('restore_dependency_cycle');for(const name of ready){ordered.push(name);remaining.delete(name);}}
 const statements=tables.map(name=>({sql:`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ${quote(name)}) THEN 1 ELSE json('restore_target_not_empty') END`,params:[]}));
 statements.push(...triggers.map(t=>({sql:'DROP TRIGGER '+quote(t.name),params:[]})));
 const pages=[];for(let i=0;i<statements.length;i+=pageSize)pages.push(statements.slice(i,i+pageSize));
 for(const table of ordered){
  const columns=source.prepare('PRAGMA table_info('+quote(table)+')').all().map(x=>x.name),q=source.prepare('SELECT * FROM '+quote(table));q.setReadBigInts(true);
  let rows=q.all(),self=source.prepare('PRAGMA foreign_key_list('+quote(table)+')').all().filter(fk=>fk.table===table);
  if(self.length){const sorted=[],pending=[...rows];while(pending.length){const ready=pending.filter(row=>self.every(fk=>row[fk.from]===null||row[fk.from]===row[fk.to]||sorted.some(parent=>parent[fk.to]===row[fk.from])));
    if(!ready.length)reject('restore_row_dependency_cycle');for(const row of ready){sorted.push(row);pending.splice(pending.indexOf(row),1);}}rows=sorted;}
  for(let i=0;i<rows.length;i+=pageSize)pages.push(rows.slice(i,i+pageSize).map(row=>({sql:`INSERT INTO ${quote(table)}(${columns.map(quote).join(',')}) VALUES(${columns.map(c=>valueSql(row[c])).join(',')})`,params:[]})));
 }
 for(let i=0;i<triggers.length;i+=pageSize)pages.push(triggers.slice(i,i+pageSize).map(t=>({sql:t.sql,params:[]})));
 return {pages,tables,triggers,sha256:recoveryHash(json(pages))};
}
export async function verifyProviderRestore(source,target,plan){
 if((await target.query('PRAGMA foreign_key_check')).length)reject('restore_foreign_keys');
 for(const table of plan.tables){
  const columns=source.prepare('PRAGMA table_info('+quote(table)+')').all().map(x=>x.name);
  // SQL encodings retain 64-bit integers and blobs exactly across the JSON API.
  const projections=columns.map(c=>`quote(${quote(c)}) AS ${quote(c)}`).join(',');
  const expected=source.prepare(`SELECT ${projections} FROM ${quote(table)}`).all().map(r=>JSON.stringify(r)).sort();
  const count=(await target.query(`SELECT COUNT(*) n FROM ${quote(table)}`))[0].n;if(count!==expected.length)reject('restore_count_mismatch');
  const actual=[];const order=columns.map(quote).join(',');
  for(let offset=0;offset<count;offset+=100)actual.push(...(await target.query(`SELECT ${projections} FROM ${quote(table)} ORDER BY ${order} LIMIT 100 OFFSET ?1`,[offset])).map(r=>JSON.stringify(r)));
  if(JSON.stringify(actual.sort())!==JSON.stringify(expected))reject('restore_content_mismatch');
 }
 const actual=await target.query("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND name NOT LIKE 'operational_%' ORDER BY name");
 if(JSON.stringify(actual)!==JSON.stringify(plan.triggers))reject('restore_trigger_mismatch');return true;
}
export async function cleanupRecovery(authority,id,receipt,{limit=50,now=Date.now()}={}){
 if(!Number.isInteger(limit)||limit<1||limit>50)reject('cleanup_bounds');
 const boundary=await readBoundary(authority.custody,authority.key,id,receipt,now),head=await authority.head();
 if(head.state!=='idle'||head.sequence!==boundary.sequence||head.head_hash!==boundary.head)reject('cleanup_requires_current_boundary');
 const covered=boundary.base?.sequence||0;
 const rows=await authority.db.query('SELECT sequence FROM operational_authority_outbox WHERE sequence<=?1 AND expires_at<=?2 AND delivery_receipt IS NOT NULL ORDER BY sequence LIMIT ?3',[covered,now,limit]);
 if(rows.length)await authority.db.batch(rows.map(r=>({sql:'DELETE FROM operational_authority_outbox WHERE sequence=?1 AND expires_at<=?2 AND delivery_receipt IS NOT NULL',params:[r.sequence,now]})));
 const checkpoints=await authority.db.query("SELECT id FROM operational_recovery_checkpoints WHERE id NOT IN ('journal','baseline') AND state='complete' AND expires_at<=?1 ORDER BY id LIMIT ?2",[now,limit]);
 if(checkpoints.length)await authority.db.batch(checkpoints.map(r=>({sql:"DELETE FROM operational_recovery_checkpoints WHERE id=?1 AND state='complete' AND expires_at<=?2",params:[r.id,now]})));
 let files=0;
 for(const name of (await authority.custody.list()).filter(n=>n.endsWith('.intent'))){if(files+2>limit)break;
  const event=decryptRecord(await authority.custody.get(name),authority.key,name);
  if(event.expiresAt<=now&&event.sequence<=covered){for(const file of [name.replace('.intent','.event'),name]){try{await authority.custody.remove(file);files++;}catch(e){if(e.code!=='ENOENT')throw e;}}}
 }
 const protectedFiles=new Set(boundary.files.map(x=>x.name));
 for(const name of (await authority.custody.list()).filter(n=>n.endsWith('.boundary'))){if(files>=limit||name===id+'.boundary')continue;
  const record=decryptRecord(await authority.custody.get(name),authority.key,name);if(record.expiresAt>now)continue;
  for(const file of record.files||[]){if(files>=limit)break;if(protectedFiles.has(file.name))continue;try{await authority.custody.remove(file.name);files++;}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(files<limit){await authority.custody.remove(name);files++;}
 }
 for(const name of (await authority.custody.list()).filter(n=>n.endsWith('.abort')||n.includes('.poll-')||n.endsWith('.sql.enc'))){if(files>=limit)break;
  const record=decryptRecord(await authority.custody.get(name),authority.key,name);if(record.expiresAt<=now&&!protectedFiles.has(name)){await authority.custody.remove(name);files++;}}
 return {outbox:rows.length,checkpoints:checkpoints.length,files};
}
export async function materializeBoundary(custody,key,id,receipt,directory,now=Date.now()){
 const boundary=await readBoundary(custody,key,id,receipt,now);directory=await privatePath(directory);await mkdir(join(directory,'archive'),{recursive:true});
 const local=await PrivateCustody.create(join(directory,'archive'));
 for(const file of boundary.files.filter(x=>x.name.startsWith(id+'.archive.'))){const name=file.name.slice((id+'.archive.').length);await local.put(name,await custody.get(file.name));}
 const checked=await verifyArchive(join(directory,'archive'),key,now);if(checked.sha256!==boundary.archiveHash||checked.schemaHash!==boundary.schemaHash)reject('boundary_archive_mismatch');
 const history=id+'.history.enc',historyBytes=decryptRecord(await custody.get(history),key,history).bytes;
 const root=await PrivateCustody.create(directory);await root.put('local-journal.sqlite',Buffer.from(historyBytes,'base64'));
 return {boundary,archive:checked,directory};
}
/** Fail-closed expiry does not depend on successful replacement custody. No financial data is touched. */
export async function expireRecoveryArtifacts(authority,{limit=50,now=Date.now()}={}){
 if(!Number.isInteger(limit)||limit<1||limit>50)reject('cleanup_bounds');
 const rows=await authority.db.query('SELECT sequence FROM operational_authority_outbox WHERE expires_at<=?1 ORDER BY sequence LIMIT ?2',[now,limit]);
 if(rows.length)await authority.db.batch([{sql:"UPDATE operational_recovery_checkpoints SET state='importing',version=version+1 WHERE id='journal'",params:[]},...rows.map(row=>({sql:'DELETE FROM operational_authority_outbox WHERE sequence=?1 AND expires_at<=?2',params:[row.sequence,now]}))]);
 const checkpoints=await authority.db.query("SELECT id FROM operational_recovery_checkpoints WHERE expires_at<=?1 AND id NOT LIKE 'drive_file:%' ORDER BY id LIMIT ?2",[now,limit]);
 if(checkpoints.length)await authority.db.batch(checkpoints.map(row=>({sql:'DELETE FROM operational_recovery_checkpoints WHERE id=?1 AND expires_at<=?2',params:[row.id,now]})));
 let files=0;
 const names=await authority.custody.list();
 for(const name of names.filter(n=>n.endsWith('.intent')||n.endsWith('.abort')||n.includes('.poll-')||n.endsWith('.sql.enc'))){if(files>=limit)break;
  const record=decryptRecord(await authority.custody.get(name),authority.key,name);if(record.expiresAt>now)continue;
  if(name.endsWith('.intent')&&files+2>limit)continue;
  if(name.endsWith('.intent')){try{await authority.custody.remove(name.replace('.intent','.event'));files++;}catch(e){if(e.code!=='ENOENT')throw e;}}
  await authority.custody.remove(name);files++;
 }
 for(const name of names.filter(n=>n.endsWith('.boundary'))){if(files>=limit)break;
  const record=decryptRecord(await authority.custody.get(name),authority.key,name);if(record.expiresAt>now)continue;
  for(const file of record.files||[]){if(files>=limit)break;try{await authority.custody.remove(file.name);files++;}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(files<limit){await authority.custody.remove(name);files++;}
 }
 for(const name of names.filter(n=>n.endsWith('.archive.manifest.enc'))){if(files>=limit)break;
  const bytes=await authority.custody.get(name);if(!bytes)continue;const record=decryptRecord(bytes,authority.key,'manifest');if(record.capturedAt+WINDOW>now)continue;
  const prefix=name.slice(0,-'manifest.enc'.length);
  for(const file of names.filter(n=>n.startsWith(prefix)&&n!==name)){if(files>=limit)break;try{await authority.custody.remove(file);files++;}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(files<limit){await authority.custody.remove(name);files++;}
 }
 for(const name of names.filter(n=>n.endsWith('.history.enc'))){if(files>=limit)break;
  const bytes=await authority.custody.get(name);if(!bytes)continue;const record=decryptRecord(bytes,authority.key,name);if(record.expiresAt<=now){await authority.custody.remove(name);files++;}}
 if(authority.custody.cleanupTemporary&&files<limit)files+=await authority.custody.cleanupTemporary(now,limit-files);
 return {outbox:rows.length,checkpoints:checkpoints.length,files,recoveryBlocked:true};
}
/** Resume the existing independent chain only after a complete, reviewed offline restore. */
export async function resumeJournalAfterRestore(authority,id,receipt,job){
 const body=await readBoundary(authority.custody,authority.key,id,receipt,authority.now());
 await recoveryAccess(authority.db,job,receipt,authority.now());
 const prior=await authority.head();if(prior){if(prior.sequence!==body.sequence||prior.head_hash!==body.head)reject('restored_journal_conflict');return;}
 await authority.db.batch([
  {sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('journal','journal',?1,?2,?3,0,'idle',1,?4,?5)",params:[receipt,body.sequence,body.head,body.createdAt,body.expiresAt]},
  {sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('baseline','custody',?1,?2,?3,0,'complete',1,?4,?5)",params:[receipt,body.sequence,body.head,body.createdAt,body.expiresAt]},
 ]);
}

export async function verifyNativeSnapshot(source,provider){
 const schemaSql="SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name";
 const local=source.prepare(schemaSql).all().map(x=>({...x})),remote=await provider.query(schemaSql);
 const normalise=rows=>rows.map(x=>({...x,sql:x.sql.replace(/\s+/g,' ').trim().replace(/;$/,'')}));
 if(JSON.stringify(normalise(local))!==JSON.stringify(normalise(remote)))reject('provider_snapshot_schema_mismatch');
 const tables=local.filter(x=>x.type==='table').map(x=>x.name),triggers=local.filter(x=>x.type==='trigger'&&!x.name.startsWith('operational_')).map(({name,sql})=>({name,sql}));
 return verifyProviderRestore(source,provider,{tables,triggers});
}

/** Independent storage transport: authenticate outside this module; never return credential-bearing URLs. */
export class RemoteCustody {
 constructor(transport){this.transport=transport;}
 async inventory(){const files=[],ids=new Set(),cursors=new Set();let cursor;
  do{const page=await this.transport.list(cursor);if(!Array.isArray(page.files))reject('custody_inventory');
   for(const file of page.files){if(!file.privateOwner||!/^[a-zA-Z0-9_.-]+$/.test(file.name)||ids.has(file.id))reject('custody_inventory_conflict');ids.add(file.id);files.push(file);}
   cursor=page.nextCursor;if(cursor){if(cursors.has(cursor))reject('custody_cursor_cycle');cursors.add(cursor);}
  }while(cursor);return files;
 }
 async list(){return [...new Set((await this.inventory()).map(x=>x.name))].sort();}
 async get(name){const files=(await this.inventory()).filter(x=>x.name===name);if(!files.length)return null;let bytes;
  for(const file of files){const candidate=Buffer.from(await this.transport.download(file.id));if(file.sha256&&file.sha256!==recoveryHash(candidate))reject('custody_download_checksum');if(bytes&&recoveryHash(bytes)!==recoveryHash(candidate))reject('custody_duplicate_conflict');bytes=candidate;}return bytes;
 }
 async put(name,bytes){if(!/^[a-zA-Z0-9_.-]+$/.test(name))reject('custody_name');const prior=await this.get(name);
  if(prior){if(recoveryHash(prior)!==recoveryHash(bytes))reject('custody_conflict');return recoveryHash(prior);}
  let failed=false;try{await this.transport.upload(name,bytes,recoveryHash(bytes));}catch{failed=true;}
  const readback=await this.get(name);if(!readback||recoveryHash(readback)!==recoveryHash(bytes))reject(failed?'custody_upload_unconfirmed':'custody_readback');return recoveryHash(readback);
 }
 async remove(name){const files=(await this.inventory()).filter(x=>x.name===name);for(const file of files)await this.transport.remove(file.id);if((await this.inventory()).some(x=>x.name===name))reject('custody_cleanup_unconfirmed');}
}
