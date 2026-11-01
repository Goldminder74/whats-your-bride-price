import { isProductKey, products, type ProductKey } from "./catalog.ts";
import { PaidError } from "./errors.ts";
import type { PaidEntitlement, PaidOrder, PaidRepository, ReceiptStatus, OrderState } from "./repository.ts";

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ORDER_COLUMNS = "id,idempotency_key,product_key,player_id,email,residence_country,base_currency,base_amount_minor,waiver_version,waiver_accepted_at,state,checkout_session_id,checkout_url,payment_intent_id,presentment_currency,presentment_amount_minor,receipt_status,receipt_id,created_at,updated_at";

export function createD1Repository(database: D1Database): PaidRepository {
  const selectOrder = `SELECT ${ORDER_COLUMNS} FROM paid_orders`;

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
        const existing = await database.prepare("SELECT id,order_id,player_id,product_key,quantity,remaining,state,created_at,updated_at FROM paid_entitlements WHERE order_id=?1").bind(orderId).first<EntitlementRow>();
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
      return {
        id: entitlementId,
        orderId,
        playerId: order.playerId,
        productKey: order.productKey,
        quantity: product.quantity,
        remaining: product.quantity,
        state: "active",
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
        database.prepare("UPDATE paid_entitlements SET state='revoked', remaining=0, updated_at=?1 WHERE order_id=?2").bind(at, orderId),
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
      const row = await database.prepare("SELECT id,order_id,player_id,product_key,quantity,remaining,state,created_at,updated_at FROM paid_entitlements WHERE order_id=?1").bind(orderId).first<EntitlementRow>();
      return row ? entitlementFromRow(row) : null;
    },
    async accessForPlayer(playerId) {
      const rows = await database.prepare("SELECT product_key, remaining FROM paid_entitlements WHERE player_id = ?1 AND state = 'active'").bind(playerId).all<{ product_key: string; remaining: number }>();
      let cowries = 0;
      let royal = false;
      for (const row of rows.results) {
        if (!isProductKey(row.product_key) || !Number.isSafeInteger(row.remaining) || row.remaining < 0) continue;
        const product = products[row.product_key];
        if (product.kind === "cowries") cowries += row.remaining;
        if (product.kind === "royal_reveal" && row.remaining > 0) royal = true;
      }
      return { cowries, royal };
    },
  };
}
