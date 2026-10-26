// Offline/disposable recovery preparation only. Writers must be stopped first.
// Complete provider pages, not a surviving source outbox, establish the tail.
import {decryptRecord,encryptRecord,recoveryHash} from './recovery-crypto.mjs';
import {verifyDriveRecordHeader,verifyDriveCommitHeader} from './drive-record-header.mjs';
import {assertAuthorityStatements} from './authority-runtime.mjs';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
const WINDOW=RETENTION_POLICY.backupDays*RETENTION_DAY,ZERO='0'.repeat(64);
const hash=x=>recoveryHash(Buffer.from(JSON.stringify(x))),fail=()=>{throw Error('authority_discovery_unavailable');};
// The explicit 5k/day retained-stock layout can exceed1m objects (30 days of
// intents plus daily snapshots). Only the existing root+16 verified partitions
// may opt into the1.6m bound; defaults/single-folder bounds stay unchanged.
function limits(custody,maxFiles,maxPages){
 if(!Number.isSafeInteger(maxFiles)||maxFiles<1||maxFiles>1000000&&(maxFiles>1600000||custody.all?.length!==17||typeof custody.check!=='function')||!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>100000)fail();
}
async function read(custody,key,pointer){const bytes=await custody.get(pointer.name);if(!bytes||recoveryHash(bytes)!==pointer.sha256)fail();return decryptRecord(bytes,key,pointer.name);}
async function immutable(custody,key,name,body,expiresAt){const old=await custody.get(name),bytes=old||encryptRecord(body,key,name);if(old&&hash(decryptRecord(old,key,name))!==hash(body))fail();await custody.put(name,bytes,{createdAt:expiresAt-WINDOW,expiresAt});if(recoveryHash(await custody.get(name))!==recoveryHash(bytes))fail();return {name,sha256:recoveryHash(bytes)};}
export async function recoverSignedDriveIndex({custody,key,maxFiles=100000,maxPages=20000,now=Date.now,fault=()=>{}}){
 if(!Buffer.isBuffer(key)||key.length!==32)fail();limits(custody,maxFiles,maxPages);
 // Caller supplies a disk-backed uniqueness journal; this routine deliberately
 // does not retain an entire provider listing or change any ciphertext/clock.
 const all=custody.all||[custody];if(!all.length||all.length>17||new Set(all.map(c=>c.folderId)).size!==all.length)fail();let files=0,pages=0;
 for(const folder of all){if(custody.check)await custody.check(folder);let cursor=null;const tokens=new Set();do{
  if(++pages>maxPages)fail();const page=await folder.auditPage({cursor,pageSize:25});if(!Array.isArray(page.files)||page.files.length>25)fail();
  for(const file of page.files){if(++files>maxFiles)fail();if(file.mimeType==='application/vnd.google-apps.folder'){if(folder!==all[0]||!all.slice(1).some(c=>c.folderId===file.id))fail();continue;}
   if(file.mimeType!=='application/octet-stream'||!file.parents?.includes(folder.folderId)||file.appProperties?.wybpRecovery!=='1')fail();const header=verifyDriveRecordHeader({key,folderId:folder.folderId,fileId:file.id,name:file.name},file.appProperties);
   if(header){if(header.createdAt>now())fail();if(header.expiresAt>now())await folder.index.recoverReserve(file.name,file.id,header);}
   else if(await folder.index.get(file.name)!==file.id||!await folder.index.recoveryRecord(file.name))fail();
  }
  await fault('index_page',pages);if(page.cursor){if(typeof page.cursor!=='string'||page.cursor===cursor||tokens.has(page.cursor))fail();tokens.add(page.cursor);}cursor=page.cursor||null;
 }while(cursor);}
 return {files,pages,runtimeAccess:'blocked_pending_full_inventory_and_verified_import'};
}
/** Bounded-memory, restartable preparation. `database` is disposable local SQLite,
 * never the recovered production application. Existing unsigned archives need a
 * separately authenticated pinned index; signed new objects reconstruct their
 * own IDs and ORIGINAL clocks. Two matching unfiltered scans precede publication.
 * The resulting boundary STILL needs independent verifyAuthorityBoundaryStep.
 */
