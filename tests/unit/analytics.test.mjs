import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVE_ANALYTICS_EVENT_NAMES,
  ANALYTICS_EVENT_ROUTING,
  RESERVED_COMMERCE_EVENT_NAMES,
  SHARE_EVENT_NAMES,
  REFERRAL_EVENT_NAMES,
  AnalyticsValidationError,
  eventDestination,
  validateIngestibleEventName,
} from "../../db/analyticsContracts.ts";
import {
  ANALYTICS_MAX_BATCH_SIZE,
  ANALYTICS_NOTICE_VERSION,
  ANALYTICS_RAW_RETENTION_MS,
  AnalyticsService,
  InMemoryAnalyticsRateLimiter,
  InMemoryAnalyticsRepository,
  UnavailableAnalyticsRateLimiter,
  calculateAnalyticsFunnels,
  deriveAnalyticsSessionHash,
  validateAnalyticsBatch,
  validateAnalyticsClientEvent,
  validateAnalyticsProperties,
} from "../../db/analytics.ts";
import {
  ANALYTICS_CONSENT_LIFETIME_MS,
  ANALYTICS_CONSENT_NOTICE_VERSION,
  ANALYTICS_CONSENT_STORAGE_KEY,
  ANALYTICS_SEEN_STORAGE_KEY,
  ANALYTICS_SESSION_STORAGE_KEY,
  clearAnalyticsSession,
  getOrCreateAnalyticsSession,
  parseAnalyticsConsentPreference,
  readAnalyticsConsentPreference,
  readSeenAnalyticsKeys,
  rememberSeenAnalyticsKey,
  writeAnalyticsConsentPreference,
} from "../../app/analyticsPreference.ts";
import { assertFirstPartyAnalyticsStorage, defaultFeatureFlags, resolveFeatureFlags } from "../../app/featureFlags.ts";

const now = 1_800_000_000_000;
const credential = "ab".repeat(16);
const uuid = (suffix = "000000000000") => `123e4567-e89b-42d3-a456-${suffix}`;
const clientEvent = (name, overrides = {}) => ({
  name,
  eventSchemaVersion: 1,
  consentNoticeVersion: ANALYTICS_NOTICE_VERSION,
  clientEventUuid: uuid(),
  occurredAt: now,
  properties: {},
  ...overrides,
});

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    calls,
    getItem(key) { calls.push(["get", key]); return values.get(key) ?? null; },
    setItem(key, value) { calls.push(["set", key]); values.set(key, value); },
    removeItem(key) { calls.push(["remove", key]); values.delete(key); },
    value(key) { return values.get(key) ?? null; },
  };
}

function errorCode(callback) {
  assert.throws(callback, (error) => error instanceof AnalyticsValidationError && Boolean(error.code));
}

test("analytics is build-time gated, false by default and fails closed without approved D1 readiness", () => {
  assert.equal(defaultFeatureFlags.first_party_analytics, false);
  assert.equal(resolveFeatureFlags({}).first_party_analytics, false);
  assert.equal(resolveFeatureFlags({ WYBP_FEATURE_FIRST_PARTY_ANALYTICS: "true" }).first_party_analytics, true);
  assert.throws(() => assertFirstPartyAnalyticsStorage(resolveFeatureFlags({ WYBP_FEATURE_FIRST_PARTY_ANALYTICS: "true" }), { d1Configured: false, authorisedReviewFixtures: false }), /requires an approved D1 binding/i);
  assert.doesNotThrow(() => assertFirstPartyAnalyticsStorage(defaultFeatureFlags, { d1Configured: false, authorisedReviewFixtures: false }));
});

test("central event dictionary is exact, reserved commerce is inactive and every event has one deterministic route", () => {
  assert.equal(ACTIVE_ANALYTICS_EVENT_NAMES.length, 33);
  assert.deepEqual(RESERVED_COMMERCE_EVENT_NAMES, ["offer_view", "checkout_start", "checkout_complete", "purchase_complete", "payment_failed", "refund_complete"]);
  assert.deepEqual(Object.keys(ANALYTICS_EVENT_ROUTING), [...ACTIVE_ANALYTICS_EVENT_NAMES]);
  for (const name of ACTIVE_ANALYTICS_EVENT_NAMES) assert.equal(eventDestination(name), ANALYTICS_EVENT_ROUTING[name]);
  for (const name of REFERRAL_EVENT_NAMES) assert.equal(eventDestination(name), "referral_events");
  for (const name of SHARE_EVENT_NAMES) assert.equal(eventDestination(name), "share_events");
  for (const name of RESERVED_COMMERCE_EVENT_NAMES) errorCode(() => validateIngestibleEventName(name));
  errorCode(() => validateIngestibleEventName("purchase_delivered"));
  errorCode(() => validateIngestibleEventName("consent_reject"));
});

