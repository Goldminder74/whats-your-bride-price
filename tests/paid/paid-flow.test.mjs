import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { regions } from "../../app/gameData.ts";
import { CANONICAL_ORIGIN, DEFAULT_PAID_BLOCKED_COUNTRIES, PURCHASES_UNAVAILABLE_MESSAGE, WAIVER_TEXT, blockedPurchaseCountries } from "../../paid/catalog.ts";
import { createMockEmail, createResendEmail, parseReceiptFrom } from "../../paid/email.ts";
import { formatMoney, purchaseReceipt, refundReceipt } from "../../paid/receipt.ts";
import { WAIVER_VERSION } from "../../paid/catalog.ts";
import { paidSchemaSql } from "../../paid/schemaSql.ts";
import { createMemoryRepository } from "../../paid/repository.ts";
import { readPaidConfig, servePaid } from "../../paid/serve.ts";
import { automaticTaxEnabled, checkoutSessionParams, createStripeRefund, createStripeSession, verifyStripeSignature } from "../../paid/stripe.ts";

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
    blockedCountries: overrides.blockedCountries,
    refundBlockedPayment: overrides.refundBlockedPayment,
    assets: overrides.assets,
    royalRevealEnabled: overrides.royalRevealEnabled,
    ownerStatsToken: overrides.ownerStatsToken,
    randomBank: overrides.randomBank,
    earnPaths: overrides.earnPaths,
    shareCards: overrides.shareCards,
  };
}

function request(path, init = {}, country) {
  const req = new Request(`https://brideprice.classesforculture.com${path}`, init);
  if (country) Object.defineProperty(req, "cf", { value: { country } });
  return req;
}

async function body(response) {
  return response.json();
}

test("schema file matches the Worker bootstrap SQL", async () => {
  const legacy = await readFile(new URL("../../migrations/0001_paid_orders.sql", import.meta.url), "utf8");
  const phase = await readFile(new URL("../../migrations/0002_paid_phase0.sql", import.meta.url), "utf8");
  const earn = await readFile(new URL("../../migrations/0003_paid_earn.sql", import.meta.url), "utf8");
  const daily = await readFile(new URL("../../migrations/0004_paid_daily.sql", import.meta.url), "utf8");
  assert.equal(`${legacy.trim()}\n${phase.trim()}\n${earn.trim()}\n${daily.trim()}`, paidSchemaSql.trim());
  assert.doesNotMatch(daily, /DROP TABLE|DELETE FROM/i);
  assert.match(paidSchemaSql, /paid_orders/);
  assert.match(paidSchemaSql, /paid_attempts/);
  assert.match(paidSchemaSql, /paid_stats_daily/);
  assert.match(paidSchemaSql, /paid_earn_grants/);
  assert.match(phase, /ADD COLUMN expires_at/);
  assert.doesNotMatch(phase, /DROP TABLE|DELETE FROM paid_entitlements/i);
  assert.doesNotMatch(earn, /DROP TABLE|DELETE FROM/i);
});

test("canonical pages use the public game origin", async () => {
  const home = await servePaid(request("/"), services());
  const html = await home.text();
  assert.match(html, new RegExp(`rel="canonical" href="${CANONICAL_ORIGIN}/"`));
  assert.match(html, new RegExp(`property="og:url" content="${CANONICAL_ORIGIN}/"`));
  assert.doesNotMatch(html, /chatgpt\.site/);
  const privacy = await (await servePaid(request("/privacy"), services())).text();
  assert.match(privacy, /Ayo Ayeni, trading as Classes for Culture/);
  assert.match(privacy, /35 Melrose Avenue, Borehamwood, Hertfordshire, WD6 2BH, United Kingdom/);
  assert.doesNotMatch(privacy, /ICO registration|ICO number/i);
  assert.match(privacy, /Google Workspace, Google Drive and ChatGPT Sites are not part/);
  assert.match(privacy, new RegExp(`rel="canonical" href="${CANONICAL_ORIGIN}/privacy"`));
  const terms = await (await servePaid(request("/terms"), services())).text();
  assert.match(terms, /35 Melrose Avenue, Borehamwood, Hertfordshire, WD6 2BH, United Kingdom/);
  const refunds = await (await servePaid(request("/refunds"), services())).text();
  assert.match(refunds, /14-day/);
  assert.match(refunds, /35 Melrose Avenue, Borehamwood, Hertfordshire, WD6 2BH, United Kingdom/);
  assert.doesNotMatch(html, /Melrose Avenue|WD6 2BH/);
  assert.doesNotMatch(`${privacy}${terms}${refunds}${html}`, /PLACEHOLDER|owner approval/i);
  const shelled = await (await servePaid(request("/"), services({
    assets: { async fetch(assetRequest) {
      return new URL(assetRequest.url).pathname === "/index.html"
        ? new Response("<!doctype html><title>What’s Your Bride Price?</title><h1>DO YOU KNOW YOUR ROOTS?</h1>", { status: 200 })
        : new Response("missing", { status: 404 });
    } },
  }))).text();
  assert.match(shelled, /DO YOU KNOW YOUR ROOTS/);
  assert.doesNotMatch(shelled, /Melrose Avenue/);
});

