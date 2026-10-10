import assert from "node:assert/strict";
import test from "node:test";

async function worker() {
  const url = new URL("../dist/server/index.js", import.meta.url); url.searchParams.set("cowrie-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(url.href)).default;
}
const environment = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const context = { waitUntil() {}, passThroughOnException() {} };

test("ordinary builds render no Cowrie interface and query, cookie or storage-like inputs cannot enable it", async () => {
  const runtime = await worker();
  const response = await runtime.fetch(new Request("http://localhost/?cowrie_economy=true&random_quick_play=true", { headers: { cookie: "cowrie_economy=true", "x-local-storage-cowrie": "true" } }), environment, context);
  assert.equal(response.status, 200); const html = await response.text(); assert.doesNotMatch(html, /data-cowrie-wallet|Cowrie Wallet|Total available/);
});

test("all disabled Cowrie mutation routes return the same neutral response without a write", async () => {
  const runtime = await worker();
  for (const path of ["/cowries/wallet", "/cowries/projection", "/cowries/play", "/cowries/complete", "/cowries/recover", "/cowries/rotate", "/cowries/clear"]) {
    const response = await runtime.fetch(new Request(`https://example.com${path}?cowrie_economy=true`, { method: "POST", headers: { origin: "https://example.com", "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify({ anonymousSessionCredential: "a".repeat(32) }) }), environment, context);
    assert.equal(response.status, 404, path); assert.deepEqual(await response.json(), { available: false });
  }
});
