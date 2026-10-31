import { isApprovedAvatarId } from "../app/avatarRegistry.ts";
import { validateDisplayName } from "../app/displayNames.ts";
import { regionOrder, type RegionKey } from "../app/publicGameData.ts";
import { featureFlagNames, type FeatureFlagName } from "../app/featureFlags.ts";
import { PRODUCT_SAFEGUARD } from "../app/productSafeguards.ts";

const PUBLIC_CODE_PATTERN = /^[0-9a-f]{48}$/;
const INTERNAL_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{7,79}$/;
const SAFE_TOKEN_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MEDIA_KEY_PATTERN = /^generated\/(west|east|central|north|south)\/\d{4}\/\d{2}\/[0-9a-f]{64}-v[a-z0-9._-]+\.(png|webp|mp4|webm)$/;
const MAX_ANALYTICS_PROPERTIES_BYTES = 2048;
const textEncoder = new TextEncoder();

export const analyticsEventNames = [
  "entry_viewed", "region_selected", "avatar_selected", "quiz_started", "question_answered",
  "quiz_completed", "result_viewed", "share_interface_selected", "share_handoff_attempted",
  "link_copied", "referred_visit_received", "challenge_accepted",
] as const;

export type AnalyticsEventName = (typeof analyticsEventNames)[number];
export type BotClassification = "human" | "bot" | "crawler" | "unknown";
export type ResultState = "active" | "expired" | "revoked" | "anonymized" | "deleted";
export type ResultVisibility = "private" | "public";
export type ChallengeState = "active" | "expired" | "revoked" | "unavailable" | "anonymized" | "deleted";

export class DataValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DataValidationError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new DataValidationError(code, message);
}

export function assertInternalId(value: string, field = "id"): string {
  if (!INTERNAL_ID_PATTERN.test(value)) fail("invalid_internal_id", `${field} is not a valid opaque internal identifier`);
  return value;
}

export function assertPublicCode(value: string, field = "publicCode"): string {
  if (!PUBLIC_CODE_PATTERN.test(value)) fail("invalid_public_code", `${field} must be a lowercase 192-bit hexadecimal code`);
  return value;
}

export function assertUtcTimestamp(value: number, field: string, options: { future?: boolean } = {}): number {
  if (!Number.isSafeInteger(value) || value < 0) fail("invalid_timestamp", `${field} must be a non-negative UTC epoch-millisecond timestamp`);
  if (!options.future && value > Date.now() + 300_000) fail("future_timestamp", `${field} is unexpectedly far in the future`);
  return value;
}

export function assertEdition(value: string): RegionKey {
  if (!regionOrder.includes(value as RegionKey)) fail("invalid_edition", "edition is not in the approved registry");
  return value as RegionKey;
}

export function assertSafeAvatar(value: string | null): string | null {
  if (value === null) return null;
  if (!isApprovedAvatarId(value)) fail("invalid_avatar", "safeAvatarId is not in the approved avatar registry");
  return value;
}

export function assertScore(score: number, total: number): void {
  if (!Number.isInteger(total) || total < 1 || total > 100 || !Number.isInteger(score) || score < 0 || score > total) {
    fail("invalid_score", "score must be an integer within the declared total");
  }
}

export function assertTier(tier: number): 0 | 1 | 2 | 3 {
  if (!Number.isInteger(tier) || tier < 0 || tier > 3) fail("invalid_tier", "tier must be between 0 and 3");
  return tier as 0 | 1 | 2 | 3;
}

export function parseJsonArray(value: string, field: string, maxBytes = 8192): unknown[] {
  if (textEncoder.encode(value).byteLength > maxBytes) fail("json_too_large", `${field} exceeds its byte limit`);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) fail("invalid_json_shape", `${field} must be a JSON array`);
    return parsed;
  } catch (error) {
    if (error instanceof DataValidationError) throw error;
    return fail("malformed_json", `${field} is malformed JSON`);
  }
}

const analyticsPropertyAllowlist = new Set([
  "edition", "question_kind", "question_position", "score_band", "tier", "channel",
  "entry_source", "elapsed_bucket", "challenge_state", "outcome", "reduced_motion",
]);

export function validateAnalyticsProperties(properties: Readonly<Record<string, unknown>>): Readonly<Record<string, string | number | boolean | null>> {
  const serializable: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!analyticsPropertyAllowlist.has(key)) fail("analytics_property_rejected", `analytics property ${key} is not allowlisted`);
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean" && value !== null) {
      fail("analytics_property_type", `analytics property ${key} has an unsupported type`);
    }
    if (typeof value === "string" && (!SAFE_TOKEN_PATTERN.test(value) || value.length > 64)) {
      fail("analytics_property_value", `analytics property ${key} is not a bounded token`);
    }
    if (typeof value === "number" && !Number.isFinite(value)) fail("analytics_property_value", `analytics property ${key} is not finite`);
    serializable[key] = value;
  }
  if (textEncoder.encode(JSON.stringify(serializable)).byteLength > MAX_ANALYTICS_PROPERTIES_BYTES) {
    fail("analytics_payload_too_large", "analytics properties exceed 2048 bytes");
  }
  return Object.freeze(serializable);
}