test("question payloads omit answer keys and completions stay off the order database", async () => {
  let repositoryCalls = 0;
  const repository = new Proxy({}, { get: () => async () => { repositoryCalls += 1; throw new Error("database"); } });
  const kv = memoryKv();
  const app = services({ repository, kv });
  const questions = await body(await servePaid(request("/api/paid/questions?edition=west"), app));
  assert.equal(questions.length, regions.west.questions.length);
  assert.equal("correct" in questions[0], false);
  const pictured = questions.filter((question) => question.kind === "image");
  assert.equal(pictured.length, 2);
  for (const question of pictured) {
    assert.equal(question.images.length, question.options.length);
    assert.equal(question.images.some((src) => question.options.some((label) => src.toLowerCase().includes(label.toLowerCase().split(" ")[0]))), false);
  }
  const home = await (await servePaid(request("/"), app)).text();
  assert.match(home, /Photo for question/);
  assert.match(home, /question\.kind==="image"/);
  assert.doesNotMatch(home, /alt="'\+escapeHtml\(label\)/);
  repositoryCalls = 0;
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
  assert.equal(access.cowries, 10);

  const again = await servePaid(request("/api/paid/mock-pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: checkout.orderId }),
  }), app);
  assert.equal(again.status, 200);
  assert.equal(email.sent.length, 1);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 10);
});

test("signed refunds revoke only that purchase and partial refunds wait for review", async () => {
  const app = services();
  const playerId = "player_refund_test_01";
  const checkout = await body(await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "refund-order" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "NG", playerId, adult: true }),
  }), app));
  await servePaid(request("/api/paid/mock-pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: checkout.orderId }),
  }), app);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 10);

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
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 10);

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
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 0);

  const tampered = await servePaid(request("/api/paid/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1700000000,v1=deadbeef" },
    body: "{}",
  }), app);
  assert.equal(tampered.status, 400);
});

