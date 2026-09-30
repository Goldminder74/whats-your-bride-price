import assert from "node:assert/strict";
import test from "node:test";
import { deriveAnonymousSubjectHash } from "../../app/anonymousSession.ts";
import { MINIMUM_RANDOM_QUICK_PLAY_BANK, RANDOM_QUICK_PLAY_POLICY_VERSION, selectQuestionSet, toPublicSelectedQuestion } from "../../db/questionSelection.ts";
import { QuestionSelectionService, validatePublicAnswerRequest, validatePublicRecoveryRequest } from "../../db/questionSelectionService.ts";

const now = Date.UTC(2026, 8, 9);
function question(index, overrides = {}) {
  return Object.freeze({
    internalId: `question_${index}`, editionId: "edition_west_v1", stableId: `west_random_${String(index).padStart(3, "0")}`,
    version: 1, region: "west", category: ["HISTORY", "FOOD", "MUSIC", "ART"][index % 4],
    difficulty: ["introductory", "intermediate", "advanced"][index % 3], questionKind: "single",
    questionText: `Reviewed question ${index}?`, visualStart: null,
    answerOptions: Object.freeze([0, 1, 2, 3].map((option) => Object.freeze({ id: `o${option + 1}`, text: `Choice ${option + 1}` }))),
    acceptedAnswers: Object.freeze([Object.freeze(["o2"])]), explanation: `Explanation ${index}.`, scoringWeight: 1,
    lifecycleStatus: "published", sourceReviewStatus: "approved", publishedAt: now - 1, retiredAt: null,
    validFrom: now - 1, validUntil: null, imageProvenance: Object.freeze([]), audioProvenance: Object.freeze([]), ...overrides,
  });
}
const deterministic = (value) => (bytes) => { bytes.fill(value); return bytes; };

test("ordinary Quick Play selects exactly twelve current regional questions and requires thirty eligible versions", async () => {
  const candidates = Array.from({ length: 34 }, (_, index) => question(index));
  const excluded = [
    question(40, { region: "east", editionId: "edition_east_v1", stableId: "east_random_040" }),
    question(41, { lifecycleStatus: "draft" }), question(42, { sourceReviewStatus: "pending" }),
    question(43, { retiredAt: now - 1 }), question(44, { validUntil: now }), question(45, { publishedAt: now + 1 }),
  ];
  const selection = await selectQuestionSet({ candidates: [...candidates, ...excluded], region: "west", now, minimumEligibleCount: MINIMUM_RANDOM_QUICK_PLAY_BANK, randomSource: deterministic(1) });
  assert.equal(selection.questions.length, 12);
  assert.equal(new Set(selection.questions.map((item) => item.stableId)).size, 12);
  assert.ok(selection.questions.every((item) => item.region === "west" && item.lifecycleStatus === "published" && item.sourceReviewStatus === "approved"));
  assert.equal(selection.selectionPolicyVersion, RANDOM_QUICK_PLAY_POLICY_VERSION);
  await assert.rejects(selectQuestionSet({ candidates: candidates.slice(0, 29), region: "west", now, minimumEligibleCount: 30, randomSource: deterministic(2) }), (error) => error.code === "insufficient_published_bank" && error.available === 29 && error.required === 30);
});

test("fresh seeds randomise question and option presentation while preserving semantically fixed order", async () => {
  const candidates = Array.from({ length: 50 }, (_, index) => question(index));
  candidates[0] = question(0, { questionText: "Which reviewed step comes first?" });
  const first = await selectQuestionSet({ candidates, region: "west", now, minimumEligibleCount: 30, randomSource: deterministic(3) });
  const retry = await selectQuestionSet({ candidates, region: "west", now, minimumEligibleCount: 30, randomSource: deterministic(3) });
  const next = await selectQuestionSet({ candidates, region: "west", now, minimumEligibleCount: 30, randomSource: deterministic(4) });
  assert.deepEqual(first.questions.map((item) => item.stableId), retry.questions.map((item) => item.stableId));
  assert.deepEqual(first.optionOrders, retry.optionOrders);
  assert.notDeepEqual({ questions: first.questions.map((item) => item.stableId), options: first.optionOrders }, { questions: next.questions.map((item) => item.stableId), options: next.optionOrders });
  const fixedIndex = first.questions.findIndex((item) => item.stableId === candidates[0].stableId);
  if (fixedIndex >= 0) assert.deepEqual(first.optionOrders[fixedIndex], ["o1", "o2", "o3", "o4"]);
  assert.match(first.seedReference, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(first.seedReference), /030303/);
});

