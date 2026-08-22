import { sites } from "@openai/sites-vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import {
  assertSitesCompatibleFeatureFlags,
  resolveFeatureFlags,
} from "./app/featureFlags";
import {
  resolvePublicAppOrigin,
  type PublicAppEnvironment,
} from "./app/publicAppOrigin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ mode }) => {
  const featureFlags = resolveFeatureFlags(process.env);
  assertSitesCompatibleFeatureFlags(featureFlags);
  const diagnosticsRequested = process.env.WYBP_REVIEW_DIAGNOSTICS === "true";
  const diagnosticsApproved = process.env.WYBP_REVIEW_BUILD === "true";
  if (mode === "production" && diagnosticsRequested && !diagnosticsApproved) {
    throw new Error(
      "Review diagnostics require explicit approval. Set WYBP_REVIEW_BUILD=true with WYBP_REVIEW_DIAGNOSTICS=true for a local review build. Production builds exclude the panel by default.",
    );
  }
  const reviewDiagnostics = mode !== "production" || (diagnosticsRequested && diagnosticsApproved);
  const publicAppEnvironment: PublicAppEnvironment =
    mode === "production" ? "production" : mode === "test" ? "test" : "development";
  const publicAppOrigin = resolvePublicAppOrigin(
    process.env.PUBLIC_APP_ORIGIN,
    publicAppEnvironment,
  );

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: {
      __WYBP_FEATURE_FLAGS__: JSON.stringify(featureFlags),
      __WYBP_PUBLIC_APP_ORIGIN__: JSON.stringify(publicAppOrigin),
      __WYBP_RUNTIME_ENV__: JSON.stringify(publicAppEnvironment),
      __WYBP_REVIEW_DIAGNOSTICS__: JSON.stringify(reviewDiagnostics),
    },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
