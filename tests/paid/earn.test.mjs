import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { regions } from "../../app/gameData.ts";
import { CANONICAL_ORIGIN } from "../../paid/catalog.ts";
import { createMockEmail } from "../../paid/email.ts";
import { createMemoryRepository } from "../../paid/repository.ts";
import { servePaid } from "../../paid/serve.ts";
import { CHALLENGE_LINE, shareBlurb, shareCardSvg } from "../../paid/shareCard.ts";
import { pngSize } from "../../paid/shareCardPng.ts";

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
  return {
    email: createMockEmail(),
    now: () => overrides.now ?? now,
    repository: overrides.repository ?? createMemoryRepository(),
    kv: overrides.kv ?? memoryKv(),
    config: {
      stripeMode: "mock",
      stripeSecretKey: "sk_test_mock_local_only",
      webhookSecret,
      publicOrigin: CANONICAL_ORIGIN,
    },
    ownerStatsToken: "owner-token-value",
    randomBank: overrides.randomBank,
    earnPaths: overrides.earnPaths,
    shareCards: overrides.shareCards,
    assets: overrides.assets,
  };
}

function request(path, init = {}) {
  return new Request(`https://brideprice.classesforculture.com${path}`, init);
}

async function body(response) {
  return response.json();
}

function post(path, payload) {
  return request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const player = "player_earn_owner_01";

async function play(app, attemptId, edition = "west") {
  const started = await body(await servePaid(post("/api/paid/games/begin", { playerId: player, attemptId, edition }), app));
  assert.equal(started.attemptId, attemptId);
  const finished = await body(await servePaid(post("/api/paid/games/finish", { playerId: player, attemptId }), app));
  return { started, finished };
}

test("earn and share flags stay off and the completion hot path still avoids D1", async () => {
  let repositoryCalls = 0;
  const repository = new Proxy({}, { get: () => async () => { repositoryCalls += 1; throw new Error("database"); } });
  const app = services({ repository });
  const health = await body(await servePaid(request("/api/paid/health"), app));
  assert.equal(health.earnPaths, false);
  assert.equal(health.shareCards, false);
  const catalog = await body(await servePaid(request("/api/paid/catalog"), app));
  assert.equal(catalog.earnPaths, false);
  assert.equal(catalog.shareCards, false);
  assert.equal(catalog.products.some((item) => item.key === "cowrie_earn_v1"), false);
  repositoryCalls = 0;
  for (const path of ["/api/paid/earn/perfect", "/api/paid/earn/share", "/api/paid/referral/arrive"]) {
    const response = await servePaid(post(path, { playerId: player, attemptId: "attempt_earn_disabled_01", edition: "west", answers: [[0]], code: "abcdefgh" }), app);
    assert.equal(response.status, 404, path);
  }
  assert.equal((await servePaid(request(`/api/paid/referral?player=${player}`), app)).status, 404);
  assert.equal((await servePaid(request("/api/paid/share-card.svg?edition=west&score=12"), app)).status, 404);
  const answers = regions.west.questions.map((question) => [...question.correct]);
  const completed = await servePaid(post("/api/paid/games/complete", { edition: "west", answers, score: 12, playerId: player }), app);
  assert.equal(completed.status, 200);
  assert.equal((await body(completed)).score, 12);
  assert.equal(repositoryCalls, 0);
});

test("a server-verified 12/12 grants one Cowrie once per attempt and once per day", async () => {
  const app = services({ earnPaths: true, randomBank: true, kv: memoryKv() });
  const attemptId = "attempt_perfect_round_01";
  const started = await body(await servePaid(post("/api/paid/games/begin", { playerId: player, attemptId, edition: "west" }), app));
  assert.equal(started.mode, "free");
  const round = await body(await servePaid(request(`/api/paid/questions?edition=west&player=${player}&attempt=${attemptId}`), app));
  assert.equal(round.questions.length, 12);
  assert.equal(Array.isArray(round.questions[0].correct), true);
  assert.equal((await servePaid(post("/api/paid/earn/perfect", {
    playerId: player, attemptId, edition: "west", roundId: round.roundId, answers: round.questions.map((question) => question.correct), score: 12,
  }), app)).status, 409);

  await servePaid(post("/api/paid/games/finish", { playerId: player, attemptId }), app);
  const wrong = round.questions.map((question, index) => index === 0 ? [question.correct[0] === 0 ? 1 : 0] : question.correct);
  const missed = await body(await servePaid(post("/api/paid/earn/perfect", {
    playerId: player, attemptId, edition: "west", roundId: round.roundId, answers: wrong, score: 12,
  }), app));
  assert.equal(missed.reason, "miss");
  assert.equal(missed.cowries, 0);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${player}`), app))).cowries, 0);

  const granted = await body(await servePaid(post("/api/paid/earn/perfect", {
    playerId: player, attemptId, edition: "west", roundId: round.roundId, answers: round.questions.map((question) => question.correct),
  }), app));
  assert.equal(granted.reason, "granted");
  assert.equal(granted.score, 12);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${player}`), app))).cowries, 1);
  const repeat = await body(await servePaid(post("/api/paid/earn/perfect", {
    playerId: player, attemptId, edition: "west", roundId: round.roundId, answers: round.questions.map((question) => question.correct),
  }), app));
  assert.equal(repeat.reason, "repeat");
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${player}`), app))).cowries, 1);

  const second = "attempt_perfect_round_02";
  await servePaid(post("/api/paid/games/begin", { playerId: player, attemptId: second, edition: "west" }), app);
  const next = await body(await servePaid(request(`/api/paid/questions?edition=west&player=${player}&attempt=${second}`), app));
  await servePaid(post("/api/paid/games/finish", { playerId: player, attemptId: second }), app);
  const capped = await body(await servePaid(post("/api/paid/earn/perfect", {
    playerId: player, attemptId: second, edition: "west", roundId: next.roundId, answers: next.questions.map((question) => question.correct),
  }), app));
  assert.equal(capped.reason, "capped");
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${player}`), app))).cowries, 1);

  const foreign = await servePaid(post("/api/paid/earn/perfect", {
    playerId: "player_earn_other_0002", attemptId, edition: "west", roundId: round.roundId, answers: round.questions.map((question) => question.correct),
  }), app);
  assert.equal(foreign.status, 404);
  const stats = (await body(await servePaid(request("/api/paid/owner/stats", { headers: { "x-owner-stats-token": "owner-token-value" } }), app))).days;
  assert.equal(stats.some((row) => row.event === "earn_perfect" && row.detail === "granted"), true);
  assert.equal(stats.some((row) => row.event === "earn_perfect" && row.detail === "capped"), true);
  assert.equal(stats.some((row) => row.event === "earn_perfect" && row.detail === "miss"), true);
});

