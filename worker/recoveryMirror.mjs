// Private, optional recovery target. No HTTP, schedule, resource creation or
// application access. Uses existing checkpoints/schema; customer writes stay on
// the source. A same-provider mirror never replaces independent custody.
import {D1WriterFence} from './d1WriterFence.mjs';
import {assertAuthorityStatements} from '../scripts/authority-runtime.mjs';
import {decryptRecord,encryptRecord,recoveryHash} from '../scripts/recovery-crypto.mjs';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
const WINDOW=RETENTION_POLICY.backupDays*RETENTION_DAY,ZERO='0'.repeat(64);
const hash=x=>recoveryHash(Buffer.from(JSON.stringify(x))),fail=()=>{throw Error('recovery_mirror_unavailable');};
const checkpoint=(id,manifest,sequence,head,cursor,state,created,expires)=>({sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,?9,?2,?3,?4,?5,?6,1,?7,?8)",params:[id,manifest,sequence,head,cursor,state,created,expires,id==='journal'?'journal':id==='baseline'?'custody':'restore']});
const row=async(db,id)=>(await db.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[id]))[0];
async function read(custody,key,p){if(!/^[a-f0-9]{64}$/.test(p?.sha256||''))fail();const bytes=await custody.get(p.name);if(!bytes||recoveryHash(bytes)!==p.sha256)fail();return decryptRecord(bytes,key,p.name);}
export function assertMirrorIdentity(identity){
 if(!identity||identity.role!=='recovery-mirror'||!['wybp-prod-recovery-d1-r001','wybp-capacity-recovery-d1-r002'].includes(identity.name)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(identity.id||'')||['a5b2b409-ed08-48c9-ac1d-36699fc6c4b9','1a268b28-e6d5-4431-8f84-a886df9369f1'].includes(identity.id))fail();return hash(identity);
}
function pinValid(pin,at){return pin&&Number.isSafeInteger(pin.sequence)&&pin.sequence>0&&/^[a-f0-9]{64}$/.test(pin.head||'')&&Number.isSafeInteger(pin.createdAt)&&pin.createdAt<=at&&pin.expiresAt-pin.createdAt===WINDOW&&pin.expiresAt>at;}
export async function initialiseRecoveryMirror(mirror,custody,key,plan,boundary,verification,{identity,job,now=Date.now}={}){
 const target=assertMirrorIdentity(identity),at=now(),body=await read(custody,key,boundary),manifest=await read(custody,key,plan);
 if(!/^recovery_[a-zA-Z0-9_-]{1,60}$/.test(job||'')||![2,4].includes(body.version)||body.format!=='wybp-authority-boundary-v'+body.version||manifest.provenance?.boundarySha256!==boundary.sha256||manifest.provenance.snapshotSha256!==body.snapshot?.sha256||manifest.expiresAt!==body.expiresAt||body.expiresAt<=at||verification?.verified!==true)fail();
 const audit=decryptRecord(Buffer.from(verification.progress||'','base64'),key,'verify-authority:'+boundary.sha256);
 if(audit.phase!=='complete'||audit.receipt!==boundary.sha256||audit.legacyBootstrap||!Number.isSafeInteger(audit.inventory?.total)||audit.inventory.asOf>at||custody.supportsCommitHead!==true||hash(audit.independentHead??null)!==hash(await custody.readLatestCommitHead()))fail();
 if(body.sequence>0&&(!pinValid(audit.independentHead,at)||audit.independentHead.sequence!==body.sequence||audit.independentHead.head!==body.head))fail();
 const origin=hash([target,plan.sha256,boundary.sha256]);
 return new D1WriterFence(mirror,{now}).run('mirror-initialise',origin,async db=>{
  const prior=await row(db,'mirror-origin');if(prior){if(prior.manifest_hash!==origin)fail();return {initialised:true,sequence:prior.sequence,runtimeAccess:'blocked'};}
  const restored=await row(db,job),verified=await row(db,job+'_verified');
  if(restored?.state!=='complete'||restored.manifest_hash!==plan.sha256||restored.cursor!==manifest.pages||verified?.state!=='complete'||verified.manifest_hash!==plan.sha256||verified.head_hash!==manifest.schemaHash||verified.sequence!==manifest.pages||audit.inventory.asOf<verified.cursor||(await db.query('SELECT id FROM retention_restore')).length||(await row(db,'journal'))||(await db.query('SELECT sequence FROM operational_authority_outbox LIMIT 1')).length||(await db.query('PRAGMA foreign_key_check')).length)fail();
  let count=0;for(const folder of custody.all||[custody])count+=await folder.index.activeCount(audit.inventory.asOf);if(count!==audit.inventory.total)fail();
  const created=body.expiresAt-WINDOW;
  await db.batch([checkpoint('mirror-origin',origin,body.sequence,target,0,'complete',created,body.expiresAt),checkpoint('journal',boundary.sha256,body.sequence,body.head,0,'idle',created,body.expiresAt),checkpoint('baseline',boundary.sha256,body.sequence,body.head,0,'complete',created,body.expiresAt),checkpoint('mirror-seal',origin,body.sequence,body.head,0,'complete',created,body.expiresAt)]);
  return {initialised:true,sequence:body.sequence,runtimeAccess:'blocked'};
 });
}

