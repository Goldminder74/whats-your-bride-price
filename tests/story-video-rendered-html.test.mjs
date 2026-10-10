import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const dist = resolve(import.meta.dirname, "../dist");
async function sourceTree(directory) {
  let source = "";
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) source += await sourceTree(path);
    else if (/\.(?:js|css|html)$/.test(entry.name)) source += await readFile(path, "utf8");
  }
  return source;
}

test("authorised build contains the feature-gated local Story video experience", async () => {
  const output = await sourceTree(dist);
  assert.match(output, /Create Story video/);
  assert.match(output, /Generate five-second video/);
  assert.match(output, /story_video_render_complete/);
  assert.match(output, /A playful culture score, never a measure of human worth\./);
  assert.match(output, /story_east/); assert.match(output, /story_north/);
  assert.doesNotMatch(output, /getUserMedia|ContactPicker|sendBeacon|serviceWorker\.register/i);
});
