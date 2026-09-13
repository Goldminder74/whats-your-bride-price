import type { AtomicD1Database, BoundStatement } from "./repositories.ts";
import {
  ANALYTICS_CHANNELS,
  ANALYTICS_EVENT_SCHEMA_VERSION,
  AnalyticsValidationError,
  eventDestination,
  validateIngestibleEventName,
  type AnalyticsEventName,
  type AnalyticsChannel,
  type AnalyticsEventDestination,
} from "./analyticsContracts.ts";

export const ANALYTICS_NOTICE_VERSION = "analytics-notice-v1" as const;
export const ANALYTICS_CATEGORY_VERSION = "first-party-statistical-v1" as const;
export const ANALYTICS_RAW_RETENTION_MS = 30 * 86_400_000;
export const ANALYTICS_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const ANALYTICS_CONSENT_LIFETIME_MS = 180 * 86_400_000;
export const ANALYTICS_MAX_BATCH_SIZE = 10;
export const ANALYTICS_MAX_BODY_BYTES = 16_384;
export const ANALYTICS_MAX_PROPERTIES_BYTES = 2_048;
export const ANALYTICS_RETENTION_BATCH_LIMIT = 500;

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sessionCredentialPattern = /^[0-9a-f]{32}$/;
const sessionHashPattern = /^[0-9a-f]{64}$/;
const challengeCodePattern = /^[0-9a-f]{48}$/;
const textEncoder = new TextEncoder();

const propertyKeys = Object.freeze([
  "edition", "surface", "channel", "outcome", "nominationSlot", "scoreBand",
  "maximumScoreVersion", "featureState", "durationBucket", "fileSizeBucket",
  "source", "campaign", "referred",
] as const);

export type AnalyticsProperties = Readonly<Partial<{
  edition: "west" | "east" | "central" | "north" | "south";
  surface: "entry" | "quiz" | "result" | "comparison" | "challenge_landing" | "share_centre" | "story_video";
  channel: AnalyticsChannel;
  outcome: "beat" | "tied" | "did_not_beat" | "unavailable" | "success" | "cancelled" | "failed";
  nominationSlot: 1 | 2 | 3;
  scoreBand: "learning" | "growing" | "strong" | "mastery";
  maximumScoreVersion: "12-v1";
  featureState: "enabled" | "disabled" | "preview" | "rendering" | "ready" | "cancelled" | "unsupported" | "failed" | "fallback";
  durationBucket: "under_1s" | "1_to_5s" | "5_to_30s" | "30_to_120s" | "over_120s";
  fileSizeBucket: "under_1mb" | "1_to_4mb" | "4_to_8mb";
  source: "direct" | "challenge" | "nomination" | "result";
  campaign: "none" | "challenge" | "nomination";
  referred: boolean;
}>>;

export type AnalyticsClientEvent = Readonly<{
  name: AnalyticsEventName;
  eventSchemaVersion: typeof ANALYTICS_EVENT_SCHEMA_VERSION;
  consentNoticeVersion: typeof ANALYTICS_NOTICE_VERSION;
  clientEventUuid: string;
  occurredAt: number;
  properties: AnalyticsProperties;
  referralChallengeCode?: string;
}>;

export type StoredAnalyticsEvent = Readonly<{
  id: string;
  destination: AnalyticsEventDestination;
  name: AnalyticsEventName;
  clientEventUuid: string;
  analyticsSessionHash: string;
  occurredAt: number;
  expiresAt: number;
  propertiesJson: string;
  channel: AnalyticsChannel | null;
  challengeId: string | null;
  source: "challenge" | "nomination" | null;
}>;

function fail(code: string): never { throw new AnalyticsValidationError(code); }

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function oneOf<T extends string>(value: unknown, values: readonly T[], code: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) return fail(code);
  return value as T;
}

export function validateClientEventUuid(value: unknown): string {
  if (typeof value !== "string" || !uuidV4Pattern.test(value)) return fail("client_event_uuid_invalid");
  return value;
}

