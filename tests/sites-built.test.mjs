import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium, webkit } from "@playwright/test";
import { exerciseCompiledNavigation, exerciseCompiledImageAnswer } from "./compiled-navigation.mjs";
import { exerciseRegionalProgression } from "./compiled-regional-progression.mjs";
import { exerciseMobileLayout } from "./compiled-mobile.mjs";

// One freshly compiled Sites client/server pair, on an OS-assigned local port.
const server = spawn(process.execPath, ["tests/preview-server.mjs"], {
  env: { ...process.env, WYBP_PREVIEW_PORT: "0", WYBP_PREVIEW_IMAGE_AUDIT: "true" }, stdio: ["ignore", "pipe", "pipe"],
});
const wire = [];
let wireOutput = "";
server.stdout.on("data", data => {
  wireOutput += data;
  const lines = wireOutput.split(/\r?\n/);
  wireOutput = lines.pop();
  for (const line of lines) if (line.startsWith("Image answer wire: ")) wire.push(JSON.parse(line.slice(19)));
});
let browser;
try {
  const origin = await new Promise((resolve, reject) => {
    let output = "";
    server.stdout.on("data", data => {
      output += data;
      const match = output.match(/Review preview ready at (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    });
    server.stderr.on("data", data => { output += data; });
    server.once("error", reject);
    server.once("exit", code => reject(new Error(`Preview exited ${code}: ${output}`)));
  });
  const safari = process.env.WYBP_TEST_BROWSER === "webkit";
  browser = safari ? await webkit.launch({ headless: true,
    proxy: { server: "http://127.0.0.1:9", bypass: "127.0.0.1,localhost" } })
    : await chromium.launch({ headless: true, channel: process.platform === "win32" ? "msedge" : undefined });
  const context = await browser.newContext({ reducedMotion: "reduce", serviceWorkers: "block", hasTouch: true, deviceScaleFactor: 2 });
  // Let image-answer POSTs reach the local server through the browser's real
  // network stack. Interception can hide Origin / Fetch Metadata differences.
  if (!safari) await context.route(url => url.pathname !== "/questions/image-answer", route => {
    assert.equal(new URL(route.request().url()).origin, origin, "No hosted service may be contacted");
    return route.continue();
  });
  const requestOrigins = new Set();
  context.on("request", request => requestOrigins.add(new URL(request.url()).origin));
  const page = await context.newPage();
  await exerciseCompiledNavigation(page, origin);
  await exerciseCompiledImageAnswer(page, origin, safari);
  // The detailed layout harness uses Chromium's CDP manifest API. WebKit adds
  // real-network gameplay/navigation coverage; it does not replace that gate.
  if (!safari) await exerciseMobileLayout(page, origin);
  await exerciseRegionalProgression(page, origin);
  const accepted = wire.filter(item => item.status === 200);
  assert.ok(accepted.length >= 21, "Every image question and the cookie probe reached the real server");
  for (const item of accepted) assert.deepEqual(item, { origin, mode: "cors", site: "same-origin", status: 200 });
  if (safari) assert.ok(wire.some(item => item.origin === "null" && item.status === 403), "Old WebKit transport reproduced and rejected on the wire");
  assert.deepEqual([...requestOrigins], [origin], "No hosted service is contacted; WebKit external requests also use a closed local proxy");
  console.log(`PASS native ${safari ? "WebKit" : "Chromium"} image transport: ${accepted.length} real accepted requests with exact Origin and Fetch Metadata.`);
  await context.close();
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
}
