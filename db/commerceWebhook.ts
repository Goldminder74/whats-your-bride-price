import type { AtomicD1Database, BoundStatement } from "./repositories.ts";
import { COMMERCE_RETENTION_MS, PENDING_ORDER_LIFETIME_MS, CommerceValidationError, requireVerifiedStripeEvent, type VerifiedStripeEvent } from "./commerceContracts.ts";
import { cowrieTechnicalReversalStatements } from "./cowrieWallet.ts";
import type { CommerceOrderState } from "./commerce.ts";

async function digest(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2,"0")).join("");
}

// All money decisions below read current rows inside the atomic batch. Preflight reads
// only validate the checkout relationship and prepare bounded technical reversals.
export async function processCommerceWebhook(database: AtomicD1Database, event: VerifiedStripeEvent, now: number): Promise<Readonly<{ replay: boolean; state: CommerceOrderState }>> {
  requireVerifiedStripeEvent(event);
  const checkout = event.eventType.startsWith("checkout.session.");
  const previous = await database.prepare("SELECT payload_sha256 FROM stripe_webhook_events WHERE stripe_event_id=?1").bind(event.stripeEventId).first<{payload_sha256:string}>();
  if (previous && previous.payload_sha256 !== event.payloadSha256) throw new CommerceValidationError("stripe_event_conflict");
  if (checkout) {
    const order = await database.prepare("SELECT stripe_payment_link_id,amount_minor,stripe_checkout_session_id,stripe_payment_intent_hash FROM commerce_orders WHERE client_reference_id=?1").bind(event.clientReferenceId).first<{stripe_payment_link_id:string;amount_minor:number;stripe_checkout_session_id:string|null;stripe_payment_intent_hash:string|null}>();
    if (!order || order.stripe_payment_link_id !== event.paymentLinkId || order.amount_minor !== event.amountTotal || event.currency !== "GBP" || (order.stripe_checkout_session_id && order.stripe_checkout_session_id !== event.checkoutSessionId) || (order.stripe_payment_intent_hash && event.paymentIntentHash && order.stripe_payment_intent_hash !== event.paymentIntentHash)) throw new CommerceValidationError("stripe_order_unavailable");
  }
  const auditHash = await digest(`wybp:stripe-audit:v1\u0000${event.stripeEventId}`);
  const target = "(SELECT order_id FROM stripe_webhook_events WHERE stripe_event_id=?1)";
  const statements: BoundStatement[] = [
    database.prepare(`INSERT INTO stripe_webhook_events(id,stripe_event_id,event_type,livemode,payload_sha256,received_at,processing_result,expires_at,version,created_at,updated_at,payment_intent_hash,amount_minor,amount_refunded_minor) VALUES(?1,?2,?3,?4,?5,?6,'received',?7,1,?6,?6,?8,?9,?10) ON CONFLICT(stripe_event_id) DO NOTHING`).bind(`stripe_event_${auditHash.slice(0,32)}`,event.stripeEventId,event.eventType,event.livemode?1:0,event.payloadSha256,now,now+COMMERCE_RETENTION_MS,event.paymentIntentHash,event.amountTotal,event.amountRefunded),
    database.prepare("UPDATE stripe_webhook_events SET payload_sha256=?2 WHERE stripe_event_id=?1").bind(event.stripeEventId,event.payloadSha256),
    database.prepare(`UPDATE commerce_orders SET stripe_payment_intent_hash=COALESCE(stripe_payment_intent_hash,?2),stripe_checkout_session_id=COALESCE(stripe_checkout_session_id,?3),updated_at=MAX(updated_at,?4) WHERE client_reference_id=?1 AND (?5=0 OR (stripe_payment_link_id=?6 AND amount_minor=?7))`).bind(event.clientReferenceId,event.paymentIntentHash,event.checkoutSessionId,now,checkout?1:0,event.paymentLinkId,event.amountTotal),
    database.prepare(`UPDATE stripe_webhook_events SET order_id=(SELECT id FROM commerce_orders WHERE client_reference_id=?2 OR (?3 IS NOT NULL AND stripe_payment_intent_hash=?3) LIMIT 1) WHERE stripe_event_id=?1 AND payload_sha256=?4`).bind(event.stripeEventId,event.clientReferenceId,event.paymentIntentHash,event.payloadSha256),
    database.prepare(`UPDATE stripe_webhook_events SET order_id=(SELECT id FROM commerce_orders WHERE stripe_payment_intent_hash=?1),updated_at=MAX(updated_at,?2) WHERE payment_intent_hash=?1 AND EXISTS(SELECT 1 FROM commerce_orders WHERE stripe_payment_intent_hash=?1)`).bind(event.paymentIntentHash,now),
  ];
  // An adverse delivery retires funded games whose questions have not been issued.
  // The migration trigger aborts the entire batch if a new unissued debit races this
  // bounded read. Stripe can retry; no event is acknowledged with unsettled value.
  if (!checkout) {
    const pending = await database.prepare(`SELECT qa.idempotency_key_hash,w.id wallet_id,w.anonymous_owner_hash FROM quiz_attempts qa JOIN cowrie_ledger debit ON debit.related_attempt_id=qa.id JOIN cowrie_purchase_allocations a ON a.id=debit.related_allocation_id JOIN commerce_orders o ON o.id=a.order_id JOIN cowrie_wallets w ON w.id=a.wallet_id WHERE (o.stripe_payment_intent_hash=?1 OR o.client_reference_id=?2) AND w.state='active' AND debit.entry_type='quick_play_debit' AND qa.cowrie_issued_at IS NULL AND qa.status='in_progress' AND NOT EXISTS(SELECT 1 FROM cowrie_ledger reversal WHERE reversal.reversal_of_ledger_id=debit.id) LIMIT 101`).bind(event.paymentIntentHash,event.clientReferenceId).all<{idempotency_key_hash:string;wallet_id:string;anonymous_owner_hash:string}>();
    if (!pending.success || pending.results.length > 100) throw new CommerceValidationError("webhook_processing_unavailable");
    // Partial refunds preserve all wallet value and do not interrupt pending games.
    if (event.eventType === "charge.dispute.created" || event.amountRefunded === event.amountTotal) for (const attempt of pending.results) {
      const hash = await digest(`wybp-cowrie-technical-reversal-v1\u0000${attempt.wallet_id}\u0000${attempt.idempotency_key_hash}`);
      statements.push(...cowrieTechnicalReversalStatements(database,{walletId:attempt.wallet_id,ownerHash:attempt.anonymous_owner_hash,idempotencyHash:attempt.idempotency_key_hash,now},hash));
    }
  }
  const dispute = "EXISTS(SELECT 1 FROM stripe_webhook_events e WHERE e.order_id=commerce_orders.id AND e.event_type='charge.dispute.created')";
  const full = "EXISTS(SELECT 1 FROM stripe_webhook_events e WHERE e.order_id=commerce_orders.id AND e.event_type='charge.refunded' AND e.amount_minor=commerce_orders.amount_minor AND e.amount_refunded_minor=e.amount_minor)";
  const partial = "EXISTS(SELECT 1 FROM stripe_webhook_events e WHERE e.order_id=commerce_orders.id AND e.event_type='charge.refunded')";
  const consumed = "EXISTS(SELECT 1 FROM cowrie_ledger debit JOIN cowrie_purchase_allocations a ON a.id=debit.related_allocation_id WHERE a.order_id=commerce_orders.id AND debit.entry_type='quick_play_debit' AND NOT EXISTS(SELECT 1 FROM cowrie_ledger reversal WHERE reversal.reversal_of_ledger_id=debit.id))";
  statements.push(database.prepare(`UPDATE commerce_orders SET state=CASE
    WHEN state IN('deleted','expired') THEN state
    WHEN ${dispute} OR disputed_at IS NOT NULL THEN CASE WHEN ${consumed} THEN 'review_required' ELSE 'disputed' END
    WHEN ${full} THEN CASE WHEN ${consumed} THEN 'review_required' ELSE 'refunded' END
    WHEN refunded_at IS NOT NULL THEN state
    WHEN ${partial} OR state='review_required' THEN 'review_required'
    WHEN state='fulfilled' THEN 'fulfilled'
    WHEN MIN(pending_expires_at,created_at+${PENDING_ORDER_LIFETIME_MS})<=?2 THEN 'expired'
    WHEN ?3=1 THEN CASE WHEN product_key='royal_reveal_v1' OR EXISTS(SELECT 1 FROM cowrie_wallets w WHERE w.id=cowrie_wallet_id AND w.state='active' AND w.anonymous_owner_hash=commerce_orders.anonymous_owner_hash) THEN 'fulfilled' ELSE 'review_required' END
    WHEN ?4='checkout.session.async_payment_failed' THEN 'failed'
    WHEN ?4='checkout.session.completed' AND state!='failed' THEN 'processing'
    ELSE state END,
    paid_at=CASE WHEN ?3=1 THEN COALESCE(paid_at,?2) ELSE paid_at END,
    refunded_at=CASE WHEN ${full} THEN COALESCE(refunded_at,?2) ELSE refunded_at END,
    disputed_at=CASE WHEN ${dispute} THEN COALESCE(disputed_at,?2) ELSE disputed_at END,
    updated_at=MAX(updated_at,?2) WHERE id=${target}`).bind(event.stripeEventId,now,checkout&&event.paymentStatus==="paid"?1:0,event.eventType));
  statements.push(database.prepare(`UPDATE commerce_orders SET fulfilled_at=COALESCE(fulfilled_at,?2),updated_at=MAX(updated_at,?2) WHERE id=${target} AND state='fulfilled'`).bind(event.stripeEventId,now));
  // Royal Reveal stays a direct, result-specific entitlement.
  statements.push(database.prepare(`INSERT INTO commerce_entitlements(id,order_id,result_id,anonymous_owner_hash,product_key,state,granted_at,retention_expires_at,version,created_at,updated_at) SELECT 'commerce_entitlement_'||id,id,result_id,anonymous_owner_hash,product_key,'active',?2,retention_expires_at,1,?2,?2 FROM commerce_orders WHERE id=${target} AND product_key='royal_reveal_v1' AND state='fulfilled' ON CONFLICT(order_id) DO NOTHING`).bind(event.stripeEventId,now));
  statements.push(database.prepare(`UPDATE commerce_entitlements SET state='revoked',revoked_at=COALESCE(revoked_at,?2),updated_at=MAX(updated_at,?2) WHERE order_id=${target} AND state='active' AND EXISTS(SELECT 1 FROM commerce_orders o WHERE o.id=order_id AND (o.state IN('refunded','disputed') OR o.refunded_at IS NOT NULL))`).bind(event.stripeEventId,now));
  // Order IDs are opaque and unique. Independent domains bind each immutable entry.
  const reference = event.clientReferenceId || event.paymentIntentHash || event.stripeEventId;
  const credit = await digest(`wybp:cowrie-purchase:v1\u0000${reference}`);
  statements.push(database.prepare(`INSERT INTO cowrie_purchase_allocations(id,order_id,wallet_id,product_key,original_quantity,remaining_quantity,state,fulfilment_idempotency_hash,fulfilled_at,retention_expires_at,version,created_at,updated_at) SELECT ?2,id,cowrie_wallet_id,product_key,CASE product_key WHEN 'cowrie_5_v1' THEN 5 WHEN 'cowrie_15_v1' THEN 15 ELSE 40 END,CASE product_key WHEN 'cowrie_5_v1' THEN 5 WHEN 'cowrie_15_v1' THEN 15 ELSE 40 END,'active',?3,?4,retention_expires_at,1,?4,?4 FROM commerce_orders WHERE id=${target} AND state='fulfilled' AND product_key IN('cowrie_5_v1','cowrie_15_v1','cowrie_40_v1') AND NOT EXISTS(SELECT 1 FROM cowrie_purchase_allocations a WHERE a.order_id=commerce_orders.id)`).bind(event.stripeEventId,`allocation_${credit.slice(0,32)}`,credit,now));
  statements.push(database.prepare(`INSERT INTO cowrie_ledger(id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_order_id,related_allocation_id,reason_code,created_at) SELECT 'ledger_'||substr(a.fulfilment_idempotency_hash,1,32),a.wallet_id,'purchased','purchase_credit',a.original_quantity,'purchase',a.fulfilment_idempotency_hash,a.order_id,a.id,'verified_purchase',?2 FROM cowrie_purchase_allocations a JOIN commerce_orders o ON o.id=a.order_id WHERE o.id=${target} AND o.state='fulfilled' AND a.state='active' AND NOT EXISTS(SELECT 1 FROM cowrie_ledger credit WHERE credit.entry_type='purchase_credit' AND credit.related_order_id=o.id)`).bind(event.stripeEventId,now));
  const adverse = "(o.disputed_at IS NOT NULL OR o.refunded_at IS NOT NULL)";
  const reversal = await digest(`wybp:cowrie-adverse:v1\u0000${reference}`);
  statements.push(database.prepare(`INSERT INTO cowrie_ledger(id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_order_id,related_allocation_id,reason_code,reversal_of_ledger_id,created_at) SELECT ?2,a.wallet_id,'purchased','refund_reversal',-a.remaining_quantity,'refund',?3,o.id,a.id,CASE WHEN o.disputed_at IS NOT NULL THEN 'verified_dispute' ELSE 'verified_refund' END,credit.id,?4 FROM cowrie_purchase_allocations a JOIN commerce_orders o ON o.id=a.order_id JOIN cowrie_ledger credit ON credit.related_order_id=o.id AND credit.entry_type='purchase_credit' WHERE o.id=${target} AND ${adverse} AND o.product_key IN('cowrie_5_v1','cowrie_15_v1','cowrie_40_v1') AND a.remaining_quantity>0 AND NOT EXISTS(SELECT 1 FROM cowrie_ledger r WHERE r.reversal_of_ledger_id=credit.id)`).bind(event.stripeEventId,`ledger_${reversal.slice(0,32)}`,reversal,now));
  statements.push(database.prepare(`UPDATE cowrie_purchase_allocations SET remaining_quantity=0,state=CASE WHEN o.state='review_required' THEN 'review_required' WHEN o.disputed_at IS NOT NULL THEN 'disputed' ELSE 'refunded' END,refunded_at=COALESCE(cowrie_purchase_allocations.refunded_at,o.refunded_at),disputed_at=COALESCE(cowrie_purchase_allocations.disputed_at,o.disputed_at),updated_at=MAX(cowrie_purchase_allocations.updated_at,?2),version=cowrie_purchase_allocations.version+1 FROM commerce_orders o WHERE order_id=o.id AND o.id=${target} AND ${adverse} AND o.product_key IN('cowrie_5_v1','cowrie_15_v1','cowrie_40_v1')`).bind(event.stripeEventId,now));
  statements.push(database.prepare(`UPDATE stripe_webhook_events SET processing_result=CASE WHEN (SELECT state FROM commerce_orders o WHERE o.id=order_id)='review_required' THEN 'review_required' ELSE 'processed' END,updated_at=MAX(updated_at,?2) WHERE order_id=${target}`).bind(event.stripeEventId,now));
  try { const results = await database.batch(statements); if (!results.every(result=>result.success)) throw new Error("batch unavailable"); }
  catch { throw new CommerceValidationError("webhook_processing_unavailable"); }
  const outcome = await database.prepare(`SELECT o.state FROM commerce_orders o JOIN stripe_webhook_events e ON e.order_id=o.id WHERE e.stripe_event_id=?1`).bind(event.stripeEventId).first<{state:CommerceOrderState}>();
  return Object.freeze({replay:Boolean(previous),state:outcome?.state||"processing"});
}
