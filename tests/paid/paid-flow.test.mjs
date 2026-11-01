import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { regions } from "../../app/gameData.ts";
import { CANONICAL_ORIGIN, WAIVER_TEXT } from "../../paid/catalog.ts";
import { createMockEmail, createResendEmail, parseReceiptFrom } from "../../paid/email.ts";
import { formatMoney, purchaseReceipt, refundReceipt } from "../../paid/receipt.ts";
import { WAIVER_VERSION } from "../../paid/catalog.ts";
import { paidSchemaSql } from "../../paid/schemaSql.ts";
import { createMemoryRepository } from "../../paid/repository.ts";
import { servePaid } from "../../paid/serve.ts";
import { checkoutSessionParams, verifyStripeSignature } from "../../paid/stripe.ts";

const webhookSecret = "whsec_local_test_secret_value";
const now = 1_700_000_000_000;

function memoryKv() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, value); },
  };
}

function services(overrides = {}) {
  const email = overrides.email ?? createMockEmail();
  return {
    email,
    now: () => now,
    repository: overrides.repository ?? createMemoryRepository(),
    kv: overrides.kv ?? memoryKv(),
    config: overrides.config === undefined ? {
      stripeMode: "mock",
      stripeSecretKey: "sk_test_mock_local_only",
      webhookSecret,
      publicOrigin: CANONICAL_ORIGIN,
    } : overrides.config,
    stripeFetch: overrides.stripeFetch,
    ensureSchema: overrides.ensureSchema,
  };
}

function request(path, init = {}) {
  return new Request(`https://brideprice.classesforculture.com${path}`, init);
}

async function body(response) {
  return response.json();
}

test("schema file matches the Worker bootstrap SQL", async () => {
  const file = await readFile(new URL("../../migrations/0001_paid_orders.sql", import.meta.url), "utf8");
  assert.equal(file.trim(), paidSchemaSql.trim());
  assert.match(paidSchemaSql, /paid_orders/);
  assert.match(paidSchemaSql, /paid_events/);
  assert.match(paidSchemaSql, /paid_entitlements/);
});

test("canonical pages use the public game origin", async () => {
  const home = await servePaid(request("/"), services());
  const html = await home.text();
  assert.match(html, new RegExp(`rel="canonical" href="${CANONICAL_ORIGIN}/"`));
  assert.match(html, new RegExp(`property="og:url" content="${CANONICAL_ORIGIN}/"`));
  assert.doesNotMatch(html, /chatgpt\.site/);
  const privacy = await (await servePaid(request("/privacy"), services())).text();
  assert.match(privacy, /PLACEHOLDER/);
  assert.match(privacy, /Google Workspace, Google Drive and ChatGPT Sites are not part/);
  assert.match(privacy, new RegExp(`rel="canonical" href="${CANONICAL_ORIGIN}/privacy"`));
  const refunds = await (await servePaid(request("/refunds"), services())).text();
  assert.match(refunds, /14-day/);
  assert.match(refunds, /PLACEHOLDER/);
});

test("question payloads omit answer keys and completions stay off the order database", async () => {
  let repositoryCalls = 0;
  const repository = new Proxy({}, { get: () => async () => { repositoryCalls += 1; throw new Error("database"); } });
  const kv = memoryKv();
  const app = services({ repository, kv });
  const questions = await body(await servePaid(request("/api/paid/questions?edition=west"), app));
  assert.equal(questions.length, regions.west.questions.length);
  assert.equal("correct" in questions[0], false);
  const answers = regions.west.questions.map((question) => [...question.correct]);
  const completed = await servePaid(request("/api/paid/games/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ edition: "west", answers }),
  }), app);
  const result = await body(completed);
  assert.equal(completed.status, 200);
  assert.equal(result.score, 12);
  assert.equal(repositoryCalls, 0);
  assert.equal([...kv.map.keys()].some((key) => key.startsWith("result:")), true);
  const counter = [...kv.map.keys()].find((key) => key.startsWith("count:"));
  assert.match(counter, /^count:\d{4}-\d{2}-\d{2}:(\d+)$/);
  assert.ok(Number(counter.split(":").at(-1)) < 256);
});

