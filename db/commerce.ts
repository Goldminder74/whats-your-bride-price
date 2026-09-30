import type { RegionKey } from "../app/gameData.ts";
import type { AtomicD1Database } from "./repositories.ts";
import { cowrieProducts, cowrieProductKeys, isCowrieProduct, COWRIE_DELIVERY_NOTICE_VERSION, type CommerceProductKey, type CowrieProductKey } from "./cowrieProducts.ts";
import { D1QuestionSelectionRepository } from "./questionSelection.ts";
import { processCommerceWebhook } from "./commerceWebhook.ts";
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
  deriveCowrieOrderIdempotencyHash,
  requireVerifiedStripeEvent,
  securePublicOrderReference,
  validateCommerceConfiguration,
  validateStartOrderRequest,
  type CommerceConfiguration,
  type VerifiedStripeEvent,
  type CowrieStartOrderRequest,
} from "./commerceContracts.ts";

export type CommerceOrderState = "pending" | "processing" | "paid" | "fulfilled" | "failed" | "refunded" | "disputed" | "expired" | "deleted" | "review_required";
export type CommerceOwnedResult = Readonly<{
  id: string; publicSlug: string; edition: RegionKey; score: number; total: number; resultTitle: string; avatarId: string;
  state: string; expiresAt: number | null; attemptStatus: string; attemptCompletedAt: number | null; attemptExpiresAt: number | null; anonymousOwnerHash: string | null;
}>;
export type CommerceOrder = Readonly<{
  id: string; publicOrderReference: string; resultId: string | null; anonymousOwnerHash: string; state: CommerceOrderState;
  clientReferenceId: string; stripePaymentLinkId: string; stripeCheckoutSessionId: string | null; stripePaymentIntentId: string | null;
  pendingExpiresAt: number; paidAt: number | null; fulfilledAt: number | null; refundedAt: number | null; disputedAt: number | null;
  productKey?: CommerceProductKey; cowrieWalletId?: string | null; stripePaymentIntentHash?: string | null; amountMinor?: number;
}>;
export type CommerceOwnedWallet = Readonly<{ id: string; publicReference: string; anonymousOwnerHash: string; state: string; purchasedBalance: number; bonusBalance: number }>;
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
  getWalletByReference?(reference: string): Promise<CommerceOwnedWallet | null>;
  getWalletById?(id: string): Promise<CommerceOwnedWallet | null>;
  getEligibleRegionCounts?(now: number): Promise<Readonly<Record<RegionKey, number>>>;
  createPendingCowrieOrder?(input: Readonly<{ id: string; publicOrderReference: string; wallet: CommerceOwnedWallet; ownerHash: string; idempotencyHash: string; paymentLinkId: string; productKey: CowrieProductKey; now: number }>): Promise<CommerceOrder>;
  getLegacyPaymentIntentReference?(raw: string): Promise<string | null>;
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
  private readonly cowriePurchasesEnabled: boolean;
  constructor(repository: CommerceRepository, rateLimiter: CommerceRateLimiter, config: unknown, now: () => number = Date.now, options: Readonly<{ cowriePurchasesEnabled?: boolean }> = {}) {
    this.repository = repository;
    this.rateLimiter = rateLimiter;
    this.now = now;
    this.config = validateCommerceConfiguration(config);
    this.cowriePurchasesEnabled = options.cowriePurchasesEnabled === true;
  }
  private async authorize(rawCredential: unknown): Promise<Readonly<{ ownerHash: string; now: number }>> {
    if (!this.repository.storageAvailable) return fail("commerce_storage_unavailable");
    const ownerHash = await deriveCommerceOwnerHash(rawCredential); const now = this.now(); const decision = await this.rateLimiter.consume(ownerHash, now);
    if (decision === "limited") return fail("commerce_rate_limited"); if (decision !== "allowed") return fail("commerce_rate_limit_unavailable");
    return Object.freeze({ ownerHash, now });
  }
  async startOrder(value: unknown): Promise<Readonly<{ publicOrderReference: string; paymentLinkUrl: string; productKey: CommerceProductKey; displayPrice: string; quantity?: number; pendingExpiresAt: number; state?: "pending" }>> {
    const request = validateStartOrderRequest(value);
    if (request.productKey !== ROYAL_REVEAL_PRODUCT_KEY) return this.startCowrieOrder(request);
    const { ownerHash, now } = await this.authorize(request.anonymousSessionCredential);
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
  private async purchaseWallet(reference: string, ownerHash: string, now: number): Promise<CommerceOwnedWallet> {
    if (!this.cowriePurchasesEnabled || !this.config.cowrieBundles || !this.repository.getEligibleRegionCounts || !this.repository.getWalletByReference) return fail("cowrie_purchase_unavailable");
    const counts = await this.repository.getEligibleRegionCounts(now);
    if (!["west","east","central","north","south"].every(region=>counts[region as RegionKey] >= 30)) return fail("cowrie_purchase_unavailable");
    const wallet = await this.repository.getWalletByReference(reference);
    if (!wallet || wallet.state !== "active" || !constantTimeOwnerMatch(wallet.anonymousOwnerHash, ownerHash)) return fail("wallet_unavailable");
    return wallet;
  }
  async cowrieOffer(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "anonymousSessionCredential,walletReference") return fail("offer_request_invalid");
    const request = value as Record<string, unknown>;
    if (typeof request.walletReference !== "string" || !/^cw_[0-9a-f]{32}$/.test(request.walletReference)) return fail("wallet_unavailable");
    const {ownerHash,now} = await this.authorize(request.anonymousSessionCredential); const wallet = await this.purchaseWallet(request.walletReference,ownerHash,now);
    return Object.freeze({available:true,bundles:cowrieProductKeys.map(productKey=>Object.freeze({productKey,...cowrieProducts[productKey]})),wallet:Object.freeze({purchasedBalance:wallet.purchasedBalance,bonusBalance:wallet.bonusBalance,totalBalance:wallet.purchasedBalance+wallet.bonusBalance})});
  }
  private async startCowrieOrder(request: CowrieStartOrderRequest) {
    const {ownerHash,now} = await this.authorize(request.anonymousSessionCredential); const wallet = await this.purchaseWallet(request.walletReference,ownerHash,now);
    if (!this.repository.createPendingCowrieOrder) return fail("cowrie_purchase_unavailable");
    const bundle = this.config.cowrieBundles![request.productKey]; const product = cowrieProducts[request.productKey];
    const idempotencyHash = await deriveCowrieOrderIdempotencyHash({rawKey:request.idempotencyKey,ownerHash,walletId:wallet.id,productKey:request.productKey});
    let order = await this.repository.getOrderByIdempotencyHash(idempotencyHash);
    if (order && (order.cowrieWalletId !== wallet.id || order.productKey !== request.productKey || order.state !== "pending" || order.pendingExpiresAt <= now || !constantTimeOwnerMatch(order.anonymousOwnerHash,ownerHash))) return fail("order_conflict");
    if (!order) {const reference = securePublicOrderReference(); order = await this.repository.createPendingCowrieOrder({id:internalId("commerce_order",reference),publicOrderReference:reference,wallet,ownerHash,idempotencyHash,paymentLinkId:bundle.expectedPaymentLinkId,productKey:request.productKey,now});}
    return Object.freeze({publicOrderReference:order.publicOrderReference,productKey:request.productKey,quantity:product.quantity,displayPrice:product.displayPrice,paymentLinkUrl:constructPaymentLinkUrl(bundle.publicPaymentLinkUrl,order.clientReferenceId),pendingExpiresAt:order.pendingExpiresAt,state:"pending" as const});
  }
  async resolveLegacyPaymentIntent(raw: string) { return this.repository.getLegacyPaymentIntentReference?.(raw) ?? null; }
  async orderStatus(value: unknown): Promise<Readonly<{ state: CommerceOrderState; entitlementActive: boolean; productKey: CommerceProductKey; entitlement?: EntitlementProjection; quantity?: number; settlementCause?: "refund" | "dispute"; wallet?: Readonly<{ purchasedBalance: number; bonusBalance: number; totalBalance: number }> }>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("status_request_invalid");
    const candidate = value as Record<string, unknown>; if (Object.keys(candidate).sort().join(",") !== "anonymousSessionCredential,publicOrderReference") return fail("status_request_invalid");
    if (typeof candidate.publicOrderReference !== "string" || !/^rr_[0-9a-f]{32}$/.test(candidate.publicOrderReference)) return fail("order_unavailable");
    const { ownerHash, now } = await this.authorize(candidate.anonymousSessionCredential);
    const order = await this.repository.getOrderByReference(candidate.publicOrderReference); if (!order) return fail("order_unavailable");
    if (isCowrieProduct(order.productKey)) {
      const wallet = order.cowrieWalletId ? await this.repository.getWalletById?.(order.cowrieWalletId) : null;
      if (!wallet || wallet.state !== "active" || !constantTimeOwnerMatch(wallet.anonymousOwnerHash,ownerHash)) return fail("order_unavailable");
      return Object.freeze({state:order.state,entitlementActive:false,productKey:order.productKey,quantity:cowrieProducts[order.productKey].quantity,...(order.disputedAt?{settlementCause:"dispute" as const}:order.refundedAt?{settlementCause:"refund" as const}:{}),wallet:Object.freeze({purchasedBalance:wallet.purchasedBalance,bonusBalance:wallet.bonusBalance,totalBalance:wallet.purchasedBalance+wallet.bonusBalance})});
    }
    if (!constantTimeOwnerMatch(order.anonymousOwnerHash,ownerHash)) return fail("order_unavailable");
    const entitlement = await this.repository.getActiveEntitlementByResultId?.(order.resultId!, ownerHash, now);
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
    requireVerifiedStripeEvent(event);
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
  private readonly verifiedEvents = new Map<string, VerifiedStripeEvent>();
  readonly wallets = new Map<string,CommerceOwnedWallet>();
  eligibleRegionCounts: Record<RegionKey,number> = {west:0,east:0,north:0,central:0,south:0};
  async getWalletByReference(reference: string) { return [...this.wallets.values()].find(wallet=>wallet.publicReference===reference)||null; }
  async getWalletById(id: string) { return this.wallets.get(id)||null; }
  async getEligibleRegionCounts() { return this.eligibleRegionCounts; }
  async createPendingCowrieOrder(input: Readonly<{ id:string;publicOrderReference:string;wallet:CommerceOwnedWallet;ownerHash:string;idempotencyHash:string;paymentLinkId:string;productKey:CowrieProductKey;now:number }>) {
    const existing=await this.getOrderByIdempotencyHash(input.idempotencyHash);if(existing)return existing;
    const order: CommerceOrder = Object.freeze({id:input.id,publicOrderReference:input.publicOrderReference,resultId:null,cowrieWalletId:input.wallet.id,productKey:input.productKey,amountMinor:cowrieProducts[input.productKey].amountMinor,anonymousOwnerHash:input.ownerHash,state:'pending',clientReferenceId:input.publicOrderReference,stripePaymentLinkId:input.paymentLinkId,stripeCheckoutSessionId:null,stripePaymentIntentId:null,stripePaymentIntentHash:null,pendingExpiresAt:input.now+PENDING_ORDER_LIFETIME_MS,paidAt:null,fulfilledAt:null,refundedAt:null,disputedAt:null});this.orders.set(order.id,order);this.idempotency.set(input.idempotencyHash,order.id);return order;
  }
  async processVerifiedWebhook(event: VerifiedStripeEvent, now: number) {
    requireVerifiedStripeEvent(event);
    const prior=this.verifiedEvents.get(event.stripeEventId);if(prior && prior.payloadSha256!==event.payloadSha256)return fail('stripe_event_conflict');
    this.verifiedEvents.set(event.stripeEventId,event);this.events.add(event.stripeEventId);
    const current=[...this.orders.values()].find(order=>event.clientReferenceId?order.clientReferenceId===event.clientReferenceId:order.stripePaymentIntentHash===event.paymentIntentHash);
    if(!current) {if(event.eventType.startsWith('checkout.'))return fail('stripe_order_unavailable');return {replay:Boolean(prior),state:'processing' as const};}
    if(event.eventType.startsWith('checkout.')&&(event.paymentLinkId!==current.stripePaymentLinkId||event.amountTotal!==(current.amountMinor??199)))return fail('stripe_order_unavailable');
    const hash=event.paymentIntentHash||current.stripePaymentIntentHash;
    if(current.stripePaymentIntentHash&&event.paymentIntentHash&&current.stripePaymentIntentHash!==event.paymentIntentHash)return fail('stripe_order_unavailable');
    const adverse=[...this.verifiedEvents.values()].filter(value=>hash&&value.paymentIntentHash===hash);
    const dispute=adverse.some(value=>value.eventType==='charge.dispute.created');
    const full=adverse.some(value=>value.eventType==='charge.refunded'&&value.amountTotal===(current.amountMinor??199)&&value.amountRefunded===value.amountTotal);
    const partial=adverse.some(value=>value.eventType==='charge.refunded');
    let state:CommerceOrderState=current.state;
    if(!['expired','deleted'].includes(state)) {
      if(dispute||current.disputedAt)state='disputed';else if(full)state='refunded';else if(partial||state==='review_required'||current.refundedAt)state=state==='refunded'?'refunded':'review_required';else if(state==='fulfilled')state='fulfilled';else if(current.pendingExpiresAt<=now)state='expired';else if(event.paymentStatus==='paid')state='fulfilled';else if(event.eventType==='checkout.session.async_payment_failed')state='failed';else if(event.eventType==='checkout.session.completed'&&state!=='failed')state='processing';
    }
    this.orders.set(current.id,Object.freeze({...current,state,stripePaymentIntentHash:hash||null,stripeCheckoutSessionId:event.checkoutSessionId||current.stripeCheckoutSessionId,paidAt:state==='fulfilled'?current.paidAt||now:current.paidAt,fulfilledAt:state==='fulfilled'?current.fulfilledAt||now:current.fulfilledAt,refundedAt:full?current.refundedAt||now:current.refundedAt,disputedAt:dispute?current.disputedAt||now:current.disputedAt}));
    const result=current.resultId?await this.getOwnedCompletedResultById(current.resultId):null;
    if(result&&state==='fulfilled')this.entitlements.set(result.publicSlug+':'+current.anonymousOwnerHash,Object.freeze({active:true,productKey:ROYAL_REVEAL_PRODUCT_KEY,resultSlug:result.publicSlug,edition:result.edition,score:result.score,maximumScore:result.total,resultTitle:result.resultTitle,avatarId:result.avatarId}));
    if(result&&['refunded','disputed'].includes(state))this.entitlements.delete(result.publicSlug+':'+current.anonymousOwnerHash);
    return Object.freeze({replay:Boolean(prior),state});
  }
  async retainExpired(now: number, limit: number, authorized: boolean) { if (!authorized || !Number.isInteger(limit) || limit < 1 || limit > 500) return fail("retention_not_authorized"); let count = 0; for (const [id, order] of this.orders) if (count < limit && order.pendingExpiresAt <= now && order.state !== "fulfilled") { this.orders.delete(id); count += 1; } return count; }
}

