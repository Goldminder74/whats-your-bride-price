import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("share-centre-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("authorised result fixture exposes the reusable Share Centre entry point", async () => {
  if (process.env.WYBP_REVIEW_BUILD !== "true") return;
  const response = await render("/?safeguard_fixture=nomination-result");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Open Share Centre/);
  assert.match(html, /Nominate three people/);
  assert.match(html, /A playful culture score, never a measure of human worth\./);
  assert.doesNotMatch(html, /message sent|delivery confirmed|posted successfully/i);
});

test("valid challenge fixture offers Share Centre without acceptance writes", async () => {
  if (process.env.WYBP_REVIEW_BUILD !== "true") return;
  const response = await render(`/challenge/${"7".repeat(48)}`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Open Share Centre/);
  assert.match(html, /Accept challenge/);
  assert.match(html, /A playful culture score, never a measure of human worth\./);
});

test("Share Centre source has no SDK, contact, upload, tracking or dynamic-preview capability", async () => {
  const files = [
    "../app/ShareCentre.tsx",
    "../app/shareProjection.ts",
    "../app/shareCopy.ts",
    "../app/shareMedia.ts",
    "../app/shareCentreEvents.ts",
  ];
  const source = (await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /ContactsManager|navigator\.contacts|sendBeacon|XMLHttpRequest|analytics|facebook sdk|instagram sdk|tiktok sdk/i);
  assert.doesNotMatch(source, /fetch\s*\(|FormData|R2|MEDIA\.put|serviceWorker/i);
  assert.doesNotMatch(source, /message_sent|share_confirmed|delivery_confirmed|posted_successfully/i);
  assert.doesNotMatch(source, /opengraph|og-v2|metadataBase|generateMetadata/i);
});

test("ordinary output excludes authorised review identity and fixture code", async () => {
  if (process.env.WYBP_REVIEW_BUILD === "true") return;
  const roots = [new URL("../dist/client/", import.meta.url), new URL("../dist/server/", import.meta.url)];
  const sources = [];
  for (const root of roots) {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".js")) sources.push(await readFile(resolve(entry.parentPath, entry.name), "utf8"));
    }
  }
  const output = sources.join("\n");
  assert.doesNotMatch(output, /nomination-result|777777777777777777777777777777777777777777777777/);
});
