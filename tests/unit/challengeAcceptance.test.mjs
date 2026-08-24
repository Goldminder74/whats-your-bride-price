import assert from "node:assert/strict";
import test from "node:test";
import {
  ChallengeAcceptanceError,
  ChallengeAcceptanceService,
  validateChallengeAcceptanceInput,
} from "../../db/challengeAcceptance.ts";
import { InMemoryChallengeRateLimiter } from "../../db/challengeService.ts";

const now = Date.UTC(2026, 7, 24, 12);
const code = "1".repeat(48);
const subjectA = "a".repeat(64);
const subjectB = "b".repeat(64);
const input = Object.freeze({
  publicCode: code,
  idempotencyKey: "acceptance-key-000000000001",
  anonymousSubjectHash: subjectA,
});

class MemoryAcceptanceRepository {
  storageAvailable = true;
  active = true;
  byHash = new Map();
  insertCalls = 0;
  collisionCount = 0;
  async getActiveChallenge(publicCode) {
    if (!this.active || publicCode !== code) return null;
    return Object.freeze({
      id: "challenge_internal_review",
      publicCode: code,
      editionId: "edition_west_v1",
      editionKey: "west",
      editionLabel: "West Africa",
      scoringVersion: "binary-exact-set-v1",
      total: 12,
      expiresAt: now + 86_400_000,
    });
  }
  async getAcceptanceByIdempotencyHash(hash) { return this.byHash.get(hash) || null; }
  async insertAcceptance(record) {
    this.insertCalls += 1;
    const existing = this.byHash.get(record.acceptanceIdempotencyHash);
    if (existing) return { kind: "idempotency-conflict", record: existing };
    if (this.collisionCount > 0) {
      this.collisionCount -= 1;
      return { kind: "collision" };
    }
    const stored = Object.freeze({
      challengePublicCode: record.challengePublicCode,
      anonymousSubjectHash: record.anonymousSubjectHash,
      editionKey: "west",
      editionLabel: "West Africa",
      state: "accepted",
      expiresAt: record.expiresAt,
    });
    this.byHash.set(record.acceptanceIdempotencyHash, stored);
    return { kind: "created", record: stored };
  }
}

function randomSource(bytes) { bytes.fill(7); return bytes; }
function service(repository = new MemoryAcceptanceRepository(), limiter = new InMemoryChallengeRateLimiter(20)) {
  return new ChallengeAcceptanceService(repository, limiter, { now: () => now, randomSource });
}
async function rejectsCode(promise, expected) {
  await assert.rejects(promise, (error) => error instanceof ChallengeAcceptanceError && error.code === expected);
}

test("accepts only strict public inputs and returns a minimal public response", async () => {
  assert.deepEqual(validateChallengeAcceptanceInput(input), input);
  for (const candidate of ["A".repeat(48), `${code}0`, "../challenge", "%2e%2e", "<script>"]) {
    assert.throws(() => validateChallengeAcceptanceInput({ ...input, publicCode: candidate }), /invalid_challenge_code/);
  }
  assert.throws(() => validateChallengeAcceptanceInput({ ...input, anonymousSubjectHash: "A".repeat(64) }), /invalid_anonymous_subject/);
  const response = await service().accept(input);
  assert.deepEqual(response, {
    challengeCode: code,
    edition: "west",
    editionLabel: "West Africa",
    accepted: true,
    reused: false,
  });
  assert.doesNotMatch(JSON.stringify(response), /internal|subject|idempotency|attempt|session|photo|token|hash/i);
});

test("repeated and concurrent acceptance is idempotent and wrong-subject reuse is rejected", async () => {
  const repository = new MemoryAcceptanceRepository();
  const acceptance = service(repository);
  const [first, second] = await Promise.all([acceptance.accept(input), acceptance.accept(input)]);
  assert.equal(first.challengeCode, second.challengeCode);
  assert.equal([first, second].filter((result) => result.reused === false).length, 1);
  assert.equal(repository.byHash.size, 1);
  assert.equal((await acceptance.accept(input)).reused, true);
  await rejectsCode(acceptance.accept({ ...input, anonymousSubjectHash: subjectB }), "acceptance_idempotency_reused");
});

test("fails closed for unavailable storage, abuse protection and stale challenge authority", async () => {
  const unavailable = new MemoryAcceptanceRepository();
  unavailable.storageAvailable = false;
  await rejectsCode(service(unavailable).accept(input), "storage_unavailable");

  const stale = new MemoryAcceptanceRepository();
  stale.active = false;
  await rejectsCode(service(stale).accept(input), "challenge_unavailable");

  const limiter = { async consume() { return "unavailable"; } };
  await rejectsCode(service(new MemoryAcceptanceRepository(), limiter).accept(input), "rate_limit_unavailable");
});

test("collision handling retries without leaking internal identifiers", async () => {
  const repository = new MemoryAcceptanceRepository();
  repository.collisionCount = 1;
  const result = await service(repository).accept(input);
  assert.equal(result.accepted, true);
  assert.equal(repository.insertCalls, 2);
});
