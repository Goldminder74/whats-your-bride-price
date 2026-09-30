import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run the Prompt 18 suite through npm so the package-manager CLI can be resolved.");
const artifactRoot = mkdtempSync(join(tmpdir(), "wybp-prompt18-"));
const ordinaryEnvironment = { ...process.env, PUBLIC_APP_ORIGIN: "https://brideprice.classesforculture.com" };
for (const key of ["WYBP_FEATURE_OWNER_DASHBOARD", "WYBP_REVIEW_BUILD", "WYBP_REVIEW_OWNER_DASHBOARD_FIXTURES", "WYBP_OWNER_DASHBOARD_ALLOWED_SUBJECTS", "WYBP_PREVIEW_OWNER_SUBJECT"]) delete ordinaryEnvironment[key];
const reviewEnvironment = {
  ...ordinaryEnvironment,
  PUBLIC_APP_ORIGIN: "http://127.0.0.1:3100",
  WYBP_FEATURE_OWNER_DASHBOARD: "true",
  WYBP_REVIEW_BUILD: "true",
  WYBP_REVIEW_OWNER_DASHBOARD_FIXTURES: "true",
  WYBP_OWNER_DASHBOARD_ALLOWED_SUBJECTS: "review-owner",
  WYBP_PLAYWRIGHT_OUTPUT_DIR: join(artifactRoot, "results"),
  WYBP_PLAYWRIGHT_REPORT_DIR: join(artifactRoot, "report"),
  WYBP_OWNER_DASHBOARD_VISUAL_DIR: join(artifactRoot, "visual-review"),
};

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, { cwd: projectRoot, env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function npm(args, environment) { run(process.execPath, [npmCli, ...args], environment); }

run(process.execPath, ["--experimental-strip-types", "--test", "tests/unit/ownerDashboard.test.mjs", "tests/data/owner-dashboard-report.test.mjs"]);
npm(["run", "build"], ordinaryEnvironment);
run(process.execPath, ["--test", "tests/owner-dashboard-rendered-html.test.mjs"], ordinaryEnvironment);
npm(["run", "build"], reviewEnvironment);
run(process.execPath, ["--test", "tests/owner-dashboard-rendered-html.test.mjs"], reviewEnvironment);
run(process.execPath, [resolve(projectRoot, "node_modules", "@playwright", "test", "cli.js"), "test", "tests/e2e/owner-dashboard.spec.ts"], reviewEnvironment);
console.log(`Prompt 18 temporary review artefacts: ${artifactRoot}`);
