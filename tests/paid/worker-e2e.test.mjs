import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { regions } from "../../app/gameData.ts";

test("local Worker completes a round, takes a mock Stripe payment, and refunds it", { timeout: 60_000 }, async () => {
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
      EMAIL_FROM: "receipts@mail.classesforculture.com",
      PUBLIC_APP_ORIGIN: "https://brideprice.classesforculture.com",
    },
    experimental: { disableExperimentalWarning: true, forceLocal: true, disableDevRegistry: true },
  });
  try {
    const home = await worker.fetch("http://127.0.0.1/");
    const html = await home.text();
    assert.equal(home.status, 200);
    assert.match(html, /https:\/\/brideprice\.classesforculture\.com\//);
    assert.match(html, /What’s Your Bride Price\?/);
    const asset = await worker.fetch("http://127.0.0.1/favicon.svg");
    assert.equal(asset.status, 200);

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
    assert.equal(access.cowries, 15);
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
    assert.match(legal, /PLACEHOLDER/);
    assert.match(legal, /14-day/);
  } finally {
    await worker.stop();
  }
});
