import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSitesCompatibleFeatureFlags,
  assertDynamicResultsStorage,
  defaultFeatureFlags,
  featureFlagNames,
  resolveFeatureFlags,
} from "../../app/featureFlags.ts";

test("every roadmap feature flag defaults to false", () => {
  assert.equal(featureFlagNames.length, 12);
  assert.deepEqual(Object.keys(defaultFeatureFlags), [...featureFlagNames]);
  for (const flag of featureFlagNames) assert.equal(defaultFeatureFlags[flag], false);
  assert.deepEqual(resolveFeatureFlags({}), defaultFeatureFlags);
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
});
