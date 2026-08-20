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
  assert.match(html, /West Africa/);
  assert.match(html, /Southern Africa/);
  assert.match(html, /This game celebrates culture/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("ships all five editions, sixty questions, privacy copy and source links", async () => {
  const source = await readFile(new URL("../app/BridePriceGame.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/^\s{6}q\(/gm) ?? []).length, 60);
  for (const key of ["west", "east", "central", "north", "south"]) {
    assert.match(source, new RegExp(`\\b${key}: \\{`));
  }
  assert.match(source, /Private\. Never leaves your device\./);
  assert.match(source, /avatarChoices/);
  assert.match(source, /imageRounds/);
  assert.match(source, /Motherland passport/);
  assert.match(source, /gada-system-an-indigenous-democratic/);
  assert.match(source, /barkcloth-making-in-uganda/);
  assert.match(source, /moutya-01690/);
  assert.match(source, /whc\.unesco\.org\/en\/list\/119/);
  assert.match(source, /\?edition=\$\{regionKey\}/);
});
