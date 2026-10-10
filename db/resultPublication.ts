import { createResultUrl, type PublicAppOrigin } from "../app/publicAppOrigin.ts";
import { deriveAnonymousSubjectHash } from "../app/anonymousSession.ts";
import { constantTimeEqual } from "./deletionReadiness.ts";
import {
  toPublicResult,
  type PublicResultData,
  type ResultRecord,
  type ResultVisibility,
} from "./dataContracts.ts";
import type { AtomicD1Database } from "./repositories.ts";
import type {
  ChallengeCreationRateLimiter,
  ChallengeRateLimitDecision,
} from "./challengeService.ts";

const PUBLIC_SLUG_PATTERN = /^[0-9a-f]{48}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const RESULT_PUBLICATION_DISCLOSURE = Object.freeze([
  "Your score and total",
  "Your African regional edition",
  "Your result title or mastery seal",
  "An approved avatar",
  "The neutral identity A challenger",
  "A playful culture score, never a measure of human worth.",
] as const);

export type OwnedResultRecord = ResultRecord & Readonly<{
  attemptStatus: string;
  attemptCompletedAt: number | null;
  attemptExpiresAt: number | null;
  anonymousSubjectHash: string | null;
}>;

export type ResultPublicationResponse = Readonly<{
  published: boolean;
  visibility: ResultVisibility;
  resultUrl: string | null;
  result: PublicResultData | null;
}>;

export interface ResultPublicationRepository {
  readonly storageAvailable: boolean;
  getOwnedResult(publicSlug: string): Promise<OwnedResultRecord | null>;
  setVisibility(input: Readonly<{
    resultId: string;
    anonymousSubjectHash: string;
    visibility: ResultVisibility;
    now: number;
  }>): Promise<OwnedResultRecord | null>;
}

export class ResultPublicationError extends Error {
  readonly code: string;
  readonly publicMessage: string;

