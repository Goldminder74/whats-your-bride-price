import { products } from "./catalog.ts";
import { PaidError } from "./errors.ts";
import type { KvStore } from "./games.ts";
import type { PaidOrder, PaidRepository } from "./repository.ts";
import type { NormalizedStripeEvent } from "./stripe.ts";
import type { TransactionalEmail } from "./email.ts";

function underpaid(order: PaidOrder, event: NormalizedStripeEvent): boolean {
  if (event.amountTotal === null || event.amountTotal <= 0 || !event.currency) return true;
  if (event.currency === order.baseCurrency && event.amountTotal < order.baseAmountMinor) return true;
  return false;
}

/** Rewrite the hot-path cache from the D1 entitlement rows. Safe to repeat. */
export async function projectAccess(kv: KvStore, repository: PaidRepository, playerId: string): Promise<{ cowries: number; royal: boolean }> {
  const access = await repository.accessForPlayer(playerId);
  await kv.put(`cowrie:${playerId}`, String(access.cowries));
  await kv.put(`royal:${playerId}`, access.royal ? "1" : "0");
  return access;
}

async function projectOrder(kv: KvStore, repository: PaidRepository, order: PaidOrder | null): Promise<void> {
  if (order) await projectAccess(kv, repository, order.playerId);
}

async function orderForEvent(repository: PaidRepository, event: NormalizedStripeEvent): Promise<PaidOrder | null> {
  if (event.orderId) {
    const byId = await repository.getById(event.orderId);
    if (byId) return byId;
  }
  if (event.sessionId) {
    const bySession = await repository.getBySession(event.sessionId);
    if (bySession) return bySession;
  }
  if (event.paymentIntentId) return repository.getByPaymentIntent(event.paymentIntentId);
  return null;
}

export function receiptText(order: PaidOrder): string {
  const product = products[order.productKey];
  const charged = order.presentmentAmountMinor === null || !order.presentmentCurrency
    ? product.displayPrice
    : `${order.presentmentCurrency.toUpperCase()} ${(order.presentmentAmountMinor / 100).toFixed(2)}`;
  return [
    "What’s Your Bride Price? purchase receipt",
    "",
    "PLACEHOLDER: receipt wording is waiting for owner approval.",
    `Order: ${order.id}`,
    `Product: ${product.name}`,
    `Charged by Stripe: ${charged}`,
    `Base price before local currency and tax: ${product.displayPrice}`,
    order.waiverVersion ? `Instant digital supply consent: ${order.waiverVersion}` : "Instant digital supply consent: not required for this residence country",
    "Card details stay with Stripe. This mailbox sends receipts only.",
    "Support: team@classesforculture.com",
  ].join("\n");
}

export async function applyStripeEvent(input: {
  event: NormalizedStripeEvent;
  repository: PaidRepository;
  kv: KvStore;
  email: TransactionalEmail;
  now: number;
}): Promise<{ duplicate: boolean; ignored: boolean }> {
  const { event, repository, kv, email, now } = input;
  if (event.livemode) throw new PaidError("stripe_live_event_rejected", 400);
  const claimed = await repository.claimEvent(event.id, event.type, event.orderId, now);
  if (!claimed) {
    await projectOrder(kv, repository, await orderForEvent(repository, event));
    return { duplicate: true, ignored: false };
  }
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      if (event.paymentStatus !== "paid" || !event.sessionId || !event.paymentIntentId) {
        if (event.type === "checkout.session.completed" && event.paymentStatus !== "paid") return { duplicate: false, ignored: true };
        throw new PaidError("stripe_payment_incomplete", 400);
      }
      const order = event.orderId ? await repository.getById(event.orderId) : await repository.getBySession(event.sessionId);
      if (!order || order.checkoutSessionId !== event.sessionId) throw new PaidError("stripe_order_unavailable", 400);
      if (underpaid(order, event)) throw new PaidError("stripe_amount_rejected", 400);
      const entitlement = await repository.fulfill(order.id, {
        paymentIntentId: event.paymentIntentId,
        currency: event.currency || order.baseCurrency,
        amountMinor: event.amountTotal || order.baseAmountMinor,
        at: now,
      });
      await projectOrder(kv, repository, order);
      const paid = await repository.getById(order.id);
      if (entitlement?.state === "active" && paid && paid.receiptStatus !== "sent") {
        try {
          const receipt = await email.send({
            to: paid.email,
            subject: `Receipt ${paid.id}`,
            text: receiptText(paid),
            idempotencyKey: paid.id,
          });
          await repository.markReceipt(paid.id, "sent", receipt.id);
        } catch {
          await repository.markReceipt(paid.id, "failed", null);
        }
      }
      return { duplicate: false, ignored: false };
    }
    if (event.type === "checkout.session.async_payment_failed") {
      if (event.orderId) await repository.failPending(event.orderId, now);
      return { duplicate: false, ignored: false };
    }
    if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      if (!event.paymentIntentId) throw new PaidError("stripe_order_unavailable", 400);
      const order = await repository.getByPaymentIntent(event.paymentIntentId);
      if (!order) throw new PaidError("stripe_order_unavailable", 400);
      const full = event.type === "charge.refunded" && (event.fullyRefunded || (event.amountRefunded !== null && event.amountTotal !== null && event.amountRefunded >= event.amountTotal));
      if (event.type === "charge.dispute.created") {
        await repository.markReview(order.id, now, true);
      } else if (full) {
        await repository.refundFull(order.id, now);
      } else {
        await repository.markReview(order.id, now, false);
      }
      await projectOrder(kv, repository, order);
      return { duplicate: false, ignored: false };
    }
    return { duplicate: false, ignored: true };
  } catch (error) {
    await repository.releaseEvent(event.id);
    throw error;
  }
}
