import { createHash } from "node:crypto";
import { readdir, readFile, mkdir, writeFile, copyFile, lstat } from "node:fs/promises";
import { resolve, relative, dirname, extname, sep } from "node:path";
import { validateHostingOrigin } from "../app/hostingOrigin.ts";

export const syntheticConfiguration = Object.freeze({
  synthetic: true, environment: "test", origin: "https://wybp-local-fixture.netlify.app",
  projectId: "00000000-0000-4000-8000-000000000000", context: "production",
  workerOrigin: "https://wybp-local-fixture.example.invalid", workerName: "wybp-local-fixture",
});
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const publicExtensions = new Set([".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff", ".woff2", ".webmanifest"]);

export function releaseConfiguration(env) {
  const config = {
    synthetic: false, environment: env.WYBP_HOSTING_ENVIRONMENT, origin: env.PUBLIC_APP_ORIGIN,
    projectId: env.WYBP_NETLIFY_PROJECT_ID, context: env.WYBP_NETLIFY_CONTEXT,
    workerOrigin: env.WYBP_WORKER_ORIGIN, workerName: env.WYBP_WORKER_NAME,
  };
  validateConfiguration(config);
  return config;
}

export function validateConfiguration(config) {
  validateHostingOrigin(config);
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(config.projectId || "")
    || !["production", "deploy-preview", "branch-deploy"].includes(config.context)
    || !/^wybp-[a-z0-9-]+$/.test(config.workerName || "")) throw Error("Missing or invalid release identity");
  const worker = new URL(config.workerOrigin);
  if (worker.origin !== config.workerOrigin || worker.protocol !== "https:" || worker.port || worker.username || worker.password
    || (!config.synthetic && (!/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(worker.hostname)
      || !worker.hostname.startsWith(config.workerName + ".")))) throw Error("Invalid isolated Worker origin");
  if (!config.synthetic && (config.projectId === syntheticConfiguration.projectId || config.origin.includes("local-fixture"))) {
    throw Error("Synthetic identity cannot be released");
  }
}

