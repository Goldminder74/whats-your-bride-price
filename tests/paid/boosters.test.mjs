import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { WELCOME_BONUS_MS } from "../../paid/catalog.ts";
import { CANONICAL_ORIGIN } from "../../paid/catalog.ts";
import { neutralHint } from "../../paid/boosters.ts";
import { createMockEmail } from "../../paid/email.ts";
import { createMemoryRepository } from "../../paid/repository.ts";
import { servePaid } from "../../paid/serve.ts";

const day = Date.parse("2026-11-02T12:00:00.000Z");
const player = "player_booster_owner1";

function memoryKv() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, value); },
  };
}

function services(overrides = {}) {
  const clock = overrides.now;
  return {
    email: createMockEmail(),
    now: () => (typeof clock === "function" ? clock() : clock ?? day),
    repository: overrides.repository ?? createMemoryRepository(),
    kv: overrides.kv ?? memoryKv(),
    config: { stripeMode: "mock", stripeSecretKey: "sk_test_mock", webhookSecret: "whsec_local_test_secret_value", publicOrigin: CANONICAL_ORIGIN },
    ownerStatsToken: "owner-token-value",
    randomBank: overrides.randomBank ?? true,
    earnPaths: overrides.earnPaths ?? true,
    shareCards: overrides.shareCards ?? true,
    dailyChallenge: overrides.dailyChallenge ?? true,
    boosters: overrides.boosters,
  };
}

function request(path, init = {}) {
  return new Request(`https://brideprice.classesforculture.com${path}`, init);
}

function post(path, payload, headers = {}) {
  return request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(payload) });
}

async function body(response) {
  return response.json();
}

async function buy(app, owner, key) {
  const checkout = await body(await servePaid(post("/api/paid/checkout", {
    productKey: "cowrie_5_v1", email: "buyer@example.com", country: "GH", playerId: owner, adult: true,
  }, { "idempotency-key": key }), app));
  assert.equal((await servePaid(post("/api/paid/mock-pay", { orderId: checkout.orderId }), app)).status, 200);
  return checkout.orderId;
}

function refund(app, orderId, at = Date.now()) {
  const payload = {
    id: `evt_boost_${orderId.slice(4, 20)}`,
    type: "charge.refunded",
    livemode: false,
    data: { object: { amount: 199, amount_refunded: 199, refunded: true, currency: "gbp", payment_intent: `pi_mock_${orderId.slice(4)}` } },
  };
  const raw = JSON.stringify(payload);
  const timestamp = Math.floor(at / 1000);
  const signature = createHmac("sha256", "whsec_local_test_secret_value").update(`${timestamp}.${raw}`).digest("hex");
  return servePaid(request("/api/paid/webhook", { method: "POST", headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }, body: raw }), app);
}

async function openRound(app, owner, attemptId) {
  assert.equal((await servePaid(post("/api/paid/games/begin", { playerId: owner, attemptId, edition: "west" }), app)).status, 200);
  const round = await body(await servePaid(request(`/api/paid/questions?edition=west&player=${owner}&attempt=${attemptId}`), app));
  assert.equal(round.questions.length, 12);
  return round;
}

test("boosters stay off until the flag is on", async () => {
  const config = await readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(config, /"BOOSTERS": "on"/);
  assert.match(config, /"DAILY_CHALLENGE": "on"/);
  const app = services();
  assert.equal((await body(await servePaid(request("/api/paid/health"), app))).boosters, false);
  assert.equal((await servePaid(post("/api/paid/boosters/use", { playerId: player, roundKind: "game", roundId: "a".repeat(32), edition: "west", kind: "fifty", questionIndex: 0 }), app)).status, 404);
  assert.equal(neutralHint({ explanation: "Short.", options: ["A"] }), null);
  assert.equal(neutralHint({ explanation: "Markets along the coast trade dried fish and grain in the dry season.", options: ["dried fish"] }).includes("dried fish"), false);
});

