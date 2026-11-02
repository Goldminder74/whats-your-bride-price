import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { regions } from "../../app/gameData.ts";
import { CANONICAL_ORIGIN, DEFAULT_PURCHASE_COUNTRY, ROYAL_WAIVER_TEXT, ROYAL_WAIVER_VERSION, WAIVER_TEXT, WAIVER_VERSION } from "../../paid/catalog.ts";
import { createMockEmail } from "../../paid/email.ts";
import { validateDisplayName } from "../../paid/nickname.ts";
import { buildRevealRecording } from "../../paid/revealOffer.ts";
import { createMemoryRepository } from "../../paid/repository.ts";
import { servePaid } from "../../paid/serve.ts";
import { DECREE_PREVIEW_HEIGHT, DECREE_PREVIEW_NAME, DECREE_PREVIEW_WIDTH, decreeNamePrefill, previewDisplayName } from "../../paid/decreePreviewName.ts";
import { royalDecreeSvg } from "../../paid/royalDecree.ts";
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
    config: overrides.config ?? {
      stripeMode: "mock",
      stripeSecretKey: "sk_test_mock_local_only",
      webhookSecret,
      publicOrigin: CANONICAL_ORIGIN,
    },
    stripeFetch: overrides.stripeFetch,
    royalRevealEnabled: overrides.royalRevealEnabled,
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

test("Royal Reveal stays hidden and terms still say it is not offered", async () => {
  const app = services();
  const catalog = await body(await servePaid(request("/api/paid/catalog"), app));
  const decree = royalDecreeSvg({
    edition: "west",
    score: 9,
    displayName: "Ayo Ayeni",
    certificate: "RR-TEST0001",
    issuedAt: now,
    artwork: "data:image/jpeg;base64,AAAA",
  });
  assert.match(decree, /data:image\/jpeg;base64,AAAA/);
  assert.match(decree, /Issued by Classes for Culture/);
  assert.match(decree, /A playful culture score\. Not a measure of a person\./);
  assert.match(decree, /ellipse/);
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

test("Royal Reveal consent names the pack, and decree names use the public-name filter", async () => {
  assert.equal(validateDisplayName("Ángela"), "Ángela");
  assert.equal(validateDisplayName("O'Brien-Jean"), "O'Brien-Jean");
  for (const name of ["x dot com", "ayo at gmail", "ayo@gmail.com", "https://ayo.gg", "1234", "A", "oh fuck", "fu ck", "A".repeat(33)]) {
    assert.throws(() => validateDisplayName(name), (error) => error.code === "name_invalid" || error.code === "name_rejected");
  }
  const answers = regions.west.questions.map((question) => [...question.correct]);
  const kv = memoryKv();
  const email = createMockEmail();
  const repository = createMemoryRepository();
  const hidden = services({ kv, repository, email, royalRevealEnabled: true });
  const completed = await body(await servePaid(request("/api/paid/games/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ edition: "west", answers, playerId }),
  }), hidden));
  const rejected = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "royal-bad-name" },
    body: JSON.stringify({ productKey: "royal_reveal_v1", email: "buyer@example.com", country: "US", playerId, adult: true, resultId: completed.id, displayName: "x dot com" }),
  }), hidden);
  assert.equal(rejected.status, 400);
  assert.equal((await body(rejected)).message, "Choose a name of 2–32 letters. No email, link, or profanity.");

  let recorded = "";
  const stripeApp = services({
    kv,
    repository,
    email,
    royalRevealEnabled: true,
    config: { stripeMode: "test", stripeSecretKey: "sk_test_example", webhookSecret, publicOrigin: CANONICAL_ORIGIN },
    stripeFetch: async (_url, init) => {
      recorded = String(init.body);
      return new Response(JSON.stringify({ id: "cs_test_royal_consent", url: "https://checkout.stripe.com/c/pay/cs_test_royal_consent" }), { status: 200 });
    },
  });
  const royal = await body(await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "royal-gb-consent" },
    body: JSON.stringify({ productKey: "royal_reveal_v1", email: "buyer@example.com", country: "GB", playerId, adult: true, waiver: true, resultId: completed.id, displayName: "Ayo Ayeni" }),
  }), stripeApp));
  assert.equal(royal.orderId.startsWith("ord_"), true);
  assert.equal((await repository.getById(royal.orderId)).waiverVersion, ROYAL_WAIVER_VERSION);
  const royalSession = decodeURIComponent(recorded.replaceAll("+", " "));
  assert.match(royalSession, new RegExp(ROYAL_WAIVER_TEXT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(royalSession, /my Cowries/);

  const cowrieRecorded = { body: "" };
  const cowrieApp = services({
    config: { stripeMode: "test", stripeSecretKey: "sk_test_example", webhookSecret, publicOrigin: CANONICAL_ORIGIN },
    stripeFetch: async (_url, init) => {
      cowrieRecorded.body = String(init.body);
      return new Response(JSON.stringify({ id: "cs_test_cowrie_consent", url: "https://checkout.stripe.com/c/pay/cs_test_cowrie_consent" }), { status: 200 });
    },
  });
  const cowrie = await body(await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "cowrie-gb-consent" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "GB", playerId: "player_cowrie_consent_1", adult: true, waiver: true }),
  }), cowrieApp));
  assert.equal((await cowrieApp.repository.getById(cowrie.orderId)).waiverVersion, WAIVER_VERSION);
  assert.match(decodeURIComponent(cowrieRecorded.body.replaceAll("+", " ")), new RegExp(WAIVER_TEXT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(WAIVER_TEXT, "I want my Cowries straight away. I understand that once they're delivered I lose my 14-day right to cancel, unless they're faulty or not as described.");

  const mockPay = services({ kv, repository, email, royalRevealEnabled: true });
  assert.equal((await servePaid(request("/api/paid/mock-pay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: royal.orderId }),
  }), mockPay)).status, 200);
  assert.match(email.sent[0].text, /Royal Reveal Pack straight away/);
  assert.doesNotMatch(email.sent[0].text, /my Cowries/);
  const terms = await (await servePaid(request("/terms"), mockPay)).text();
  const refunds = await (await servePaid(request("/refunds"), mockPay)).text();
  assert.match(terms, /35 Melrose Avenue/);
  assert.match(terms, /I want my Cowries straight away/);
  assert.match(terms, /I want my Royal Reveal Pack straight away/);
  assert.match(refunds, /I want my Royal Reveal Pack straight away/);
  assert.match(refunds, /removes that result's decree download/);
});

