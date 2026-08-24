import { regions, type RegionKey } from "../app/gameData.ts";
import { constantTimeEqual } from "./deletionReadiness.ts";
import type { AtomicD1Database } from "./repositories.ts";
import { QUESTION_SET_VERSION, SCORING_VERSION } from "./seeds/development.ts";
import type {
  ChallengeCreationRateLimiter,
  ChallengeRandomSource,
} from "./challengeService.ts";

export const CHALLENGE_ACCEPTANCE_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const CHALLENGE_ACCEPTANCE_COLLISION_LIMIT = 5;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PUBLIC_CODE_PATTERN = /^[0-9a-f]{48}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;

export type ChallengeAcceptancePublicData = Readonly<{
  challengeCode: string;
  edition: RegionKey;
  editionLabel: string;
  accepted: true;
  reused: boolean;
}>;

export type ChallengeForAcceptance = Readonly<{
  id: string;
  publicCode: string;
  editionId: string;
  editionKey: string;
  editionLabel: string;
  scoringVersion: string;
  total: number;
  expiresAt: number;
}>;

export type StoredChallengeAcceptance = Readonly<{
  challengePublicCode: string;
  anonymousSubjectHash: string;
  editionKey: string;
  editionLabel: string;
  state: string;
  expiresAt: number;
}>;

export type NewChallengeAcceptance = Readonly<{
  challengeId: string;
  challengePublicCode: string;
  challengeAttemptId: string;
  quizAttemptId: string;
  anonymousSubjectHash: string;
  acceptanceIdempotencyHash: string;
  quizAttemptIdempotencyHash: string;
  editionId: string;
  scoringVersion: string;
  selectedQuestionVersionsJson: string;
  acceptedAt: number;
  expiresAt: number;
}>;

export type ChallengeAcceptanceInsertOutcome =
  | Readonly<{ kind: "created"; record: StoredChallengeAcceptance }>
  | Readonly<{ kind: "idempotency-conflict"; record: StoredChallengeAcceptance }>
  | Readonly<{ kind: "collision" }>
  | Readonly<{ kind: "unavailable" }>;

export interface ChallengeAcceptanceRepository {
  readonly storageAvailable: boolean;
  getActiveChallenge(publicCode: string, now: number): Promise<ChallengeForAcceptance | null>;
  getAcceptanceByIdempotencyHash(idempotencyHash: string): Promise<StoredChallengeAcceptance | null>;
  insertAcceptance(record: NewChallengeAcceptance): Promise<ChallengeAcceptanceInsertOutcome>;
}

export class ChallengeAcceptanceError extends Error {
  readonly code: string;
  readonly publicMessage: string;

