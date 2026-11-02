import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { friendChallengeLine } from "../../paid/friendLine.ts";
import { createMemoryRepository } from "../../paid/repository.ts";
import { servePaid } from "../../paid/serve.ts";
import { guestNickname } from "../../paid/daily.ts";
import { dailySeed } from "../../question-bank/daily.ts";
import { CANONICAL_ORIGIN } from "../../paid/catalog.ts";
import { createMockEmail } from "../../paid/email.ts";

const day = Date.parse("2026-11-02T15:00:00.000Z");
const player = "player_daily_owner_01";

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
    dailyChallenge: overrides.dailyChallenge,
    earnPaths: overrides.earnPaths,
    shareCards: overrides.shareCards,
  };
}

function request(path, init = {}) {
  return new Request(`https://brideprice.classesforculture.com${path}`, init);
}

async function body(response) {
  return response.json();
}

function post(path, payload) {
  return request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
}

function wrongAnswers(questions) {
  return questions.map((question) => [question.correct[0] === 0 ? 1 : 0]);
}

function rightAnswers(questions) {
  return questions.map((question) => [...question.correct]);
}

test("the daily flag stays on in wrangler, and a Worker with it off does nothing", async () => {
  const config = await readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(config, /"DAILY_CHALLENGE": "on"/);
  assert.match(config, /"ROYAL_REVEAL_ENABLED": "on"/);
  assert.match(config, /"EARN_PATHS": "on"/);
  assert.match(config, /"SHARE_CARDS": "on"/);
  assert.match(config, /"RESULT_VIDEO": "off"/);
  const kv = memoryKv();
  const app = services({ kv });
  assert.equal((await body(await servePaid(request("/api/paid/health"), app))).dailyChallenge, false);
  assert.equal((await servePaid(post("/api/paid/daily/begin", { playerId: player, edition: "west" }), app)).status, 404);
  assert.equal(kv.map.size, 0);
  assert.equal(friendChallengeLine(8), "Your friend scored 8/12, beat them.");
});

test("one shared daily set is free, scored on the server, and ranked by score then time", async () => {
  let now = day;
  const kv = memoryKv();
  const repository = createMemoryRepository();
  const app = services({ dailyChallenge: true, kv, repository, now: () => now });
  const first = await body(await servePaid(post("/api/paid/daily/begin", { playerId: player, edition: "west", nickname: "Ayo" }), app));
  const secondPlayer = "player_daily_owner_02";
  const second = await body(await servePaid(post("/api/paid/daily/begin", { playerId: secondPlayer, edition: "west", nickname: "Zuri" }), app));
  const fresh = await body(await servePaid(post("/api/paid/daily/begin", {
    playerId: "player_daily_owner_03", edition: "west",
  }), services({ dailyChallenge: true, kv: memoryKv(), now: () => now })));
  assert.deepEqual(second.questions.map((question) => question.id), first.questions.map((question) => question.id));
  assert.deepEqual(fresh.questions.map((question) => question.id), first.questions.map((question) => question.id));
  assert.deepEqual(second.questions.map((question) => question.options), first.questions.map((question) => question.options));
  assert.equal(first.resumed, false);
  const again = await body(await servePaid(post("/api/paid/daily/begin", { playerId: player, edition: "west" }), app));
  assert.equal(again.resumed, true);
  assert.equal(again.startedAt, first.startedAt);

  now += 20_000;
  const forged = await body(await servePaid(post("/api/paid/daily/finish", {
    playerId: player, edition: "west", answers: wrongAnswers(first.questions), score: 12,
  }), app));
  assert.equal(forged.score, 0);
  assert.equal(forged.bonus, 0);
  const wallet = await body(await servePaid(request(`/api/paid/access?player=${player}`), app));
  assert.equal(wallet.cowries, 0);
  assert.equal(wallet.completedGames, 0);
  assert.equal(wallet.freeGamesLeft, 2);
  const repeat = await body(await servePaid(post("/api/paid/daily/finish", {
    playerId: player, edition: "west", answers: rightAnswers(first.questions), score: 12,
  }), app));
  assert.equal(repeat.already, true);
  assert.equal(repeat.score, 0);

  now = day + 15_000;
  await servePaid(post("/api/paid/daily/finish", {
    playerId: secondPlayer, edition: "west", answers: rightAnswers(second.questions),
  }), app);
  const board = await body(await servePaid(request(`/api/paid/daily/board?player=${player}&edition=west`), app));
  assert.equal(board.top.length, 2);
  assert.equal(board.top[0].nickname, "Zuri");
  assert.equal(board.top[0].score, 12);
  assert.equal(board.top[1].nickname, "Ayo");
  assert.equal(board.top[1].you, true);
  assert.equal(board.top[0].you, false);
  assert.equal(board.rank, 2);
  assert.equal(forged.nickname, "Ayo");
  assert.equal(JSON.stringify(board).includes(player), false);
  assert.equal(JSON.stringify(board).includes("correct"), false);

  const slow = "player_daily_tie_00003";
  now = day;
  await servePaid(post("/api/paid/daily/begin", { playerId: slow, edition: "west", nickname: "Kofi" }), app);
  now = day + 40_000;
  await servePaid(post("/api/paid/daily/finish", { playerId: slow, edition: "west", answers: rightAnswers(first.questions) }), app);
  const tied = await body(await servePaid(request(`/api/paid/daily/board?player=${slow}&edition=west`), app));
  assert.deepEqual(tied.top.slice(0, 2).map((row) => row.nickname), ["Zuri", "Kofi"]);

  const bot = "player_daily_bot_000001";
  now = day;
  await servePaid(post("/api/paid/daily/begin", { playerId: bot, edition: "west", nickname: "Bot" }), app);
  now = day + 1_000;
  const rushed = await body(await servePaid(post("/api/paid/daily/finish", {
    playerId: bot, edition: "west", answers: rightAnswers(first.questions), score: 12,
  }), app));
  assert.equal(rushed.score, 12);
  assert.equal(rushed.bonus, 0);
  const guarded = await body(await servePaid(request(`/api/paid/daily/board?player=${bot}&edition=west`), app));
  assert.equal(guarded.top.some((row) => row.nickname === "Bot"), false);
  assert.equal(guarded.rank, null);

  const guest = "player_daily_guest_0001";
  now = day;
  const guestStart = await body(await servePaid(post("/api/paid/daily/begin", { playerId: guest, edition: "west" }), app));
  now = day + 25_000;
  const guestDone = await body(await servePaid(post("/api/paid/daily/finish", {
    playerId: guest, edition: "west", answers: rightAnswers(guestStart.questions),
  }), app));
  assert.equal(guestDone.nickname, null);
  const generated = guestNickname(guest);
  assert.match(generated, /^[A-Za-z]+ [A-Za-z]+ \d{3}$/);
  assert.equal(generated.includes(guest), false);
  assert.equal(guestNickname(guest), generated);
  const guestBoard = await body(await servePaid(request(`/api/paid/daily/board?player=${guest}&edition=west`), app));
  assert.equal(guestBoard.top.find((row) => row.you).nickname, generated);
  assert.equal(guestBoard.top.filter((row) => row.you).length, 1);
  assert.equal(JSON.stringify(guestBoard).includes("Anonymous"), false);
  assert.equal(JSON.stringify(guestBoard).includes(guest), false);

  const stats = (await body(await servePaid(request("/api/paid/owner/stats", { headers: { "x-owner-stats-token": "owner-token-value" } }), app))).days;
  assert.equal(stats.some((row) => row.event === "daily_play"), true);
  assert.equal(stats.filter((row) => row.event === "daily_play").reduce((sum, row) => sum + row.count, 0), 5);
  assert.equal(stats.some((row) => row.event === "leaderboard_views"), true);
});