export async function discoverLatestAuthority({database,custody,key,snapshot,id,writersStopped,maxFiles=100000,maxPages=20000,now=Date.now,fault=()=>{}}){
 if(writersStopped!==true||!Buffer.isBuffer(key)||key.length!==32||!/^[a-zA-Z0-9_-]{1,65}$/.test(id||''))fail();limits(custody,maxFiles,maxPages);
 const root=await read(custody,key,snapshot),at=now();if(![2,4].includes(root.version)||root.format!=='wybp-authority-boundary-v'+root.version||snapshot.name!==root.id+'.boundary'||root.expiresAt<=at||root.createdAt>at)fail();
 if(custody.supportsCommitHead!==true||typeof custody.readLatestCommitHead!=='function')fail();
 const latest=await custody.readLatestCommitHead();if(!latest||latest.createdAt>at||latest.expiresAt<=at||latest.sequence<root.sequence)fail();
 const all=custody.all||[custody];if(!all.length||all.length>17||new Set(all.map(c=>c.folderId)).size!==all.length)fail();
 database.exec('CREATE TEMP TABLE IF NOT EXISTS wybp_discovered_tail(sequence INTEGER PRIMARY KEY,operation_id TEXT UNIQUE,event_hash TEXT,encrypted_event TEXT)');
 database.exec('CREATE TEMP TABLE IF NOT EXISTS wybp_discovered_files(name TEXT PRIMARY KEY,folder TEXT,file_id TEXT UNIQUE)');
 database.exec('DELETE FROM temp.wybp_discovered_tail; DELETE FROM temp.wybp_discovered_files');
 const add=database.prepare('INSERT INTO temp.wybp_discovered_files VALUES(?,?,?)'),stage=database.prepare('INSERT INTO temp.wybp_discovered_tail VALUES(?,?,?,?)');
 let expiresAt=root.expiresAt,firstDigest;
 for(let pass=0;pass<2;pass++){
  let digest=ZERO,count=0,pages=0;database.exec('DELETE FROM temp.wybp_discovered_files');
  for(const folder of all){if(custody.check)await custody.check(folder);let cursor=null;const tokens=new Set();
   do{
    if(++pages>maxPages)fail();const page=await folder.auditPage({cursor,pageSize:25});if(!Array.isArray(page.files)||page.files.length>25)fail();
    for(const file of page.files){
     if(++count>maxFiles)fail();
     if(file.mimeType==='application/vnd.google-apps.folder'){if(folder!==all[0]||!all.slice(1).some(c=>c.folderId===file.id))fail();continue;}
     if(file.mimeType!=='application/octet-stream'||file.appProperties?.wybpRecovery!=='1'||!file.parents?.includes(folder.folderId))fail();
     add.run(file.name,folder.folderId,file.id); // cross-page/cross-folder duplicates reject
     const header=verifyDriveRecordHeader({key,folderId:folder.folderId,fileId:file.id,name:file.name},file.appProperties);
     if(header){if(header.createdAt>at)fail();if(header.expiresAt>at)await folder.index.recoverReserve(file.name,file.id,header);}
     const clocks=header||await folder.index.recoveryRecord(file.name);
     if(!clocks||clocks.expiresAt-clocks.createdAt!==WINDOW)fail();
     if(clocks.expiresAt<=at)continue;
     if(await folder.index.get(file.name)!==file.id)fail();
     digest=hash([digest,folder.folderId,file.id,file.name,file.appProperties,clocks.createdAt,clocks.expiresAt]);
     if(!file.name.endsWith('.intent')||header&&header.sequence<=root.sequence)continue;
     const bytes=await folder.get(file.name);if(!bytes||header&&recoveryHash(bytes)!==header.sha256)fail();
     const e=decryptRecord(bytes,key,file.name),op=file.name.slice(0,-7),eventHash=recoveryHash(bytes);
     if(e.operationId!==op||!Number.isSafeInteger(e.sequence)||e.sequence<1||e.createdAt>at||e.expiresAt<=at||e.expiresAt-e.createdAt!==WINDOW||e.intentHash!==hash(e.statements)||!/^[a-f0-9]{64}$/.test(e.previousHash||'')||header&&(e.sequence!==header.sequence||e.previousHash!==header.previousHash||e.createdAt!==header.eventCreatedAt||e.expiresAt!==header.eventExpiresAt))fail();assertAuthorityStatements(e.statements);
     if(e.sequence<=root.sequence)continue;
     const abort=await custody.get(op+'.abort'),committed=header&&file.appProperties.wybpCommitProof?verifyDriveCommitHeader(key,file.name,header,file.appProperties.wybpCommitProof):false;
     if(header&&file.appProperties.wybpCommitProof!==undefined&&!committed)fail();
     // New signed intents are committed by membership in the separately
     // authenticated high-water chain checked below. An arbitrary/precommitted
     // intent cannot match that complete contiguous prefix. Retain old markers.
     const event=header?null:await custody.get(op+'.event');
     if(abort){const a=decryptRecord(abort,key,op+'.abort');if(committed||event||a.operationId!==op||a.intentHash!==eventHash||a.sequence!==e.sequence-1||a.head!==e.previousHash||a.createdAt!==e.createdAt||a.expiresAt!==e.expiresAt)fail();continue;}
     if(!header&&!committed&&(!event||recoveryHash(event)!==eventHash))fail();
     if(pass===0)stage.run(e.sequence,op,eventHash,bytes.toString());
     else{const prior=database.prepare('SELECT * FROM temp.wybp_discovered_tail WHERE sequence=?').get(e.sequence);if(!prior||prior.operation_id!==op||prior.event_hash!==eventHash)fail();}
     expiresAt=Math.min(expiresAt,e.expiresAt);
    }
    await fault('inventory_page',pass,pages);
    if(page.cursor){if(typeof page.cursor!=='string'||page.cursor===cursor||tokens.has(page.cursor))fail();tokens.add(page.cursor);}cursor=page.cursor||null;
   }while(cursor);
  }
  const receipt=hash([digest,count,pages]);if(pass===0)firstDigest=receipt;else if(receipt!==firstDigest)fail();
 }
 const highest=database.prepare('SELECT MAX(sequence) n FROM temp.wybp_discovered_tail').get().n??root.sequence;
 let sequence=root.sequence,head=root.head;
 for(const row of database.prepare('SELECT * FROM temp.wybp_discovered_tail ORDER BY sequence').iterate()){const e=decryptRecord(Buffer.from(row.encrypted_event),key,row.operation_id+'.intent');if(row.sequence!==++sequence||e.previousHash!==head)fail();head=row.event_hash;}
 if(sequence!==highest||sequence!==latest.sequence||head!==latest.head||hash(await custody.readLatestCommitHead())!==hash(latest)||expiresAt<=now())fail();
 const fence={id,sequence,headHash:head,expiresAt},base={sequence:root.sequence,head:root.head};let previous=null,cursor=root.sequence;
 for(;;){const page=database.prepare('SELECT * FROM temp.wybp_discovered_tail WHERE sequence>? ORDER BY sequence LIMIT 25').all(cursor);if(!page.length)break;
  const rows=page.map(row=>{const e=decryptRecord(Buffer.from(row.encrypted_event),key,row.operation_id+'.intent');return {sequence:row.sequence,operation_id:row.operation_id,intent_hash:e.intentHash,previous_hash:e.previousHash,event_hash:row.event_hash,encrypted_event:row.encrypted_event,created_at:e.createdAt,expires_at:e.expiresAt};});
  previous=await immutable(custody,key,id+'.authority'+rows[0].sequence+'_'+rows.at(-1).sequence+'.enc',{format:'wybp-authority-segment-v2',fence,base,previous,rows},expiresAt);cursor=rows.at(-1).sequence;await fault('segment_verified',cursor);
 }
 const body={version:3,format:'wybp-authority-boundary-v3',id,createdAt:root.createdAt,expiresAt,sequence,head,base,authority:previous,snapshot:root.snapshot,snapshotProof:root.snapshotProof,snapshotAnchor:snapshot,inventory:{requiredOnRecovery:true}};
 const boundary=await immutable(custody,key,id+'.boundary',body,expiresAt);
 return {boundary,sequence,runtimeAccess:'blocked_pending_independent_inventory_and_verified_import'};
}