export function validateAnalyticsSessionCredential(value: unknown): string {
  if (typeof value !== "string" || !sessionCredentialPattern.test(value)) return fail("analytics_session_credential_invalid");
  return value;
}

export function validateAnalyticsSessionHash(value: unknown): string {
  if (typeof value !== "string" || !sessionHashPattern.test(value)) return fail("analytics_session_hash_invalid");
  return value;
}

export function validateAnalyticsProperties(value: unknown): AnalyticsProperties {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("analytics_properties_invalid");
  const candidate = value as Record<string, unknown>;
  if (!exactKeys(candidate, propertyKeys)) return fail("analytics_property_not_allowed");
  const result: Record<string, unknown> = {};
  if (candidate.edition !== undefined) result.edition = oneOf(candidate.edition, ["west", "east", "central", "north", "south"], "edition_invalid");
  if (candidate.surface !== undefined) result.surface = oneOf(candidate.surface, ["entry", "quiz", "result", "comparison", "challenge_landing", "share_centre", "story_video"], "surface_invalid");
  if (candidate.channel !== undefined) result.channel = oneOf(candidate.channel, ANALYTICS_CHANNELS, "channel_invalid");
  if (candidate.outcome !== undefined) result.outcome = oneOf(candidate.outcome, ["beat", "tied", "did_not_beat", "unavailable", "success", "cancelled", "failed"], "outcome_invalid");
  if (candidate.nominationSlot !== undefined) {
    if (![1, 2, 3].includes(candidate.nominationSlot as number)) return fail("nomination_slot_invalid");
    result.nominationSlot = candidate.nominationSlot;
  }
  if (candidate.scoreBand !== undefined) result.scoreBand = oneOf(candidate.scoreBand, ["learning", "growing", "strong", "mastery"], "score_band_invalid");
  if (candidate.maximumScoreVersion !== undefined) result.maximumScoreVersion = oneOf(candidate.maximumScoreVersion, ["12-v1"], "maximum_score_version_invalid");
  if (candidate.featureState !== undefined) result.featureState = oneOf(candidate.featureState, ["enabled", "disabled", "preview", "rendering", "ready", "cancelled", "unsupported", "failed", "fallback"], "feature_state_invalid");
  if (candidate.durationBucket !== undefined) result.durationBucket = oneOf(candidate.durationBucket, ["under_1s", "1_to_5s", "5_to_30s", "30_to_120s", "over_120s"], "duration_bucket_invalid");
  if (candidate.fileSizeBucket !== undefined) result.fileSizeBucket = oneOf(candidate.fileSizeBucket, ["under_1mb", "1_to_4mb", "4_to_8mb"], "file_size_bucket_invalid");
  if (candidate.source !== undefined) result.source = oneOf(candidate.source, ["direct", "challenge", "nomination", "result"], "source_invalid");
  if (candidate.campaign !== undefined) result.campaign = oneOf(candidate.campaign, ["none", "challenge", "nomination"], "campaign_invalid");
  if (candidate.referred !== undefined) {
    if (typeof candidate.referred !== "boolean") return fail("referred_invalid");
    result.referred = candidate.referred;
  }
  if (textEncoder.encode(JSON.stringify(result)).byteLength > ANALYTICS_MAX_PROPERTIES_BYTES) return fail("analytics_properties_too_large");
  return Object.freeze(result) as AnalyticsProperties;
}