export function validateAnalyticsEventName(value: string): AnalyticsEventName {
  if (!analyticsEventNames.includes(value as AnalyticsEventName)) fail("analytics_event_rejected", "analytics event name is not allowlisted");
  return value as AnalyticsEventName;
}

export interface ResultRecord {
  id: string;
  publicSlug: string;
  editionKey: string;
  score: number;
  total: number;
  tier: number;
  scoringVersion: string;
  safeAvatarId: string | null;
  reviewedDisplayName: string | null;
  safeguardVersion: string;
  visibility: ResultVisibility;
  state: ResultState;
  createdAt: number;
  expiresAt: number | null;
  anonymousSubjectHash?: string | null;
  deletionTokenHash?: string | null;
  scoringSnapshotJson?: string;
}

export interface PublicResultData {
  resultSlug: string;
  edition: RegionKey;
  score: number;
  total: number;
  tier: 0 | 1 | 2 | 3;
  safeAvatarId: string | null;
  scoringVersion: string;
  safeguard: typeof PRODUCT_SAFEGUARD;
  createdAt: number;
  expiresAt: number | null;
  displayName: "A challenger";
}

export function toPublicResult(record: ResultRecord, now = Date.now()): PublicResultData | null {
  assertPublicCode(record.publicSlug, "resultSlug");
  if (
    record.visibility !== "public"
    || record.state !== "active"
    || (record.expiresAt !== null && record.expiresAt <= now)
  ) return null;
  assertScore(record.score, record.total);
  const result: PublicResultData = {
    resultSlug: record.publicSlug,
    edition: assertEdition(record.editionKey),
    score: record.score,
    total: record.total,
    tier: assertTier(record.tier),
    safeAvatarId: assertSafeAvatar(record.safeAvatarId),
    scoringVersion: record.scoringVersion,
    safeguard: PRODUCT_SAFEGUARD,
    createdAt: assertUtcTimestamp(record.createdAt, "createdAt"),
    expiresAt: record.expiresAt,
    displayName: "A challenger",
  };
  return Object.freeze(result);
}

export interface PrivateAttemptData {
  attemptId: string;
  edition: RegionKey;
  anonymousSubjectHash: string | null;
  questionSetVersion: string;
  scoringVersion: string;
  selectedQuestionVersions: ReadonlyArray<{ stableId: string; version: number }>;
  status: "in_progress" | "completed" | "abandoned" | "expired" | "anonymized" | "deleted";
  startedAt: number;
  completedAt: number | null;
  expiresAt: number;
}

export interface PrivateAttemptRecord {
  id: string;
  editionKey: string;
  anonymousSubjectHash: string | null;
  questionSetVersion: string;
  scoringVersion: string;
  selectedQuestionVersionsJson: string;
  status: PrivateAttemptData["status"];
  startedAt: number;
  completedAt: number | null;
  expiresAt: number;
}

export function toPrivateAttempt(record: PrivateAttemptRecord, authorized: boolean): PrivateAttemptData {
  if (!authorized) fail("private_projection_forbidden", "private attempt projection requires server-side authorization");
  const selected = parseJsonArray(record.selectedQuestionVersionsJson, "selectedQuestionVersions", 16_384);
  const selectedQuestionVersions = selected.map((item) => {
    if (
      typeof item !== "object" || item === null
      || typeof (item as { stableId?: unknown }).stableId !== "string"
      || typeof (item as { version?: unknown }).version !== "number"
      || !Number.isInteger((item as { version: number }).version)
      || (item as { version: number }).version < 1
    ) {
      return fail("invalid_question_snapshot", "selected question snapshot is malformed");
    }
    return {
      stableId: (item as { stableId: string }).stableId,
      version: (item as { version: number }).version,
    };
  });
  return Object.freeze({
    attemptId: assertInternalId(record.id, "attemptId"),
    edition: assertEdition(record.editionKey),
    anonymousSubjectHash: record.anonymousSubjectHash,
    questionSetVersion: record.questionSetVersion,
    scoringVersion: record.scoringVersion,
    selectedQuestionVersions: Object.freeze(selectedQuestionVersions),
    status: record.status,
    startedAt: assertUtcTimestamp(record.startedAt, "startedAt"),
    completedAt: record.completedAt,
    expiresAt: assertUtcTimestamp(record.expiresAt, "expiresAt", { future: true }),
  });
}

