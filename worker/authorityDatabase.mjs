import { createOperationId } from '../scripts/authority-runtime.mjs';

// Exact repository-owned SQL only. This admission counter cannot grant money,
// an attempt, an entitlement or restore access. Arbitrary SQL stays journalled.
const QUICK_PLAY_ADMISSION = 'INSERT INTO daily_operation_limits (id,rate_key_hash,action,window_started_at,request_count,expires_at,created_at,updated_at) VALUES (?1,?2,?3,?4,1,?5,?6,?6) ON CONFLICT(rate_key_hash,action,window_started_at) DO UPDATE SET request_count=request_count+1,updated_at=excluded.updated_at';
export function ephemeralAdmission(sql, params) {
  return sql.trim().replace(/\s+/g,' ') === QUICK_PLAY_ADMISSION && params.length === 6
    && /^quick_play_limit_[a-f0-9]{32}$/.test(params[0]) && /^[a-f0-9]{64}$/.test(params[1])
    && ['start','complete'].includes(params[2]) && Number.isSafeInteger(params[3])
    && params[3]>0 && params[3]%60000===0 && params[4]===params[3]+86400000
    && Number.isSafeInteger(params[5]) && params[5]>=params[3] && params[5]<params[3]+60000;
}

/** Private repository adapter. Never accept a service URL or SQL from the browser.
 * A lost transaction result is unavailable, not a fabricated successful write.
 * Repositories must recover through their existing authoritative idempotency reads.
 */
export function createJournaledDatabase(database, authority, { now = Date.now } = {}) {
  if (!database?.prepare || !authority?.transact || !authority?.readFence) throw Error('authority_binding_required');
  const plans = new WeakMap();
  function prepare(sql, params = []) {
    if (typeof sql !== 'string') throw Error('authority_statement');
    const plan = { sql, params };
    let operationId;
    const statement = {
      bind(...values) { return prepare(sql, values); },
      async run() {
        if (ephemeralAdmission(sql,params)) {
          if(typeof authority.admit==='function')return validate([await authority.admit(sql,params)],1)[0];
          const fence=await authority.readFence();
          if(typeof fence!=='string'||!fence)throw Error('authority_read_unavailable');
          const result=await database.prepare(sql).bind(...params).run();
          if(!result.success||await authority.readFence()!==fence)throw Error('authority_read_changed');
          return result;
        }
        operationId ||= createOperationId(now());
        const result = await authority.transact(operationId, [plan]);
        return validate(result, 1)[0];
      },
      async all() {
        // WITH/PRAGMA/RETURNING must not smuggle a mutation past the journal.
        if (!/^\s*SELECT\b/i.test(sql)) throw Error('authority_read_scope');
        if(typeof authority.query==='function')return validate([await authority.query(sql,params)],1)[0];
        const fence = await authority.readFence();
        const result = await database.prepare(sql).bind(...params).all();
        if (!result.success) throw Error('authority_read_unavailable');
        // Close the read race with an in-progress mutation/export fence.
        if (await authority.readFence() !== fence) throw Error('authority_read_changed');
        return result;
      },
      async first(column) {
        const result = await statement.all();
        const row = result.results[0] ?? null;
        return row && column !== undefined ? row[column] ?? null : row;
      },
    };
    plans.set(statement, plan);
    return statement;
  }
  return {
    prepare,
    async batch(statements) {
      if (!Array.isArray(statements) || !statements.length || statements.length > 97) throw Error('authority_batch_bounds');
      const rows = statements.map(statement => {
        const row = plans.get(statement);
        if (!row) throw Error('authority_foreign_statement');
        return row;
      });
      return validate(await authority.transact(createOperationId(now()), rows), rows.length);
    },
  };
}

function validate(results, length) {
  if (!Array.isArray(results) || results.length !== length || results.some(row => !row?.success)) throw Error('authority_result_unavailable');
  return results;
}