export function validateAnalyticsClientEvent(value: unknown, now = Date.now(), commerceEnabled = false): AnalyticsClientEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("analytics_event_invalid");
  const candidate = value as Record<string, unknown>;
  if (!exactKeys(candidate, ["name", "eventSchemaVersion", "consentNoticeVersion", "clientEventUuid", "occurredAt", "properties", "referralChallengeCode"])) return fail("analytics_event_field_not_allowed");
  const name = validateIngestibleEventName(candidate.name, commerceEnabled);
  if (candidate.eventSchemaVersion !== ANALYTICS_EVENT_SCHEMA_VERSION) return fail("event_schema_version_invalid");
  if (candidate.consentNoticeVersion !== ANALYTICS_NOTICE_VERSION) return fail("consent_notice_version_invalid");
  if (!Number.isSafeInteger(candidate.occurredAt) || (candidate.occurredAt as number) < now - 10 * 60_000 || (candidate.occurredAt as number) > now + 60_000) return fail("event_timestamp_invalid");
  const referral = eventDestination(name) === "referral_events";
  if (referral && (typeof candidate.referralChallengeCode !== "string" || !challengeCodePattern.test(candidate.referralChallengeCode))) return fail("referral_challenge_code_invalid");
  if (!referral && candidate.referralChallengeCode !== undefined) return fail("referral_challenge_code_not_allowed");
  const properties = validateAnalyticsProperties(candidate.properties);
  if (eventDestination(name) === "share_events" && !properties.channel) return fail("share_channel_required");
  if (referral && !["challenge", "nomination"].includes(properties.source || "")) return fail("referral_source_required");
  return Object.freeze({
    name,
    eventSchemaVersion: ANALYTICS_EVENT_SCHEMA_VERSION,
    consentNoticeVersion: ANALYTICS_NOTICE_VERSION,
    clientEventUuid: validateClientEventUuid(candidate.clientEventUuid),
    occurredAt: candidate.occurredAt as number,
    properties,
    ...(referral ? { referralChallengeCode: candidate.referralChallengeCode as string } : {}),
  });
}

export function validateAnalyticsBatch(value: unknown, now = Date.now(), commerceEnabled = false): readonly AnalyticsClientEvent[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > ANALYTICS_MAX_BATCH_SIZE) return fail("analytics_batch_invalid");
  const events = value.map((event) => validateAnalyticsClientEvent(event, now, commerceEnabled));
  if (new Set(events.map(({ clientEventUuid }) => clientEventUuid)).size !== events.length) return fail("analytics_batch_duplicate_uuid");
  return Object.freeze(events);
}

