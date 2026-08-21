import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished pan-African game", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>What’s Your Bride Price\?/i);
  assert.match(html, /YOUR ROOTS/i);
  assert.match(html, /AVATAR LAB/i);
  assert.match(html, /IMAGE ROUNDS/i);
  assert.match(html, /knowledge quest/i);
  assert.match(html, /DO YOU KNOW YOUR ROOTS/i);
  assert.match(html, /THE MORE YOU SCORE THE HIGHER YOUR BRIDE PRICE/i);
  assert.match(html, /Every edition is its own world/i);
  assert.doesNotMatch(html, /cinematic/i);
  assert.match(html, /West Africa/);
  assert.match(html, /Southern Africa/);
  assert.match(html, /This game celebrates culture/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("ships sixty educational questions, varied play modes, privacy copy and broad sources", async () => {
  const source = await readFile(new URL("../app/BridePriceGame.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../app/gameData.ts", import.meta.url), "utf8");
  assert.equal((data.match(/^\s{6}q\(/gm) ?? []).length, 60);
  for (const key of ["west", "east", "central", "north", "south"]) {
    assert.match(data, new RegExp(`\\b${key}: \\{`));
  }
  assert.match(source, /Private\. Never leaves your device\./);
  assert.match(source, /avatarChoices/);
  assert.match(data, /"image"/);
  assert.match(data, /"multi"/);
  assert.match(data, /"complete"/);
  assert.match(source, /NOW YOU KNOW/);
  assert.match(source, /Motherland passport/);
  assert.match(data, /General History of Africa/);
  assert.match(data, /British Museum/);
  assert.match(data, /Met Museum/);
  assert.match(source, /THE STAKES ARE HIGH/);
  assert.match(source, /PROVE YOUR HIGH VALUE/);
  assert.match(source, /wybp-region-scores/);
  assert.match(source, /> 8/);
  assert.match(source, /ALL AFRICA.*ACCESS UNLOCKED/s);
  assert.match(source, /Bride Price Royalty/);
  assert.doesNotMatch(source, /wildly addictive|JOY WITH|cinematic/i);
  assert.match(source, /\?edition=\$\{regionKey\}/);
});
