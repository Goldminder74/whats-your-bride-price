import assert from "node:assert/strict";
import test from "node:test";

const codes = Object.freeze({
  valid: "1".repeat(48),
  expired: "2".repeat(48),
  revoked: "3".repeat(48),
  removed: "4".repeat(48),
  temporary: "5".repeat(48),
  unicode: "6".repeat(48),
});

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("challenge-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
const environment = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const context = { waitUntil() {}, passThroughOnException() {} };

async function request(path, init = {}) {
  return worker.fetch(new Request(`http://localhost${path}`, init), environment, context);
}

async function htmlFor(code, headers = {}) {
  const response = await request(`/challenge/${code}`, {
    headers: { accept: "text/html", ...headers },
  });
  assert.equal(response.status, 200);
  return response.text();
}

function initialBody(html) {
  return html.slice(html.indexOf("<body>"), html.indexOf("<script", html.indexOf("<body>")));
}

test("raw initial HTML contains only the active challenge safe projection and generic metadata", async () => {
  const html = await htmlFor(codes.valid);
  const body = initialBody(html);
  assert.match(body, /<strong>Nia<\/strong> has challenged you/i);
  assert.match(body, /West Africa(?:<!-- -->)? Edition/i);
  assert.match(body, /Score to beat: <strong>10(?:<!-- -->)?\/(?:<!-- -->)?12<\/strong>/i);
  assert.match(body, /Can you protect the family reputation\?/i);
  assert.match(body, /A playful culture score, never a measure of human worth\./i);
  assert.match(body, /src="\/avatars\/adjoa-v2\.webp"/i);
  assert.match(body, /src="\/regions\/west-africa\.webp"/i);
  assert.match(body, /data-challenge-active/i);
  assert.match(body, />Accept challenge</i);
  const head = html.slice(0, html.indexOf("</head>"));
  assert.match(head, /A Culture Challenge Awaits/i);
  assert.doesNotMatch(head, /Nia|10\/12|West Africa/i);
  assert.doesNotMatch(body, /result_synthetic|attempt_synthetic|anonymous_subject|idempotency|revocation|private.?photo|data:image|session.?id/i);
});

test("expired, revoked, missing, removed and malformed routes are indistinguishable neutral states", async () => {
  const samples = [
    await htmlFor(codes.expired),
    await htmlFor(codes.revoked),
    await htmlFor("9".repeat(48)),
    await htmlFor(codes.removed),
    await htmlFor("not-a-valid-code"),
    await htmlFor("%2e%2e%2fprivate"),
  ];
  for (const html of samples) {
    const body = initialBody(html);
    assert.match(body, /This challenge is no longer available\./i);
    assert.match(body, /Choose a normal regional quiz/i);
    assert.doesNotMatch(body, /Mirembe|Amara|Safiya|Score to beat|inviter_result|revoked/i);
  }
});

test("temporary failure is retryable and never exposes infrastructure details", async () => {
  const body = initialBody(await htmlFor(codes.temporary));
  assert.match(body, /We could not load this challenge right now\./i);
  assert.match(body, /Retry challenge/i);
  assert.match(body, /Choose a normal regional quiz/i);
  assert.doesNotMatch(body, /D1|SQL|database|stack|storage temporarily unavailable|Thandi|11\/12/i);
});

test("Unicode names are escaped and script-shaped projection content never enters raw HTML", async () => {
  const body = initialBody(await htmlFor(codes.unicode));
  assert.match(body, /<strong>Ọlá<\/strong> has challenged you/i);
  assert.doesNotMatch(body, /javascript:|onerror=|<strong><script/i);
});

test("GET, crawler, prefetch, HEAD and metadata-like requests cannot invoke the POST-only acceptance handler", async () => {
  for (const headers of [
    { "user-agent": "facebookexternalhit/1.1" },
    { "user-agent": "WhatsApp/2.0" },
    { purpose: "prefetch", "sec-purpose": "prefetch" },
  ]) {
    const response = await request(`/challenge/${codes.valid}`, { headers: { accept: "text/html", ...headers } });
    assert.equal(response.status, 200);
  }
  assert.equal((await request(`/challenge/${codes.valid}`, { method: "HEAD" })).status, 200);
  assert.equal((await request(`/challenge/${codes.valid}/accept`, { method: "GET" })).status, 405);
});

test("same-origin POST accepts once, reuses safely and rejects tampering without private fields", async () => {
  const body = JSON.stringify({
    idempotencyKey: "rendered-acceptance-key-0001",
    anonymousSubjectHash: "a".repeat(64),
  });
  const post = (payload = body) => request(`/challenge/${codes.valid}/accept`, {
    method: "POST",
    headers: {
      origin: "http://localhost",
      "sec-fetch-site": "same-origin",
      "content-type": "application/json",
    },
    body: payload,
  });
  const first = await post();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    challengeCode: codes.valid,
    edition: "west",
    editionLabel: "West Africa",
    accepted: true,
    reused: false,
  });
  const repeated = await post();
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).reused, true);

  const tampered = await post(JSON.stringify({
    idempotencyKey: "rendered-acceptance-key-0001",
    anonymousSubjectHash: "b".repeat(64),
  }));
  assert.equal(tampered.status, 503);
  const safeError = JSON.stringify(await tampered.json());
  assert.doesNotMatch(safeError, /subject|idempotency|hash|attempt|internal|D1|SQL/i);

  const crossOrigin = await request(`/challenge/${codes.valid}/accept`, {
    method: "POST",
    headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body,
  });
  assert.equal(crossOrigin.status, 403);
});
