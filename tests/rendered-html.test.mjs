import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
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
  assert.match(html, /<link[^>]+rel="icon"[^>]+href="\/favicon\.ico"[^>]+sizes="16x16 32x32 48x48"[^>]+type="image\/x-icon"/i);
  assert.match(html, /<link[^>]+rel="icon"[^>]+href="\/favicon\.svg"[^>]+sizes="any"[^>]+type="image\/svg\+xml"/i);
  assert.match(html, /<link[^>]+rel="icon"[^>]+href="\/icon-192\.png"[^>]+sizes="192x192"[^>]+type="image\/png"/i);
  assert.match(html, /<link[^>]+rel="apple-touch-icon"[^>]+href="\/apple-touch-icon\.png"[^>]+sizes="180x180"[^>]+type="image\/png"/i);
  assert.match(html, /<link[^>]+rel="shortcut icon"[^>]+href="\/favicon\.ico"/i);
  assert.doesNotMatch(html, /\[object Object\]/i);
  assert.doesNotMatch(html, /favicon-cowrie-|favicon[^"']*chatgpt|favicon[^"']*ayo43077/i);
  assert.match(
    html,
    /<link[^>]+rel="canonical"[^>]+href="https:\/\/brideprice\.classesforculture\.com\/?"/i,
  );
  assert.match(
    html,
    /<meta[^>]+property="og:url"[^>]+content="https:\/\/brideprice\.classesforculture\.com\/?"/i,
  );
  assert.match(html, /https:\/\/brideprice\.classesforculture\.com\/og-v2\.png/i);
  assert.doesNotMatch(html, /whats-your-bride-price\.ayo43077\.chatgpt\.site/i);
  assert.match(html, /YOUR ROOTS/i);
  assert.match(html, /AVATAR LAB/i);
  assert.match(html, /IMAGE ROUNDS/i);
  assert.match(html, /knowledge quest/i);
  assert.match(html, /DO YOU KNOW YOUR ROOTS/i);
  assert.match(html, /THE MORE YOU SCORE THE HIGHER YOUR BRIDE PRICE/i);
  assert.match(html, /CHOOSE YOUR[\s\S]*AFRICAN[\s\S]*REGION/i);
  assert.match(html, /Enter Region/i);
  assert.match(html, /Every edition is its own world/i);
  assert.doesNotMatch(html, /cinematic/i);
  assert.doesNotMatch(html, /\u2014/);
  assert.match(html, /West Africa/);
  assert.match(html, /Southern Africa/);
  assert.match(html, /This game celebrates culture/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
  assert.doesNotMatch(html, /data-fast-entry-shell|data-entry-diagnostics/i);
});

test("default production client output excludes review diagnostics", async () => {
  const clientRoot = new URL("../dist/client/", import.meta.url);
  const entries = await readdir(clientRoot, { recursive: true, withFileTypes: true });
  const scripts = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".js"));
  const sources = await Promise.all(scripts.map((entry) => readFile(resolve(entry.parentPath, entry.name), "utf8")));
  assert.doesNotMatch(sources.join("\n"), /Entry diagnostics|data-entry-diagnostics/);
  assert.doesNotMatch(sources.join("\n"), /Ayo scored|ReviewWest_2026/);
});

test("ships sixty educational questions, varied play modes, privacy copy and broad sources", async () => {
  const source = await readFile(new URL("../app/BridePriceGame.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../app/gameData.ts", import.meta.url), "utf8");
  assert.equal((data.match(/^\s{6}q\(/gm) ?? []).length, 60);
  for (const key of ["west", "east", "central", "north", "south"]) {
    assert.match(data, new RegExp(`\\b${key}: \\{`));
  }
  assert.match(source, /Private\. Never leaves your device\./);
  assert.match(source, /A playful culture score, never a measure of human worth\./);
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
  assert.match(source, /Enter Region/);
  assert.doesNotMatch(source, /Enter(?: this)? world/i);
  assert.doesNotMatch(source, /wildly addictive|JOY WITH|cinematic/i);
  assert.doesNotMatch(`${source}${data}`, /\u2014/);
  assert.match(source, /createPublicAppUrl/);
  assert.match(source, /edition:\s*regionKey/);
  assert.match(source, /nominated:\s*"1"/);
  const recovery = await readFile(new URL("../app/quizRecovery.ts", import.meta.url), "utf8");
  assert.match(recovery, /wybp-active-quiz-v1/);
  assert.doesNotMatch(recovery, /playerName|photoUrl|uploadedPhoto|filename/);
});
