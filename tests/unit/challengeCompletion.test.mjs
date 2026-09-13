import assert from "node:assert/strict";
import test from "node:test";
import {
  CHALLENGE_DIFFICULTY_POLICY,
  CHALLENGE_SCORING_WEIGHT_POLICY,
  ChallengeCompletionError,
  ChallengeCompletionService,
  compareResultCompatibility,
  comparisonOutcome,
  validateChallengeCompletionInput,
} from "../../db/challengeCompletion.ts";
import { regions } from "../../app/gameData.ts";
import { PRODUCT_SAFEGUARD } from "../../app/productSafeguards.ts";
import { QUESTION_SET_VERSION, SCORING_VERSION } from "../../db/seeds/development.ts";

const now = Date.UTC(2026, 7, 24, 12);
const code = "1".repeat(48);
const subject = "a".repeat(64);

function answers(correctCount = 12) {
  return regions.west.questions.map((question, index) => ({
    questionStableId: `west_q${String(index + 1).padStart(2, "0")}`,
    selectedOptionIds: index < correctCount
      ? question.correct.map((option) => `o${option + 1}`)
      : [`o${question.correct.includes(0) ? 2 : 1}`],
  }));
}

function authority(inviterScore = 10, overrides = {}) {
  return Object.freeze({
    challengeId: "challenge_review",
    publicCode: code,
    challengeAttemptId: "challenge_attempt_review",
    recipientAttemptId: "attempt_review",
    recipientSubjectHash: subject,
    editionId: "edition_west_v1",
    edition: "west",
    editionLabel: "West Africa",
    scoringVersion: SCORING_VERSION,
    questionSetVersion: QUESTION_SET_VERSION,
    questions: Object.freeze(regions.west.questions.map((question, index) => Object.freeze({
      id: `question_west_q${String(index + 1).padStart(2, "0")}_v1`,
      stableId: `west_q${String(index + 1).padStart(2, "0")}`,
      version: 1,
      optionIds: Object.freeze(question.options.map((_, option) => `o${option + 1}`)),
      correctOptionIds: Object.freeze(question.correct.map((option) => `o${option + 1}`)),
      scoringWeight: 1,
      difficulty: null,
    }))),
    inviterDisplayName: "Nia",
    inviterScore,
    inviterCompatibility: Object.freeze({
      edition: "west",
      scoringVersion: SCORING_VERSION,
      total: 12,
      questionSetVersion: QUESTION_SET_VERSION,
      scoringWeightPolicy: CHALLENGE_SCORING_WEIGHT_POLICY,
      difficultyPolicy: CHALLENGE_DIFFICULTY_POLICY,
      state: "active",
      expiresAt: now + 86_400_000,
    }),
    expiresAt: now + 86_400_000,
    ...overrides,
  });
}

class MemoryCompletionRepository {
  storageAvailable = true;
  official = null;
  acceptedAuthority = authority();
  records = [];
  failTransaction = false;
  async getOfficialCompletion() { return this.official; }
  async getAcceptedAuthority(publicCode, requestedSubject) {
    return publicCode === code && requestedSubject === subject ? this.acceptedAuthority : null;
  }
  async completeAtomically(record) {
    if (this.failTransaction) return { kind: "unavailable" };
    if (record.official && this.official) return { kind: "official-conflict", comparison: this.official };
    this.records.push(record);
    if (record.official) this.official = record.comparison;
    return { kind: "created", comparison: this.official || record.comparison };
  }
}

function service(repository = new MemoryCompletionRepository(), options = {}) {
  return new ChallengeCompletionService(repository, {
    now: () => now,
    randomSource(bytes) { bytes.fill(7); return bytes; },
    ...options,
  });
}

function input(correctCount = 12) {
  return {
    publicCode: code,
    idempotencyKey: "completion-key-000000000001",
    anonymousSubjectHash: subject,
    answers: answers(correctCount),
  };
}

async function rejectsCode(promise, codeValue) {
  await assert.rejects(promise, (error) => error instanceof ChallengeCompletionError && error.code === codeValue);
}

test("authoritative answer identifiers calculate win, tie, loss and exact difference", async () => {
  for (const [correct, expectedOutcome, expectedDifference] of [[12, "beat", 2], [10, "tied", 0], [8, "did_not_beat", -2]]) {
    const repository = new MemoryCompletionRepository();
    const comparison = await service(repository).complete(input(correct));
    assert.equal(comparison.recipientScore, correct);
    assert.equal(comparison.outcome, expectedOutcome);
    assert.equal(comparison.difference, expectedDifference);
    assert.equal(comparison.maximumScore, 12);
    assert.equal(comparison.safeguard, PRODUCT_SAFEGUARD);
  }
});

