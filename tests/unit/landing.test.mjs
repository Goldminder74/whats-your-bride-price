import assert from "node:assert/strict";
import test from "node:test";
import { adTrafficShouldStart } from "../../app/landing.ts";

test("ad links open play and a plain edition link does not", () => {
  assert.equal(adTrafficShouldStart(""), false);
  assert.equal(adTrafficShouldStart("?edition=west"), false);
  assert.equal(adTrafficShouldStart("?edition=west&score=8"), false);
  assert.equal(adTrafficShouldStart("?play=1"), true);
  assert.equal(adTrafficShouldStart("?edition=east&play=1"), true);
  assert.equal(adTrafficShouldStart("?utm_source=meta&utm_medium=paid"), true);
  assert.equal(adTrafficShouldStart("?utm_campaign=aunty"), true);
  assert.equal(adTrafficShouldStart("?utm_source="), false);
});
