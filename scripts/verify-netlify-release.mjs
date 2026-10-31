import { verifyRelease } from "./netlify-release.mjs";
const [directory, option] = process.argv.slice(2);
if (!directory || (option && option !== "--deployable")) throw Error("Usage: verify-netlify-release.mjs <release-directory> [--deployable]");
const manifest = await verifyRelease(directory, option === "--deployable");
console.log(`Verified paired release ${manifest.releaseId}; no resources changed.`);