test("a result share grants one Cowrie per owner per day", async () => {
  const app = services({ earnPaths: true });
  const tooSoon = await body(await servePaid(post("/api/paid/earn/share", { playerId: player }), app));
  assert.equal(tooSoon.reason, "ineligible");
  await play(app, "attempt_share_game_0001");
  const granted = await body(await servePaid(post("/api/paid/earn/share", { playerId: player }), app));
  assert.equal(granted.reason, "granted");
  assert.equal(granted.cowries, 1);
  const repeat = await body(await servePaid(post("/api/paid/earn/share", { playerId: player }), app));
  assert.equal(repeat.reason, "repeat");
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${player}`), app))).cowries, 1);
  const other = "player_share_other_0002";
  await servePaid(post("/api/paid/games/begin", { playerId: other, attemptId: "attempt_share_game_0002", edition: "east" }), app);
  await servePaid(post("/api/paid/games/finish", { playerId: other, attemptId: "attempt_share_game_0002" }), app);
  assert.equal((await body(await servePaid(post("/api/paid/earn/share", { playerId: other }), app))).reason, "granted");
  const stats = (await body(await servePaid(request("/api/paid/owner/stats", { headers: { "x-owner-stats-token": "owner-token-value" } }), app))).days;
  assert.equal(stats.some((row) => row.event === "earn_share" && row.detail === "granted"), true);
  assert.equal(stats.some((row) => row.event === "earn_share" && row.detail === "repeat"), true);
});

test("referrals pay a new owner once, cap the referrer at 10 a day, and reject self-referral", async () => {
  const app = services({ earnPaths: true });
  const referrer = "player_referrer_owner1";
  const link = await body(await servePaid(request(`/api/paid/referral?player=${referrer}`), app));
  assert.match(link.code, /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
  assert.equal(link.url, `${CANONICAL_ORIGIN}/?ref=${link.code}`);
  const self = await body(await servePaid(post("/api/paid/referral/arrive", { playerId: referrer, code: link.code }), app));
  assert.equal(self.reason, "self");

  const newbie = "player_referred_new_01";
  assert.equal((await body(await servePaid(post("/api/paid/referral/arrive", { playerId: newbie, code: link.code }), app))).reason, "recorded");
  assert.equal((await body(await servePaid(post("/api/paid/referral/arrive", { playerId: newbie, code: link.code }), app))).reason, "repeat");
  await servePaid(post("/api/paid/games/begin", { playerId: newbie, attemptId: "attempt_referred_first1", edition: "west" }), app);
  const finished = await body(await servePaid(post("/api/paid/games/finish", { playerId: newbie, attemptId: "attempt_referred_first1" }), app));
  assert.equal(finished.referral.player.cowries, 1);
  assert.equal(finished.referral.referrer.cowries, 2);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${newbie}`), app))).cowries, 1);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${referrer}`), app))).cowries, 2);
  await servePaid(post("/api/paid/games/begin", { playerId: newbie, attemptId: "attempt_referred_again1", edition: "west" }), app);
  const second = await body(await servePaid(post("/api/paid/games/finish", { playerId: newbie, attemptId: "attempt_referred_again1" }), app));
  assert.equal(second.referral, undefined);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${referrer}`), app))).cowries, 2);

  const veteran = "player_referred_old_001";
  await servePaid(post("/api/paid/games/begin", { playerId: veteran, attemptId: "attempt_veteran_first01", edition: "west" }), app);
  await servePaid(post("/api/paid/games/finish", { playerId: veteran, attemptId: "attempt_veteran_first01" }), app);
  assert.equal((await body(await servePaid(post("/api/paid/referral/arrive", { playerId: veteran, code: link.code }), app))).reason, "not_new");

  for (let index = 2; index <= 11; index += 1) {
    const id = `player_referred_${String(index).padStart(4, "0")}`;
    const arrived = await body(await servePaid(post("/api/paid/referral/arrive", { playerId: id, code: link.code }), app));
    assert.equal(arrived.reason, "recorded");
    await servePaid(post("/api/paid/games/begin", { playerId: id, attemptId: `attempt_referred_${String(index).padStart(4, "0")}`, edition: "west" }), app);
    const done = await body(await servePaid(post("/api/paid/games/finish", { playerId: id, attemptId: `attempt_referred_${String(index).padStart(4, "0")}` }), app));
    assert.equal(done.referral.player.reason, "granted");
    assert.equal(done.referral.referrer.reason, index <= 10 ? "granted" : "capped");
    assert.equal((await body(await servePaid(request(`/api/paid/access?player=${id}`), app))).cowries, 1);
  }
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${referrer}`), app))).cowries, 20);
  const stats = (await body(await servePaid(request("/api/paid/owner/stats", { headers: { "x-owner-stats-token": "owner-token-value" } }), app))).days;
  assert.equal(stats.some((row) => row.event === "earn_referral" && row.detail === "referrer"), true);
  assert.equal(stats.some((row) => row.event === "earn_referral" && row.detail === "new"), true);
  assert.equal(stats.some((row) => row.event === "earn_referral" && row.detail === "capped"), true);
  assert.equal(stats.some((row) => row.event === "earn_referral" && row.detail === "self"), true);
});

test("earned Cowries are spendable and a purchase refund does not remove them or go negative", async () => {
  const app = services({ earnPaths: true });
  await play(app, "attempt_earn_refund_001");
  assert.equal((await body(await servePaid(post("/api/paid/earn/share", { playerId: player }), app))).cowries, 1);
  const created = await body(await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "earn-refund-buy" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "US", playerId: player, adult: true }),
  }), app));
  await servePaid(post("/api/paid/mock-pay", { orderId: created.orderId }), app);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${player}`), app))).cowries, 11);
  const spent = await body(await servePaid(post("/api/paid/cowries/spend", { playerId: player, count: 6 }), app));
  assert.equal(spent.cowries, 5);
  const refund = {
    id: "evt_earn_refund_000001",
    type: "charge.refunded",
    livemode: false,
    data: { object: { amount: 199, amount_refunded: 199, refunded: true, currency: "gbp", payment_intent: `pi_mock_${created.orderId.slice(4)}` } },
  };
  const raw = JSON.stringify(refund);
  const timestamp = Math.floor(now / 1000);
  const signature = createHmac("sha256", webhookSecret).update(`${timestamp}.${raw}`).digest("hex");
  assert.equal((await servePaid(request("/api/paid/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    body: raw,
  }), app)).status, 200);
  const after = await body(await servePaid(request(`/api/paid/access?player=${player}`), app));
  assert.equal(after.cowries, 0);
  const over = await servePaid(post("/api/paid/cowries/spend", { playerId: player, count: 1 }), app);
  assert.equal(over.status, 409);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${player}`), app))).cowries, 0);

  const keeper = "player_earn_keep_0002";
  await servePaid(post("/api/paid/games/begin", { playerId: keeper, attemptId: "attempt_earn_keep_0001", edition: "west" }), app);
  await servePaid(post("/api/paid/games/finish", { playerId: keeper, attemptId: "attempt_earn_keep_0001" }), app);
  assert.equal((await body(await servePaid(post("/api/paid/earn/share", { playerId: keeper }), app))).cowries, 1);
  const keptOrder = await body(await servePaid(request("/api/paid/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "earn-keep-buy" },
    body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "US", playerId: keeper, adult: true }),
  }), app));
  await servePaid(post("/api/paid/mock-pay", { orderId: keptOrder.orderId }), app);
  const keepRefund = {
    id: "evt_earn_keep_refund_01",
    type: "charge.refunded",
    livemode: false,
    data: { object: { amount: 199, amount_refunded: 199, refunded: true, currency: "gbp", payment_intent: `pi_mock_${keptOrder.orderId.slice(4)}` } },
  };
  const keepRaw = JSON.stringify(keepRefund);
  const keepSignature = createHmac("sha256", webhookSecret).update(`${timestamp}.${keepRaw}`).digest("hex");
  assert.equal((await servePaid(request("/api/paid/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${timestamp},v1=${keepSignature}` },
    body: keepRaw,
  }), app)).status, 200);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${keeper}`), app))).cowries, 1);
});

test("the share card is a 1080 by 1350 branded result and stays hidden while the flag is off", async () => {
  const hidden = services({ shareCards: false, earnPaths: false });
  assert.equal((await servePaid(request("/api/paid/share-card.svg?edition=west&score=12"), hidden)).status, 404);
  const app = services({ shareCards: true, earnPaths: true });
  const link = await body(await servePaid(request(`/api/paid/referral?player=${player}`), app));
  const response = await servePaid(request(`/api/paid/share-card.svg?edition=west&score=12&ref=${link.code}`), app);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /image\/svg\+xml/);
  const svg = await response.text();
  assert.match(svg, /width="1080"/);
  assert.match(svg, /height="1350"/);
  assert.match(svg, /WEST AFRICA/);
  assert.match(svg, />ROYALTY</);
  assert.match(svg, />50 COWRIES</);
  assert.match(svg, />12</);
  assert.match(svg, /OUT OF 12/);
  assert.match(svg, new RegExp(CHALLENGE_LINE));
  assert.match(svg, /brideprice\.classesforculture\.com/);
  assert.doesNotMatch(svg, /\?edition=|&ref=|wa\.me/);
  assert.equal(shareBlurb(8), "I'm worth 30 cowries as a Motherland Scholar 👑 Can you beat 8/12?");
  const direct = shareCardSvg({ edition: "east", score: 8 });
  assert.match(direct, /EAST AFRICA/);
  assert.match(direct, />SCHOLAR</);
  assert.match(direct, />30 COWRIES</);
  assert.match(direct, />8</);
  const story = await servePaid(request("/api/paid/share-card.svg?edition=west&score=6&frame=story"), app);
  const storySvg = await story.text();
  assert.match(storySvg, /height="1920"/);
  assert.match(storySvg, />SCHOLAR</);
  assert.match(storySvg, />30 COWRIES</);
  assert.doesNotMatch(storySvg, /\?edition=|&ref=|wa\.me/);
  const pngResponse = await servePaid(request("/api/paid/share-card.png?edition=west&score=12"), app);
  assert.equal(pngResponse.status, 200);
  assert.match(pngResponse.headers.get("content-type") || "", /image\/png/);
  const png = new Uint8Array(await pngResponse.arrayBuffer());
  assert.equal(png[0], 137);
  assert.deepEqual(pngSize(png), { width: 1080, height: 1350 });
  const storyPng = new Uint8Array(await (await servePaid(request("/api/paid/share-card.png?edition=east&score=8&frame=story"), app)).arrayBuffer());
  assert.deepEqual(pngSize(storyPng), { width: 1080, height: 1920 });
  const shell = "<!DOCTYPE html><html><head><meta property=\"og:image\" content=\"https://brideprice.classesforculture.com/og-v2.png\"/><meta property=\"og:title\" content=\"Old\"/></head><body>DO YOU KNOW YOUR ROOTS?</body></html>";
  const previewApp = services({
    shareCards: true,
    assets: { async fetch() { return new Response(shell, { status: 200 }); } },
  });
  const home = await servePaid(request("/?edition=west&score=8&ref=abcdefgh"), previewApp);
  const homeHtml = await home.text();
  assert.match(homeHtml, /DO YOU KNOW YOUR ROOTS/);
  assert.match(homeHtml, /share-card\.png\?edition=west&amp;score=8/);
  assert.match(homeHtml, /og:image:width" content="1080"/);
  assert.match(homeHtml, /worth 30 cowries as a Motherland Scholar/);
  assert.doesNotMatch(homeHtml, /og-v2\.png/);
  const plain = await (await servePaid(request("/"), previewApp)).text();
  assert.match(plain, /og-v2\.png/);
  assert.equal((await servePaid(request("/api/paid/share-card.svg?edition=west&score=13"), app)).status, 400);
  assert.equal((await servePaid(request("/api/paid/share-card.png?edition=west&score=13"), app)).status, 400);
});

test("rendered share-card PNGs are reused for the same edition, score, and frame", async () => {
  const config = await readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(config, /"EARN_PATHS": "on"/);
  assert.match(config, /"SHARE_CARDS": "on"/);
  const kv = memoryKv();
  const app = services({ shareCards: true, kv });
  assert.equal((await servePaid(request("/api/paid/share-card.png?edition=west&score=08"), app)).status, 400);
  assert.equal((await servePaid(request("/api/paid/share-card.png?edition=WEST&score=8"), app)).status, 400);
  assert.equal((await servePaid(request("/api/paid/share-card.png?edition=west&score=8&frame=banner"), app)).status, 400);
  assert.equal([...kv.map.keys()].some((key) => String(key).startsWith("share-png:")), false);

  const coldStart = performance.now();
  const cold = await servePaid(request("/api/paid/share-card.png?edition=west&score=8&utm=newsletter"), app);
  const coldMs = performance.now() - coldStart;
  assert.equal(cold.status, 200);
  assert.equal(cold.headers.get("x-share-card-cache"), "miss");
  const coldBytes = Buffer.from(await cold.arrayBuffer());
  assert.equal(kv.map.has("share-png:v1:west:8:card"), true);

  const warmStart = performance.now();
  const warm = await servePaid(request("/api/paid/share-card.png?score=8&edition=west&frame=card&ref=abcdefgh"), app);
  const warmMs = performance.now() - warmStart;
  assert.equal(warm.status, 200);
  assert.equal(warm.headers.get("x-share-card-cache"), "hit");
  assert.ok(coldBytes.equals(Buffer.from(await warm.arrayBuffer())));
  assert.ok(warmMs < 200, `warm share-card render took ${warmMs.toFixed(1)}ms`);
  console.log(`share-card png cold ${coldMs.toFixed(0)}ms warm ${warmMs.toFixed(1)}ms`);
});
