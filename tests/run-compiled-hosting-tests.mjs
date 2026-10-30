import { spawnSync } from "node:child_process";

// Each browser harness consumes the client and server from its immediately
// preceding build. Never run these builds concurrently against shared dist/.
// Enabled features/fixtures and inherited hosting targets are errors, not masked.
for (const [key, value] of Object.entries(process.env)) {
  if ((key.startsWith("WYBP_FEATURE_") || key.startsWith("WYBP_REVIEW_")) && value && value !== "false") {
    throw new Error(`Compiled hosting requires disabled flags/fixtures: ${key}`);
  }
}
for (const key of ["WYBP_DEPLOY_TARGET", "WYBP_HOSTING_ENVIRONMENT", "PUBLIC_APP_ORIGIN", "WYBP_STAGING_APP_ORIGIN"]) {
  if (process.env[key]) throw new Error(`Clear ${key} before running both ordinary compiled targets`);
}
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(["--test", "tests/worker-package.test.mjs"]);
run(["node_modules/vinext/dist/cli.js", "build"]);
if (process.argv.includes("--webkit")) {
  process.env.WYBP_TEST_BROWSER = "webkit";
  run(["tests/sites-built.test.mjs"]);
  process.exit(0);
}
run(["tests/sites-built.test.mjs"]);
run(["scripts/build-netlify-worker.mjs", "--synthetic"]);
run(["tests/hosting-built.test.mjs"]);
