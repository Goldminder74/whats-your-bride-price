import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCommerceReadiness,
  assertDailyChallengeReadiness,
  assertRandomQuickPlayReadiness,
  assertSitesCompatibleFeatureFlags,
  assertDynamicResultsStorage,
  defaultFeatureFlags,
  featureFlagNames,
  resolveFeatureFlags,
} from "../../app/featureFlags.ts";

test("every roadmap feature flag defaults to false", () => {
  assert.equal(featureFlagNames.length, 14);
  assert.deepEqual(Object.keys(defaultFeatureFlags), [...featureFlagNames]);
  for (const flag of featureFlagNames) assert.equal(defaultFeatureFlags[flag], false);
  assert.deepEqual(resolveFeatureFlags({}), defaultFeatureFlags);
});

test("Random Quick Play is controlled only by build configuration and fails closed without D1", () => {
  assert.equal(defaultFeatureFlags.random_quick_play, false);
  const flags = resolveFeatureFlags({ WYBP_FEATURE_RANDOM_QUICK_PLAY: "true", random_quick_play: "false" });
  assert.equal(flags.random_quick_play, true);
  assert.equal(resolveFeatureFlags({ random_quick_play: "true", QUERY_RANDOM_QUICK_PLAY: "true" }).random_quick_play, false);
  assert.throws(() => assertRandomQuickPlayReadiness(flags, { d1Configured: false, authorisedReviewFixtures: false }), /requires approved D1 storage/i);
  assert.doesNotThrow(() => assertRandomQuickPlayReadiness(flags, { d1Configured: true, authorisedReviewFixtures: false }));
  assert.doesNotThrow(() => assertRandomQuickPlayReadiness(flags, { d1Configured: false, authorisedReviewFixtures: true }));
});

test("dynamic results fail closed without both durable stores or authorised review fixtures", () => {
  const flags = resolveFeatureFlags({ WYBP_FEATURE_DYNAMIC_RESULTS: "true" });
  assert.throws(() => assertDynamicResultsStorage(flags, { d1Configured: false, r2Configured: false, authorisedReviewFixtures: false }), /require durable result and generated-media storage/i);
  assert.doesNotThrow(() => assertDynamicResultsStorage(flags, { d1Configured: true, r2Configured: true, authorisedReviewFixtures: false }));
  assert.doesNotThrow(() => assertDynamicResultsStorage(flags, { d1Configured: false, r2Configured: false, authorisedReviewFixtures: true }));
  assert.doesNotThrow(() => assertDynamicResultsStorage(defaultFeatureFlags, { d1Configured: false, r2Configured: false, authorisedReviewFixtures: false }));
});

test("feature flags are parsed from explicit build environment values", () => {
  const flags = resolveFeatureFlags({
    WYBP_FEATURE_FAST_ENTRY: "true",
    WYBP_FEATURE_CHALLENGES: "1",
    WYBP_FEATURE_COMMERCE: "false",
  });
  assert.equal(flags.fast_entry, true);
  assert.equal(flags.challenges, true);
  assert.equal(flags.commerce, false);
  assert.equal(flags.dynamic_results, false);
});

test("ChatGPT Sites rejects commerce", () => {
  const flags = resolveFeatureFlags({ WYBP_FEATURE_COMMERCE: "true" });
  assert.throws(
    () => assertSitesCompatibleFeatureFlags(flags),
    /Commerce cannot be enabled while this application targets ChatGPT Sites/,
  );
  assert.doesNotThrow(() => assertSitesCompatibleFeatureFlags(flags, { authorisedReviewFixtures: true }));
  assert.throws(() => assertCommerceReadiness(flags, { d1Configured: false, completeConfiguration: false, approvedRateLimiter: false, authorisedReviewFixtures: false }), /fails closed/i);
  assert.doesNotThrow(() => assertCommerceReadiness(flags, { d1Configured: false, completeConfiguration: false, approvedRateLimiter: false, authorisedReviewFixtures: true }));
});

test("daily challenges and streaks default off and fail closed without storage and secret", () => {
  assert.equal(defaultFeatureFlags.daily_challenge, false);
  assert.equal(defaultFeatureFlags.streaks, false);
  const daily = resolveFeatureFlags({ WYBP_FEATURE_DAILY_CHALLENGE: "true" });
  assert.throws(() => assertDailyChallengeReadiness(daily, { d1Configured: false, serverSecretConfigured: false }), /require approved D1 storage/i);
  assert.doesNotThrow(() => assertDailyChallengeReadiness(daily, { d1Configured: true, serverSecretConfigured: true }));
  const streakOnly = resolveFeatureFlags({ WYBP_FEATURE_STREAKS: "true" });
  assert.throws(() => assertDailyChallengeReadiness(streakOnly, { d1Configured: true, serverSecretConfigured: true }), /require.*daily_challenge/i);
  assert.equal(resolveFeatureFlags({ QUERY_DAILY_CHALLENGE: "true", WYBP_FEATURE_DAILY_CHALLENGE: "false" }).daily_challenge, false);
});
