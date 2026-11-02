import { isProductKey, products, FREE_COMPLETED_GAMES, GAME_COST_COWRIES, WELCOME_BONUS_COWRIES, WELCOME_BONUS_MS, type ProductKey } from "./catalog.ts";
import { createMemoryDaily, type DailyApi } from "./dailyStore.ts";
import { earnDay, NEW_PLAYER_BONUS, newReferralCode, PERFECT_BONUS, PERFECT_DAILY_CAP, REFERRAL_DAILY_CAP, REFERRER_BONUS, SHARE_BONUS } from "./earn.ts";
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

export type EarnReason = "granted" | "repeat" | "capped" | "self" | "not_new" | "unknown" | "ineligible" | "recorded";
export type EarnDecision = { ok: boolean; reason: EarnReason; cowries: number };

export type EarnKind = "perfect" | "share" | "referral_referrer" | "referral_new";

type EarnGrant = {
  grantId: string;
  playerId: string;
  kind: EarnKind;
  day: string;
  attemptId: string | null;
  relatedPlayerId: string | null;
  cowries: number;
  createdAt: number;
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
  /** Stable referral code for this browser owner. */
  ensureReferralCode(playerId: string, at: number): Promise<{ code: string }>;
  /** Remember that a new owner arrived through a code. Does not pay anyone yet. */
  recordReferralArrival(input: { playerId: string; code: string; at: number }): Promise<EarnDecision>;
  /** Pay the referrer and the new owner once that owner finishes their first game. */
  claimReferralRewards(playerId: string, at: number): Promise<{ player: EarnDecision; referrer: EarnDecision } | null>;
  /** +1 after a server-verified 12/12 on a completed attempt. Once per attempt, once per day. */
  grantPerfect(input: { playerId: string; attemptId: string; edition: string; at: number }): Promise<EarnDecision>;
  /** +1 for a result share. Once per day, and only after at least one completed game. */
  grantShare(input: { playerId: string; at: number }): Promise<EarnDecision>;
  findReferralCode(code: string): Promise<string | null>;
  daily: DailyApi;
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
  const grants: EarnGrant[] = [];
  const referralCodes = new Map<string, string>();
  const codeOwners = new Map<string, string>();
  const arrivals = new Map<string, { referrerPlayerId: string; code: string; rewarded: boolean }>();

  function spendRank(productKey: ProductKey): number {
    if (productKey === "cowrie_welcome_v1") return 0;
    if (productKey === "cowrie_earn_v1") return 1;
    return 2;
  }

  function creditEarn(playerId: string, grantId: string, cowries: number, at: number) {
    if (cowries < 1 || entitlements.has(`earn_${grantId}`)) return;
    const entitlement: PaidEntitlement = {
      id: `earn_${grantId}`,
      orderId: `earn_${grantId}`,
      playerId,
      productKey: "cowrie_earn_v1",
      quantity: cowries,
      remaining: cowries,
      state: "active",
      expiresAt: null,
      createdAt: at,
      updatedAt: at,
    };
    entitlements.set(entitlement.orderId, entitlement);
  }

  function putGrant(grant: EarnGrant, at: number): boolean {
    if (grants.some((row) => row.grantId === grant.grantId)) return false;
    if (grant.kind === "perfect" && grant.attemptId && grants.some((row) => row.kind === "perfect" && row.attemptId === grant.attemptId)) return false;
    if (grant.kind === "perfect" && grant.cowries > 0 && grants.some((row) => row.kind === "perfect" && row.playerId === grant.playerId && row.day === grant.day && row.cowries > 0)) return false;
    if (grant.kind === "share" && grants.some((row) => row.kind === "share" && row.playerId === grant.playerId && row.day === grant.day)) return false;
    grants.push(grant);
    creditEarn(grant.playerId, grant.grantId, grant.cowries, at);
    return true;
  }

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
        .sort((left, right) => spendRank(left.productKey) - spendRank(right.productKey) || left.createdAt - right.createdAt || left.id.localeCompare(right.id));
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
    async ensureReferralCode(playerId, at) {
      const existing = referralCodes.get(playerId);
      if (existing) return { code: existing };
      let code = newReferralCode();
      for (let attempt = 0; attempt < 5 && codeOwners.has(code); attempt += 1) code = newReferralCode();
      if (codeOwners.has(code)) throw new PaidError("referral_unavailable", 503);
      referralCodes.set(playerId, code);
      codeOwners.set(code, playerId);
      void at;
      return { code };
    },
    async findReferralCode(code) {
      return codeOwners.get(code) ?? null;
    },
    async recordReferralArrival({ playerId, code, at }) {
      const referrer = codeOwners.get(code);
      if (!referrer) return { ok: false, reason: "unknown", cowries: 0 };
      if (referrer === playerId) return { ok: false, reason: "self", cowries: 0 };
      const record = player(playerId, at);
      if (record.completedGames > 0) return { ok: false, reason: "not_new", cowries: 0 };
      if (arrivals.has(playerId)) return { ok: false, reason: "repeat", cowries: 0 };
      arrivals.set(playerId, { referrerPlayerId: referrer, code, rewarded: false });
      return { ok: true, reason: "recorded", cowries: 0 };
    },
    async claimReferralRewards(playerId, at) {
      const arrival = arrivals.get(playerId);
      if (!arrival || arrival.rewarded) return null;
      if (arrival.referrerPlayerId === playerId) {
        arrival.rewarded = true;
        return {
          player: { ok: false, reason: "self", cowries: 0 },
          referrer: { ok: false, reason: "self", cowries: 0 },
        };
      }
      const day = earnDay(at);
      const playerGrant: EarnGrant = {
        grantId: `referral_new:${playerId}`,
        playerId,
        kind: "referral_new",
        day,
        attemptId: null,
        relatedPlayerId: arrival.referrerPlayerId,
        cowries: NEW_PLAYER_BONUS,
        createdAt: at,
      };
      const playerInserted = putGrant(playerGrant, at);
      const referrerCount = grants.filter((row) => row.kind === "referral_referrer" && row.playerId === arrival.referrerPlayerId && row.day === day && row.cowries > 0).length;
      let referrer: EarnDecision;
      if (referrerCount >= REFERRAL_DAILY_CAP) {
        referrer = { ok: false, reason: "capped", cowries: 0 };
      } else {
        const referrerGrant: EarnGrant = {
          grantId: `referral_referrer:${playerId}`,
          playerId: arrival.referrerPlayerId,
          kind: "referral_referrer",
          day,
          attemptId: null,
          relatedPlayerId: playerId,
          cowries: REFERRER_BONUS,
          createdAt: at,
        };
        const inserted = putGrant(referrerGrant, at);
        referrer = inserted
          ? { ok: true, reason: "granted", cowries: REFERRER_BONUS }
          : { ok: false, reason: "repeat", cowries: 0 };
      }
      arrival.rewarded = true;
      return {
        player: playerInserted
          ? { ok: true, reason: "granted", cowries: NEW_PLAYER_BONUS }
          : { ok: false, reason: "repeat", cowries: 0 },
        referrer,
      };
    },
    async grantPerfect({ playerId, attemptId, edition, at }) {
      const attempt = attempts.get(attemptId);
      if (!attempt || attempt.playerId !== playerId || attempt.edition !== edition) throw new PaidError("attempt_unavailable", 404);
      if (attempt.state !== "completed") throw new PaidError("attempt_open", 409);
      const day = earnDay(at);
      const existing = grants.find((row) => row.kind === "perfect" && row.attemptId === attemptId);
      if (existing) return { ok: false, reason: existing.cowries > 0 ? "repeat" : "capped", cowries: 0 };
      const grantedToday = grants.filter((row) => row.kind === "perfect" && row.playerId === playerId && row.day === day && row.cowries > 0).length;
      const cowries = grantedToday >= PERFECT_DAILY_CAP ? 0 : PERFECT_BONUS;
      const inserted = putGrant({
        grantId: `perfect:${attemptId}`,
        playerId,
        kind: "perfect",
        day,
        attemptId,
        relatedPlayerId: null,
        cowries,
        createdAt: at,
      }, at);
      if (!inserted) return { ok: false, reason: "repeat", cowries: 0 };
      return cowries > 0
        ? { ok: true, reason: "granted", cowries }
        : { ok: false, reason: "capped", cowries: 0 };
    },
    async grantShare({ playerId, at }) {
      const record = players.get(playerId);
      if (!record || record.completedGames < 1) return { ok: false, reason: "ineligible", cowries: 0 };
      const day = earnDay(at);
      const existing = grants.find((row) => row.kind === "share" && row.playerId === playerId && row.day === day);
      if (existing) return { ok: false, reason: "repeat", cowries: 0 };
      const inserted = putGrant({
        grantId: `share:${playerId}:${day}`,
        playerId,
        kind: "share",
        day,
        attemptId: null,
        relatedPlayerId: null,
        cowries: SHARE_BONUS,
        createdAt: at,
      }, at);
      if (!inserted) return { ok: false, reason: "repeat", cowries: 0 };
      return { ok: true, reason: "granted", cowries: SHARE_BONUS };
    },
    daily: createMemoryDaily((playerId, grantId, cowries, at) => creditEarn(playerId, grantId, cowries, at)),
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
