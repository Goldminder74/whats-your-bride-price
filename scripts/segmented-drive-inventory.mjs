// Operator-only pinned inventory. Data and metadata are encrypted in custody;
// the local resumable journal must remain outside Git. No index deletion here.
import {encryptRecord,decryptRecord,recoveryHash} from './recovery-crypto.mjs';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
import {assertBenchmarkResource} from './approved-benchmark-budget.mjs';
const duration=RETENTION_POLICY.backupDays*RETENTION_DAY;
const digest=v=>recoveryHash(Buffer.from(JSON.stringify(v)));
const fail=()=>{throw Error('pinned_inventory_unavailable');};
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{10,160}$/.test(v);
const validate=(r,at)=>r&&/^[a-zA-Z0-9_.-]{1,180}$/.test(r.name)&&validId(r.id)&&validId(r.folderId)&&/^[a-f0-9]{64}$/.test(r.sha256||'')&&Number.isSafeInteger(r.createdAt)&&r.createdAt<=at&&r.expiresAt-r.createdAt===duration&&r.expiresAt>at;

async function pinnedPut(root,key,name,body,clocks){
 const prior=await root.get(name),bytes=prior||encryptRecord(body,key,name);
 if(prior&&JSON.stringify(decryptRecord(prior,key,name))!==JSON.stringify(body))fail();
 const sha256=await root.put(name,bytes,clocks),download=await root.get(name);
 if(!download||recoveryHash(download)!==sha256)fail();
 const id=await root.index.get(name),window=await root.index.recoveryRecord(name);
 if(!validId(id)||!window)fail();return {name,id,folderId:root.folderId,sha256,...window};
}

/** records must enumerate a quiescent, fenced source with an independently
 * counted expectedCount. A provider listing alone is not a completeness proof.
 * Root/control writes must be excluded from this source enumeration explicitly.
 */
