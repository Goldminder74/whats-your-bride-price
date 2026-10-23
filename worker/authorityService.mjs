import { D1DriveIndex } from '../scripts/d1-drive-index.mjs';
import { DriveCustody } from '../scripts/drive-custody.mjs';
import { driveAccessToken } from './driveOAuth.mjs';
import { D1WriterFence } from './d1WriterFence.mjs';
import { D1Authority } from '../scripts/authority-runtime.mjs';
import { recoveryHash } from '../scripts/recovery-crypto.mjs';
import { operatorRetentionPlan, runApprovedRetention, assertRestoreReceipt } from '../db/retention.ts';
import { createJournaledDatabase } from './authorityDatabase.mjs';
import { PartitionedDriveCustody } from '../scripts/partitioned-drive-custody.mjs';
import {boundedAuthorityStep,cleanupAuthoritySnapshotStep} from './boundedAuthority.mjs';

/** Private service wiring only. There is deliberately no public HTTP or cron handler. */
export function createAuthorityService({ db, custody, key, snapshot, alert, now = Date.now, recoveryReady = async () => {} }) {
  if (!db || !custody || !Buffer.isBuffer(key) || key.length !== 32
    || typeof snapshot !== 'function' || typeof alert !== 'function' || typeof recoveryReady !== 'function') throw Error('authority_configuration');
  const authority = new D1Authority(db, custody, key, { now });
  const writer = new D1WriterFence(db, { now });
  let active = false;
  async function exclusive(work) {
    // This guard prevents overlap in one instance only; D1's journal fence remains authoritative.
    if (active) throw Error('authority_busy');
    active = true;
    try { await recoveryReady(); return await work(); }
    catch (error) {
      // Never send SQL, operation IDs, ciphertext, credentials or provider error text to alerts.
      try { await alert({ component: 'authority', status: 'blocked', at: now() }); }
      catch { throw Error('authority_and_alert_unavailable'); }
      throw error;
    } finally { active = false; }
  }
  return {
    transact(operationId, statements) {
      if (!Array.isArray(statements) || !statements.length || statements.length > 97) return Promise.reject(Error('authority_batch_bounds'));
      return exclusive(() => writer.run(operationId, JSON.stringify(statements), async fenced => {
        let outcome;
        const capturing = { query: fenced.query, async batch(rows) {
          const results = await fenced.batch(rows);
          // The mutation batch contains outbox insert, repository statements, head update.
          outcome = results.slice(1, -1);
          return results;
        } };
        await new D1Authority(capturing, custody, key, { now }).mutate(operationId, statements);
        // A replay has no trustworthy original changes()/RETURNING result. Never rerun
        // the financial batch just to reconstruct it, or invent affected-row counts.
        return outcome || null;
      },{journalIdle:true})).then(outcome => {
        if (!outcome) throw Error('authority_result_recovery_required');
        return outcome;
      });
    },
    mutate(operationId, statements) {
      if (!Array.isArray(statements) || !statements.length || statements.length > 97) return Promise.reject(Error('authority_batch_bounds'));
      return exclusive(() => writer.run(operationId, JSON.stringify(statements), fenced =>
        new D1Authority(fenced, custody, key, { now }).mutate(operationId, statements),{journalIdle:true}));
    },
    flush(boundaryId, limit=25) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(boundaryId) || !Number.isInteger(limit) || limit<1 || limit>25) return Promise.reject(Error('journal_chunk_bounds'));
      return exclusive(() => writer.run('journal:' + boundaryId, JSON.stringify([boundaryId,limit]), async fenced =>
        new D1Authority(fenced,custody,key,{now}).flush(limit),{journalIdle:true}));
    },
    deliver(boundaryId) { return exclusive(() => writer.run('delivery:' + boundaryId, boundaryId, async fenced => {
      const { receipt } = await new D1Authority(fenced, custody, key, { now }).deliver(boundaryId, snapshot);
      // Readback is part of delivery, not an assumption about cross-provider atomicity.
      const bytes = await custody.get(boundaryId + '.boundary');
      if (!bytes || recoveryHash(bytes) !== receipt) throw Error('authority_delivery_readback');
      return receipt;
    })); },
    deliverStep(boundaryId,progress=null){
      const identity='delivery-step:'+boundaryId+':'+recoveryHash(Buffer.from(progress||''));
      return exclusive(()=>writer.run(identity,JSON.stringify([boundaryId,progress]),db=>boundedAuthorityStep(db,custody,key,boundaryId,progress,{now})));
    },
    advanceSnapshot(boundaryId){
      if(!/^[a-zA-Z0-9_-]{1,65}$/.test(boundaryId||''))return Promise.reject(Error('authority_boundary_id'));
      // Stable job identity permits recovery of a lost final response. Progress
      // is encrypted by boundedAuthorityStep and stored in existing D1 custody;
      // no caller memory, new schema, public endpoint or schedule is required.
      return exclusive(()=>writer.run('snapshot-job:'+boundaryId,boundaryId,async fenced=>{
        const id='bounded-scheduler:'+boundaryId,prior=(await fenced.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',[id]))[0];
        const identity=recoveryHash(Buffer.from(boundaryId));if(prior&&(prior.manifest_hash!==identity||prior.expires_at<=now()))throw Error('authority_snapshot_progress');
        if(prior?.state==='complete')return {complete:true,receipt:prior.head_hash,sequence:prior.sequence};
        if(prior&&prior.state!=='exporting')throw Error('authority_snapshot_progress');
        const result=await boundedAuthorityStep(fenced,custody,key,boundaryId,prior?.head_hash||null,{now});
        const job=(await fenced.query('SELECT * FROM operational_recovery_checkpoints WHERE id=?1',['bounded-job:'+boundaryId]))[0];
        const value=result.complete?result.receipt:result.progress;if(typeof value!=='string'||value.length>131072||!job)throw Error('authority_snapshot_progress');
        await fenced.batch([
          {sql:"INSERT INTO operational_recovery_checkpoints(id,kind,manifest_hash,sequence,head_hash,cursor,state,version,created_at,expires_at) VALUES(?1,'export',?2,?3,?4,0,?5,1,?6,?7) ON CONFLICT(id) DO UPDATE SET sequence=excluded.sequence,head_hash=excluded.head_hash,state=excluded.state,version=version+1 WHERE version=?8 AND manifest_hash=excluded.manifest_hash",params:[id,identity,result.complete?result.sequence:job.sequence,value,result.complete?'complete':'exporting',job.created_at,job.expires_at,prior?.version||0]},
          {sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM operational_recovery_checkpoints WHERE id=?1 AND head_hash=?2 AND state=?3) THEN 1 ELSE json('snapshot_progress_conflict') END",params:[id,value,result.complete?'complete':'exporting']},
        ]);
        return result.complete?{complete:true,receipt:result.receipt,sequence:result.sequence}:{complete:false,runtimeAccess:'blocked_pending_verified_boundary'};
      }));
    },
    cleanupSnapshotStep(boundaryId){
      if(!/^[a-zA-Z0-9_-]{1,65}$/.test(boundaryId||''))return Promise.reject(Error('authority_boundary_id'));
      return exclusive(()=>writer.run('snapshot-cleanup:'+boundaryId,boundaryId,fenced=>cleanupAuthoritySnapshotStep(fenced,custody,key,boundaryId,{now})));
    },
    async ready() {
      await recoveryReady();
      await writer.ready();
      const head = await authority.head();
      if (!head || head.state !== 'idle' || head.expires_at <= now()) throw Error('authority_unavailable');
      return true;
    },
    async readFence() {
      await recoveryReady();
      await writer.ready();
      const head = await authority.head();
      if (!head || head.state !== 'idle' || head.expires_at <= now()) throw Error('authority_unavailable');
      await writer.ready();
      return `${head.version}:${head.sequence}:${head.head_hash}`;
    },
  };
}

