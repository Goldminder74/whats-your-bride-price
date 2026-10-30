import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run the challenge-entry suite through npm so the package-manager CLI can be resolved.");

const reviewEnvironment = {
  ...process.env,
  WYBP_FEATURE_FAST_ENTRY: "true",
  WYBP_FEATURE_CHALLENGES: "true",
  WYBP_REVIEW_BUILD: "true",
  WYBP_REVIEW_CHALLENGE_FIXTURES: "true",
};

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [
  "--experimental-strip-types",
  "--test",
  "tests/unit/challengeLanding.test.mjs",
  "tests/unit/challengeAcceptance.test.mjs",
  "tests/unit/challengeCompletion.test.mjs",
  "tests/unit/challengeEntry.test.mjs",
  "tests/unit/challengeService.test.mjs",
  "tests/unit/anonymousSession.test.mjs",
  "tests/data/challenge-acceptance-repository.test.mjs",
  "tests/data/challenge-comparison-migration.test.mjs",
  "tests/data/challenge-completion-repository.test.mjs",
]);
run(process.execPath, [npmCli, "run", "build"], reviewEnvironment);
run(process.execPath, ["--test", "tests/challenge-rendered-html.test.mjs"], reviewEnvironment);
run(
  process.execPath,
  [resolve(projectRoot, "node_modules", "@playwright", "test", "cli.js"), "test", "tests/e2e/challenge-landing.spec.ts"],
  reviewEnvironment,
);