test("Stripe session requests keep Adaptive Pricing and leave tax off unless asked", async () => {
  assert.equal(automaticTaxEnabled(undefined), false);
  assert.equal(automaticTaxEnabled("off"), false);
  assert.equal(automaticTaxEnabled("on"), true);
  const shared = {
    orderId: "ord_" + "ab".repeat(16),
    productName: "Royal Reveal",
    amountMinor: 199,
    successUrl: "https://brideprice.classesforculture.com/checkout/return?order=1&session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://brideprice.classesforculture.com/",
    customerEmail: "buyer@example.com",
    waiverText: WAIVER_TEXT,
  };
  const params = checkoutSessionParams(shared);
  assert.equal(params.get("adaptive_pricing[enabled]"), "true");
  assert.equal(params.get("billing_address_collection"), "required");
  assert.equal(params.get("automatic_tax[enabled]"), null);
  assert.equal(params.get("tax_id_collection[enabled]"), null);
  assert.equal(params.get("line_items[0][price_data][tax_behavior]"), null);
  assert.equal(params.get("line_items[0][price_data][currency]"), "gbp");
  assert.equal(params.get("line_items[0][price_data][unit_amount]"), "199");
  assert.equal(params.get("consent_collection[terms_of_service]"), "required");
  assert.match(params.get("custom_text[terms_of_service_acceptance][message]"), /\[Terms of Service\]\(https:\/\/brideprice\.classesforculture\.com\/terms\)/);
  assert.match(params.get("custom_text[after_submit][message]"), /mailto:team@classesforculture\.com/);
  const taxed = checkoutSessionParams({ ...shared, automaticTax: true });
  assert.equal(taxed.get("automatic_tax[enabled]"), "true");
  assert.equal(taxed.get("tax_id_collection[enabled]"), "true");
  assert.equal(taxed.get("line_items[0][price_data][tax_behavior]"), "exclusive");
  assert.equal(taxed.get("adaptive_pricing[enabled]"), "true");
  let recorded = "";
  const app = services({
    config: { stripeMode: "test", stripeSecretKey: "sk_test_example", webhookSecret, publicOrigin: CANONICAL_ORIGIN, automaticTax: false },
    stripeFetch: async (_url, init) => {
      recorded = String(init.body);
      return new Response(JSON.stringify({ id: "cs_test_live_shape", url: "https://checkout.stripe.com/c/pay/cs_test_live_shape" }), { status: 200 });
    },
  });
  const response = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "stripe-shape" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "KE", playerId: "player_shape_test_01", adult: true }),
  }), app);
  assert.equal(response.status, 200);
  assert.match(recorded, /adaptive_pricing(?:%5B|\[)enabled(?:%5D|\])=true/);
  assert.doesNotMatch(recorded, /automatic_tax|tax_id_collection|tax_behavior/);
  recorded = "";
  const taxedApp = services({
    config: { stripeMode: "test", stripeSecretKey: "sk_test_example", webhookSecret, publicOrigin: CANONICAL_ORIGIN, automaticTax: true },
    stripeFetch: async (_url, init) => {
      recorded = String(init.body);
      return new Response(JSON.stringify({ id: "cs_test_tax_shape", url: "https://checkout.stripe.com/c/pay/cs_test_tax_shape" }), { status: 200 });
    },
  });
  const taxedResponse = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "stripe-shape-tax" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "KE", playerId: "player_shape_test_01", adult: true }),
  }), taxedApp);
  assert.equal(taxedResponse.status, 200);
  assert.match(recorded, /automatic_tax(?:%5B|\[)enabled(?:%5D|\])=true/);
  const terms = await (await servePaid(request("/terms"), services())).text();
  assert.match(terms, /Prices shown are the final price/);
  assert.doesNotMatch(terms, /may add tax/);
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
  assert.equal(granted.cowries, 10);
  assert.equal(granted.royal, false);
  const spent = await body(await servePaid(request("/api/paid/cowries/spend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId, count: 2 }),
  }), app));
  assert.equal(spent.cowries, 8);
  await kv.put(`cowrie:${playerId}`, "99");
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 8);
  const overspend = await servePaid(request("/api/paid/cowries/spend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId, count: 9 }),
  }), app);
  assert.equal(overspend.status, 409);
  assert.equal((await body(overspend)).error, "insufficient_cowries");
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 8);

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

