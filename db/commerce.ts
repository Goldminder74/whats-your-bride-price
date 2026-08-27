import type { RegionKey } from "../app/gameData.ts";
import type { AtomicD1Database, BoundStatement } from "./repositories.ts";
import {
  COMMERCE_RETENTION_MS,
  CommerceValidationError,
  PENDING_ORDER_LIFETIME_MS,
  ROYAL_REVEAL_AMOUNT_MINOR,
  ROYAL_REVEAL_CONSENT_NOTICE_VERSION,
  ROYAL_REVEAL_CURRENCY,
  ROYAL_REVEAL_DISPLAY_PRICE,
  ROYAL_REVEAL_PRODUCT_KEY,
  constantTimeOwnerMatch,
  constructPaymentLinkUrl,
  deriveCommerceOwnerHash,
  deriveOrderIdempotencyHash,
  securePublicOrderReference,
  validateCommerceConfiguration,
  validateStartOrderRequest,
  type CommerceConfiguration,
  type VerifiedStripeEvent,
} from "./commerceContracts.ts";

export type CommerceOrderState = "pending" | "processing" | "paid" | "fulfilled" | "failed" | "refunded" | "disputed" | "expired" | "deleted" | "review_required";
export type CommerceOwnedResult = Readonly<{
  id: string; publicSlug: string; edition: RegionKey; score: number; total: number; resultTitle: string; avatarId: string;
  state: string; expiresAt: number | null; attemptStatus: string; attemptCompletedAt: number | null; attemptExpiresAt: number | null; anonymousOwnerHash: string | null;
}>;
export type CommerceOrder = Readonly<{
  id: string; publicOrderReference: string; resultId: string; anonymousOwnerHash: string; state: CommerceOrderState;
  clientReferenceId: string; stripePaymentLinkId: string; stripeCheckoutSessionId: string | null; stripePaymentIntentId: string | null;
  pendingExpiresAt: number; paidAt: number | null; fulfilledAt: number | null; refundedAt: number | null; disputedAt: number | null;
}>;
export type EntitlementProjection = Readonly<{
  active: true; productKey: typeof ROYAL_REVEAL_PRODUCT_KEY; resultSlug: string; edition: RegionKey; score: number; maximumScore: number; resultTitle: string; avatarId: string;
}>;

export interface CommerceRepository {
  readonly storageAvailable: boolean;
  getOwnedCompletedResult(publicSlug: string): Promise<CommerceOwnedResult | null>;
  getOrderByIdempotencyHash(hash: string): Promise<CommerceOrder | null>;
  createPendingOrder(input: Readonly<{ id: string; publicOrderReference: string; result: CommerceOwnedResult; ownerHash: string; idempotencyHash: string; paymentLinkId: string; now: number }>): Promise<CommerceOrder>;
  getOrderByReference(reference: string): Promise<CommerceOrder | null>;
  getActiveEntitlement(resultSlug: string, ownerHash: string, now: number): Promise<EntitlementProjection | null>;
  processVerifiedWebhook(event: VerifiedStripeEvent, now: number): Promise<Readonly<{ replay: boolean; state: CommerceOrderState }>>;
  retainExpired(now: number, limit: number, authorized: boolean): Promise<number>;
}

export type CommerceRateLimitDecision = "allowed" | "limited" | "unavailable";
export interface CommerceRateLimiter { consume(ownerHash: string, now: number): Promise<CommerceRateLimitDecision>; }
export class UnavailableCommerceRateLimiter implements CommerceRateLimiter { async consume(): Promise<CommerceRateLimitDecision> { return "unavailable"; } }
export class InMemoryCommerceRateLimiter implements CommerceRateLimiter {
  private readonly hits = new Map<string, number[]>();
  async consume(ownerHash: string, now: number): Promise<CommerceRateLimitDecision> {
    const current = (this.hits.get(ownerHash) || []).filter((time) => time > now - 60_000);
    if (current.length >= 20) return "limited"; current.push(now); this.hits.set(ownerHash, current); return "allowed";
  }
}

function fail(code: string): never { throw new CommerceValidationError(code); }
function internalId(prefix: string, reference: string): string { return `${prefix}_${reference.slice(3)}`; }
function validResult(result: CommerceOwnedResult | null, slug: string, ownerHash: string, now: number): result is CommerceOwnedResult {
  return Boolean(result && result.publicSlug === slug && result.state === "active" && (result.expiresAt === null || result.expiresAt > now)
    && result.attemptStatus === "completed" && result.attemptCompletedAt !== null && result.attemptExpiresAt !== null && result.attemptExpiresAt > now
    && constantTimeOwnerMatch(result.anonymousOwnerHash, ownerHash));
}

