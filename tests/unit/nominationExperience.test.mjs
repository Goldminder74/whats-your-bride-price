import assert from "node:assert/strict";
import test from "node:test";
import {
  genericNominationShareText,
  genericNominationUrl,
  isNativeShareCancellation,
  nominationSnapshotVersion,
  personalisedChallengeSentence,
  personalisedChallengeShareText,
  readNominationSnapshot,
  validateSafeNominationChallenge,
  whatsappShareUrl,
  writeNominationSnapshot,
} from "../../app/nominationExperience.ts";
import { PRODUCT_SAFEGUARD } from "../../app/productSafeguards.ts";
import { createChallengeUrl, validatePublicAppOrigin } from "../../app/publicAppOrigin.ts";

const origin = validatePublicAppOrigin("https://brideprice.classesforculture.com", "production");
const projection = Object.freeze({
  challengeCode: "7".repeat(48),
  displayName: "Ọlá",
  avatarId: "adjoa",
  edition: "west",
  editionLabel: "West Africa",
  scoreToBeat: 11,
  maximumScore: 12,
  createdAt: 1,
  expiresAt: 2,
  status: "active",
});

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

test("personalised copy is projection-derived, canonical and includes the permanent safeguard", () => {
  const challengeUrl = createChallengeUrl(projection.challengeCode, origin);
  const challenge = validateSafeNominationChallenge(projection, challengeUrl, origin);
  assert.ok(challenge);
  assert.equal(
    personalisedChallengeSentence(challenge),
    "Ọlá challenged you to beat 11/12 in the West Africa Edition. Can you protect the family reputation?",
  );
  assert.equal(
    personalisedChallengeShareText(challenge),
    `Ọlá challenged you to beat 11/12 in the West Africa Edition. Can you protect the family reputation?\n${PRODUCT_SAFEGUARD}\n${challengeUrl}`,
  );
  assert.equal(validateSafeNominationChallenge({ ...projection, scoreToBeat: 1, editionLabel: "Browser Africa" }, challengeUrl, origin), null);
  assert.equal(validateSafeNominationChallenge({ ...projection, displayName: "<b>Ọlá</b>" }, challengeUrl, origin), null);
});

test("WhatsApp uses approved HTTPS and encodes the complete text exactly once", () => {
  const challenge = validateSafeNominationChallenge(projection, createChallengeUrl(projection.challengeCode, origin), origin);
  const completeText = personalisedChallengeShareText(challenge);
  const url = new URL(whatsappShareUrl(completeText));
  assert.equal(url.origin, "https://wa.me");
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("text"), completeText);
  assert.doesNotMatch(url.searchParams.get("text"), /%25[0-9A-F]{2}/i);
});

test("generic fallback is honest, direct and never generates nominated=1", () => {
  const url = genericNominationUrl("east", origin);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("edition"), "east");
  assert.equal(parsed.searchParams.has("nominated"), false);
  const text = genericNominationShareText("east", url);
  assert.match(text, /invited to play the East Africa Edition/);
  assert.match(text, new RegExp(PRODUCT_SAFEGUARD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(text, /scored|score to beat|challenged you to beat/i);
});

test("safe public nomination snapshot restores one canonical challenge and distinct completed slots", () => {
  const storage = new MemoryStorage();
  const challenge = validateSafeNominationChallenge(projection, createChallengeUrl(projection.challengeCode, origin), origin);
  const snapshot = Object.freeze({
    version: nominationSnapshotVersion,
    scope: "quiz-instance-0001",
    challenge,
    completedSlots: Object.freeze([1, 3]),
    savedAt: 10,
  });
  assert.equal(writeNominationSnapshot(storage, snapshot), true);
  const restored = readNominationSnapshot(storage, snapshot.scope, origin, 11);
  assert.equal(restored.challenge.challengeUrl, challenge.challengeUrl);
  assert.deepEqual(restored.completedSlots, [1, 3]);
  const serialized = JSON.stringify([...storage.values.values()]);
  assert.doesNotMatch(serialized, /revocation|idempotency|sessionId|photo|telephone|email/i);
});

test("native-share cancellation is distinct from failure", () => {
  assert.equal(isNativeShareCancellation(new DOMException("cancelled", "AbortError")), true);
  assert.equal(isNativeShareCancellation(Object.assign(new Error("cancelled"), { name: "AbortError" })), true);
  assert.equal(isNativeShareCancellation(new Error("network")), false);
});