/** Pin one authenticated committed cut, then replay <=25 ORIGINAL events per
 * step. A partial cut is unsealed and cannot be captured. Each SQL effect,
 * outbox copy and cursor share one D1 transaction, including after a lost reply. */
export async function replayRecoveryMirrorStep(source,mirror,custody,key,{identity,now=Date.now,maxEvents=25,fault=()=>{}}={}){
 const target=assertMirrorIdentity(identity);if(!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>25||custody.supportsCommitHead!==true)fail();
 return new D1WriterFence(mirror,{now}).run('mirror-replay',target,async db=>{
  const origin=await row(db,'mirror-origin'),head=await row(db,'journal'),at=now();
  if(!origin||origin.head_hash!==target||head?.expires_at<=at||(await db.query('SELECT id FROM retention_restore')).length)fail();
  if(head?.state==='exporting')return {pausedForSnapshot:true,sequence:head.sequence,runtimeAccess:'blocked'};
  if(head?.state!=='idle')fail();let job=await row(db,'mirror-replay');
  const aad='mirror-cut:'+target;
  if(!job||job.state==='complete'){
   const pin=await custody.readLatestCommitHead();
   if(!pin&&head.sequence===0)return {caughtUp:true,sequence:0,runtimeAccess:'blocked'};
   if(!pinValid(pin,at)||pin.sequence<head.sequence||pin.sequence===head.sequence&&pin.head!==head.head_hash)fail();
   if(pin.sequence===head.sequence)return {caughtUp:true,sequence:head.sequence,runtimeAccess:'blocked'};
   const sourceHead=await row(source,'journal');if(!sourceHead||sourceHead.sequence<pin.sequence||sourceHead.expires_at<=at)fail();
   const encrypted=encryptRecord(pin,key,aad).toString();
   await db.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('mirror-replay','restore',?1,?2,?3,?4,'importing',1,?5,?6) ON CONFLICT(id) DO UPDATE SET sequence=excluded.sequence,head_hash=excluded.head_hash,cursor=excluded.cursor,state='importing',version=version+1,created_at=excluded.created_at,expires_at=excluded.expires_at WHERE manifest_hash=excluded.manifest_hash",params:[target,pin.sequence,encrypted,head.sequence,pin.createdAt,pin.expiresAt]}, {sql:"UPDATE operational_recovery_checkpoints SET state='importing',version=version+1 WHERE id='mirror-seal'",params:[]}]);job=await row(db,'mirror-replay');
  }
  if(job.manifest_hash!==target||job.state!=='importing'||job.cursor!==head.sequence)fail();const pin=decryptRecord(Buffer.from(job.head_hash),key,aad);if(!pinValid(pin,at)||job.sequence!==pin.sequence)fail();
  const events=await source.query('SELECT * FROM operational_authority_outbox WHERE sequence>?1 AND sequence<=?2 ORDER BY sequence LIMIT ?3',[job.cursor,pin.sequence,maxEvents]);
  let sequence=head.sequence,previous=head.head_hash;
  if(!events.length&&sequence!==pin.sequence)fail();
  for(const event of events){
   const bytes=Buffer.from(event.encrypted_event),value=decryptRecord(bytes,key,event.operation_id+'.intent');
   if(event.sequence!==++sequence||event.previous_hash!==previous||value.sequence!==sequence||value.previousHash!==previous||value.operationId!==event.operation_id||value.intentHash!==event.intent_hash||hash(value.statements)!==value.intentHash||recoveryHash(bytes)!==event.event_hash||value.createdAt!==event.created_at||value.expiresAt!==event.expires_at||value.createdAt>at||value.expiresAt-value.createdAt!==WINDOW||value.expiresAt<=at)fail();
   assertAuthorityStatements(value.statements);if(value.statements.length>97)fail();const copy=await custody.get(event.operation_id+'.intent');if(!copy||recoveryHash(copy)!==event.event_hash)fail();
   await db.batch([{sql:'INSERT INTO operational_authority_outbox(sequence,operation_id,intent_hash,previous_hash,event_hash,encrypted_event,created_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)',params:[event.sequence,event.operation_id,event.intent_hash,event.previous_hash,event.event_hash,event.encrypted_event,event.created_at,event.expires_at]},...value.statements,{sql:"UPDATE operational_recovery_checkpoints SET sequence=CASE WHEN id='journal' THEN ?1 ELSE sequence END,head_hash=CASE WHEN id='journal' THEN ?2 ELSE head_hash END,cursor=CASE WHEN id='mirror-replay' THEN ?1 ELSE cursor END,version=version+1 WHERE id IN ('journal','mirror-replay')",params:[sequence,event.event_hash]}]);
   previous=event.event_hash;await fault('mirror_event_committed',sequence);
  }
  if(sequence===pin.sequence){if(previous!==pin.head||(await db.query('PRAGMA foreign_key_check')).length)fail();await db.batch([{sql:"UPDATE operational_recovery_checkpoints SET state='complete',version=version+1 WHERE id='mirror-replay' AND cursor=?1",params:[sequence]},{sql:"UPDATE operational_recovery_checkpoints SET sequence=?1,head_hash=?2,state='complete',created_at=?3,expires_at=?4,version=version+1 WHERE id='mirror-seal'",params:[sequence,previous,pin.createdAt,pin.expiresAt]}]);}
  return {caughtUp:sequence===pin.sequence,sequence,pinnedSequence:pin.sequence,runtimeAccess:'blocked'};
 });
}

