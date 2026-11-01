import assert from "node:assert/strict";
import test from "node:test";

// Direct invocation of the locally built worker; these URLs never perform fetches
// to a hosted service. The build uses the explicitly authorised review fixtures.
const runtime = (await import(new URL("../dist/server/index.js", import.meta.url))).default;
const environment = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const context = { waitUntil() {}, passThroughOnException() {} };
const origin = "https://brideprice.classesforculture.com";
const paths = ["wallet", "projection", "play", "recover", "rotate", "clear", "complete"];
async function request(path, body, changes = {}) {
  const headers = { origin, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "content-type": "application/json", ...changes.headers };
  return runtime.fetch(new Request(`${changes.origin || origin}/cowries/${path}`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }), environment, context);
}

test("every enabled Cowrie POST boundary rejects untrusted origins, insecure requests and invalid Fetch Metadata", async () => {
  for (const path of paths) for (const changes of [
    { headers: { origin: "https://untrusted.example" } },
    { origin: "https://untrusted.example", headers: { origin: "https://untrusted.example" } },
    { origin: "http://brideprice.classesforculture.com", headers: { origin: "http://brideprice.classesforculture.com" } },
    { headers: { "sec-fetch-site": "cross-site" } },
    { headers: { "sec-fetch-site": "none" } },
    { headers: { "sec-fetch-mode": "navigate" } },
  ]) {
    const response = await request(path, { anonymousSessionCredential: "d".repeat(32) }, changes);
    assert.equal(response.status, 403, path); assert.deepEqual(await response.json(), { available: false });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
});

test("enabled wallet creation is deliberate and rejects browser timestamp, balance and state authority", async () => {
  const owner = { anonymousSessionCredential: "e".repeat(32) };
  assert.equal((await request("projection", owner)).ok, false);
  for (const extra of [{ cowrie_issued_at: Date.now() }, { cowrieIssuedAt: Date.now() }, { balance: 200 }, { state: "active" }]) assert.equal((await request("wallet", { ...owner, ...extra })).status, 400);
  const response = await request("wallet", owner); assert.equal(response.status, 200);
  const created = await response.json(); assert.match(created.recoveryCredential, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(created.wallet), /issued|hash|internal|ledger|credential/i);
  const repeated = await (await request("wallet", owner)).json(); assert.equal(repeated.recoveryCredential, undefined);
  assert.deepEqual(repeated.wallet, created.wallet);
  const projection = await (await request("projection", owner)).json(); assert.deepEqual(projection.wallet, created.wallet);
});

test("strict body size, JSON and content type validation precede any enabled write", async () => {
  for (const path of paths) {
    assert.equal((await request(path, "{invalid")).status, 400);
    assert.equal((await request(path, "x".repeat(4097))).status, 400);
    assert.equal((await request(path, "{}", { headers: { "content-length": "4097" } })).status, 413);
    assert.equal((await request(path, "{}", { headers: { "content-type": "text/plain" } })).status, 415);
  }
});

test("no GET may create, issue, recover or reverse a wallet operation", async () => {
  for (const path of paths) {
    const response = await runtime.fetch(new Request(`${origin}/cowries/${path}`), environment, context);
    assert.equal(response.status, 405, path);
  }
});
