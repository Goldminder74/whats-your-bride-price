import { sites } from "@openai/sites-vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import {
  assertCommerceReadiness,
  assertFirstPartyAnalyticsStorage,
  assertOwnerDashboardReadiness,
  assertSitesCompatibleFeatureFlags,
  assertDynamicResultsStorage,
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
  const diagnosticsRequested = process.env.WYBP_REVIEW_DIAGNOSTICS === "true";
  const diagnosticsApproved = process.env.WYBP_REVIEW_BUILD === "true";
  const challengeFixturesRequested = process.env.WYBP_REVIEW_CHALLENGE_FIXTURES === "true";
  const resultFixturesRequested = process.env.WYBP_REVIEW_RESULT_FIXTURES === "true";
  const analyticsFixturesRequested = process.env.WYBP_REVIEW_ANALYTICS_FIXTURES === "true";
  const commerceFixturesRequested = process.env.WYBP_REVIEW_COMMERCE_FIXTURES === "true";
  const ownerDashboardFixturesRequested = process.env.WYBP_REVIEW_OWNER_DASHBOARD_FIXTURES === "true";
  const privacyFixturesRequested = process.env.WYBP_REVIEW_PRIVACY_FIXTURES === "true";
  if (mode === "production" && diagnosticsRequested && !diagnosticsApproved) {
    throw new Error(
      "Review diagnostics require explicit approval. Set WYBP_REVIEW_BUILD=true with WYBP_REVIEW_DIAGNOSTICS=true for a local review build. Production builds exclude the panel by default.",
    );
  }
  if (mode === "production" && challengeFixturesRequested && !diagnosticsApproved) {
    throw new Error(
      "Challenge fixtures require an explicitly authorised local review build. Set WYBP_REVIEW_BUILD=true with WYBP_REVIEW_CHALLENGE_FIXTURES=true. Ordinary production builds exclude challenge fixtures.",
    );
  }
  if (mode === "production" && resultFixturesRequested && !diagnosticsApproved) {
    throw new Error(
      "Result fixtures require an explicitly authorised local review build. Set WYBP_REVIEW_BUILD=true with WYBP_REVIEW_RESULT_FIXTURES=true. Ordinary production builds exclude result fixtures.",
    );
  }
  if (mode === "production" && analyticsFixturesRequested && !diagnosticsApproved) {
    throw new Error(
      "Analytics fixtures require an explicitly authorised local review build. Set WYBP_REVIEW_BUILD=true with WYBP_REVIEW_ANALYTICS_FIXTURES=true. Ordinary production builds exclude analytics fixtures.",
    );
  }
  if (mode === "production" && commerceFixturesRequested && !diagnosticsApproved) {
    throw new Error("Commerce fixtures require an explicitly authorised local review build. Set WYBP_REVIEW_BUILD=true with WYBP_REVIEW_COMMERCE_FIXTURES=true. Ordinary production builds exclude commerce fixtures.");
  }
  if (mode === "production" && ownerDashboardFixturesRequested && !diagnosticsApproved) {
    throw new Error("Owner-dashboard fixtures require an explicitly authorised local review build. Set WYBP_REVIEW_BUILD=true with WYBP_REVIEW_OWNER_DASHBOARD_FIXTURES=true. Ordinary production builds exclude owner-dashboard fixtures.");
  }
  if (mode === "production" && privacyFixturesRequested && !diagnosticsApproved) {
    throw new Error("Privacy fixtures require an explicitly authorised local review build. Set WYBP_REVIEW_BUILD=true with WYBP_REVIEW_PRIVACY_FIXTURES=true. Ordinary production builds exclude privacy fixtures.");
  }
  const reviewDiagnostics = mode !== "production" || (diagnosticsRequested && diagnosticsApproved);
  const reviewChallengeFixtures = challengeFixturesRequested && diagnosticsApproved;
  const reviewResultFixtures = resultFixturesRequested && diagnosticsApproved;
  const reviewAnalyticsFixtures = analyticsFixturesRequested && diagnosticsApproved;
  const reviewCommerceFixtures = commerceFixturesRequested && diagnosticsApproved;
  const reviewOwnerDashboardFixtures = ownerDashboardFixturesRequested && diagnosticsApproved;
  const reviewPrivacyFixtures = privacyFixturesRequested && diagnosticsApproved;
  assertSitesCompatibleFeatureFlags(featureFlags, { authorisedReviewFixtures: reviewCommerceFixtures });
  assertDynamicResultsStorage(featureFlags, {
    d1Configured: Boolean(d1),
    r2Configured: Boolean(r2),
    authorisedReviewFixtures: reviewResultFixtures,
  });
  assertFirstPartyAnalyticsStorage(featureFlags, {
    d1Configured: Boolean(d1),
    authorisedReviewFixtures: reviewAnalyticsFixtures,
  });
  assertCommerceReadiness(featureFlags, {
    d1Configured: Boolean(d1),
    completeConfiguration: false,
    approvedRateLimiter: false,
    authorisedReviewFixtures: reviewCommerceFixtures,
  });
  assertOwnerDashboardReadiness(featureFlags, {
    d1Configured: Boolean(d1),
    ownerAccessConfigured: Boolean(process.env.WYBP_OWNER_DASHBOARD_ALLOWED_SUBJECTS?.trim()),
    authorisedReviewFixtures: reviewOwnerDashboardFixtures,
  });
  const reviewChallengeData = reviewChallengeFixtures
    ? [
        { scenario: "valid", code: "1".repeat(48), inviterDisplayName: "Nia", edition: "west", verifiedScore: 10, total: 12, avatarId: "adjoa", validity: "valid" },
        { scenario: "expired", code: "2".repeat(48), inviterDisplayName: "Mirembe", edition: "east", verifiedScore: 8, total: 12, avatarId: "zuri", validity: "expired" },
        { scenario: "revoked", code: "3".repeat(48), inviterDisplayName: "Amara", edition: "central", verifiedScore: 9, total: 12, avatarId: "amara", validity: "revoked" },
        { scenario: "removed", code: "4".repeat(48), inviterDisplayName: "Safiya", edition: "north", verifiedScore: 7, total: 12, avatarId: "samira", validity: "unavailable" },
        { scenario: "temporary", code: "5".repeat(48), inviterDisplayName: "Thandi", edition: "south", verifiedScore: 11, total: 12, avatarId: "mbali", validity: "unavailable" },
        { scenario: "unicode", code: "6".repeat(48), inviterDisplayName: "Ọlá", edition: "west", verifiedScore: 11, total: 12, avatarId: "adjoa", validity: "valid" },
        { scenario: "nomination", code: "7".repeat(48), inviterDisplayName: "Ọlá", edition: "west", verifiedScore: 12, total: 12, avatarId: "adjoa", validity: "valid" },
        { scenario: "story_east", code: "8f".repeat(24), inviterDisplayName: "A challenger", edition: "east", verifiedScore: 8, total: 12, avatarId: "wanjiku", validity: "valid" },
        { scenario: "story_north", code: "9f".repeat(24), inviterDisplayName: "A challenger", edition: "north", verifiedScore: 4, total: 12, avatarId: "samira", validity: "valid" },
      ]
    : null;
  const reviewResultData = reviewResultFixtures
    ? [
        { slug: "8".repeat(48), edition: "west", score: 12, tier: 3, avatarId: "adjoa", visibility: "public", state: "active" },
        { slug: "9".repeat(48), edition: "east", score: 8, tier: 2, avatarId: "wanjiku", visibility: "public", state: "active" },
        { slug: "a".repeat(48), edition: "north", score: 4, tier: 1, avatarId: "samira", visibility: "public", state: "active" },
        { slug: "b".repeat(48), edition: "central", score: 10, tier: 3, avatarId: "efe", visibility: "private", state: "active" },
        { slug: "c".repeat(48), edition: "south", score: 7, tier: 2, avatarId: "mbali", visibility: "public", state: "expired" },
        { slug: "d".repeat(48), edition: "west", score: 9, tier: 3, avatarId: "adjoa", visibility: "public", state: "revoked" },
        { slug: "e".repeat(48), edition: "east", score: 6, tier: 2, avatarId: "zuri", visibility: "public", state: "deleted" },
      ]
    : null;
  const reviewResultClient = reviewResultFixtures
    ? { resultSlug: "b".repeat(48), anonymousSessionCredential: "01".repeat(16) }
    : null;
  const publicAppEnvironment: PublicAppEnvironment =
    reviewResultFixtures || reviewChallengeFixtures || reviewAnalyticsFixtures || reviewCommerceFixtures || reviewOwnerDashboardFixtures ? "test" : mode === "production" ? "production" : mode === "test" ? "test" : "development";
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
      __WYBP_REVIEW_CHALLENGE_FIXTURES__: JSON.stringify(reviewChallengeFixtures),
      __WYBP_REVIEW_CHALLENGE_DATA__: JSON.stringify(reviewChallengeData),
      __WYBP_REVIEW_RESULT_FIXTURES__: JSON.stringify(reviewResultFixtures),
      __WYBP_REVIEW_RESULT_DATA__: JSON.stringify(reviewResultData),
      __WYBP_REVIEW_RESULT_CLIENT__: JSON.stringify(reviewResultClient),
      __WYBP_REVIEW_ANALYTICS_FIXTURES__: JSON.stringify(reviewAnalyticsFixtures),
      __WYBP_REVIEW_COMMERCE_FIXTURES__: JSON.stringify(reviewCommerceFixtures),
      __WYBP_REVIEW_OWNER_DASHBOARD_FIXTURES__: JSON.stringify(reviewOwnerDashboardFixtures),
      __WYBP_REVIEW_PRIVACY_FIXTURES__: JSON.stringify(reviewPrivacyFixtures),
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
