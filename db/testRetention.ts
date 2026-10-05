import type { AtomicD1Database } from "./repositories.ts";
import { D1CowrieWalletRepository } from "./cowrieWallet.ts";
import { D1QuestionSelectionRepository } from "./questionSelection.ts";
import { D1CommerceRepository } from "./commerce.ts";

/** Bounded maintenance only. Financial balances/history and deletion deadlines are never invented. */
export async function runTestRetention(database: AtomicD1Database, now: number, limit = 50) {
  if (!Number.isSafeInteger(now) || now <= 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("invalid_retention_bounds");
  const wallets = new D1CowrieWalletRepository(database, new D1QuestionSelectionRepository(database));
  const pending = await database.prepare(`SELECT w.id wallet_id,w.anonymous_owner_hash owner_hash,qa.idempotency_key_hash
    FROM quiz_attempts qa JOIN cowrie_ledger d ON d.related_attempt_id=qa.id AND d.entry_type='quick_play_debit'
    JOIN cowrie_wallets w ON w.id=d.wallet_id WHERE w.state='active' AND qa.status='in_progress'
    AND qa.cowrie_issued_at IS NULL AND qa.expires_at<=?1 ORDER BY qa.expires_at,qa.id LIMIT ?2`).bind(now, limit).all<{wallet_id:string;owner_hash:string;idempotency_key_hash:string}>();
  let reversals = 0;
  for (const row of pending.results) if (await wallets.reverseUnissued({walletId:row.wallet_id,ownerHash:row.owner_hash,idempotencyHash:row.idempotency_key_hash,now})) reversals++;
  const bonusWallets = await database.prepare(`WITH credits AS (
    SELECT wallet_id,id,delta,bonus_expires_at,SUM(delta) OVER (PARTITION BY wallet_id ORDER BY created_at,id ROWS UNBOUNDED PRECEDING) cumulative
    FROM cowrie_ledger WHERE bucket='bonus' AND entry_type='bonus_credit'),
    debits AS (SELECT wallet_id,-SUM(delta) used FROM cowrie_ledger WHERE bucket='bonus' AND entry_type!='bonus_credit' GROUP BY wallet_id)
    SELECT DISTINCT w.id FROM credits c JOIN cowrie_wallets w ON w.id=c.wallet_id LEFT JOIN debits d ON d.wallet_id=w.id
    WHERE w.state='active' AND c.bonus_expires_at<=?1 AND MIN(c.delta,MAX(0,c.cumulative-COALESCE(d.used,0)))>0
    ORDER BY w.id LIMIT ?2`).bind(now, limit).all<{id:string}>();
  let bonusExpiries = 0;
  for (const row of bonusWallets.results) bonusExpiries += await wallets.expireBonuses({walletId:row.id,now,limit:1});
  const statements = [
    `DELETE FROM daily_operation_limits WHERE id IN (SELECT id FROM daily_operation_limits WHERE expires_at<=?1 ORDER BY expires_at,id LIMIT ?2)`,
    `DELETE FROM streaks WHERE id IN (SELECT id FROM streaks WHERE expires_at<=?1 OR deleted_at IS NOT NULL ORDER BY expires_at,id LIMIT ?2)`,
    `UPDATE results SET state='expired',updated_at=?1 WHERE id IN (SELECT id FROM results WHERE state='active' AND expires_at<=?1 ORDER BY expires_at,id LIMIT ?2)`,
    `UPDATE quiz_attempts SET status='expired',updated_at=?1 WHERE id IN (SELECT id FROM quiz_attempts WHERE status='in_progress' AND expires_at<=?1 AND NOT EXISTS (SELECT 1 FROM cowrie_ledger d WHERE d.related_attempt_id=quiz_attempts.id AND d.entry_type='quick_play_debit' AND quiz_attempts.cowrie_issued_at IS NULL AND NOT EXISTS (SELECT 1 FROM cowrie_ledger r WHERE r.reversal_of_ledger_id=d.id)) ORDER BY expires_at,id LIMIT ?2)`,
  ];
  const results = await database.batch(statements.map(sql => database.prepare(sql).bind(now, limit)));
  const webhookExpiries = await new D1CommerceRepository(database).retainExpired(now, limit, true);
  return { reversals, bonusExpiries, webhookExpiries, changes: results.map(result => Number(result.meta?.changes || 0)) };
}