test("checkout requires the UK withdrawal acknowledgement and stays in test mode", async () => {
  const email = createMockEmail();
  const app = services({ email });
  const playerId = "player_local_test_01";
  const missingWaiver = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "checkout-gb-1" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "GB", playerId, adult: true, waiver: false }),
  }), app);
  assert.equal(missingWaiver.status, 400);
  assert.equal((await body(missingWaiver)).error, "withdrawal_waiver_required");

  const live = services({ config: { stripeMode: "test", stripeSecretKey: "sk_live_secret", webhookSecret, publicOrigin: CANONICAL_ORIGIN } });
  const rejected = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "checkout-live" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "US", playerId, adult: true, waiver: false }),
  }), live);
  assert.equal(rejected.status, 503);

  const created = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "checkout-us-1", origin: "https://brideprice.classesforculture.com" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "US", playerId, adult: true }),
  }), app);
  assert.equal(created.status, 200);
  const checkout = await body(created);
  assert.match(checkout.url, /\/checkout\/mock\?order=/);
  const replay = await body(await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "checkout-us-1" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "US", playerId, adult: true }),
  }), app));
  assert.equal(replay.replay, true);
  assert.equal(replay.url, checkout.url);

  const paid = await servePaid(request("/api/paid/mock-pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: checkout.orderId }),
  }), app);
  assert.equal(paid.status, 200);
  assert.equal((await body(paid)).ok, true);
  const order = await body(await servePaid(request(`/api/paid/orders/${checkout.orderId}`), app));
  assert.equal(order.state, "fulfilled");
  assert.equal(order.entitlement.remaining, 5);
  assert.equal(order.receiptStatus, "sent");
  assert.equal(email.sent.length, 1);
  assert.match(email.sent[0].subject, /receipt – 5 Cowries \([0-9A-F]{8}\)/);
  assert.match(email.sent[0].text, /£1\.99/);
  assert.match(email.sent[0].html, /What's Your Bride Price\?/);
  assert.equal(email.sent[0].replyTo, "team@classesforculture.com");
  const access = await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app));
  assert.equal(access.cowries, 5);

  const again = await servePaid(request("/api/paid/mock-pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: checkout.orderId }),
  }), app);
  assert.equal(again.status, 200);
  assert.equal(email.sent.length, 1);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 5);
});

