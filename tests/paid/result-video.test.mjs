import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_ORIGIN } from "../../paid/catalog.ts";
import { createMockEmail } from "../../paid/email.ts";
import { createMemoryRepository } from "../../paid/repository.ts";
import { resultVideoCacheKey, resultVideoFrameSvg, resultVideoStory, VIDEO_HEIGHT, VIDEO_SAFE, VIDEO_WIDTH } from "../../paid/resultVideo.ts";
import { handleResultVideoFile, mp4IsResultTemplate, sampleTemplateMp4 } from "../../paid/resultVideoRoute.ts";
import { servePaid } from "../../paid/serve.ts";

const player = "player_result_video_01";

function memoryKv() {
  const map = new Map();
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, value); },
  };
}

function services(overrides = {}) {
  return {
    email: createMockEmail(),
    now: () => 1_700_000_000_000,
    repository: createMemoryRepository(),
    kv: overrides.kv ?? memoryKv(),
    config: { stripeMode: "mock", stripeSecretKey: "sk_test_mock_local_only", webhookSecret: "whsec_local_test_secret_value", publicOrigin: CANONICAL_ORIGIN },
    resultVideo: overrides.resultVideo,
  };
}

function request(path, init = {}) {
  return new Request(`https://brideprice.classesforculture.com${path}`, init);
}

test("the result video stays off until RESULT_VIDEO is on", async () => {
  const hidden = services();
  assert.equal((await servePaid(request("/api/paid/result-video?edition=west&score=9"), hidden)).status, 404);
  assert.equal((await servePaid(request("/api/paid/result-video.mp4?edition=west&score=9"), hidden)).status, 404);
  const health = await (await servePaid(request("/api/paid/health"), hidden)).json();
  assert.equal(health.resultVideo, false);
});

test("the storyboard is a 5 second 1080x1920 phone clip cached by region, score, and title", async () => {
  const story = resultVideoStory("west", 9, "abcd2345");
  assert.equal(story.width, VIDEO_WIDTH);
  assert.equal(story.height, VIDEO_HEIGHT);
  assert.equal(story.seconds, 5);
  assert.equal(story.title, "Bride Price Royalty");
  assert.equal(story.cowries, 50);
  assert.equal(story.hook, "So. What's your bride price?");
  assert.deepEqual(story.beats.map((beat) => beat.id), ["hook", "reveal", "cta"]);
  assert.match(story.beats[1].lines.join(" "), /WEST AFRICA/);
  assert.match(story.beats[1].lines.join(" "), /9 \/ 12/);
  assert.match(story.beats[1].lines.join(" "), /50 COWRIES/);
  assert.match(story.beats[2].lines.join(" "), /Can you beat me\?/);
  assert.match(story.beats[2].lines.join(" "), /brideprice\.classesforculture\.com/);
  assert.match(story.beats[2].lines.join(" "), /abcd2345/);
  assert.equal(resultVideoCacheKey("west", 9, story.title), resultVideoCacheKey("west", 9, story.title));
  assert.equal(resultVideoCacheKey("west", 9, story.title).includes("abcd2345"), false);
  const frame = resultVideoFrameSvg(story, "cta");
  assert.match(frame, /Anton/);
  assert.match(frame, new RegExp(`y="${VIDEO_SAFE.top + 180}"`));
  assert.equal(frame.includes("Georgia"), false);

  const app = services({ resultVideo: true });
  const body = await (await servePaid(request("/api/paid/result-video?edition=west&score=9&ref=abcd2345"), app)).json();
  assert.equal(body.referral, "abcd2345");
  assert.equal(body.beats[2].lines.includes("abcd2345"), true);
  const other = await (await servePaid(request("/api/paid/result-video?edition=west&score=9&ref=iiiiiiii"), app)).json();
  assert.equal(other.referral, null);
  const key = resultVideoCacheKey("west", 9, body.title);
  assert.equal((await servePaid(request("/api/paid/result-video?edition=east&score=9"), app)).headers.get("x-result-video-key") === key, false);
});

test("a template mp4 is H.264 with silent AAC, and the shared cache ignores the referral code", async () => {
  const bytes = sampleTemplateMp4();
  assert.equal(mp4IsResultTemplate(bytes), true);
  assert.match(Buffer.from(bytes).toString("latin1"), /ftyp/);
  assert.match(Buffer.from(bytes).toString("latin1"), /avc1/);
  assert.match(Buffer.from(bytes).toString("latin1"), /mp4a/);
  const kv = memoryKv();
  const app = services({ kv, resultVideo: true });
  const missed = await servePaid(request("/api/paid/result-video.mp4?edition=west&score=9"), app);
  assert.equal(missed.status, 404);
  assert.equal(missed.headers.get("x-result-video-mode"), "client");
  const stored = await handleResultVideoFile(request("/api/paid/result-video.mp4?edition=west&score=9", {
    method: "POST",
    headers: { "content-type": "video/mp4", origin: "https://brideprice.classesforculture.com" },
    body: bytes,
  }), new URL("https://brideprice.classesforculture.com/api/paid/result-video.mp4?edition=west&score=9"), app);
  assert.equal(stored.status, 200);
  assert.equal(stored.headers.get("x-result-video-cache"), "miss");
  const hit = await servePaid(request("/api/paid/result-video.mp4?edition=west&score=9&ref=abcd2345"), app);
  assert.equal(hit.status, 200);
  assert.equal(hit.headers.get("x-result-video-cache"), "hit");
  assert.equal(hit.headers.get("content-type"), "video/mp4");
  assert.equal(player.length > 0, true);
});
