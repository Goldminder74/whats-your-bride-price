import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { packageRelease, syntheticConfiguration } from "../scripts/netlify-release.mjs";
import { verifyWorkerPackage } from "../scripts/verify-worker-package.mjs";

test("Wrangler uploads unchanged static and dynamic server modules; original configuration omits them", async () => {
  const root = await mkdtemp(join(tmpdir(), "wybp-package-regression-"));
  await mkdir(join(root, "dist/server/_next/static"), { recursive: true });
  await mkdir(join(root, "dist/client"), { recursive: true });
  const files = {
    "client/app.js": "console.log('client');",
    "server/index.js": "import { value } from './_next/static/shared.js'; export default {async fetch(){const {extra}=await import('./_next/static/lazy.js');return new Response(value+extra)}};",
    "server/_next/static/shared.js": "export const value='server-only';",
    "server/_next/static/lazy.js": "export const extra='dynamic';",
    "server/wrangler.json": JSON.stringify({ compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"] }),
  };
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(root, "dist", name), bytes);
  const release = await packageRelease(root, syntheticConfiguration);
  assert.equal((await verifyWorkerPackage(release)).serverModules, 3);

  // A valid manifest for the original config still passed the old release verifier.
  // Require failure from the actual Wrangler upload, not from manifest tampering.
  const config = JSON.parse(await readFile(join(release, "wrangler.json"), "utf8"));
  delete config.rules;
  const bytes = JSON.stringify(config, null, 2) + "\n";
  await writeFile(join(release, "wrangler.json"), bytes);
  const manifest = JSON.parse(await readFile(join(release, "release.json"), "utf8"));
  const hash = value => createHash("sha256").update(value).digest("hex");
  manifest.files["wrangler.json"] = hash(bytes);
  manifest.releaseId = hash(JSON.stringify({ config: manifest.configuration, hashes: manifest.files }));
  await writeFile(join(release, "release.json"), JSON.stringify(manifest));
  await assert.rejects(() => verifyWorkerPackage(release), /Worker upload missing module: server\/_next\/static\//);
});
