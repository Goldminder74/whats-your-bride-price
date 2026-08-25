import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { defaultFeatureFlags } from "../../app/featureFlags.ts";
import { PRODUCT_SAFEGUARD } from "../../app/productSafeguards.ts";
import {
  STORY_STATIC_MIME,
  STORY_VIDEO_DURATION_MS,
  STORY_VIDEO_FPS,
  STORY_VIDEO_HEIGHT,
  STORY_VIDEO_MAX_BYTES,
  STORY_VIDEO_WIDTH,
  selectStoryVideoMime,
  storyStaticFilename,
  storyVideoFilename,
  storyVideoMimeCandidates,
  storyVideoPhaseAt,
} from "../../app/storyVideo.ts";
import { safeStoryVideoEvent, storyVideoEventNames } from "../../app/storyVideoEvents.ts";
import { isStoryVideoProjection, storyVideoProjectionFromShare } from "../../app/storyVideoProjection.ts";

const origin = "http://127.0.0.1:3100";
const safeShare = Object.freeze({ surface: "result", edition: "west", editionLabel: "West Africa", canonicalUrl: `${origin}/result/${"8".repeat(48)}`, personalised: true, displayName: "A challenger", score: 12, maximumScore: 12, resultTitle: "Bride Price Royalty", avatarId: "adjoa" });

test("authoritative animated-media projection contains only approved fields", () => {
  const projection = storyVideoProjectionFromShare({ ...safeShare, privatePhoto: "blob:secret", anonymousSessionCredential: "a".repeat(32), anonymousSubjectHash: "b".repeat(64), internalResultId: "result_1", answers: [1], objectKey: "generated/private" }, origin);
  assert.ok(projection);
  assert.equal(isStoryVideoProjection(projection), true);
  assert.deepEqual(Object.keys(projection).sort(), ["avatarAsset", "avatarId", "edition", "editionLabel", "mastery", "maximumScore", "publicResultUrl", "regionalArtwork", "resultTitle", "safeguard", "score", "theme"].sort());
  assert.equal(projection.publicResultUrl, safeShare.canonicalUrl);
  assert.equal(projection.safeguard, PRODUCT_SAFEGUARD);
  assert.match(projection.avatarAsset, /^\/avatars\/[a-z0-9-]+\.webp$/);
  assert.match(projection.regionalArtwork, /^\/regions\/[a-z-]+-africa\.webp$/);
  assert.doesNotMatch(JSON.stringify(projection), /blob:|credential|subject|internal|answers|objectKey|private/i);
});

test("malformed scores, editions, avatars, titles and URLs fail closed", () => {
  for (const candidate of [
    { ...safeShare, score: 13 },
    { ...safeShare, score: 7.5 },
    { ...safeShare, edition: "invented" },
    { ...safeShare, avatarId: "uploaded-photo" },
    { ...safeShare, resultTitle: "Invented crown" },
    { ...safeShare, canonicalUrl: "https://attacker.example/result/" + "8".repeat(48) },
    { ...safeShare, canonicalUrl: `${safeShare.canonicalUrl}?token=secret` },
  ]) assert.equal(storyVideoProjectionFromShare(candidate, origin), null);
  const challengeShare = { ...safeShare, canonicalUrl: `${origin}/challenge/${"7".repeat(48)}`, displayName: "Ọlá" };
  assert.equal(storyVideoProjectionFromShare(challengeShare, origin)?.publicResultUrl, null);
});

test("9:16 media contract and five-second animation phases are exact", () => {
  assert.equal(STORY_VIDEO_WIDTH, 1080); assert.equal(STORY_VIDEO_HEIGHT, 1920); assert.equal(STORY_VIDEO_WIDTH / STORY_VIDEO_HEIGHT, 9 / 16);
  assert.equal(STORY_VIDEO_DURATION_MS, 5000); assert.equal(STORY_VIDEO_FPS, 30); assert.equal(STORY_VIDEO_MAX_BYTES, 8_000_000); assert.equal(STORY_STATIC_MIME, "image/png");
  assert.equal(storyVideoPhaseAt(0), "regional_reveal"); assert.equal(storyVideoPhaseAt(799), "regional_reveal");
  assert.equal(storyVideoPhaseAt(800), "avatar_score"); assert.equal(storyVideoPhaseAt(2399), "avatar_score");
  assert.equal(storyVideoPhaseAt(2400), "result_reveal"); assert.equal(storyVideoPhaseAt(3799), "result_reveal");
  assert.equal(storyVideoPhaseAt(3800), "final_hold"); assert.equal(storyVideoPhaseAt(5000), "final_hold");
});

test("MP4 is selected only when explicitly supported and WebM retains its extension", () => {
  assert.equal(storyVideoMimeCandidates[0].extension, "mp4");
  assert.deepEqual(selectStoryVideoMime((mime) => mime === "video/mp4"), { mimeType: "video/mp4", extension: "mp4" });
  assert.deepEqual(selectStoryVideoMime((mime) => mime === "video/webm;codecs=vp8"), { mimeType: "video/webm;codecs=vp8", extension: "webm" });
  assert.equal(selectStoryVideoMime(() => false), null); assert.equal(selectStoryVideoMime(undefined), null);
  assert.equal(storyVideoFilename("east", "webm"), "bride-price-east-story-video.webm");
  assert.equal(storyVideoFilename("north", "mp4"), "bride-price-north-story-video.mp4");
  assert.equal(storyStaticFilename("west"), "bride-price-west-story-static.png");
});

test("local event contract is exact, controlled and non-identifying", () => {
  assert.deepEqual(storyVideoEventNames, ["story_video_open", "story_video_render_start", "story_video_render_complete", "story_video_render_failed", "story_video_share_intent", "story_video_share_handoff", "story_video_download", "story_static_fallback"]);
  assert.deepEqual(safeStoryVideoEvent({ name: "story_video_render_complete", edition: "west", surface: "result", state: "ready", elapsedMs: 5001.2, byteSize: 999_000 }), { name: "story_video_render_complete", edition: "west", surface: "result", state: "ready", elapsedMs: 5001, byteSize: 999_000 });
  assert.equal(safeStoryVideoEvent({ name: "story_video_render_complete", edition: "west", surface: "result", state: "ready", byteSize: 8_000_001 }), null);
  assert.equal(safeStoryVideoEvent({ name: "invented", edition: "west", surface: "result", state: "ready" }), null);
});

test("feature defaults off and implementation has no capture, contact, upload or remote-media capability", async () => {
  assert.equal(defaultFeatureFlags.story_video, false);
  const [source, panel, shareCentre] = await Promise.all([
    readFile(new URL("../../app/storyVideo.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/StoryVideoPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/ShareCentre.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(source, /captureStream/); assert.match(source, /MediaRecorder\.isTypeSupported/); assert.match(source, /URL\.revokeObjectURL/); assert.match(source, /AbortSignal/);
  assert.doesNotMatch(`${source}\n${panel}`, /getUserMedia|mediaDevices|microphone|camera|contacts|ContactPicker|fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|serviceWorker|\.upload\s*\(/i);
  assert.match(shareCentre, /activeFeatureFlags\.story_video/); assert.match(panel, /Use static Story image instead/);
});