export class CommerceService {
  private readonly config: CommerceConfiguration;
  private readonly repository: CommerceRepository;
  private readonly rateLimiter: CommerceRateLimiter;
  private readonly now: () => number;
  constructor(repository: CommerceRepository, rateLimiter: CommerceRateLimiter, config: unknown, now: () => number = Date.now) {
    this.repository = repository;
    this.rateLimiter = rateLimiter;
    this.now = now;
    this.config = validateCommerceConfiguration(config);
  }
  private async authorize(rawCredential: unknown): Promise<Readonly<{ ownerHash: string; now: number }>> {
    if (!this.repository.storageAvailable) return fail("commerce_storage_unavailable");
    const ownerHash = await deriveCommerceOwnerHash(rawCredential); const now = this.now(); const decision = await this.rateLimiter.consume(ownerHash, now);
    if (decision === "limited") return fail("commerce_rate_limited"); if (decision !== "allowed") return fail("commerce_rate_limit_unavailable");
    return Object.freeze({ ownerHash, now });
  }
  async startOrder(value: unknown): Promise<Readonly<{ publicOrderReference: string; paymentLinkUrl: string; productKey: typeof ROYAL_REVEAL_PRODUCT_KEY; displayPrice: typeof ROYAL_REVEAL_DISPLAY_PRICE; pendingExpiresAt: number }>> {
    const request = validateStartOrderRequest(value); const { ownerHash, now } = await this.authorize(request.anonymousSessionCredential);
    const result = await this.repository.getOwnedCompletedResult(request.resultSlug); if (!validResult(result, request.resultSlug, ownerHash, now)) return fail("result_unavailable");
    const idempotencyHash = await deriveOrderIdempotencyHash({ rawKey: request.idempotencyKey, ownerHash, resultId: result.id });
    const previous = await this.repository.getOrderByIdempotencyHash(idempotencyHash);
    let order: CommerceOrder;
    if (previous) {
      if (!constantTimeOwnerMatch(previous.anonymousOwnerHash, ownerHash) || previous.resultId !== result.id || previous.state !== "pending" || previous.pendingExpiresAt <= now) return fail("order_conflict");
      order = previous;
    } else {
      const reference = securePublicOrderReference();
      order = await this.repository.createPendingOrder({ id: internalId("commerce_order", reference), publicOrderReference: reference, result, ownerHash, idempotencyHash, paymentLinkId: this.config.expectedPaymentLinkId, now });
    }
    return Object.freeze({ publicOrderReference: order.publicOrderReference, paymentLinkUrl: constructPaymentLinkUrl(this.config.publicPaymentLinkUrl, order.clientReferenceId), productKey: ROYAL_REVEAL_PRODUCT_KEY, displayPrice: ROYAL_REVEAL_DISPLAY_PRICE, pendingExpiresAt: order.pendingExpiresAt });
  }
  async orderStatus(value: unknown): Promise<Readonly<{ state: CommerceOrderState; entitlementActive: boolean; productKey: typeof ROYAL_REVEAL_PRODUCT_KEY; entitlement?: EntitlementProjection }>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("status_request_invalid");
    const candidate = value as Record<string, unknown>; if (Object.keys(candidate).sort().join(",") !== "anonymousSessionCredential,publicOrderReference") return fail("status_request_invalid");
    if (typeof candidate.publicOrderReference !== "string" || !/^rr_[0-9a-f]{32}$/.test(candidate.publicOrderReference)) return fail("order_unavailable");
    const { ownerHash, now } = await this.authorize(candidate.anonymousSessionCredential);
    const order = await this.repository.getOrderByReference(candidate.publicOrderReference); if (!order || !constantTimeOwnerMatch(order.anonymousOwnerHash, ownerHash)) return fail("order_unavailable");
    const entitlement = await this.repository.getActiveEntitlementByResultId?.(order.resultId, ownerHash, now);
    return Object.freeze({ state: order.state, entitlementActive: Boolean(entitlement), productKey: ROYAL_REVEAL_PRODUCT_KEY, ...(entitlement ? { entitlement } : {}) });
  }
  async entitlement(value: unknown): Promise<EntitlementProjection> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("entitlement_request_invalid");
    const candidate = value as Record<string, unknown>; if (Object.keys(candidate).sort().join(",") !== "anonymousSessionCredential,resultSlug" || typeof candidate.resultSlug !== "string" || !/^[0-9a-f]{48}$/.test(candidate.resultSlug)) return fail("entitlement_unavailable");
    const { ownerHash, now } = await this.authorize(candidate.anonymousSessionCredential);
    const result = await this.repository.getOwnedCompletedResult(candidate.resultSlug); if (!validResult(result, candidate.resultSlug, ownerHash, now)) return fail("entitlement_unavailable");
    const projection = await this.repository.getActiveEntitlement(candidate.resultSlug, ownerHash, now); if (!projection) return fail("entitlement_unavailable"); return projection;
  }
  async webhook(event: VerifiedStripeEvent): Promise<Readonly<{ received: true; replay: boolean }>> {
    if (!this.repository.storageAvailable) return fail("commerce_storage_unavailable");
    const outcome = await this.repository.processVerifiedWebhook(event, this.now()); return Object.freeze({ received: true, replay: outcome.replay });
  }
}

