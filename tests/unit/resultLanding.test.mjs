import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_SAFEGUARD } from "../../app/productSafeguards.ts";
import { validatePublicAppOrigin } from "../../app/publicAppOrigin.ts";
import { loadResultLanding } from "../../app/resultLandingServer.ts";
import { InMemoryGeneratedMediaStore, InMemoryResultPreviewRepository, ResultMediaService } from "../../db/resultMedia.ts";
import { ResultService } from "../../db/resultService.ts";

const now = Date.UTC(2026, 7, 24, 12); const slug = "8".repeat(48); const origin = validatePublicAppOrigin("https://brideprice.classesforculture.com", "production");
const record = Object.freeze({ id: "result_landing", publicSlug: slug, editionKey: "west", score: 12, total: 12, tier: 3, scoringVersion: "binary-exact-set-v1", safeAvatarId: "adjoa", reviewedDisplayName: null, safeguardVersion: "culture-score-v1", visibility: "public", state: "active", createdAt: now - 1, expiresAt: now + 1000 });
class Repo { storageAvailable = true; async getResultByPublicSlug(value) { return value === slug ? record : null; } }

test("landing uses an existing generated image without creating media on GET", async () => {
  const resultService = new ResultService(new Repo(), { now: () => now, publicOrigin: origin }); const repository = new InMemoryResultPreviewRepository(); const mediaService = new ResultMediaService(repository, new InMemoryGeneratedMediaStore()); const resolved = await resultService.getPublic(slug); await mediaService.prepare(resolved.internalResultId, resolved.data); const writes = repository.writeCount.save;
  const state = await loadResultLanding(slug, { enabled: true, resultService, mediaService }); assert.equal(state.kind, "active"); assert.equal(state.dynamicPreview, true); assert.equal(repository.writeCount.save, writes);
});

test("missing asset uses the honest static fallback and unavailable storage stays neutral", async () => {
  const resultService = new ResultService(new Repo(), { now: () => now, publicOrigin: origin }); const mediaService = new ResultMediaService(new InMemoryResultPreviewRepository(), new InMemoryGeneratedMediaStore());
  const missing = await loadResultLanding(slug, { enabled: true, resultService, mediaService }); assert.equal(missing.kind, "active"); assert.equal(missing.dynamicPreview, false); assert.equal(missing.previewUrl, "https://brideprice.classesforculture.com/og-v2.png");
  const unavailable = await loadResultLanding(slug, { enabled: true, resultService, mediaService: new ResultMediaService(new InMemoryResultPreviewRepository(false), new InMemoryGeneratedMediaStore(false)) }); assert.deepEqual(unavailable, { kind: "unavailable", message: "This result is no longer available.", previewUrl: "https://brideprice.classesforculture.com/og-v2.png" });
  assert.equal(PRODUCT_SAFEGUARD, "A playful culture score, never a measure of human worth.");
});
