import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { regions } from "../../app/gameData.ts";

test("local Worker completes a round, takes a mock Stripe payment, and refunds it", { timeout: 120_000 }, async () => {
  const { unstable_dev } = await import("wrangler");
  const worker = await unstable_dev("worker/paid.ts", {
    config: "wrangler.jsonc",
    local: true,
    persist: false,
    logLevel: "error",
    vars: {
      STRIPE_API_MODE: "mock",
      STRIPE_SECRET_KEY: "sk_test_mock_local_only",
      STRIPE_WEBHOOK_SECRET: "whsec_local_test_secret_value",
      EMAIL_PROVIDER: "mock",
      EMAIL_FROM: "What's Your Bride Price? <noreply@mail.classesforculture.com>",
      EMAIL_REPLY_TO: "team@classesforculture.com",
      PUBLIC_APP_ORIGIN: "https://brideprice.classesforculture.com",
      RANDOM_BANK: "on",
      EARN_PATHS: "off",
      SHARE_CARDS: "off",
      DAILY_CHALLENGE: "off",
      BOOSTERS: "off",
    },
    experimental: { disableExperimentalWarning: true, forceLocal: true, disableDevRegistry: true },
  });
  try {
    const home = await worker.fetch("http://127.0.0.1/");
    const html = await home.text();
    assert.equal(home.status, 200);
    assert.match(html, /DO YOU KNOW YOUR ROOTS/);
    assert.match(html, /What’s Your Bride Price/);
    assert.doesNotMatch(html, /chatgpt\.site/);
    assert.doesNotMatch(html, /Melrose Avenue|WD6 2BH/);
    const asset = await worker.fetch("http://127.0.0.1/favicon.svg");
    assert.equal(asset.status, 200);

    const bankResponse = await worker.fetch("http://127.0.0.1/question-bank/west.json");
    assert.equal(bankResponse.status, 200);
    assert.match(bankResponse.headers.get("content-type") || "", /application\/json/);
    const bank = await bankResponse.json();
    assert.equal(bank.region, "west");
    assert.ok(bank.questions.length >= 50);
    assert.equal(bank.questions.some((question) => question.region === "west" && question.prompt), true);

    const roundPlayer = "worker_bank_round_01";
    const roundResponse = await worker.fetch(`http://127.0.0.1/api/paid/questions?edition=west&player=${roundPlayer}`);
    const round = await roundResponse.json();
    assert.equal(roundResponse.status, 200, JSON.stringify(round));
    assert.match(round.roundId, /^[a-f0-9]{32}$/);
    assert.equal(round.questions.length, 12);
    assert.equal(round.questions.every((question) => typeof question.prompt === "string" && !("correct" in question)), true);
    const classicPrompts = new Set(regions.west.questions.map((question) => question.prompt));
    assert.equal(round.questions.some((question) => !classicPrompts.has(question.prompt)), true);

    for (const path of [
      "/vinext-client-entry-manifest.json",
      "/.vite/manifest.json",
      "/package.json",
      "/question-bank/held/west.json",
      "/question-bank/west.json.bak",
      "/data/question-bank/published/west.json",
      "/question-bank/../package.json",
    ]) {
      const hidden = await worker.fetch(`http://127.0.0.1${path}`);
      assert.equal(hidden.status, 404, path);
      const hiddenBody = await hidden.text();
      assert.equal(hiddenBody.includes("\"questions\""), false, path);
      assert.equal(hiddenBody.includes("node_modules"), false, path);
    }

    const answers = regions.west.questions.map((question) => [...question.correct]);
    const completed = await worker.fetch("http://127.0.0.1/api/paid/games/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edition: "west", answers }),
    });
    const result = await completed.json();
    assert.equal(completed.status, 200);
    assert.equal(result.score, regions.west.questions.length);

    const playerId = "worker_e2e_player_01";
    const checkoutResponse = await worker.fetch("http://127.0.0.1/api/paid/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "worker-e2e-checkout" },
      body: JSON.stringify({
        productKey: "cowrie_15_v1",
        email: "buyer@example.com",
        country: "GH",
        playerId,
        adult: true,
      }),
    });
    const checkout = await checkoutResponse.json();
    assert.equal(checkoutResponse.status, 200, JSON.stringify(checkout));
    const paid = await worker.fetch("http://127.0.0.1/api/paid/mock-pay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: checkout.orderId }),
    });
    assert.equal(paid.status, 200);
    const order = await (await worker.fetch(`http://127.0.0.1/api/paid/orders/${checkout.orderId}`)).json();
    assert.equal(order.state, "fulfilled");
    assert.equal(order.entitlement.remaining, 15);
    assert.equal(order.receiptStatus, "sent");
    const access = await (await worker.fetch(`http://127.0.0.1/api/paid/access?player=${playerId}`)).json();
    assert.equal(access.source, "d1");
    assert.equal(access.cowries, 20);
    const spent = await (await worker.fetch("http://127.0.0.1/api/paid/cowries/spend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId, count: 1 }),
    })).json();
    assert.equal(spent.cowries, 19);
    assert.equal(spent.source, "d1");
    const refund = {
      id: "evt_e2e_refund_0001",
      type: "charge.refunded",
      livemode: false,
      data: { object: { amount: 499, amount_refunded: 499, refunded: true, currency: "gbp", payment_intent: `pi_mock_${checkout.orderId.slice(4)}` } },
    };
    const raw = JSON.stringify(refund);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", "whsec_local_test_secret_value").update(`${timestamp}.${raw}`).digest("hex");
    const refunded = await worker.fetch("http://127.0.0.1/api/paid/webhook", {
      method: "POST",
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
      body: raw,
    });
    assert.equal(refunded.status, 200);
    const after = await (await worker.fetch(`http://127.0.0.1/api/paid/orders/${checkout.orderId}`)).json();
    assert.equal(after.state, "refunded");
    assert.equal(after.entitlement.remaining, 0);
    assert.equal((await (await worker.fetch(`http://127.0.0.1/api/paid/access?player=${playerId}`)).json()).cowries, 0);

    const legal = await (await worker.fetch("http://127.0.0.1/refunds")).text();
    assert.match(legal, /35 Melrose Avenue, Borehamwood, Hertfordshire, WD6 2BH, United Kingdom/);
    assert.doesNotMatch(legal, /ICO registration|ICO number/i);
    assert.match(legal, /14-day/);
    const health = await (await worker.fetch("http://127.0.0.1/api/paid/health")).json();
    assert.equal(health.earnPaths, false);
    assert.equal(health.shareCards, false);
    assert.equal(health.dailyChallenge, false);
    assert.equal(health.boosters, false);
    assert.equal((await worker.fetch("http://127.0.0.1/api/paid/boosters/use", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "worker_booster_off_01", roundKind: "daily", roundId: "daily20261102west", edition: "west", kind: "fifty", questionIndex: 0 }),
    })).status, 404);
    assert.equal((await worker.fetch("http://127.0.0.1/api/paid/daily/begin", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "worker_daily_off_0001", edition: "west" }),
    })).status, 404);
    assert.equal((await worker.fetch("http://127.0.0.1/api/paid/earn/perfect", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 404);
    assert.equal((await worker.fetch("http://127.0.0.1/api/paid/share-card.svg?edition=west&score=12")).status, 404);
  } finally {
    await worker.stop();
  }

  const earnWorker = await unstable_dev("worker/paid.ts", {
    config: "wrangler.jsonc",
    local: true,
    persist: false,
    logLevel: "error",
    vars: {
      STRIPE_API_MODE: "mock",
      STRIPE_SECRET_KEY: "sk_test_mock_local_only",
      STRIPE_WEBHOOK_SECRET: "whsec_local_test_secret_value",
      EMAIL_PROVIDER: "mock",
      EMAIL_FROM: "What's Your Bride Price? <noreply@mail.classesforculture.com>",
      EMAIL_REPLY_TO: "team@classesforculture.com",
      PUBLIC_APP_ORIGIN: "https://brideprice.classesforculture.com",
      RANDOM_BANK: "on",
      EARN_PATHS: "on",
      SHARE_CARDS: "on",
      DAILY_CHALLENGE: "on",
    },
    experimental: { disableExperimentalWarning: true, forceLocal: true, disableDevRegistry: true },
  });
  try {
    const health = await (await earnWorker.fetch("http://127.0.0.1/api/paid/health")).json();
    assert.equal(health.earnPaths, true);
    assert.equal(health.shareCards, true);
    assert.equal(health.dailyChallenge, true);
    const owner = "earn_worker_owner_01";
    const attemptId = "attempt_earn_worker_01";
    assert.equal((await earnWorker.fetch("http://127.0.0.1/api/paid/games/begin", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: owner, attemptId, edition: "west" }),
    })).status, 200);
    const round = await (await earnWorker.fetch(`http://127.0.0.1/api/paid/questions?edition=west&player=${owner}&attempt=${attemptId}`)).json();
    assert.equal(Array.isArray(round.questions[0].correct), true);
    await earnWorker.fetch("http://127.0.0.1/api/paid/games/finish", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: owner, attemptId }),
    });
    const granted = await (await earnWorker.fetch("http://127.0.0.1/api/paid/earn/perfect", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: owner, attemptId, edition: "west", roundId: round.roundId, answers: round.questions.map((question) => question.correct), score: 0 }),
    })).json();
    assert.equal(granted.reason, "granted");
    assert.equal(granted.score, 12);
    const repeat = await (await earnWorker.fetch("http://127.0.0.1/api/paid/earn/perfect", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: owner, attemptId, edition: "west", roundId: round.roundId, answers: round.questions.map((question) => question.correct) }),
    })).json();
    assert.equal(repeat.reason, "repeat");
    const checkout = await (await earnWorker.fetch("http://127.0.0.1/api/paid/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "earn-worker-buy" },
      body: JSON.stringify({ productKey: "cowrie_5_v1", email: "buyer@example.com", country: "GH", playerId: owner, adult: true }),
    })).json();
    assert.equal((await earnWorker.fetch("http://127.0.0.1/api/paid/mock-pay", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: checkout.orderId }),
    })).status, 200);
    assert.equal((await (await earnWorker.fetch(`http://127.0.0.1/api/paid/access?player=${owner}`)).json()).cowries, 11);
    assert.equal((await (await earnWorker.fetch("http://127.0.0.1/api/paid/cowries/spend", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerId: owner, count: 6 }),
    })).json()).cowries, 5);
    const refund = {
      id: "evt_earn_worker_refund1",
      type: "charge.refunded",
      livemode: false,
      data: { object: { amount: 199, amount_refunded: 199, refunded: true, currency: "gbp", payment_intent: `pi_mock_${checkout.orderId.slice(4)}` } },
    };
    const raw = JSON.stringify(refund);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", "whsec_local_test_secret_value").update(`${timestamp}.${raw}`).digest("hex");
    assert.equal((await earnWorker.fetch("http://127.0.0.1/api/paid/webhook", {
      method: "POST", headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }, body: raw,
    })).status, 200);
    assert.equal((await (await earnWorker.fetch(`http://127.0.0.1/api/paid/access?player=${owner}`)).json()).cowries, 0);
    const card = await earnWorker.fetch("http://127.0.0.1/api/paid/share-card.svg?edition=west&score=12");
    assert.equal(card.status, 200);
    const cardSvg = await card.text();
    assert.match(cardSvg, /Can you beat my score\?/);
    assert.doesNotMatch(cardSvg, /\?edition=|wa\.me/);
    const coldStart = Date.now();
    const png = await earnWorker.fetch("http://127.0.0.1/api/paid/share-card.png?edition=west&score=8&utm=cold");
    const coldMs = Date.now() - coldStart;
    assert.equal(png.status, 200);
    assert.equal(png.headers.get("x-share-card-cache"), "miss");
    assert.match(png.headers.get("content-type") || "", /image\/png/);
    const pngBytes = new Uint8Array(await png.arrayBuffer());
    assert.equal(pngBytes[0], 137);
    const warmStart = Date.now();
    const warm = await earnWorker.fetch("http://127.0.0.1/api/paid/share-card.png?score=8&edition=west&frame=card&ref=abcdefgh");
    const warmMs = Date.now() - warmStart;
    assert.equal(warm.headers.get("x-share-card-cache"), "hit");
    assert.ok(warmMs < 200, `warm worker share-card took ${warmMs}ms`);
    console.log(`worker share-card png cold ${coldMs}ms warm ${warmMs}ms`);
    const story = await earnWorker.fetch("http://127.0.0.1/api/paid/share-card.png?edition=east&score=8&frame=story");
    const storyBytes = new Uint8Array(await story.arrayBuffer());
    assert.equal(story.status, 200);
    assert.equal(new DataView(storyBytes.buffer).getUint32(20), 1920);
    const preview = await (await earnWorker.fetch("http://127.0.0.1/?edition=west&score=8")).text();
    assert.match(preview, /og:image/);
    assert.match(preview, /share-card\.png\?edition=west/);
    const referrer = await (await earnWorker.fetch("http://127.0.0.1/api/paid/referral?player=earn_worker_refer_01")).json();
    const newbie = "earn_worker_new_0001";
    assert.equal((await (await earnWorker.fetch("http://127.0.0.1/api/paid/referral/arrive", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: "earn_worker_refer_01", code: referrer.code }),
    })).json()).reason, "self");
    assert.equal((await (await earnWorker.fetch("http://127.0.0.1/api/paid/referral/arrive", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: newbie, code: referrer.code }),
    })).json()).reason, "recorded");
    await earnWorker.fetch("http://127.0.0.1/api/paid/games/begin", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: newbie, attemptId: "attempt_earn_worker_02", edition: "east" }),
    });
    const finished = await (await earnWorker.fetch("http://127.0.0.1/api/paid/games/finish", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: newbie, attemptId: "attempt_earn_worker_02" }),
    })).json();
    assert.equal(finished.referral.referrer.cowries, 2);
    assert.equal(finished.referral.player.cowries, 1);
    assert.equal((await (await earnWorker.fetch(`http://127.0.0.1/api/paid/access?player=${newbie}`)).json()).cowries, 1);
    assert.equal((await (await earnWorker.fetch("http://127.0.0.1/api/paid/access?player=earn_worker_refer_01")).json()).cowries, 2);

    const dailyA = "daily_worker_player_a";
    const dailyB = "daily_worker_player_b";
    const firstDaily = await (await earnWorker.fetch("http://127.0.0.1/api/paid/daily/begin", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: dailyA, edition: "west", nickname: "Ayo" }),
    })).json();
    const secondDaily = await (await earnWorker.fetch("http://127.0.0.1/api/paid/daily/begin", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId: dailyB, edition: "west", nickname: "Zuri" }),
    })).json();
    assert.deepEqual(secondDaily.questions.map((question) => question.id), firstDaily.questions.map((question) => question.id));
    const forged = await (await earnWorker.fetch("http://127.0.0.1/api/paid/daily/finish", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerId: dailyA, edition: "west", score: 12,
        answers: firstDaily.questions.map((question) => [question.correct[0] === 0 ? 1 : 0]),
      }),
    })).json();
    assert.equal(forged.score, 0);
    assert.equal(forged.already, false);
    assert.equal(forged.nickname, "Ayo");
    const wallet = await (await earnWorker.fetch(`http://127.0.0.1/api/paid/access?player=${dailyA}`)).json();
    assert.equal(wallet.cowries, 0);
    assert.equal(wallet.completedGames, 0);
    assert.equal(wallet.freeGamesLeft, 2);
    await new Promise((resolve) => setTimeout(resolve, 8_500));
    const ranked = await (await earnWorker.fetch("http://127.0.0.1/api/paid/daily/finish", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerId: dailyB, edition: "west",
        answers: secondDaily.questions.map((question) => question.correct),
      }),
    })).json();
    assert.equal(ranked.score, 12);
    assert.equal(ranked.nickname, "Zuri");
    const board = await (await earnWorker.fetch(`http://127.0.0.1/api/paid/daily/board?player=${dailyB}&edition=west`)).json();
    assert.equal(board.top[0].nickname, "Zuri");
    assert.equal(board.top[0].score, 12);
    assert.equal(board.top[0].you, true);
    assert.equal(board.rank, 1);
    assert.equal(JSON.stringify(board).includes(dailyB), false);
    assert.equal(JSON.stringify(board).includes("Anonymous"), false);
    const repeatDaily = await (await earnWorker.fetch("http://127.0.0.1/api/paid/daily/finish", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerId: dailyB, edition: "west",
        answers: secondDaily.questions.map((question) => question.correct),
      }),
    })).json();
    assert.equal(repeatDaily.already, true);
    assert.equal(repeatDaily.score, 12);
  } finally {
    await earnWorker.stop();
  }
});
