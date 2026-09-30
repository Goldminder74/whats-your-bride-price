import { spawnSync } from "node:child_process";
import { packageRelease, releaseConfiguration, syntheticConfiguration } from "./netlify-release.mjs";
import { verifyWorkerPackage } from "./verify-worker-package.mjs";

const args = process.argv.slice(2);
if (args.some(arg => arg !== "--synthetic")) throw Error("Only --synthetic is supported; this tool never deploys");
const configuration = args.includes("--synthetic") ? syntheticConfiguration : releaseConfiguration(process.env);
const environment = { ...process.env, WYBP_DEPLOY_TARGET: "netlify-worker", WYBP_HOSTING_ENVIRONMENT: configuration.environment, PUBLIC_APP_ORIGIN: configuration.origin };
// Vite rejects enabled features/review overrides rather than silently disabling them.
const result = spawnSync(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], { env: environment, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status || 1);
const root = await packageRelease(process.cwd(), configuration);
const upload = await verifyWorkerPackage(root);
console.log(`Wrangler upload verified: ${upload.serverModules} unchanged server modules.`);
console.log(`Local paired release verified: ${root}`);
console.log(configuration.synthetic ? "SYNTHETIC: not deployable." : "No deployment performed. Private access and runtime secret checks still required.");