// Optional internal lookup hooks let the status projection remain minimal without exposing IDs publicly.
export interface CommerceRepository {
  getOwnedCompletedResultById?(resultId: string): Promise<CommerceOwnedResult | null>;
  getActiveEntitlementByResultId?(resultId: string, ownerHash: string, now: number): Promise<EntitlementProjection | null>;
}

export class InMemoryCommerceRepository implements CommerceRepository {
  readonly storageAvailable = true; readonly results = new Map<string, CommerceOwnedResult>(); readonly orders = new Map<string, CommerceOrder>(); readonly idempotency = new Map<string, string>(); readonly entitlements = new Map<string, EntitlementProjection>(); readonly events = new Set<string>();
  async getOwnedCompletedResult(slug: string) { return this.results.get(slug) || null; }
  async getOwnedCompletedResultById(id: string) { return [...this.results.values()].find((result) => result.id === id) || null; }
  async getOrderByIdempotencyHash(hash: string) { const id = this.idempotency.get(hash); return id ? this.orders.get(id) || null : null; }
  async createPendingOrder(input: Readonly<{ id: string; publicOrderReference: string; result: CommerceOwnedResult; ownerHash: string; idempotencyHash: string; paymentLinkId: string; now: number }>) {
    const order = Object.freeze({ id: input.id, publicOrderReference: input.publicOrderReference, resultId: input.result.id, anonymousOwnerHash: input.ownerHash, state: "pending" as const, clientReferenceId: input.publicOrderReference, stripePaymentLinkId: input.paymentLinkId, stripeCheckoutSessionId: null, stripePaymentIntentId: null, pendingExpiresAt: input.now + PENDING_ORDER_LIFETIME_MS, paidAt: null, fulfilledAt: null, refundedAt: null, disputedAt: null });
    this.orders.set(order.id, order); this.idempotency.set(input.idempotencyHash, order.id); return order;
  }
  async getOrderByReference(reference: string) { return [...this.orders.values()].find((order) => order.publicOrderReference === reference) || null; }
  async getActiveEntitlement(slug: string, ownerHash: string) { return this.entitlements.get(`${slug}:${ownerHash}`) || null; }
  async getActiveEntitlementByResultId(resultId: string, ownerHash: string) { const result = await this.getOwnedCompletedResultById(resultId); return result ? this.getActiveEntitlement(result.publicSlug, ownerHash) : null; }
  async processVerifiedWebhook(event: VerifiedStripeEvent, now: number) {
    if (this.events.has(event.stripeEventId)) return Object.freeze({ replay: true, state: "fulfilled" as CommerceOrderState });
    const orderEntry = [...this.orders.entries()].find(([, order]) => event.clientReferenceId ? order.clientReferenceId === event.clientReferenceId : order.stripePaymentIntentId === event.paymentIntentId);
    if (!orderEntry) return fail("stripe_order_unknown");
    const [id, current] = orderEntry; let state: CommerceOrderState = current.state;
    if (["refunded", "disputed", "deleted"].includes(current.state) && String(event.eventType).includes("succeeded")) state = current.state;
    else if ((event.eventType === "checkout.session.completed" || event.eventType === "checkout.session.async_payment_succeeded") && event.paymentStatus === "paid") state = "fulfilled";
    else if (event.eventType === "checkout.session.completed") state = "processing";
    else if (event.eventType === "checkout.session.async_payment_failed" && current.state !== "fulfilled") state = "failed";
    else if (event.eventType === "charge.refunded") state = (event.amountRefunded || 0) >= ROYAL_REVEAL_AMOUNT_MINOR ? "refunded" : "review_required";
    else if (event.eventType === "charge.dispute.created") state = "disputed";
    const updated: CommerceOrder = Object.freeze({ ...current, state, stripeCheckoutSessionId: event.checkoutSessionId || current.stripeCheckoutSessionId, stripePaymentIntentId: event.paymentIntentId || current.stripePaymentIntentId, paidAt: state === "fulfilled" ? current.paidAt || now : current.paidAt, fulfilledAt: state === "fulfilled" ? current.fulfilledAt || now : current.fulfilledAt, refundedAt: state === "refunded" ? current.refundedAt || now : current.refundedAt, disputedAt: state === "disputed" ? current.disputedAt || now : current.disputedAt });
    this.orders.set(id, updated); const result = await this.getOwnedCompletedResultById(current.resultId);
    if (result && state === "fulfilled") this.entitlements.set(`${result.publicSlug}:${current.anonymousOwnerHash}`, Object.freeze({ active: true, productKey: ROYAL_REVEAL_PRODUCT_KEY, resultSlug: result.publicSlug, edition: result.edition, score: result.score, maximumScore: result.total, resultTitle: result.resultTitle, avatarId: result.avatarId }));
    if (result && ["refunded", "disputed"].includes(state)) this.entitlements.delete(`${result.publicSlug}:${current.anonymousOwnerHash}`);
    this.events.add(event.stripeEventId); return Object.freeze({ replay: false, state });
  }
  async retainExpired(now: number, limit: number, authorized: boolean) { if (!authorized || !Number.isInteger(limit) || limit < 1 || limit > 500) return fail("retention_not_authorized"); let count = 0; for (const [id, order] of this.orders) if (count < limit && order.pendingExpiresAt <= now && order.state !== "fulfilled") { this.orders.delete(id); count += 1; } return count; }
}