test("browser score, edition, scoring version, result and mastery claims are ignored", async () => {
  const repository = new MemoryCompletionRepository();
  const comparison = await service(repository).complete({
    ...input(7),
    score: 12,
    total: 99,
    edition: "south",
    scoringVersion: "forged-v9",
    resultId: "forged",
    mastery: true,
  });
  assert.equal(comparison.recipientScore, 7);
  assert.equal(comparison.maximumScore, 12);
  assert.equal(comparison.edition, "west");
  assert.equal(comparison.masterySealAwarded, false);
  assert.equal(repository.records[0].score, 7);
});

test("comparison compatibility centrally rejects every incompatible policy", () => {
  const recipient = authority().inviterCompatibility;
  assert.equal(compareResultCompatibility(recipient, recipient, now).compatible, true);
  for (const [field, value, reason] of [
    ["edition", "east", "edition"],
    ["scoringVersion", "future-v2", "scoring_version"],
    ["total", 11, "question_count"],
    ["scoringWeightPolicy", "weighted-v2", "scoring_weight_policy"],
    ["difficultyPolicy", "advanced-only", "difficulty_policy"],
    ["questionSetVersion", "future-set", "question_set"],
  ]) {
    assert.deepEqual(compareResultCompatibility({ ...recipient, [field]: value }, recipient, now), { compatible: false, reason });
  }
  assert.equal(compareResultCompatibility({ ...recipient, state: "removed" }, recipient, now).reason, "inviter_unavailable");
  assert.equal(compareResultCompatibility({ ...recipient, expiresAt: now }, recipient, now).reason, "inviter_unavailable");
  assert.equal(comparisonOutcome(3, 2), "beat");
});

test("removed or incompatible inviter preserves the recipient result with unavailable comparison", async () => {
  for (const inviterCompatibility of [null, { ...authority().inviterCompatibility, scoringVersion: "future-v2" }]) {
    const repository = new MemoryCompletionRepository();
    repository.acceptedAuthority = authority(10, { inviterCompatibility });
    const comparison = await service(repository).complete(input(9));
    assert.equal(comparison.recipientScore, 9);
    assert.equal(comparison.outcome, "unavailable");
    assert.equal(comparison.inviterScore, null);
  }
});

test("duplicate and concurrent completion return one official result", async () => {
  const repository = new MemoryCompletionRepository();
  const completion = service(repository);
  const [left, right] = await Promise.all([completion.complete(input(11)), completion.complete(input(11))]);
  assert.deepEqual(left, right);
  assert.equal(repository.records.filter((record) => record.official).length, 1);
  assert.deepEqual(await completion.complete({ ...input(3), idempotencyKey: "different-key-0000000001" }), left);
});

test("configured replay cannot replace the first official comparison", async () => {
  const repository = new MemoryCompletionRepository();
  const initial = await service(repository).complete(input(11));
  const replay = await service(repository, { allowReplay: true }).complete({ ...input(4), idempotencyKey: "replay-key-000000000001" });
  assert.deepEqual(replay, initial);
  assert.equal(repository.records.length, 2);
  assert.equal(repository.records[1].official, false);
  assert.equal(repository.official.recipientScore, 11);
});

test("mastery follows the existing 9+ rule and repository failures leave no public claim", async () => {
  const high = new MemoryCompletionRepository();
  assert.equal((await service(high).complete(input(9))).masterySealAwarded, true);
  const low = new MemoryCompletionRepository();
  assert.equal((await service(low).complete(input(8))).masterySealAwarded, false);
  const failed = new MemoryCompletionRepository();
  failed.failTransaction = true;
  await rejectsCode(service(failed).complete(input(9)), "completion_unavailable");
  assert.equal(failed.records.length, 0);
});

test("invalid subject, wrong owner and malformed answer identifiers fail closed", async () => {
  assert.throws(() => validateChallengeCompletionInput({ ...input(), anonymousSubjectHash: "A".repeat(64) }), /invalid_anonymous_subject/);
  await rejectsCode(service().complete({ ...input(), anonymousSubjectHash: "b".repeat(64) }), "challenge_attempt_unavailable");
  await rejectsCode(service().complete({ ...input(), answers: answers().slice(0, 11) }), "invalid_answers");
  await rejectsCode(service().complete({ ...input(), answers: answers().map((answer, index) => index ? answer : { ...answer, selectedOptionIds: ["o99"] }) }), "invalid_answers");
});

test("durable storage absence fails closed", async () => {
  const repository = new MemoryCompletionRepository();
  repository.storageAvailable = false;
  await rejectsCode(service(repository).complete(input()), "storage_unavailable");
});