test("payload validation allows only controlled enums and rejects identifiers, free text, URLs, answers and oversized data", () => {
  assert.deepEqual(validateAnalyticsProperties({ edition: "west", surface: "quiz", scoreBand: "strong", maximumScoreVersion: "12-v1", referred: false }), {
    edition: "west", surface: "quiz", scoreBand: "strong", maximumScoreVersion: "12-v1", referred: false,
  });
  for (const forbidden of ["name", "displayName", "photo", "answers", "freeText", "email", "phone", "url", "referrer", "query", "challengeCode", "credential", "hash", "token", "idempotencyKey", "internalId", "ip", "userAgent"]) {
    errorCode(() => validateAnalyticsProperties({ [forbidden]: "private" }));
  }
  errorCode(() => validateAnalyticsProperties({ edition: "world" }));
  errorCode(() => validateAnalyticsProperties({ surface: "checkout" }));
  errorCode(() => validateAnalyticsProperties({ channel: "email" }));
  errorCode(() => validateAnalyticsProperties({ nominationSlot: 4 }));
  errorCode(() => validateAnalyticsProperties({ unknown: "x".repeat(3_000) }));
  errorCode(() => validateAnalyticsClientEvent({ ...clientEvent("app_visit"), extra: true }, now));
  errorCode(() => validateAnalyticsClientEvent({ ...clientEvent("app_visit"), clientEventUuid: "not-a-uuid" }, now));
  errorCode(() => validateAnalyticsClientEvent({ ...clientEvent("app_visit"), occurredAt: now - 11 * 60_000 }, now));
});

test("referral codes are transport-only, required only for referral events and batches are strictly bounded", () => {
  const referral = validateAnalyticsClientEvent(clientEvent("referred_visit", {
    referralChallengeCode: "1".repeat(48),
    properties: { source: "challenge", campaign: "challenge", referred: true },
  }), now);
  assert.equal(referral.referralChallengeCode, "1".repeat(48));
  errorCode(() => validateAnalyticsClientEvent(clientEvent("referred_visit", { properties: { source: "challenge" } }), now));
  errorCode(() => validateAnalyticsClientEvent(clientEvent("app_visit", { referralChallengeCode: "1".repeat(48) }), now));
  errorCode(() => validateAnalyticsBatch([], now));
  errorCode(() => validateAnalyticsBatch(Array.from({ length: ANALYTICS_MAX_BATCH_SIZE + 1 }, (_, index) => clientEvent("app_visit", { clientEventUuid: uuid(String(index).padStart(12, "0")) })), now));
  errorCode(() => validateAnalyticsBatch([clientEvent("app_visit"), clientEvent("quiz_start")], now));
});

test("consent preference is the only pre-consent storage, is strict, versioned, expiring and independent", () => {
  const storage = memoryStorage();
  assert.equal(readAnalyticsConsentPreference(storage, now), null);
  assert.deepEqual(storage.calls, [["get", ANALYTICS_CONSENT_STORAGE_KEY], ["remove", ANALYTICS_CONSENT_STORAGE_KEY]]);
  assert.equal(storage.calls.some(([, key]) => key === ANALYTICS_SESSION_STORAGE_KEY || key === ANALYTICS_SEEN_STORAGE_KEY), false);
  const accepted = writeAnalyticsConsentPreference(storage, "accepted", now);
  assert.equal(accepted.noticeVersion, ANALYTICS_CONSENT_NOTICE_VERSION);
  assert.equal(accepted.expiresAt - accepted.decidedAt, ANALYTICS_CONSENT_LIFETIME_MS);
  assert.equal(readAnalyticsConsentPreference(storage, now + 1)?.choice, "accepted");
  assert.equal(readAnalyticsConsentPreference(storage, accepted.expiresAt), null);
  assert.equal(parseAnalyticsConsentPreference(JSON.stringify({ ...accepted, noticeVersion: "old-notice" }), now), null);
  assert.equal(parseAnalyticsConsentPreference(JSON.stringify({ ...accepted, marketing: true }), now), null);
  assert.equal(parseAnalyticsConsentPreference(`{"padding":"${"x".repeat(500)}"}`, now), null);
});

test("analytics session is generated only on demand after consent, lasts 24 hours and clears with dedupe state", () => {
  const storage = memoryStorage();
  let randomCalls = 0;
  const cryptoApi = { getRandomValues(bytes) { randomCalls += 1; bytes.fill(17); return bytes; } };
  assert.equal(storage.value(ANALYTICS_SESSION_STORAGE_KEY), null);
  const session = getOrCreateAnalyticsSession(storage, cryptoApi, now);
  assert.equal(randomCalls, 1); assert.equal(session.credential, "11".repeat(16)); assert.equal(session.expiresAt - session.createdAt, 24 * 60 * 60 * 1000);
  assert.equal(getOrCreateAnalyticsSession(storage, cryptoApi, now + 1).credential, session.credential); assert.equal(randomCalls, 1);
  const seen = readSeenAnalyticsKeys(storage); rememberSeenAnalyticsKey(storage, seen, "referred_visit"); assert.deepEqual([...readSeenAnalyticsKeys(storage)], ["referred_visit"]);
  clearAnalyticsSession(storage); assert.equal(storage.value(ANALYTICS_SESSION_STORAGE_KEY), null); assert.equal(storage.value(ANALYTICS_SEEN_STORAGE_KEY), null);
});

