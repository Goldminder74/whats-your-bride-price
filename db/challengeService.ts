import { publicDisplayNameFallback, validateDisplayName } from "../app/displayNames.ts";
import { isApprovedAvatarId } from "../app/avatarRegistry.ts";
import { regions, type RegionKey } from "../app/gameData.ts";
import { createChallengeUrl, type PublicAppOrigin } from "../app/publicAppOrigin.ts";
import { PRODUCT_SAFEGUARD } from "../app/productSafeguards.ts";
import { constantTimeEqual } from "./deletionReadiness.ts";
import type { AtomicD1Database } from "./repositories.ts";
import { SCORING_VERSION } from "./seeds/development.ts";

export const CHALLENGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const CHALLENGE_PUBLIC_CODE_BYTES = 24;
export const CHALLENGE_REVOCATION_TOKEN_BYTES = 32;
export const CHALLENGE_CREATION_COLLISION_LIMIT = 5;
export const CHALLENGE_IDEMPOTENCY_KEY_MINIMUM_LENGTH = 16;
export const CHALLENGE_IDEMPOTENCY_KEY_MAXIMUM_LENGTH = 128;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PUBLIC_CODE_PATTERN = /^[0-9a-f]{48}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]+$/;

export type PublicChallengeStatus = "active" | "expired" | "revoked";

export type PublicChallengeProjection = Readonly<{
  challengeCode: string;
  displayName: string;
  edition: RegionKey;
  editionLabel: string;
  scoreToBeat: number;
  maximumScore: number;
  createdAt: number;
  expiresAt: number;
  status: PublicChallengeStatus;
}>;

export type PrivateChallengeCreationResponse = Readonly<{
  challenge: PublicChallengeProjection;
  challengeUrl: string;
  revocationToken: string | null;
  revocationTokenIssued: boolean;
}>;

export type ChallengeResultRecord = Readonly<{
  id: string;
  publicSlug: string;
  editionId: string;
  editionKey: string;
  editionLabel: string;
  score: number;
  total: number;
  scoringVersion: string;
  safeAvatarId: string | null;
  reviewedDisplayName: string | null;
  resultState: string;
  resultExpiresAt: number | null;
  attemptStatus: string;
  attemptCompletedAt: number | null;
  anonymousSubjectHash: string | null;
}>;

export type StoredChallengeRecord = Readonly<{
  id: string;
  publicCode: string;
  inviterResultId: string | null;
  anonymousSubjectHash: string | null;
  creationIdempotencyKeyHash: string | null;
  revocationTokenHash: string | null;
  editionKey: string;
  editionLabel: string;
  verifiedScoreToBeat: number;
  total: number;
  scoringVersion: string;
  reviewedInviterName: string | null;
  state: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
}>;

export type NewChallengeRecord = Readonly<{
  id: string;
  publicCode: string;
  inviterResultId: string;
  creationIdempotencyKeyHash: string;
  revocationTokenHash: string;
  editionId: string;
  verifiedScoreToBeat: number;
  total: number;
  scoringVersion: string;
  safeInviterAvatarId: string | null;
  reviewedInviterName: string | null;
  expiresAt: number;
  createdAt: number;
}>;

export type ChallengeInsertOutcome =
  | Readonly<{ kind: "created"; record: StoredChallengeRecord }>
  | Readonly<{ kind: "idempotency-conflict"; record: StoredChallengeRecord }>
  | Readonly<{ kind: "public-code-collision" | "revocation-hash-collision" | "record-id-collision" }>;

export interface ChallengeRepository {
  readonly storageAvailable: boolean;
  getCompletedResultByReference(resultReference: string): Promise<ChallengeResultRecord | null>;
  getChallengeByIdempotencyHash(idempotencyHash: string): Promise<StoredChallengeRecord | null>;
  getChallengeByPublicCode(publicCode: string): Promise<StoredChallengeRecord | null>;
  insertChallenge(record: NewChallengeRecord): Promise<ChallengeInsertOutcome>;
  revokeChallenge(publicCode: string, now: number): Promise<StoredChallengeRecord | null>;
}