test("paid checkout blocks the EU and EEA while free play stays open", async () => {
  assert.equal(DEFAULT_PAID_BLOCKED_COUNTRIES.length, 30);
  assert.equal(DEFAULT_PAID_BLOCKED_COUNTRIES.includes("DE"), true);
  assert.equal(DEFAULT_PAID_BLOCKED_COUNTRIES.includes("IS"), true);
  assert.equal(DEFAULT_PAID_BLOCKED_COUNTRIES.includes("LI"), true);
  assert.equal(DEFAULT_PAID_BLOCKED_COUNTRIES.includes("NO"), true);
  assert.equal(DEFAULT_PAID_BLOCKED_COUNTRIES.includes("GB"), false);
  assert.equal(blockedPurchaseCountries(undefined).has("FR"), true);
  assert.equal(blockedPurchaseCountries("none").size, 0);
  assert.equal(blockedPurchaseCountries("US,NG").has("DE"), false);
  assert.equal(blockedPurchaseCountries("not-a-country").has("DE"), true);

  const refundsCalled = [];
  const app = services({ refundBlockedPayment: async (id) => { refundsCalled.push(id); } });
  const home = await (await servePaid(request("/"), app)).text();
  assert.match(home, /Purchases aren't available in your country yet\. You can still play for free!/);
  const terms = await (await servePaid(request("/terms"), app)).text();
  assert.match(terms, /not offered in the EU/);
  const refunds = await (await servePaid(request("/refunds"), app)).text();
  assert.match(refunds, /Iceland, Liechtenstein, or Norway/);
  const catalog = await body(await servePaid(request("/api/paid/catalog", {}, "DE"), app));
  assert.equal(catalog.purchasesBlocked, true);
  assert.equal(catalog.blockedCountries.includes("GB"), false);
  assert.equal(catalog.purchaseBlockedMessage, PURCHASES_UNAVAILABLE_MESSAGE);

  const playerId = "player_country_block_1";
  const checkoutBody = (country, waiver) => JSON.stringify({
    productKey: "cowrie_5_v1", email: "buyer@example.com", country, playerId, adult: true, waiver,
  });
  const headers = { "content-type": "application/json", "idempotency-key": "country-block-de" };
  const edgeBlocked = await servePaid(request("/api/paid/checkout", { method: "POST", headers, body: checkoutBody("US", false) }, "DE"), app);
  assert.equal(edgeBlocked.status, 403);
  assert.equal((await body(edgeBlocked)).message, PURCHASES_UNAVAILABLE_MESSAGE);
  const selectedBlocked = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { ...headers, "idempotency-key": "country-block-fr" },
    body: checkoutBody("FR", true),
  }), app);
  assert.equal(selectedBlocked.status, 403);
  const answers = regions.west.questions.map((question) => [...question.correct]);
  const played = await servePaid(request("/api/paid/games/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ edition: "west", answers }),
  }, "DE"), app);
  assert.equal(played.status, 200);

  const allowed = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { ...headers, "idempotency-key": "country-block-us" },
    body: checkoutBody("US", false),
  }), app);
  assert.equal(allowed.status, 200);
  const checkout = await body(allowed);
  const order = await app.repository.getById(checkout.orderId);
  assert.ok(order);
  const rawEvent = {
    id: "evt_blocked_billing_de",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: {
      id: order.checkoutSessionId,
      client_reference_id: order.id,
      payment_status: "paid",
      amount_total: 199,
      currency: "gbp",
      payment_intent: `pi_blocked_${order.id.slice(4)}`,
      customer_details: { address: { country: "DE" } },
      metadata: { order_id: order.id },
    } },
  };
  const raw = JSON.stringify(rawEvent);
  const timestamp = Math.floor(now / 1000);
  const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${raw}`).digest("hex");
  const webhook = await servePaid(request("/api/paid/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    body: raw,
  }), app);
  assert.equal(webhook.status, 200);
  assert.deepEqual(refundsCalled, [`pi_blocked_${order.id.slice(4)}`]);
  const closed = await body(await servePaid(request(`/api/paid/orders/${order.id}`), app));
  assert.equal(closed.state, "refunded");
  assert.equal(closed.entitlement, null);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 0);
  assert.equal(app.email.sent.length, 0);
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
  assert.match(purchase.text, /Thanks for your purchase! Here's your receipt\./);
  assert.match(purchase.html, /Thanks for your purchase! Here&#39;s your receipt\./);
  assert.match(purchase.html, /bgcolor="#ffffff"/);
  assert.match(purchase.html, /#1a1a1a/);
  assert.match(purchase.html, /#e6e6e6/);
  assert.match(purchase.html, /bgcolor="#f0a11a"/);
  assert.doesNotMatch(purchase.html, /#1d120b|#2a1b12|#f6efe4/);
  assert.match(purchase.html, /What's Your Bride Price\?/);
  assert.match(purchase.html, /buyer&lt;script&gt;@example\.com/);
  assert.equal(purchase.html.includes("<script>"), false);
  assert.match(purchase.html, /I want my Cowries straight away/);
  assert.match(purchase.text, /I want my Cowries straight away/);
  assert.doesNotMatch(`${purchase.html}${purchase.text}`, /PLACEHOLDER|owner approval/i);
  assert.doesNotMatch(purchase.html, /Melrose Avenue|WD6 2BH/);
  assert.doesNotMatch(purchase.text, /Melrose Avenue|WD6 2BH/);
  const refund = refundReceipt({ order, amountMinor: 500000, currency: "ngn", at: 1700000000000, replyTo: "team@classesforculture.com" });
  assert.match(refund.text, /Here's your refund\./);
  assert.match(refund.html, /Here&#39;s your refund\./);
  assert.match(refund.html, /bgcolor="#ffffff"/);
  assert.doesNotMatch(refund.html, /#1d120b|#2a1b12/);
  assert.match(refund.subject, /refund – 15 Cowries \(ABABABAB\)/);
  assert.match(refund.html, /buyer&lt;script&gt;@example\.com/);
  assert.match(refund.text, /NGN\s5,000\.00/);
  assert.doesNotMatch(refund.html, /Melrose Avenue|WD6 2BH/);
  assert.doesNotMatch(refund.text, /Melrose Avenue|WD6 2BH/);
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

test("STRIPE_MODE defaults to test and live mode accepts only a matching key, session, and webhook", async () => {
  const from = "What's Your Bride Price? <noreply@mail.classesforculture.com>";
  const env = {
    STRIPE_API_MODE: "test",
    STRIPE_WEBHOOK_SECRET: webhookSecret,
    EMAIL_FROM: from,
    PUBLIC_APP_ORIGIN: CANONICAL_ORIGIN,
  };
  const testConfig = readPaidConfig({ ...env, STRIPE_SECRET_KEY: "sk_test_example" });
  assert.equal(testConfig.stripeMode, "test");
  assert.throws(() => readPaidConfig({ ...env, STRIPE_SECRET_KEY: "rk_live_restricted" }), (error) => error.code === "stripe_live_key_rejected");
  assert.throws(() => readPaidConfig({ ...env, STRIPE_SECRET_KEY: "sk_live_secret" }), (error) => error.code === "stripe_live_key_rejected");
  assert.equal(readPaidConfig({ ...env, STRIPE_MODE: "live", STRIPE_SECRET_KEY: "rk_live_restricted" }).stripeMode, "live");
  assert.equal(readPaidConfig({ ...env, STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_live_secret" }).stripeMode, "live");
  assert.throws(() => readPaidConfig({ ...env, STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_test_example" }), (error) => error.code === "stripe_test_key_rejected");
  assert.throws(() => readPaidConfig({ ...env, STRIPE_MODE: "live", STRIPE_SECRET_KEY: "rk_test_restricted" }), (error) => error.code === "stripe_test_key_rejected");
  assert.throws(() => readPaidConfig({ ...env, STRIPE_MODE: "live", STRIPE_API_MODE: "mock", STRIPE_SECRET_KEY: "rk_live_restricted" }), (error) => error.code === "stripe_mode_mismatch");

  assert.equal((await body(await servePaid(request("/api/paid/health"), services()))).stripeMode, "mock");
  const liveConfig = { stripeMode: "live", stripeSecretKey: "rk_live_restricted", webhookSecret, publicOrigin: CANONICAL_ORIGIN, automaticTax: false };
  assert.equal((await body(await servePaid(request("/api/paid/health"), services({ config: liveConfig })))).stripeMode, "live");
  const testRuntime = { stripeMode: "test", stripeSecretKey: "sk_test_example", webhookSecret, publicOrigin: CANONICAL_ORIGIN, automaticTax: false };
  assert.equal((await body(await servePaid(request("/api/paid/health"), services({ config: testRuntime })))).stripeMode, "test");

  let recorded = null;
  const liveApp = services({
    config: liveConfig,
    stripeFetch: async (url, init) => {
      recorded = { url: String(url), authorization: init.headers.authorization, body: String(init.body) };
      return new Response(JSON.stringify({ id: "cs_live_restricted_key", url: "https://checkout.stripe.com/c/pay/cs_live_restricted_key", livemode: true }), { status: 200 });
    },
  });
  const created = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "live-rk-checkout" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "US", playerId: "player_live_mode_01", adult: true }),
  }), liveApp);
  assert.equal(created.status, 200, JSON.stringify(await created.clone().json()));
  const checkout = await body(created);
  assert.equal(recorded.url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(recorded.authorization, "Bearer rk_live_restricted");
  assert.match(recorded.body, /consent_collection(?:%5B|\[)terms_of_service(?:%5D|\])=required/);
  assert.match(recorded.body, /brideprice\.classesforculture\.com(?:%2F|\/)terms/);
  assert.match(recorded.body, /mailto(?:%3A|:)team(?:%40|@)classesforculture\.com/);

  async function postEvent(app, event) {
    const raw = JSON.stringify(event);
    const timestamp = Math.floor(now / 1000);
    const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${raw}`).digest("hex");
    return servePaid(request("/api/paid/webhook", {
      method: "POST",
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
      body: raw,
    }), app);
  }

  const testEvent = await postEvent(liveApp, {
    id: "evt_live_rejects_test_0001",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { id: "cs_test_should_not_mix", client_reference_id: checkout.orderId, payment_status: "paid", amount_total: 199, currency: "gbp", payment_intent: "pi_test_mix" } },
  });
  assert.equal(testEvent.status, 400);
  assert.equal((await body(testEvent)).error, "stripe_mode_mismatch");

  const liveSessionOnTest = await postEvent(services({ config: testRuntime }), {
    id: "evt_test_rejects_live_0001",
    type: "checkout.session.completed",
    livemode: true,
    data: { object: { id: "cs_live_should_not_mix", client_reference_id: checkout.orderId, payment_status: "paid", amount_total: 199, currency: "gbp", payment_intent: "pi_live_mix" } },
  });
  assert.equal(liveSessionOnTest.status, 400);
  assert.equal((await body(liveSessionOnTest)).error, "stripe_live_event_rejected");

  const paid = await postEvent(liveApp, {
    id: "evt_live_paid_0001",
    type: "checkout.session.completed",
    livemode: true,
    data: { object: {
      id: "cs_live_restricted_key",
      client_reference_id: checkout.orderId,
      payment_status: "paid",
      amount_total: 199,
      currency: "gbp",
      payment_intent: "pi_live_restricted",
      metadata: { order_id: checkout.orderId },
    } },
  });
  assert.equal(paid.status, 200);
  assert.equal((await body(await servePaid(request(`/api/paid/orders/${checkout.orderId}`), liveApp))).state, "fulfilled");

  const calls = [];
  await createStripeRefund("rk_live_restricted", "pi_live_restricted", "live", async (url, init) => {
    calls.push({ url: String(url), authorization: init.headers.authorization, body: String(init.body) });
    return new Response(JSON.stringify({ id: "re_live_1", livemode: true }), { status: 200 });
  });
  assert.equal(calls[0].url, "https://api.stripe.com/v1/refunds");
  assert.equal(calls[0].authorization, "Bearer rk_live_restricted");
  assert.match(calls[0].body, /payment_intent=pi_live_restricted/);
  await assert.rejects(createStripeRefund("sk_test_example", "pi_live_restricted", "live", async () => {
    throw new Error("fetch should not run");
  }), (error) => error.code === "stripe_test_key_rejected");
  await assert.rejects(createStripeRefund("rk_live_restricted", "pi_test_restricted", "test", async () => {
    throw new Error("fetch should not run");
  }), (error) => error.code === "stripe_live_key_rejected");
  await assert.rejects(createStripeSession("rk_live_restricted", new URLSearchParams(), "idem-live", "live", async () => {
    return new Response(JSON.stringify({ id: "cs_test_wrong_mode", url: "https://checkout.stripe.com/c/pay/cs_test_wrong_mode", livemode: false }), { status: 200 });
  }), (error) => error.code === "stripe_mode_mismatch");
});