test("decree names keep Yoruba and Igbo marks, and Royal checkout matches Cowrie country rules", async () => {
  assert.equal(DEFAULT_PURCHASE_COUNTRY, "GB");
  for (const name of ["Adébáyọ̀ O'Neil-Smith", "Chínwẹ́", "Ọládélé"]) {
    assert.equal(validateDisplayName(name.normalize("NFD")), name.normalize("NFC"));
  }
  const choices = Array.from({ length: 12 }, () => [0]);
  const ids = Array.from({ length: 12 }, (_, index) => `west_q_${index}`);
  assert.equal(buildRevealRecording({ royalOn: false, edition: "west", playerId, choices, questionIds: ids }), null);
  const freePlay = buildRevealRecording({ royalOn: true, edition: "west", playerId, choices, questionIds: ids });
  const dailyPlay = buildRevealRecording({ royalOn: true, edition: "east", playerId, choices, questionIds: ids });
  const paidPlay = buildRevealRecording({ royalOn: true, edition: "west", playerId, choices, roundId: "ab".repeat(16), questionIds: ids });
  assert.equal(freePlay.roundId, undefined);
  assert.equal(dailyPlay.questionIds.length, 12);
  assert.equal(paidPlay.roundId, "ab".repeat(16));

  const pool = await loadPublished("west");
  const questions = pool.slice(0, 12);
  const answers = questions.map((question) => [...question.correct]);
  const kv = memoryKv();
  const app = services({ kv, royalRevealEnabled: true });
  const scored = await body(await servePaid(request("/api/paid/games/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ edition: "west", answers, playerId, questionIds: questions.map((question) => question.id) }),
  }), app));
  assert.equal(scored.score, 12);
  assert.match(scored.id, /^[a-f0-9]{32}$/);
  const france = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "royal-fr" },
    body: JSON.stringify({ productKey: "royal_reveal_v1", email: "buyer@example.com", country: "FR", playerId, adult: true, waiver: true, resultId: scored.id, displayName: "Ada" }),
  }), app);
  assert.equal(france.status, 403);
  const edge = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "royal-edge-de" },
    body: JSON.stringify({ productKey: "royal_reveal_v1", email: "buyer@example.com", country: "GB", playerId, adult: true, waiver: true, resultId: scored.id, displayName: "Ada" }),
  }, "DE"), app);
  assert.equal(edge.status, 403);
  const britain = await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "royal-gb-open" },
    body: JSON.stringify({ productKey: "royal_reveal_v1", email: "buyer@example.com", country: "GB", playerId, adult: true, waiver: true, resultId: scored.id, displayName: "Ada" }),
  }), app);
  assert.equal(britain.status, 200);
});

