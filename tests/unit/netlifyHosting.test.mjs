import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignJWT } from "jose";
import { netlifyIngress } from "../../worker/netlifyIngress.ts";
import { validateHostingOrigin } from "../../app/hostingOrigin.ts";
import { resolvePublicAppOrigin, createResultUrl, createChallengeUrl, createPublicAppUrl } from "../../app/publicAppOrigin.ts";
import { POST as imageAnswer } from "../../app/questions/image-answer/route.ts";
import { verifyStripeWebhook } from "../../db/commerceContracts.ts";
import { createReviewCommerceConfig } from "../../db/commerce.ts";
import { packageRelease, verifyRelease, syntheticConfiguration, netlifyConfiguration } from "../../scripts/netlify-release.mjs";
import { verifyNetlifyClient } from "../../scripts/verify-netlify-client.mjs";

const hosting = { environment: "test", origin: syntheticConfiguration.origin };
const now = new Date("2026-09-27T12:00:00Z");
const key = "synthetic-test-only-proxy-secret-" + "x".repeat(32);
const env = { WYBP_NETLIFY_PROXY_SECRET: key, WYBP_NETLIFY_PROJECT_ID: syntheticConfiguration.projectId, WYBP_NETLIFY_CONTEXT: "production", WYBP_NETLIFY_SITE_URL: hosting.origin };
const baseClaims = { iss: "netlify", exp: Math.floor(+now / 1000) + 60, netlify_id: env.WYBP_NETLIFY_PROJECT_ID, deploy_context: "production", site_url: hosting.origin };
async function token(claims = {}, algorithm = "HS256", secret = key) {
  return new SignJWT({ ...baseClaims, ...claims }).setProtectedHeader({ alg: algorithm }).sign(new TextEncoder().encode(secret));
}
async function request({ claims, algorithm, secret, headers = {}, body, path = "/", method = body === undefined ? "GET" : "POST" } = {}) {
  return new Request(`https://wybp-local-fixture.example.invalid${path}`, {
    method, body, headers: { "x-nf-sign": await token(claims, algorithm, secret), ...headers },
  });
}

test("valid documented Netlify proxy claims preserve URL, navigation headers and redirects", async () => {
  let calls = 0;
  const response = await netlifyIngress(await request({ path: "/privacy?source=direct", headers: { rsc: "1", "next-router-state-tree": "state", cookie: "functional=test" } }), env, hosting, async r => {
    calls++;
    assert.equal(r.url, `${hosting.origin}/privacy?source=direct`);
    assert.equal(r.headers.get("rsc"), "1");
    assert.equal(r.headers.get("next-router-state-tree"), "state");
    assert.equal(r.headers.get("cookie"), "functional=test");
    return Response.redirect(`${hosting.origin}/privacy/retention`, 307);
  }, now);
  assert.equal(calls, 1);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), `${hosting.origin}/privacy/retention`);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.equal(response.headers.get("netlify-cdn-cache-control"), "no-store");
});

test("missing, malformed, expired, wrong-project/context/site/issuer/algorithm/signature fail before application or assets", async () => {
  const cases = [
    { headers: { "x-nf-sign": "" } }, { headers: { "x-nf-sign": "invalid" } },
    { claims: { exp: Math.floor(+now / 1000) } }, { claims: { exp: undefined } },
    { claims: { iss: "attacker" } }, { claims: { netlify_id: "wrong-project" } },
    { claims: { site_url: "https://evil.example" } }, { claims: { deploy_context: "deploy-preview" } },
    { algorithm: "HS384" }, { secret: "wrong".repeat(16) },
  ];
  for (const item of cases) for (const path of ["/", "/_next/static/app.js", "/favicon.ico"]) {
    const response = await netlifyIngress(await request({ ...item, path }), env, hosting, async () => { assert.fail("Must not dispatch"); }, now);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "");
  }
  for (const overrides of [{ WYBP_NETLIFY_PROXY_SECRET: "" }, { WYBP_NETLIFY_PROJECT_ID: "" }, { WYBP_NETLIFY_SITE_URL: "https://evil.example" }]) {
    assert.equal((await netlifyIngress(await request(), { ...env, ...overrides }, hosting, async () => { assert.fail(); }, now)).status, 404);
  }
});

