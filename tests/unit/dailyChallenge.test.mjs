import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  calculateStreak, DAILY_STREAK_RETENTION_MS, DailyChallengeService, deriveDailyOwnerHash,
  nextUtcChallengeBoundary, previousUtcDate, utcChallengeDate, validateDailyStartRequest,
} from "../../db/dailyChallenge.ts";
import { safeDailyRequest } from "../../app/dailyHttp.ts";
import {
  clearDailyOwnership, clearDailyRecovery, DAILY_OWNERSHIP_MAX_LIFETIME_MS, DAILY_OWNERSHIP_STORAGE_KEY,
  DAILY_RECOVERY_STORAGE_KEY, extendDailyOwnership, formatDailyCountdown, getOrCreateDailyOwnership,
  readDailyOwnership, readDailyOwnershipForClear, readDailyRecovery, writeDailyRecovery,
} from "../../app/dailyChallengeClient.ts";

const day = 86_400_000;
const credential = "01".repeat(16);
const otherCredential = "02".repeat(16);
const secret = "prompt-22-test-secret-is-at-least-thirty-two-bytes";

function selectable(index, overrides = {}) {
  return Object.freeze({
    internalId: `question_west_${index}`, editionId: "edition_west_v1", stableId: `west_q${String(index + 1).padStart(2, "0")}`,
    version: 1, region: "west", category: ["HISTORY", "LANGUAGE", "FOOD", "MUSIC"][index % 4],
    difficulty: ["introductory", "intermediate", "advanced"][index % 3], questionKind: "single",
    questionText: `Question ${index + 1}`, answerOptions: Object.freeze([{ id: "o1", text: "Correct" }, { id: "o2", text: "Other" }]),
    acceptedAnswers: Object.freeze([Object.freeze(["o1"])]), explanation: "Server-only explanation.", scoringWeight: 1,
    lifecycleStatus: "published", sourceReviewStatus: "approved", publishedAt: Date.UTC(2025, 0, 1), retiredAt: null,
    validFrom: null, validUntil: null, imageProvenance: Object.freeze([]), audioProvenance: Object.freeze([]), ...overrides,
  });
}

class MemoryRepository {
  storageAvailable = true;
  candidates = Array.from({ length: 12 }, (_, index) => selectable(index));
  dailies = new Map(); attempts = new Map(); keys = new Map(); results = new Map(); officials = new Map(); streaks = new Map();
  getCandidates(region) { return Promise.resolve(this.candidates.filter((item) => item.region === region && item.lifecycleStatus === "published")); }
  getDaily(region, date) { return Promise.resolve(this.dailies.get(`${region}:${date}`) || null); }
  getDailyById(id) { return Promise.resolve([...this.dailies.values()].find((item) => item.id === id) || null); }
  insertDaily(record) { const key = `${record.region}:${record.challengeDate}`; if (this.dailies.has(key)) return Promise.resolve(false); this.dailies.set(key, record); return Promise.resolve(true); }
  getQuestions(record) { const byRef = new Map(this.candidates.map((item) => [`${item.stableId}@${item.version}`, item])); return Promise.resolve(record.selectedQuestionVersions.map((item) => byRef.get(`${item.stableId}@${item.version}`)).filter(Boolean)); }
  getAttemptByIdempotencyHash(hash) { return Promise.resolve(this.attempts.get(this.keys.get(hash)) || null); }
  getAttempt(id) { return Promise.resolve(this.attempts.get(id) || null); }
  insertAttempt(record, hash) { if (this.keys.has(hash)) return Promise.resolve(false); this.attempts.set(record.id, record); this.keys.set(hash, record.id); return Promise.resolve(true); }
  getResultByAttempt(id) { return Promise.resolve(this.results.get(id) || null); }
  getOfficialCompletion(dailyId, ownerHash) { return Promise.resolve(this.officials.get(`${dailyId}:${ownerHash}`) || null); }
  async completeAtomically(record) {
    const officialKey = `${record.daily.id}:${record.ownerHash}`;
    if (this.results.has(record.attempt.id) || (record.attempt.mode === "official" && this.officials.has(officialKey))) return false;
    const completion = Object.freeze({ resultSlug: record.resultSlug, resultId: record.resultId, score: record.score, total: record.total, completedAt: record.completedAt });
    this.results.set(record.attempt.id, completion); this.attempts.set(record.attempt.id, Object.freeze({ ...record.attempt, status: "completed" }));
    if (record.attempt.mode === "official") {
      this.officials.set(officialKey, completion);
      if (record.streaksEnabled) {
        const key = `${record.ownerHash}:${record.daily.region}`;
        this.streaks.set(key, calculateStreak({ previous: this.streaks.get(key) || null, challengeDate: record.daily.challengeDate, completedAt: record.completedAt }));
      }
    }
    return true;
  }
  getStreak(ownerHash, region, now) { const value = this.streaks.get(`${ownerHash}:${region}`) || null; return Promise.resolve(value?.expiresAt > now ? value : null); }
  clearStreaks(ownerHash) { for (const key of this.streaks.keys()) if (key.startsWith(`${ownerHash}:`)) this.streaks.delete(key); return Promise.resolve(); }
  purgeExpiredStreaks(now, limit) { let count = 0; for (const [key, value] of this.streaks) if (value.expiresAt <= now && count < limit) { this.streaks.delete(key); count += 1; } return Promise.resolve(count); }
  consumeRateLimit() { return Promise.resolve("allowed"); }
}

