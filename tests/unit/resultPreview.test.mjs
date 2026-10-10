import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PRODUCT_SAFEGUARD } from "../../app/productSafeguards.ts";
import {
  RESULT_PREVIEW_HEIGHT,
  RESULT_PREVIEW_MAX_BYTES,
  RESULT_PREVIEW_MIME,
  RESULT_PREVIEW_WIDTH,
  approvedResultPreviewArtwork,
  renderResultPreview,
} from "../../app/resultPreview.ts";

const now = Date.UTC(2026, 7, 24, 12);
function result(overrides = {}) {
  return Object.freeze({ resultSlug: "8".repeat(48), edition: "west", score: 12, total: 12, tier: 3, safeAvatarId: "adjoa", scoringVersion: "binary-exact-set-v1", safeguard: PRODUCT_SAFEGUARD, createdAt: now, expiresAt: now + 1000, displayName: "A challenger", ...overrides });
}
function pngDimensions(bytes) { return { width: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16), height: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(20) }; }

test("result previews are deterministic bounded 1200 by 630 PNG assets", async () => {
  const first = await renderResultPreview(result());
  const second = await renderResultPreview(result());
  assert.equal(RESULT_PREVIEW_MAX_BYTES, 1_000_000);
  assert.equal(first.mimeType, RESULT_PREVIEW_MIME);
  assert.deepEqual(pngDimensions(first.bytes), { width: RESULT_PREVIEW_WIDTH, height: RESULT_PREVIEW_HEIGHT });
  assert.ok(first.bytes.length > 1000 && first.bytes.length <= RESULT_PREVIEW_MAX_BYTES);
  assert.ok(first.bytes.length < 500_000, `preferred preview budget exceeded: ${first.bytes.length} bytes`);
  assert.equal(first.contentHash, second.contentHash);
  assert.deepEqual(first.bytes, second.bytes);
  assert.match(first.objectKey, /^generated\/west\/2026\/08\/[0-9a-f]{64}-vog1\.png$/);
  assert.equal(first.contract.safeguard, PRODUCT_SAFEGUARD);
  assert.equal(first.contract.displayName, "A challenger");
});

test("different scores and editions produce technically and visibly distinct contracts", async () => {
  const west = await renderResultPreview(result());
  const lower = await renderResultPreview(result({ score: 8, tier: 2 }));
  const east = await renderResultPreview(result({ resultSlug: "9".repeat(48), edition: "east", score: 8, tier: 2, safeAvatarId: "wanjiku" }));
  assert.ok(west.bytes.length <= 1_000_000 && lower.bytes.length <= 1_000_000 && east.bytes.length <= 1_000_000);
  assert.notEqual(west.contentHash, lower.contentHash);
  assert.notEqual(lower.contentHash, east.contentHash);
  assert.notDeepEqual(west.bytes, lower.bytes);
  assert.notDeepEqual(lower.bytes, east.bytes);
  assert.equal(west.contract.artwork, "woven-diamond");
  assert.equal(east.contract.artwork, "horizon-wave");
  assert.equal(new Set(Object.values(approvedResultPreviewArtwork)).size, 5);
});

test("visually identical public results retain distinct immutable media identities", async () => {
  const first = await renderResultPreview(result());
  const second = await renderResultPreview(result({ resultSlug: "7".repeat(48) }));
  assert.notEqual(first.contentHash, second.contentHash);
  assert.notEqual(first.objectKey, second.objectKey);
});

test("preview contracts reject names, photos, unapproved avatars and malformed data", async () => {
  await assert.rejects(renderResultPreview(result({ displayName: "<script>alert(1)</script>" })), /unsafe_result_preview_contract/);
  await assert.rejects(renderResultPreview(result({ displayName: "Ọlá" })), /unsafe_result_preview_contract/);
  await assert.rejects(renderResultPreview(result({ safeAvatarId: "https://attacker.example/photo.svg" })), /unsafe_result_preview_contract/);
  await assert.rejects(renderResultPreview(result({ safeAvatarId: "../../private-photo" })), /unsafe_result_preview_contract/);
  await assert.rejects(renderResultPreview(result({ score: 99 })), /unsafe_result_preview_contract/);
  const source = await readFile(new URL("../../app/resultPreview.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\s*\(|https?:\/\/|<svg|foreignObject|privatePhoto|portraitUrl/);
});