type OwnedResultRow = Readonly<{ id: string; public_slug: string; edition_key: RegionKey; score: number; total: number; safe_avatar_id: string; state: string; expires_at: number | null; attempt_status: string; attempt_completed_at: number | null; attempt_expires_at: number | null; anonymous_subject_hash: string | null }>;
type OrderRow = Readonly<{ id: string; public_order_reference: string; result_id: string; anonymous_owner_hash: string; state: CommerceOrderState; client_reference_id: string; stripe_payment_link_id: string; stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null; pending_expires_at: number; paid_at: number | null; fulfilled_at: number | null; refunded_at: number | null; disputed_at: number | null }>;
function orderFromRow(row: OrderRow): CommerceOrder { return Object.freeze({ id: row.id, publicOrderReference: row.public_order_reference, resultId: row.result_id, anonymousOwnerHash: row.anonymous_owner_hash, state: row.state, clientReferenceId: row.client_reference_id, stripePaymentLinkId: row.stripe_payment_link_id, stripeCheckoutSessionId: row.stripe_checkout_session_id, stripePaymentIntentId: row.stripe_payment_intent_id, pendingExpiresAt: row.pending_expires_at, paidAt: row.paid_at, fulfilledAt: row.fulfilled_at, refundedAt: row.refunded_at, disputedAt: row.disputed_at }); }