function randomSource() { let value = 1; return (bytes) => { bytes.fill(value++ % 251); return bytes; }; }
function correctAnswers(selection) { return selection.questions.map((question) => ({ questionStableId: question.questionRef, selectedOptionIds: ["o1"] })); }

test("UTC dates, midnight, daylight-saving dates and leap dates are server-defined", () => {
  assert.equal(utcChallengeDate(Date.parse("2028-02-29T23:59:59.999Z")), "2028-02-29");
  assert.equal(utcChallengeDate(Date.parse("2028-03-01T00:00:00.000Z")), "2028-03-01");
  assert.equal(nextUtcChallengeBoundary(Date.parse("2026-03-29T00:30:00Z")), Date.parse("2026-03-30T00:00:00Z"));
  assert.equal(nextUtcChallengeBoundary(Date.parse("2026-10-25T01:30:00Z")), Date.parse("2026-10-26T00:00:00Z"));
  assert.equal(previousUtcDate("2028-03-01"), "2028-02-29");
});

test("daily generation is deterministic per region/day and idempotent per start key", async () => {
  let now = Date.parse("2026-09-06T12:00:00Z"); const repository = new MemoryRepository();
  const service = new DailyChallengeService(repository, { secret, streaksEnabled: true, now: () => now, randomSource: randomSource() });
  const request = { region: "west", mode: "official", anonymousSessionCredential: credential, idempotencyKey: "daily-request-0001" };
  const first = await service.start(request); const replay = await service.start(request);
  const other = await service.start({ ...request, anonymousSessionCredential: otherCredential, idempotencyKey: "daily-request-0002" });
  assert.equal(repository.dailies.size, 1); assert.equal(first.attemptId, replay.attemptId);
  assert.deepEqual(first.questions, other.questions); assert.equal(new Set(first.questions.map((item) => item.questionRef)).size, 12);
  assert.deepEqual(Object.keys(first.questions[0]).sort(), ["audioAssets", "imageAssets", "kind", "options", "questionRef", "text", "version"]);
  assert.doesNotMatch(JSON.stringify(first), /acceptedAnswers|correctAnswer|deterministicSeed|explanation|internalId/);
  now += day; const tomorrow = await service.start({ ...request, idempotencyKey: "daily-request-0003" });
  assert.equal(tomorrow.date, "2026-09-07"); assert.equal(repository.dailies.size, 2);
});