test("booster spends use welcome Cowries first, are idempotent, and a refund cannot go negative", async () => {
  let now = day;
  const repository = createMemoryRepository();
  const app = services({ boosters: true, repository, now: () => now });
  const orderId = await buy(app, player, "booster-buy-0001");
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${player}`), app))).cowries, 10);
  const round = await openRound(app, player, "attempt_booster_round1");
  const first = await body(await servePaid(post("/api/paid/boosters/use", {
    playerId: player, roundKind: "game", roundId: round.roundId, edition: "west", kind: "fifty", questionIndex: 0,
  }), app));
  assert.equal(first.ledgerKind, "cowrie_spend_booster_v1");
  assert.equal(first.charged, 1);
  assert.equal(first.remove.length, 2);
  assert.equal(first.balance, 9);
  const again = await body(await servePaid(post("/api/paid/boosters/use", {
    playerId: player, roundKind: "game", roundId: round.roundId, edition: "west", kind: "fifty", questionIndex: 0,
  }), app));
  assert.equal(again.already, true);
  assert.equal(again.charged, 0);
  assert.equal(again.balance, 9);
  const skipped = await body(await servePaid(post("/api/paid/boosters/use", {
    playerId: player, roundKind: "game", roundId: round.roundId, edition: "west", kind: "skip", questionIndex: 1,
  }), app));
  assert.equal(skipped.charged, 2);
  assert.notEqual(skipped.question.id, round.questions[1].id);
  const frozen = await body(await servePaid(post("/api/paid/boosters/freeze", { playerId: player, requestId: "freeze_req_0001" }), app));
  assert.equal(frozen.ledgerKind, "cowrie_spend_freeze_v1");
  assert.equal(frozen.held, 1);
  assert.equal(frozen.balance, 5);
  now = day + WELCOME_BONUS_MS + 86_400_000;
  const later = await body(await servePaid(request(`/api/paid/access?player=${player}`), app));
  assert.equal(later.cowries, 5);
  assert.equal((await refund(app, orderId, now)).status, 200);
  const after = await body(await servePaid(request(`/api/paid/access?player=${player}`), app));
  assert.equal(after.cowries, 0);
  assert.equal((await servePaid(post("/api/paid/boosters/use", {
    playerId: player, roundKind: "game", roundId: round.roundId, edition: "west", kind: "hint", questionIndex: 2,
  }), app)).status, 402);
});

test("a boosted perfect score is not paid and a boosted daily run stays off the board", async () => {
  let now = day;
  const app = services({ boosters: true, now: () => now });
  await buy(app, player, "booster-buy-0002");
  const round = await openRound(app, player, "attempt_booster_round2");
  const gameSlot = round.questions.findIndex((question) => question.options.length - question.correct.length >= 2);
  const gameUse = await servePaid(post("/api/paid/boosters/use", {
    playerId: player, roundKind: "game", roundId: round.roundId, edition: "west", kind: "fifty", questionIndex: gameSlot,
  }), app);
  assert.equal(gameUse.status, 200, JSON.stringify(await gameUse.clone().json()));
  const perfect = await body(await servePaid(post("/api/paid/earn/perfect", {
    playerId: player,
    attemptId: "attempt_booster_round2",
    edition: "west",
    roundId: round.roundId,
    answers: round.questions.map((question) => question.correct),
  }), app));
  assert.equal(perfect.reason, "boosted");
  assert.equal(perfect.score, 12);

  const clean = "player_booster_daily02";
  const started = await body(await servePaid(post("/api/paid/daily/begin", { playerId: player, edition: "west", nickname: "Ayo" }), app));
  const slot = started.questions.findIndex((question) => question.options.length - question.correct.length >= 2);
  const used = await servePaid(post("/api/paid/boosters/use", {
    playerId: player, roundKind: "daily", roundId: started.roundId, edition: "west", kind: "fifty", questionIndex: slot,
  }), app);
  assert.equal(used.status, 200, JSON.stringify(await used.clone().json()));
  now += 20_000;
  const finished = await body(await servePaid(post("/api/paid/daily/finish", {
    playerId: player, edition: "west", answers: started.questions.map((question) => question.correct),
  }), app));
  assert.equal(finished.score, 12);
  const other = await body(await servePaid(post("/api/paid/daily/begin", { playerId: clean, edition: "west", nickname: "Zuri" }), app));
  now += 20_000;
  await servePaid(post("/api/paid/daily/finish", {
    playerId: clean, edition: "west", answers: other.questions.map((question) => question.correct),
  }), app);
  const board = await body(await servePaid(request(`/api/paid/daily/board?player=${clean}&edition=west`), app));
  assert.equal(board.top.some((row) => row.nickname === "Ayo"), false);
  assert.equal(board.top[0].nickname, "Zuri");
});

test("a streak freeze covers one missed day, holds at most two, and calls are rate limited", async () => {
  let now = day;
  const app = services({ boosters: true, dailyChallenge: true, now: () => now });
  await buy(app, player, "booster-buy-0003");
  const first = await body(await servePaid(post("/api/paid/boosters/freeze", { playerId: player, requestId: "freeze_hold_0001" }), app));
  const second = await body(await servePaid(post("/api/paid/boosters/freeze", { playerId: player, requestId: "freeze_hold_0002" }), app));
  assert.equal(second.held, 2);
  assert.equal((await servePaid(post("/api/paid/boosters/freeze", { playerId: player, requestId: "freeze_hold_0003" }), app)).status, 400);
  const repeat = await body(await servePaid(post("/api/paid/boosters/freeze", { playerId: player, requestId: "freeze_hold_0001" }), app));
  assert.equal(repeat.already, true);
  assert.equal(repeat.held, 2);
  assert.equal(first.charged, 2);
  for (let index = 0; index < 2; index += 1) {
    now = day + index * 86_400_000;
    const started = await body(await servePaid(post("/api/paid/daily/begin", { playerId: player, edition: "west" }), app));
    now += 20_000;
    await servePaid(post("/api/paid/daily/finish", {
      playerId: player, edition: "west", answers: started.questions.map((question) => [question.correct[0] === 0 ? 1 : 0]),
    }), app);
  }
  now = day + 3 * 86_400_000;
  const started = await body(await servePaid(post("/api/paid/daily/begin", { playerId: player, edition: "west" }), app));
  now += 20_000;
  const kept = await body(await servePaid(post("/api/paid/daily/finish", {
    playerId: player, edition: "west", answers: started.questions.map((question) => [question.correct[0] === 0 ? 1 : 0]),
  }), app));
  assert.equal(kept.streak, 3);
  assert.equal(kept.freezesUsed, 1);
  const status = await body(await servePaid(request(`/api/paid/boosters?player=${player}`), app));
  assert.equal(status.held, 1);

  const limited = "player_booster_rate_01";
  for (let index = 0; index < 20; index += 1) {
    assert.equal((await servePaid(request(`/api/paid/boosters?player=${limited}`), app)).status, 200);
  }
  assert.equal((await servePaid(request(`/api/paid/boosters?player=${limited}`), app)).status, 429);
});

test("owned cosmetic frames change the share-card cache key and an unowned frame is rejected", async () => {
  const kv = memoryKv();
  const app = services({ boosters: true, kv });
  await buy(app, player, "booster-buy-0004");
  const bought = await body(await servePaid(post("/api/paid/boosters/frame", { playerId: player, frame: "kente", requestId: "frame_req_00001" }), app));
  assert.equal(bought.ledgerKind, "cowrie_spend_frame_v1");
  assert.equal(bought.charged, 5);
  const repeat = await body(await servePaid(post("/api/paid/boosters/frame", { playerId: player, frame: "kente", requestId: "frame_req_00002" }), app));
  assert.equal(repeat.already, true);
  assert.equal(repeat.charged, 0);
  assert.equal((await servePaid(request(`/api/paid/share-card.png?edition=west&score=8&style=kente&player=${player}`), app)).status, 200);
  assert.equal(kv.map.has("share-png:v1:west:8:card:kente"), true);
  assert.equal((await servePaid(request("/api/paid/share-card.png?edition=west&score=8"), app)).status, 200);
  assert.equal(kv.map.has("share-png:v1:west:8:card"), true);
  assert.equal((await servePaid(request("/api/paid/share-card.png?edition=west&score=8&style=indigo&player=player_booster_other01"), app)).status, 403);
  assert.equal((await servePaid(request("/api/paid/share-card.png?edition=west&score=8&style=banner"), app)).status, 400);
});