/** Authentication is supplied by a private service binding, never a browser-selected URL. */
export function d1AuthorityAdapter(binding) {
  if (!binding || typeof binding.prepare !== 'function' || typeof binding.batch !== 'function') throw Error('authority_database');
  return {
    async query(sql, params = []) {
      const response = await binding.prepare(sql).bind(...params).all();
      if (!response.success || !Array.isArray(response.results)) throw Error('authority_query');
      return response.results;
    },
    async batch(statements) {
      const responses = await binding.batch(statements.map(({ sql, params = [] }) => binding.prepare(sql).bind(...params)));
      if (responses.length !== statements.length || responses.some(row => !row.success)) throw Error('authority_batch');
      return responses;
    },
  };
}
/** One bounded invocation; the operator must approve its cadence separately. */
export async function authorityDeliveryTick(service, boundaryId, heartbeat) {
  if (typeof heartbeat !== 'function') throw Error('authority_monitor_required');
  const receipt = await service.deliver(boundaryId);
  await service.ready();
  // A failed heartbeat fails the invocation: delivery success is not monitoring success.
  await heartbeat({ component: 'authority', status: 'verified', receipt });
  return receipt;
}

/** Private operator integration; the existing reviewed plans enforce closure,
 * settlement, legal holds and dependency-safe minimisation. No HTTP exposure. */