test("spoofed Sites identity and forwarding headers are stripped without creating ownership", async () => {
  const response = await netlifyIngress(await request({ headers: {
    "oai-authenticated-user-id": "owner", "oai-authenticated-user-email": "owner@example.invalid",
    "x-forwarded-host": "evil.example", "x-forwarded-proto": "http", forwarded: "host=evil.example",
    origin: hosting.origin, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors",
  } }), env, hosting, async r => {
    for (const header of ["oai-authenticated-user-id", "oai-authenticated-user-email", "x-forwarded-host", "x-forwarded-proto", "forwarded", "x-nf-sign"]) assert.equal(r.headers.get(header), null);
    assert.equal(r.headers.get("origin"), hosting.origin);
    assert.equal(r.headers.get("sec-fetch-site"), "same-origin");
    return new Response(null, { status: 403 });
  }, now);
  assert.equal(response.status, 403);
});

test("actual answer handler retains browser Origin and Fetch Metadata enforcement", async () => {
  for (const [origin, site, expected] of [[hosting.origin, "same-origin", 400], ["https://evil.example", "same-origin", 403], [hosting.origin, "cross-site", 403]]) {
    const response = await netlifyIngress(await request({ path: "/questions/image-answer", body: "{}", headers: { origin, "sec-fetch-site": site, "sec-fetch-mode": "cors", "content-type": "application/json" } }), env, hosting, imageAnswer, now);
    assert.equal(response.status, expected);
  }
});

test("local proxy preserves exact Stripe body bytes; Stripe verification remains independently required", async () => {
  const config = createReviewCommerceConfig();
  const raw = '\n  ' + JSON.stringify({ id: `evt_${"a".repeat(24)}`, type: "checkout.session.completed", livemode: false, data: { object: {
    id: "cs_test_paid", client_reference_id: `rr_${"1".repeat(32)}`, payment_status: "paid", payment_link: config.expectedPaymentLinkId,
    payment_intent: "pi_paid", amount_total: 199, currency: "gbp", mode: "payment", metadata: { note: "é" },
  } } }) + '\r\n';
  const timestamp = Math.floor(+now / 1000);
  const signature = `t=${timestamp},v1=${createHmac("sha256", config.webhookSigningSecret).update(`${timestamp}.${raw}`).digest("hex")}`;
  for (const [stripeSignature, expected] of [[signature, 200], ["forged", 400]]) {
    const response = await netlifyIngress(await request({ path: "/commerce/stripe-webhook", body: raw, headers: { "content-type": "application/json", "stripe-signature": stripeSignature } }), env, hosting, async r => {
      const bytes = Buffer.from(await r.arrayBuffer());
      assert.deepEqual(bytes, Buffer.from(raw));
      try { await verifyStripeWebhook({ rawBody: bytes.toString(), signatureHeader: r.headers.get("stripe-signature"), config, now: +now }); return new Response(null, { status: 200 }); }
      catch { return new Response(null, { status: 400 }); }
    }, now);
    assert.equal(response.status, expected);
  }
});

test("trusted environment configuration generates exact links and preserves Sites defaults", () => {
  assert.equal(resolvePublicAppOrigin(undefined, "production"), "https://brideprice.classesforculture.com");
  for (const config of [hosting, { environment: "production", origin: "https://classesforculture.com" }]) {
    const origin = resolvePublicAppOrigin(undefined, "production", undefined, config);
    assert.equal(createResultUrl("a".repeat(48), origin), `${config.origin}/result/${"a".repeat(48)}`);
    assert.equal(createChallengeUrl("b".repeat(48), origin), `${config.origin}/challenge/${"b".repeat(48)}`);
    for (const path of ["/", "/royal-reveal/return", "/cowries/return"]) assert.ok(createPublicAppUrl(path, { nominated: "1" }, origin).startsWith(config.origin + "/"));
    assert.throws(() => createPublicAppUrl("//evil.example", {}, origin));
    assert.throws(() => createPublicAppUrl("/", { origin: "https://evil.example" }, origin));
    assert.throws(() => resolvePublicAppOrigin("https://evil.example", "production", undefined, config));
  }
  for (const origin of ["http://foo.netlify.app", "https://*.netlify.app", "https://deploy-preview-1--foo.netlify.app", "https://foo.netlify.app/", "https://foo.netlify.app?origin=x", "https://user@foo.netlify.app", "https://evil.example"]) assert.throws(() => validateHostingOrigin({ environment: "test", origin }));
  assert.throws(() => resolvePublicAppOrigin("https://classesforculture.com", "production"));
});

