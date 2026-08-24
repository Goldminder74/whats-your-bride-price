import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

const slugs = Object.freeze({ west: "8".repeat(48), east: "9".repeat(48), north: "a".repeat(48), private: "b".repeat(48), expired: "c".repeat(48), revoked: "d".repeat(48), deleted: "e".repeat(48), missing: "1".repeat(48) });
const workerUrl = new URL("../dist/server/index.js", import.meta.url); workerUrl.searchParams.set("result-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
const environment = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }; const context = { waitUntil() {}, passThroughOnException() {} };
async function request(path, init = {}) { return worker.fetch(new Request(`http://127.0.0.1:3100${path}`, init), environment, context); }
async function html(slug, headers = {}) { const response = await request(`/result/${slug}`, { headers: { accept: "text/html", ...headers } }); assert.equal(response.status, 200); return response.text(); }
function head(source) { return source.slice(0, source.indexOf("</head>")); } function initialBody(source) { return source.slice(source.indexOf("<body>"), source.indexOf("<script", source.indexOf("<body>"))); }
function meta(source, property) { const expression = new RegExp(`<meta[^>]+(?:property|name)="${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]+content="([^"]+)"|<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "i"); const match = source.match(expression); return match?.[1] || match?.[2] || null; }

test("raw HTML contains the public projection, regional identity and permanent safeguard without JavaScript", async () => {
  const source = await html(slugs.west); const body = initialBody(source);
  assert.match(body, /West Africa(?:<!-- -->)? edition/i); assert.match(body, /A challenger/i); assert.match(body, />12<\/strong>.*\/.*12/i); assert.match(body, /Bride Price Royalty/i); assert.match(body, /West Africa mastery/i); assert.match(body, /A playful culture score, never a measure of human worth\./i); assert.match(body, /\/regions\/west-africa\.webp/i); assert.match(body, /\/avatars\/adjoa-v2\.webp/i);
  assert.doesNotMatch(body, /Review-only|private name|review_result|anonymous_subject|attempt|token|idempotency|data:image|blob:/i);
});

test("server metadata is complete, canonical, absolute and unique to score and edition", async () => {
  const west = head(await html(slugs.west)); const east = head(await html(slugs.east));
  for (const [source, slug, label] of [[west, slugs.west, "West Africa"], [east, slugs.east, "East Africa"]]) {
    const canonical = `http://127.0.0.1:3100/result/${slug}`;
    assert.match(source, new RegExp(`<title>[^<]*${label}`)); assert.match(source, new RegExp(`<link[^>]+rel="canonical"[^>]+href="${canonical}"|<link[^>]+href="${canonical}"[^>]+rel="canonical"`));
    assert.equal(meta(source, "og:type"), "website"); assert.equal(meta(source, "og:url"), canonical); assert.equal(meta(source, "og:site_name"), "What’s Your Bride Price?"); assert.equal(meta(source, "og:locale"), "en_GB");
    assert.equal(meta(source, "og:image:type"), "image/png"); assert.equal(meta(source, "og:image:width"), "1200"); assert.equal(meta(source, "og:image:height"), "630"); assert.match(meta(source, "og:image"), /^http:\/\/127\.0\.0\.1:3100\/result\/[0-9a-f]{48}\/preview\/[0-9a-f]{64}\.png$/);
    assert.ok(meta(source, "og:title")); assert.ok(meta(source, "og:description")); assert.ok(meta(source, "og:image:alt")); assert.equal(meta(source, "twitter:card"), "summary_large_image"); assert.ok(meta(source, "twitter:title")); assert.ok(meta(source, "twitter:description")); assert.ok(meta(source, "twitter:image")); assert.ok(meta(source, "twitter:image:alt"));
  }
  assert.notEqual(meta(west, "og:title"), meta(east, "og:title")); assert.notEqual(meta(west, "og:description"), meta(east, "og:description")); assert.notEqual(meta(west, "og:image"), meta(east, "og:image"));
});