test("streak bonuses pay once at 3 and 7 days and a missed day starts again", async () => {
  let now = day;
  const app = services({ dailyChallenge: true, kv: memoryKv(), now: () => now });
  for (let index = 0; index < 7; index += 1) {
    now = day + index * 86_400_000;
    const started = await body(await servePaid(post("/api/paid/daily/begin", { playerId: player, edition: "west" }), app));
    now += 20_000;
    const finished = await body(await servePaid(post("/api/paid/daily/finish", {
      playerId: player, edition: "west", answers: rightAnswers(started.questions),
    }), app));
    assert.equal(finished.streak, index + 1);
    assert.equal(finished.bonus, index + 1 === 3 || index + 1 === 7 ? 1 : 0);
  }
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${player}`), app))).cowries, 2);
  now = day + 6 * 86_400_000 + 30_000;
  const started = await body(await servePaid(post("/api/paid/daily/begin", { playerId: player, edition: "east" }), app));
  now += 20_000;
  const extra = await body(await servePaid(post("/api/paid/daily/finish", {
    playerId: player, edition: "east", answers: rightAnswers(started.questions),
  }), app));
  assert.equal(extra.bonus, 0);
  assert.equal(extra.streak, 7);
  assert.equal((await body(await servePaid(request(`/api/paid/access?player=${player}`), app))).cowries, 2);

  now = day + 9 * 86_400_000;
  const reset = await body(await servePaid(post("/api/paid/daily/begin", { playerId: player, edition: "west" }), app));
  now += 20_000;
  const restarted = await body(await servePaid(post("/api/paid/daily/finish", {
    playerId: player, edition: "west", answers: rightAnswers(reset.questions),
  }), app));
  assert.equal(restarted.streak, 1);
  assert.notEqual(dailySeed("2026-11-02", "west"), dailySeed("2026-11-03", "west"));
  const stats = (await body(await servePaid(request("/api/paid/owner/stats", { headers: { "x-owner-stats-token": "owner-token-value" } }), app))).days;
  assert.equal(stats.filter((row) => row.event === "streak_bonus").reduce((sum, row) => sum + row.count, 0), 2);
});

test("nicknames are short, public, and filtered, and daily calls are rate limited", async () => {
  const kv = memoryKv();
  const app = services({ dailyChallenge: true, kv });
  assert.equal((await servePaid(post("/api/paid/daily/nickname", { playerId: player, nickname: "ayo@example.com" }), app)).status, 400);
  assert.equal((await servePaid(post("/api/paid/daily/nickname", { playerId: player, nickname: "https://ayo.gg" }), app)).status, 400);
  assert.equal((await servePaid(post("/api/paid/daily/nickname", { playerId: player, nickname: "this nickname is too long" }), app)).status, 400);
  assert.equal((await servePaid(post("/api/paid/daily/nickname", { playerId: player, nickname: "oh fuck" }), app)).status, 400);
  assert.equal((await servePaid(post("/api/paid/daily/nickname", { playerId: player, nickname: "fu ck" }), app)).status, 400);
  assert.equal((await body(await servePaid(post("/api/paid/daily/nickname", { playerId: player, nickname: "Ayo" }), app))).nickname, "Ayo");
  const limited = "player_daily_rate_0001";
  for (let index = 0; index < 30; index += 1) {
    assert.equal((await servePaid(request(`/api/paid/daily?player=${limited}&edition=west`), app)).status, 200);
  }
  assert.equal((await servePaid(request(`/api/paid/daily?player=${limited}&edition=west`), app)).status, 429);
});
