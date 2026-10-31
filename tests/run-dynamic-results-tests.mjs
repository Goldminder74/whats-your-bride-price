import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, ".."); const npmCli = process.env.npm_execpath; if (!npmCli) throw new Error("Run the Prompt 14 suite through npm.");
const artifactRoot = mkdtempSync(join(tmpdir(), "wybp-prompt14-"));
const reviewEnvironment = { ...process.env, PUBLIC_APP_ORIGIN: "http://127.0.0.1:3100", WYBP_FEATURE_FAST_ENTRY: "true", WYBP_FEATURE_CHALLENGES: "true", WYBP_FEATURE_DYNAMIC_RESULTS: "true", WYBP_REVIEW_BUILD: "true", WYBP_REVIEW_CHALLENGE_FIXTURES: "true", WYBP_REVIEW_RESULT_FIXTURES: "true", WYBP_PLAYWRIGHT_OUTPUT_DIR: join(artifactRoot, "results"), WYBP_PLAYWRIGHT_REPORT_DIR: join(artifactRoot, "report") };
function run(command, args, environment = process.env) { const result = spawnSync(command, args, { cwd: projectRoot, env: environment, stdio: "inherit" }); if (result.status !== 0) process.exit(result.status ?? 1); }
run(process.execPath, ["--experimental-strip-types", "--test", "tests/data/result-visibility-migration.test.mjs", "tests/data/result-publication-repository.test.mjs", "tests/unit/resultPublication.test.mjs", "tests/unit/resultPreview.test.mjs", "tests/unit/resultService.test.mjs", "tests/unit/resultMedia.test.mjs", "tests/unit/resultLanding.test.mjs", "tests/unit/shareCentre.test.mjs", "tests/unit/featureFlags.test.mjs"]);
run(process.execPath, [npmCli, "run", "build"], reviewEnvironment);
run(process.execPath, ["--test", "tests/result-rendered-html.test.mjs"], reviewEnvironment);
run(process.execPath, [resolve(projectRoot, "node_modules", "@playwright", "test", "cli.js"), "test", "tests/e2e/dynamic-results.spec.ts", "--reporter=list"], reviewEnvironment);
console.log(`Prompt 14 temporary browser artefacts: ${artifactRoot}`);