  constructor(code: string, publicMessage: string) {
    super(publicMessage);
    this.name = "ResultPublicationError";
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

function fail(code: string, message = "This result is no longer available."): never {
  throw new ResultPublicationError(code, message);
}

function equalHash(left: string | null, right: string): boolean {
  if (!left || !SHA256_PATTERN.test(left) || !SHA256_PATTERN.test(right)) return false;
  const toBytes = (value: string) => Uint8Array.from(value.match(/.{2}/g) || [], (pair) => Number.parseInt(pair, 16));
  return constantTimeEqual(toBytes(left), toBytes(right));
}

function validateAuthority(record: OwnedResultRecord | null, slug: string, subjectHash: string, now: number): OwnedResultRecord {
  if (
    !record
    || record.publicSlug !== slug
    || record.state !== "active"
    || (record.expiresAt !== null && record.expiresAt <= now)
    || record.attemptStatus !== "completed"
    || record.attemptCompletedAt === null
    || record.attemptExpiresAt === null
    || record.attemptExpiresAt <= now
    || !equalHash(record.anonymousSubjectHash, subjectHash)
  ) return fail("result_unavailable");
  return record;
}

export class ResultPublicationService {
  private readonly repository: ResultPublicationRepository;
  private readonly rateLimiter: ChallengeCreationRateLimiter;
  private readonly options: Readonly<{ now?: () => number; publicOrigin?: PublicAppOrigin }>;

  constructor(
    repository: ResultPublicationRepository,
    rateLimiter: ChallengeCreationRateLimiter,
    options: Readonly<{ now?: () => number; publicOrigin?: PublicAppOrigin }> = {},
  ) {
    this.repository = repository;
    this.rateLimiter = rateLimiter;
    this.options = options;
  }

  async setVisibility(input: Readonly<{
    resultSlug: unknown;
    anonymousSessionCredential: unknown;
    action: unknown;
  }>): Promise<ResultPublicationResponse> {
    if (!this.repository.storageAvailable) return fail("storage_unavailable");
    if (typeof input.resultSlug !== "string" || !PUBLIC_SLUG_PATTERN.test(input.resultSlug)) return fail("result_unavailable");
    if (typeof input.anonymousSessionCredential !== "string" || !/^[0-9a-f]{32}$/.test(input.anonymousSessionCredential)) return fail("result_unavailable");
    if (input.action !== "publish" && input.action !== "unpublish") return fail("invalid_action", "We could not update this result right now.");
    const now = this.options.now?.() ?? Date.now();
    const anonymousSubjectHash = await deriveAnonymousSubjectHash(input.anonymousSessionCredential);
    if (!anonymousSubjectHash) return fail("result_unavailable");
    const current = validateAuthority(
      await this.repository.getOwnedResult(input.resultSlug),
      input.resultSlug,
      anonymousSubjectHash,
      now,
    );
    const visibility: ResultVisibility = input.action === "publish" ? "public" : "private";
    if (current.visibility !== visibility) {
      const decision: ChallengeRateLimitDecision = await this.rateLimiter.consume({
        anonymousSubjectHash,
        now,
      });
      if (decision === "limited") return fail("rate_limited", "Please wait a moment before changing result sharing again.");
      if (decision !== "allowed") return fail("rate_limit_unavailable", "We could not update this result right now.");
    }
    const updated = current.visibility === visibility
      ? current
      : await this.repository.setVisibility({
          resultId: current.id,
          anonymousSubjectHash,
          visibility,
          now,
        });
    const authoritative = validateAuthority(updated, input.resultSlug, anonymousSubjectHash, now);
    if (authoritative.visibility !== visibility) return fail("publication_conflict", "We could not update this result right now.");
    const result = visibility === "public" ? toPublicResult(authoritative, now) : null;
    if (visibility === "public" && !result) return fail("publication_conflict", "We could not update this result right now.");
    return Object.freeze({
      published: visibility === "public",
      visibility,
      resultUrl: result ? createResultUrl(result.resultSlug, this.options.publicOrigin) : null,
      result,
    });
  }
}

type D1OwnedResultRow = Readonly<{
  id: string;
  public_slug: string;
  edition_key: string;
  score: number;
  total: number;
  tier: number;
  scoring_version: string;
  safe_avatar_id: string | null;
  reviewed_display_name: string | null;
  safeguard_version: string;
  visibility: ResultVisibility;
  state: ResultRecord["state"];
  created_at: number;
  expires_at: number | null;
  attempt_status: string;
  attempt_completed_at: number | null;
  attempt_expires_at: number | null;
  anonymous_subject_hash: string | null;
}>;

function fromRow(row: D1OwnedResultRow): OwnedResultRecord {
  return Object.freeze({
    id: row.id,
    publicSlug: row.public_slug,
    editionKey: row.edition_key,
    score: row.score,
    total: row.total,
    tier: row.tier,
    scoringVersion: row.scoring_version,
    safeAvatarId: row.safe_avatar_id,
    reviewedDisplayName: row.reviewed_display_name,
    safeguardVersion: row.safeguard_version,
    visibility: row.visibility,
    state: row.state,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    attemptStatus: row.attempt_status,
    attemptCompletedAt: row.attempt_completed_at,
    attemptExpiresAt: row.attempt_expires_at,
    anonymousSubjectHash: row.anonymous_subject_hash,
  });
}

export class D1ResultPublicationRepository implements ResultPublicationRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;

  constructor(database: AtomicD1Database) { this.database = database; }

  async getOwnedResult(publicSlug: string): Promise<OwnedResultRecord | null> {
    const row = await this.database.prepare(`SELECT
      r.id, r.public_slug, qe.edition_key, r.score, r.total, r.tier, r.scoring_version,
      r.safe_avatar_id, r.reviewed_display_name, r.safeguard_version, r.visibility,
      r.state, r.created_at, r.expires_at, qa.status AS attempt_status,
      qa.completed_at AS attempt_completed_at, qa.expires_at AS attempt_expires_at,
      qa.anonymous_subject_hash
    FROM results r
    JOIN quiz_attempts qa ON qa.id = r.attempt_id
    JOIN quiz_editions qe ON qe.id = r.edition_id
    WHERE r.public_slug = ?1
    LIMIT 1`).bind(publicSlug).first<D1OwnedResultRow>();
    return row ? fromRow(row) : null;
  }

  async setVisibility(input: Readonly<{
    resultId: string;
    anonymousSubjectHash: string;
    visibility: ResultVisibility;
    now: number;
  }>): Promise<OwnedResultRecord | null> {
    await this.database.prepare(`UPDATE results SET visibility = ?1, updated_at = ?2
      WHERE id = ?3 AND state = 'active' AND (expires_at IS NULL OR expires_at > ?2)
        AND EXISTS (
          SELECT 1 FROM quiz_attempts qa
          WHERE qa.id = results.attempt_id AND qa.status = 'completed'
            AND qa.completed_at IS NOT NULL AND qa.expires_at > ?2
            AND qa.anonymous_subject_hash = ?4
        )`).bind(input.visibility, input.now, input.resultId, input.anonymousSubjectHash).run();
    const row = await this.database.prepare(`SELECT public_slug FROM results WHERE id = ?1 LIMIT 1`)
      .bind(input.resultId).first<{ public_slug: string }>();
    return row ? this.getOwnedResult(row.public_slug) : null;
  }
}
