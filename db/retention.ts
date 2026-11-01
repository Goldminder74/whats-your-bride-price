import type { AtomicD1Database } from "./repositories.ts";
import { accountingDeadline, caseDeadline, RETENTION_DAY, retentionTime } from "./retentionPolicy.ts";

export type RetentionStatement = Readonly<{sql:string;params:readonly unknown[]}>;
const statement = (sql:string, params:readonly unknown[]=[]):RetentionStatement => ({sql,params});
const guard = (condition:string, params:readonly unknown[]=[]) => statement(`SELECT CASE WHEN (${condition}) THEN 1 ELSE json('retention_authority_rejected') END`,params);
const id = (value:unknown):string => {if(typeof value!=="string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))throw new Error("invalid_retention_identifier");return value;};
const hash = (value:unknown):string => {if(typeof value!=="string" || !/^[0-9a-f]{64}$/.test(value))throw new Error("invalid_retention_hash");return value;};
export type RetentionAction = Readonly<{operation:string;id?:string;scope?:string;subjectId?:string;reason?:string;kind?:string;walletId?:string;orderId?:string;eventId?:string;evidenceHash?:string}>;

/** Operator plans only: never imported by a browser route. Authenticated target checks live in the CLI. */
export function operatorRetentionPlan(action:RetentionAction, now:number):readonly RetentionStatement[] {
  retentionTime(now);
  switch(action.operation) {
    case "hold": {
      if(!["global","wallet","order","attempt","result","case"].includes(action.scope||"") || !["legal","tax","refund","dispute","support"].includes(action.reason||""))throw new Error("invalid_hold");
      const values=[id(action.id),action.scope,id(action.subjectId),action.reason,now,hash(action.evidenceHash)];
      return [guard(`NOT EXISTS(SELECT 1 FROM retention_holds WHERE id=?1) OR EXISTS(SELECT 1 FROM retention_holds WHERE id=?1 AND scope=?2 AND subject_id=?3 AND reason=?4 AND opened_at<=?5 AND evidence_hash=?6)`,values),statement(`INSERT INTO retention_holds(id,scope,subject_id,reason,opened_at,evidence_hash) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO NOTHING`,values)];
    }
    case "release-hold": return [guard(`EXISTS(SELECT 1 FROM retention_holds WHERE id=?1 AND opened_at<=?2)`,[id(action.id),now]),statement(`UPDATE retention_holds SET released_at=?2 WHERE id=?1 AND released_at IS NULL`,[id(action.id),now])];
    case "open-case": {
      caseDeadline(action.kind||"",now);
      const values=[id(action.id),action.walletId?id(action.walletId):null,action.orderId?id(action.orderId):null,action.kind,now,hash(action.evidenceHash)];
      return [guard(`NOT EXISTS(SELECT 1 FROM retention_cases WHERE id=?1) OR EXISTS(SELECT 1 FROM retention_cases WHERE id=?1 AND wallet_id IS ?2 AND order_id IS ?3 AND kind=?4 AND opened_at<=?5 AND evidence_hash=?6)`,values),statement(`INSERT INTO retention_cases(id,wallet_id,order_id,kind,opened_at,evidence_hash) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO NOTHING`,values)];
    }
    case "close-case": {
      const until=caseDeadline(action.kind||"",now);
      return [guard(`EXISTS(SELECT 1 FROM retention_cases WHERE id=?1 AND kind=?2 AND opened_at<=?3)`,[id(action.id),action.kind,now]),statement(`UPDATE retention_cases SET closed_at=?2,retain_until=?3 WHERE id=?1 AND closed_at IS NULL`,[id(action.id),now,until])];
    }
    case "settlement": return [statement(`INSERT INTO retention_settlements(order_id,event_id,reason,settled_at,retain_until) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(order_id) DO NOTHING`,[id(action.orderId),id(action.eventId),action.reason,now,Math.max(caseDeadline("dispute",now),accountingDeadline(now))]),guard(`EXISTS(SELECT 1 FROM retention_settlements WHERE order_id=?1 AND event_id=?2 AND reason=?3)`,[id(action.orderId),id(action.eventId),action.reason])];
    case "close-wallet": return [statement(`INSERT INTO retention_closures(wallet_id,closed_at,financial_until,evidence_hash) SELECT ?1,?2,MAX(?3,COALESCE((SELECT MAX(retain_until) FROM retention_settlements WHERE order_id IN (SELECT id FROM commerce_orders WHERE cowrie_wallet_id=?1)),0),COALESCE((SELECT MAX(retain_until) FROM retention_cases WHERE wallet_id=?1 OR order_id IN (SELECT id FROM commerce_orders WHERE cowrie_wallet_id=?1)),0)),?4 WHERE NOT EXISTS(SELECT 1 FROM retention_closures WHERE wallet_id=?1)`,[id(action.walletId),now,accountingDeadline(now),hash(action.evidenceHash)]),guard(`EXISTS(SELECT 1 FROM retention_closures WHERE wallet_id=?1 AND evidence_hash=?2)`,[id(action.walletId),hash(action.evidenceHash)])];
    case "erase": {
      if(action.scope!=="attempt" && action.scope!=="result")throw new Error("financial_erasure_requires_closure");
      hash(action.evidenceHash);
      const entry={scope:action.scope,subjectId:id(action.subjectId),unavailableAt:now,forgetAfter:now+30*RETENTION_DAY} as Suppression;
      const table=action.scope==="attempt"?"quiz_attempts":"results";
      return [guard(`EXISTS(SELECT 1 FROM ${table} WHERE id=?1)`,[entry.subjectId]),...restoreSuppressionPlan([entry],action.evidenceHash!,now).slice(0,-1),statement(`INSERT INTO retention_suppression(scope,subject_id,unavailable_at,forget_after) VALUES(?1,?2,?3,?4) ON CONFLICT(subject_id) DO NOTHING`,[entry.scope,entry.subjectId,now,entry.forgetAfter])];
    }
    default: throw new Error("unknown_retention_operation");
  }
}

export async function assertRestoreReceipt(database:AtomicD1Database, expected:unknown):Promise<void> {
  const receipt=hash(expected);
  const row=await database.prepare("SELECT receipt_hash FROM retention_restore WHERE id='active'").first<{receipt_hash:string}>();
  if(!row || row.receipt_hash!==receipt)throw new Error("restore_suppression_unverified");
}

export type Suppression = Readonly<{scope:"wallet"|"attempt"|"result";subjectId:string;unavailableAt:number;forgetAfter:number}>;
type RestoreHold = Readonly<{id:string;scope:string;subject_id:string;reason:string;opened_at:number;released_at:null;evidence_hash:string}>;
type RestoreCase = Readonly<{id:string;wallet_id:string|null;order_id:string|null;kind:string;opened_at:number;closed_at:number|null;retain_until:number|null;evidence_hash:string}>;
type RestoreClosure = Readonly<{wallet_id:string;closed_at:number;financial_until:number;evidence_hash:string}>;
/** Reapply reviewed authority with its original clocks; unknown/conflicting dependencies abort the batch. */
export function restoreAuthorityPlan(holds:readonly RestoreHold[],cases:readonly RestoreCase[],closures:readonly RestoreClosure[],now:number):readonly RetentionStatement[] {
  retentionTime(now);if([holds,cases,closures].some(rows=>!Array.isArray(rows)||rows.length>100))throw new Error("restore_authority_bounds");
  const plan:RetentionStatement[]=[];
  for(const row of cases){
    if(row.opened_at>now || (row.closed_at!==null && (row.closed_at>now || row.closed_at<row.opened_at || row.retain_until!==caseDeadline(row.kind,row.closed_at))))throw new Error("restore_case_clock_conflict");
    plan.push(...operatorRetentionPlan({operation:"open-case",id:row.id,walletId:row.wallet_id||undefined,orderId:row.order_id||undefined,kind:row.kind,evidenceHash:row.evidence_hash},row.opened_at),guard(`EXISTS(SELECT 1 FROM retention_cases WHERE id=?1 AND opened_at=?2)`,[row.id,row.opened_at]));
    if(row.closed_at!==null)plan.push(...operatorRetentionPlan({operation:"close-case",id:row.id,kind:row.kind},row.closed_at),guard(`EXISTS(SELECT 1 FROM retention_cases WHERE id=?1 AND closed_at=?2 AND retain_until=?3)`,[row.id,row.closed_at,row.retain_until]));
  }
  for(const row of closures){
    if(row.closed_at>now)throw new Error("restore_closure_clock_conflict");
    plan.push(...operatorRetentionPlan({operation:"close-wallet",walletId:row.wallet_id,evidenceHash:row.evidence_hash},row.closed_at),guard(`EXISTS(SELECT 1 FROM retention_closures WHERE wallet_id=?1 AND closed_at=?2 AND financial_until=?3)`,[row.wallet_id,row.closed_at,row.financial_until]));
  }
  for(const row of holds){
    if(row.opened_at>now || row.released_at!==null)throw new Error("restore_hold_conflict");
    plan.push(...operatorRetentionPlan({operation:"hold",id:row.id,scope:row.scope,subjectId:row.subject_id,reason:row.reason,evidenceHash:row.evidence_hash},row.opened_at),guard(`EXISTS(SELECT 1 FROM retention_holds WHERE id=?1 AND released_at IS NULL AND opened_at=?2)`,[row.id,row.opened_at]));
  }
  return plan;
}
/** Called only after external-manifest and backup-window review; deliberately never reactivates anything. */
export function restoreSuppressionPlan(entries:readonly Suppression[], receiptHash:string, now:number):readonly RetentionStatement[] {
  retentionTime(now);hash(receiptHash);
  if(entries.length>100)throw new Error("restore_batch_limit");
  const plan:RetentionStatement[]=[];
  for(const entry of entries) {
    id(entry.subjectId);retentionTime(entry.unavailableAt);retentionTime(entry.forgetAfter);
    if(entry.unavailableAt>now || entry.forgetAfter!==entry.unavailableAt+30*RETENTION_DAY)throw new Error("invalid_suppression_window");
    if(entry.scope==="wallet") plan.push(statement(`UPDATE cowrie_wallets SET state='deleted',deleted_at=COALESCE(deleted_at,?2),retention_expires_at=COALESCE(retention_expires_at,?3),updated_at=MAX(updated_at,?2),version=version+1 WHERE id=?1 AND state!='deleted'`,[entry.subjectId,entry.unavailableAt,accountingDeadline(now)]));
    else if(entry.scope==="attempt") plan.push(statement(`UPDATE quiz_attempts SET status='deleted',deleted_at=COALESCE(deleted_at,?2),updated_at=MAX(updated_at,?2) WHERE id=?1 AND status!='deleted'`,[entry.subjectId,entry.unavailableAt]));
    else if(entry.scope==="result") plan.push(statement(`UPDATE results SET state='deleted',deleted_at=COALESCE(deleted_at,?2),updated_at=MAX(updated_at,?2) WHERE id=?1 AND state!='deleted'`,[entry.subjectId,entry.unavailableAt]));
    else throw new Error("invalid_suppression_scope");
  }
  plan.push(statement(`INSERT INTO retention_restore(id,receipt_hash,verified_at) VALUES('active',?1,?2) ON CONFLICT(id) DO UPDATE SET receipt_hash=excluded.receipt_hash,verified_at=excluded.verified_at`,[receiptHash,now]));
  return plan;
}

/** Bounded batches; held records stay inaccessible after expiry but retain necessary proof. */
export async function runApprovedRetention(database:AtomicD1Database,now:number,limit=50):Promise<readonly number[]> {
  retentionTime(now);if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("invalid_retention_bounds");
  const expired=`(expires_at<=?1 OR deleted_at IS NOT NULL)`;
  // Bound the deleted child rows, not a parent page that can remain forever after its children drain.
  const attempts=`SELECT id FROM quiz_attempts WHERE ${expired} AND id NOT IN (SELECT id FROM retention_protected_attempts)`;
  const plan:RetentionStatement[]=[
    statement(`PRAGMA defer_foreign_keys=ON`),
    statement(`INSERT INTO retention_suppression(scope,subject_id,unavailable_at,forget_after) SELECT 'wallet',id,closed_at,closed_at+2592000000 FROM cowrie_wallets WHERE closed_at IS NOT NULL AND ownership_minimized_at IS NULL AND closed_at+2592000000<=?1 AND id NOT IN (SELECT id FROM retention_active_wallet_holds) AND NOT EXISTS(SELECT 1 FROM retention_cases c WHERE c.closed_at IS NULL AND c.wallet_id=cowrie_wallets.id) ORDER BY closed_at,id LIMIT ?2 ON CONFLICT(subject_id) DO NOTHING`,[now,limit]),
    statement(`UPDATE cowrie_wallets SET anonymous_owner_hash=printf('%064d',0),recovery_credential_hash=printf('%064d',0),last_access_idempotency_hash=NULL,ownership_minimized_at=?1,version=version+1,updated_at=?1 WHERE id IN (SELECT id FROM cowrie_wallets WHERE closed_at+2592000000<=?1 AND ownership_minimized_at IS NULL AND id NOT IN (SELECT id FROM retention_active_wallet_holds) AND NOT EXISTS(SELECT 1 FROM retention_cases c WHERE c.closed_at IS NULL AND c.wallet_id=cowrie_wallets.id) ORDER BY closed_at,id LIMIT ?2)`,[now,limit]),
    statement(`DELETE FROM answers WHERE id IN (SELECT id FROM answers WHERE attempt_id IN (${attempts}) ORDER BY id LIMIT ?2)`,[now,limit]),
    statement(`DELETE FROM daily_challenge_completions WHERE id IN (SELECT id FROM daily_challenge_completions WHERE attempt_id IN (${attempts}) ORDER BY completed_at,id LIMIT ?2)`,[now,limit]),
    statement(`INSERT INTO retention_suppression(scope,subject_id,unavailable_at,forget_after) SELECT 'attempt',id,?1,?1+2592000000 FROM quiz_attempts WHERE ${expired} AND anonymized_at IS NULL AND id NOT IN (SELECT id FROM retention_protected_attempts) ORDER BY expires_at,id LIMIT ?2 ON CONFLICT(subject_id) DO NOTHING`,[now,limit]),
    statement(`INSERT INTO retention_suppression(scope,subject_id,unavailable_at,forget_after) SELECT 'result',id,?1,?1+2592000000 FROM results WHERE ${expired} AND anonymized_at IS NULL AND attempt_id NOT IN (SELECT id FROM retention_protected_attempts) ORDER BY expires_at,id LIMIT ?2 ON CONFLICT(subject_id) DO NOTHING`,[now,limit]),
    statement(`UPDATE results SET state='anonymized',anonymized_at=COALESCE(anonymized_at,?1),reviewed_display_name=NULL,safe_avatar_id=NULL,updated_at=?1 WHERE id IN (SELECT id FROM results WHERE (expires_at<=?1 OR deleted_at IS NOT NULL) AND attempt_id NOT IN (SELECT id FROM retention_protected_attempts) AND anonymized_at IS NULL ORDER BY expires_at,id LIMIT ?2)`,[now,limit]),
    statement(`UPDATE quiz_attempts SET status='anonymized',anonymous_subject_hash=NULL,referral_code=NULL,challenge_code=NULL,anonymized_at=?1,updated_at=?1 WHERE id IN (SELECT id FROM quiz_attempts WHERE ${expired} AND anonymized_at IS NULL AND id NOT IN (SELECT id FROM retention_protected_attempts) ORDER BY expires_at,id LIMIT ?2)`,[now,limit]),
    statement(`DELETE FROM challenge_attempts WHERE id IN (SELECT ca.id FROM challenge_attempts ca WHERE (ca.expires_at<=?1 OR ca.deleted_at IS NOT NULL) AND ca.recipient_attempt_id NOT IN (SELECT id FROM retention_protected_attempts) AND NOT EXISTS(SELECT 1 FROM challenges ch JOIN results r ON r.id=ch.inviter_result_id WHERE ch.id=ca.challenge_id AND r.attempt_id IN (SELECT id FROM retention_protected_attempts)) ORDER BY ca.expires_at,ca.id LIMIT ?2)`,[now,limit]),
    statement(`UPDATE challenges SET state='anonymized',reviewed_inviter_name=NULL,safe_inviter_avatar_id=NULL,creation_idempotency_key_hash=NULL,revocation_token_hash=NULL,anonymized_at=?1,updated_at=?1 WHERE id IN (SELECT ch.id FROM challenges ch WHERE (ch.expires_at<=?1 OR ch.deleted_at IS NOT NULL) AND ch.anonymized_at IS NULL AND NOT EXISTS(SELECT 1 FROM results r WHERE r.id=ch.inviter_result_id AND r.attempt_id IN (SELECT id FROM retention_protected_attempts)) ORDER BY ch.expires_at,ch.id LIMIT ?2)`,[now,limit]),
    statement(`INSERT INTO retention_order_minimisation(order_id,minimised_at) SELECT o.id,?1 FROM commerce_orders o WHERE o.retention_expires_at<=?1 AND o.state NOT IN ('pending','paid','review_required') AND (o.cowrie_wallet_id IS NULL OR EXISTS(SELECT 1 FROM retention_closures cl WHERE cl.wallet_id=o.cowrie_wallet_id AND cl.financial_until<=?1)) AND o.id NOT IN (SELECT id FROM retention_active_order_holds) AND NOT EXISTS(SELECT 1 FROM retention_cases c WHERE c.closed_at IS NULL AND (c.order_id=o.id OR c.wallet_id=o.cowrie_wallet_id)) AND NOT EXISTS(SELECT 1 FROM retention_settlements s WHERE s.order_id=o.id AND s.retain_until>?1) AND NOT EXISTS(SELECT 1 FROM stripe_webhook_events e WHERE (e.order_id=o.id OR e.payment_intent_hash=o.stripe_payment_intent_hash) AND e.processing_result IN ('received','failed','review_required')) AND NOT EXISTS(SELECT 1 FROM retention_order_minimisation m WHERE m.order_id=o.id) ORDER BY o.retention_expires_at,o.id LIMIT ?2`,[now,limit]),
    statement(`UPDATE commerce_entitlements SET anonymous_owner_hash=printf('%064d',0),state='expired',updated_at=?1 WHERE order_id IN (SELECT order_id FROM retention_order_minimisation) AND anonymous_owner_hash!=printf('%064d',0) AND order_id IN (SELECT order_id FROM retention_order_minimisation WHERE order_id IN (SELECT id FROM commerce_orders WHERE anonymous_owner_hash!=printf('%064d',0)) ORDER BY minimised_at,order_id LIMIT ?2)`,[now,limit]),
    statement(`UPDATE commerce_orders SET anonymous_owner_hash=printf('%064d',0),updated_at=?1 WHERE id IN (SELECT order_id FROM retention_order_minimisation WHERE order_id IN (SELECT id FROM commerce_orders WHERE anonymous_owner_hash!=printf('%064d',0)) ORDER BY minimised_at,order_id LIMIT ?2) AND anonymous_owner_hash!=printf('%064d',0)`,[now,limit]),
    ...["referral_events","share_events","analytics_events","consent_preferences"].map(table=>statement(`DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE expires_at<=?1 AND NOT EXISTS(SELECT 1 FROM retention_holds WHERE released_at IS NULL) ORDER BY expires_at,id LIMIT ?2)`,[now,limit])),
    statement(`DELETE FROM mastery_seals WHERE id IN (SELECT m.id FROM mastery_seals m JOIN results r ON r.id=m.result_id WHERE (r.expires_at<=?1 OR r.deleted_at IS NOT NULL) AND r.attempt_id NOT IN (SELECT id FROM retention_protected_attempts) ORDER BY m.id LIMIT ?2)`,[now,limit]),
    statement(`DELETE FROM retention_settlements WHERE order_id IN (SELECT s.order_id FROM retention_settlements s JOIN retention_order_minimisation m ON m.order_id=s.order_id WHERE s.retain_until<=?1 AND s.order_id NOT IN (SELECT id FROM retention_active_order_holds) ORDER BY s.retain_until,s.order_id LIMIT ?2)`,[now,limit]),
    statement(`DELETE FROM retention_cases WHERE id IN (SELECT id FROM retention_cases WHERE retain_until<=?1 AND closed_at IS NOT NULL AND id NOT IN (SELECT id FROM retention_active_case_holds) ORDER BY retain_until,id LIMIT ?2)`,[now,limit]),
    statement(`DELETE FROM retention_suppression WHERE subject_id IN (SELECT subject_id FROM retention_suppression WHERE forget_after<=?1 ORDER BY forget_after,subject_id LIMIT ?2)`,[now,limit]),
    statement(`PRAGMA defer_foreign_keys=OFF`),
  ];
  const result=await database.batch(plan.map(row=>database.prepare(row.sql).bind(...row.params)));
  return result.map(row=>Number(row.meta?.changes||0));
}
