import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PRODUCT_SAFEGUARD, RESULT_TIER_TITLES } from "../../app/productSafeguards.ts";
import { validateSafeNominationChallenge } from "../../app/nominationExperience.ts";
import { createChallengeUrl, createResultUrl, validatePublicAppOrigin } from "../../app/publicAppOrigin.ts";
import {
  genericShareProjection,
  isSafeShareProjection,
  shareProjectionFromChallenge,
  shareProjectionFromPublicResult,
} from "../../app/shareProjection.ts";
import {
  buildShareCopy,
  countTextOccurrences,
  facebookShareDestination,
  shareCopyMaximumLength,
  whatsappShareDestination,
} from "../../app/shareCopy.ts";
import {
  SHARE_MEDIA_HEIGHT,
  SHARE_MEDIA_MIME,
  SHARE_MEDIA_SAFE_INSET,
  SHARE_MEDIA_WIDTH,
  shareMediaCardFromProjection,
  shareMediaFilename,
} from "../../app/shareMedia.ts";
import { safeShareCentreEvent } from "../../app/shareCentreEvents.ts";

const origin = validatePublicAppOrigin("https://brideprice.classesforculture.com", "production");
const publicProjection = Object.freeze({
  challengeCode: "a".repeat(48),
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

test("public results use one permanent canonical URL across platform destinations", () => {
  const result = Object.freeze({ resultSlug: "b".repeat(48), edition: "west", score: 9, total: 12, tier: 3, safeAvatarId: "adjoa", scoringVersion: "binary-exact-set-v1", safeguard: PRODUCT_SAFEGUARD, createdAt: 1, expiresAt: null, displayName: "A challenger" });
  const resultUrl = createResultUrl(result.resultSlug, origin);
  const projection = shareProjectionFromPublicResult(result, resultUrl, origin);
  assert.ok(projection);
  assert.equal(projection.canonicalUrl, resultUrl);
  assert.equal(isSafeShareProjection(projection, origin), true);
  assert.equal(new URL(facebookShareDestination(projection)).searchParams.get("u"), resultUrl);
  const permanentCopy = buildShareCopy(projection);
  assert.match(permanentCopy.completeText, /A challenger scored 9\/12.*Bride Price Royalty/i);
  assert.match(new URL(whatsappShareDestination(permanentCopy)).searchParams.get("text"), new RegExp(resultUrl));
  assert.equal(shareProjectionFromPublicResult({ ...result, displayName: "Private name" }, resultUrl, origin), null);
  assert.equal(shareProjectionFromPublicResult(result, "https://attacker.example/result/" + result.resultSlug, origin), null);
});

function personalised(surface = "result") {
  const challengeUrl = createChallengeUrl(publicProjection.challengeCode, origin);
  const challenge = validateSafeNominationChallenge(publicProjection, challengeUrl, origin);
  assert.ok(challenge);
  const projection = shareProjectionFromChallenge(surface, challenge, origin);
  assert.ok(projection);
  return projection;
}

test("personalised projections are canonical, approved and derive the title from the verified score", () => {
  const projection = personalised();
  assert.equal(projection.canonicalUrl, `https://brideprice.classesforculture.com/challenge/${"a".repeat(48)}`);
  assert.equal(projection.resultTitle, RESULT_TIER_TITLES[3]);
  assert.equal(isSafeShareProjection(projection, origin), true);
  assert.equal(isSafeShareProjection({ ...projection, score: 1 }, origin), false);
  assert.equal(isSafeShareProjection({ ...projection, canonicalUrl: "https://evil.example/challenge/" + "a".repeat(48) }, origin), false);
  assert.equal(isSafeShareProjection({ ...projection, canonicalUrl: "not a url" }, origin), false);
  assert.equal(isSafeShareProjection({ ...projection, avatarId: "private-photo" }, origin), false);
  assert.equal(isSafeShareProjection({ ...projection, displayName: "<script>alert(1)</script>" }, origin), false);
  assert.equal(isSafeShareProjection({ ...projection, displayName: "A".repeat(100) }, origin), false);
  assert.equal(isSafeShareProjection({ ...projection, editionLabel: "West Africa<script>" }, origin), false);
  assert.equal(isSafeShareProjection({ ...projection, resultTitle: "Royal<script>" }, origin), false);
});

test("generic fallback is neutral and cannot invent a score, name or challenge route", () => {
  const projection = genericShareProjection("comparison", "east", origin);
  assert.equal(projection.personalised, false);
  assert.equal(projection.displayName, null);
  assert.equal(projection.score, null);
  assert.equal(projection.canonicalUrl, "https://brideprice.classesforculture.com/?edition=east");
  assert.equal(isSafeShareProjection(projection, origin), true);
  const copy = buildShareCopy(projection);
  assert.doesNotMatch(copy.completeText, /challenged you to beat|score to beat|nominated=1/i);
  assert.match(copy.completeText, /East Africa Edition/);
});

test("platform copy is fixed, practical and encodes canonical data exactly once", () => {
  const projection = personalised("challenge_landing");
  const copy = buildShareCopy(projection);
  assert.equal(copy.completeText, `Ọlá challenged you to beat 11/12 in the West Africa Edition. Can you protect the family reputation?\n${PRODUCT_SAFEGUARD}\n${projection.canonicalUrl}`);
  assert.ok(copy.completeText.length <= shareCopyMaximumLength);
  assert.equal(countTextOccurrences(copy.completeText, projection.canonicalUrl), 1);
  const whatsapp = new URL(whatsappShareDestination(copy));
  assert.equal(whatsapp.origin, "https://wa.me");
  assert.equal(whatsapp.searchParams.get("text"), copy.completeText);
  assert.equal(countTextOccurrences(whatsapp.searchParams.get("text"), projection.canonicalUrl), 1);
  const facebook = new URL(facebookShareDestination(projection));
  assert.equal(facebook.origin, "https://www.facebook.com");
  assert.equal(facebook.pathname, "/sharer/sharer.php");
  assert.equal(facebook.searchParams.get("u"), projection.canonicalUrl);
  assert.equal([...facebook.searchParams.keys()].length, 1);
});

test("story media contract is 9:16, PNG, branded and filename-safe", () => {
  const projection = personalised();
  const card = shareMediaCardFromProjection(projection);
  assert.deepEqual(card, {
    edition: "west",
    displayName: "Ọlá",
    score: 11,
    maximumScore: 12,
    resultTitle: "Bride Price Royalty",
    avatarId: "adjoa",
  });
  assert.equal(SHARE_MEDIA_WIDTH, 1080);
  assert.equal(SHARE_MEDIA_HEIGHT, 1920);
  assert.equal(SHARE_MEDIA_HEIGHT / SHARE_MEDIA_WIDTH, 16 / 9);
  assert.equal(SHARE_MEDIA_MIME, "image/png");
  assert.ok(SHARE_MEDIA_SAFE_INSET >= 90);
  assert.equal(shareMediaFilename("west"), "bride-price-west-story.png");
  assert.doesNotMatch(shareMediaFilename("west"), /Ọlá|score|11/i);
  assert.equal(shareMediaCardFromProjection(genericShareProjection("result", "west", origin)), null);
});

test("local share events contain only controlled non-personal fields", () => {
  const safe = safeShareCentreEvent({
    name: "share_external_handoff",
    surface: "result",
    channel: "whatsapp",
    edition: "west",
    elapsedMs: -4,
    displayName: "must disappear",
    challengeUrl: "must disappear",
    score: 12,
  });
  assert.deepEqual(safe, {
    name: "share_external_handoff",
    surface: "result",
    channel: "whatsapp",
    edition: "west",
    elapsedMs: 0,
  });
  assert.deepEqual(safeShareCentreEvent({ name: "share_media_prepared", surface: "result", edition: "west", elapsedMs: 5 }), {
    name: "share_media_prepared",
    surface: "result",
    edition: "west",
    elapsedMs: 5,
  });
  assert.equal(safeShareCentreEvent({ name: "message_sent", surface: "result", channel: "copy", edition: "west" }), null);
});

test("download implementation creates and revokes only a local object URL", async () => {
  const source = await readFile(new URL("../../app/shareMedia.ts", import.meta.url), "utf8");
  assert.match(source, /URL\.createObjectURL\(media\.blob\)/);
  assert.match(source, /URL\.revokeObjectURL\(url\)/);
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|sendBeacon|FormData|MEDIA\.put|R2/i);
});
