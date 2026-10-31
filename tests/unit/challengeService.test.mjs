import assert from "node:assert/strict";
import test from "node:test";
import {
  CHALLENGE_CREATION_COLLISION_LIMIT,
  CHALLENGE_RETENTION_MS,
  ChallengeService,
  ChallengeServiceError,
  InMemoryChallengeRateLimiter,
  toPublicChallengeProjection,
  validateChallengeIdempotencyKey,
} from "../../db/challengeService.ts";
import {
  createChallengeIdempotencyKey,
  resolveChallengeActionMode,
} from "../../app/challengeCreation.ts";
import { defaultFeatureFlags, resolveFeatureFlags } from "../../app/featureFlags.ts";
import { createChallengeUrl, validatePublicAppOrigin } from "../../app/publicAppOrigin.ts";

const now = Date.UTC(2026, 7, 24, 12);
const subjectA = "a".repeat(64);
const subjectB = "b".repeat(64);
const resultReferenceA = "c".repeat(48);
const resultReferenceB = "d".repeat(48);

function result(overrides = {}) {
  return Object.freeze({
    id: "result_synthetic_0001",
    publicSlug: resultReferenceA,
    editionId: "edition_west_v1",
    editionKey: "west",
    editionLabel: "West Africa",
    score: 9,
    total: 12,
    scoringVersion: "binary-exact-set-v1",
    safeAvatarId: "amara",
    reviewedDisplayName: "Ayo",
    resultState: "active",
    resultExpiresAt: now + CHALLENGE_RETENTION_MS,
    attemptStatus: "completed",
    attemptCompletedAt: now - 1000,
    anonymousSubjectHash: subjectA,
    ...overrides,
  });
}

class MemoryRepository {
  storageAvailable = true;
  results = new Map();
  challenges = new Map();
  forcedCollisions = 0;
  insertCalls = 0;

  constructor(results = [result()]) {
    for (const entry of results) this.results.set(entry.publicSlug, entry);
  }

  async getCompletedResultByReference(reference) { return this.results.get(reference) || null; }
  async getChallengeByIdempotencyHash(hash) {
    return [...this.challenges.values()].find((entry) => entry.creationIdempotencyKeyHash === hash) || null;
  }
  async getChallengeByPublicCode(code) { return this.challenges.get(code) || null; }
  async insertChallenge(record) {
    this.insertCalls += 1;
    const idempotent = await this.getChallengeByIdempotencyHash(record.creationIdempotencyKeyHash);
    if (idempotent) return { kind: "idempotency-conflict", record: idempotent };
    if (this.forcedCollisions > 0) {
      this.forcedCollisions -= 1;
      return { kind: "public-code-collision" };
    }
    if (this.challenges.has(record.publicCode)) return { kind: "public-code-collision" };
    if ([...this.challenges.values()].some((entry) => entry.revocationTokenHash === record.revocationTokenHash)) {
      return { kind: "revocation-hash-collision" };
    }
    if ([...this.challenges.values()].some((entry) => entry.id === record.id)) return { kind: "record-id-collision" };
    const authoritativeResult = [...this.results.values()].find((entry) => entry.id === record.inviterResultId);
    const stored = Object.freeze({
      id: record.id,
      publicCode: record.publicCode,
      inviterResultId: record.inviterResultId,
      inviterResultState: authoritativeResult?.resultState || null,
      inviterResultExpiresAt: authoritativeResult?.resultExpiresAt || null,
      anonymousSubjectHash: authoritativeResult?.anonymousSubjectHash || null,
      creationIdempotencyKeyHash: record.creationIdempotencyKeyHash,
      revocationTokenHash: record.revocationTokenHash,
      editionKey: authoritativeResult?.editionKey || "unknown",
      editionLabel: authoritativeResult?.editionLabel || "unknown",
      verifiedScoreToBeat: record.verifiedScoreToBeat,
      total: record.total,
      scoringVersion: record.scoringVersion,
      safeInviterAvatarId: record.safeInviterAvatarId,
      reviewedInviterName: record.reviewedInviterName,
      state: "active",
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      revokedAt: null,
    });
    this.challenges.set(record.publicCode, stored);
    return { kind: "created", record: stored };
  }
  async revokeChallenge(code, revokedAt) {
    const record = this.challenges.get(code);
    if (!record) return null;
    const revoked = Object.freeze({ ...record, state: "revoked", revokedAt });
    this.challenges.set(code, revoked);
    return revoked;
  }
}

