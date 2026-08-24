import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_SAFEGUARD } from "../../app/productSafeguards.ts";
import { validatePublicAppOrigin } from "../../app/publicAppOrigin.ts";
import { ResultService } from "../../db/resultService.ts";

const now = Date.UTC(2026, 7, 24, 12); const slug = "8".repeat(48);
function record(overrides = {}) { return Object.freeze({ id: "result_public_review", publicSlug: slug, editionKey: "west", score: 9, total: 12, tier: 3, scoringVersion: "binary-exact-set-v1", safeAvatarId: "adjoa", reviewedDisplayName: "Never public", safeguardVersion: "culture-score-v1", visibility: "public", state: "active", createdAt: now - 1, expiresAt: now + 1000, ...overrides }); }
class Repo { storageAvailable = true; constructor(current) { this.current = current; this.reads = 0; } async getResultByPublicSlug(value) { this.reads += 1; return value === slug ? this.current : null; } }
const origin = validatePublicAppOrigin("https://brideprice.classesforculture.com", "production");

test("valid public result resolves to a privacy-safe approved view", async () => {
  const service = new ResultService(new Repo(record()), { now: () => now, publicOrigin: origin });
  const resolved = await service.getPublic(slug); assert.ok(resolved);
  const view = service.toView(resolved);
  assert.deepEqual(view, { resultSlug: slug, canonicalUrl: `https://brideprice.classesforculture.com/result/${slug}`, displayName: "A challenger", edition: "west", editionLabel: "West Africa", score: 9, total: 12, tier: 3, resultTitle: "Bride Price Royalty", masterySeal: "West Africa mastery", avatarId: "adjoa", avatarSrc: "/avatars/adjoa-v2.webp", safeguard: PRODUCT_SAFEGUARD });
  assert.doesNotMatch(JSON.stringify(view), /Never public|result_public_review|attempt|subject|photo|token/i);
});

test("private, expired, revoked, anonymized, deleted and missing results are indistinguishable", async () => {
  for (const current of [record({ visibility: "private" }), record({ expiresAt: now }), record({ state: "expired" }), record({ state: "revoked" }), record({ state: "anonymized" }), record({ state: "deleted" }), null]) {
    assert.equal(await new ResultService(new Repo(current), { now: () => now, publicOrigin: origin }).getPublic(slug), null);
  }
});

test("malformed, oversized, encoded, traversal and injection-shaped slugs are rejected before storage", async () => {
  for (const value of ["", "8".repeat(49), "8".repeat(47), "../private", "%2e%2e%2fprivate", "8".repeat(47) + "G", "' OR 1=1 --", null]) {
    const repo = new Repo(record()); const service = new ResultService(repo, { now: () => now, publicOrigin: origin });
    assert.equal(await service.getPublic(value), null); assert.equal(repo.reads, 0);
  }
});