test("recent twenty-four versions are avoided and exhausted banks prefer least-recently-seen versions", async () => {
  const candidates = Array.from({ length: 40 }, (_, index) => question(index));
  const recent = candidates.slice(0, 24).map(({ stableId, version }) => ({ stableId, version }));
  const selection = await selectQuestionSet({ candidates, region: "west", now, minimumEligibleCount: 30, recentQuestionVersions: recent, randomSource: deterministic(5) });
  assert.ok(selection.questions.every((item) => !recent.some((seen) => seen.stableId === item.stableId)));
  const exhausted = candidates.slice(0, 30);
  const newestFirst = exhausted.map(({ stableId, version }) => ({ stableId, version }));
  const fallback = await selectQuestionSet({ candidates: exhausted, region: "west", now, minimumEligibleCount: 30, recentQuestionVersions: newestFirst, randomSource: deterministic(6) });
  assert.ok(exhausted.slice(24).every((old) => fallback.questions.some((item) => item.stableId === old.stableId)));
});

class MemoryRepository {
  storageAvailable = true;
  candidates = Array.from({ length: 30 }, (_, index) => question(index));
  stored = null;
  creates = 0;
  async getCandidates() { return this.candidates; }
  async getRecentQuestionVersions() { return []; }
  async getAttemptByIdempotencyHash(_hash, owner, at) { return this.stored?.owner === owner && this.stored.expiresAt > at ? this.stored.value : null; }
  async getAttempt(id, owner, at) { return this.stored?.value.attemptId === id && this.stored.owner === owner && this.stored.expiresAt > at ? this.stored.value : null; }
  async createAttempt(input) {
    this.creates += 1;
    this.stored = { owner: input.anonymousSubjectHash, expiresAt: input.expiresAt, value: { attemptId: input.id, region: "west", expiresAt: input.expiresAt, selection: input.selection } };
    return true;
  }
  async judgeAttemptAnswer(id, owner, ref, selected, at) {
    const stored = await this.getAttempt(id, owner, at);
    const selectedQuestion = stored?.selection.questions.find((item) => item.stableId === ref);
    if (!selectedQuestion) return null;
    const normalized = [...selected].sort();
    return { correct: selectedQuestion.acceptedAnswers.some((set) => set.length === normalized.length && [...set].sort().every((item, index) => item === normalized[index])), correctOptionIds: selectedQuestion.acceptedAnswers[0], explanation: selectedQuestion.explanation };
  }
  async consumeRateLimit() { return "allowed"; }
}

test("start retries are idempotent, recovery is owner-bound and shuffled answers remain server-authoritative", async () => {
  const repository = new MemoryRepository();
  const service = new QuestionSelectionService(repository, { now: () => now, randomSource: deterministic(7) });
  const request = { region: "west", anonymousSessionCredential: "a".repeat(32), idempotencyKey: "quick-play-request-0001" };
  const first = await service.start(request);
  const retry = await service.start(request);
  assert.deepEqual(retry, first);
  assert.equal(repository.creates, 1);
  assert.deepEqual(await service.resume({ attemptId: first.attemptId, anonymousSessionCredential: request.anonymousSessionCredential }), first);
  await assert.rejects(service.resume({ attemptId: first.attemptId, anonymousSessionCredential: "b".repeat(32) }), /selection_attempt_unavailable/);
  const selected = first.questions[0];
  const judgement = await service.answer({ attemptId: first.attemptId, anonymousSessionCredential: request.anonymousSessionCredential, questionRef: selected.questionRef, selectedOptionIds: ["o2"] });
  assert.equal(judgement.correct, true);
  assert.doesNotMatch(JSON.stringify(first), /acceptedAnswers|correctOption|explanation|seedReference|internalId/);
  assert.equal(await deriveAnonymousSubjectHash(request.anonymousSessionCredential), repository.stored.owner);
});

test("public requests cannot choose selection authority or recover another shape", () => {
  const validRecovery = { attemptId: `attempt_${"a".repeat(48)}`, anonymousSessionCredential: "b".repeat(32) };
  assert.deepEqual(validatePublicRecoveryRequest(validRecovery), validRecovery);
  assert.throws(() => validatePublicRecoveryRequest({ ...validRecovery, seed: "controlled" }), /field_not_allowed/);
  const validAnswer = { ...validRecovery, questionRef: "west_random_001", selectedOptionIds: ["o1"] };
  assert.deepEqual(validatePublicAnswerRequest(validAnswer), validAnswer);
  for (const extra of [{ version: 1 }, { order: ["o1"] }, { correct: true }]) assert.throws(() => validatePublicAnswerRequest({ ...validAnswer, ...extra }), /field_not_allowed/);
});

test("public image presentation stays spoiler-proof after an option shuffle", () => {
  const image = question(4, { stableId: "west_q04", questionKind: "image", visualStart: 0,
    answerOptions: Object.freeze(["Jollof", "Injera", "Pilau", "Fufu"].map((text, index) => Object.freeze({ id: `o${index + 1}`, text }))) });
  const projection = toPublicSelectedQuestion(image, ["o4", "o2", "o1", "o3"]);
  assert.deepEqual(projection.options.map((option) => option.text), ["A", "B", "C", "D"]);
  assert.deepEqual(projection.imageAssets, ["/quiz-art/west-3.webp", "/quiz-art/west-1.webp", "/quiz-art/west-0.webp", "/quiz-art/west-2.webp"]);
  assert.doesNotMatch(JSON.stringify(projection), /jollof|injera|pilau|fufu|correct|answer/i);
});