function sequentialRandom() {
  let call = 1;
  return (bytes) => {
    bytes.fill(call % 256);
    call += 1;
    return bytes;
  };
}

function service(repository = new MemoryRepository(), options = {}, limiter = new InMemoryChallengeRateLimiter(20)) {
  return new ChallengeService(repository, limiter, {
    now: () => now,
    randomSource: sequentialRandom(),
    ...options,
  });
}

const createInput = Object.freeze({
  resultReference: resultReferenceA,
  idempotencyKey: "request-key-0000000000000001",
  anonymousSubjectHash: subjectA,
});

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof ChallengeServiceError && error.code === code);
}

test("creates from authoritative completed result and ignores any browser score or edition concept", async () => {
  const repository = new MemoryRepository();
  const response = await service(repository).create(createInput);
  assert.match(response.challenge.challengeCode, /^[0-9a-f]{48}$/);
  assert.equal(response.challenge.scoreToBeat, 9);
  assert.equal(response.challenge.maximumScore, 12);
  assert.equal(response.challenge.edition, "west");
  assert.equal(response.challenge.editionLabel, "West Africa");
  assert.equal(response.challenge.expiresAt - response.challenge.createdAt, CHALLENGE_RETENTION_MS);
  assert.equal(response.revocationTokenIssued, true);
  assert.match(response.revocationToken, /^[0-9a-f]{64}$/);
  assert.equal(response.challengeUrl, `https://brideprice.classesforculture.com/challenge/${response.challenge.challengeCode}`);
  const stored = repository.challenges.get(response.challenge.challengeCode);
  assert.match(stored.creationIdempotencyKeyHash, /^[0-9a-f]{64}$/);
  assert.match(stored.revocationTokenHash, /^[0-9a-f]{64}$/);
  assert.notEqual(stored.revocationTokenHash, response.revocationToken);
  assert.equal("photo" in response.challenge, false);
});

test("validated challenger aliases are applied only to the challenge projection", async () => {
  const repository = new MemoryRepository();
  const challengeService = service(repository);
  const created = await challengeService.create({ ...createInput, displayName: "  Ọlá  " });
  assert.equal(created.challenge.displayName, "Ọlá");
  assert.equal((await challengeService.getPublic(created.challenge.challengeCode)).displayName, "Ọlá");
  assert.equal(repository.results.get(resultReferenceA).reviewedDisplayName, "Ayo");

  const reused = await challengeService.create({ ...createInput, displayName: "Amina" });
  assert.equal(reused.challenge.challengeCode, created.challenge.challengeCode);
  assert.equal(reused.challenge.displayName, "Ọlá");
  assert.equal(repository.challenges.size, 1);
});

test("challenger aliases reject markup, hidden controls and oversized values", async () => {
  for (const displayName of ["<img src=x>", "A\u0000B", "a".repeat(31)]) {
    await rejectsCode(service().create({ ...createInput, displayName }), "invalid_display_name");
  }
});

test("refuses missing, incomplete, expired, revoked, malformed and wrong-subject results", async () => {
  const cases = [
    [[], "result_unavailable"],
    [[result({ attemptStatus: "in_progress", attemptCompletedAt: null })], "result_unavailable"],
    [[result({ resultExpiresAt: now })], "result_unavailable"],
    [[result({ resultState: "revoked" })], "result_unavailable"],
    [[result({ attemptCompletedAt: now + 1 })], "result_unavailable"],
    [[result({ score: 13 })], "result_malformed"],
    [[result({ total: 11 })], "result_malformed"],
    [[result({ scoringVersion: "unknown-v1" })], "result_malformed"],
    [[result({ safeAvatarId: "browser-avatar" })], "result_malformed"],
    [[result({ editionLabel: "Browser Africa" })], "result_malformed"],
  ];
  for (const [records, expected] of cases) {
    await rejectsCode(service(new MemoryRepository(records)).create(createInput), expected);
  }
  await rejectsCode(service().create({ ...createInput, anonymousSubjectHash: subjectB }), "result_unavailable");
});

test("challenge expiry never outlives its authoritative result", async () => {
  const resultExpiry = now + 60_000;
  const response = await service(new MemoryRepository([result({ resultExpiresAt: resultExpiry })])).create(createInput);
  assert.equal(response.challenge.expiresAt, resultExpiry);
});