export async function deriveAnalyticsSessionHash(rawCredential: unknown): Promise<string> {
  const credential = validateAnalyticsSessionCredential(rawCredential);
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(`wybp:analytics-session:v1:${credential}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqualAnalyticsHash(left: string, right: string): boolean {
  if (!sessionHashPattern.test(left) || !sessionHashPattern.test(right) || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export interface AnalyticsRepository {
  readonly storageAvailable: boolean;
  hasActiveConsent(sessionHash: string, noticeVersion: string, now: number): Promise<boolean>;
  acceptConsent(sessionHash: string, noticeVersion: string, now: number): Promise<void>;
  resolveChallenge(publicCode: string, now: number): Promise<string | null>;
  insertEvents(events: readonly StoredAnalyticsEvent[]): Promise<"inserted" | "duplicate">;
  withdrawSession(sessionHash: string, noticeVersion: string, now: number): Promise<void>;
  retainExpired(now: number, limit: number, authorized: boolean): Promise<number>;
  eventCounts(from: number, to: number, authorized: boolean): Promise<Readonly<Record<string, number>>>;
}

export type AnalyticsRateLimitDecision = "allowed" | "limited" | "unavailable";
export interface AnalyticsRateLimiter { consume(sessionHash: string, now: number): Promise<AnalyticsRateLimitDecision>; }

export class UnavailableAnalyticsRateLimiter implements AnalyticsRateLimiter {
  async consume(): Promise<AnalyticsRateLimitDecision> { return "unavailable"; }
}

export class InMemoryAnalyticsRateLimiter implements AnalyticsRateLimiter {
  private readonly hits = new Map<string, number[]>();
  async consume(sessionHash: string, now: number): Promise<AnalyticsRateLimitDecision> {
    const current = (this.hits.get(sessionHash) || []).filter((time) => time > now - 60_000);
    if (current.length >= 30) return "limited";
    current.push(now); this.hits.set(sessionHash, current); return "allowed";
  }
}

function internalEventId(uuid: string): string { return `analytics_event_${uuid.replaceAll("-", "")}`; }
function internalConsentId(hash: string): string { return `analytics_consent_${hash.slice(0, 32)}`; }

function first<T extends Record<string, unknown>>(database: AtomicD1Database, query: string, values: readonly unknown[]): Promise<T | null> {
  return database.prepare(query).bind(...values).first<T>();
}

export class D1AnalyticsRepository implements AnalyticsRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;
  constructor(database: AtomicD1Database) { this.database = database; }

  async hasActiveConsent(sessionHash: string, noticeVersion: string, now: number): Promise<boolean> {
    const row = await first<{ analytics_session_hash: string }>(this.database, `SELECT analytics_session_hash FROM consent_preferences
      WHERE analytics_session_hash=?1 AND notice_version=?2 AND first_party_statistical=1 AND marketing=0
        AND withdrawn_at IS NULL AND deleted_at IS NULL AND expires_at>?3`, [sessionHash, noticeVersion, now]);
    return Boolean(row && constantTimeEqualAnalyticsHash(row.analytics_session_hash, sessionHash));
  }

  async acceptConsent(sessionHash: string, noticeVersion: string, now: number): Promise<void> {
    await this.database.prepare(`INSERT OR IGNORE INTO consent_preferences (
      id,anonymous_subject_hash,analytics_session_hash,notice_version,category_version,
      strictly_functional,first_party_statistical,marketing,decided_at,expires_at,version,created_at,updated_at
    ) VALUES (?1,NULL,?2,?3,?4,1,1,0,?5,?6,1,?5,?5)`)
      .bind(internalConsentId(sessionHash), sessionHash, noticeVersion, ANALYTICS_CATEGORY_VERSION, now, now + ANALYTICS_CONSENT_LIFETIME_MS).run();
    if (!(await this.hasActiveConsent(sessionHash, noticeVersion, now))) throw new AnalyticsValidationError("consent_persistence_failed");
  }

  async resolveChallenge(publicCode: string, now: number): Promise<string | null> {
    const row = await first<{ id: string }>(this.database, "SELECT id FROM challenges WHERE public_code=?1 AND state='active' AND expires_at>?2", [publicCode, now]);
    return row?.id || null;
  }

  async insertEvents(events: readonly StoredAnalyticsEvent[]): Promise<"inserted" | "duplicate"> {
    for (const event of events) {
      const exists = await first<{ found: number }>(this.database, `SELECT 1 AS found FROM analytics_events WHERE client_event_uuid=?1
        UNION ALL SELECT 1 FROM referral_events WHERE client_event_uuid=?1
        UNION ALL SELECT 1 FROM share_events WHERE client_event_uuid=?1 LIMIT 1`, [event.clientEventUuid]);
      if (exists) return "duplicate";
    }
    const statements: BoundStatement[] = events.map((event) => {
      if (event.destination === "referral_events") return this.database.prepare(`INSERT INTO referral_events (
        id,client_event_uuid,event_schema_version,analytics_session_hash,referral_code,challenge_id,event_type,source,
        occurred_at,expires_at,version,created_at,updated_at
      ) VALUES (?1,?2,1,?3,NULL,?4,?5,?6,?7,?8,1,?7,?7)`)
        .bind(event.id, event.clientEventUuid, event.analyticsSessionHash, event.challengeId, event.name, event.source, event.occurredAt, event.expiresAt);
      if (event.destination === "share_events") return this.database.prepare(`INSERT INTO share_events (
        id,client_event_uuid,event_schema_version,analytics_session_hash,event_type,channel,occurred_at,expires_at,version,created_at,updated_at
      ) VALUES (?1,?2,1,?3,?4,?5,?6,?7,1,?6,?6)`)
        .bind(event.id, event.clientEventUuid, event.analyticsSessionHash, event.name, event.channel, event.occurredAt, event.expiresAt);
      return this.database.prepare(`INSERT INTO analytics_events (
        id,client_event_uuid,event_schema_version,analytics_session_hash,event_name,properties_json,consent_notice_version,
        bot_classification,occurred_at,expires_at,version,created_at,updated_at
      ) VALUES (?1,?2,1,?3,?4,?5,?6,'human',?7,?8,1,?7,?7)`)
        .bind(event.id, event.clientEventUuid, event.analyticsSessionHash, event.name, event.propertiesJson, ANALYTICS_NOTICE_VERSION, event.occurredAt, event.expiresAt);
    });
    try { await this.database.batch(statements); return "inserted"; }
    catch { return "duplicate"; }
  }

  async withdrawSession(sessionHash: string, noticeVersion: string, now: number): Promise<void> {
    await this.database.batch([
      this.database.prepare("DELETE FROM analytics_events WHERE analytics_session_hash=?1").bind(sessionHash),
      this.database.prepare("DELETE FROM referral_events WHERE analytics_session_hash=?1").bind(sessionHash),
      this.database.prepare("DELETE FROM share_events WHERE analytics_session_hash=?1").bind(sessionHash),
      this.database.prepare(`UPDATE consent_preferences SET analytics_session_hash=NULL,first_party_statistical=0,
        marketing=0,withdrawn_at=?3,updated_at=?3 WHERE analytics_session_hash=?1 AND notice_version=?2`).bind(sessionHash, noticeVersion, now),
    ]);
  }

  async retainExpired(now: number, limit: number, authorized: boolean): Promise<number> {
    if (!authorized || !Number.isInteger(limit) || limit < 1 || limit > ANALYTICS_RETENTION_BATCH_LIMIT) return fail("retention_not_authorized");
    const results = await this.database.batch(["analytics_events", "referral_events", "share_events"].map((table) =>
      this.database.prepare(`DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE expires_at<=?1 ORDER BY expires_at LIMIT ?2)`).bind(now, limit),
    ));
    return results.reduce((total, result) => total + Number(result.meta?.changes || 0), 0);
  }

  async eventCounts(from: number, to: number, authorized: boolean): Promise<Readonly<Record<string, number>>> {
    if (!authorized) return fail("analytics_report_not_authorized");
    const rows = await this.database.prepare(`SELECT name,count(*) AS count FROM (
      SELECT event_name AS name FROM analytics_events WHERE event_schema_version=1 AND deleted_at IS NULL AND occurred_at>=?1 AND occurred_at<?2
      UNION ALL SELECT event_type FROM referral_events WHERE event_schema_version=1 AND deleted_at IS NULL AND occurred_at>=?1 AND occurred_at<?2
      UNION ALL SELECT event_type FROM share_events WHERE event_schema_version=1 AND deleted_at IS NULL AND occurred_at>=?1 AND occurred_at<?2
    ) GROUP BY name`).bind(from, to).all<{ name: string; count: number }>();
    return Object.freeze(Object.fromEntries((rows.results || []).map((row) => [row.name, Number(row.count)])));
  }
}

export class InMemoryAnalyticsRepository implements AnalyticsRepository {
  readonly storageAvailable = true;
  readonly consent = new Map<string, { noticeVersion: string; expiresAt: number }>();
  readonly events = new Map<string, StoredAnalyticsEvent>();
  readonly challenges = new Map<string, string>();

  async hasActiveConsent(hash: string, notice: string, now: number): Promise<boolean> { const value = this.consent.get(hash); return Boolean(value && value.noticeVersion === notice && value.expiresAt > now); }
  async acceptConsent(hash: string, notice: string, now: number): Promise<void> { this.consent.set(hash, { noticeVersion: notice, expiresAt: now + ANALYTICS_CONSENT_LIFETIME_MS }); }
  async resolveChallenge(code: string): Promise<string | null> { return this.challenges.get(code) || null; }
  async insertEvents(events: readonly StoredAnalyticsEvent[]): Promise<"inserted" | "duplicate"> {
    if (events.some((event) => this.events.has(event.clientEventUuid))) return "duplicate";
    events.forEach((event) => this.events.set(event.clientEventUuid, event)); return "inserted";
  }
  async withdrawSession(hash: string): Promise<void> { this.consent.delete(hash); for (const [uuid, event] of this.events) if (event.analyticsSessionHash === hash) this.events.delete(uuid); }
  async retainExpired(now: number, limit: number, authorized: boolean): Promise<number> { if (!authorized || limit < 1 || limit > ANALYTICS_RETENTION_BATCH_LIMIT) return fail("retention_not_authorized"); let count = 0; for (const [uuid, event] of [...this.events].sort((a,b)=>a[1].expiresAt-b[1].expiresAt)) { if (count >= limit) break; if (event.expiresAt <= now) { this.events.delete(uuid); count += 1; } } return count; }
  async eventCounts(from: number, to: number, authorized: boolean): Promise<Readonly<Record<string, number>>> { if (!authorized) return fail("analytics_report_not_authorized"); const counts: Record<string, number> = {}; for (const event of this.events.values()) if (event.occurredAt >= from && event.occurredAt < to) counts[event.name] = (counts[event.name] || 0) + 1; return Object.freeze(counts); }
}

export class AnalyticsService {
  private readonly repository: AnalyticsRepository;
  private readonly rateLimiter: AnalyticsRateLimiter;
  private readonly now: () => number;
  private readonly commerceEnabled: boolean;
  constructor(repository: AnalyticsRepository, rateLimiter: AnalyticsRateLimiter, now: () => number = Date.now, commerceEnabled = false) {
    this.repository = repository; this.rateLimiter = rateLimiter; this.now = now; this.commerceEnabled = commerceEnabled;
  }

  private async rateLimit(hash: string, now: number): Promise<void> {
    const decision = await this.rateLimiter.consume(hash, now);
    if (decision === "limited") return fail("analytics_rate_limited");
    if (decision !== "allowed") return fail("analytics_rate_limit_unavailable");
  }

  private async storedEvents(events: readonly AnalyticsClientEvent[], hash: string, now: number): Promise<readonly StoredAnalyticsEvent[]> {
    const stored: StoredAnalyticsEvent[] = [];
    for (const event of events) {
      const destination = eventDestination(event.name);
      const challengeId = destination === "referral_events" ? await this.repository.resolveChallenge(event.referralChallengeCode || "", now) : null;
      if (destination === "referral_events" && !challengeId) return fail("referral_unavailable");
      stored.push(Object.freeze({
        id: internalEventId(event.clientEventUuid), destination, name: event.name,
        clientEventUuid: event.clientEventUuid, analyticsSessionHash: hash,
        occurredAt: event.occurredAt, expiresAt: event.occurredAt + ANALYTICS_RAW_RETENTION_MS,
        propertiesJson: JSON.stringify(event.properties), channel: event.properties.channel || null,
        challengeId, source: destination === "referral_events" ? event.properties.source as "challenge" | "nomination" : null,
      }));
    }
    return Object.freeze(stored);
  }

  async accept(rawCredential: unknown, eventValue: unknown): Promise<Readonly<{ accepted: true; stored: boolean }>> {
    if (!this.repository.storageAvailable) return fail("analytics_storage_unavailable");
    const now = this.now(); const hash = await deriveAnalyticsSessionHash(rawCredential); await this.rateLimit(hash, now);
    const event = validateAnalyticsClientEvent(eventValue, now, this.commerceEnabled);
    if (event.name !== "consent_accept") return fail("consent_accept_event_required");
    await this.repository.acceptConsent(hash, ANALYTICS_NOTICE_VERSION, now);
    const result = await this.repository.insertEvents(await this.storedEvents([event], hash, now));
    return Object.freeze({ accepted: true, stored: result === "inserted" });
  }

  async ingest(rawCredential: unknown, eventValues: unknown): Promise<Readonly<{ accepted: true; stored: number }>> {
    if (!this.repository.storageAvailable) return fail("analytics_storage_unavailable");
    const now = this.now(); const hash = await deriveAnalyticsSessionHash(rawCredential); await this.rateLimit(hash, now);
    if (!(await this.repository.hasActiveConsent(hash, ANALYTICS_NOTICE_VERSION, now))) return fail("analytics_consent_invalid");
    const events = validateAnalyticsBatch(eventValues, now, this.commerceEnabled);
    if (events.some((event) => event.name.startsWith("consent_"))) return fail("consent_event_not_allowed_in_batch");
    const result = await this.repository.insertEvents(await this.storedEvents(events, hash, now));
    return Object.freeze({ accepted: true, stored: result === "inserted" ? events.length : 0 });
  }

  async withdraw(rawCredential: unknown): Promise<Readonly<{ withdrawn: true }>> {
    if (!this.repository.storageAvailable) return fail("analytics_storage_unavailable");
    const now = this.now(); const hash = await deriveAnalyticsSessionHash(rawCredential); await this.rateLimit(hash, now);
    await this.repository.withdrawSession(hash, ANALYTICS_NOTICE_VERSION, now);
    return Object.freeze({ withdrawn: true });
  }
}

export type FunnelMetric = Readonly<{ numerator: number; denominator: number; rate: number }>;
export type FunnelReport = Readonly<{
  basis: "consented_measured_traffic";
  visitToStart: FunnelMetric;
  startToCompletion: FunnelMetric;
  completionToShareIntent: FunnelMetric;
  completionToShareHandoff: FunnelMetric;
  nominationHandoffsPerCompletion: FunnelMetric;
  referredVisitToStart: FunnelMetric;
  challengeViewToAccept: FunnelMetric;
  challengeAcceptToCompletion: FunnelMetric;
  storyVideoOpenToRenderComplete: FunnelMetric;
  storyVideoRenderToShareHandoff: FunnelMetric;
  viralCoefficient: Readonly<{ nominationsPerCompletion: number; referredStartRate: number; value: number }>;
}>;

function metric(numerator: number, denominator: number): FunnelMetric { return Object.freeze({ numerator, denominator, rate: denominator > 0 ? numerator / denominator : 0 }); }
function count(counts: Readonly<Record<string, number>>, names: readonly string[]): number { return names.reduce((sum, name) => sum + (counts[name] || 0), 0); }

export function calculateAnalyticsFunnels(counts: Readonly<Record<string, number>>): FunnelReport {
  const completions = count(counts, ["quiz_complete"]);
  const nomination = metric(count(counts, ["nomination_share_handoff"]), completions);
  const referred = metric(count(counts, ["referred_quiz_start"]), count(counts, ["referred_visit"]));
  const storyRendered = count(counts, ["story_video_render_complete"]);
  return Object.freeze({
    basis: "consented_measured_traffic",
    visitToStart: metric(count(counts, ["quiz_start"]), count(counts, ["app_visit"])),
    startToCompletion: metric(completions, count(counts, ["quiz_start"])),
    completionToShareIntent: metric(count(counts, ["share_intent", "nomination_share_intent", "story_video_share_intent"]), completions),
    completionToShareHandoff: metric(count(counts, ["share_handoff", "nomination_share_handoff", "story_video_share_handoff"]), completions),
    nominationHandoffsPerCompletion: nomination,
    referredVisitToStart: referred,
    challengeViewToAccept: metric(count(counts, ["challenge_accept"]), count(counts, ["challenge_view"])),
    challengeAcceptToCompletion: metric(count(counts, ["challenge_complete"]), count(counts, ["challenge_accept"])),
    storyVideoOpenToRenderComplete: metric(storyRendered, count(counts, ["story_video_open"])),
    storyVideoRenderToShareHandoff: metric(count(counts, ["story_video_share_handoff"]), storyRendered),
    viralCoefficient: Object.freeze({ nominationsPerCompletion: nomination.rate, referredStartRate: referred.rate, value: nomination.rate * referred.rate }),
  });
}
