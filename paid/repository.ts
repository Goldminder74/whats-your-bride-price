import { isProductKey, products, type ProductKey } from "./catalog.ts";
import { PaidError } from "./errors.ts";

export type OrderState = "pending" | "fulfilled" | "refunded" | "review_required" | "failed";
export type ReceiptStatus = "pending" | "sent" | "failed" | "skipped";

export type PaidOrder = {
  id: string;
  idempotencyKey: string;
  productKey: ProductKey;
  playerId: string;
  email: string;
  residenceCountry: string;
  baseCurrency: "gbp";
  baseAmountMinor: number;
  waiverVersion: string | null;
  waiverAcceptedAt: number | null;
  adultConfirmed: true;
  state: OrderState;
  checkoutSessionId: string | null;
  checkoutUrl: string | null;
  paymentIntentId: string | null;
  presentmentCurrency: string | null;
  presentmentAmountMinor: number | null;
  receiptStatus: ReceiptStatus;
  receiptId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PaidEntitlement = {
  id: string;
  orderId: string;
  playerId: string;
  productKey: ProductKey;
  quantity: number;
  remaining: number;
  state: "active" | "revoked";
  createdAt: number;
  updatedAt: number;
};

export interface PaidRepository {
  createPending(order: PaidOrder): Promise<PaidOrder>;
  attachSession(orderId: string, sessionId: string, url: string): Promise<void>;
  getById(id: string): Promise<PaidOrder | null>;
  getBySession(sessionId: string): Promise<PaidOrder | null>;
  getByPaymentIntent(paymentIntentId: string): Promise<PaidOrder | null>;
  claimEvent(eventId: string, eventType: string, orderId: string | null, at: number): Promise<boolean>;
  releaseEvent(eventId: string): Promise<void>;
  fulfill(orderId: string, payment: { paymentIntentId: string; currency: string; amountMinor: number; at: number }): Promise<PaidEntitlement | null>;
  markReceipt(orderId: string, status: "sent" | "failed", receiptId: string | null): Promise<void>;
  refundFull(orderId: string, at: number): Promise<PaidOrder | null>;
  markReview(orderId: string, at: number, revoke: boolean): Promise<PaidOrder | null>;
  failPending(orderId: string, at: number): Promise<void>;
  entitlementForOrder(orderId: string): Promise<PaidEntitlement | null>;
  /** Active Cowries and Royal Reveal for a player. This is the balance ledger. */
  accessForPlayer(playerId: string): Promise<{ cowries: number; royal: boolean }>;
  /** Remove Cowries from active entitlements. Returns null when D1 has too few. */
  spendCowries(playerId: string, count: number, at: number): Promise<{ cowries: number; royal: boolean } | null>;
}

function sameRequest(existing: PaidOrder, incoming: PaidOrder): boolean {
  return existing.playerId === incoming.playerId
    && existing.productKey === incoming.productKey
    && existing.email === incoming.email
    && existing.residenceCountry === incoming.residenceCountry
    && existing.baseAmountMinor === incoming.baseAmountMinor;
}

export function createMemoryRepository(): PaidRepository {
  const orders = new Map<string, PaidOrder>();
  const byIdempotency = new Map<string, string>();
  const bySession = new Map<string, string>();
  const byPayment = new Map<string, string>();
  const events = new Map<string, { eventType: string; orderId: string | null }>();
  const entitlements = new Map<string, PaidEntitlement>();

  function must(id: string): PaidOrder {
    const order = orders.get(id);
    if (!order) throw new PaidError("order_unavailable", 404);
    return order;
  }

  return {
    async createPending(order) {
      if (!isProductKey(order.productKey)) throw new PaidError("product_invalid", 400);
      const existingId = byIdempotency.get(order.idempotencyKey);
      if (existingId) {
        const existing = must(existingId);
        if (!sameRequest(existing, order)) throw new PaidError("idempotency_conflict", 409);
        return existing;
      }
      const stored = { ...order };
      orders.set(order.id, stored);
      byIdempotency.set(order.idempotencyKey, order.id);
      return stored;
    },
    async attachSession(orderId, sessionId, url) {
      const order = must(orderId);
      if (order.checkoutSessionId && order.checkoutSessionId !== sessionId) throw new PaidError("checkout_session_conflict", 409);
      order.checkoutSessionId = sessionId;
      order.checkoutUrl = url;
      bySession.set(sessionId, order.id);
    },
    async getById(id) {
      const order = orders.get(id);
      return order ? { ...order } : null;
    },
    async getBySession(sessionId) {
      const id = bySession.get(sessionId);
      return id ? { ...must(id) } : null;
    },
    async getByPaymentIntent(paymentIntentId) {
      const id = byPayment.get(paymentIntentId);
      return id ? { ...must(id) } : null;
    },
    async claimEvent(eventId, eventType, orderId, at) {
      if (events.has(eventId)) return false;
      events.set(eventId, { eventType, orderId });
      void at;
      return true;
    },
    async releaseEvent(eventId) {
      events.delete(eventId);
    },
    async fulfill(orderId, payment) {
      const order = must(orderId);
      if (order.state === "fulfilled") return entitlements.get(orderId) ?? null;
      if (order.state !== "pending") return null;
      order.state = "fulfilled";
      order.paymentIntentId = payment.paymentIntentId;
      order.presentmentCurrency = payment.currency;
      order.presentmentAmountMinor = payment.amountMinor;
      order.updatedAt = payment.at;
      byPayment.set(payment.paymentIntentId, order.id);
      const product = products[order.productKey];
      const entitlement: PaidEntitlement = {
        id: `ent_${order.id}`,
        orderId: order.id,
        playerId: order.playerId,
        productKey: order.productKey,
        quantity: product.quantity,
        remaining: product.quantity,
        state: "active",
        createdAt: payment.at,
        updatedAt: payment.at,
      };
      entitlements.set(order.id, entitlement);
      return entitlement;
    },
    async markReceipt(orderId, status, receiptId) {
      const order = must(orderId);
      order.receiptStatus = status;
      order.receiptId = receiptId;
    },
    async refundFull(orderId, at) {
      const order = must(orderId);
      if (order.state === "refunded") return order;
      if (order.state !== "fulfilled" && order.state !== "review_required") return null;
      order.state = "refunded";
      order.updatedAt = at;
      const entitlement = entitlements.get(orderId);
      if (entitlement) {
        entitlement.state = "revoked";
        entitlement.remaining = 0;
        entitlement.updatedAt = at;
      }
      return { ...order };
    },
    async markReview(orderId, at, revoke) {
      const order = must(orderId);
      if (order.state === "refunded") return order;
      order.state = "review_required";
      order.updatedAt = at;
      if (revoke) {
        const entitlement = entitlements.get(orderId);
        if (entitlement) {
          entitlement.state = "revoked";
          entitlement.remaining = 0;
          entitlement.updatedAt = at;
        }
      }
      return { ...order };
    },
    async failPending(orderId, at) {
      const order = must(orderId);
      if (order.state === "pending") {
        order.state = "failed";
        order.updatedAt = at;
      }
    },
    async entitlementForOrder(orderId) {
      const entitlement = entitlements.get(orderId);
      return entitlement ? { ...entitlement } : null;
    },
    async accessForPlayer(playerId) {
      return accessFromEntitlements([...entitlements.values()].filter((entitlement) => entitlement.playerId === playerId));
    },
    async spendCowries(playerId, count, at) {
      assertSpendCount(count);
      const rows = [...entitlements.values()]
        .filter((entitlement) => entitlement.playerId === playerId && entitlement.state === "active" && products[entitlement.productKey].kind === "cowries" && entitlement.remaining > 0)
        .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
      const total = rows.reduce((sum, entitlement) => sum + entitlement.remaining, 0);
      if (total < count) return null;
      let left = count;
      for (const entitlement of rows) {
        const take = Math.min(entitlement.remaining, left);
        entitlement.remaining -= take;
        entitlement.updatedAt = at;
        left -= take;
        if (left === 0) break;
      }
      return accessFromEntitlements([...entitlements.values()].filter((entitlement) => entitlement.playerId === playerId));
    },
  };
}

export function assertSpendCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 1 || count > 40) throw new PaidError("spend_invalid", 400);
}

export function accessFromEntitlements(rows: readonly PaidEntitlement[]): { cowries: number; royal: boolean } {
  let cowries = 0;
  let royal = false;
  for (const entitlement of rows) {
    if (entitlement.state !== "active") continue;
    const product = products[entitlement.productKey];
    if (product.kind === "cowries") cowries += entitlement.remaining;
    if (product.kind === "royal_reveal" && entitlement.remaining > 0) royal = true;
  }
  return { cowries, royal };
}
