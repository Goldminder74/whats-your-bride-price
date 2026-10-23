import {D1Authority} from '../scripts/authority-runtime.mjs';
import {encryptRecord,decryptRecord,recoveryHash} from '../scripts/recovery-crypto.mjs';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
import {boundedSnapshotStep,verifySnapshotProofStep} from './boundedSnapshot.mjs';
const WINDOW=RETENTION_POLICY.backupDays*RETENTION_DAY,ZERO='0'.repeat(64);
const hash=v=>recoveryHash(Buffer.from(JSON.stringify(v))),fail=()=>{throw Error('bounded_authority_unavailable');};
const headOf=h=>({id:h.manifest_hash,sequence:h.sequence,headHash:h.head_hash,expiresAt:h.expires_at});
const checkpoint=(id,manifest,sequence,head,cursor,expires,kind='custody',state='complete')=>({sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6,?7,1,?8,?9) ON CONFLICT(id) DO NOTHING",params:[id,kind,manifest,sequence,head,cursor,state,expires-WINDOW,expires]});
async function read(custody,key,pointer){if(!pointer||typeof pointer.name!=='string'||!/^[a-f0-9]{64}$/.test(pointer.sha256||''))fail();const bytes=await custody.get(pointer.name);if(!bytes||recoveryHash(bytes)!==pointer.sha256)fail();return decryptRecord(bytes,key,pointer.name);}
async function put(custody,key,name,body,expires){const old=await custody.get(name),bytes=old||encryptRecord(body,key,name);if(old&&hash(decryptRecord(old,key,name))!==hash(body))fail();const sha256=await custody.put(name,bytes,{createdAt:expires-WINDOW,expiresAt:expires}),copy=await custody.get(name);if(!copy||recoveryHash(copy)!==sha256)fail();return {name,sha256};}
function eventOf(row,key,now){
 const bytes=Buffer.from(row.encrypted_event),e=decryptRecord(bytes,key,row.operation_id+'.intent');
 if(!/^op_\d{13}_[a-f0-9]{32}$/.test(row.operation_id)||e.operationId!==row.operation_id||e.sequence!==row.sequence||e.previousHash!==row.previous_hash||e.intentHash!==row.intent_hash||hash(e.statements)!==row.intent_hash||e.createdAt!==row.created_at||e.expiresAt!==row.expires_at||e.expiresAt-e.createdAt!==WINDOW||e.createdAt>now||e.expiresAt<=now||recoveryHash(bytes)!==row.event_hash)fail();return e;
}
async function cacheEvents(db,key,id,events,now){
 const rows=[];for(const row of events){eventOf(row,key,now);const name='bounded-op:'+id+':'+row.operation_id;rows.push(checkpoint(name,row.event_hash,row.sequence,row.previous_hash,0,row.expires_at),{sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?1 AND manifest_hash=?2 AND sequence=?3 AND head_hash=?4 AND expires_at=?5) THEN 1 ELSE json('authority_cache_conflict') END",params:[name,row.event_hash,row.sequence,row.previous_hash,row.expires_at]});}
 if(rows.length)await db.batch(rows);
}
function folders(custody){const all=custody.all||[custody];if(!all.length||all.length>17||new Set(all.map(c=>c.folderId)).size!==all.length||all.some(c=>typeof c.auditPage!=='function'||typeof c.index?.activeCount!=='function'))fail();return all;}
async function censusStep(db,custody,key,id,state,base,head,now){
 const all=folders(custody),folder=all[state.folder];if(!folder)fail();if(custody.check)await custody.check(folder);
 if(state.expected===null)state.expected=await folder.index.activeCount(state.asOf);
 const cursor=state.cursor,page=await folder.auditPage({cursor,pageSize:10});if(!Array.isArray(page.files)||page.files.length>10||page.cursor===cursor&&cursor!==null)fail();
 const pageHash=hash([folder.folderId,cursor]),pageId='bounded-page:'+id+':'+hash([folder.folderId,cursor||'first']);
 const remembered=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[pageId]))[0],pageContent=hash(page);
 if(remembered&&(remembered.manifest_hash!==pageContent||remembered.cursor!==state.pages))fail();
 await db.batch([checkpoint(pageId,pageContent,0,pageHash,state.pages,head.expiresAt)]);
 for(const[fileIndex,file]of page.files.entries()){
  if(file.mimeType==='application/vnd.google-apps.folder'){if(folder!==all[0]||!all.slice(1).some(c=>c.folderId===file.id))fail();continue;}
  if(file.mimeType!=='application/octet-stream'||file.appProperties?.wybpRecovery!=='1'||!file.parents?.includes(folder.folderId))fail();
  const mapped=await folder.index.get(file.name),clocks=await folder.index.recoveryRecord(file.name);if(mapped!==file.id||!clocks||clocks.expiresAt-clocks.createdAt!==WINDOW)fail();
  if(clocks.expiresAt<=state.asOf)continue;
  const seenId='bounded-seen:'+id+':'+hash([folder.folderId,file.name]),position=hash([pageHash,fileIndex]),seen=(await db.query('SELECT head_hash FROM operational_recovery_checkpoints WHERE id=?1',[seenId]))[0];
  if(seen&&seen.head_hash!==position)fail();
  await db.batch([checkpoint(seenId,hash([file.name,file.id]),0,position,0,head.expiresAt)]);
  if(file.name.endsWith('.intent')){
   const bytes=await custody.get(file.name);if(!bytes)fail();const e=decryptRecord(bytes,key,file.name),op=file.name.slice(0,-7);
   if(e.operationId!==op||!Number.isSafeInteger(e.sequence)||e.sequence<1||e.expiresAt-e.createdAt!==WINDOW||e.createdAt>now)fail();
   if(e.sequence>base.sequence){
    const proof=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',['bounded-op:'+id+':'+op]))[0];
    if(!proof||proof.manifest_hash!==recoveryHash(bytes)||proof.sequence!==e.sequence||proof.head_hash!==e.previousHash){
     const abort=await custody.get(op+'.abort');if(!abort)fail();const a=decryptRecord(abort,key,op+'.abort');
     if(a.operationId!==op||a.intentHash!==recoveryHash(bytes)||!/^[a-f0-9]{64}$/.test(a.head)||!Number.isSafeInteger(a.sequence)||a.sequence>head.sequence||a.createdAt!==e.createdAt||a.expiresAt!==e.expiresAt)fail();
    }
   }
  }
  state.count++;state.digest=hash([state.digest,file.name,file.id,clocks]);
 }
 state.cursor=page.cursor||null;state.pages++;
 if(!state.cursor){if(state.count!==state.expected||await folder.index.activeCount(state.asOf)!==state.expected)fail();state.total+=state.count;state.folder++;state.count=0;state.expected=null;state.pages=0;}
 return state.folder===all.length;
}

/** Called under the shared D1 writer fence. One bounded snapshot, authority
 * segment, readback segment or provider page per invocation. This replaces no
 * migration and never materialises the retained inventory/events in memory.
 */
export async function boundedAuthorityStep(db,custody,key,id,progress=null,{now=Date.now}={}){
 if(!/^[a-zA-Z0-9_-]{1,65}$/.test(id||'')||!Buffer.isBuffer(key)||key.length!==32)fail();
 const at=now(),authority=new D1Authority(db,custody,key,{now}),jobId='bounded-job:'+id,baseId='bounded-base:'+id;
 let job=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[jobId]))[0];
 if(job?.state==='complete'){
  const done=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',['bounded-receipt:'+id]))[0];if(!done||done.expires_at<=at)fail();await read(custody,key,{name:id+'.boundary',sha256:done.manifest_hash});return {complete:true,receipt:done.manifest_hash,sequence:done.sequence};
 }
 let head=await authority.freeze(id);
 if(!job){
  const base=(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='baseline'"))[0]||{sequence:0,head_hash:ZERO,manifest_hash:ZERO};
  const oldest=(await db.query('SELECT MIN(expires_at) expires FROM operational_authority_outbox WHERE sequence>?1 AND sequence<=?2',[base.sequence,head.sequence]))[0]?.expires;
  const expires=Math.min(at+WINDOW,oldest??at+WINDOW);if(expires<=at||base.sequence>head.sequence)fail();
  await db.batch([
   {sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id='journal' AND state='exporting' AND manifest_hash=?1 AND sequence=?2 AND head_hash=?3 AND expires_at>?4) THEN 1 ELSE json('authority_fence_changed') END",params:[id,head.sequence,head.head_hash,at]},
   checkpoint(jobId,hash([id,head.sequence,head.head_hash]),head.sequence,head.head_hash,at,expires,'export','exporting'),checkpoint(baseId,base.manifest_hash,base.sequence,base.head_hash,0,expires),
   {sql:"UPDATE operational_recovery_checkpoints SET created_at=?2,expires_at=?3,version=version+1 WHERE id='journal' AND manifest_hash=?1 AND state='exporting'",params:[id,expires-WINDOW,expires]},
  ]);job=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[jobId]))[0];head=await authority.head();
 }
 const baseRow=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[baseId]))[0],base={sequence:baseRow?.sequence,head:baseRow?.head_hash};
 if(!baseRow||job.expires_at<=at||job.sequence!==head.sequence||job.head_hash!==head.head_hash||job.expires_at!==head.expires_at)fail();
 const fence=headOf(head),aad=id+'.authority-progress';let s={version:1,fence,phase:'snapshot',snapshotProgress:null,base,sequence:base.sequence,hash:base.head,auth:null};
 if(progress!==null){if(typeof progress!=='string'||progress.length>3000000)fail();s=decryptRecord(Buffer.from(progress,'base64'),key,aad);if(s.version!==1||hash(s.fence)!==hash(fence)||hash(s.base)!==hash(base))fail();}
 const check=async()=>{const h=await authority.head();if(h.state!=='exporting'||hash(headOf(h))!==hash(fence)||h.expires_at<=now())fail();};await check();
 if(s.phase==='snapshot'){
  const snap=await boundedSnapshotStep(db,custody,key,head,s.snapshotProgress,{now});s.snapshotProgress=snap.progress;
  if(snap.complete){s.snapshot=snap.snapshot;s.snapshotProof=snap.proof;s.phase='journal';}
 }else if(s.phase==='journal'){
  const rows=await db.query('SELECT * FROM operational_authority_outbox WHERE sequence>?1 AND sequence<=?2 ORDER BY sequence LIMIT 25',[s.sequence,head.sequence]);
  if(!rows.length){if(s.sequence!==head.sequence||s.hash!==head.head_hash)fail();s.phase='readback';s.verify=s.auth;s.verifySequence=head.sequence;s.verifyHash=head.head_hash;}
  else{
   let seq=s.sequence,previous=s.hash;for(const row of rows){eventOf(row,key,now());if(row.sequence!==++seq||row.previous_hash!==previous)fail();const intent=await custody.get(row.operation_id+'.intent');if(!intent||recoveryHash(intent)!==row.event_hash)fail();previous=row.event_hash;}
   const name=id+'.authority'+rows[0].sequence+'_'+seq+'.enc',body={format:'wybp-authority-segment-v2',fence,base:s.base,previous:s.auth,rows};
   s.auth=await put(custody,key,name,body,job.expires_at);s.sequence=seq;s.hash=previous;
  }
 }else if(s.phase==='readback'){
  if(s.verify){
   const part=await read(custody,key,s.verify);if(part.format!=='wybp-authority-segment-v2'||hash(part.fence)!==hash(fence)||hash(part.base)!==hash(base)||!Array.isArray(part.rows)||!part.rows.length||part.rows.length>25)fail();
   for(const row of [...part.rows].reverse()){eventOf(row,key,now());if(row.sequence!==s.verifySequence--||row.event_hash!==s.verifyHash)fail();s.verifyHash=row.previous_hash;}
   await cacheEvents(db,key,id,part.rows,now());s.verify=part.previous;
  }else{
   if(s.verifySequence!==base.sequence||s.verifyHash!==base.head)fail();s.phase='inventory';s.inventory={folder:0,cursor:null,expected:null,count:0,total:0,digest:ZERO,asOf:job.cursor,pages:0};
  }
 }else if(s.phase==='inventory'){
  if(await censusStep(db,custody,key,id,s.inventory,base,fence,now()))s.phase='publish';
 }else if(s.phase==='publish'){
  const body={version:2,format:'wybp-authority-boundary-v2',id,createdAt:job.cursor,expiresAt:job.expires_at,sequence:head.sequence,head:head.head_hash,base:s.base,authority:s.auth,snapshot:s.snapshot,snapshotProof:s.snapshotProof,inventory:{files:s.inventory.total,digest:s.inventory.digest}};
  s.receipt=(await put(custody,key,id+'.boundary',body,job.expires_at)).sha256;s.ack=base.sequence;s.phase='ack';
 }else if(s.phase==='ack'){
  await read(custody,key,{name:id+'.boundary',sha256:s.receipt});
  const rows=await db.query('SELECT * FROM operational_authority_outbox WHERE sequence>?1 AND sequence<=?2 ORDER BY sequence LIMIT 25',[s.ack,head.sequence]);
  if(!rows.length){if(s.ack!==head.sequence)fail();s.phase='commit';}
  else {let sequence=s.ack;for(const row of rows){if(row.sequence!==++sequence)fail();eventOf(row,key,now());}
   await db.batch(rows.flatMap(row=>[{sql:'UPDATE operational_authority_outbox SET delivery_receipt=?1,acknowledged_at=?2 WHERE operation_id=?3 AND event_hash=?4 AND (delivery_receipt IS NULL OR delivery_receipt=?1)',params:[s.receipt,now(),row.operation_id,row.event_hash]},{sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_authority_outbox WHERE operation_id=?1 AND event_hash=?2 AND delivery_receipt=?3 AND acknowledged_at IS NOT NULL) THEN 1 ELSE json('authority_ack_conflict') END",params:[row.operation_id,row.event_hash,s.receipt]}]));s.ack=sequence;
  }
 }else if(s.phase!=='commit')fail();
 await check();
 if(s.phase==='commit'){
  const pointer={name:id+'.boundary',sha256:s.receipt};await read(custody,key,pointer);await check();
  await db.batch([
   {sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id='journal' AND state='exporting' AND manifest_hash=?1 AND sequence=?2 AND head_hash=?3 AND expires_at=?4) THEN 1 ELSE json('authority_release_changed') END",params:[id,head.sequence,head.head_hash,job.expires_at]},
   {sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('baseline','custody',?1,?2,?3,0,'complete',1,?4,?5) ON CONFLICT(id) DO UPDATE SET manifest_hash=excluded.manifest_hash,sequence=excluded.sequence,head_hash=excluded.head_hash,created_at=excluded.created_at,expires_at=excluded.expires_at,version=version+1",params:[pointer.sha256,head.sequence,head.head_hash,job.expires_at-WINDOW,job.expires_at]},
   checkpoint('bounded-receipt:'+id,pointer.sha256,head.sequence,head.head_hash,base.sequence,job.expires_at),
   {sql:"UPDATE operational_recovery_checkpoints SET state='complete',version=version+1 WHERE id=?1",params:[jobId]},
   {sql:"UPDATE operational_recovery_checkpoints SET state='idle',version=version+1 WHERE id='journal' AND manifest_hash=?1",params:[id]},
  ]);
  return {complete:true,receipt:pointer.sha256,sequence:head.sequence};
 }
 return {complete:false,progress:encryptRecord(s,key,aad).toString('base64'),runtimeAccess:'blocked_pending_verified_boundary'};
}

/** Independent, bounded verification using only custody plus a disposable/local
 * checkpoint database. No source outbox query and no application-access grant.
 * A later/unresolved intent rejects this anchor; it is NEVER silently omitted.
 */
export async function verifyAuthorityBoundaryStep(db,custody,key,pointer,progress=null,{now=Date.now}={}){
 if(!Buffer.isBuffer(key)||key.length!==32)fail();const body=await read(custody,key,pointer),at=now();
 if(body.version!==2||body.format!=='wybp-authority-boundary-v2'||pointer.name!==body.id+'.boundary'||!/^[a-zA-Z0-9_-]{1,65}$/.test(body.id||'')||!Number.isSafeInteger(body.sequence)||body.sequence<0||!/^[a-f0-9]{64}$/.test(body.head||'')||!Number.isSafeInteger(body.createdAt)||body.createdAt>at||!Number.isSafeInteger(body.expiresAt)||body.expiresAt<=at||body.expiresAt-body.createdAt>WINDOW||!Number.isSafeInteger(body.base?.sequence)||body.base.sequence<0||body.base.sequence>body.sequence||!/^[a-f0-9]{64}$/.test(body.base.head||''))fail();
 const fence={id:body.id,sequence:body.sequence,headHash:body.head,expiresAt:body.expiresAt},aad='verify-authority:'+pointer.sha256,id='verify-'+pointer.sha256.slice(0,48);
 let s={version:1,receipt:pointer.sha256,phase:'snapshot',snapshotProgress:null,verify:body.authority,sequence:body.sequence,head:body.head};
 if(progress!==null){if(typeof progress!=='string'||progress.length>3000000)fail();s=decryptRecord(Buffer.from(progress,'base64'),key,aad);if(s.version!==1||s.receipt!==pointer.sha256)fail();}
 const proof=await read(custody,key,body.snapshotProof);if(hash(proof.fence)!==hash(fence)||hash(proof.snapshot)!==hash(body.snapshot))fail();
 if(s.phase==='snapshot'){
  const result=await verifySnapshotProofStep(custody,key,body.snapshotProof,s.snapshotProgress,{now});s.snapshotProgress=result.progress;if(result.verified)s.phase='authority';
 }else if(s.phase==='authority'){
  if(s.verify){const part=await read(custody,key,s.verify);if(part.format!=='wybp-authority-segment-v2'||hash(part.fence)!==hash(fence)||hash(part.base)!==hash(body.base)||!Array.isArray(part.rows)||!part.rows.length||part.rows.length>25)fail();
   for(const row of [...part.rows].reverse()){eventOf(row,key,at);if(row.sequence!==s.sequence--||row.event_hash!==s.head)fail();s.head=row.previous_hash;}
   await cacheEvents(db,key,id,part.rows,at);s.verify=part.previous;
  }else {if(s.sequence!==body.base.sequence||s.head!==body.base.head)fail();s.phase='inventory';s.inventory={folder:0,cursor:null,expected:null,count:0,total:0,digest:ZERO,asOf:at,pages:0};}
 }else if(s.phase==='inventory'){
  if(await censusStep(db,custody,key,id,s.inventory,body.base,fence,at))s.phase='complete';
 }else if(s.phase!=='complete')fail();
 return {verified:s.phase==='complete',receipt:pointer.sha256,sequence:body.sequence,progress:encryptRecord(s,key,aad).toString('base64'),runtimeAccess:'blocked_pending_verified_import_and_latest_authority'};
}
