import test from "node:test";
import assert from "node:assert/strict";
import {
  clearQuizRecovery,
  createQuizInstanceId,
  parseQuizRecovery,
  questionImageAssets,
  quizRecoveryLifetimeMs,
  quizRecoveryMaximumBytes,
  quizRecoverySessionKey,
  quizRecoveryStorageKey,
  readQuizRecovery,
  recoveryAnswerResults,
  writeQuizRecovery,
} from "../../app/quizRecovery.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const now = 1_800_000_000_000;
const recovery = {
  version: 1,
  instanceId: "12345678-1234-4123-8123-123456789012",
  edition: "west",
  avatarId: "amara",
  questionPosition: 2,
  answerChoices: [[1], [0]],
  updatedAt: now,
  attribution: { source: "whatsapp", nominated: true, utm_campaign: "roots_2026" },
};

test("versioned recovery accepts only minimal, compatible quiz fields", async () => {
  const parsed = parseQuizRecovery(JSON.stringify(recovery), recovery.instanceId, now);
  assert.ok(parsed);
  assert.equal(parsed.questionPosition, 2);
  assert.deepEqual(parsed.answerChoices, [[1], [0]]);
  assert.deepEqual(await recoveryAnswerResults(parsed), [1, 1]);
  assert.equal("name" in parsed, false);
  assert.equal("photo" in parsed, false);
  for (const prohibited of ["displayName", "anonymousSessionId", "imageBlob", "objectUrl", "filename", "score", "freeText", "secret"]) {
    assert.equal(prohibited in parsed, false);
  }
});

test("recovery rejects stale, corrupt, oversized, incompatible and cross-tab state", () => {
  assert.equal(parseQuizRecovery("not json", recovery.instanceId, now), null);
  assert.equal(parseQuizRecovery("x".repeat(quizRecoveryMaximumBytes + 1), recovery.instanceId, now), null);
  assert.equal(parseQuizRecovery(JSON.stringify(recovery), "another-tab-instance-123", now), null);
  assert.equal(parseQuizRecovery(JSON.stringify({ ...recovery, version: 2 }), recovery.instanceId, now), null);
  assert.equal(parseQuizRecovery(JSON.stringify({ ...recovery, updatedAt: now - quizRecoveryLifetimeMs - 1 }), recovery.instanceId, now), null);
  assert.equal(parseQuizRecovery(JSON.stringify({ ...recovery, answerChoices: [[99], [0]] }), recovery.instanceId, now), null);
  assert.equal(parseQuizRecovery(JSON.stringify({ ...recovery, attribution: { source: "evil", nominated: true } }), recovery.instanceId, now), null);
});

test("storage is tab-scoped, failure-safe and clearable", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  assert.equal(writeQuizRecovery(local, session, recovery), true);
  assert.equal(session.getItem(quizRecoverySessionKey), recovery.instanceId);
  assert.ok(local.getItem(quizRecoveryStorageKey));
  assert.equal(readQuizRecovery(local, session, now)?.edition, "west");

  const anotherTab = new MemoryStorage();
  assert.equal(readQuizRecovery(local, anotherTab, now), null);
  assert.equal(clearQuizRecovery(local, session), true);
  assert.equal(local.getItem(quizRecoveryStorageKey), null);
});

test("image answers are rechecked through server authority during recovery", async () => {
  const imageRecovery = { ...recovery, questionPosition: 4, answerChoices: [[1], [0], [0, 1, 2], [0]] };
  const parsed = parseQuizRecovery(JSON.stringify(imageRecovery), imageRecovery.instanceId, now);
  assert.ok(parsed);
  const requests = [];
  const results = await recoveryAnswerResults(parsed, async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return Response.json({ accepted: true, correct: true });
  });
  assert.deepEqual(results, [1, 1, 1, 1]);
  assert.deepEqual(requests, [{
    url: "/questions/image-answer",
    body: { questionStableId: "west_q04", selectedOptionIds: ["o1"] },
  }]);
});

test("only explicitly requested image-question assets are eligible for prefetch", () => {
  assert.deepEqual(questionImageAssets("west", [0, 1]), []);
  assert.deepEqual(questionImageAssets("west", [3]), [
    "/quiz-art/west-0.webp",
    "/quiz-art/west-1.webp",
    "/quiz-art/west-2.webp",
    "/quiz-art/west-3.webp",
  ]);
});

test("keeps the quiz playable by disabling recovery when secure randomness is unavailable", () => {
  assert.equal(createQuizInstanceId(null), null);
});

test("random recovery stores only its server-issued attempt reference and accepts shuffled indexes", () => {
  const random = { ...recovery, randomAttemptId: `attempt_${"a".repeat(48)}`, answerChoices: [[3], [2]], questionPosition: 2 };
  const parsed = parseQuizRecovery(JSON.stringify(random), random.instanceId, now);
  assert.equal(parsed?.randomAttemptId, random.randomAttemptId);
  assert.deepEqual(parsed?.answerChoices, [[3], [2]]);
  assert.equal(parseQuizRecovery(JSON.stringify({ ...random, randomAttemptId: "attempt_bad" }), random.instanceId, now), null);
  assert.equal(parseQuizRecovery(JSON.stringify({ ...random, answerChoices: [[10], [2]] }), random.instanceId, now), null);
});