export async function capturePinnedInventory({root,key,id,records,expectedCount,journal,assertFrozen,now=Date.now(),fault=()=>{}}){
 if(!/^[a-zA-Z0-9_-]{1,65}$/.test(id)||!Number.isSafeInteger(expectedCount)||expectedCount<0||expectedCount>1600000||typeof assertFrozen!=='function'||!journal?.prepare)fail();
 const controlTables=new Set(['pinned_inventory_runs','pinned_inventory_seen','pinned_inventory_fences']);
 if(journal.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().some(row=>!controlTables.has(row.name)))fail();
 const fence=await assertFrozen();if(typeof fence!=='string'||!/^[a-f0-9]{64}$/.test(fence))fail();
 const check=async()=>{if(await assertFrozen()!==fence)fail();};
 journal.exec('CREATE TABLE IF NOT EXISTS pinned_inventory_runs(id TEXT PRIMARY KEY,expected INTEGER NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS pinned_inventory_seen(job TEXT NOT NULL,name TEXT NOT NULL,position INTEGER NOT NULL,file_id TEXT NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(job,name))');
 journal.exec('CREATE TABLE IF NOT EXISTS pinned_inventory_fences(id TEXT PRIMARY KEY,fence TEXT NOT NULL)');
 journal.prepare('INSERT INTO pinned_inventory_fences VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(id,fence);
 if(journal.prepare('SELECT fence FROM pinned_inventory_fences WHERE id=?').get(id).fence!==fence)fail();
 journal.prepare('INSERT INTO pinned_inventory_runs VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,expectedCount,now,now+duration);
 const run=journal.prepare('SELECT * FROM pinned_inventory_runs WHERE id=?').get(id);
 if(run.expected!==expectedCount||run.expires<=now)fail();
 const segments=[];let files=[],count=0,expiresAt=run.expires;
 const write=async()=>{await check();segments.push(await pinnedPut(root,key,id+'.inventory.segment'+segments.length+'.enc',{id,offset:count-files.length,files}, {createdAt:run.created,expiresAt:run.expires}));files=[];await fault('segment_verified',segments.length);};
 for await(const file of records){
  if(count>=expectedCount||!validate(file,now))fail();await check();
  const previous=journal.prepare('SELECT * FROM pinned_inventory_seen WHERE job=? AND name=?').get(id,file.name);
  const identity=journal.prepare('SELECT name FROM pinned_inventory_seen WHERE job=? AND file_id=?').get(id,file.id);
  if(identity&&identity.name!==file.name)fail();
  if(previous&&(previous.position!==count||previous.file_id!==file.id||previous.sha256!==file.sha256))fail();
  if(!previous)journal.prepare('INSERT INTO pinned_inventory_seen VALUES(?,?,?,?,?)').run(id,file.name,count,file.id,file.sha256);
  files.push(file);expiresAt=Math.min(expiresAt,file.expiresAt);count++;
  if(files.length===100)await write();
 }
 if(count!==expectedCount)fail();if(files.length)await write();await check();
 return pinnedPut(root,key,id+'.inventory.root.enc',{version:1,id,count,segments,fenceSha256:fence,createdAt:run.created,expiresAt}, {createdAt:run.created,expiresAt:run.expires});
}

/** Direct provider-ID readback works even when ALL D1 file mappings are lost.
 * Caller supplies only the explicitly pinned private folder instances.
 */
export async function readPinnedInventoryFile(custodies,key,pointer,at=Date.now()){
 if(!validate(pointer,at))fail();
 const custody=custodies.find(c=>c.folderId===pointer.folderId);if(!custody)fail();
 const metadataResponse=await custody.request('https://www.googleapis.com/drive/v3/files/'+pointer.id+'?fields=id,name,parents,trashed');
 if(!metadataResponse.ok)fail();const metadata=await metadataResponse.json();
 if(metadata.id!==pointer.id||metadata.name!==pointer.name||metadata.trashed||!metadata.parents?.includes(pointer.folderId))fail();
 const response=await custody.request('https://www.googleapis.com/drive/v3/files/'+pointer.id+'?alt=media');if(!response.ok)fail();
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>4*1024*1024||recoveryHash(bytes)!==pointer.sha256)fail();
 return decryptRecord(bytes,key,pointer.name);
}

export async function recoverPinnedInventory({db,custodies,key,pointer,resource,job,maxFiles=25,now=Date.now(),fault=()=>{}}){
 assertBenchmarkResource('database',resource);
 if(!/^synthetic_[a-zA-Z0-9_-]{1,70}$/.test(job)||!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>25||!Array.isArray(custodies)||new Set(custodies.map(c=>c.folderId)).size!==custodies.length)fail();
 const root=await readPinnedInventoryFile(custodies,key,pointer,now);
 if(root.version!==1||root.expiresAt<=now||!Number.isSafeInteger(root.count)||root.count<0||root.count>1600000||!Array.isArray(root.segments)||root.segments.length!==Math.ceil(root.count/100))fail();
 let checkpoint=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0];
 if(!checkpoint){
  await db.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,?3,?2,0,'importing',1,?4,?5)",params:[job,pointer.sha256,root.count,pointer.createdAt,pointer.expiresAt]},{sql:'DELETE FROM retention_restore',params:[]}]);
  checkpoint=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0];
 }
 if(checkpoint.kind!=='restore'||checkpoint.manifest_hash!==pointer.sha256||checkpoint.sequence!==root.count||checkpoint.expires_at<=now||!['importing','complete'].includes(checkpoint.state))fail();
 // Control roots are recovered using their original clocks, not fresh reservations.
 const rootCustody=custodies.find(c=>c.folderId===pointer.folderId),rootRecord={...pointer};delete rootRecord.folderId;
 await rootCustody.recoverIndex([rootRecord],digest([rootRecord]));
 let cursor=checkpoint.cursor,processed=0,segmentNumber=-1,segment;
 while(cursor<root.count&&processed<maxFiles){
  const number=Math.floor(cursor/100),segmentPointer=root.segments[number];
  if(number!==segmentNumber){
   segment=await readPinnedInventoryFile(custodies,key,segmentPointer,now);
   if(segment.id!==root.id||segment.offset!==number*100||segment.files.length!==Math.min(100,root.count-number*100))fail();
   const record={...segmentPointer};delete record.folderId;
   await custodies.find(c=>c.folderId===segmentPointer.folderId).recoverIndex([record],digest([record]));segmentNumber=number;
  }
  const file=segment.files[cursor%100];if(!validate(file,now))fail();
  const target=custodies.find(c=>c.folderId===file.folderId);if(!target)fail();
  const record={...file};delete record.folderId;await target.recoverIndex([record],digest([record]));
  // A crash between ID recovery and cursor commit is safe: recoverReserve verifies
  // the same provider ID and original expiry before the duplicate is accepted.
  await fault('mapping_verified',cursor);
  await db.batch([{sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?1 AND cursor=?2 AND state='importing' AND manifest_hash=?3) THEN 1 ELSE json('inventory_cursor_conflict') END",params:[job,cursor,pointer.sha256]},{sql:'UPDATE operational_recovery_checkpoints SET cursor=cursor+1,version=version+1 WHERE id=?1 AND cursor=?2',params:[job,cursor]}]);cursor++;processed++;
 }
 if(cursor===root.count)await db.batch([{sql:"UPDATE operational_recovery_checkpoints SET state='complete',version=version+1 WHERE id=?1 AND cursor=sequence AND manifest_hash=?2",params:[job,pointer.sha256]}]);
 return {verified:cursor===root.count,cursor,files:root.count,runtimeAccess:'blocked_pending_authority_suppression_receipt'};
}