test("signed refunds revoke only that purchase and partial refunds wait for review", async () => {
  const app = services();
  const playerId = "player_refund_test_01";
  const checkout = await body(await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "refund-order" },
    body: JSON.stringify({ productKey: "royal_reveal_v1", email: "buyer@example.com", country: "NG", playerId, adult: true }),
  }), app));
  await servePaid(request("/api/paid/mock-pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: checkout.orderId }),
  }), app);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).royal, true);

  async function postEvent(event) {
    const raw = JSON.stringify(event);
    const timestamp = Math.floor(now / 1000);
    const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${raw}`).digest("hex");
    return servePaid(request("/api/paid/webhook", {
      method: "POST",
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
      body: raw,
    }), app);
  }

  const partial = await postEvent({
    id: "evt_partial_refund_0001",
    type: "charge.refunded",
    livemode: false,
    data: { object: { amount: 199, amount_refunded: 50, refunded: false, currency: "gbp", payment_intent: `pi_mock_${checkout.orderId.slice(4)}` } },
  });
  assert.equal(partial.status, 200);
  assert.equal((await body(await servePaid(request(`/api/paid/orders/${checkout.orderId}`), app))).state, "review_required");
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).royal, true);

  const full = await postEvent({
    id: "evt_full_refund_0001",
    type: "charge.refunded",
    livemode: false,
    data: { object: { amount: 199, amount_refunded: 199, refunded: true, currency: "gbp", payment_intent: `pi_mock_${checkout.orderId.slice(4)}` } },
  });
  assert.equal(full.status, 200);
  const refunded = await body(await servePaid(request(`/api/paid/orders/${checkout.orderId}`), app));
  assert.equal(refunded.state, "refunded");
  assert.equal(refunded.entitlement.state, "revoked");
  assert.equal(refunded.entitlement.remaining, 0);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).royal, false);

  const tampered = await servePaid(request("/api/paid/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1700000000,v1=deadbeef" },
    body: "{}",
  }), app);
  assert.equal(tampered.status, 400);
});

test("Stripe session requests enable Adaptive Pricing and Tax, and Paystack stays unwired", async () => {
  const params = checkoutSessionParams({
    orderId: "ord_" + "ab".repeat(16),
    productName: "Royal Reveal",
    amountMinor: 199,
    successUrl: "https://brideprice.classesforculture.com/checkout/return?order=1&session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://brideprice.classesforculture.com/",
    customerEmail: "buyer@example.com",
    waiverText: WAIVER_TEXT,
  });
  assert.equal(params.get("adaptive_pricing[enabled]"), "true");
  assert.equal(params.get("automatic_tax[enabled]"), "true");
  assert.equal(params.get("line_items[0][price_data][currency]"), "gbp");
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "199");
  let recorded = "";
  const app = services({
    config: { stripeMode: "test", stripeSecretKey: "sk_test_example", webhookSecret, publicOrigin: CANONICAL_ORIGIN },
    stripeFetch: async (_url, init) => {
      recorded = String(init.body);
      return new Response(JSON.stringify({ id: "cs_test_live_shape", url: "https://checkout.stripe.com/c/pay/cs_test_live_shape" }), { status: 200 });
    },
  });
  const response = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "stripe-shape" },
    body: JSON.stringify({ productKey: "royal_reveal_v1", email: "buyer@example.com", country: "KE", playerId: "player_shape_test_01", adult: true }),
  }), app);
  assert.equal(response.status, 200);
  assert.match(recorded, /adaptive_pricing(?:%5B|\[)enabled(?:%5D|\])=true/);
  assert.match(recorded, /automatic_tax(?:%5B|\[)enabled(?:%5D|\])=true/);
  const paystack = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "paystack-later" },
    body: JSON.stringify({ provider: "paystack", productKey: "cowrie_5_v1", email: "buyer@example.com", country: "NG", playerId: "player_shape_test_01", adult: true }),
  }), app);
  assert.equal(paystack.status, 501);
  assert.equal((await body(paystack)).error, "paystack_not_enabled");
});

test("grant and revoke rewrite the Cowrie cache from D1 under duplicates and a missed write", async () => {
  const playerId = "player_balance_test_01";
  const kv = memoryKv();
  let interruptCowrieZero = true;
  const innerPut = kv.put.bind(kv);
  kv.put = async (key, value) => {
    if (interruptCowrieZero && key === `cowrie:${playerId}` && value === "0") {
      interruptCowrieZero = false;
      throw new Error("kv_write_interrupted");
    }
    await innerPut(key, value);
  };
  const app = services({ kv });
  const checkout = await body(await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "balance-order" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "NG", playerId, adult: true }),
  }), app));
  assert.equal((await servePaid(request("/api/paid/mock-pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: checkout.orderId }),
  }), app)).status, 200);
  assert.equal(kv.map.get(`cowrie:${playerId}`), "5");

  const completed = {
    id: "evt_completed_again_0001",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: {
      id: `cs_test_mock_${checkout.orderId.slice(4)}`,
      client_reference_id: checkout.orderId,
      payment_status: "paid",
      amount_total: 199,
      currency: "gbp",
      payment_intent: `pi_mock_${checkout.orderId.slice(4)}`,
      metadata: { order_id: checkout.orderId },
    } },
  };
  async function postEvent(event) {
    const raw = JSON.stringify(event);
    const timestamp = Math.floor(now / 1000);
    const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${raw}`).digest("hex");
    return servePaid(request("/api/paid/webhook", {
      method: "POST",
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
      body: raw,
    }), app);
  }
  assert.equal((await postEvent(completed)).status, 200);
  assert.equal((await postEvent(completed)).status, 200);
  assert.equal(kv.map.get(`cowrie:${playerId}`), "5");
  assert.equal((await body(await servePaid(request(`/api/paid/orders/${checkout.orderId}`), app))).entitlement.remaining, 5);

  const refund = {
    id: "evt_balance_refund_0001",
    type: "charge.refunded",
    livemode: false,
    data: { object: { amount: 199, amount_refunded: 199, refunded: true, currency: "gbp", payment_intent: `pi_mock_${checkout.orderId.slice(4)}` } },
  };
  const interrupted = await postEvent(refund);
  assert.equal(interrupted.status, 500);
  assert.equal((await body(await servePaid(request(`/api/paid/orders/${checkout.orderId}`), app))).state, "refunded");
  assert.equal(kv.map.get(`cowrie:${playerId}`), "5");
  assert.equal((await postEvent(refund)).status, 200);
  assert.equal(kv.map.get(`cowrie:${playerId}`), "0");
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 0);

  const replay = { ...refund, id: "evt_balance_refund_0002" };
  const concurrent = await Promise.all([postEvent(refund), postEvent(replay), postEvent(replay)]);
  assert.deepEqual(concurrent.map((response) => response.status), [200, 200, 200]);
  assert.equal(kv.map.get(`cowrie:${playerId}`), "0");
  const ledger = await body(await servePaid(request(`/api/paid/orders/${checkout.orderId}`), app));
  assert.equal(ledger.entitlement.state, "revoked");
  assert.equal(ledger.entitlement.remaining, 0);
});