  constructor(code: string, publicMessage = "This challenge is no longer available.") {
    super(code);
    this.name = "ChallengeAcceptanceError";
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

function fail(code: string, publicMessage?: string): never {
  throw new ChallengeAcceptanceError(code, publicMessage);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array | null {
  if (!SHA256_PATTERN.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16)));
}

function defaultRandomSource(bytes: Uint8Array): Uint8Array {
  return crypto.getRandomValues(bytes);
}

function secureHex(byteLength: number, randomSource: ChallengeRandomSource): string {
  const bytes = new Uint8Array(byteLength);
  const filled = randomSource(bytes);
  if (filled !== bytes) return fail("secure_random_unavailable", "Please try again.");
  return bytesToHex(bytes);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function subjectHashesMatch(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  return Boolean(leftBytes && rightBytes && constantTimeEqual(leftBytes, rightBytes));
}

export function isChallengePublicCode(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_CODE_PATTERN.test(value);
}

export function validateChallengeAcceptanceInput(input: Readonly<{
  publicCode: unknown;
  idempotencyKey: unknown;
  anonymousSubjectHash: unknown;
}>): Readonly<{ publicCode: string; idempotencyKey: string; anonymousSubjectHash: string }> {
  if (!isChallengePublicCode(input.publicCode)) return fail("invalid_challenge_code");
  if (typeof input.idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
    return fail("invalid_idempotency_key", "Please refresh and try again.");
  }
  if (typeof input.anonymousSubjectHash !== "string" || !SHA256_PATTERN.test(input.anonymousSubjectHash)) {
    return fail("invalid_anonymous_subject", "Please refresh and try again.");
  }
  return Object.freeze({
    publicCode: input.publicCode,
    idempotencyKey: input.idempotencyKey,
    anonymousSubjectHash: input.anonymousSubjectHash,
  });
}

function questionVersionSnapshot(edition: RegionKey): string {
  return JSON.stringify(regions[edition].questions.map((_, index) => ({
    stableId: `${edition}_q${String(index + 1).padStart(2, "0")}`,
    version: 1,
  })));
}

function publicAcceptance(record: StoredChallengeAcceptance, reused: boolean): ChallengeAcceptancePublicData {
  if (!isChallengePublicCode(record.challengePublicCode) || !(record.editionKey in regions)) {
    return fail("acceptance_projection_invalid", "Please try again.");
  }
  const edition = record.editionKey as RegionKey;
  if (regions[edition].name !== record.editionLabel) return fail("acceptance_projection_invalid", "Please try again.");
  return Object.freeze({
    challengeCode: record.challengePublicCode,
    edition,
    editionLabel: record.editionLabel,
    accepted: true,
    reused,
  });
}

function sameAcceptanceAuthority(
  record: StoredChallengeAcceptance,
  publicCode: string,
  anonymousSubjectHash: string,
): boolean {
  return record.challengePublicCode === publicCode
    && subjectHashesMatch(record.anonymousSubjectHash, anonymousSubjectHash);
}

export class ChallengeAcceptanceService {
  private readonly repository: ChallengeAcceptanceRepository;
  private readonly rateLimiter: ChallengeCreationRateLimiter;
  private readonly options: Readonly<{ now?: () => number; randomSource?: ChallengeRandomSource }>;

  constructor(
    repository: ChallengeAcceptanceRepository,
    rateLimiter: ChallengeCreationRateLimiter,
    options: Readonly<{ now?: () => number; randomSource?: ChallengeRandomSource }> = {},
  ) {
    this.repository = repository;
    this.rateLimiter = rateLimiter;
    this.options = options;
  }

  async accept(input: Readonly<{
    publicCode: unknown;
    idempotencyKey: unknown;
    anonymousSubjectHash: unknown;
  }>): Promise<ChallengeAcceptancePublicData> {
    if (!this.repository.storageAvailable) return fail("storage_unavailable");
    const validated = validateChallengeAcceptanceInput(input);
    const now = this.options.now?.() ?? Date.now();
    const acceptanceIdempotencyHash = await sha256Hex(
      `wybp-challenge-accept-v1\u0000${validated.idempotencyKey}`,
    );
    const existing = await this.repository.getAcceptanceByIdempotencyHash(acceptanceIdempotencyHash);
    if (existing) {
      if (!sameAcceptanceAuthority(existing, validated.publicCode, validated.anonymousSubjectHash)) {
        return fail("acceptance_idempotency_reused", "Please refresh and try again.");
      }
      return publicAcceptance(existing, true);
    }

    const rateLimit = await this.rateLimiter.consume({
      anonymousSubjectHash: validated.anonymousSubjectHash,
      now,
    });
    if (rateLimit === "limited") return fail("rate_limited", "Please wait a moment and try again.");
    if (rateLimit !== "allowed") return fail("rate_limit_unavailable", "Please try again.");

    const challenge = await this.repository.getActiveChallenge(validated.publicCode, now);
    if (
      !challenge
      || !(challenge.editionKey in regions)
      || challenge.editionLabel !== regions[challenge.editionKey as RegionKey].name
      || challenge.total !== regions[challenge.editionKey as RegionKey].questions.length
      || challenge.scoringVersion !== SCORING_VERSION
      || challenge.expiresAt <= now
    ) return fail("challenge_unavailable");

    const edition = challenge.editionKey as RegionKey;
    const randomSource = this.options.randomSource ?? defaultRandomSource;
    for (let attempt = 0; attempt < CHALLENGE_ACCEPTANCE_COLLISION_LIMIT; attempt += 1) {
      const quizAttemptId = `attempt_${secureHex(24, randomSource)}`;
      const record: NewChallengeAcceptance = Object.freeze({
        challengeId: challenge.id,
        challengePublicCode: challenge.publicCode,
        challengeAttemptId: `challenge_attempt_${secureHex(24, randomSource)}`,
        quizAttemptId,
        anonymousSubjectHash: validated.anonymousSubjectHash,
        acceptanceIdempotencyHash,
        quizAttemptIdempotencyHash: await sha256Hex(
          `wybp-challenge-recipient-attempt-v1\u0000${validated.idempotencyKey}`,
        ),
        editionId: challenge.editionId,
        scoringVersion: challenge.scoringVersion,
        selectedQuestionVersionsJson: questionVersionSnapshot(edition),
        acceptedAt: now,
        expiresAt: Math.min(now + CHALLENGE_ACCEPTANCE_LIFETIME_MS, challenge.expiresAt),
      });
      const outcome = await this.repository.insertAcceptance(record);
      if (outcome.kind === "collision") continue;
      if (outcome.kind === "unavailable") return fail("challenge_unavailable");
      if (!sameAcceptanceAuthority(outcome.record, validated.publicCode, validated.anonymousSubjectHash)) {
        return fail("acceptance_idempotency_reused", "Please refresh and try again.");
      }
      return publicAcceptance(outcome.record, outcome.kind === "idempotency-conflict");
    }
    return fail("collision_exhausted", "Please try again.");
  }
}

type AcceptanceRow = {
  public_code: string;
  anonymous_subject_hash: string | null;
  edition_key: string;
  edition_label: string;
  acceptance_state: string;
  acceptance_expires_at: number;
};

async function first<T extends Record<string, unknown>>(
  database: AtomicD1Database,
  query: string,
  values: readonly unknown[],
): Promise<T | null> {
  return database.prepare(query).bind(...values).first<T>();
}

function storedAcceptance(row: AcceptanceRow): StoredChallengeAcceptance | null {
  if (!row.anonymous_subject_hash || !SHA256_PATTERN.test(row.anonymous_subject_hash)) return null;
  return Object.freeze({
    challengePublicCode: row.public_code,
    anonymousSubjectHash: row.anonymous_subject_hash,
    editionKey: row.edition_key,
    editionLabel: row.edition_label,
    state: row.acceptance_state,
    expiresAt: row.acceptance_expires_at,
  });
}

export class D1ChallengeAcceptanceRepository implements ChallengeAcceptanceRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;

  constructor(database: AtomicD1Database) {
    this.database = database;
  }

  async getActiveChallenge(publicCode: string, now: number): Promise<ChallengeForAcceptance | null> {
    const row = await first<{
      id: string;
      public_code: string;
      edition_id: string;
      edition_key: string;
      edition_label: string;
      scoring_version: string;
      total: number;
      expires_at: number;
    }>(this.database, `SELECT
      c.id, c.public_code, c.edition_id, qe.edition_key, qe.name AS edition_label,
      c.scoring_version, c.total, c.expires_at
    FROM challenges c
    JOIN quiz_editions qe ON qe.id = c.edition_id
    JOIN results r ON r.id = c.inviter_result_id
    WHERE c.public_code = ?1
      AND c.state = 'active'
      AND c.expires_at > ?2
      AND (c.use_limit IS NULL OR c.use_count < c.use_limit)
      AND r.state = 'active'
      AND (r.expires_at IS NULL OR r.expires_at > ?2)
    LIMIT 1`, [publicCode, now]);
    return row ? Object.freeze({
      id: row.id,
      publicCode: row.public_code,
      editionId: row.edition_id,
      editionKey: row.edition_key,
      editionLabel: row.edition_label,
      scoringVersion: row.scoring_version,
      total: row.total,
      expiresAt: row.expires_at,
    }) : null;
  }

  async getAcceptanceByIdempotencyHash(idempotencyHash: string): Promise<StoredChallengeAcceptance | null> {
    const row = await first<AcceptanceRow>(this.database, `SELECT
      c.public_code, qa.anonymous_subject_hash, qe.edition_key, qe.name AS edition_label,
      ca.state AS acceptance_state, ca.expires_at AS acceptance_expires_at
    FROM challenge_attempts ca
    JOIN challenges c ON c.id = ca.challenge_id
    JOIN quiz_attempts qa ON qa.id = ca.recipient_attempt_id
    JOIN quiz_editions qe ON qe.id = qa.edition_id
    WHERE ca.idempotency_key_hash = ?1
    LIMIT 1`, [idempotencyHash]);
    return row ? storedAcceptance(row) : null;
  }

  async insertAcceptance(record: NewChallengeAcceptance): Promise<ChallengeAcceptanceInsertOutcome> {
    let batchResults: readonly D1Result[];
    try {
      batchResults = await this.database.batch([
        this.database.prepare(`UPDATE challenges
          SET use_count = use_count + 1, updated_at = ?2, version = version + 1
          WHERE id = ?1
            AND public_code = ?3
            AND state = 'active'
            AND expires_at > ?2
            AND (use_limit IS NULL OR use_count < use_limit)
            AND EXISTS (
              SELECT 1 FROM results r
              WHERE r.id = challenges.inviter_result_id
                AND r.state = 'active'
                AND (r.expires_at IS NULL OR r.expires_at > ?2)
            )
            AND NOT EXISTS (
              SELECT 1 FROM challenge_attempts existing
              WHERE existing.idempotency_key_hash = ?4
            )`).bind(
          record.challengeId,
          record.acceptedAt,
          record.challengePublicCode,
          record.acceptanceIdempotencyHash,
        ),
        this.database.prepare(`INSERT INTO quiz_attempts (
          id, edition_id, anonymous_subject_hash, question_set_version, scoring_version,
          selected_question_versions_json, status, idempotency_key_hash, referral_code,
          challenge_code, started_at, completed_at, expires_at, version, created_at, updated_at
        )
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'in_progress', ?7, ?8, ?8, ?9, NULL, ?10, 1, ?9, ?9
        WHERE changes() = 1`).bind(
          record.quizAttemptId,
          record.editionId,
          record.anonymousSubjectHash,
          QUESTION_SET_VERSION,
          record.scoringVersion,
          record.selectedQuestionVersionsJson,
          record.quizAttemptIdempotencyHash,
          record.challengePublicCode,
          record.acceptedAt,
          record.expiresAt,
        ),
        this.database.prepare(`INSERT INTO challenge_attempts (
          id, challenge_id, recipient_attempt_id, recipient_subject_hash,
          idempotency_key_hash, scoring_version, outcome, state, accepted_at,
          completed_at, expires_at, version, created_at, updated_at
        )
        SELECT ?1, ?2, qa.id, qa.anonymous_subject_hash, ?4, ?5,
          'pending', 'accepted', ?6, NULL, ?7, 1, ?6, ?6
        FROM quiz_attempts qa
        WHERE qa.id = ?3 AND qa.anonymous_subject_hash IS NOT NULL AND changes() = 1`).bind(
          record.challengeAttemptId,
          record.challengeId,
          record.quizAttemptId,
          record.acceptanceIdempotencyHash,
          record.scoringVersion,
          record.acceptedAt,
          record.expiresAt,
        ),
      ]);
    } catch {
      const existing = await this.getAcceptanceByIdempotencyHash(record.acceptanceIdempotencyHash);
      return existing
        ? Object.freeze({ kind: "idempotency-conflict", record: existing })
        : Object.freeze({ kind: "collision" });
    }
    const created = await this.getAcceptanceByIdempotencyHash(record.acceptanceIdempotencyHash);
    if (!created) return Object.freeze({ kind: "unavailable" });
    const challengeAttemptChanges = Number(batchResults[2]?.meta?.changes || 0);
    return challengeAttemptChanges === 1
      ? Object.freeze({ kind: "created", record: created })
      : Object.freeze({ kind: "idempotency-conflict", record: created });
  }
}
