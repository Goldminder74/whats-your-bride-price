export const featureFlagNames = [
  "fast_entry",
  "challenges",
  "dynamic_results",
  "story_video",
  "first_party_analytics",
  "daily_challenge",
  "streaks",
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
  daily_challenge: false,
  streaks: false,
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

export function assertSitesCompatibleFeatureFlags(flags: FeatureFlags): void {
  if (flags.commerce) {
    throw new Error(
      "Commerce cannot be enabled while this application targets ChatGPT Sites. Set WYBP_FEATURE_COMMERCE=false, or migrate to an explicitly approved commerce-capable host before adding payment functionality.",
    );
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

declare const __WYBP_FEATURE_FLAGS__: FeatureFlags | undefined;

export const activeFeatureFlags: FeatureFlags = Object.freeze({
  ...defaultFeatureFlags,
  ...(typeof __WYBP_FEATURE_FLAGS__ === "object" ? __WYBP_FEATURE_FLAGS__ : {}),
});

export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  return activeFeatureFlags[flag];
}