export interface TrustedChallengeEntryData {
  challengeCode: string;
  edition: RegionKey;
  verifiedScoreToBeat: number;
  total: number;
  scoringVersion: string;
  safeInviterAvatarId: string | null;
  reviewedInviterName?: string;
  expiresAt: number;
}

export interface ChallengeRecord {
  publicCode: string;
  editionKey: string;
  verifiedScoreToBeat: number;
  total: number;
  scoringVersion: string;
  safeInviterAvatarId: string | null;
  reviewedInviterName: string | null;
  state: ChallengeState;
  useLimit: number | null;
  useCount: number;
  expiresAt: number;
}

export function toTrustedChallengeEntry(record: ChallengeRecord, now = Date.now()): TrustedChallengeEntryData | null {
  assertPublicCode(record.publicCode, "challengeCode");
  if (
    record.state !== "active"
    || record.expiresAt <= now
    || (record.useLimit !== null && record.useCount >= record.useLimit)
  ) return null;
  assertScore(record.verifiedScoreToBeat, record.total);
  const projection: TrustedChallengeEntryData = {
    challengeCode: record.publicCode,
    edition: assertEdition(record.editionKey),
    verifiedScoreToBeat: record.verifiedScoreToBeat,
    total: record.total,
    scoringVersion: record.scoringVersion,
    safeInviterAvatarId: assertSafeAvatar(record.safeInviterAvatarId),
    expiresAt: assertUtcTimestamp(record.expiresAt, "expiresAt", { future: true }),
  };
  if (record.reviewedInviterName) projection.reviewedInviterName = validateReviewedDisplayName(record.reviewedInviterName);
  return Object.freeze(projection);
}

export interface OwnerAnalyticsData {
  eventName: AnalyticsEventName;
  properties: Readonly<Record<string, string | number | boolean | null>>;
  botClassification: BotClassification;
  occurredAt: number;
}

export function toOwnerAnalyticsData(input: {
  eventName: string;
  propertiesJson: string;
  botClassification: BotClassification;
  occurredAt: number;
}, ownerAuthorized: boolean): OwnerAnalyticsData {
  if (!ownerAuthorized) fail("owner_projection_forbidden", "owner analytics projection requires owner authorization");
  let properties: unknown;
  try {
    properties = JSON.parse(input.propertiesJson);
  } catch {
    return fail("malformed_json", "analytics properties are malformed JSON");
  }
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return fail("invalid_json_shape", "analytics properties must be an object");
  }
  return Object.freeze({
    eventName: validateAnalyticsEventName(input.eventName),
    properties: validateAnalyticsProperties(properties as Record<string, unknown>),
    botClassification: input.botClassification,
    occurredAt: assertUtcTimestamp(input.occurredAt, "occurredAt"),
  });
}

export interface PartyHostData {
  partyCode: string;
  hostControlTokenHash: string;
  edition: RegionKey;
  maxPlayers: number;
  playerCount: number;
  state: "open" | "started" | "closed" | "expired" | "revoked" | "deleted";
  expiresAt: number;
}

export function toPartyHostData(input: PartyHostData, hostAuthorized: boolean): PartyHostData {
  if (!hostAuthorized) fail("party_host_projection_forbidden", "party host projection requires host authorization");
  assertPublicCode(input.partyCode, "partyCode");
  if (!/^[0-9a-f]{64}$/.test(input.hostControlTokenHash)) fail("invalid_host_token_hash", "host control token must be represented only by its SHA-256 hash");
  assertEdition(input.edition);
  if (!Number.isInteger(input.maxPlayers) || input.maxPlayers < 2 || input.maxPlayers > 20) fail("invalid_party_capacity", "party capacity must be between 2 and 20");
  if (!Number.isInteger(input.playerCount) || input.playerCount < 0 || input.playerCount > input.maxPlayers) fail("invalid_party_count", "party player count exceeds capacity");
  assertUtcTimestamp(input.expiresAt, "expiresAt", { future: true });
  return Object.freeze({ ...input });
}

export interface PartyPlayerPublicData {
  playerPublicId: string;
  safeAvatarId: string;
  displayName?: string;
  score: number | null;
  position: number | null;
  state: "joined" | "playing" | "completed" | "left";
}

