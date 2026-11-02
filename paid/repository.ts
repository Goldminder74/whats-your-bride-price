import { isProductKey, products, FREE_COMPLETED_GAMES, GAME_COST_COWRIES, WELCOME_BONUS_COWRIES, WELCOME_BONUS_MS, type ProductKey } from "./catalog.ts";
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
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type GameAttempt = {
  attemptId: string;
  playerId: string;
  edition: string;
  mode: "free" | "paid";
  state: "open" | "completed";
  cowriesSpent: number;
  createdAt: number;
  completedAt: number | null;
};

export type PlayerWallet = {
  cowries: number;
  royal: boolean;
  completedGames: number;
  freeGamesLeft: number;
  openAttempt: { attemptId: string; edition: string; mode: "free" | "paid" } | null;
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
  accessForPlayer(playerId: string, at?: number): Promise<{ cowries: number; royal: boolean }>;
  wallet(playerId: string, at: number): Promise<PlayerWallet>;
  beginAttempt(input: { playerId: string; attemptId: string; edition: string; at: number }): Promise<{ granted: true; attempt: GameAttempt; resumed: boolean; wallet: PlayerWallet } | { granted: false; wallet: PlayerWallet }>;
  finishAttempt(input: { playerId: string; attemptId: string; at: number }): Promise<{ wallet: PlayerWallet; showPaywall: boolean; already: boolean }>;
  recordStat(event: string, detail: string, at: number): Promise<void>;
  listStats(sinceDay: string): Promise<{ day: string; event: string; detail: string; count: number }[]>;
  /** Remove Cowries from active entitlements. Returns null when D1 has too few. */
  spendCowries(playerId: string, count: number, at: number): Promise<{ cowries: number; royal: boolean } | null>;
  /** Close a pending order without creating an entitlement, after the charge is refunded. */
  refundUnfulfilled(orderId: string, at: number): Promise<PaidOrder | null>;
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
  const players = new Map<string, { completedGames: number; welcomeGranted: boolean; createdAt: number }>();
  const attempts = new Map<string, GameAttempt>();
  const stats = new Map<string, { day: string; event: string; detail: string; count: number }>();

  function player(playerId: string, at: number) {
    const existing = players.get(playerId);
    if (existing) return existing;
    const created = { completedGames: 0, welcomeGranted: false, createdAt: at };
    players.set(playerId, created);
    return created;
  }

  function walletOf(playerId: string, at: number): PlayerWallet {
    const access = accessFromEntitlements([...entitlements.values()].filter((entitlement) => entitlement.playerId === playerId), at);
    const record = player(playerId, at);
    const open = [...attempts.values()].find((attempt) => attempt.playerId === playerId && attempt.state === "open") ?? null;
    return {
      ...access,
      completedGames: record.completedGames,
      freeGamesLeft: Math.max(0, FREE_COMPLETED_GAMES - record.completedGames),
      openAttempt: open ? { attemptId: open.attemptId, edition: open.edition, mode: open.mode } : null,
    };
  }

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
        expiresAt: null,
        createdAt: payment.at,
        updatedAt: payment.at,
      };
      entitlements.set(order.id, entitlement);
      const record = player(order.playerId, payment.at);
      if (!record.welcomeGranted) {
        record.welcomeGranted = true;
        const bonus: PaidEntitlement = {
          id: `bonus_${order.id}`,
          orderId: `bonus_${order.id}`,
          playerId: order.playerId,
          productKey: "cowrie_welcome_v1",
          quantity: WELCOME_BONUS_COWRIES,
          remaining: WELCOME_BONUS_COWRIES,
          state: "active",
          expiresAt: payment.at + WELCOME_BONUS_MS,
          createdAt: payment.at,
          updatedAt: payment.at,
        };
        entitlements.set(bonus.orderId, bonus);
      }
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
      const bonus = entitlements.get(`bonus_${orderId}`);
      if (bonus) {
        bonus.state = "revoked";
        bonus.remaining = 0;
        bonus.updatedAt = at;
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
    async accessForPlayer(playerId, at = Date.now()) {
      return accessFromEntitlements([...entitlements.values()].filter((entitlement) => entitlement.playerId === playerId), at);
    },
    async wallet(playerId, at) {
      return walletOf(playerId, at);
    },
    async beginAttempt({ playerId, attemptId, edition, at }) {
      const record = player(playerId, at);
      const existing = attempts.get(attemptId);
      if (existing) {
        if (existing.playerId !== playerId) throw new PaidError("attempt_conflict", 409);
        return { granted: true, attempt: existing, resumed: true, wallet: walletOf(playerId, at) };
      }
      const open = [...attempts.values()].find((attempt) => attempt.playerId === playerId && attempt.state === "open");
      if (open) return { granted: true, attempt: open, resumed: true, wallet: walletOf(playerId, at) };
      if (record.completedGames < FREE_COMPLETED_GAMES) {
        const attempt: GameAttempt = { attemptId, playerId, edition, mode: "free", state: "open", cowriesSpent: 0, createdAt: at, completedAt: null };
        attempts.set(attemptId, attempt);
        return { granted: true, attempt, resumed: false, wallet: walletOf(playerId, at) };
      }
      const spent = await this.spendCowries(playerId, GAME_COST_COWRIES, at);
      if (!spent) return { granted: false, wallet: walletOf(playerId, at) };
      const attempt: GameAttempt = { attemptId, playerId, edition, mode: "paid", state: "open", cowriesSpent: GAME_COST_COWRIES, createdAt: at, completedAt: null };
      attempts.set(attemptId, attempt);
      return { granted: true, attempt, resumed: false, wallet: walletOf(playerId, at) };
    },
    async finishAttempt({ playerId, attemptId, at }) {
      const attempt = attempts.get(attemptId);
      if (!attempt || attempt.playerId !== playerId) throw new PaidError("attempt_unavailable", 404);
      if (attempt.state === "completed") return { wallet: walletOf(playerId, at), showPaywall: false, already: true };
      attempt.state = "completed";
      attempt.completedAt = at;
      const record = player(playerId, at);
      record.completedGames += 1;
      return { wallet: walletOf(playerId, at), showPaywall: record.completedGames === FREE_COMPLETED_GAMES, already: false };
    },
    async recordStat(event, detail, at) {
      const day = new Date(at).toISOString().slice(0, 10);
      const key = `${day}|${event}|${detail}`;
      const current = stats.get(key) ?? { day, event, detail, count: 0 };
      current.count += 1;
      stats.set(key, current);
    },
    async listStats(sinceDay) {
      return [...stats.values()].filter((row) => row.day >= sinceDay).sort((left, right) => left.day.localeCompare(right.day) || left.event.localeCompare(right.event));
    },
    async spendCowries(playerId, count, at) {
      assertSpendCount(count);
      const rows = [...entitlements.values()]
        .filter((entitlement) => entitlement.playerId === playerId && entitlement.state === "active" && products[entitlement.productKey].kind === "cowries" && entitlement.remaining > 0 && (entitlement.expiresAt === null || entitlement.expiresAt > at))
        .sort((left, right) => Number(left.productKey !== "cowrie_welcome_v1") - Number(right.productKey !== "cowrie_welcome_v1") || left.createdAt - right.createdAt || left.id.localeCompare(right.id));
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
      return accessFromEntitlements([...entitlements.values()].filter((entitlement) => entitlement.playerId === playerId), at);
    },
    async refundUnfulfilled(orderId, at) {
      const order = must(orderId);
      if (order.state === "refunded") return { ...order };
      if (order.state !== "pending") return null;
      order.state = "refunded";
      order.updatedAt = at;
      return { ...order };
    },
  };
}

export function assertSpendCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 1 || count > 40) throw new PaidError("spend_invalid", 400);
}

export function accessFromEntitlements(rows: readonly PaidEntitlement[], at = Date.now()): { cowries: number; royal: boolean } {
  let cowries = 0;
  let royal = false;
  for (const entitlement of rows) {
    if (entitlement.state !== "active") continue;
    if (entitlement.expiresAt !== null && entitlement.expiresAt <= at) continue;
    const product = products[entitlement.productKey];
    if (product.kind === "cowries") cowries += entitlement.remaining;
    if (product.kind === "royal_reveal" && entitlement.remaining > 0) royal = true;
  }
  return { cowries, royal };
}