test("the decree field starts from a saved nickname, not the result title", async () => {
  assert.equal(decreeNamePrefill("A Most Excellent Human"), "");
  assert.equal(decreeNamePrefill(null), "");
  assert.equal(decreeNamePrefill("Ayo"), "Ayo");
  assert.equal(previewDisplayName(""), DECREE_PREVIEW_NAME);
  assert.equal(previewDisplayName("Ayo"), "Ayo");
  const app = services();
  const missing = await body(await servePaid(request(`/api/paid/nickname?player=${playerId}`), app));
  assert.equal(missing.nickname, null);
  await app.repository.daily.setNickname(playerId, "Ayo", now);
  const saved = await body(await servePaid(request(`/api/paid/nickname?player=${playerId}`), app));
  assert.equal(saved.nickname, "Ayo");
  assert.equal(decreeNamePrefill(saved.nickname), "Ayo");
});

test("the purchase preview is a small watermarked decree and never the full card", async () => {
  assert.equal(previewDisplayName(""), DECREE_PREVIEW_NAME);
  assert.equal(previewDisplayName("x dot com"), DECREE_PREVIEW_NAME);
  assert.equal(previewDisplayName("Ángela"), "Ángela");
  const paid = royalDecreeSvg({ edition: "west", score: 9, displayName: "Ángela", certificate: "RR-TEST" });
  assert.equal(paid.includes(">PREVIEW<"), false);
  const marked = royalDecreeSvg({ edition: "west", score: 9, displayName: "Ángela", certificate: "PREVIEW", preview: true });
  assert.match(marked, />PREVIEW</);
  assert.match(marked, /WEST AFRICA EDITION/);
  assert.match(marked, /Ángela/);
  assert.match(marked, /ROYALTY/);

  const hidden = await servePaid(request("/api/paid/decree-preview.png?edition=west&score=9&name=Ada"), services());
  assert.equal(hidden.status, 404);
  const app = services({ kv: memoryKv(), royalRevealEnabled: true });
  const first = await servePaid(request(`/api/paid/decree-preview.png?edition=west&score=9&name=${encodeURIComponent("Ángela")}`), app);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("content-type"), "image/png");
  assert.equal(first.headers.get("x-decree-preview-cache"), "miss");
  const bytes = new Uint8Array(await first.arrayBuffer());
  assert.deepEqual(pngSize(bytes), { width: DECREE_PREVIEW_WIDTH, height: DECREE_PREVIEW_HEIGHT });
  const warm = await servePaid(request(`/api/paid/decree-preview.png?edition=west&score=9&name=${encodeURIComponent("Ángela")}`), app);
  assert.equal(warm.headers.get("x-decree-preview-cache"), "hit");
  const unsafe = await servePaid(request("/api/paid/decree-preview.png?edition=west&score=9&name=x%20dot%20com"), app);
  const blank = await servePaid(request("/api/paid/decree-preview.png?edition=west&score=9"), app);
  assert.equal(unsafe.headers.get("x-decree-preview-cache"), "miss");
  assert.equal(blank.headers.get("x-decree-preview-cache"), "hit");
  const unsafeBytes = new Uint8Array(await unsafe.arrayBuffer());
  const blankBytes = new Uint8Array(await blank.arrayBuffer());
  assert.equal(Buffer.from(unsafeBytes).equals(Buffer.from(blankBytes)), true);
  assert.equal(pngSize(unsafeBytes).width, DECREE_PREVIEW_WIDTH);
  assert.notEqual(Buffer.from(bytes).equals(Buffer.from(blankBytes)), true);
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