export type ChallengeRateLimitDecision = "allowed" | "limited" | "unavailable";

export interface ChallengeCreationRateLimiter {
  consume(input: Readonly<{ anonymousSubjectHash: string; now: number }>): Promise<ChallengeRateLimitDecision>;
}

export type ChallengeRandomSource = (bytes: Uint8Array) => Uint8Array;

export class ChallengeServiceError extends Error {
  readonly code: string;
  readonly userMessage: string;

  constructor(code: string, userMessage = "We could not create that challenge. Please try again.") {
    super(code);
    this.name = "ChallengeServiceError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

function fail(code: string, userMessage?: string): never {
  throw new ChallengeServiceError(code, userMessage);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array | null {
  if (!SHA256_PATTERN.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)));
}

function secureHex(byteLength: number, randomSource: ChallengeRandomSource): string {
  const bytes = new Uint8Array(byteLength);
  const filled = randomSource(bytes);
  if (filled !== bytes || bytes.byteLength !== byteLength) fail("secure_random_unavailable");
  return bytesToHex(bytes);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function assertSha256Hash(value: string, field: string): string {
  if (!SHA256_PATTERN.test(value)) fail(`invalid_${field}_hash`);
  return value;
}

export function validateChallengeIdempotencyKey(value: string): string {
  if (
    typeof value !== "string"
    || value.length < CHALLENGE_IDEMPOTENCY_KEY_MINIMUM_LENGTH
    || value.length > CHALLENGE_IDEMPOTENCY_KEY_MAXIMUM_LENGTH
    || !IDEMPOTENCY_KEY_PATTERN.test(value)
  ) fail("invalid_idempotency_key");
  return value;
}

function validateResultReference(value: string): string {
  if (!PUBLIC_CODE_PATTERN.test(value)) fail("invalid_result_reference");
  return value;
}

function validateResult(
  record: ChallengeResultRecord | null,
  resultReference: string,
  subjectHash: string,
  now: number,
): ChallengeResultRecord {
  if (!record) return fail("result_unavailable");
  if (
    record.publicSlug !== resultReference
    || record.resultState !== "active"
    || (record.resultExpiresAt !== null && (!Number.isSafeInteger(record.resultExpiresAt) || record.resultExpiresAt <= now))
    || record.attemptStatus !== "completed"
    || record.attemptCompletedAt === null
    || !Number.isSafeInteger(record.attemptCompletedAt)
    || record.attemptCompletedAt < 0
    || record.attemptCompletedAt > now
  ) return fail("result_unavailable");
  if (!Number.isInteger(record.score) || !Number.isInteger(record.total)
    || record.total < 1 || record.total > 100 || record.score < 0 || record.score > record.total) {
    return fail("result_malformed");
  }
  if (!(record.editionKey in regions)) return fail("result_malformed");
  const edition = record.editionKey as RegionKey;
  if (
    regions[edition].name !== record.editionLabel
    || record.total !== regions[edition].questions.length
    || record.scoringVersion !== SCORING_VERSION
    || (record.safeAvatarId !== null && !isApprovedAvatarId(record.safeAvatarId))
  ) {
    return fail("result_malformed");
  }
  if (!record.anonymousSubjectHash || !SHA256_PATTERN.test(record.anonymousSubjectHash)) {
    return fail("result_unavailable");
  }
  const actual = hexToBytes(record.anonymousSubjectHash);
  const expected = hexToBytes(subjectHash);
  if (!actual || !expected || !constantTimeEqual(actual, expected)) return fail("result_unavailable");
  if (record.reviewedDisplayName) {
    const displayName = validateDisplayName(record.reviewedDisplayName);
    if (!displayName.valid || !displayName.value) return fail("result_malformed");
  }
  return record;
}

function challengeStatus(record: StoredChallengeRecord, now: number): PublicChallengeStatus | null {
  if (record.state === "revoked") return "revoked";
  if (record.state !== "active" && record.state !== "expired") return null;
  if (record.state === "expired" || record.expiresAt <= now) return "expired";
  return "active";
}

export function toPublicChallengeProjection(
  record: StoredChallengeRecord,
  now = Date.now(),
): PublicChallengeProjection | null {
  if (!PUBLIC_CODE_PATTERN.test(record.publicCode)) return null;
  const status = challengeStatus(record, now);
  if (!status || !(record.editionKey in regions)) return null;
  const edition = record.editionKey as RegionKey;
  if (
    regions[edition].name !== record.editionLabel
    || record.total !== regions[edition].questions.length
    || record.scoringVersion !== SCORING_VERSION
  ) return null;
  if (!Number.isInteger(record.verifiedScoreToBeat) || !Number.isInteger(record.total)
    || record.total < 1 || record.total > 100
    || record.verifiedScoreToBeat < 0 || record.verifiedScoreToBeat > record.total
    || !Number.isSafeInteger(record.createdAt) || !Number.isSafeInteger(record.expiresAt)
    || record.createdAt < 0 || record.expiresAt <= record.createdAt) return null;
  let displayName = publicDisplayNameFallback;
  if (record.reviewedInviterName) {
    const validation = validateDisplayName(record.reviewedInviterName);
    if (!validation.valid || !validation.value) return null;
    displayName = validation.value;
  }
  return Object.freeze({
    challengeCode: record.publicCode,
    displayName,
    edition,
    editionLabel: record.editionLabel,
    scoreToBeat: record.verifiedScoreToBeat,
    maximumScore: record.total,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    status,
  });
}

function defaultRandomSource(bytes: Uint8Array): Uint8Array {
  return crypto.getRandomValues(bytes);
}

function assertCreationHashes(record: NewChallengeRecord): void {
  assertSha256Hash(record.creationIdempotencyKeyHash, "creation_idempotency_key");
  assertSha256Hash(record.revocationTokenHash, "revocation_token");
}

function sameCreationAuthority(
  challenge: StoredChallengeRecord,
  result: ChallengeResultRecord,
  subjectHash: string,
): boolean {
  return challenge.inviterResultId === result.id
    && challenge.anonymousSubjectHash === subjectHash;
}

export class ChallengeService {
  private readonly repository: ChallengeRepository;
  private readonly rateLimiter: ChallengeCreationRateLimiter;
  private readonly options: Readonly<{
    randomSource?: ChallengeRandomSource;
    now?: () => number;
    publicOrigin?: PublicAppOrigin;
  }>;

  constructor(
    repository: ChallengeRepository,
    rateLimiter: ChallengeCreationRateLimiter,
    options: Readonly<{
      randomSource?: ChallengeRandomSource;
      now?: () => number;
      publicOrigin?: PublicAppOrigin;
    }> = {},
  ) {
    this.repository = repository;
    this.rateLimiter = rateLimiter;
    this.options = options;
  }

  async create(input: Readonly<{
    resultReference: string;
    idempotencyKey: string;
    anonymousSubjectHash: string;
  }>): Promise<PrivateChallengeCreationResponse> {
    if (!this.repository.storageAvailable) return fail("storage_unavailable");
    const now = this.options.now?.() ?? Date.now();
    const resultReference = validateResultReference(input.resultReference);
    const idempotencyKey = validateChallengeIdempotencyKey(input.idempotencyKey);
    const subjectHash = assertSha256Hash(input.anonymousSubjectHash, "anonymous_subject");
    const result = validateResult(
      await this.repository.getCompletedResultByReference(resultReference),
      resultReference,
      subjectHash,
      now,
    );
    const idempotencyHash = await sha256Hex(`wybp-challenge-create-v1\u0000${idempotencyKey}`);
    const existing = await this.repository.getChallengeByIdempotencyHash(idempotencyHash);
    if (existing) {
      if (!sameCreationAuthority(existing, result, subjectHash)) return fail("idempotency_reused");
      const challenge = toPublicChallengeProjection(existing, now);
      if (!challenge) return fail("challenge_unavailable");
      return Object.freeze({
        challenge,
        challengeUrl: createChallengeUrl(challenge.challengeCode, this.options.publicOrigin),
        revocationToken: null,
        revocationTokenIssued: false,
      });
    }
    const rateLimitDecision = await this.rateLimiter.consume({ anonymousSubjectHash: subjectHash, now });
    if (rateLimitDecision === "limited") {
      return fail("rate_limited", "Please wait a moment before creating another challenge.");
    }
    if (rateLimitDecision !== "allowed") return fail("rate_limit_unavailable");

    const randomSource = this.options.randomSource ?? defaultRandomSource;
    for (let attempt = 0; attempt < CHALLENGE_CREATION_COLLISION_LIMIT; attempt += 1) {
      const publicCode = secureHex(CHALLENGE_PUBLIC_CODE_BYTES, randomSource);
      const revocationToken = secureHex(CHALLENGE_REVOCATION_TOKEN_BYTES, randomSource);
      const revocationTokenHash = await sha256Hex(`wybp-challenge-revoke-v1\u0000${revocationToken}`);
      const record: NewChallengeRecord = Object.freeze({
        id: `challenge_${secureHex(CHALLENGE_PUBLIC_CODE_BYTES, randomSource)}`,
        publicCode,
        inviterResultId: result.id,
        creationIdempotencyKeyHash: idempotencyHash,
        revocationTokenHash,
        editionId: result.editionId,
        verifiedScoreToBeat: result.score,
        total: result.total,
        scoringVersion: result.scoringVersion,
        safeInviterAvatarId: result.safeAvatarId,
        reviewedInviterName: result.reviewedDisplayName,
        expiresAt: Math.min(now + CHALLENGE_RETENTION_MS, result.resultExpiresAt ?? Number.MAX_SAFE_INTEGER),
        createdAt: now,
      });
      assertCreationHashes(record);
      const outcome = await this.repository.insertChallenge(record);
      if (outcome.kind === "idempotency-conflict") {
        if (!sameCreationAuthority(outcome.record, result, subjectHash)) return fail("idempotency_reused");
        const challenge = toPublicChallengeProjection(outcome.record, now);
        if (!challenge) return fail("challenge_unavailable");
        return Object.freeze({
          challenge,
          challengeUrl: createChallengeUrl(challenge.challengeCode, this.options.publicOrigin),
          revocationToken: null,
          revocationTokenIssued: false,
        });
      }
      if (outcome.kind !== "created") continue;
      const challenge = toPublicChallengeProjection(outcome.record, now);
      if (!challenge) return fail("challenge_creation_invalid");
      return Object.freeze({
        challenge,
        challengeUrl: createChallengeUrl(challenge.challengeCode, this.options.publicOrigin),
        revocationToken,
        revocationTokenIssued: true,
      });
    }
    return fail("collision_exhausted");
  }

  async getPublic(publicCode: string): Promise<PublicChallengeProjection | null> {
    if (!this.repository.storageAvailable || !PUBLIC_CODE_PATTERN.test(publicCode)) return null;
    const record = await this.repository.getChallengeByPublicCode(publicCode);
    return record ? toPublicChallengeProjection(record, this.options.now?.() ?? Date.now()) : null;
  }

  async revoke(input: Readonly<{ publicCode: string; revocationToken: string }>): Promise<PublicChallengeProjection | null> {
    if (!this.repository.storageAvailable || !PUBLIC_CODE_PATTERN.test(input.publicCode)
      || !SHA256_PATTERN.test(input.revocationToken)) return null;
    const now = this.options.now?.() ?? Date.now();
    const record = await this.repository.getChallengeByPublicCode(input.publicCode);
    if (!record?.revocationTokenHash || !SHA256_PATTERN.test(record.revocationTokenHash)) return null;
    const presentedHash = await sha256Hex(`wybp-challenge-revoke-v1\u0000${input.revocationToken}`);
    const presented = hexToBytes(presentedHash);
    const expected = hexToBytes(record.revocationTokenHash);
    if (!presented || !expected || !constantTimeEqual(presented, expected)) return null;
    if (record.state === "revoked") return toPublicChallengeProjection(record, now);
    if (record.state !== "active") return toPublicChallengeProjection(record, now);
    const revoked = await this.repository.revokeChallenge(input.publicCode, now);
    return revoked ? toPublicChallengeProjection(revoked, now) : null;
  }
}

export class InMemoryChallengeRateLimiter implements ChallengeCreationRateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly maximumAttempts: number;
  private readonly windowMs: number;
  private readonly available: boolean;

  constructor(
    maximumAttempts = 3,
    windowMs = 60_000,
    available = true,
  ) {
    this.maximumAttempts = maximumAttempts;
    this.windowMs = windowMs;
    this.available = available;
  }

  async consume(input: Readonly<{ anonymousSubjectHash: string; now: number }>): Promise<ChallengeRateLimitDecision> {
    if (!this.available || !SHA256_PATTERN.test(input.anonymousSubjectHash)) return "unavailable";
    const cutoff = input.now - this.windowMs;
    const recent = (this.attempts.get(input.anonymousSubjectHash) || []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= this.maximumAttempts) return "limited";
    recent.push(input.now);
    this.attempts.set(input.anonymousSubjectHash, recent);
    return "allowed";
  }
}

type ChallengeRow = {
  id: string;
  public_code: string;
  inviter_result_id: string | null;
  anonymous_subject_hash: string | null;
  creation_idempotency_key_hash: string | null;
  revocation_token_hash: string | null;
  edition_key: string;
  edition_label: string;
  verified_score_to_beat: number;
  total: number;
  scoring_version: string;
  reviewed_inviter_name: string | null;
  state: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
};

const CHALLENGE_SELECT = `SELECT
  c.id, c.public_code, c.inviter_result_id, qa.anonymous_subject_hash,
  c.creation_idempotency_key_hash, c.revocation_token_hash,
  qe.edition_key, qe.name AS edition_label, c.verified_score_to_beat, c.total,
  c.scoring_version, c.reviewed_inviter_name, c.state, c.created_at, c.expires_at, c.revoked_at
FROM challenges c
JOIN quiz_editions qe ON qe.id = c.edition_id
LEFT JOIN results r ON r.id = c.inviter_result_id
LEFT JOIN quiz_attempts qa ON qa.id = r.attempt_id`;

function storedChallenge(row: ChallengeRow): StoredChallengeRecord {
  return Object.freeze({
    id: row.id,
    publicCode: row.public_code,
    inviterResultId: row.inviter_result_id,
    anonymousSubjectHash: row.anonymous_subject_hash,
    creationIdempotencyKeyHash: row.creation_idempotency_key_hash,
    revocationTokenHash: row.revocation_token_hash,
    editionKey: row.edition_key,
    editionLabel: row.edition_label,
    verifiedScoreToBeat: row.verified_score_to_beat,
    total: row.total,
    scoringVersion: row.scoring_version,
    reviewedInviterName: row.reviewed_inviter_name,
    state: row.state,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  });
}

async function first<T extends Record<string, unknown>>(
  database: AtomicD1Database,
  query: string,
  values: readonly unknown[],
): Promise<T | null> {
  return database.prepare(query).bind(...values).first<T>();
}

export class D1ChallengeRepository implements ChallengeRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;

