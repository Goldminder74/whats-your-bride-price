import assert from "node:assert/strict";
import test from "node:test";
import { answersMatch, calculateResultTier } from "../../app/gameLogic.ts";

test("answer matching preserves the exact-set scoring baseline", () => {
  assert.equal(answersMatch([1], [1]), true);
  assert.equal(answersMatch([0], [1]), false);
  assert.equal(answersMatch([2, 0, 1], [0, 1, 2]), true);
  assert.equal(answersMatch([0, 1], [0, 1, 2]), false);
  assert.equal(answersMatch([0, 1, 3], [0, 1, 2]), false);
});

test("result tiers retain the existing 0 to 2, 3 to 5, 6 to 8 and 9 to 12 boundaries", () => {
  const expected = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3];
  expected.forEach((tier, score) => assert.equal(calculateResultTier(score), tier));
});
