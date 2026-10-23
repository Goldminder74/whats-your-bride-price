import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this suite through npm so the package-manager CLI can be resolved.");
const focused = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "tests/unit/cowrieWallet.test.mjs", "tests/unit/featureFlags.test.mjs", "tests/unit/randomQuickPlay.test.mjs", "tests/unit/imageQuestionPresentation.test.mjs", "tests/data/cowrie-wallet-migration.test.mjs", "tests/data/cowrie-wallet-repository.test.mjs"], { cwd: projectRoot, env: process.env, stdio: "inherit" });
if (focused.status !== 0) process.exit(focused.status ?? 1);
const env = { ...process.env, WYBP_FEATURE_RANDOM_QUICK_PLAY: "true", WYBP_FEATURE_COWRIE_ECONOMY: "true", WYBP_REVIEW_BUILD: "true", WYBP_REVIEW_RANDOM_QUICK_PLAY_FIXTURES: "true", WYBP_REVIEW_COWRIE_FIXTURES: "true" };
const build = spawnSync(process.execPath, [npmCli, "run", "build"], { cwd: projectRoot, env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const security = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "tests/cowrie-security.test.mjs"], { cwd: projectRoot, env, stdio: "inherit" });
if (security.status !== 0) process.exit(security.status ?? 1);
const playwright = spawnSync(process.execPath, [resolve(projectRoot, "node_modules", "@playwright", "test", "cli.js"), "test", "tests/e2e/cowrie-wallet.spec.ts"], { cwd: projectRoot, env, stdio: "inherit" });
process.exit(playwright.status ?? 1);
