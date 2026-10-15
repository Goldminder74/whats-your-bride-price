import type { AtomicD1Database } from './repositories.ts';
import { createJournaledDatabase } from '../worker/authorityDatabase.mjs';

/** Only private test profiles retain their existing direct D1 wiring. Production
 * financial/game writers require an operator-configured private service binding.
 * Neither a request header nor a URL can supply this binding.
 */
export function applicationAuthorityDatabase(runtime: Record<string, unknown> & { DB?: D1Database }, privateTest: boolean): AtomicD1Database | null {
  if (!runtime.DB) return null;
  if (privateTest) return runtime.DB;
  if (runtime.WYBP_AUTHORITY_ROLE !== 'production-app' || !runtime.AUTHORITY) return null;
  return createJournaledDatabase(runtime.DB, runtime.AUTHORITY) as AtomicD1Database;
}
