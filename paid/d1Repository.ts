import { isProductKey, products, FREE_COMPLETED_GAMES, GAME_COST_COWRIES, WELCOME_BONUS_COWRIES, WELCOME_BONUS_MS, type ProductKey } from "./catalog.ts";
import { earnDay, NEW_PLAYER_BONUS, newReferralCode, PERFECT_BONUS, PERFECT_DAILY_CAP, REFERRAL_DAILY_CAP, REFERRER_BONUS, SHARE_BONUS } from "./earn.ts";
import { PaidError } from "./errors.ts";
import { assertSpendCount, accessFromEntitlements, type EarnDecision, type GameAttempt, type PaidEntitlement, type PaidOrder, type PaidRepository, type ReceiptStatus, type OrderState } from "./repository.ts";

type OrderRow = {
  id: string;
  idempotency_key: string;
  product_key: string;
  player_id: string;
  email: string;
  residence_country: string;
  base_currency: "gbp";
  base_amount_minor: number;
  waiver_version: string | null;
  waiver_accepted_at: number | null;
  state: OrderState;
  checkout_session_id: string | null;
  checkout_url: string | null;
  payment_intent_id: string | null;
  presentment_currency: string | null;
  presentment_amount_minor: number | null;
  receipt_status: ReceiptStatus;
  receipt_id: string | null;
  created_at: number;
  updated_at: number;
};

type EntitlementRow = {
  id: string;
  order_id: string;
  player_id: string;
  product_key: string;
  quantity: number;
  remaining: number;
  state: "active" | "revoked";
  expires_at: number | null;
  created_at: number;
  updated_at: number;
};

