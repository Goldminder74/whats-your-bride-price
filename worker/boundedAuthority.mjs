import {D1Authority,assertAuthorityStatements} from '../scripts/authority-runtime.mjs';
import {encryptRecord,decryptRecord,recoveryHash} from '../scripts/recovery-crypto.mjs';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
import {boundedSnapshotStep,verifySnapshotProofStep} from './boundedSnapshot.mjs';
import {verifyDriveRecordHeader} from '../scripts/drive-record-header.mjs';
import {assertMirrorIdentity} from './recoveryMirror.mjs';
const WINDOW=RETENTION_POLICY.backupDays*RETENTION_DAY,ZERO='0'.repeat(64);
const hash=v=>recoveryHash(Buffer.from(JSON.stringify(v))),fail=()=>{throw Error('bounded_authority_unavailable');};
const validMirrorCut=b=>b.version!==4||(b.capture?.kind==='recovery-mirror'&&b.capture.sequence===b.sequence&&b.capture.head===b.head&&/^[a-f0-9]{64}$/.test(b.capture.target||'')&&/^[a-f0-9]{64}$/.test(b.capture.origin||'')&&b.inventory?.requiredOnRecovery===true);
const headOf=h=>({id:h.manifest_hash,sequence:h.sequence,headHash:h.head_hash,expiresAt:h.expires_at});
const checkpoint=(id,manifest,sequence,head,cursor,expires,kind='custody',state='complete')=>({sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6,?7,1,?8,?9) ON CONFLICT(id) DO NOTHING",params:[id,kind,manifest,sequence,head,cursor,state,expires-WINDOW,expires]});
async function read(custody,key,pointer){if(!pointer||typeof pointer.name!=='string'||!/^[a-f0-9]{64}$/.test(pointer.sha256||''))fail();const bytes=await custody.get(pointer.name);if(!bytes||recoveryHash(bytes)!==pointer.sha256)fail();return decryptRecord(bytes,key,pointer.name);}
async function put(custody,key,name,body,expires){const old=await custody.get(name),bytes=old||encryptRecord(body,key,name);if(old&&hash(decryptRecord(old,key,name))!==hash(body))fail();const sha256=await custody.put(name,bytes,{createdAt:expires-WINDOW,expiresAt:expires}),copy=await custody.get(name);if(!copy||recoveryHash(copy)!==sha256)fail();return {name,sha256};}
function eventOf(row,key,now){
 const bytes=Buffer.from(row.encrypted_event),e=decryptRecord(bytes,key,row.operation_id+'.intent');
 if(!/^op_\d{13}_[a-f0-9]{32}$/.test(row.operation_id)||e.operationId!==row.operation_id||e.sequence!==row.sequence||e.previousHash!==row.previous_hash||e.intentHash!==row.intent_hash||hash(e.statements)!==row.intent_hash||e.createdAt!==row.created_at||e.expiresAt!==row.expires_at||e.expiresAt-e.createdAt!==WINDOW||e.createdAt>now||e.expiresAt<=now||recoveryHash(bytes)!==row.event_hash)fail();assertAuthorityStatements(e.statements);return e;
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
 const records=folder.index.recoveryRecords?await folder.index.recoveryRecords(page.files.filter(file=>file.mimeType!=='application/vnd.google-apps.folder').map(file=>file.name)):null;
 for(const[fileIndex,file]of page.files.entries()){
  if(file.mimeType==='application/vnd.google-apps.folder'){if(folder!==all[0]||!all.slice(1).some(c=>c.folderId===file.id))fail();continue;}
  if(file.mimeType!=='application/octet-stream'||file.appProperties?.wybpRecovery!=='1'||!file.parents?.includes(folder.folderId))fail();
  const cached=records?.get(file.name),mapped=records?cached?.fileId:await folder.index.get(file.name),clocks=records&&cached?{createdAt:cached.createdAt,expiresAt:cached.expiresAt}:await folder.index.recoveryRecord(file.name);if(mapped!==file.id||!clocks||clocks.expiresAt-clocks.createdAt!==WINDOW)fail();
  const header=verifyDriveRecordHeader({key,folderId:folder.folderId,fileId:file.id,name:file.name},file.appProperties);
  if(header&&(header.createdAt!==clocks.createdAt||header.expiresAt!==clocks.expiresAt))fail();
  if(clocks.expiresAt<=state.asOf)continue;
  const seenId='bounded-seen:'+id+':'+hash([folder.folderId,file.name]),position=hash([pageHash,fileIndex]),seen=(await db.query('SELECT head_hash FROM operational_recovery_checkpoints WHERE id=?1',[seenId]))[0];
  if(seen&&seen.head_hash!==position)fail();
  await db.batch([checkpoint(seenId,hash([file.name,file.id]),0,position,0,head.expiresAt)]);
  // Old intents already embodied in a verified full snapshot need authenticated
  // identity/clocks, not another body download. Legacy records retain full reads.
  if(file.name.endsWith('.intent')&&!(header&&header.sequence<=base.sequence)){
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
export async function boundedAuthorityStep(db,custody,key,id,progress=null,{now=Date.now,snapshotBoundary=null,mirrorIdentity=null}={}){
 if(!/^[a-zA-Z0-9_-]{1,65}$/.test(id||'')||!Buffer.isBuffer(key)||key.length!==32)fail();
 const at=now(),authority=new D1Authority(db,custody,key,{now}),jobId='bounded-job:'+id,baseId='bounded-base:'+id;
 const mirrorTarget=mirrorIdentity===null?null:assertMirrorIdentity(mirrorIdentity);
 const root=snapshotBoundary===null?null:await read(custody,key,snapshotBoundary);
 let mirrorOrigin,mirrorSeal;
 if(mirrorTarget){
  if(root||(await db.query('SELECT id FROM retention_restore')).length)fail();
  mirrorOrigin=(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='mirror-origin'"))[0];mirrorSeal=(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='mirror-seal'"))[0];
  if(mirrorOrigin?.state!=='complete'||mirrorOrigin.head_hash!==mirrorTarget||mirrorSeal?.state!=='complete')fail();
 }
 if(root){
  if(![2,4].includes(root.version)||!validMirrorCut(root)||root.format!=='wybp-authority-boundary-v'+root.version||snapshotBoundary.name!==root.id+'.boundary'||root.expiresAt<=at||root.createdAt>at)fail();
  const receipt=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',['bounded-receipt:'+root.id]))[0];
  if(!receipt||receipt.state!=='complete'||receipt.manifest_hash!==snapshotBoundary.sha256||receipt.sequence!==root.sequence||receipt.head_hash!==root.head||receipt.expires_at!==root.expiresAt)fail();
 }
 let job=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[jobId]))[0];
 if(job?.state==='complete'){
  const done=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',['bounded-receipt:'+id]))[0];if(!done||done.expires_at<=at)fail();const stored=await read(custody,key,{name:id+'.boundary',sha256:done.manifest_hash});if(hash(stored.snapshotAnchor??null)!==hash(snapshotBoundary)||(stored.version===4)!==Boolean(mirrorTarget))fail();return {complete:true,receipt:done.manifest_hash,sequence:done.sequence};
 }
 let head=await authority.freeze(id);
 if(mirrorTarget&&(mirrorSeal.sequence!==head.sequence||mirrorSeal.head_hash!==head.head_hash))fail();
 const jobIdentity=hash(mirrorTarget?[id,head.sequence,head.head_hash,mirrorTarget]:root?[id,head.sequence,head.head_hash,snapshotBoundary]:[id,head.sequence,head.head_hash]);
 if(job&&job.manifest_hash!==jobIdentity)fail();
 if(!job){
  const base=root?{sequence:root.sequence,head_hash:root.head,manifest_hash:snapshotBoundary.sha256}:(await db.query("SELECT * FROM operational_recovery_checkpoints WHERE id='baseline'"))[0]||{sequence:0,head_hash:ZERO,manifest_hash:ZERO};
  const oldest=(await db.query('SELECT MIN(expires_at) expires FROM operational_authority_outbox WHERE sequence>?1 AND sequence<=?2',[base.sequence,head.sequence]))[0]?.expires;
  const expires=Math.min(at+WINDOW,oldest??at+WINDOW,root?.expiresAt??at+WINDOW);if(expires<=at||base.sequence>head.sequence)fail();
  await db.batch([
   {sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id='journal' AND state='exporting' AND manifest_hash=?1 AND sequence=?2 AND head_hash=?3 AND expires_at>?4) THEN 1 ELSE json('authority_fence_changed') END",params:[id,head.sequence,head.head_hash,at]},
   checkpoint(jobId,jobIdentity,head.sequence,head.head_hash,at,expires,'export','exporting'),checkpoint(baseId,base.manifest_hash,base.sequence,base.head_hash,0,expires),
   {sql:"UPDATE operational_recovery_checkpoints SET created_at=?2,expires_at=?3,version=version+1 WHERE id='journal' AND manifest_hash=?1 AND state='exporting'",params:[id,expires-WINDOW,expires]},
  ]);job=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[jobId]))[0];head=await authority.head();
 }
 const baseRow=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[baseId]))[0],base={sequence:baseRow?.sequence,head:baseRow?.head_hash};
 if(!baseRow||job.expires_at<=at||job.sequence!==head.sequence||job.head_hash!==head.head_hash||job.expires_at!==head.expires_at)fail();
 if(root&&(baseRow.manifest_hash!==snapshotBoundary.sha256||base.sequence!==root.sequence||base.head!==root.head))fail();
 const fence=headOf(head),aad=id+'.authority-progress';let s={version:1,fence,phase:root?'journal':'snapshot',snapshotProgress:null,base,sequence:base.sequence,hash:base.head,auth:null,...(root?{snapshot:root.snapshot,snapshotProof:root.snapshotProof}:{})};
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
   if(s.verifySequence!==base.sequence||s.verifyHash!==base.head)fail();
   // A journal checkpoint is not another full-store snapshot/census. The shared
   // writer fence and independently read-back contiguous outbox establish this
   // source cut; recovery MUST still perform the full independent inventory.
   s.phase=root||mirrorTarget?'publish':'inventory';if(!root&&!mirrorTarget)s.inventory={folder:0,cursor:null,expected:null,count:0,total:0,digest:ZERO,asOf:job.cursor,pages:0};
  }
 }else if(s.phase==='inventory'){
  if(await censusStep(db,custody,key,id,s.inventory,base,fence,now()))s.phase='publish';
 }else if(s.phase==='publish'){
  const version=root?3:mirrorTarget?4:2;
  const body={version,format:'wybp-authority-boundary-v'+version,id,createdAt:job.cursor,expiresAt:job.expires_at,sequence:head.sequence,head:head.head_hash,base:s.base,authority:s.auth,snapshot:s.snapshot,snapshotProof:s.snapshotProof,...(root?{snapshotAnchor:snapshotBoundary}:{}),...(mirrorTarget?{capture:{kind:'recovery-mirror',target:mirrorTarget,origin:mirrorOrigin.manifest_hash,sequence:mirrorSeal.sequence,head:mirrorSeal.head_hash}}:{}),inventory:root||mirrorTarget?{requiredOnRecovery:true}:{files:s.inventory.total,digest:s.inventory.digest}};
  s.receipt=(await put(custody,key,id+'.boundary',body,job.expires_at)).sha256;s.ack=base.sequence;s.phase='ack';
 }else if(s.phase==='ack'){
  await read(custody,key,{name:id+'.boundary',sha256:s.receipt});
  const rows=await db.query('SELECT * FROM operational_authority_outbox WHERE sequence>?1 AND sequence<=?2 ORDER BY sequence LIMIT 25',[s.ack,head.sequence]);
  if(!rows.length){if(s.ack!==head.sequence)fail();s.phase='commit';}
  else {let sequence=s.ack;for(const row of rows){if(row.sequence!==++sequence)fail();eventOf(row,key,now());}
   // This newly read-back boundary contains the exact verified event. A previous
   // tail receipt may be superseded, but never its original acknowledgement clock.
   await db.batch(rows.flatMap(row=>[{sql:'UPDATE operational_authority_outbox SET delivery_receipt=?1,acknowledged_at=COALESCE(acknowledged_at,?2) WHERE operation_id=?3 AND event_hash=?4',params:[s.receipt,now(),row.operation_id,row.event_hash]},{sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_authority_outbox WHERE operation_id=?1 AND event_hash=?2 AND delivery_receipt=?3 AND acknowledged_at IS NOT NULL) THEN 1 ELSE json('authority_ack_conflict') END",params:[row.operation_id,row.event_hash,s.receipt]}]));s.ack=sequence;
  }
 }else if(s.phase!=='commit')fail();
 await check();
 if(s.phase==='commit'){
  const pointer={name:id+'.boundary',sha256:s.receipt};await read(custody,key,pointer);await check();
  await db.batch([
   {sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id='journal' AND state='exporting' AND manifest_hash=?1 AND sequence=?2 AND head_hash=?3 AND expires_at=?4) THEN 1 ELSE json('authority_release_changed') END",params:[id,head.sequence,head.head_hash,job.expires_at]},
   ...(!root?[{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('baseline','custody',?1,?2,?3,0,'complete',1,?4,?5) ON CONFLICT(id) DO UPDATE SET manifest_hash=excluded.manifest_hash,sequence=excluded.sequence,head_hash=excluded.head_hash,created_at=excluded.created_at,expires_at=excluded.expires_at,version=version+1",params:[pointer.sha256,head.sequence,head.head_hash,job.expires_at-WINDOW,job.expires_at]}]:[]),
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
export async function verifyAuthorityBoundaryStep(db,custody,key,pointer,progress=null,{now=Date.now,legacySource=null}={}){
 if(!Buffer.isBuffer(key)||key.length!==32)fail();const body=await read(custody,key,pointer),at=now();
 if(![2,3,4].includes(body.version)||body.format!=='wybp-authority-boundary-v'+body.version||pointer.name!==body.id+'.boundary'||!/^[a-zA-Z0-9_-]{1,65}$/.test(body.id||'')||!Number.isSafeInteger(body.sequence)||body.sequence<0||!/^[a-f0-9]{64}$/.test(body.head||'')||!Number.isSafeInteger(body.createdAt)||body.createdAt>at||!Number.isSafeInteger(body.expiresAt)||body.expiresAt<=at||body.expiresAt-body.createdAt>WINDOW||!Number.isSafeInteger(body.base?.sequence)||body.base.sequence<0||body.base.sequence>body.sequence||!/^[a-f0-9]{64}$/.test(body.base.head||''))fail();
 if(!validMirrorCut(body))fail();
 const root=body.version===3?await read(custody,key,body.snapshotAnchor):null;
 if(root&&(![2,4].includes(root.version)||!validMirrorCut(root)||root.format!=='wybp-authority-boundary-v'+root.version||body.snapshotAnchor.name!==root.id+'.boundary'||root.createdAt>body.createdAt||root.expiresAt<body.expiresAt||root.sequence!==body.base.sequence||root.head!==body.base.head||hash(root.snapshot)!==hash(body.snapshot)||hash(root.snapshotProof)!==hash(body.snapshotProof)||!Number.isSafeInteger(root.base?.sequence)||root.base.sequence<0||root.base.sequence>root.sequence||!/^[a-f0-9]{64}$/.test(root.base.head||'')))fail();
 const fence={id:body.id,sequence:body.sequence,headHash:body.head,expiresAt:body.expiresAt},aad='verify-authority:'+pointer.sha256;
 const independentHead=custody.supportsCommitHead===true?await custody.readLatestCommitHead():null;let legacyBootstrap=false;
 if(custody.supportsCommitHead===true){
  if(independentHead){if(independentHead.sequence!==body.sequence||independentHead.head!==body.head||independentHead.expiresAt<=at||independentHead.createdAt>at)fail();}
  else if(body.sequence!==0){const source=legacySource?(await legacySource.query("SELECT * FROM operational_recovery_checkpoints WHERE id='journal'"))[0]:null;if(source?.state!=='idle'||source.sequence!==body.sequence||source.head_hash!==body.head||source.expires_at<=at)fail();legacyBootstrap=true;}
 }
 const snapshotFence=root?{id:root.id,sequence:root.sequence,headHash:root.head,expiresAt:root.expiresAt}:fence;
 let s={version:1,receipt:pointer.sha256,independentHead,legacyBootstrap,auditId:'verify-'+hash([pointer.sha256,at,crypto.randomUUID()]).slice(0,48),phase:'snapshot',snapshotProgress:null,verify:body.authority,sequence:body.sequence,head:body.head};
 if(progress!==null){if(typeof progress!=='string'||progress.length>3000000)fail();s=decryptRecord(Buffer.from(progress,'base64'),key,aad);if(s.version!==1||s.receipt!==pointer.sha256||custody.supportsCommitHead===true&&(hash(s.independentHead??null)!==hash(independentHead)||s.legacyBootstrap!==legacyBootstrap))fail();}
 const id=s.auditId||'verify-'+pointer.sha256.slice(0,48);if(!/^verify-[a-f0-9]{48}$/.test(id))fail();
 const proof=await read(custody,key,body.snapshotProof);if(hash(proof.fence)!==hash(snapshotFence)||hash(proof.snapshot)!==hash(body.snapshot))fail();
 if(s.phase==='snapshot'){
  const result=await verifySnapshotProofStep(custody,key,body.snapshotProof,s.snapshotProgress,{now});s.snapshotProgress=result.progress;if(result.verified)s.phase='authority';
 }else if(s.phase==='authority'){
  if(s.verify){const part=await read(custody,key,s.verify);if(part.format!=='wybp-authority-segment-v2'||hash(part.fence)!==hash(fence)||hash(part.base)!==hash(body.base)||!Array.isArray(part.rows)||!part.rows.length||part.rows.length>25)fail();
   for(const row of [...part.rows].reverse()){eventOf(row,key,at);if(row.sequence!==s.sequence--||row.event_hash!==s.head)fail();s.head=row.previous_hash;}
   await cacheEvents(db,key,id,part.rows,at);s.verify=part.previous;
  }else {if(s.sequence!==body.base.sequence||s.head!==body.base.head)fail();s.phase=root?'snapshot-authority':'inventory';if(root){s.rootVerify=root.authority;s.rootSequence=root.sequence;s.rootHead=root.head;}else s.inventory={folder:0,cursor:null,expected:null,count:0,total:0,digest:ZERO,asOf:at,pages:0};}
 }else if(s.phase==='snapshot-authority'){
  if(!root)fail();
  if(s.rootVerify){const part=await read(custody,key,s.rootVerify);if(part.format!=='wybp-authority-segment-v2'||hash(part.fence)!==hash(snapshotFence)||hash(part.base)!==hash(root.base)||!Array.isArray(part.rows)||!part.rows.length||part.rows.length>25)fail();
   for(const row of [...part.rows].reverse()){eventOf(row,key,at);if(row.sequence!==s.rootSequence--||row.event_hash!==s.rootHead)fail();s.rootHead=row.previous_hash;}
   await cacheEvents(db,key,id,part.rows,at);s.rootVerify=part.previous;
  }else{if(s.rootSequence!==root.base.sequence||s.rootHead!==root.base.head)fail();s.phase='inventory';s.inventory={folder:0,cursor:null,expected:null,count:0,total:0,digest:ZERO,asOf:at,pages:0};}
 }else if(s.phase==='inventory'){
  if(await censusStep(db,custody,key,id,s.inventory,root?.base||body.base,fence,at))s.phase='complete';
 }else if(s.phase!=='complete')fail();
 return {verified:s.phase==='complete',receipt:pointer.sha256,sequence:body.sequence,progress:encryptRecord(s,key,aad).toString('base64'),runtimeAccess:'blocked_pending_verified_import_and_latest_authority'};
}

/** Source-only scratch compaction after immutable boundary readback. These rows
 * are temporary census/chain work, not authority events, file-ID custody, holds
 * or a recovery-access receipt. The existing original-clock job/receipt remains.
 * Caller must hold the shared writer fence. No new retention period is created. */
export async function cleanupAuthoritySnapshotStep(db,custody,key,id,{now=Date.now}={}){
 if(!/^[a-zA-Z0-9_-]{1,65}$/.test(id||'')||!Buffer.isBuffer(key)||key.length!==32)fail();
 const jobId='bounded-job:'+id,receiptId='bounded-receipt:'+id;
 const job=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[jobId]))[0];
 const receipt=(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[receiptId]))[0];
 if(!job||job.state!=='complete'||!receipt||receipt.state!=='complete'||job.expires_at<=now()||receipt.expires_at!==job.expires_at||receipt.sequence!==job.sequence||receipt.head_hash!==job.head_hash)fail();
 const body=await read(custody,key,{name:id+'.boundary',sha256:receipt.manifest_hash});
 if(![2,3,4].includes(body.version)||body.format!=='wybp-authority-boundary-v'+body.version||body.id!==id||body.sequence!==job.sequence||body.head!==job.head_hash||body.expiresAt!==job.expires_at)fail();
 const prefixes=['bounded-op:'+id+':','bounded-page:'+id+':','bounded-seen:'+id+':'];
 const rows=[];
 for(const prefix of prefixes){
  if(rows.length===25)break;
  rows.push(...await db.query('SELECT id FROM operational_recovery_checkpoints WHERE id>=?1 AND id<?2 ORDER BY id LIMIT ?3',[prefix,prefix+'\uffff',25-rows.length]));
 }
 if(rows.length<25){const base=(await db.query('SELECT id FROM operational_recovery_checkpoints WHERE id=?1',['bounded-base:'+id]))[0];if(base)rows.push(base);}
 if(rows.some(row=>row.id!=='bounded-base:'+id&&!prefixes.some(prefix=>row.id.startsWith(prefix))))fail();
 if(rows.length)await db.batch([
  {sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?1 AND state='complete' AND sequence=?3 AND head_hash=?4 AND expires_at=?5) AND EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?2 AND manifest_hash=?6 AND state='complete') THEN 1 ELSE json('authority_cleanup_changed') END",params:[jobId,receiptId,job.sequence,job.head_hash,job.expires_at,receipt.manifest_hash]},
  ...rows.map(row=>({sql:'DELETE FROM operational_recovery_checkpoints WHERE id=?1',params:[row.id]})),
 ]);
 // An empty call is the completion receipt. A lost response can only repeat a
 // bounded deletion of this completed job's scratch, never its authority data.
 return {complete:rows.length===0,deleted:rows.length,receipt:receipt.manifest_hash};
}