export class D1CommerceRepository implements CommerceRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;
  constructor(database: AtomicD1Database) { this.database = database; }
  async getOwnedCompletedResult(publicSlug: string): Promise<CommerceOwnedResult | null> {
    const row = await this.database.prepare(`SELECT r.id,r.public_slug,qe.edition_key,r.score,r.total,r.safe_avatar_id,r.state,r.expires_at,qa.status attempt_status,qa.completed_at attempt_completed_at,qa.expires_at attempt_expires_at,qa.anonymous_subject_hash FROM results r JOIN quiz_attempts qa ON qa.id=r.attempt_id JOIN quiz_editions qe ON qe.id=r.edition_id WHERE r.public_slug=?1 LIMIT 1`).bind(publicSlug).first<OwnedResultRow>();
    return row ? Object.freeze({ id: row.id, publicSlug: row.public_slug, edition: row.edition_key, score: row.score, total: row.total, resultTitle: ["Roots Rookie","Culture Climber","Motherland Scholar","Bride Price Royalty"][row.score >= 9 ? 3 : row.score >= 7 ? 2 : row.score >= 4 ? 1 : 0], avatarId: row.safe_avatar_id, state: row.state, expiresAt: row.expires_at, attemptStatus: row.attempt_status, attemptCompletedAt: row.attempt_completed_at, attemptExpiresAt: row.attempt_expires_at, anonymousOwnerHash: row.anonymous_subject_hash }) : null;
  }
  async getOwnedCompletedResultById(resultId: string) { const row = await this.database.prepare("SELECT public_slug FROM results WHERE id=?1").bind(resultId).first<{ public_slug: string }>(); return row ? this.getOwnedCompletedResult(row.public_slug) : null; }
  private async order(query: string, value: string) { const row = await this.database.prepare(query).bind(value).first<OrderRow>(); return row ? orderFromRow(row) : null; }
  async getOrderByIdempotencyHash(hash: string) { return this.order("SELECT * FROM commerce_orders WHERE idempotency_hash=?1 LIMIT 1", hash); }
  async getOrderByReference(reference: string) { return this.order("SELECT * FROM commerce_orders WHERE public_order_reference=?1 LIMIT 1", reference); }
  async createPendingOrder(input: Readonly<{ id: string; publicOrderReference: string; result: CommerceOwnedResult; ownerHash: string; idempotencyHash: string; paymentLinkId: string; now: number }>) {
    await this.database.prepare(`INSERT INTO commerce_orders (id,public_order_reference,product_key,result_id,anonymous_owner_hash,currency,amount_minor,state,client_reference_id,stripe_payment_link_id,consent_notice_version,immediate_delivery_consent_at,pending_expires_at,retention_expires_at,idempotency_hash,version,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'pending',?2,?8,?9,?10,?11,?12,?13,1,?10,?10)`).bind(input.id,input.publicOrderReference,ROYAL_REVEAL_PRODUCT_KEY,input.result.id,input.ownerHash,ROYAL_REVEAL_CURRENCY,ROYAL_REVEAL_AMOUNT_MINOR,input.paymentLinkId,ROYAL_REVEAL_CONSENT_NOTICE_VERSION,input.now,input.now+PENDING_ORDER_LIFETIME_MS,input.now+COMMERCE_RETENTION_MS,input.idempotencyHash).run();
    const order = await this.getOrderByReference(input.publicOrderReference); if (!order) return fail("order_persistence_failed"); return order;
  }
  async getActiveEntitlement(resultSlug: string, ownerHash: string, now: number): Promise<EntitlementProjection | null> {
    const row = await this.database.prepare(`SELECT ce.result_id FROM commerce_entitlements ce JOIN results r ON r.id=ce.result_id WHERE r.public_slug=?1 AND ce.anonymous_owner_hash=?2 AND ce.product_key='royal_reveal_v1' AND ce.state='active' AND ce.deleted_at IS NULL AND (ce.expires_at IS NULL OR ce.expires_at>?3) LIMIT 1`).bind(resultSlug,ownerHash,now).first<{ result_id: string }>();
    const result = row ? await this.getOwnedCompletedResult(resultSlug) : null; return result ? Object.freeze({ active:true,productKey:ROYAL_REVEAL_PRODUCT_KEY,resultSlug:result.publicSlug,edition:result.edition,score:result.score,maximumScore:result.total,resultTitle:result.resultTitle,avatarId:result.avatarId }) : null;
  }
  async getActiveEntitlementByResultId(resultId: string, ownerHash: string, now: number) { const result=await this.getOwnedCompletedResultById(resultId); return result?this.getActiveEntitlement(result.publicSlug,ownerHash,now):null; }
  async processVerifiedWebhook(event: VerifiedStripeEvent, now: number) {
    const existing = await this.database.prepare("SELECT order_id FROM stripe_webhook_events WHERE stripe_event_id=?1 LIMIT 1").bind(event.stripeEventId).first<{ order_id:string|null }>();
    if (existing) { const order=existing.order_id?await this.order("SELECT * FROM commerce_orders WHERE id=?1",existing.order_id):null; return Object.freeze({ replay:true,state:order?.state||"processing" }); }
    const order = event.clientReferenceId ? await this.order("SELECT * FROM commerce_orders WHERE client_reference_id=?1",event.clientReferenceId) : event.paymentIntentId ? await this.order("SELECT * FROM commerce_orders WHERE stripe_payment_intent_id=?1",event.paymentIntentId) : null;
    if (!order) return fail("stripe_order_unknown");
    let state: CommerceOrderState = order.state;
    if (!(["refunded","disputed","deleted"] as string[]).includes(order.state)) {
      if ((event.eventType === "checkout.session.completed" || event.eventType === "checkout.session.async_payment_succeeded") && event.paymentStatus === "paid") state="fulfilled";
      else if (event.eventType === "checkout.session.completed") state="processing";
      else if (event.eventType === "checkout.session.async_payment_failed" && order.state !== "fulfilled") state="failed";
      else if (event.eventType === "charge.refunded") state=(event.amountRefunded||0)>=ROYAL_REVEAL_AMOUNT_MINOR?"refunded":"review_required";
      else if (event.eventType === "charge.dispute.created") state="disputed";
    }
    const resultCode = state === "review_required" ? "review_required" : "processed";
    const statements: BoundStatement[] = [
      this.database.prepare(`INSERT INTO stripe_webhook_events (id,stripe_event_id,event_type,livemode,payload_sha256,received_at,processing_result,order_id,expires_at,version,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?6,?6)`).bind(internalId("stripe_event",event.stripeEventId.replace(/^evt_/,"rr_")),event.stripeEventId,event.eventType,event.livemode?1:0,event.payloadSha256,now,resultCode,order.id,now+COMMERCE_RETENTION_MS),
      this.database.prepare(`UPDATE commerce_orders SET state=?1,stripe_checkout_session_id=coalesce(?2,stripe_checkout_session_id),stripe_payment_intent_id=coalesce(?3,stripe_payment_intent_id),paid_at=case when ?1='fulfilled' then coalesce(paid_at,?4) else paid_at end,fulfilled_at=case when ?1='fulfilled' then coalesce(fulfilled_at,?4) else fulfilled_at end,refunded_at=case when ?1='refunded' then coalesce(refunded_at,?4) else refunded_at end,disputed_at=case when ?1='disputed' then coalesce(disputed_at,?4) else disputed_at end,updated_at=?4 WHERE id=?5`).bind(state,event.checkoutSessionId,event.paymentIntentId,now,order.id),
    ];
    if (state === "fulfilled") statements.push(this.database.prepare(`INSERT OR IGNORE INTO commerce_entitlements (id,order_id,result_id,anonymous_owner_hash,product_key,state,granted_at,retention_expires_at,version,created_at,updated_at) SELECT 'commerce_entitlement_'||substr(id,16),id,result_id,anonymous_owner_hash,product_key,'active',?1,?2,1,?1,?1 FROM commerce_orders WHERE id=?3 AND state='fulfilled'`).bind(now,now+COMMERCE_RETENTION_MS,order.id));
    if (state === "refunded" || state === "disputed") statements.push(this.database.prepare("UPDATE commerce_entitlements SET state='revoked',revoked_at=coalesce(revoked_at,?1),updated_at=?1 WHERE order_id=?2 AND state='active'").bind(now,order.id));
    try { await this.database.batch(statements); } catch { const replay=await this.database.prepare("SELECT 1 found FROM stripe_webhook_events WHERE stripe_event_id=?1").bind(event.stripeEventId).first(); if(replay)return Object.freeze({replay:true,state}); throw new CommerceValidationError("webhook_processing_failed"); }
    return Object.freeze({ replay:false,state });
  }
  async retainExpired(now:number,limit:number,authorized:boolean){if(!authorized||!Number.isInteger(limit)||limit<1||limit>500)return fail("retention_not_authorized");const result=await this.database.prepare("DELETE FROM stripe_webhook_events WHERE id IN (SELECT id FROM stripe_webhook_events WHERE expires_at<=?1 ORDER BY expires_at LIMIT ?2)").bind(now,limit).run();return Number(result.meta?.changes||0);}
}

export function createReviewCommerceConfig(): CommerceConfiguration { return Object.freeze({ publicPaymentLinkUrl:"https://buy.stripe.com/test_royal_reveal_review",expectedPaymentLinkId:"plink_review_royal_reveal",webhookSigningSecret:"whsec_review_only_not_a_real_secret_123",expectedProductKey:ROYAL_REVEAL_PRODUCT_KEY,expectedAmountMinor:ROYAL_REVEAL_AMOUNT_MINOR,expectedCurrency:ROYAL_REVEAL_CURRENCY,expectedLivemode:false }); }