function orderFromRow(row: OrderRow): PaidOrder {
  if (!isProductKey(row.product_key)) throw new PaidError("product_invalid", 500);
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    productKey: row.product_key,
    playerId: row.player_id,
    email: row.email,
    residenceCountry: row.residence_country,
    baseCurrency: "gbp",
    baseAmountMinor: row.base_amount_minor,
    waiverVersion: row.waiver_version,
    waiverAcceptedAt: row.waiver_accepted_at,
    adultConfirmed: true,
    state: row.state,
    checkoutSessionId: row.checkout_session_id,
    checkoutUrl: row.checkout_url,
    paymentIntentId: row.payment_intent_id,
    presentmentCurrency: row.presentment_currency,
    presentmentAmountMinor: row.presentment_amount_minor,
    receiptStatus: row.receipt_status,
    receiptId: row.receipt_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function entitlementFromRow(row: EntitlementRow): PaidEntitlement {
  if (!isProductKey(row.product_key)) throw new PaidError("product_invalid", 500);
  return {
    id: row.id,
    orderId: row.order_id,
    playerId: row.player_id,
    productKey: row.product_key as ProductKey,
    quantity: row.quantity,
    remaining: row.remaining,
    state: row.state,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ORDER_COLUMNS = "id,idempotency_key,product_key,player_id,email,residence_country,base_currency,base_amount_minor,waiver_version,waiver_accepted_at,state,checkout_session_id,checkout_url,payment_intent_id,presentment_currency,presentment_amount_minor,receipt_status,receipt_id,created_at,updated_at";

const ENTITLEMENT_COLUMNS = "id,order_id,player_id,product_key,quantity,remaining,state,expires_at,created_at,updated_at";

const COWRIE_SPEND_SQL = `
WITH ordered AS (
  SELECT id, remaining, SUM(remaining) OVER (
    ORDER BY CASE
      WHEN product_key = 'cowrie_welcome_v1' THEN 0
      WHEN product_key = 'cowrie_earn_v1' THEN 1
      ELSE 2
    END, created_at, id
  ) AS running
  FROM paid_entitlements
  WHERE player_id = ?1 AND state = 'active'
    AND product_key IN ('cowrie_5_v1','cowrie_15_v1','cowrie_40_v1','cowrie_welcome_v1','cowrie_earn_v1')
    AND (expires_at IS NULL OR expires_at > ?4)
),
total AS (SELECT COALESCE(SUM(remaining), 0) AS n FROM ordered),
plan AS (
  SELECT id,
    CASE
      WHEN running <= ?2 THEN 0
      WHEN running - remaining >= ?2 THEN remaining
      ELSE running - ?2
    END AS next_remaining
  FROM ordered
)
UPDATE paid_entitlements
SET remaining = (SELECT next_remaining FROM plan WHERE plan.id = paid_entitlements.id),
    updated_at = ?3
WHERE id IN (SELECT id FROM plan)
  AND (SELECT n FROM total) >= ?2
`;

function attemptFromRow(row: { attempt_id: string; player_id: string; edition: string; mode: "free" | "paid"; state: "open" | "completed"; cowries_spent: number; created_at: number; completed_at: number | null }): GameAttempt {
  return {
    attemptId: row.attempt_id,
    playerId: row.player_id,
    edition: row.edition,
    mode: row.mode,
    state: row.state,
    cowriesSpent: row.cowries_spent,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function ledger(database: D1Database): D1DatabaseSession | D1Database {
  try {
    return database.withSession("first-primary");
  } catch {
    return database;
  }
}

export function createD1Repository(database: D1Database): PaidRepository {
  const selectOrder = `SELECT ${ORDER_COLUMNS} FROM paid_orders`;
  const primary = () => ledger(database);

  async function oneOrder(sql: string, ...binds: unknown[]): Promise<PaidOrder | null> {
    const row = await database.prepare(sql).bind(...binds).first<OrderRow>();
    return row ? orderFromRow(row) : null;
  }

  return {
    async createPending(order) {
      await database.prepare(
        `INSERT INTO paid_orders (id,idempotency_key,product_key,player_id,email,residence_country,base_currency,base_amount_minor,waiver_version,waiver_accepted_at,adult_confirmed,state,receipt_status,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,'gbp',?7,?8,?9,1,'pending','pending',?10,?10)
         ON CONFLICT(idempotency_key) DO NOTHING`,
      ).bind(
        order.id, order.idempotencyKey, order.productKey, order.playerId, order.email, order.residenceCountry,
        order.baseAmountMinor, order.waiverVersion, order.waiverAcceptedAt, order.createdAt,
      ).run();
      const stored = await oneOrder(`${selectOrder} WHERE idempotency_key=?1`, order.idempotencyKey);
      if (!stored) throw new PaidError("order_unavailable", 500);
      if (stored.playerId !== order.playerId || stored.productKey !== order.productKey || stored.email !== order.email || stored.residenceCountry !== order.residenceCountry || stored.baseAmountMinor !== order.baseAmountMinor) {
        throw new PaidError("idempotency_conflict", 409);
      }
      return stored;
    },
    async attachSession(orderId, sessionId, url) {
      const result = await database.prepare(
        `UPDATE paid_orders SET checkout_session_id=?1, checkout_url=?2, updated_at=?3 WHERE id=?4 AND (checkout_session_id IS NULL OR checkout_session_id=?1)`,
      ).bind(sessionId, url, Date.now(), orderId).run();
      if ((result.meta.changes ?? 0) < 1) {
        const current = await oneOrder(`${selectOrder} WHERE id=?1`, orderId);
        if (!current || current.checkoutSessionId !== sessionId) throw new PaidError("checkout_session_conflict", 409);
      }
    },
    getById(id) {
      return oneOrder(`${selectOrder} WHERE id=?1`, id);
    },
    getBySession(sessionId) {
      return oneOrder(`${selectOrder} WHERE checkout_session_id=?1`, sessionId);
    },
    getByPaymentIntent(paymentIntentId) {
      return oneOrder(`${selectOrder} WHERE payment_intent_id=?1`, paymentIntentId);
    },
    async claimEvent(eventId, eventType, orderId, at) {
      try {
        await database.prepare("INSERT INTO paid_events (event_id,event_type,order_id,received_at) VALUES (?1,?2,?3,?4)").bind(eventId, eventType, orderId, at).run();
        return true;
      } catch {
        const existing = await database.prepare("SELECT event_id FROM paid_events WHERE event_id=?1").bind(eventId).first();
        if (existing) return false;
        throw new PaidError("event_store_unavailable", 503);
      }
    },
    async releaseEvent(eventId) {
      await database.prepare("DELETE FROM paid_events WHERE event_id=?1").bind(eventId).run();
    },
    async fulfill(orderId, payment) {
      const order = await oneOrder(`${selectOrder} WHERE id=?1`, orderId);
      if (!order) throw new PaidError("order_unavailable", 404);
      if (order.state === "fulfilled") {
        const existing = await database.prepare(`SELECT ${ENTITLEMENT_COLUMNS} FROM paid_entitlements WHERE order_id=?1`).bind(orderId).first<EntitlementRow>();
        return existing ? entitlementFromRow(existing) : null;
      }
      if (order.state !== "pending") return null;
      const product = products[order.productKey];
      const entitlementId = `ent_${order.id}`;
      const results = await database.batch([
        database.prepare("UPDATE paid_orders SET state='fulfilled', payment_intent_id=?1, presentment_currency=?2, presentment_amount_minor=?3, updated_at=?4 WHERE id=?5 AND state='pending'").bind(payment.paymentIntentId, payment.currency, payment.amountMinor, payment.at, orderId),
        database.prepare("INSERT INTO paid_entitlements (id,order_id,player_id,product_key,quantity,remaining,state,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5,'active',?6,?6)").bind(entitlementId, orderId, order.playerId, order.productKey, product.quantity, payment.at),
      ]);
      if ((results[0]?.meta.changes ?? 0) < 1) return null;
      await database.prepare("INSERT INTO paid_players (player_id, completed_games, welcome_granted, created_at) VALUES (?1, 0, 0, ?2) ON CONFLICT(player_id) DO NOTHING").bind(order.playerId, payment.at).run();
      const welcome = await database.prepare("UPDATE paid_players SET welcome_granted=1 WHERE player_id=?1 AND welcome_granted=0").bind(order.playerId).run();
      if ((welcome.meta.changes ?? 0) > 0) {
        await database.prepare(
          `INSERT INTO paid_entitlements (id,order_id,player_id,product_key,quantity,remaining,state,expires_at,created_at,updated_at) VALUES (?1,?2,?3,'cowrie_welcome_v1',?4,?4,'active',?5,?6,?6)`,
        ).bind(`bonus_${order.id}`, `bonus_${order.id}`, order.playerId, WELCOME_BONUS_COWRIES, payment.at + WELCOME_BONUS_MS, payment.at).run();
      }
      return {
        id: entitlementId,
        orderId,
        playerId: order.playerId,
        productKey: order.productKey,
        quantity: product.quantity,
        remaining: product.quantity,
        state: "active",
        expiresAt: null,
        createdAt: payment.at,
        updatedAt: payment.at,
      };
    },
    async markReceipt(orderId, status, receiptId) {
      await database.prepare("UPDATE paid_orders SET receipt_status=?1, receipt_id=?2 WHERE id=?3").bind(status, receiptId, orderId).run();
    },
    async refundFull(orderId, at) {
      const results = await database.batch([
        database.prepare("UPDATE paid_orders SET state='refunded', updated_at=?1 WHERE id=?2 AND state IN ('fulfilled','review_required')").bind(at, orderId),
        database.prepare("UPDATE paid_entitlements SET state='revoked', remaining=0, updated_at=?1 WHERE order_id=?2 OR order_id=?3").bind(at, orderId, `bonus_${orderId}`),
      ]);
      if ((results[0]?.meta.changes ?? 0) < 1) return oneOrder(`${selectOrder} WHERE id=?1`, orderId);
      return oneOrder(`${selectOrder} WHERE id=?1`, orderId);
    },
    async markReview(orderId, at, revoke) {
      const statements = [
        database.prepare("UPDATE paid_orders SET state='review_required', updated_at=?1 WHERE id=?2 AND state!='refunded'").bind(at, orderId),
      ];
      if (revoke) statements.push(database.prepare("UPDATE paid_entitlements SET state='revoked', remaining=0, updated_at=?1 WHERE order_id=?2").bind(at, orderId));
      await database.batch(statements);
      return oneOrder(`${selectOrder} WHERE id=?1`, orderId);
    },
    async failPending(orderId, at) {
      await database.prepare("UPDATE paid_orders SET state='failed', updated_at=?1 WHERE id=?2 AND state='pending'").bind(at, orderId).run();
    },
    async entitlementForOrder(orderId) {
      const row = await database.prepare(`SELECT ${ENTITLEMENT_COLUMNS} FROM paid_entitlements WHERE order_id=?1`).bind(orderId).first<EntitlementRow>();
      return row ? entitlementFromRow(row) : null;
    },
    async accessForPlayer(playerId, at = Date.now()) {
      const rows = await primary().prepare(`SELECT ${ENTITLEMENT_COLUMNS} FROM paid_entitlements WHERE player_id = ?1 AND state = 'active'`).bind(playerId).all<EntitlementRow>();
      return accessFromEntitlements(rows.results.map(entitlementFromRow), at);
    },
    async wallet(playerId, at) {
      await database.prepare("INSERT INTO paid_players (player_id, completed_games, welcome_granted, created_at) VALUES (?1, 0, 0, ?2) ON CONFLICT(player_id) DO NOTHING").bind(playerId, at).run();
      const record = await primary().prepare("SELECT completed_games FROM paid_players WHERE player_id=?1").bind(playerId).first<{ completed_games: number }>();
      const open = await primary().prepare("SELECT attempt_id, edition, mode FROM paid_attempts WHERE player_id=?1 AND state='open'").bind(playerId).first<{ attempt_id: string; edition: string; mode: "free" | "paid" }>();
      const access = await this.accessForPlayer(playerId, at);
      const completedGames = record?.completed_games ?? 0;
      return {
        ...access,
        completedGames,
        freeGamesLeft: Math.max(0, FREE_COMPLETED_GAMES - completedGames),
        openAttempt: open ? { attemptId: open.attempt_id, edition: open.edition, mode: open.mode } : null,
      };
    },
    async beginAttempt({ playerId, attemptId, edition, at }) {
      await this.wallet(playerId, at);
      const existing = await primary().prepare("SELECT attempt_id, player_id, edition, mode, state, cowries_spent, created_at, completed_at FROM paid_attempts WHERE attempt_id=?1").bind(attemptId).first<{ attempt_id: string; player_id: string; edition: string; mode: "free" | "paid"; state: "open" | "completed"; cowries_spent: number; created_at: number; completed_at: number | null }>();
      if (existing) {
        if (existing.player_id !== playerId) throw new PaidError("attempt_conflict", 409);
        return { granted: true, attempt: attemptFromRow(existing), resumed: true, wallet: await this.wallet(playerId, at) };
      }
      const open = await primary().prepare("SELECT attempt_id, player_id, edition, mode, state, cowries_spent, created_at, completed_at FROM paid_attempts WHERE player_id=?1 AND state='open'").bind(playerId).first<{ attempt_id: string; player_id: string; edition: string; mode: "free" | "paid"; state: "open" | "completed"; cowries_spent: number; created_at: number; completed_at: number | null }>();
      if (open) return { granted: true, attempt: attemptFromRow(open), resumed: true, wallet: await this.wallet(playerId, at) };
      const record = await primary().prepare("SELECT completed_games FROM paid_players WHERE player_id=?1").bind(playerId).first<{ completed_games: number }>();
      if ((record?.completed_games ?? 0) < FREE_COMPLETED_GAMES) {
        try {
          await database.prepare("INSERT INTO paid_attempts (attempt_id, player_id, edition, mode, state, cowries_spent, created_at) VALUES (?1,?2,?3,'free','open',0,?4)").bind(attemptId, playerId, edition, at).run();
        } catch {
          const raced = await primary().prepare("SELECT attempt_id, player_id, edition, mode, state, cowries_spent, created_at, completed_at FROM paid_attempts WHERE player_id=?1 AND state='open'").bind(playerId).first<{ attempt_id: string; player_id: string; edition: string; mode: "free" | "paid"; state: "open" | "completed"; cowries_spent: number; created_at: number; completed_at: number | null }>();
          if (raced) return { granted: true, attempt: attemptFromRow(raced), resumed: true, wallet: await this.wallet(playerId, at) };
          throw new PaidError("attempt_unavailable", 503);
        }
        return { granted: true, attempt: { attemptId, playerId, edition, mode: "free", state: "open", cowriesSpent: 0, createdAt: at, completedAt: null }, resumed: false, wallet: await this.wallet(playerId, at) };
      }
      const spent = await this.spendCowries(playerId, GAME_COST_COWRIES, at);
      if (!spent) return { granted: false, wallet: await this.wallet(playerId, at) };
      try {
        await database.prepare("INSERT INTO paid_attempts (attempt_id, player_id, edition, mode, state, cowries_spent, created_at) VALUES (?1,?2,?3,'paid','open',?4,?5)").bind(attemptId, playerId, edition, GAME_COST_COWRIES, at).run();
      } catch {
        const raced = await primary().prepare("SELECT attempt_id, player_id, edition, mode, state, cowries_spent, created_at, completed_at FROM paid_attempts WHERE player_id=?1 AND state='open'").bind(playerId).first<{ attempt_id: string; player_id: string; edition: string; mode: "free" | "paid"; state: "open" | "completed"; cowries_spent: number; created_at: number; completed_at: number | null }>();
        if (raced) return { granted: true, attempt: attemptFromRow(raced), resumed: true, wallet: await this.wallet(playerId, at) };
        throw new PaidError("attempt_unavailable", 503);
      }
      return { granted: true, attempt: { attemptId, playerId, edition, mode: "paid", state: "open", cowriesSpent: GAME_COST_COWRIES, createdAt: at, completedAt: null }, resumed: false, wallet: await this.wallet(playerId, at) };
    },
    async finishAttempt({ playerId, attemptId, at }) {
      const attempt = await database.prepare("SELECT state FROM paid_attempts WHERE attempt_id=?1 AND player_id=?2").bind(attemptId, playerId).first<{ state: "open" | "completed" }>();
      if (!attempt) throw new PaidError("attempt_unavailable", 404);
      if (attempt.state === "completed") return { wallet: await this.wallet(playerId, at), showPaywall: false, already: true };
      await database.batch([
        database.prepare("UPDATE paid_attempts SET state='completed', completed_at=?1 WHERE attempt_id=?2 AND state='open'").bind(at, attemptId),
        database.prepare("UPDATE paid_players SET completed_games=completed_games+1 WHERE player_id=?1").bind(playerId),
      ]);
      const wallet = await this.wallet(playerId, at);
      return { wallet, showPaywall: wallet.completedGames === FREE_COMPLETED_GAMES, already: false };
    },
    async recordStat(event, detail, at) {
      const day = new Date(at).toISOString().slice(0, 10);
      await database.prepare(
        "INSERT INTO paid_stats_daily (day, event, detail, count) VALUES (?1,?2,?3,1) ON CONFLICT(day, event, detail) DO UPDATE SET count=count+1",
      ).bind(day, event, detail).run();
    },
    async listStats(sinceDay) {
      const rows = await database.prepare("SELECT day, event, detail, count FROM paid_stats_daily WHERE day>=?1 ORDER BY day, event, detail").bind(sinceDay).all<{ day: string; event: string; detail: string; count: number }>();
      return rows.results;
    },
    async spendCowries(playerId, count, at) {
      assertSpendCount(count);
      const result = await primary().prepare(COWRIE_SPEND_SQL).bind(playerId, count, at, at).run();
      if ((result.meta.changes ?? 0) < 1) return null;
      return this.accessForPlayer(playerId);
    },
    async refundUnfulfilled(orderId, at) {
      const result = await database.prepare("UPDATE paid_orders SET state='refunded', updated_at=?1 WHERE id=?2 AND state='pending'").bind(at, orderId).run();
      if ((result.meta.changes ?? 0) < 1) return oneOrder(`${selectOrder} WHERE id=?1`, orderId);
      return oneOrder(`${selectOrder} WHERE id=?1`, orderId);
    },
    async ensureReferralCode(playerId, at) {
      const existing = await database.prepare("SELECT code FROM paid_referrals WHERE player_id=?1").bind(playerId).first<{ code: string }>();
      if (existing?.code) return { code: existing.code };
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = newReferralCode();
        try {
          const inserted = await database.prepare("INSERT INTO paid_referrals (player_id, code, created_at) VALUES (?1,?2,?3)").bind(playerId, code, at).run();
          if ((inserted.meta.changes ?? 0) > 0) return { code };
        } catch {
          const raced = await database.prepare("SELECT code FROM paid_referrals WHERE player_id=?1").bind(playerId).first<{ code: string }>();
          if (raced?.code) return { code: raced.code };
        }
      }
      throw new PaidError("referral_unavailable", 503);
    },
    async findReferralCode(code) {
      const row = await database.prepare("SELECT player_id FROM paid_referrals WHERE code=?1").bind(code).first<{ player_id: string }>();
      return row?.player_id ?? null;
    },
    async recordReferralArrival({ playerId, code, at }) {
      const referrer = await this.findReferralCode(code);
      if (!referrer) return { ok: false, reason: "unknown", cowries: 0 };
      if (referrer === playerId) return { ok: false, reason: "self", cowries: 0 };
      await database.prepare("INSERT INTO paid_players (player_id, completed_games, welcome_granted, created_at) VALUES (?1, 0, 0, ?2) ON CONFLICT(player_id) DO NOTHING").bind(playerId, at).run();
      const record = await database.prepare("SELECT completed_games FROM paid_players WHERE player_id=?1").bind(playerId).first<{ completed_games: number }>();
      if ((record?.completed_games ?? 0) > 0) return { ok: false, reason: "not_new", cowries: 0 };
      const inserted = await database.prepare(
        "INSERT INTO paid_referral_arrivals (new_player_id, referrer_player_id, code, rewarded, created_at) VALUES (?1,?2,?3,0,?4) ON CONFLICT(new_player_id) DO NOTHING",
      ).bind(playerId, referrer, code, at).run();
      if ((inserted.meta.changes ?? 0) < 1) return { ok: false, reason: "repeat", cowries: 0 };
      return { ok: true, reason: "recorded", cowries: 0 };
    },
    async claimReferralRewards(playerId, at) {
      const arrival = await database.prepare(
        "SELECT referrer_player_id, rewarded FROM paid_referral_arrivals WHERE new_player_id=?1",
      ).bind(playerId).first<{ referrer_player_id: string; rewarded: number }>();
      if (!arrival || arrival.rewarded) return null;
      if (arrival.referrer_player_id === playerId) {
        await database.prepare("UPDATE paid_referral_arrivals SET rewarded=1 WHERE new_player_id=?1").bind(playerId).run();
        return {
          player: { ok: false, reason: "self", cowries: 0 },
          referrer: { ok: false, reason: "self", cowries: 0 },
        };
      }
      const playerDecision = await insertEarn(database, {
        grantId: `referral_new:${playerId}`,
        playerId,
        kind: "referral_new",
        day: earnDay(at),
        attemptId: null,
        relatedPlayerId: arrival.referrer_player_id,
        cowries: NEW_PLAYER_BONUS,
        at,
      });
      const day = earnDay(at);
      const referrerGrantId = `referral_referrer:${playerId}`;
      let referrer: EarnDecision;
      try {
        const inserted = await database.prepare(
          `INSERT INTO paid_earn_grants (grant_id, player_id, kind, day, attempt_id, related_player_id, cowries, created_at)
           SELECT ?1, ?2, 'referral_referrer', ?3, NULL, ?4, ?5, ?6
           WHERE (SELECT COUNT(*) FROM paid_earn_grants WHERE player_id=?2 AND kind='referral_referrer' AND day=?3 AND cowries>0) < ?7`,
        ).bind(referrerGrantId, arrival.referrer_player_id, day, playerId, REFERRER_BONUS, at, REFERRAL_DAILY_CAP).run();
        if ((inserted.meta.changes ?? 0) < 1) {
          referrer = { ok: false, reason: "capped", cowries: 0 };
        } else {
          await database.prepare(
            "INSERT INTO paid_entitlements (id, order_id, player_id, product_key, quantity, remaining, state, created_at, updated_at) VALUES (?1,?1,?2,'cowrie_earn_v1',?3,?3,'active',?4,?4)",
          ).bind(`earn_${referrerGrantId}`, arrival.referrer_player_id, REFERRER_BONUS, at).run();
          referrer = { ok: true, reason: "granted", cowries: REFERRER_BONUS };
        }
      } catch {
        referrer = { ok: false, reason: "repeat", cowries: 0 };
      }
      await database.prepare("UPDATE paid_referral_arrivals SET rewarded=1 WHERE new_player_id=?1 AND rewarded=0").bind(playerId).run();
      return { player: playerDecision, referrer };
    },
    async grantPerfect({ playerId, attemptId, edition, at }) {
      const attempt = await database.prepare("SELECT player_id, edition, state FROM paid_attempts WHERE attempt_id=?1").bind(attemptId).first<{ player_id: string; edition: string; state: "open" | "completed" }>();
      if (!attempt || attempt.player_id !== playerId || attempt.edition !== edition) throw new PaidError("attempt_unavailable", 404);
      if (attempt.state !== "completed") throw new PaidError("attempt_open", 409);
      const day = earnDay(at);
      const existing = await database.prepare("SELECT cowries FROM paid_earn_grants WHERE kind='perfect' AND attempt_id=?1").bind(attemptId).first<{ cowries: number }>();
      if (existing) return { ok: false, reason: existing.cowries > 0 ? "repeat" : "capped", cowries: 0 };
      const today = await database.prepare("SELECT COUNT(*) AS n FROM paid_earn_grants WHERE player_id=?1 AND kind='perfect' AND day=?2 AND cowries>0").bind(playerId, day).first<{ n: number }>();
      const cowries = (today?.n ?? 0) >= PERFECT_DAILY_CAP ? 0 : PERFECT_BONUS;
      return insertEarn(database, {
        grantId: `perfect:${attemptId}`,
        playerId,
        kind: "perfect",
        day,
        attemptId,
        relatedPlayerId: null,
        cowries,
        at,
      });
    },
    async grantShare({ playerId, at }) {
      const record = await database.prepare("SELECT completed_games FROM paid_players WHERE player_id=?1").bind(playerId).first<{ completed_games: number }>();
      if (!record || record.completed_games < 1) return { ok: false, reason: "ineligible", cowries: 0 };
      const day = earnDay(at);
      const existing = await database.prepare("SELECT grant_id FROM paid_earn_grants WHERE player_id=?1 AND kind='share' AND day=?2").bind(playerId, day).first();
      if (existing) return { ok: false, reason: "repeat", cowries: 0 };
      return insertEarn(database, {
        grantId: `share:${playerId}:${day}`,
        playerId,
        kind: "share",
        day,
        attemptId: null,
        relatedPlayerId: null,
        cowries: SHARE_BONUS,
        at,
      });
    },
  };
}

async function insertEarn(database: D1Database, input: {
  grantId: string;
  playerId: string;
  kind: "perfect" | "share" | "referral_referrer" | "referral_new";
  day: string;
  attemptId: string | null;
  relatedPlayerId: string | null;
  cowries: number;
  at: number;
}): Promise<EarnDecision> {
  try {
    const inserted = await database.prepare(
      "INSERT INTO paid_earn_grants (grant_id, player_id, kind, day, attempt_id, related_player_id, cowries, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
    ).bind(input.grantId, input.playerId, input.kind, input.day, input.attemptId, input.relatedPlayerId, input.cowries, input.at).run();
    if ((inserted.meta.changes ?? 0) < 1) {
      return { ok: false, reason: input.cowries > 0 ? "repeat" : "capped", cowries: 0 };
    }
  } catch {
    const existing = input.attemptId
      ? await database.prepare("SELECT cowries FROM paid_earn_grants WHERE attempt_id=?1 AND kind=?2").bind(input.attemptId, input.kind).first<{ cowries: number }>()
      : await database.prepare("SELECT cowries FROM paid_earn_grants WHERE grant_id=?1").bind(input.grantId).first<{ cowries: number }>();
    if (existing) return { ok: false, reason: existing.cowries > 0 ? "repeat" : "capped", cowries: 0 };
    if (input.cowries > 0) {
      try {
        await database.prepare(
          "INSERT INTO paid_earn_grants (grant_id, player_id, kind, day, attempt_id, related_player_id, cowries, created_at) VALUES (?1,?2,?3,?4,?5,?6,0,?7)",
        ).bind(`${input.grantId}:capped`, input.playerId, input.kind, input.day, input.attemptId, input.relatedPlayerId, input.at).run();
      } catch { /* the attempt or day is already recorded */ }
      return { ok: false, reason: "capped", cowries: 0 };
    }
    return { ok: false, reason: "capped", cowries: 0 };
  }
  if (input.cowries < 1) return { ok: false, reason: "capped", cowries: 0 };
  await database.prepare(
    "INSERT INTO paid_entitlements (id, order_id, player_id, product_key, quantity, remaining, state, created_at, updated_at) VALUES (?1,?1,?2,'cowrie_earn_v1',?3,?3,'active',?4,?4)",
  ).bind(`earn_${input.grantId}`, input.playerId, input.cowries, input.at).run();
  return { ok: true, reason: "granted", cowries: input.cowries };
}
