import type { AtomicD1Database } from "./repositories.ts";
import type { CommerceRateLimiter, CommerceRateLimitDecision } from "./commerce.ts";

/** One atomic admission; different Worker instances share the same bounded bucket. */
export class D1CommerceRateLimiter implements CommerceRateLimiter {
  private readonly database: AtomicD1Database;
  constructor(database: AtomicD1Database) { this.database = database; }
  async consume(ownerHash: string, now: number): Promise<CommerceRateLimitDecision> {
    if (!/^[0-9a-f]{64}$/.test(ownerHash) || !Number.isSafeInteger(now) || now <= 0) return "unavailable";
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`wybp-commerce-limit-v1\u0000${ownerHash}`));
    const key = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
    const window = Math.floor(now / 60_000) * 60_000;
    try {
      const row = await this.database.prepare(`INSERT INTO daily_operation_limits
        (id,rate_key_hash,action,window_started_at,request_count,expires_at,created_at,updated_at)
        VALUES(?1,?2,'start',?3,1,?4,?5,?5)
        ON CONFLICT(rate_key_hash,action,window_started_at) DO UPDATE SET
          request_count=request_count+1,updated_at=excluded.updated_at
        WHERE request_count<20 RETURNING request_count`).bind(`commerce_limit_${key}_${window}`, key, window, window + 86_400_000, now)
        .first<{ request_count: number }>();
      return row && Number.isInteger(row.request_count) && row.request_count >= 1 && row.request_count <= 20 ? "allowed" : "limited";
    } catch { return "unavailable"; }
  }
}
