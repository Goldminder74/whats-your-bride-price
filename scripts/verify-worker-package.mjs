import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { verifyRelease } from "./netlify-release.mjs";

const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

/** Inspect Wrangler's real upload output, not just the pre-upload release tree. */
export async function verifyWorkerPackage(directory) {
  const root = resolve(directory);
  const manifest = await verifyRelease(root);
  const out = await mkdtemp(join(tmpdir(), "wybp-worker-upload-"));
  if (!resolve(out).startsWith(resolve(tmpdir()) + sep)) throw Error("Unsafe temporary output path");
  try {
    const env = { ...process.env, WRANGLER_WRITE_LOGS: "false", WRANGLER_SEND_METRICS: "false" };
    delete env.WYBP_NETLIFY_PROXY_SECRET;
    const result = spawnSync(process.execPath, [wrangler, "deploy", "--dry-run", "--config", join(root, "wrangler.json"), "--outdir", out], {
      cwd: root, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    });
    if (result.status !== 0) throw Error(`Worker package dry run failed: ${result.stderr || result.stdout}`);
    const expected = Object.entries(manifest.files).filter(([name]) => name.startsWith("server/"));
    for (const [name, hash] of expected) {
      let bytes;
      try { bytes = await readFile(join(out, name.slice("server/".length))); }
      catch { throw Error(`Worker upload missing module: ${name}`); }
      if (sha256(bytes) !== hash) throw Error(`Worker upload changed module: ${name}`);
    }
    async function modules(dir, prefix = "") {
      const names = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const name = prefix + entry.name;
        if (entry.isDirectory()) names.push(...await modules(join(dir, entry.name), name + "/"));
        else if (name.endsWith(".js")) names.push(name);
      }
      return names;
    }
    const actual = await modules(out);
    if (actual.length !== expected.length) throw Error("Unexpected JavaScript in Worker upload");
    return { releaseId: manifest.releaseId, serverModules: expected.length };
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw Error("Usage: verify-worker-package.mjs <release-directory>");
  console.log(JSON.stringify(await verifyWorkerPackage(process.argv[2])));
}
