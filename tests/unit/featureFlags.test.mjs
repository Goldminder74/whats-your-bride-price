import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSitesCompatibleFeatureFlags,
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
