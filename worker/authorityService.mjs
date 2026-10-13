import { D1DriveIndex } from '../scripts/d1-drive-index.mjs';
import { DriveCustody } from '../scripts/drive-custody.mjs';
import { driveAccessToken } from './driveOAuth.mjs';
import { D1WriterFence } from './d1WriterFence.mjs';
import { D1Authority } from '../scripts/authority-runtime.mjs';
import { recoveryHash } from '../scripts/recovery-crypto.mjs';
import { operatorRetentionPlan, runApprovedRetention, assertRestoreReceipt } from '../db/retention.ts';
import { createJournaledDatabase } from './authorityDatabase.mjs';

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
      })).then(outcome => {
        if (!outcome) throw Error('authority_result_recovery_required');
        return outcome;
      });
    },
    mutate(operationId, statements) {
      if (!Array.isArray(statements) || !statements.length || statements.length > 97) return Promise.reject(Error('authority_batch_bounds'));
      return exclusive(() => writer.run(operationId, JSON.stringify(statements), fenced =>
        new D1Authority(fenced, custody, key, { now }).mutate(operationId, statements)));
    },
    deliver(boundaryId) { return exclusive(() => writer.run('delivery:' + boundaryId, boundaryId, async fenced => {
      const { receipt } = await new D1Authority(fenced, custody, key, { now }).deliver(boundaryId, snapshot);
      // Readback is part of delivery, not an assumption about cross-provider atomicity.
      const bytes = await custody.get(boundaryId + '.boundary');
      if (!bytes || recoveryHash(bytes) !== receipt) throw Error('authority_delivery_readback');
      return receipt;
    })); },
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
  const custody = new DriveCustody({folderId:env.WYBP_DRIVE_FOLDER_ID,index,accessToken,fetcher});
  const recoveryReady = () => assertRestoreReceipt(env.DB, env.WYBP_RESTORE_RECEIPT_SHA256);
  return { service:createAuthorityService({db,custody,key,snapshot,alert,now,recoveryReady}), custody, index };
}
