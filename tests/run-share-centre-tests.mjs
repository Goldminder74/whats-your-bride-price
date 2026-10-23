import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run the Prompt 13 suite through npm so the package-manager CLI can be resolved.");
const artifactRoot = mkdtempSync(join(tmpdir(), "wybp-prompt13-"));
const reviewEnvironment = {
  ...process.env,
  WYBP_FEATURE_FAST_ENTRY: "true",
  WYBP_FEATURE_CHALLENGES: "true",
  WYBP_REVIEW_BUILD: "true",
  WYBP_REVIEW_CHALLENGE_FIXTURES: "true",
  WYBP_PLAYWRIGHT_OUTPUT_DIR: join(artifactRoot, "results"),
  WYBP_PLAYWRIGHT_REPORT_DIR: join(artifactRoot, "report"),
};

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, { cwd: projectRoot, env: environment, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ["--experimental-strip-types", "--test", "tests/unit/shareCentre.test.mjs", "tests/unit/nominationExperience.test.mjs"]);
run(process.execPath, [npmCli, "run", "build"], reviewEnvironment);
run(process.execPath, ["--test", "tests/share-centre-rendered-html.test.mjs"], reviewEnvironment);
run(process.execPath, [resolve(projectRoot, "node_modules", "@playwright", "test", "cli.js"), "test", "tests/e2e/share-centre.spec.ts"], reviewEnvironment);
console.log(`Prompt 13 temporary browser artefacts: ${artifactRoot}`);