export function toPartyPlayerPublicData(input: PartyPlayerPublicData): PartyPlayerPublicData {
  const projection: PartyPlayerPublicData = {
    playerPublicId: assertPublicCode(input.playerPublicId, "playerPublicId"),
    safeAvatarId: assertSafeAvatar(input.safeAvatarId) as string,
    score: input.score,
    position: input.position,
    state: input.state,
  };
  if (input.displayName) projection.displayName = validateReviewedDisplayName(input.displayName);
  if (input.score !== null && (!Number.isInteger(input.score) || input.score < 0 || input.score > 100)) {
    fail("invalid_score", "party player score is outside approved bounds");
  }
  if (input.position !== null && (!Number.isInteger(input.position) || input.position < 1 || input.position > 20)) {
    fail("invalid_position", "party player position is outside approved bounds");
  }
  return Object.freeze(projection);
}

export interface DeletionOrAnonymisationOperation {
  operationId: string;
  targetType: "attempt" | "result" | "challenge" | "party" | "analytics_subject" | "media";
  targetPublicCode?: string;
  requestedAt: number;
  mode: "delete" | "anonymize" | "revoke_public_access";
  idempotencyKeyHash: string;
}

export function validateDeletionOrAnonymisationOperation(
  operation: DeletionOrAnonymisationOperation,
  authorized: boolean,
): DeletionOrAnonymisationOperation {
  if (!authorized) fail("deletion_operation_forbidden", "deletion or anonymisation requires private authorization");
  assertInternalId(operation.operationId, "operationId");
  assertUtcTimestamp(operation.requestedAt, "requestedAt");
  if (operation.targetPublicCode) assertPublicCode(operation.targetPublicCode, "targetPublicCode");
  if (!/^[0-9a-f]{64}$/.test(operation.idempotencyKeyHash)) fail("invalid_idempotency_hash", "idempotency key must be stored only as a SHA-256 hash");
  return Object.freeze({ ...operation });
}

export function validateReviewedDisplayName(value: string): string {
  const result = validateDisplayName(value);
  if (!result.valid || !result.value) fail("invalid_display_name", "reviewed display name is outside the approved bounds");
  return result.value;
}

export function createOpaquePublicCode(randomValues = crypto.getRandomValues.bind(crypto)): string {
  const bytes = new Uint8Array(24);
  randomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateFeatureFlagOverride(input: {
  flagName: string;
  enabled: boolean;
  scopeType: string;
  reason: string;
  createdByOwnerId: string;
  expiresAt: number;
  now?: number;
  hostingTarget: "chatgpt-sites" | "other-approved-host";
}): { flagName: FeatureFlagName; enabled: boolean } {
  if (!featureFlagNames.includes(input.flagName as FeatureFlagName)) fail("invalid_flag", "feature flag is not registered");
  if (!["global", "edition", "anonymous_subject", "owner_preview"].includes(input.scopeType)) fail("invalid_scope", "feature override scope is invalid");
  if (input.reason.trim().length < 3 || input.reason.length > 500) fail("invalid_reason", "feature override reason is outside approved bounds");
  assertInternalId(input.createdByOwnerId, "createdByOwnerId");
  const now = input.now ?? Date.now();
  assertUtcTimestamp(input.expiresAt, "expiresAt", { future: true });
  if (input.expiresAt <= now) fail("expired_override", "feature override must expire in the future");
  if (input.flagName === "commerce" && input.enabled && input.hostingTarget === "chatgpt-sites") {
    fail("commerce_blocked_on_sites", "commerce cannot be enabled while the application targets ChatGPT Sites");
  }
  return { flagName: input.flagName as FeatureFlagName, enabled: input.enabled };
}

export function buildMediaObjectKey(input: {
  edition: RegionKey;
  contentHash: string;
  generationVersion: string;
  extension: "png" | "webp" | "mp4" | "webm";
  createdAt: Date;
}): string {
  assertEdition(input.edition);
  if (!/^[0-9a-f]{64}$/.test(input.contentHash)) fail("invalid_content_hash", "media content hash must be lowercase SHA-256 hexadecimal");
  if (!/^[a-z0-9._-]{1,32}$/.test(input.generationVersion)) fail("invalid_generation_version", "media generation version is not a bounded token");
  const year = input.createdAt.getUTCFullYear().toString().padStart(4, "0");
  const month = (input.createdAt.getUTCMonth() + 1).toString().padStart(2, "0");
  const key = `generated/${input.edition}/${year}/${month}/${input.contentHash}-v${input.generationVersion}.${input.extension}`;
  if (!MEDIA_KEY_PATTERN.test(key)) fail("unsafe_media_key", "media object key violates the public-safe contract");
  return key;
}

export function assertSafeMediaObjectKey(value: string): string {
  if (!MEDIA_KEY_PATTERN.test(value) || /[@?&#\\]/.test(value)) fail("unsafe_media_key", "media object key contains unsafe or identifying material");
  return value;
}