test("paired releases exclude non-public material and detect tampering; synthetic deployments fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "wybp-release-test-"));
  await mkdir(join(root, "dist/client"), { recursive: true });
  await mkdir(join(root, "dist/server"), { recursive: true });
  for (const [path, bytes] of Object.entries({ "client/app.js": "public client", "client/private.html": "private", "client/evidence.json": "evidence", "client/source.map": "source", "client/secret.env": "secret", "server/index.js": "server-only", "server/wrangler.json": JSON.stringify({ compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"] }) })) await writeFile(join(root, "dist", path), bytes);
  const release = await packageRelease(root, syntheticConfiguration);
  const manifest = await verifyRelease(release);
  assert.deepEqual(await readdir(join(release, "client")), ["app.js"]);
  assert.equal(manifest.configuration.synthetic, true);
  const config = JSON.parse(await readFile(join(release, "wrangler.json")));
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.main, "server/index.js");
  assert.equal(config.vars.WYBP_NETLIFY_SITE_URL, hosting.origin);
  assert.equal(config.vars.WYBP_NETLIFY_PROXY_SECRET, undefined);
  assert.equal(await readFile(join(release, "netlify.toml"), "utf8"), netlifyConfiguration(syntheticConfiguration));
  assert.ok(netlifyConfiguration(syntheticConfiguration).indexOf('status = 301') < netlifyConfiguration(syntheticConfiguration).indexOf('status = 200'));
  await assert.rejects(() => verifyRelease(release, true), /Deployment blocked/);
  await writeFile(join(release, "server/index.js"), "wrong server release");
  await assert.rejects(() => verifyRelease(release), /pairing mismatch/);
  // Rollback validates a preserved pair rather than rebuilding or touching the database.
  await writeFile(join(release, "server/index.js"), "server-only");
  assert.equal((await verifyRelease(release)).releaseId, manifest.releaseId);
  await writeFile(join(release, "client/unexpected.sql"), "sensitive");
  await assert.rejects(() => verifyRelease(release), /Unrecorded/);
});

test("deployed client reconciliation accepts API case folding but rejects missing, altered and ambiguous files", async () => {
  const root = await mkdtemp(join(tmpdir(), "wybp-client-digest-"));
  await mkdir(join(root, "dist/client"), { recursive: true });
  await mkdir(join(root, "dist/server"), { recursive: true });
  const bytes = "verified browser content";
  await writeFile(join(root, "dist/client/App-AbC.js"), bytes);
  await writeFile(join(root, "dist/server/index.js"), "server");
  await writeFile(join(root, "dist/server/wrangler.json"), JSON.stringify({ compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"] }));
  const release = await packageRelease(root, syntheticConfiguration);
  const files = [{ path: "/app-abc.js", size: Buffer.byteLength(bytes), sha: createHash("sha1").update(bytes).digest("hex") }];
  assert.equal((await verifyNetlifyClient(release, files)).clientFiles, 1);
  await assert.rejects(() => verifyNetlifyClient(release, []), /Missing/);
  await assert.rejects(() => verifyNetlifyClient(release, [{ ...files[0], sha: "0".repeat(40) }]), /digest mismatch/);
  await assert.rejects(() => verifyNetlifyClient(release, [{ ...files[0], size: 1 }]), /size mismatch/);
  await assert.rejects(() => verifyNetlifyClient(release, [...files, { ...files[0], path: "/App-AbC.js" }]), /Duplicate/);
  await assert.rejects(() => verifyNetlifyClient(release, [...files, { ...files[0], path: "/unexpected.js" }]), /Unexpected/);
});
