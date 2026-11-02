import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { regions } from "../../app/gameData.ts";
import { CANONICAL_ORIGIN } from "../../paid/catalog.ts";
import { createMockEmail } from "../../paid/email.ts";
import { createMemoryRepository } from "../../paid/repository.ts";
import { servePaid } from "../../paid/serve.ts";
import { pngSize } from "../../paid/shareCardPng.ts";
import { loadPublished } from "../../question-bank/loader.ts";

const webhookSecret = "whsec_local_test_secret_value";
const now = 1_700_000_000_000;
const playerId = "player_royal_reveal_01";

function memoryKv() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, value); },
  };
}

function services(overrides = {}) {
  return {
    email: overrides.email ?? createMockEmail(),
    now: () => now,
    repository: overrides.repository ?? createMemoryRepository(),
    kv: overrides.kv ?? memoryKv(),
    config: {
      stripeMode: "mock",
      stripeSecretKey: "sk_test_mock_local_only",
      webhookSecret,
      publicOrigin: CANONICAL_ORIGIN,
    },
    royalRevealEnabled: overrides.royalRevealEnabled,
  };
}

function request(path, init = {}) {
  return new Request(`https://brideprice.classesforculture.com${path}`, init);
}

async function body(response) {
  return response.json();
}

test("Royal Reveal stays hidden and terms still say it is not offered", async () => {
  const app = services();
  const catalog = await body(await servePaid(request("/api/paid/catalog"), app));
  assert.equal(catalog.royalReveal, false);
  assert.equal(catalog.products.some((product) => product.kind === "royal_reveal"), false);
  const terms = await (await servePaid(request("/terms"), app)).text();
  assert.match(terms, /Royal Reveal is not currently offered/);
  const hidden = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "royal-still-hidden" },
    body: JSON.stringify({ productKey: "royal_reveal_v1", email: "buyer@example.com", country: "US", playerId, adult: true, resultId: "ab".repeat(16), displayName: "Ayo" }),
  }), app);
  assert.equal(hidden.status, 404);
});

test("a paid result mints a private decree bundle and a refund removes it", async () => {
  const email = createMockEmail();
  const kv = memoryKv();
  const app = services({ email, kv, royalRevealEnabled: true });
  const offered = await (await servePaid(request("/terms"), app)).text();
  assert.match(offered, /Royal Reveal Pack is a £1\.99 one-off/);
  const answers = regions.west.questions.map((question) => [...question.correct]);
  const completed = await body(await servePaid(request("/api/paid/games/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ edition: "west", answers, playerId }),
  }), app));
  assert.equal(completed.score, 12);

  const stranger = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "royal-stranger" },
    body: JSON.stringify({ productKey: "royal_reveal_v1", email: "buyer@example.com", country: "US", playerId: "player_royal_other_01", adult: true, resultId: completed.id, displayName: "Ayo" }),
  }), app);
  assert.equal(stranger.status, 403);

  const badName = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "royal-name" },
    body: JSON.stringify({ productKey: "royal_reveal_v1", email: "buyer@example.com", country: "US", playerId, adult: true, resultId: completed.id, displayName: "!!!" }),
  }), app);
  assert.equal(badName.status, 400);

  const checkout = await body(await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "royal-order" },
    body: JSON.stringify({ productKey: "royal_reveal_v1", email: "buyer@example.com", country: "US", playerId, adult: true, resultId: completed.id, displayName: "Ayo Ayeni" }),
  }), app));
  const paid = await servePaid(request("/api/paid/mock-pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: checkout.orderId }),
  }), app);
  assert.equal(paid.status, 200);
  assert.match(email.sent[0].text, /Royal Decree for this result/);

  const other = await servePaid(request("/api/paid/royal-reveal", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://brideprice.classesforculture.com" },
    body: JSON.stringify({ playerId: "player_royal_other_01", orderId: checkout.orderId }),
  }), app);
  assert.equal(other.status, 404);

  const claimResponse = await servePaid(request("/api/paid/royal-reveal", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://brideprice.classesforculture.com" },
    body: JSON.stringify({ playerId, orderId: checkout.orderId }),
  }), app);
  const claim = await body(claimResponse);
  assert.equal(claimResponse.status, 200);
  assert.equal(claim.displayName, "Ayo Ayeni");
  assert.equal(claim.tier, "Bride Price Royalty");
  assert.equal(claim.bridePrice, 50);
  assert.equal(claim.score, 12);
  assert.match(claim.certificate, /^RR-[0-9A-F]{10}$/);
  assert.ok(claim.facts.length >= 3 && claim.facts.length <= 5);
  const bank = await loadPublished("west");
  for (const fact of claim.facts) {
    const source = bank.find((question) => question.id === fact.id);
    const quote = (source?.gateReport?.evidenceQuote || "").replace(/[\u2014\u2013]/g, ", ").replace(/\s+/g, " ");
    assert.ok(quote.includes(fact.quote.slice(0, 40)), fact.id);
    assert.equal(fact.quote.includes("\u2014") || fact.quote.includes("\u2013"), false);
  }

  const card = await servePaid(request(claim.downloads.card), app);
  const cardBytes = new Uint8Array(await card.arrayBuffer());
  assert.equal(card.headers.get("x-royal-cache"), "miss");
  assert.equal(card.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(pngSize(cardBytes), { width: 1080, height: 1350 });
  const cardAgain = await servePaid(request(claim.downloads.card), app);
  assert.equal(cardAgain.headers.get("x-royal-cache"), "hit");

  const story = new Uint8Array(await (await servePaid(request(claim.downloads.story), app)).arrayBuffer());
  assert.deepEqual(pngSize(story), { width: 1080, height: 1920 });
  const pdf = new TextDecoder().decode(new Uint8Array(await (await servePaid(request(claim.downloads.pdf), app)).arrayBuffer()));
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /Ayo Ayeni/);
  assert.match(pdf, /quoted from the published/);
  const zip = new TextDecoder("latin1").decode(new Uint8Array(await (await servePaid(request(claim.downloads.zip), app)).arrayBuffer()));
  assert.match(zip, /royal-decree-1080x1350\.png/);
  assert.match(zip, /royal-decree-1080x1920\.png/);
  assert.match(zip, /royal-decree\.pdf/);

  const missing = await servePaid(request(`/api/paid/royal-reveal/${"ab".repeat(32)}/card.png`), app);
  assert.equal(missing.status, 404);

  const raw = JSON.stringify({
    id: "evt_royal_refund_0001",
    type: "charge.refunded",
    livemode: false,
    data: { object: { amount: 199, amount_refunded: 199, refunded: true, currency: "gbp", payment_intent: `pi_mock_${checkout.orderId.slice(4)}` } },
  });
  const timestamp = Math.floor(now / 1000);
  const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${raw}`).digest("hex");
  const refunded = await servePaid(request("/api/paid/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    body: raw,
  }), app);
  assert.equal(refunded.status, 200);
  assert.match(email.sent.at(-1).text, /can no longer be downloaded/);
  const revoked = await servePaid(request(claim.downloads.card), app);
  assert.equal(revoked.status, 404);
  const off = services({ kv, repository: app.repository, royalRevealEnabled: false });
  assert.equal((await servePaid(request(claim.downloads.zip), off)).status, 404);
});
