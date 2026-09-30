import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyRelease } from "./netlify-release.mjs";

// Netlify's deployment file-list API reports lowercase paths. Match its keys,
// reject ambiguous names, and compare bytes by digest, never by filename alone.
export async function verifyNetlifyClient(directory, remoteFiles) {
  const manifest = await verifyRelease(directory);
  assert.ok(Array.isArray(remoteFiles), "Expected deployment file metadata");
  const remote = new Map();
  for (const file of remoteFiles) {
    assert.equal(typeof file.path, "string");
    const key = file.path.toLowerCase();
    assert.ok(!remote.has(key), `Duplicate remote path: ${key}`);
    remote.set(key, file);
  }
  const expected = new Set();
  for (const path of Object.keys(manifest.files).filter(path => path.startsWith("client/"))) {
    const key = "/" + path.slice(7).toLowerCase();
    assert.ok(!expected.has(key), `Case collision: ${key}`);
    expected.add(key);
    const file = remote.get(key);
    assert.ok(file, `Missing deployed client file: ${path}`);
    const bytes = await readFile(resolve(directory, path));
    assert.equal(file.sha, createHash("sha1").update(bytes).digest("hex"), `Deployed digest mismatch: ${path}`);
    assert.equal(file.size, bytes.length, `Deployed size mismatch: ${path}`);
  }
  // The CLI adds a deployment configuration record, not a browser asset.
  for (const key of remote.keys()) assert.ok(expected.has(key) || key === "/netlify.toml", `Unexpected deployed file: ${key}`);
  return { releaseId: manifest.releaseId, clientFiles: expected.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, metadata] = process.argv.slice(2);
  if (!directory || !metadata) throw Error("Usage: verify-netlify-client.mjs <release-directory> <deployment-file-list.json>");
  console.log(JSON.stringify(await verifyNetlifyClient(directory, JSON.parse(await readFile(metadata, "utf8")))));
}
