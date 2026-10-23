// Private recovery only. This never changes runtime flags, expected receipt
// configuration, schemas, restored business rows, payments or public access.
import {decryptRecord,recoveryHash} from './recovery-crypto.mjs';
import {D1WriterFence} from '../worker/d1WriterFence.mjs';
import {RETENTION_POLICY,RETENTION_DAY} from '../db/retentionPolicy.ts';
const WINDOW=RETENTION_POLICY.backupDays*RETENTION_DAY;
const fail=()=>{throw Error('production_recovery_release_unavailable');};
const hash=value=>recoveryHash(Buffer.from(JSON.stringify(value)));
async function read(custody,key,pointer){if(!pointer||typeof pointer.name!=='string'||!/^[a-f0-9]{64}$/.test(pointer.sha256||''))fail();const bytes=await custody.get(pointer.name);if(!bytes||recoveryHash(bytes)!==pointer.sha256)fail();return decryptRecord(bytes,key,pointer.name);}

export async function finalizeProductionAuthorityRestore(db,custody,key,plan,boundary,verification,{role,databaseName,databaseId,job,now=Date.now}={}){
 if(role!=='production-ops'||databaseName!=='wybp-prod-d1-r001'||databaseId!=='a5b2b409-ed08-48c9-ac1d-36699fc6c4b9'||!/^recovery_[a-zA-Z0-9_-]{1,60}$/.test(job||''))fail();
 const manifest=await read(custody,key,plan),body=await read(custody,key,boundary),at=now();
 if(manifest.provenance?.boundarySha256!==boundary.sha256||manifest.provenance.snapshotSha256!==body.snapshot?.sha256||manifest.expiresAt!==body.expiresAt||manifest.expiresAt-manifest.createdAt!==WINDOW||manifest.expiresAt<=at||![2,3,4].includes(body.version)||body.format!=='wybp-authority-boundary-v'+body.version||boundary.name!==body.id+'.boundary')fail();
 if(typeof verification?.progress!=='string'||verification.progress.length>3000000)fail();
 const state=decryptRecord(Buffer.from(verification.progress,'base64'),key,'verify-authority:'+boundary.sha256);
 if(verification.verified!==true||state.version!==1||state.phase!=='complete'||state.receipt!==boundary.sha256||!Number.isSafeInteger(state.inventory?.asOf)||state.inventory.asOf>at||!Number.isSafeInteger(state.inventory.total)||!/^[a-f0-9]{64}$/.test(state.inventory.digest||''))fail();
 if(custody.supportsCommitHead===true&&(state.legacyBootstrap||hash(state.independentHead??null)!==hash(await custody.readLatestCommitHead())||body.sequence>0&&(!state.independentHead||state.independentHead.sequence!==body.sequence||state.independentHead.head!==body.head)))fail();
 const receipt=hash(['wybp-production-recovery-v1',plan.sha256,boundary.sha256,body.sequence,body.head,manifest.schemaHash]);
 return new D1WriterFence(db,{now}).run('finalize:'+job,hash([plan.sha256,boundary.sha256]),async fenced=>{
  const main=(await fenced.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job]))[0],ready=(await fenced.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job+'_verified']))[0];
  if(!main||main.state!=='complete'||main.manifest_hash!==plan.sha256||main.cursor!==manifest.pages||main.expires_at!==manifest.expiresAt||!ready||ready.state!=='complete'||ready.manifest_hash!==plan.sha256||ready.head_hash!==manifest.schemaHash||ready.sequence!==manifest.pages||ready.expires_at!==manifest.expiresAt||state.inventory.asOf<ready.cursor)fail();
  const all=custody.all||[custody];let count=0;
  if(!all.length||all.length>17||new Set(all.map(c=>c.folderId)).size!==all.length)fail();
  // The source application is already blocked by the empty receipt. The shared
  // target writer fence prevents a new application mutation between this check
  // and the transaction below. Changed reservations invalidate the verified cut.
  for(const folder of all){if(custody.check)await custody.check(folder);count+=await folder.index.activeCount(state.inventory.asOf);}
  if(count!==state.inventory.total||(await fenced.query('PRAGMA foreign_key_check')).length)fail();
  const prior=(await fenced.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[job+'_authority_ready']))[0];
  if(prior){
   const active=(await fenced.query("SELECT receipt_hash FROM retention_restore WHERE id='active'"))[0],head=(await fenced.query("SELECT * FROM operational_recovery_checkpoints WHERE id='journal'"))[0];
   if(prior.manifest_hash!==plan.sha256||prior.head_hash!==receipt||active?.receipt_hash!==receipt||head?.sequence!==body.sequence||head.head_hash!==body.head||head.state!=='idle')fail();
   return {verified:true,receipt,sequence:body.sequence,runtimeAccess:'blocked_pending_runtime_receipt_configuration'};
  }
  if((await fenced.query('SELECT id FROM retention_restore')).length||(await fenced.query("SELECT id FROM operational_recovery_checkpoints WHERE id='journal'")).length||(await fenced.query('SELECT operation_id FROM operational_authority_outbox LIMIT 1')).length)fail();
  await fenced.batch([
   {sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?1 AND state='complete' AND manifest_hash=?2) AND EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?3 AND state='complete' AND manifest_hash=?2 AND cursor<=?4) AND NOT EXISTS(SELECT 1 FROM retention_restore) THEN 1 ELSE json('recovery_release_changed') END",params:[job,plan.sha256,job+'_verified',state.inventory.asOf]},
   {sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('journal','journal',?1,?2,?3,0,'idle',1,?4,?5)",params:[boundary.sha256,body.sequence,body.head,manifest.createdAt,manifest.expiresAt]},
   {sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES('baseline','custody',?1,?2,?3,0,'complete',1,?4,?5)",params:[boundary.sha256,body.sequence,body.head,manifest.createdAt,manifest.expiresAt]},
   {sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,?3,?4,?5,'complete',1,?6,?7)",params:[job+'_authority_ready',plan.sha256,body.sequence,receipt,at,manifest.createdAt,manifest.expiresAt]},
   {sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'restore',?2,?3,?4,?5,'complete',1,?6,?7)",params:[job+'_inventory_verified',recoveryHash(Buffer.from(verification.progress)),state.inventory.total,state.inventory.digest,state.inventory.asOf,manifest.createdAt,manifest.expiresAt]},
   {sql:"INSERT INTO retention_restore(id,receipt_hash,verified_at) VALUES('active',?1,?2)",params:[receipt,at]},
  ]);
  return {verified:true,receipt,sequence:body.sequence,runtimeAccess:'blocked_pending_runtime_receipt_configuration'};
 });
}