  constructor(database: AtomicD1Database) {
    this.database = database;
  }

  async getCompletedResultByReference(resultReference: string): Promise<ChallengeResultRecord | null> {
    const row = await first<{
      id: string; public_slug: string; edition_id: string; edition_key: string; edition_label: string;
      score: number; total: number; scoring_version: string; safe_avatar_id: string | null;
      reviewed_display_name: string | null; result_state: string; result_expires_at: number | null;
      attempt_status: string; attempt_completed_at: number | null; anonymous_subject_hash: string | null;
    }>(this.database, `SELECT
      r.id, r.public_slug, r.edition_id, qe.edition_key, qe.name AS edition_label,
      r.score, r.total, r.scoring_version, r.safe_avatar_id, r.reviewed_display_name,
      r.state AS result_state, r.expires_at AS result_expires_at,
      qa.status AS attempt_status, qa.completed_at AS attempt_completed_at, qa.anonymous_subject_hash
    FROM results r
    JOIN quiz_attempts qa ON qa.id = r.attempt_id
    JOIN quiz_editions qe ON qe.id = r.edition_id
    WHERE r.public_slug = ?1
    LIMIT 1`, [resultReference]);
    return row ? Object.freeze({
      id: row.id,
      publicSlug: row.public_slug,
      editionId: row.edition_id,
      editionKey: row.edition_key,
      editionLabel: row.edition_label,
      score: row.score,
      total: row.total,
      scoringVersion: row.scoring_version,
      safeAvatarId: row.safe_avatar_id,
      reviewedDisplayName: row.reviewed_display_name,
      resultState: row.result_state,
      resultExpiresAt: row.result_expires_at,
      attemptStatus: row.attempt_status,
      attemptCompletedAt: row.attempt_completed_at,
      anonymousSubjectHash: row.anonymous_subject_hash,
    }) : null;
  }

