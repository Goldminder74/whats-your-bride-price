import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("daily-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("daily routes remain neutrally unavailable and query strings cannot enable them", async () => {
  for (const path of ["/daily/west", "/daily/west/2026-09-06", "/daily/west?daily_challenge=true&streaks=true"]) {
    const response = await render(path); assert.equal(response.status, 200, path);
    const html = await response.text(); assert.match(html, /Daily challenge unavailable/i); assert.doesNotMatch(html, /Play today’s official set|day streak/i);
  }
});

test("disabled daily mutation routes return neutral unavailable responses", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url); workerUrl.searchParams.set("daily-post-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  for (const path of ["/daily/start", "/daily/complete", "/streaks/clear"]) {
    const response = await worker.fetch(new Request(`https://example.com${path}?daily_challenge=true&streaks=true`, { method: "POST", headers: { origin: "https://example.com", "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "content-type": "application/json" }, body: "{}" }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
    assert.equal(response.status, 404, path); assert.deepEqual(await response.json(), path === "/daily/complete" ? { completed: false } : { available: false });
  }
});
