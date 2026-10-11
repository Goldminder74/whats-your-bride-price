import { D1Authority } from '../scripts/authority-runtime.mjs';
import { recoveryHash } from '../scripts/recovery-crypto.mjs';

/** Private service wiring only. There is deliberately no public HTTP or cron handler. */
export function createAuthorityService({ db, custody, key, snapshot, alert, now = Date.now }) {
  if (!db || !custody || !Buffer.isBuffer(key) || key.length !== 32
    || typeof snapshot !== 'function' || typeof alert !== 'function') throw Error('authority_configuration');
  const authority = new D1Authority(db, custody, key, { now });
  let active = false;
  async function exclusive(work) {
    // This guard prevents overlap in one instance only; D1's journal fence remains authoritative.
    if (active) throw Error('authority_busy');
    active = true;
    try { return await work(); }
    catch (error) {
      // Never send SQL, operation IDs, ciphertext, credentials or provider error text to alerts.
      try { await alert({ component: 'authority', status: 'blocked', at: now() }); }
      catch { throw Error('authority_and_alert_unavailable'); }
      throw error;
    } finally { active = false; }
  }
  return {
    mutate(operationId, statements) { return exclusive(() => authority.mutate(operationId, statements)); },
    deliver(boundaryId) { return exclusive(async () => {
      const { receipt } = await authority.deliver(boundaryId, snapshot);
      // Readback is part of delivery, not an assumption about cross-provider atomicity.
      const bytes = await custody.get(boundaryId + '.boundary');
      if (!bytes || recoveryHash(bytes) !== receipt) throw Error('authority_delivery_readback');
      return receipt;
    }); },
    async ready() {
      const head = await authority.head();
      if (!head || head.state !== 'idle' || head.expires_at <= now()) throw Error('authority_unavailable');
      return true;
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