test("two free games then a paywall, idempotent resume, welcome bonus, and hidden Royal Reveal", async () => {
  const app = services({ ownerStatsToken: "owner-token-value" });
  const playerId = "player_phase0_test_01";
  const catalog = await body(await servePaid(request("/api/paid/catalog"), app));
  assert.equal(catalog.products.some((product) => product.kind === "royal_reveal"), false);
  assert.equal(catalog.products.find((product) => product.key === "cowrie_5_v1").games, 1);
  const hidden = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "royal-hidden" },
    body: JSON.stringify({ productKey: "royal_reveal_v1", email: "buyer@example.com", country: "US", playerId, adult: true }),
  }), app);
  assert.equal(hidden.status, 404);
  assert.equal((await body(hidden)).error, "royal_reveal_unavailable");

  async function begin(attemptId) {
    return servePaid(request("/api/paid/games/begin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId, attemptId, edition: "west" }),
    }), app);
  }
  async function finish(attemptId) {
    return servePaid(request("/api/paid/games/finish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId, attemptId }),
    }), app);
  }

  const first = await body(await begin("attempt_phase0_free_0001"));
  assert.equal(first.mode, "free");
  assert.equal(first.freeGamesLeft, 2);
  const resumed = await body(await begin("attempt_phase0_free_0001"));
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.cowries, 0);
  const secondStart = await body(await begin("attempt_phase0_free_0002"));
  assert.equal(secondStart.attemptId, "attempt_phase0_free_0001");
  const done = await body(await finish("attempt_phase0_free_0001"));
  assert.equal(done.showPaywall, false);
  assert.equal(done.wallet.freeGamesLeft, 1);
  const second = await body(await begin("attempt_phase0_free_0002"));
  assert.equal(second.mode, "free");
  assert.equal(second.resumed, false);
  const lastFree = await body(await finish("attempt_phase0_free_0002"));
  assert.equal(lastFree.showPaywall, true);
  assert.equal(lastFree.wallet.freeGamesLeft, 0);
  const blocked = await begin("attempt_phase0_paid_0003");
  assert.equal(blocked.status, 402);
  assert.equal((await body(blocked)).error, "cowries_required");

  const checkout = await body(await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "phase0-first-buy" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "US", playerId, adult: true }),
  }), app));
  await servePaid(request("/api/paid/mock-pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: checkout.orderId }),
  }), app);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 10);
  const again = await body(await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "phase0-second-buy" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "US", playerId, adult: true }),
  }), app));
  await servePaid(request("/api/paid/mock-pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: again.orderId }),
  }), app);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app))).cowries, 15);

  const paidStart = await body(await begin("attempt_phase0_paid_0003"));
  assert.equal(paidStart.mode, "paid");
  assert.equal(paidStart.cowries, 10);
  const replay = await body(await begin("attempt_phase0_paid_0003"));
  assert.equal(replay.resumed, true);
  assert.equal(replay.cowries, 10);

  const refund = {
    id: "evt_phase0_refund_0001",
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
  const after = await body(await servePaid(request(`/api/paid/access?player=${playerId}`), app));
  assert.equal(after.cowries >= 0, true);
  assert.equal(after.cowries, 5);

  const stats = await servePaid(request("/api/paid/owner/stats", { headers: { "x-owner-stats-token": "owner-token-value" } }), app);
  assert.equal(stats.status, 200);
  const days = (await body(stats)).days;
  assert.equal(days.some((row) => row.event === "game_start" && row.detail === "free"), true);
  assert.equal(days.some((row) => row.event === "purchase_complete"), true);
  assert.equal((await servePaid(request("/api/paid/owner/stats"), services())).status, 503);
  assert.equal((await servePaid(request("/api/paid/owner/stats", { headers: { "x-owner-stats-token": "wrong" } }), app)).status, 401);
});

