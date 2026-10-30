import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("nomination-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("review result exposes one primary three-person nomination action", async () => {
  if (process.env.WYBP_REVIEW_BUILD !== "true") return;
  const response = await render("/?safeguard_fixture=nomination-result");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Nominate three people/);
  assert.doesNotMatch(html, /Nominate a friend|Message sent|delivery confirmed/i);
  assert.match(html, /A playful culture score, never a measure of human worth\./);
});

test("legacy nominated entry remains neutral and starts the valid edition directly", async () => {
  if (process.env.WYBP_REVIEW_BUILD !== "true") return;
  const response = await render("/?edition=west&nominated=1");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /YOU’VE BEEN NOMINATED/);
  assert.match(html, /nominated for the West Africa Edition/);
  assert.match(html, /no inviter name or score/i);
  assert.match(html, /Start West Africa edition/);
  assert.doesNotMatch(html, /Score to beat|has challenged you/i);
});

test("Prompt 12 source contains no contact, delivery-claim or remote analytics capability", async () => {
  const files = [
    "../app/NominateThreePanel.tsx",
    "../app/nominationExperience.ts",
    "../app/nominationEvents.ts",
  ];
  const source = (await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /ContactsManager|navigator\.contacts|select\s*\(.*contacts|message_sent|share_confirmed|delivery_confirmed/i);
  assert.doesNotMatch(source, /sendBeacon|XMLHttpRequest|analytics SDK|fetch\s*\(/i);
  assert.doesNotMatch(source, /\b(?:privatePhoto|photoBlob|emailAddress|recipientName)\b|telephone\s*:/);
});

test("ordinary output contains no authorised nomination fixture identity, code or outcome", async () => {
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