type OwnedResultRow = Readonly<{ id: string; public_slug: string; edition_key: RegionKey; score: number; total: number; safe_avatar_id: string; state: string; expires_at: number | null; attempt_status: string; attempt_completed_at: number | null; attempt_expires_at: number | null; anonymous_subject_hash: string | null }>;
type OrderRow = Readonly<{ id: string; public_order_reference: string; result_id: string | null; cowrie_wallet_id: string | null; product_key: CommerceProductKey; amount_minor: number; stripe_payment_intent_hash: string | null; anonymous_owner_hash: string; state: CommerceOrderState; client_reference_id: string; stripe_payment_link_id: string; stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null; pending_expires_at: number; paid_at: number | null; fulfilled_at: number | null; refunded_at: number | null; disputed_at: number | null }>;
function orderFromRow(row: OrderRow): CommerceOrder { return Object.freeze({ productKey: row.product_key, amountMinor: row.amount_minor, cowrieWalletId: row.cowrie_wallet_id, stripePaymentIntentHash: row.stripe_payment_intent_hash, id: row.id, publicOrderReference: row.public_order_reference, resultId: row.result_id, anonymousOwnerHash: row.anonymous_owner_hash, state: row.state, clientReferenceId: row.client_reference_id, stripePaymentLinkId: row.stripe_payment_link_id, stripeCheckoutSessionId: row.stripe_checkout_session_id, stripePaymentIntentId: row.stripe_payment_intent_id, pendingExpiresAt: row.pending_expires_at, paidAt: row.paid_at, fulfilledAt: row.fulfilled_at, refundedAt: row.refunded_at, disputedAt: row.disputed_at }); }

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
  async getWalletByReference(reference: string): Promise<CommerceOwnedWallet|null> {
    const row=await this.database.prepare('SELECT id,public_reference,anonymous_owner_hash,state,purchased_balance,bonus_balance FROM cowrie_wallets WHERE public_reference=?1').bind(reference).first<{id:string;public_reference:string;anonymous_owner_hash:string;state:string;purchased_balance:number;bonus_balance:number}>();
    return row?Object.freeze({id:row.id,publicReference:row.public_reference,anonymousOwnerHash:row.anonymous_owner_hash,state:row.state,purchasedBalance:row.purchased_balance,bonusBalance:row.bonus_balance}):null;
  }
  async getWalletById(id:string) {const row=await this.database.prepare('SELECT public_reference FROM cowrie_wallets WHERE id=?1').bind(id).first<{public_reference:string}>();return row?this.getWalletByReference(row.public_reference):null;}
  async getEligibleRegionCounts(now:number):Promise<Readonly<Record<RegionKey,number>>> {
    const selection=new D1QuestionSelectionRepository(this.database);const counts={} as Record<RegionKey,number>;for(const region of ['west','east','north','central','south'] as const){const candidates=await selection.getCandidates(region,now);counts[region]=new Set(candidates.map(question=>question.stableId)).size;}return counts;
  }
  async getLegacyPaymentIntentReference(raw:string) {const row=await this.database.prepare('SELECT public_order_reference FROM commerce_orders WHERE stripe_payment_intent_id=?1').bind(raw).first<{public_order_reference:string}>();return row?.public_order_reference||null;}
  async createPendingCowrieOrder(input: Readonly<{ id:string;publicOrderReference:string;wallet:CommerceOwnedWallet;ownerHash:string;idempotencyHash:string;paymentLinkId:string;productKey:CowrieProductKey;now:number }>) {
    await this.database.prepare("INSERT INTO commerce_orders(id,public_order_reference,product_key,cowrie_wallet_id,anonymous_owner_hash,currency,amount_minor,state,client_reference_id,stripe_payment_link_id,consent_notice_version,immediate_delivery_consent_at,pending_expires_at,retention_expires_at,idempotency_hash,version,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,'GBP',?6,'pending',?2,?7,?8,?9,?10,?11,?12,1,?9,?9) ON CONFLICT(idempotency_hash) DO NOTHING").bind(input.id,input.publicOrderReference,input.productKey,input.wallet.id,input.ownerHash,cowrieProducts[input.productKey].amountMinor,input.paymentLinkId,COWRIE_DELIVERY_NOTICE_VERSION,input.now,input.now+PENDING_ORDER_LIFETIME_MS,input.now+COMMERCE_RETENTION_MS,input.idempotencyHash).run();const order=await this.getOrderByIdempotencyHash(input.idempotencyHash);if(!order)return fail('order_persistence_failed');return order;
  }
  async getActiveEntitlement(resultSlug: string, ownerHash: string, now: number): Promise<EntitlementProjection | null> {
    const row = await this.database.prepare(`SELECT ce.result_id FROM commerce_entitlements ce JOIN results r ON r.id=ce.result_id WHERE r.public_slug=?1 AND ce.anonymous_owner_hash=?2 AND ce.product_key='royal_reveal_v1' AND ce.state='active' AND ce.deleted_at IS NULL AND (ce.expires_at IS NULL OR ce.expires_at>?3) LIMIT 1`).bind(resultSlug,ownerHash,now).first<{ result_id: string }>();
    const result = row ? await this.getOwnedCompletedResult(resultSlug) : null; return result ? Object.freeze({ active:true,productKey:ROYAL_REVEAL_PRODUCT_KEY,resultSlug:result.publicSlug,edition:result.edition,score:result.score,maximumScore:result.total,resultTitle:result.resultTitle,avatarId:result.avatarId }) : null;
  }
  async getActiveEntitlementByResultId(resultId: string, ownerHash: string, now: number) { const result=await this.getOwnedCompletedResultById(resultId); return result?this.getActiveEntitlement(result.publicSlug,ownerHash,now):null; }
  async processVerifiedWebhook(event: VerifiedStripeEvent, now: number) { return processCommerceWebhook(this.database,event,now); }
  async retainExpired(now:number,limit:number,authorized:boolean){if(!authorized||!Number.isInteger(limit)||limit<1||limit>500)return fail("retention_not_authorized");const result=await this.database.prepare("DELETE FROM stripe_webhook_events WHERE id IN (SELECT id FROM stripe_webhook_events WHERE expires_at<=?1 ORDER BY expires_at LIMIT ?2)").bind(now,limit).run();return Number(result.meta?.changes||0);}
}

export function createReviewCommerceConfig(): CommerceConfiguration { return Object.freeze({ publicPaymentLinkUrl:"https://buy.stripe.com/test_royal_reveal_review",expectedPaymentLinkId:"plink_review_royal_reveal",webhookSigningSecret:"whsec_review_only_not_a_real_secret_123",expectedProductKey:ROYAL_REVEAL_PRODUCT_KEY,expectedAmountMinor:ROYAL_REVEAL_AMOUNT_MINOR,expectedCurrency:ROYAL_REVEAL_CURRENCY,expectedLivemode:false }); }