async function files(root, prefix = "") {
  const result = [];
  for (const item of await readdir(resolve(root, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isSymbolicLink()) throw Error("Release symlinks are forbidden");
    if (item.isDirectory()) result.push(...await files(root, name));
    else if (item.isFile()) result.push(name);
  }
  return result.sort();
}

export function netlifyConfiguration(config) {
  return `# Generated paired release; use only on the approved isolated private project.\n[build]\npublish = "client"\n\n[[redirects]]\nfrom = "${config.origin.replace("https:", "http:")}/*"\nto = "${config.origin}/:splat"\nstatus = 301\nforce = true\n\n[[redirects]]\nfrom = "/*"\nto = "${config.workerOrigin}/:splat"\nstatus = 200\nforce = false\nsigned = "WYBP_NETLIFY_PROXY_SECRET"\n\n[[headers]]\nfor = "/*"\n[headers.values]\nCache-Control = "private, no-store"\nX-Content-Type-Options = "nosniff"\n`;
}

export async function packageRelease(projectRoot, config) {
  validateConfiguration(config);
  const buildRoot = resolve(projectRoot, "dist");
  const entries = {};
  for (const kind of ["client", "server"]) {
    for (const file of await files(resolve(buildRoot, kind))) {
      if (kind === "client" && (file.split("/").some(part => part.startsWith(".")) || !publicExtensions.has(extname(file)))) continue;
      if (kind === "server" && !file.endsWith(".js")) continue;
      entries[`${kind}/${file}`] = await readFile(resolve(buildRoot, kind, file));
    }
  }
  if (!entries["server/index.js"] || !Object.keys(entries).some(p => p.startsWith("client/") && p.endsWith(".js"))) throw Error("Incomplete paired build");
  // No secret is necessary to build. If a canary or real secret is supplied, reject accidental emission.
  const secret = process.env.WYBP_NETLIFY_PROXY_SECRET;
  for (const bytes of Object.values(entries)) if (secret && bytes.includes(Buffer.from(secret))) throw Error("Secret detected in release output");
  const generatedWorker = JSON.parse(await readFile(resolve(buildRoot, "server/wrangler.json"), "utf8"));
  const worker = {
    name: config.workerName, main: "server/index.js", no_bundle: true,
    // Wrangler's no-bundle collector has no default JavaScript module rule.
    rules: [{ type: "ESModule", globs: ["**/*.js"] }],
    compatibility_date: generatedWorker.compatibility_date, compatibility_flags: generatedWorker.compatibility_flags,
    assets: { directory: "client", binding: "ASSETS", run_worker_first: true },
    images: { binding: "IMAGES" }, observability: { enabled: false },
    vars: { WYBP_NETLIFY_PROJECT_ID: config.projectId, WYBP_NETLIFY_CONTEXT: config.context, WYBP_NETLIFY_SITE_URL: config.origin },
  };
  entries["wrangler.json"] = Buffer.from(JSON.stringify(worker, null, 2) + "\n");
  entries["netlify.toml"] = Buffer.from(netlifyConfiguration(config));
  const hashes = Object.fromEntries(Object.entries(entries).map(([path, bytes]) => [path, digest(bytes)]));
  const releaseId = digest(JSON.stringify({ config, hashes }));
  const root = resolve(projectRoot, "outputs/netlify-worker", releaseId);
  await mkdir(root, { recursive: true });
  for (const [path, bytes] of Object.entries(entries)) {
    const destination = resolve(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  await writeFile(resolve(root, "release.json"), JSON.stringify({ version: 1, releaseId, configuration: config, files: hashes }, null, 2) + "\n");
  await verifyRelease(root);
  // This pointer is local metadata, never part of the published client directory.
  await writeFile(resolve(projectRoot, "outputs/netlify-worker/latest.json"), JSON.stringify({ releaseId, directory: root }, null, 2) + "\n");
  return root;
}

export async function verifyRelease(root, deployable = false, env = process.env) {
  const manifest = JSON.parse(await readFile(resolve(root, "release.json"), "utf8"));
  validateConfiguration(manifest.configuration);
  for (const [path, expected] of Object.entries(manifest.files)) {
    const destination = resolve(root, path);
    if (!destination.startsWith(resolve(root) + sep) || (await lstat(destination)).isSymbolicLink()) throw Error("Unsafe release path");
    if (digest(await readFile(destination)) !== expected) throw Error(`Release pairing mismatch: ${path}`);
    if (path.startsWith("client/") && (!publicExtensions.has(extname(path)) || path.split("/").some(p => p.startsWith(".")))) throw Error("Non-public publish file");
  }
  const actual = await files(root);
  if (actual.some(path => path !== "release.json" && !Object.hasOwn(manifest.files, path))) throw Error("Unrecorded release file");
  if (digest(JSON.stringify({ config: manifest.configuration, hashes: manifest.files })) !== manifest.releaseId) throw Error("Release identity mismatch");
  if (await readFile(resolve(root, "netlify.toml"), "utf8") !== netlifyConfiguration(manifest.configuration)) throw Error("Proxy target mismatch");
  if (deployable) {
    if (manifest.configuration.synthetic || !/^[0-9a-f]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID || "")
      || !env.WYBP_NETLIFY_PROXY_SECRET || Buffer.byteLength(env.WYBP_NETLIFY_PROXY_SECRET) < 32
      || env.WYBP_NETLIFY_PROJECT_ID !== manifest.configuration.projectId
      || env.WYBP_CONFIRMED_PRIVATE_PROJECT !== manifest.configuration.projectId) {
      throw Error("Deployment blocked: synthetic configuration, missing identity/secret, or unconfirmed private access");
    }
  }
  return manifest;
}

// Retained here for tooling consumers: never copy an entire dist tree to Netlify.
export async function copyVerifiedClient(releaseRoot, destination) {
  const manifest = await verifyRelease(releaseRoot);
  const target = resolve(destination);
  await mkdir(target, { recursive: true });
  if ((await readdir(target)).length) throw Error("Publish destination must be empty");
  for (const path of Object.keys(manifest.files).filter(p => p.startsWith("client/"))) {
    const out = resolve(target, relative("client", path));
    await mkdir(dirname(out), { recursive: true });
    await copyFile(resolve(releaseRoot, path), out);
  }
}
