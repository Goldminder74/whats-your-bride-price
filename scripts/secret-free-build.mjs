import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function assertSecretFreeBuild(root, env) {
  for (const [key,value] of Object.entries(env)) if (value && ((/SECRET|TOKEN|PASSWORD|PRIVATE_KEY/.test(key)
    && /^(WYBP_|STRIPE_|CLOUDFLARE_|NETLIFY_)/.test(key))||/^WYBP_.*_KEY_BASE64$/.test(key)||['WYBP_RECOVERY_KEY_CHECK_BASE64','WYBP_BENCHMARK_ACCESS','WYBP_PUBLIC_SELLER_DETAILS_JSON'].includes(key))) throw new Error(`Remove runtime credentials from build process: ${key}`);
  for (const name of await readdir(root)) if (/^\.env(?:\.|$)/.test(name)) {
    const body = await readFile(resolve(root,name),"utf8");
    if (/whsec_|sk_(?:test|live)_|BEGIN PRIVATE KEY|(?:WYBP_NETLIFY_PROXY_SECRET|CLOUDFLARE_API_TOKEN|NETLIFY_AUTH_TOKEN|STRIPE_WEBHOOK_SIGNING_SECRET)\s*=\s*\S/.test(body)) {
      throw new Error(`Runtime credential in an environment file: ${name}`);
    }
  }
}