test("idempotent repeated and concurrent creation returns one challenge and issues the private token once", async () => {
  const repository = new MemoryRepository();
  const challengeService = service(repository);
  const first = await challengeService.create(createInput);
  const second = await challengeService.create(createInput);
  assert.equal(second.challenge.challengeCode, first.challenge.challengeCode);
  assert.equal(second.revocationToken, null);
  assert.equal(second.revocationTokenIssued, false);
  assert.equal(repository.challenges.size, 1);

  const concurrentRepository = new MemoryRepository();
  const concurrentService = service(concurrentRepository);
  const [left, right] = await Promise.all([
    concurrentService.create({ ...createInput, idempotencyKey: "concurrent-key-0000000000001" }),
    concurrentService.create({ ...createInput, idempotencyKey: "concurrent-key-0000000000001" }),
  ]);
  assert.equal(left.challenge.challengeCode, right.challenge.challengeCode);
  assert.equal(concurrentRepository.challenges.size, 1);
  assert.equal([left, right].filter((entry) => entry.revocationTokenIssued).length, 1);
});

test("idempotency reuse for another result or subject is rejected", async () => {
  const secondResult = result({
    id: "result_synthetic_0002",
    publicSlug: resultReferenceB,
    anonymousSubjectHash: subjectB,
  });
  const repository = new MemoryRepository([result(), secondResult]);
  const challengeService = service(repository);
  await challengeService.create(createInput);
  await rejectsCode(challengeService.create({
    ...createInput,
    resultReference: resultReferenceB,
    anonymousSubjectHash: subjectB,
  }), "idempotency_reused");

  repository.results.set(resultReferenceB, result({
    id: "result_synthetic_0003",
    publicSlug: resultReferenceB,
    anonymousSubjectHash: subjectA,
  }));
  await rejectsCode(challengeService.create({ ...createInput, resultReference: resultReferenceB }), "idempotency_reused");
});

test("public-code collisions retry and collision exhaustion fails neutrally", async () => {
  const retryRepository = new MemoryRepository();
  retryRepository.forcedCollisions = 1;
  const created = await service(retryRepository).create(createInput);
  assert.match(created.challenge.challengeCode, /^[0-9a-f]{48}$/);
  assert.equal(retryRepository.insertCalls, 2);

  const exhaustedRepository = new MemoryRepository();
  exhaustedRepository.forcedCollisions = CHALLENGE_CREATION_COLLISION_LIMIT;
  await rejectsCode(service(exhaustedRepository).create(createInput), "collision_exhausted");
  assert.equal(exhaustedRepository.insertCalls, CHALLENGE_CREATION_COLLISION_LIMIT);
});

test("public projection is minimal, validated, injection-safe and reports expiry and revocation", async () => {
  const repository = new MemoryRepository();
  const challengeService = service(repository);
  const created = await challengeService.create(createInput);
  const projection = await challengeService.getPublic(created.challenge.challengeCode);
  assert.deepEqual(Object.keys(projection).sort(), [
    "avatarId", "challengeCode", "createdAt", "displayName", "edition", "editionLabel",
    "expiresAt", "maximumScore", "scoreToBeat", "status",
  ]);
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /result_synthetic|anonymous|idempotency|revocation|photo|session|email|user-agent/i);

  const stored = repository.challenges.get(created.challenge.challengeCode);
  assert.equal(toPublicChallengeProjection({ ...stored, expiresAt: now + 1 }, now + 1).status, "expired");
  assert.equal(toPublicChallengeProjection({ ...stored, state: "revoked" }, now).status, "revoked");
  assert.equal(toPublicChallengeProjection({ ...stored, inviterResultState: "deleted" }, now), null);
  assert.equal(toPublicChallengeProjection({ ...stored, inviterResultExpiresAt: now }, now), null);
  assert.equal(toPublicChallengeProjection({ ...stored, reviewedInviterName: "<script>alert(1)</script>" }, now), null);
  assert.equal(toPublicChallengeProjection({ ...stored, reviewedInviterName: null }, now).displayName, "A Most Excellent Player");
  assert.equal(await challengeService.getPublic("bad"), null);
});