test("official completion is idempotent, practice never advances, and missing days reset current while preserving best", async () => {
  let now = Date.parse("2026-09-01T10:00:00Z"); const repository = new MemoryRepository();
  const service = new DailyChallengeService(repository, { secret, streaksEnabled: true, now: () => now, randomSource: randomSource() });
  const startOfficial = async (key) => service.start({ region: "west", mode: "official", anonymousSessionCredential: credential, idempotencyKey: key });
  const complete = async (selection) => service.complete({ attemptId: selection.attemptId, anonymousSessionCredential: credential, avatarId: "adjoa", answers: correctAnswers(selection) });
  const first = await startOfficial("official-day-0001"); const result = await complete(first); const retry = await complete(first);
  assert.equal(result.official, true); assert.equal(result.streak.current, 1); assert.deepEqual(retry, result);
  const practice = await service.start({ region: "west", mode: "practice", anonymousSessionCredential: credential, idempotencyKey: "practice-day-00001" });
  assert.equal((await complete(practice)).official, false); assert.equal((await repository.getStreak(await deriveDailyOwnerHash(credential), "west", now)).current, 1);
  now += day; assert.equal((await complete(await startOfficial("official-day-0002"))).streak.current, 2);
  now += 2 * day; const afterMiss = await complete(await startOfficial("official-day-0004"));
  assert.equal(afterMiss.streak.current, 1); assert.equal(afterMiss.streak.best, 2);
  assert.equal(afterMiss.streak.expiresAt, now + DAILY_STREAK_RETENTION_MS);
});