/** Publish a completed mirror snapshot on source in short <=25-row steps.
 * No source freeze/census. Unknown receipts retain the same writer identity. */
export async function acknowledgeMirrorSnapshotStep(source,custody,key,pointer,{now=Date.now}={}){
 const body=await read(custody,key,pointer),at=now();if(body.version!==4||body.format!=='wybp-authority-boundary-v4'||body.capture?.kind!=='recovery-mirror'||body.capture.sequence!==body.sequence||body.capture.head!==body.head||!/^[a-f0-9]{64}$/.test(body.capture.target||'')||!/^[a-f0-9]{64}$/.test(body.capture.origin||'')||pointer.name!==body.id+'.boundary'||body.expiresAt<=at)fail();
 const proof=await read(custody,key,body.snapshotProof);if(proof.fence?.id!==body.id||proof.fence.sequence!==body.sequence||proof.fence.headHash!==body.head||hash(proof.snapshot)!==hash(body.snapshot))fail();
 return new D1WriterFence(source,{now}).run('mirror-ack:'+body.id,pointer.sha256,async db=>{
  const head=await row(db,'journal'),base=await row(db,'baseline'),id='mirror-ack:'+body.id;let job=await row(db,id);
  if(head?.state!=='idle'||head.sequence<body.sequence||head.expires_at<=at||base&&base.sequence>body.sequence)fail();
  const committed=await custody.readLatestCommitHead();
  if(head.sequence>0&&(!pinValid(committed,at)||committed.sequence!==head.sequence||committed.head!==head.head_hash))fail();
  const cut=body.sequence===0?{event_hash:ZERO}:(await db.query('SELECT event_hash FROM operational_authority_outbox WHERE sequence=?1',[body.sequence]))[0]||(base?.sequence===body.sequence?{event_hash:base.head_hash}:null);
  if(cut?.event_hash!==body.head)fail();
  if(!job){await db.batch([checkpoint(id,pointer.sha256,body.sequence,body.head,base?.sequence||0,'importing',body.expiresAt-WINDOW,body.expiresAt)]);job=await row(db,id);}
  if(job.manifest_hash!==pointer.sha256||job.sequence!==body.sequence||job.head_hash!==body.head)fail();if(job.state==='complete')return {complete:true,sequence:body.sequence};
  const events=await db.query('SELECT * FROM operational_authority_outbox WHERE sequence>?1 AND sequence<=?2 ORDER BY sequence LIMIT 25',[job.cursor,body.sequence]);
  let cursor=job.cursor;for(const event of events){if(event.sequence!==++cursor)fail();}
  if(!events.length&&cursor!==body.sequence)fail();
  if(events.length)await db.batch([...events.map(e=>({sql:'UPDATE operational_authority_outbox SET delivery_receipt=?1,acknowledged_at=COALESCE(acknowledged_at,?2) WHERE operation_id=?3 AND event_hash=?4',params:[pointer.sha256,at,e.operation_id,e.event_hash]})),{sql:'UPDATE operational_recovery_checkpoints SET cursor=?2,version=version+1 WHERE id=?1 AND cursor=?3',params:[id,cursor,job.cursor]}]);
  if(cursor===body.sequence)await db.batch([{sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('baseline','custody',?1,?2,?3,0,'complete',1,?4,?5) ON CONFLICT(id) DO UPDATE SET manifest_hash=excluded.manifest_hash,sequence=excluded.sequence,head_hash=excluded.head_hash,created_at=excluded.created_at,expires_at=excluded.expires_at,version=version+1",params:[pointer.sha256,body.sequence,body.head,body.expiresAt-WINDOW,body.expiresAt]},checkpoint('bounded-receipt:'+body.id,pointer.sha256,body.sequence,body.head,body.base.sequence,'complete',body.expiresAt-WINDOW,body.expiresAt),{sql:"UPDATE operational_recovery_checkpoints SET created_at=MAX(created_at,?1),expires_at=MAX(expires_at,?2),version=version+1 WHERE id='journal'",params:[body.expiresAt-WINDOW,body.expiresAt]},{sql:"UPDATE operational_recovery_checkpoints SET state='complete',version=version+1 WHERE id=?1",params:[id]}]);
  return {complete:cursor===body.sequence,sequence:body.sequence,acknowledgedThrough:cursor};
 });
}
