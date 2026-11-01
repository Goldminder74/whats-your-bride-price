import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { regions } from "../../app/gameData.ts";
import { CANONICAL_ORIGIN, WAIVER_TEXT } from "../../paid/catalog.ts";
import { createMockEmail, createResendEmail } from "../../paid/email.ts";
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
  assert.match(email.sent[0].text, /PLACEHOLDER/);
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

test("webhook signatures match Stripe HMAC and reject stale headers", async () => {
  const raw = "{\"id\":\"evt_test\"}";
  const timestamp = Math.floor(now / 1000);
  const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${raw}`).digest("hex");
  await verifyStripeSignature(raw, `t=${timestamp},v1=${signature}`, webhookSecret, now);
  await assert.rejects(() => verifyStripeSignature(raw, `t=${timestamp - 301},v1=${signature}`, webhookSecret, now), /stripe_signature_expired/);
});

test("receipts use Resend or Postmark from a subdomain", async () => {
  const calls = [];
  const resend = createResendEmail("re_test", "receipts@mail.classesforculture.com", async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
  });
  const sent = await resend.send({ to: "buyer@example.com", subject: "Receipt", text: "thanks", idempotencyKey: "ord_1" });
  assert.equal(sent.provider, "resend");
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].body.from, "receipts@mail.classesforculture.com");
  assert.throws(() => createResendEmail("re_test", "receipts@classesforculture.com"), /email_from_must_be_subdomain/);
});