test("access and spend follow D1 when KV still shows a refunded balance", async () => {
  const playerId = "player_d1_access_01";
  const kv = memoryKv();
  const app = services({ kv });
  const checkout = await body(await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "d1-access-order" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "KE", playerId, adult: true }),
  }), app));
  assert.equal((await servePaid(request("/api/paid/mock-pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: checkout.orderId }),
  }), app)).status, 200);
  await kv.put(`cowrie:${playerId}`, "99");
  await kv.put(`royal:${playerId}`, "1");
  const granted = await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app));
  assert.equal(granted.source, "d1");
  assert.equal(granted.cowries, 5);
  assert.equal(granted.royal, false);
  const spent = await body(await servePaid(request("/api/paid/cowries/spend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId, count: 2 }),
  }), app));
  assert.equal(spent.cowries, 3);
  await kv.put(`cowrie:${playerId}`, "99");
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 3);
  const overspend = await servePaid(request("/api/paid/cowries/spend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId, count: 4 }),
  }), app);
  assert.equal(overspend.status, 409);
  assert.equal((await body(overspend)).error, "insufficient_cowries");
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 3);

  const refund = {
    id: "evt_d1_access_refund",
    type: "charge.refunded",
    livemode: false,
    data: { object: { amount: 199, amount_refunded: 199, refunded: true, currency: "gbp", payment_intent: `pi_mock_${checkout.orderId.slice(4)}` } },
  };
  const raw = JSON.stringify(refund);
  const timestamp = Math.floor(now / 1000);
  const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${raw}`).digest("hex");
  assert.equal((await servePaid(request("/api/paid/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    body: raw,
  }), app)).status, 200);
  await kv.put(`cowrie:${playerId}`, "5");
  const after = await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app));
  assert.equal(after.cowries, 0);
  assert.equal(after.source, "d1");
  const blocked = await servePaid(request("/api/paid/cowries/spend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId, count: 1 }),
  }), app);
  assert.equal(blocked.status, 409);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 0);
});

test("checkout logs the Stripe error without returning it or a secret", async () => {
  const lines = [];
  const original = console.error;
  console.error = (line) => { lines.push(String(line)); };
  try {
    const app = services({
      config: { stripeMode: "test", stripeSecretKey: "sk_test_example", webhookSecret, publicOrigin: CANONICAL_ORIGIN },
      stripeFetch: async () => new Response(JSON.stringify({
        error: { type: "invalid_request_error", code: "tax_id_invalid", message: "Stripe Tax is not active. sk_test_secret should not leak" },
      }), { status: 400 }),
    });
    const response = await servePaid(request("/api/paid/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "stripe-error-log" },
      body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "US", playerId: "player_stripe_log_01", adult: true }),
    }), app);
    assert.equal(response.status, 502);
    const payload = await body(response);
    assert.equal(payload.error, "stripe_checkout_unavailable");
    assert.equal(JSON.stringify(payload).includes("tax_id_invalid"), false);
    const logged = lines.join("\n");
    assert.match(logged, /tax_id_invalid/);
    assert.match(logged, /Stripe Tax is not active/);
    assert.equal(logged.includes("sk_test_secret"), false);
  } finally {
    console.error = original;
  }
});

test("webhook signatures match Stripe HMAC and reject stale headers", async () => {
  const raw = "{\"id\":\"evt_test\"}";
  const timestamp = Math.floor(now / 1000);
  const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${raw}`).digest("hex");
  await verifyStripeSignature(raw, `t=${timestamp},v1=${signature}`, webhookSecret, now);
  await assert.rejects(() => verifyStripeSignature(raw, `t=${timestamp - 301},v1=${signature}`, webhookSecret, now), /stripe_signature_expired/);
});

