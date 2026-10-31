import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this suite through npm so the package-manager CLI can be resolved.");
const env = { ...process.env, WYBP_FEATURE_FAST_ENTRY: "true", WYBP_FEATURE_RANDOM_QUICK_PLAY: "true", WYBP_REVIEW_BUILD: "true", WYBP_REVIEW_RANDOM_QUICK_PLAY_FIXTURES: "true" };
const build = spawnSync(process.execPath, [npmCli, "run", "build"], { cwd: projectRoot, env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const playwright = spawnSync(process.execPath, [resolve(projectRoot, "node_modules", "@playwright", "test", "cli.js"), "test", "tests/e2e/random-quick-play.spec.ts"], { cwd: projectRoot, env, stdio: "inherit" });
process.exit(playwright.status ?? 1);