test("random bank returns twelve resumable questions and scores that round", async () => {
  const kv = memoryKv();
  const app = services({ kv, randomBank: true });
  const first = await body(await servePaid(request("/api/paid/questions?edition=west&player=player_local_test_01"), app));
  assert.equal(first.questions.length, 12);
  assert.equal("correct" in first.questions[0], false);
  assert.match(first.roundId, /^[a-f0-9]{32}$/);
  const again = await body(await servePaid(request(`/api/paid/questions?edition=west&round=${first.roundId}`), app));
  assert.deepEqual(again.questions.map((question) => question.prompt), first.questions.map((question) => question.prompt));
  assert.deepEqual(again.questions.map((question) => question.options), first.questions.map((question) => question.options));
  const stored = JSON.parse(kv.map.get(`round:${first.roundId}`));
  const answers = stored.questions.map((question) => question.correct);
  const completed = await body(await servePaid(request("/api/paid/games/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ edition: "west", roundId: first.roundId, answers }),
  }), app));
  assert.equal(completed.score, 12);
  assert.equal(completed.total, 12);
  for (const question of first.questions.filter((item) => item.kind === "image")) {
    assert.equal(question.images.some((src) => question.options.some((label) => src.toLowerCase().includes(label.toLowerCase().split(" ")[0]))), false);
  }
});
