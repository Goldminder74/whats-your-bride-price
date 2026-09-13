import assert from "node:assert/strict";
import test from "node:test";
import { copyShareText, hasWebShare } from "../../app/shareSupport.ts";

test("detects Web Share support without assuming it exists", () => {
  assert.equal(hasWebShare({}), false);
  assert.equal(hasWebShare({ share: undefined }), false);
  assert.equal(hasWebShare({ share() {} }), true);
});

test("clipboard fallback reports copied, missing and blocked states", async () => {
  let copied = "";
  assert.equal(await copyShareText({ writeText: async (text) => { copied = text; } }, "safe link"), "copied");
  assert.equal(copied, "safe link");
  assert.equal(await copyShareText(undefined, "safe link"), "unavailable");
  assert.equal(await copyShareText({ writeText: async () => { throw new Error("blocked"); } }, "safe link"), "unavailable");
});
