import assert from "node:assert/strict";
import test from "node:test";
import { canShareClip, planVideoSave, shareClipNow } from "../../app/resultVideo.ts";

function clip() {
  return {
    blob: new Blob([Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112])], { type: "video/mp4" }),
    filename: "bride-price-west-9.mp4",
    kind: "video",
  };
}

test("share is invoked in the same turn with an mp4 file", async () => {
  const calls = [];
  const nav = {
    canShare: (data) => data.files?.[0]?.type === "video/mp4" && data.files[0].name.endsWith(".mp4"),
    share: async (data) => {
      calls.push({
        title: data.title,
        type: data.files[0].type,
        name: data.files[0].name,
        size: data.files[0].size,
      });
    },
  };
  const pending = shareClipNow(clip(), "Can you beat me? https://brideprice.classesforculture.com/?edition=west&score=9", nav);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "video/mp4");
  assert.equal(calls[0].name, "bride-price-west-9.mp4");
  assert.equal(calls[0].size > 0, true);
  await pending;
});

test("share is refused when the phone will not accept the file", () => {
  const nav = { canShare: () => false, share: async () => { throw new Error("should not run"); } };
  assert.equal(shareClipNow(clip(), "hello", nav), null);
  assert.equal(canShareClip(clip(), { share: async () => {}, canShare: () => { throw new Error("nope"); } }), false);
});

test("iPhone save uses the player sheet and Android keeps the download", () => {
  assert.equal(planVideoSave("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15"), "sheet");
  assert.equal(planVideoSave("Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/130.0.0.0 Mobile"), "download");
});

test("a server mp4 is used before any on-device encoder", async () => {
  const { buildResultVideo } = await import("../../app/resultVideo.ts");
  const bytes = new Uint8Array(1200);
  bytes.set([0, 0, 0, 32, 102, 116, 121, 112, 105, 115, 111, 109]);
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url).includes("/api/paid/result-video.mp4"), true);
    return new Response(bytes, { status: 200, headers: { "content-type": "video/mp4" } });
  };
  try {
    const blob = await buildResultVideo({ edition: "west", score: 9, referral: "abcd2345" });
    assert.equal(blob.type, "video/mp4");
    assert.equal(blob.size, bytes.length);
  } finally {
    globalThis.fetch = original;
  }
});
