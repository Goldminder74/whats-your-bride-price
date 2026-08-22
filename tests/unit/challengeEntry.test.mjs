import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveReviewChallengeFixture,
  reviewChallengeFixturesEnabled,
  validateTrustedChallengeEntry,
} from "../../app/challengeEntry.ts";

const valid = {
  code: "Trusted_2026",
  inviterDisplayName: "Ayo N.",
  edition: "west",
  verifiedScore: 10,
  total: 12,
  avatarId: "adjoa",
  validity: "valid",
};

test("trusted challenge values require a complete, validated server-side shape", () => {
  assert.deepEqual(validateTrustedChallengeEntry(valid), valid);
  assert.equal(validateTrustedChallengeEntry({ ...valid, verifiedScore: 13 }), null);
  assert.equal(validateTrustedChallengeEntry({ ...valid, inviterDisplayName: "<b>Ayo</b>" }), null);
  assert.equal(validateTrustedChallengeEntry({ ...valid, avatarId: "uploaded-photo" }), null);
  assert.deepEqual(validateTrustedChallengeEntry({ ...valid, validity: "unavailable" }), { ...valid, validity: "unavailable" });
  assert.equal(validateTrustedChallengeEntry({ ...valid, validity: "invented" }), null);
});

test("ordinary builds cannot resolve controlled review fixtures", () => {
  assert.equal(reviewChallengeFixturesEnabled, false);
  assert.equal(resolveReviewChallengeFixture("trusted-west"), undefined);
  assert.equal(resolveReviewChallengeFixture("anything-else"), undefined);
});