test("revocation requires the private capability and historical null verifiers fail closed", async () => {
  const repository = new MemoryRepository();
  const challengeService = service(repository);
  const created = await challengeService.create(createInput);
  assert.equal(await challengeService.revoke({ publicCode: created.challenge.challengeCode, revocationToken: "0".repeat(64) }), null);
  assert.equal((await challengeService.getPublic(created.challenge.challengeCode)).status, "active");
  const revoked = await challengeService.revoke({
    publicCode: created.challenge.challengeCode,
    revocationToken: created.revocationToken,
  });
  assert.equal(revoked.status, "revoked");
  assert.equal((await challengeService.revoke({
    publicCode: created.challenge.challengeCode,
    revocationToken: created.revocationToken,
  })).status, "revoked");
  assert.equal(JSON.stringify(revoked).includes(created.revocationToken), false);

  const historicalCode = "e".repeat(48);
  repository.challenges.set(historicalCode, Object.freeze({
    ...repository.challenges.get(created.challenge.challengeCode),
    id: "challenge_historical_0001",
    publicCode: historicalCode,
    creationIdempotencyKeyHash: null,
    revocationTokenHash: null,
    state: "active",
    revokedAt: null,
  }));
  assert.equal(await challengeService.revoke({ publicCode: historicalCode, revocationToken: "0".repeat(64) }), null);
});

test("rate limiter allows a bounded window, refuses excess and fails closed when unavailable", async () => {
  const limiter = new InMemoryChallengeRateLimiter(1, 60_000);
  assert.equal(await limiter.consume({ anonymousSubjectHash: subjectA, now }), "allowed");
  assert.equal(await limiter.consume({ anonymousSubjectHash: subjectA, now: now + 1 }), "limited");
  assert.equal(await limiter.consume({ anonymousSubjectHash: subjectA, now: now + 60_001 }), "allowed");
  assert.equal(await new InMemoryChallengeRateLimiter(1, 60_000, false).consume({ anonymousSubjectHash: subjectA, now }), "unavailable");

  await rejectsCode(service(new MemoryRepository(), {}, { consume: async () => "limited" }).create(createInput), "rate_limited");
  await rejectsCode(service(new MemoryRepository(), {}, { consume: async () => "unavailable" }).create(createInput), "rate_limit_unavailable");
});

test("idempotency keys, public URLs and feature fallback remain strict", () => {
  assert.equal(validateChallengeIdempotencyKey("valid-key-0000000000000001"), "valid-key-0000000000000001");
  for (const invalid of ["", "short", "contains space 000000", "x".repeat(129)]) {
    assert.throws(() => validateChallengeIdempotencyKey(invalid), /invalid_idempotency_key/);
  }
  const key = createChallengeIdempotencyKey((bytes) => { bytes.fill(0xab); return bytes; });
  assert.equal(key, "ab".repeat(24));
  const challengeCode = "f".repeat(48);
  assert.equal(createChallengeUrl(challengeCode), `https://brideprice.classesforculture.com/challenge/${challengeCode}`);
  const localOrigin = validatePublicAppOrigin("http://127.0.0.1:3100", "test");
  assert.equal(createChallengeUrl(challengeCode, localOrigin), `http://127.0.0.1:3100/challenge/${challengeCode}`);
  assert.throws(() => createChallengeUrl("bad"), /challenge codes must be lowercase 192-bit/);

  assert.equal(defaultFeatureFlags.challenges, false);
  assert.equal(resolveFeatureFlags({}).challenges, false);
  assert.equal(resolveFeatureFlags({ challenges: "true", "?challenges": "true" }).challenges, false);
  assert.equal(resolveChallengeActionMode(false, { storageAvailable: true, create: async () => null }), "generic-nomination");
  assert.equal(resolveChallengeActionMode(true, undefined), "generic-nomination");
  assert.equal(resolveChallengeActionMode(true, { storageAvailable: false, create: async () => null }), "generic-nomination");
  assert.equal(resolveChallengeActionMode(true, { storageAvailable: true, create: async () => null }), "personalised");
});

test("creation responses and share-safe fields exclude private photos, raw keys and raw tokens", async () => {
  const response = await service().create(createInput);
  const publicAndUrl = JSON.stringify({ challenge: response.challenge, challengeUrl: response.challengeUrl });
  assert.doesNotMatch(publicAndUrl, /photo|blob|filename|idempotency|revocation|anonymous|session/i);
  assert.equal(publicAndUrl.includes(createInput.idempotencyKey), false);
  assert.equal(publicAndUrl.includes(response.revocationToken), false);
});