test("server derives a domain-separated hash and service requires consent, rate limiting and available storage", async () => {
  const hash = await deriveAnalyticsSessionHash(credential);
  assert.match(hash, /^[0-9a-f]{64}$/); assert.notEqual(hash, credential); assert.equal(await deriveAnalyticsSessionHash(credential), hash);
  const repository = new InMemoryAnalyticsRepository();
  const service = new AnalyticsService(repository, new InMemoryAnalyticsRateLimiter(), () => now);
  await assert.rejects(() => service.ingest(credential, [clientEvent("app_visit")]), (error) => error.code === "analytics_consent_invalid");
  await service.accept(credential, clientEvent("consent_accept"));
  assert.equal(repository.consent.has(hash), true);
  await assert.rejects(() => new AnalyticsService(repository, new UnavailableAnalyticsRateLimiter(), () => now).ingest(credential, [clientEvent("app_visit", { clientEventUuid: uuid("000000000001") })]), (error) => error.code === "analytics_rate_limit_unavailable");
  const unavailable = Object.assign(Object.create(repository), { storageAvailable: false });
  await assert.rejects(() => new AnalyticsService(unavailable, new InMemoryAnalyticsRateLimiter(), () => now).ingest(credential, [clientEvent("app_visit", { clientEventUuid: uuid("000000000002") })]), (error) => error.code === "analytics_storage_unavailable");
});

test("repository routing is idempotent, referral codes are discarded, retention is bounded and withdrawal erases session rows", async () => {
  const repository = new InMemoryAnalyticsRepository(); repository.challenges.set("1".repeat(48), "internal_challenge_1");
  const service = new AnalyticsService(repository, new InMemoryAnalyticsRateLimiter(), () => now);
  await service.accept(credential, clientEvent("consent_accept"));
  const events = [
    clientEvent("app_visit", { clientEventUuid: uuid("000000000010") }),
    clientEvent("referred_visit", { clientEventUuid: uuid("000000000011"), referralChallengeCode: "1".repeat(48), properties: { source: "challenge", campaign: "challenge", referred: true } }),
    clientEvent("share_handoff", { clientEventUuid: uuid("000000000012"), properties: { surface: "share_centre", channel: "copy" } }),
  ];
  assert.equal((await service.ingest(credential, events)).stored, 3);
  assert.equal((await service.ingest(credential, events)).stored, 0);
  const stored = [...repository.events.values()].filter((event) => event.name !== "consent_accept");
  assert.deepEqual(stored.map(({ destination }) => destination), ["analytics_events", "referral_events", "share_events"]);
  assert.equal(stored[1].challengeId, "internal_challenge_1"); assert.doesNotMatch(JSON.stringify(stored), /111111111111111111111111111111111111111111111111/);
  assert.ok(stored.every((item) => item.expiresAt - item.occurredAt === ANALYTICS_RAW_RETENTION_MS));
  await assert.rejects(() => repository.retainExpired(now + ANALYTICS_RAW_RETENTION_MS + 1, 500, false), (error) => error.code === "retention_not_authorized");
  assert.equal(await repository.retainExpired(now + ANALYTICS_RAW_RETENTION_MS + 1, 1, true), 1);
  await service.withdraw(credential); assert.equal(repository.consent.size, 0); assert.equal(repository.events.size, 0);
});

test("funnel calculations return numerator, denominator, safe rates and the reviewed viral target", () => {
  const report = calculateAnalyticsFunnels({
    app_visit: 100, quiz_start: 50, quiz_complete: 20, share_intent: 15, share_handoff: 10,
    nomination_share_handoff: 50, referred_visit: 100, referred_quiz_start: 45,
    challenge_view: 40, challenge_accept: 20, challenge_complete: 10,
    story_video_open: 10, story_video_render_complete: 8, story_video_share_handoff: 4,
  });
  assert.equal(report.basis, "consented_measured_traffic");
  assert.deepEqual(report.visitToStart, { numerator: 50, denominator: 100, rate: 0.5 });
  assert.deepEqual(report.nominationHandoffsPerCompletion, { numerator: 50, denominator: 20, rate: 2.5 });
  assert.deepEqual(report.referredVisitToStart, { numerator: 45, denominator: 100, rate: 0.45 });
  assert.deepEqual(report.viralCoefficient, { nominationsPerCompletion: 2.5, referredStartRate: 0.45, value: 1.125 });
  const zero = calculateAnalyticsFunnels({}); assert.equal(zero.startToCompletion.rate, 0); assert.deepEqual(zero.visitToStart, { numerator: 0, denominator: 0, rate: 0 });
});
