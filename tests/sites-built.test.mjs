import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "@playwright/test";
import { exerciseCompiledNavigation, exerciseCompiledImageAnswer } from "./compiled-navigation.mjs";
import { exerciseRegionalProgression } from "./compiled-regional-progression.mjs";

// One freshly compiled Sites client/server pair, on an OS-assigned local port.
const server = spawn(process.execPath, ["tests/preview-server.mjs"], {
  env: { ...process.env, WYBP_PREVIEW_PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
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
  browser = await chromium.launch({ headless: true, channel: process.platform === "win32" ? "msedge" : undefined });
  const context = await browser.newContext({ reducedMotion: "reduce", serviceWorkers: "block" });
  await context.route("**/*", route => {
    assert.equal(new URL(route.request().url()).origin, origin, "No hosted service may be contacted");
    return route.continue();
  });
  const page = await context.newPage();
  await exerciseCompiledNavigation(page, origin);
  await exerciseCompiledImageAnswer(page, origin);
  await exerciseRegionalProgression(page, origin);
  await context.close();
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
}
