import assert from "node:assert/strict";
import test from "node:test";
import { deriveAnonymousSubjectHash } from "../../app/anonymousSession.ts";
import { validatePublicAppOrigin } from "../../app/publicAppOrigin.ts";
import { InMemoryChallengeRateLimiter } from "../../db/challengeService.ts";
import {
  ResultPublicationError,
  ResultPublicationService,
} from "../../db/resultPublication.ts";

const now = Date.UTC(2026, 7, 24, 12);
const slug = "a".repeat(48);
const sessionCredential = "01".repeat(16);
const subjectHash = await deriveAnonymousSubjectHash(sessionCredential);
const origin = validatePublicAppOrigin("http://127.0.0.1:3100", "test");

function record(overrides = {}) {
  return Object.freeze({
    id: "result_visibility_review",
    publicSlug: slug,
    editionKey: "west",
    score: 9,
    total: 12,
    tier: 3,
    scoringVersion: "binary-exact-set-v1",
    safeAvatarId: "adjoa",
    reviewedDisplayName: "Private name",
    safeguardVersion: "culture-score-v1",
    visibility: "private",
    state: "active",
    createdAt: now - 1000,
    expiresAt: now + 86_400_000,
    attemptStatus: "completed",
    attemptCompletedAt: now - 500,
    attemptExpiresAt: now + 86_400_000,
    anonymousSubjectHash: subjectHash,
    ...overrides,
  });
}

class MemoryRepository {
  storageAvailable = true;
  current = record();
  writes = [];
  async getOwnedResult(publicSlug) { return publicSlug === this.current.publicSlug ? this.current : null; }
  async setVisibility(input) {
    if (input.resultId !== this.current.id || input.anonymousSubjectHash !== this.current.anonymousSubjectHash) return null;
    this.writes.push(input);
    this.current = record({ ...this.current, visibility: input.visibility });
    return this.current;
  }
}

function service(repository = new MemoryRepository()) {
  return { repository, service: new ResultPublicationService(repository, new InMemoryChallengeRateLimiter(4), { now: () => now, publicOrigin: origin }) };
}

test("explicit owner publication is idempotent and exposes only the neutral public identity", async () => {
  const { repository, service: publication } = service();
  const first = await publication.setVisibility({ resultSlug: slug, anonymousSessionCredential: sessionCredential, action: "publish" });
  const second = await publication.setVisibility({ resultSlug: slug, anonymousSessionCredential: sessionCredential, action: "publish" });
  assert.equal(first.published, true);
  assert.equal(first.resultUrl, `http://127.0.0.1:3100/result/${slug}`);
  assert.equal(first.result.displayName, "A challenger");
  assert.equal(first.result.score, 9);
  assert.equal("reviewedDisplayName" in first.result, false);
  assert.equal(repository.writes.length, 1);
  assert.deepEqual(second, first);
});

test("owner unpublication is idempotent and removes the public projection immediately", async () => {
  const repository = new MemoryRepository();
  repository.current = record({ visibility: "public" });
  const { service: publication } = service(repository);
  const first = await publication.setVisibility({ resultSlug: slug, anonymousSessionCredential: sessionCredential, action: "unpublish" });
  const second = await publication.setVisibility({ resultSlug: slug, anonymousSessionCredential: sessionCredential, action: "unpublish" });
  assert.deepEqual(first, { published: false, visibility: "private", resultUrl: null, result: null });
  assert.deepEqual(second, first);
  assert.equal(repository.writes.length, 1);
});

test("unauthorised, incomplete, expired and inactive results share one neutral failure", async () => {
  for (const overrides of [
    { anonymousSubjectHash: "c".repeat(64) },
    { attemptStatus: "in_progress", attemptCompletedAt: null },
    { expiresAt: now },
    { state: "revoked" },
  ]) {
    const repository = new MemoryRepository();
    repository.current = record(overrides);
    const { service: publication } = service(repository);
    await assert.rejects(
      publication.setVisibility({ resultSlug: slug, anonymousSessionCredential: sessionCredential, action: "publish" }),
      (error) => error instanceof ResultPublicationError && error.publicMessage === "This result is no longer available.",
    );
    assert.equal(repository.writes.length, 0);
  }
});

test("publication rejects malformed inputs and unavailable rate limiting", async () => {
  const { service: publication } = service();
  await assert.rejects(publication.setVisibility({ resultSlug: "../secret", anonymousSessionCredential: sessionCredential, action: "publish" }), ResultPublicationError);
  await assert.rejects(publication.setVisibility({ resultSlug: slug, anonymousSessionCredential: "", action: "publish" }), ResultPublicationError);
  await assert.rejects(publication.setVisibility({ resultSlug: slug, anonymousSessionCredential: subjectHash, action: "publish" }), ResultPublicationError);
  const repository = new MemoryRepository();
  const unavailable = new ResultPublicationService(repository, new InMemoryChallengeRateLimiter(4, 60_000, false), { now: () => now, publicOrigin: origin });
  await assert.rejects(unavailable.setVisibility({ resultSlug: slug, anonymousSessionCredential: sessionCredential, action: "publish" }), (error) => error.code === "rate_limit_unavailable");
});

test("expired ownership credentials and copied stored hashes fail neutrally", async () => {
  for (const anonymousSessionCredential of [subjectHash, "02".repeat(16)]) {
    const { repository, service: publication } = service();
    await assert.rejects(
      publication.setVisibility({ resultSlug: slug, anonymousSessionCredential, action: "publish" }),
      (error) => error instanceof ResultPublicationError && error.publicMessage === "This result is no longer available.",
    );
    assert.equal(repository.writes.length, 0);
  }
  const repository = new MemoryRepository();
  repository.current = record({ attemptExpiresAt: now });
  const { service: publication } = service(repository);
  await assert.rejects(
    publication.setVisibility({ resultSlug: slug, anonymousSessionCredential: sessionCredential, action: "publish" }),
    (error) => error instanceof ResultPublicationError && error.publicMessage === "This result is no longer available.",
  );
  assert.equal(repository.writes.length, 0);
});
