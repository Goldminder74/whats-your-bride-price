// Local simulation only: no Netlify/Cloudflare/Stripe service is contacted.
import assert from "node:assert/strict";
import { readFile, stat, readdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { SignJWT } from "jose";
import { chromium } from "@playwright/test";
import { exerciseCompiledNavigation, exerciseCompiledImageAnswer } from "./compiled-navigation.mjs";
import { exerciseRegionalProgression } from "./compiled-regional-progression.mjs";
import { exerciseMobileLayout } from "./compiled-mobile.mjs";
import { verifyRelease } from "../scripts/netlify-release.mjs";

const pointer = JSON.parse(await readFile("outputs/netlify-worker/latest.json", "utf8"));
const manifest = await verifyRelease(pointer.directory);
assert.equal(manifest.configuration.synthetic, true, "Harness only accepts synthetic local builds");
const root = resolve(pointer.directory);
const client = resolve(root, "client");
const { default: worker } = await import(pathToFileURL(resolve(root, "server/index.js")).href);
const origin = manifest.configuration.origin;
const canary = "synthetic-runtime-secret-canary-never-in-output-" + "z".repeat(32);
let imageTransforms = 0;
const env = {
  WYBP_NETLIFY_PROXY_SECRET: canary, WYBP_NETLIFY_PROJECT_ID: manifest.configuration.projectId,
  WYBP_NETLIFY_CONTEXT: manifest.configuration.context, WYBP_NETLIFY_SITE_URL: origin,
  ASSETS: { fetch: asset },
  IMAGES: { input: stream => ({ transform: options => {
    imageTransforms++;
    assert.equal(options.width, 128);
    return { output: async () => ({ response: async () => new Response(await new Response(stream).arrayBuffer(), { headers: { "content-type": "image/png" } }) }) };
  } }) },
};
const ctx = { waitUntil(p) { void p.catch(() => {}); }, passThroughOnException() {} };
const mime = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
async function asset(request) {
  const path = resolve(client, "." + decodeURIComponent(new URL(request.url).pathname));
  if (!path.startsWith(client + sep)) return new Response(null, { status: 404 });
  try { if (!(await stat(path)).isFile()) return new Response(null, { status: 404 }); }
  catch { return new Response(null, { status: 404 }); }
  return new Response(await readFile(path), { headers: { "content-type": mime[extname(path)] || "application/octet-stream" } });
}
async function proxy(path, init = {}) {
  const signed = await new SignJWT({ iss: "netlify", exp: Math.floor(Date.now() / 1000) + 60, netlify_id: env.WYBP_NETLIFY_PROJECT_ID, deploy_context: env.WYBP_NETLIFY_CONTEXT, site_url: origin })
    .setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(canary));
  return worker.fetch(new Request(`https://wybp-local-fixture.example.invalid${path}`, { ...init, headers: { ...init.headers, "x-nf-sign": signed } }), env, ctx);
}

for (const path of ["/", "/favicon.ico", "/_next/static/fake.js", "/_vinext/image?url=%2Ffavicon-cowrie-192.png&w=128&q=75"]) {
  assert.equal((await worker.fetch(new Request("https://direct.invalid" + path), env, ctx)).status, 404);
}
assert.equal((await proxy("/favicon.ico")).status, 200);
assert.equal((await proxy("/_vinext/image?url=%2Ffavicon-cowrie-192.png&w=128&q=75")).status, 200);
assert.equal(imageTransforms, 1, "Existing image endpoint receives the local Images binding mock");
for (const path of ["/owner/questions", "/owner/analytics", "/signin-with-chatgpt", "/commerce/stripe-webhook", "/cowries/wallet"]) {
  assert.equal((await proxy(path, { method: path.startsWith("/commerce") || path.startsWith("/cowries") ? "POST" : "GET", headers: { "oai-authenticated-user-id": "spoofed-owner" } })).status, 404);
}
const home = await proxy("/");
assert.equal(home.status, 200);
assert.match(home.headers.get("cache-control"), /private, no-store/);
const html = await home.text();
assert.match(html, /<html/);
assert.ok(!html.includes(canary));
const navigation = await proxy("/privacy", { headers: { rsc: "1" } });
assert.equal(navigation.status, 307);
assert.equal(navigation.headers.get("location"), "/privacy?_rsc");
assert.match(navigation.headers.get("cache-control"), /private, no-store/);
const rsc = await proxy(navigation.headers.get("location"), { headers: { rsc: "1" } });
assert.equal(rsc.status, 200);
assert.match(rsc.headers.get("content-type"), /text\/x-component/);
assert.ok((await rsc.text()).length > 100);
const result = await proxy("/result/" + "a".repeat(48));
assert.match(await result.text(), /wybp-result-metadata/);
const answer = await proxy("/questions/image-answer", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "content-type": "application/json" }, body: "{}" });
assert.equal(answer.status, 403);

let clientJs = "";
for (const path of Object.keys(manifest.files)) {
  const bytes = await readFile(resolve(root, path));
  assert.ok(!bytes.includes(Buffer.from(canary)));
  if (path.startsWith("client/") && path.endsWith(".js")) clientJs += bytes.toString();
}
assert.ok(clientJs.includes(origin), "Client uses explicit test origin");
for (const forbidden of ["WYBP_NETLIFY_PROXY_SECRET", "jwtVerify", "BEGIN PRIVATE KEY", "whsec_"]) assert.ok(!clientJs.includes(forbidden), `Client excludes ${forbidden}`);
assert.ok(!(await readdir(root)).includes(".openai"));

const browser = await chromium.launch({ headless: true, channel: process.platform === "win32" ? "msedge" : undefined });
try {
  const context = await browser.newContext({ reducedMotion: "reduce", serviceWorkers: "block", hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  let browserRscRequests = 0;
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", async route => {
    const incoming = route.request();
    const url = new URL(incoming.url());
    assert.equal(url.origin, origin, "Browser must not contact hosted services");
    if (url.searchParams.has("_rsc") || incoming.headers().rsc === "1") browserRscRequests++;
    const headers = await incoming.allHeaders();
    if (url.pathname === "/questions/image-answer" && incoming.method() === "POST") {
      assert.equal(headers.origin, origin);
      // Interception is before Chromium's network-layer Fetch Metadata. Model
      // that layer for this same-origin POST; hostile metadata is tested above.
      headers["sec-fetch-site"] = "same-origin";
      headers["sec-fetch-mode"] = "cors";
    }
    const staticResponse = incoming.method() === "GET" ? await asset(new Request(url)) : null;
    const response = staticResponse?.status === 200 ? staticResponse : await proxy(url.pathname + url.search, {
      method: incoming.method(), headers, body: incoming.postDataBuffer() || undefined,
    });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await exerciseCompiledNavigation(page, origin);
  await exerciseCompiledImageAnswer(page, origin);
  await exerciseMobileLayout(page, origin);
  await exerciseRegionalProgression(page, origin);
  assert.ok(browserRscRequests > 0, "Next-style Link navigation uses the authenticated RSC path");
  assert.deepEqual(errors, []);
  await context.close();
} finally { await browser.close(); }
console.log("PASS: synthetic compiled SSR/RSC, hydration/navigation, metadata, image/static ingress, disabled features, origin checks, client exclusions and paired release. No live proxy validation claimed.");