test("preview delivery is public, immutable, conditional and exactly 1200 by 630 PNG", async () => {
  const source = head(await html(slugs.west)); const preview = new URL(meta(source, "og:image"));
  const response = await request(preview.pathname, { headers: { "user-agent": "facebookexternalhit/1.1" } }); assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "image/png"); assert.match(response.headers.get("cache-control"), /max-age=31536000.*immutable/); assert.match(response.headers.get("etag"), /^"[0-9a-f]{64}"$/);
  const bytes = new Uint8Array(await response.arrayBuffer()); assert.equal(new DataView(bytes.buffer).getUint32(16), 1200); assert.equal(new DataView(bytes.buffer).getUint32(20), 630); assert.equal(Number(response.headers.get("content-length")), bytes.length); assert.ok(bytes.length <= 1_000_000); assert.ok(bytes.length < 500_000);
  const conditional = await request(preview.pathname, { headers: { "if-none-match": response.headers.get("etag") } }); assert.equal(conditional.status, 304);
});

test("private, expired, revoked, deleted, missing and hostile slugs use one neutral body and metadata", async () => {
  const sources = await Promise.all([slugs.private, slugs.expired, slugs.revoked, slugs.deleted, slugs.missing, "not-a-slug", "%2e%2e%2fprivate"].map((slug) => html(slug)));
  for (const source of sources) { const body = initialBody(source); const metadata = head(source); assert.match(body, /This result is no longer available\./); assert.match(metadata, /Culture Result Unavailable/); assert.doesNotMatch(`${body}${metadata}`, /12\/12|10\/12|7\/12|West Africa mastery|Review-only private name|review_result|revoked|deleted|expired/i); }
});

test("Facebook, WhatsApp and X-style crawler GETs are read-only and metadata routes never publish", async () => {
  for (const userAgent of ["facebookexternalhit/1.1", "WhatsApp/2.24", "Twitterbot/1.0"]) { const response = await request(`/result/${slugs.west}`, { headers: { accept: "text/html", "user-agent": userAgent } }); assert.equal(response.status, 200); assert.match(await response.text(), /A challenger/); }
  assert.equal((await request(`/result/${slugs.private}/publication`, { method: "GET" })).status, 405);
  assert.match(await html(slugs.private), /This result is no longer available/);
});

test("same-origin owner publication creates media once and unpublication removes both page and asset", async () => {
  const mutate = (action, origin = "http://127.0.0.1:3100", anonymousSessionCredential = "01".repeat(16)) => request(`/result/${slugs.private}/publication`, { method: "POST", headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify({ action, anonymousSessionCredential }) });
  assert.equal((await mutate("publish", "https://attacker.example")).status, 403);
  assert.equal((await request(`/result/${slugs.private}/publication`, { method: "POST", headers: { origin: "http://127.0.0.1:3100", "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify({ action: "publish" }) })).status, 400);
  assert.equal((await mutate("publish", "http://127.0.0.1:3100", "02".repeat(16))).status, 404);
  const copiedStoredHash = createHash("sha256").update(`wybp-anonymous-subject-v1\0${"01".repeat(16)}`).digest("hex");
  assert.equal((await mutate("publish", "http://127.0.0.1:3100", copiedStoredHash)).status, 404);
  assert.equal((await request(`/result/${slugs.expired}/publication`, { method: "POST", headers: { origin: "http://127.0.0.1:3100", "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify({ action: "publish", anonymousSessionCredential: "01".repeat(16) }) })).status, 404);
  assert.match(await html(slugs.private), /This result is no longer available/);
  const published = await mutate("publish"); assert.equal(published.status, 200); const payload = await published.json(); assert.equal(payload.result.displayName, "A challenger"); assert.match(payload.resultUrl, new RegExp(`/result/${slugs.private}$`)); assert.match(payload.previewUrl, /\/preview\/[0-9a-f]{64}\.png$/); assert.doesNotMatch(JSON.stringify(payload), /Review-only|subject|hash|token|attempt|internal|photo/i);
  assert.match(await html(slugs.private), /Central Africa/); assert.equal((await mutate("publish")).status, 200);
  const previewPath = new URL(payload.previewUrl).pathname; assert.equal((await request(previewPath)).status, 200);
  const unpublished = await mutate("unpublish"); assert.equal(unpublished.status, 200); assert.equal((await unpublished.json()).published, false); assert.match(await html(slugs.private), /This result is no longer available/); assert.equal((await request(previewPath)).status, 404); assert.equal((await mutate("unpublish")).status, 200);
});