  async getChallengeByIdempotencyHash(idempotencyHash: string): Promise<StoredChallengeRecord | null> {
    const row = await first<ChallengeRow>(this.database,
      `${CHALLENGE_SELECT} WHERE c.creation_idempotency_key_hash = ?1 LIMIT 1`, [idempotencyHash]);
    return row ? storedChallenge(row) : null;
  }

  async getChallengeByPublicCode(publicCode: string): Promise<StoredChallengeRecord | null> {
    const row = await first<ChallengeRow>(this.database,
      `${CHALLENGE_SELECT} WHERE c.public_code = ?1 LIMIT 1`, [publicCode]);
    return row ? storedChallenge(row) : null;
  }

  async insertChallenge(record: NewChallengeRecord): Promise<ChallengeInsertOutcome> {
    assertCreationHashes(record);
    try {
      await this.database.prepare(`INSERT INTO challenges (
        id, public_code, inviter_result_id, creation_idempotency_key_hash, revocation_token_hash,
        edition_id, verified_score_to_beat, total, scoring_version, safe_inviter_avatar_id,
        reviewed_inviter_name, state, use_limit, use_count, expires_at, version, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'active', NULL, 0, ?12, 1, ?13, ?13)`)
        .bind(
          record.id, record.publicCode, record.inviterResultId, record.creationIdempotencyKeyHash,
          record.revocationTokenHash, record.editionId, record.verifiedScoreToBeat, record.total,
          record.scoringVersion, record.safeInviterAvatarId, record.reviewedInviterName,
          record.expiresAt, record.createdAt,
        ).run();
    } catch {
      const idempotent = await this.getChallengeByIdempotencyHash(record.creationIdempotencyKeyHash);
      if (idempotent) return Object.freeze({ kind: "idempotency-conflict", record: idempotent });
      if (await this.getChallengeByPublicCode(record.publicCode)) return Object.freeze({ kind: "public-code-collision" });
      const revocation = await first<{ id: string }>(this.database,
        "SELECT id FROM challenges WHERE revocation_token_hash = ?1 LIMIT 1", [record.revocationTokenHash]);
      if (revocation) return Object.freeze({ kind: "revocation-hash-collision" });
      const id = await first<{ id: string }>(this.database,
        "SELECT id FROM challenges WHERE id = ?1 LIMIT 1", [record.id]);
      if (id) return Object.freeze({ kind: "record-id-collision" });
      throw new ChallengeServiceError("challenge_insert_failed");
    }
    const created = await this.getChallengeByPublicCode(record.publicCode);
    if (!created) return fail("challenge_insert_failed");
    return Object.freeze({ kind: "created", record: created });
  }

  async revokeChallenge(publicCode: string, now: number): Promise<StoredChallengeRecord | null> {
    await this.database.prepare(`UPDATE challenges
      SET state = 'revoked', revoked_at = ?2, updated_at = ?2, version = version + 1
      WHERE public_code = ?1 AND state = 'active'`).bind(publicCode, now).run();
    return this.getChallengeByPublicCode(publicCode);
  }
}

export const CHALLENGE_SHARE_SAFEGUARD = PRODUCT_SAFEGUARD;
