import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const env = {
  ...process.env,
  WYBP_FEATURE_CHALLENGES: "true",
  WYBP_FEATURE_COMMERCE: "true",
  WYBP_FEATURE_DYNAMIC_RESULTS: "true",
  WYBP_FEATURE_FAST_ENTRY: "true",
  WYBP_FEATURE_FIRST_PARTY_ANALYTICS: "false",
  WYBP_FEATURE_OWNER_DASHBOARD: "false",
  WYBP_FEATURE_STORY_VIDEO: "true",
  WYBP_REVIEW_FIXTURES: "off",
};

await new Promise((resolve, reject) => {
  const child = spawn("npm", ["run", "build"], { stdio: "inherit", env });
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`vinext build exited ${code}`))));
});

const outdir = new URL("../outputs/paid-assets/", import.meta.url);
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp(new URL("../dist/client/", import.meta.url), outdir, { recursive: true });

const worker = (await import(new URL("../dist/server/index.js", import.meta.url).href)).default;
const response = await worker.fetch(
  new Request("http://127.0.0.1/"),
  { ASSETS: { fetch: async () => new Response("missing", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);
const html = await response.text();
if (!html.includes("DO YOU KNOW YOUR ROOTS?")) throw new Error("game shell is missing the original hero");
if (html.includes("chatgpt.site")) throw new Error("game shell still names chatgpt.site");
await writeFile(new URL("index.html", outdir), html);
