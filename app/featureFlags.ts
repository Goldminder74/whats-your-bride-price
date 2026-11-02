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

/** The paid Worker is the commerce host. Flags no longer depend on ChatGPT Sites. */
export function assertSitesCompatibleFeatureFlags(flags: FeatureFlags): void {
  void flags;
}