test("receipt headers, currency formatting and escaping", async () => {
  const from = "What's Your Bride Price? <noreply@mail.classesforculture.com>";
  assert.equal(parseReceiptFrom(from).header, from);
  assert.equal(parseReceiptFrom(from).address, "noreply@mail.classesforculture.com");
  assert.throws(() => parseReceiptFrom("What's Your Bride Price? <noreply@classesforculture.com>"), /email_from_must_be_subdomain/);
  assert.equal(formatMoney(199, "gbp"), "£1.99");
  assert.equal(formatMoney(199, "usd"), "US$1.99");
  assert.equal(formatMoney(1234, "eur"), "€12.34");
  assert.equal(formatMoney(199, "cad"), "CA$1.99");
  assert.match(formatMoney(500000, "ngn"), /NGN\s5,000\.00/);
  assert.match(formatMoney(25000, "kes"), /KES\s250\.00/);
  assert.match(formatMoney(1500, "ghs"), /GHS\s15\.00/);

  const order = {
    id: `ord_${"ab".repeat(16)}`,
    idempotencyKey: "receipt-order",
    productKey: "cowrie_15_v1",
    playerId: "player_receipt_test_1",
    email: "buyer<script>@example.com",
    residenceCountry: "GB",
    baseCurrency: "gbp",
    baseAmountMinor: 499,
    waiverVersion: WAIVER_VERSION,
    waiverAcceptedAt: 1700000000000,
    adultConfirmed: true,
    state: "fulfilled",
    checkoutSessionId: "cs_test_mock_receipt",
    checkoutUrl: null,
    paymentIntentId: "pi_mock_receipt",
    presentmentCurrency: "eur",
    presentmentAmountMinor: 1599,
    receiptStatus: "pending",
    receiptId: null,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
  const purchase = purchaseReceipt({ order, amountMinor: 1599, currency: "eur", taxMinor: 200, at: 1700000000000, replyTo: "team@classesforculture.com" });
  assert.equal(purchase.subject, "Your What's Your Bride Price? receipt – 15 Cowries (ABABABAB)");
  assert.equal(purchase.replyTo, "team@classesforculture.com");
  assert.match(purchase.text, /€15\.99/);
  assert.match(purchase.text, /Tax: €2\.00/);
  assert.match(purchase.text, /14 November 2023/);
  assert.match(purchase.text, /https:\/\/brideprice\.classesforculture\.com\/refunds/);
  assert.match(purchase.html, /What's Your Bride Price\?/);
  assert.match(purchase.html, /buyer&lt;script&gt;@example\.com/);
  assert.equal(purchase.html.includes("<script>"), false);
  assert.match(purchase.html, /PLACEHOLDER for owner approval/);
  const refund = refundReceipt({ order, amountMinor: 500000, currency: "ngn", at: 1700000000000, replyTo: "team@classesforculture.com" });
  assert.match(refund.subject, /refund – 15 Cowries \(ABABABAB\)/);
  assert.match(refund.html, /buyer&lt;script&gt;@example\.com/);
  assert.match(refund.text, /NGN\s5,000\.00/);
  assert.equal(refund.html.includes("<script>"), false);

  const calls = [];
  const resend = createResendEmail({
    apiKey: "re_test",
    from,
    replyTo: "team@classesforculture.com",
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
    },
  });
  const sent = await resend.send(purchase);
  assert.equal(sent.provider, "resend");
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].body.from, from);
  assert.equal(calls[0].body.reply_to, "team@classesforculture.com");
  assert.equal(calls[0].body.subject, purchase.subject);
  assert.match(calls[0].body.html, /buyer&lt;script&gt;@example\.com/);
  assert.equal(String(calls[0].body.html).includes("<script>"), false);
});
