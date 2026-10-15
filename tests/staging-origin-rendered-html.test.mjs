import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const origin = "https://whats-your-bride-price-staging.ayo43077.chatgpt.site";
const productionOrigin = "https://brideprice.classesforculture.com";
const { default: worker } = await import("../dist/server/index.js");
const environment = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const context = { waitUntil() {}, passThroughOnException() {} };
const request = (path, init = {}) => worker.fetch(new Request(origin + path, init), environment, context);
const slug = "b".repeat(48);
const credential = "01".repeat(16);
const publication = (headers = {}, owner = credential, action = "publish") => request(`/result/${slug}/publication`, {
  method: "POST",
  headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
  body: JSON.stringify({ action, anonymousSessionCredential: owner }),
});

test("staging output and generated links remain on the authorised origin", async () => {
  for (const path of ["/", "/?origin=https://attacker.example", `/result/${"8".repeat(48)}`, `/challenge/${"1".repeat(48)}`, "/privacy"]) {
    const response = await request(path, { headers: { accept: "text/html", "x-forwarded-host": "attacker.example" } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(origin));
    for (const match of html.matchAll(/(?:href|content)="(https?:[^"<>]+)"/g)) {
      assert.equal(new URL(match[1]).origin, origin, match[1]);
      assert.ok(!match[1].includes(productionOrigin), match[1]);
    }
  }
});

test("staging publication retains Origin, Fetch Metadata, ownership and rate-limit checks", async () => {
  for (const hostile of ["https://attacker.example", productionOrigin, "null", ""]) {
    assert.equal((await publication({ origin: hostile })).status, 403);
  }
  assert.equal((await publication({ "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await publication({}, "02".repeat(16))).status, 404);
  const accepted = await publication({ "x-forwarded-host": "attacker.example" });
  assert.equal(accepted.status, 200);
  const result = await accepted.json();
  assert.equal(new URL(result.resultUrl).origin, origin);
  assert.equal(new URL(result.previewUrl).origin, origin);
  assert.equal((await publication()).status, 200);
  let rateLimited = false;
  for (let retry = 0; retry < 15; retry += 1) {
    const action = retry % 2 === 0 ? "unpublish" : "publish";
    if ((await publication({}, credential, action)).status === 429) { rateLimited = true; break; }
  }
  assert.equal(rateLimited, true);
});

test("staging output contains no runtime secret names or temporary seed route", async () => {
  const assetDirectory = new URL("../dist/client/_next/static/chunks/", import.meta.url);
  const files = await readdir(assetDirectory);
  const client = (await Promise.all(files.filter((name) => name.endsWith(".js"))
    .map((name) => readFile(new URL(name, assetDirectory), "utf8")))).join("\n");
  assert.doesNotMatch(client, /WYBP_DAILY_SECRET|STRIPE_WEBHOOK_SECRET|staging-seed|seed operation/i);
  assert.equal((await request("/staging-seed", { method: "POST" })).status, 404);
});
