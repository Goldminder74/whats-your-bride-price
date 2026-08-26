import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("analytics-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("ordinary production keeps analytics off and query parameters cannot enable it", async () => {
  const response = await render("/?first_party_analytics=1&analytics=true&fixture=analytics");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /data-analytics-consent|Accept analytics|Manage analytics preferences/i);
});

test("analytics route is POST-only so crawler GET requests have no write handler", async () => {
  const route = await readFile(new URL("../app/analytics/events/route.ts", import.meta.url), "utf8");
  assert.match(route, /export async function POST\(/);
  assert.doesNotMatch(route, /export (?:async )?function (?:GET|HEAD)\(/);
});

test("analytics source has no third-party SDK, cookies, fingerprinting, persistent queue or private payload fields", async () => {
  const files = [
    "../app/AnalyticsConsent.tsx", "../app/analyticsAdapter.ts", "../app/analyticsLocal.ts",
    "../app/analyticsPreference.ts", "../app/analyticsRuntime.ts", "../app/analytics/events/route.ts",
    "../db/analytics.ts", "../db/analyticsContracts.ts",
  ];
  const source = (await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /google-analytics|googletagmanager|gtag\s*\(|meta pixel|fbq\s*\(|tiktok pixel|hotjar|segment\.com|mixpanel|amplitude/i);
  assert.doesNotMatch(source, /document\.cookie|sendBeacon|WebGLRenderingContext|AudioContext|canvas\.toDataURL|navigator\.userAgent|screen\.(?:width|height)|fonts\.check/i);
  assert.doesNotMatch(source, /indexedDB|CacheStorage|serviceWorker|analytics-queue|localStorage\.setItem\([^)]*(?:event|queue)/i);
  assert.doesNotMatch(source, /credentials:\s*["']include["']|mode:\s*["']cors["']|console\.(?:log|error|warn)/i);
  assert.match(source, /credentials:\s*["']omit["']/); assert.match(source, /mode:\s*["']same-origin["']/);
});