export function applyAuthorityRetentionAction(service, operationId, action, at) {
  return service.transact(operationId, operatorRetentionPlan(action, at));
}
export function purgeThroughAuthority(database, service, at, limit = 50) {
  return runApprovedRetention(createJournaledDatabase(database, service, { now: () => at }), at, limit);
}

/** Private production-ops factory only. No credentials enter the application build.
 * Initialisation/migrations, snapshot capture and approved alert transport are explicit
 * operator dependencies: absent setup never falls back to local or unprotected storage. */
export function configuredAuthorityService(env, { snapshot, alert, now = Date.now, fetcher = (input, init) => globalThis.fetch(input, init) }) {
  if (env?.WYBP_AUTHORITY_ROLE !== 'production-ops' || env.WYBP_AUTHORITY_DATABASE_NAME !== 'wybp-prod-d1-r001'
    || typeof snapshot !== 'function' || typeof alert !== 'function'
    || typeof env.WYBP_RESTORE_RECEIPT_SHA256 !== 'string' || !/^[a-f0-9]{64}$/.test(env.WYBP_RESTORE_RECEIPT_SHA256)
    || typeof env.WYBP_AUTHORITY_KEY_BASE64 !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(env.WYBP_AUTHORITY_KEY_BASE64)) throw Error('authority_runtime_configuration');
  const key = Buffer.from(env.WYBP_AUTHORITY_KEY_BASE64, 'base64');
  if (key.length !== 32 || key.toString('base64') !== env.WYBP_AUTHORITY_KEY_BASE64) throw Error('authority_key');
  const db = d1AuthorityAdapter(env.DB);
  const index = new D1DriveIndex(db, env.WYBP_DRIVE_FOLDER_ID, { now });
  const accessToken = driveAccessToken({clientId:env.WYBP_DRIVE_CLIENT_ID,clientSecret:env.WYBP_DRIVE_CLIENT_SECRET,refreshToken:env.WYBP_DRIVE_REFRESH_TOKEN,fetcher,now});
  const root = new DriveCustody({folderId:env.WYBP_DRIVE_FOLDER_ID,index,accessToken,fetcher});
  let custody=root;
  if(env.WYBP_DRIVE_SHARD_FOLDER_IDS!==undefined){
    let folders;try{folders=JSON.parse(env.WYBP_DRIVE_SHARD_FOLDER_IDS);}catch{throw Error('drive_partition_configuration');}
    if(!Array.isArray(folders)||folders.length!==16||env.WYBP_HOSTED_REHEARSAL_ENABLED==='true')throw Error('drive_partition_configuration');
    custody=new PartitionedDriveCustody(root,folders.map(folderId=>new DriveCustody({folderId,index:new D1DriveIndex(db,folderId,{now}),accessToken,fetcher})),{
      async verifyFolder(folderId,parent){
        const response=await root.request('https://www.googleapis.com/drive/v3/files/'+folderId+'?fields=id,parents,mimeType,trashed');
        if(!response.ok)throw Error('drive_partition_scope');
        const metadata=await response.json();
        return metadata.id===folderId&&!metadata.trashed&&metadata.mimeType==='application/vnd.google-apps.folder'&&metadata.parents?.includes(parent)===true;
      },
    });
  }
  const recoveryReady = () => assertRestoreReceipt(env.DB, env.WYBP_RESTORE_RECEIPT_SHA256);
  return { service:createAuthorityService({db,custody,key,snapshot,alert,now,recoveryReady}), custody, index };
}
