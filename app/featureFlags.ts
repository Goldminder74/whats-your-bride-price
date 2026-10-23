export const featureFlagNames = [
  "fast_entry",
  "challenges",
  "dynamic_results",
  "story_video",
  "first_party_analytics",
  "owner_dashboard",
  "daily_challenge",
  "streaks",
  "random_quick_play",
  "cowrie_economy",
  "groom_mode",
  "couples_mode",
  "party_mode",
  "premium_preview",
  "commerce",
] as const;

export type FeatureFlagName = (typeof featureFlagNames)[number];
export type FeatureFlags = Readonly<Record<FeatureFlagName, boolean>>;

export const defaultFeatureFlags: FeatureFlags = Object.freeze({
  fast_entry: false,
  challenges: false,
  dynamic_results: false,
  story_video: false,
  first_party_analytics: false,
  owner_dashboard: false,
  daily_challenge: false,
  streaks: false,
  random_quick_play: false,
  cowrie_economy: false,
  groom_mode: false,
  couples_mode: false,
  party_mode: false,
  premium_preview: false,
  commerce: false,
});

export const featureFlagEnvironmentName = (flag: FeatureFlagName) =>
  `WYBP_FEATURE_${flag.toUpperCase()}`;

const enabledValues = new Set(["1", "true", "on", "yes"]);

export function resolveFeatureFlags(
  environment: Readonly<Record<string, string | undefined>>,
): FeatureFlags {
  return Object.freeze(
    Object.fromEntries(
      featureFlagNames.map((flag) => [
        flag,
        enabledValues.has((environment[featureFlagEnvironmentName(flag)] || "").toLowerCase()),
      ]),
    ) as Record<FeatureFlagName, boolean>,
  );
}

export function assertSitesCompatibleFeatureFlags(
  flags: FeatureFlags,
  readiness: Readonly<{ authorisedReviewFixtures?: boolean }> = {},
): void {
  if (flags.commerce && !readiness.authorisedReviewFixtures) {
    throw new Error(
      "Commerce cannot be enabled while this application targets ChatGPT Sites. Set WYBP_FEATURE_COMMERCE=false, or migrate to an explicitly approved commerce-capable host before adding payment functionality.",
    );
  }
}

export function assertCommerceReadiness(
  flags: FeatureFlags,
  readiness: Readonly<{ d1Configured: boolean; completeConfiguration: boolean; approvedRateLimiter: boolean; authorisedReviewFixtures: boolean }>,
): void {
  if (flags.commerce && !readiness.authorisedReviewFixtures && !(readiness.d1Configured && readiness.completeConfiguration && readiness.approvedRateLimiter)) {
    throw new Error("Commerce requires an approved D1 binding, complete server-only Stripe configuration and an approved rate limiter. It fails closed unless an explicitly authorised local commerce-fixture review build is used.");
  }
}

export function assertDynamicResultsStorage(
  flags: FeatureFlags,
  readiness: Readonly<{ d1Configured: boolean; r2Configured: boolean; authorisedReviewFixtures: boolean }>,
): void {
  if (flags.dynamic_results && !(readiness.d1Configured && readiness.r2Configured) && !readiness.authorisedReviewFixtures) {
    throw new Error(
      "Dynamic results require durable result and generated-media storage. Configure approved D1 and R2 bindings, or use the explicitly authorised local result-fixture review build. The feature fails closed while storage is unavailable.",
    );
  }
}

export function assertFirstPartyAnalyticsStorage(
  flags: FeatureFlags,
  readiness: Readonly<{ d1Configured: boolean; authorisedReviewFixtures: boolean }>,
): void {
  if (flags.first_party_analytics && !readiness.d1Configured && !readiness.authorisedReviewFixtures) {
    throw new Error(
      "First-party analytics requires an approved D1 binding or an explicitly authorised local analytics-fixture review build. It fails closed while storage is unavailable.",
    );
  }
}

export function assertOwnerDashboardReadiness(
  flags: FeatureFlags,
  readiness: Readonly<{ d1Configured: boolean; ownerAccessConfigured: boolean; authorisedReviewFixtures: boolean }>,
): void {
  if (
    flags.owner_dashboard &&
    !readiness.authorisedReviewFixtures &&
    !(readiness.d1Configured && readiness.ownerAccessConfigured)
  ) {
    throw new Error(
      "The owner dashboard requires an approved D1 binding and a complete server-only Sites subject allowlist. It fails closed unless an explicitly authorised local owner-dashboard fixture build is used.",
    );
  }
}

export function assertDailyChallengeReadiness(
  flags: FeatureFlags,
  readiness: Readonly<{ d1Configured: boolean; serverSecretConfigured: boolean }>,
): void {
  if ((flags.daily_challenge || flags.streaks) && !(readiness.d1Configured && readiness.serverSecretConfigured)) {
    throw new Error("Daily challenges and streaks require approved D1 storage and a server-only daily seed secret. Both features fail closed while either dependency is unavailable.");
  }
  if (flags.streaks && !flags.daily_challenge) {
    throw new Error("Streaks require the separately controlled daily_challenge feature because only an authoritative official daily completion can advance a streak.");
  }
}

export function assertRandomQuickPlayReadiness(
  flags: FeatureFlags,
  readiness: Readonly<{ d1Configured: boolean; authorisedReviewFixtures: boolean }>,
): void {
  if (flags.random_quick_play && !readiness.d1Configured && !readiness.authorisedReviewFixtures) {
    throw new Error("Random Quick Play requires approved D1 storage or an explicitly authorised local review build. It fails closed while authoritative selection storage is unavailable.");
  }
}

export function assertCowrieEconomyReadiness(
  flags: FeatureFlags,
  readiness: Readonly<{ d1Configured: boolean; authorisedReviewFixtures: boolean; approvedOperationalReview: boolean }>,
): void {
  if (!flags.cowrie_economy) return;
  if (!flags.random_quick_play) {
    throw new Error("The Cowrie economy requires the separately controlled random_quick_play feature.");
  }
  if (!readiness.authorisedReviewFixtures && !(readiness.d1Configured && readiness.approvedOperationalReview)) {
    throw new Error("The Cowrie economy requires approved D1 storage and completed operational, privacy and legal review. It fails closed unless an explicitly authorised local review build is used.");
  }
}

declare const __WYBP_FEATURE_FLAGS__: FeatureFlags | undefined;

export const activeFeatureFlags: FeatureFlags = Object.freeze({
  ...defaultFeatureFlags,
  ...(typeof __WYBP_FEATURE_FLAGS__ === "object" ? __WYBP_FEATURE_FLAGS__ : {}),
});

export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  return activeFeatureFlags[flag];
}
