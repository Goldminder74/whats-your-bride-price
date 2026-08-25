import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run the Prompt 15 suite through npm so the package-manager CLI can be resolved.");
const artifactRoot = mkdtempSync(join(tmpdir(), "wybp-prompt15-"));
const reviewEnvironment = {
  ...process.env,
  PUBLIC_APP_ORIGIN: "http://127.0.0.1:3100",
  WYBP_FEATURE_FAST_ENTRY: "true",
  WYBP_FEATURE_CHALLENGES: "true",
  WYBP_FEATURE_STORY_VIDEO: "true",
  WYBP_REVIEW_BUILD: "true",
  WYBP_REVIEW_CHALLENGE_FIXTURES: "true",
  WYBP_PLAYWRIGHT_OUTPUT_DIR: join(artifactRoot, "results"),
  WYBP_PLAYWRIGHT_REPORT_DIR: join(artifactRoot, "report"),
  WYBP_STORY_VISUAL_DIR: join(artifactRoot, "visual-review"),
};

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, { cwd: projectRoot, env: environment, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ["--experimental-strip-types", "--test", "tests/unit/storyVideo.test.mjs"]);
run(process.execPath, [npmCli, "run", "build"], reviewEnvironment);
run(process.execPath, ["--test", "tests/story-video-rendered-html.test.mjs"], reviewEnvironment);
run(process.execPath, [resolve(projectRoot, "node_modules", "@playwright", "test", "cli.js"), "test", "tests/e2e/story-video.spec.ts"], reviewEnvironment);
console.log(`Prompt 15 temporary review artefacts: ${artifactRoot}`);