test("browser claims and stored hashes cannot establish daily authority", async () => {
  assert.throws(() => validateDailyStartRequest({ region: "west", mode: "official", anonymousSessionCredential: "a".repeat(64), idempotencyKey: "daily-request-0001" }), /daily_owner_invalid/);
  assert.throws(() => validateDailyStartRequest({ region: "west", mode: "official", anonymousSessionCredential: credential, idempotencyKey: "daily-request-0001", date: "2099-01-01" }), /field_not_allowed/);
  assert.equal((await deriveDailyOwnerHash(credential)).length, 64);
  const valid = new Request("https://example.com/daily/start", { method: "POST", headers: { origin: "https://example.com", "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" } });
  assert.equal(safeDailyRequest(valid), true);
  assert.equal(safeDailyRequest(new Request(valid.url, { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors" } })), false);
});

test("retired snapshots stay completable, incompatible scoring fails, and expiry starts a disconnected streak", async () => {
  let now = Date.parse("2026-09-06T10:00:00Z"); const repository = new MemoryRepository();
  const service = new DailyChallengeService(repository, { secret, streaksEnabled: true, now: () => now, randomSource: randomSource() });
  const request = { region: "west", mode: "official", anonymousSessionCredential: credential, idempotencyKey: "retired-snapshot-0001" };
  const selection = await service.start(request);
  repository.candidates = repository.candidates.map((item) => Object.freeze({ ...item, lifecycleStatus: "retired", retiredAt: now }));
  assert.equal((await service.complete({ attemptId: selection.attemptId, anonymousSessionCredential: credential, avatarId: "adjoa", answers: correctAnswers(selection) })).official, true);
  now += day;
  repository.candidates = repository.candidates.map((item) => Object.freeze({ ...item, lifecycleStatus: "published", retiredAt: null }));
  const incompatible = await service.start({ ...request, idempotencyKey: "incompatible-score-01" });
  const dailyKey = `west:${incompatible.date}`; repository.dailies.set(dailyKey, Object.freeze({ ...repository.dailies.get(dailyKey), scoringVersion: "other-scoring-v1" }));
  await assert.rejects(service.complete({ attemptId: incompatible.attemptId, anonymousSessionCredential: credential, avatarId: "adjoa", answers: correctAnswers(incompatible) }), /daily_incompatible/);
  const expired = calculateStreak({ previous: { current: 9, best: 12, lastDate: "2026-01-01", expiresAt: now }, challengeDate: "2026-09-07", completedAt: now });
  assert.equal(expired.current, 1); assert.equal(expired.best, 1); assert.equal(expired.expiresAt, now + DAILY_STREAK_RETENTION_MS);
});

test("clear and bounded expiry purge make streaks unavailable without replacement", async () => {
  const repository = new MemoryRepository(); const ownerHash = await deriveDailyOwnerHash(credential);
  repository.streaks.set(`${ownerHash}:west`, { current: 2, best: 4, lastDate: "2026-01-02", expiresAt: 100, milestone: "first-step", masterySeal: false });
  const service = new DailyChallengeService(repository, { secret, streaksEnabled: true, now: () => 1000, randomSource: randomSource() });
  assert.equal(await service.purgeExpiredStreaks(100, 1), 1); assert.equal(repository.streaks.size, 0);
  assert.deepEqual(await service.clearStreak({ anonymousSessionCredential: credential, idempotencyKey: "clear-streak-data-0001" }), { available: false });
  assert.equal(repository.streaks.size, 0);
});

test("recovery is expiry-bounded, preserves the original attempt key and clears only its own key", () => {
  const values = new Map([["unrelated", "keep"]]); const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const recovery = { version: 2, attemptId: `attempt_${"a".repeat(48)}`, startIdempotencyKey: "daily-request-0001", date: "2026-09-06", region: "west", mode: "official", questionRefs: Array.from({ length: 12 }, (_, i) => `west_q${i}`), answerOptionIds: [["o1"]], expiresAt: 2000 };
  assert.equal(writeDailyRecovery(storage, recovery), true); assert.equal(readDailyRecovery(storage, 1000).startIdempotencyKey, recovery.startIdempotencyKey);
  assert.equal(readDailyRecovery(storage, 2000), null); assert.equal(clearDailyRecovery(storage), true);
  assert.equal(values.has(DAILY_RECOVERY_STORAGE_KEY), false); assert.equal(values.get("unrelated"), "keep");
  assert.equal(formatDailyCountdown(3_661_000), "01:01:01");
});

test("daily ownership persists the existing credential and only official authority can extend its bounded lifetime", () => {
  const now = Date.parse("2026-09-06T12:00:00Z");
  const localValues = new Map([["unrelated", "keep"]]); const sessionValues = new Map();
  const storage = (values) => ({ getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) });
  const local = storage(localValues); const session = storage(sessionValues);
  const cryptoApi = { getRandomValues: (bytes) => { bytes.fill(7); return bytes; } };
  const first = getOrCreateDailyOwnership(local, session, now + day, cryptoApi, now);
  assert.equal(first.available, true); assert.equal(first.sessionId, "07".repeat(16));
  assert.equal(getOrCreateDailyOwnership(local, session, now + day, cryptoApi, now).sessionId, first.sessionId);
  assert.equal(extendDailyOwnership(local, first.sessionId, now + DAILY_OWNERSHIP_MAX_LIFETIME_MS, now), true);
  assert.equal(readDailyOwnership(local, now + day).sessionId, first.sessionId);
  assert.equal(extendDailyOwnership(local, first.sessionId, now + DAILY_OWNERSHIP_MAX_LIFETIME_MS + 1, now), false);
  assert.equal(readDailyOwnership(local, now + DAILY_OWNERSHIP_MAX_LIFETIME_MS).available, false);
  assert.equal(readDailyOwnershipForClear(local).sessionId, first.sessionId);
  assert.equal(clearDailyOwnership(local), true); assert.equal(localValues.has(DAILY_OWNERSHIP_STORAGE_KEY), false);
  assert.equal(localValues.get("unrelated"), "keep");
});

test("retention and accessibility sources prohibit unrelated extension and tracking", async () => {
  const [service, client, css, analytics] = await Promise.all([
    readFile(new URL("../../db/dailyChallenge.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/DailyChallengeClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/dailyChallenge.css", import.meta.url), "utf8"),
    readFile(new URL("../../app/AnalyticsConsent.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(service, /completedAt \+ DAILY_STREAK_RETENTION_MS/); assert.doesNotMatch(service, /analytics|marketing|fingerprint/i);
  assert.match(client, /role="timer"/); assert.match(client, /aria-live="polite"/); assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(analytics, /Clear my streak data/); assert.match(analytics, /readDailyOwnershipForClear/); assert.match(analytics, /clearDailyOwnership/); assert.doesNotMatch(analytics.match(/const clearStreak=[\s\S]*?\n\x20{2}};/)?.[0] || "", /emitAnalytics/);
});
