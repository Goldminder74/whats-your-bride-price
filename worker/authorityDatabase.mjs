import { createOperationId } from '../scripts/authority-runtime.mjs';

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
        operationId ||= createOperationId(now());
        const result = await authority.transact(operationId, [plan]);
        return validate(result, 1)[0];
      },
      async all() {
        // WITH/PRAGMA/RETURNING must not smuggle a mutation past the journal.
        if (!/^\s*SELECT\b/i.test(sql)) throw Error('authority_read_scope');
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
