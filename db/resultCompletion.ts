import { isApprovedAvatarId } from "../app/avatarRegistry.ts";
import { calculateResultTier } from "../app/gameLogic.ts";
import { regions, type RegionKey } from "../app/gameData.ts";
import { deriveCommerceOwnerHash } from "./commerceContracts.ts";
import {
  CHALLENGE_DIFFICULTY_POLICY,
  CHALLENGE_SCORING_WEIGHT_POLICY,
  type ChallengeAnswerSubmission,
} from "./challengeCompletion.ts";
import type { AtomicD1Database, BoundStatement } from "./repositories.ts";
import { QUESTION_SET_VERSION, SCORING_VERSION } from "./seeds/development.ts";

export const RESULT_COMPLETION_RETENTION_MS = 90 * 86_400_000;
export const RESULT_COMPLETION_COLLISION_LIMIT = 5;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const QUESTION_ID_PATTERN = /^(west|east|central|north|south)_[a-z0-9][a-z0-9_-]{2,55}$/;
const OPTION_ID_PATTERN = /^o[1-9][0-9]?$/;

export type ResultCompletionProjection = Readonly<{ resultSlug: string }>;

export type AuthoritativeResultQuestion = Readonly<{
  id: string;
  stableId: string;
  version: number;
  optionIds: readonly string[];
  correctOptionIds: readonly string[];
  acceptedOptionSets: readonly (readonly string[])[];
  scoringWeight: number;
}>;

export type ExistingCompletedResult = Readonly<{
  publicSlug: string;
  edition: RegionKey;
  anonymousOwnerHash: string;
}>;

export type NewCompletedResult = Readonly<{
  attemptId: string;
  resultId: string;
  resultPublicSlug: string;
  editionId: string;
  edition: RegionKey;
  anonymousOwnerHash: string;
  idempotencyHash: string;
  safeAvatarId: string;
  answers: readonly Readonly<{
    id: string;
    questionId: string;
    questionVersion: number;
    selectedOptionIdsJson: string;
    isCorrect: boolean;
    scoreAwarded: number;
  }>[];
  selectedQuestionVersionsJson: string;
  score: number;
  total: number;
  tier: number;
  scoringSnapshotJson: string;
  completedAt: number;
  expiresAt: number;
}>;

export type ResultCompletionInsertOutcome = "created" | "collision";

export interface ResultCompletionRepository {
  readonly storageAvailable: boolean;
  getByIdempotencyHash(idempotencyHash: string): Promise<ExistingCompletedResult | null>;
  getAuthority(questionStableIds: readonly string[], now?: number): Promise<Readonly<{ editionId: string; edition: RegionKey; questions: readonly AuthoritativeResultQuestion[] }> | null>;
  completeAtomically(record: NewCompletedResult): Promise<ResultCompletionInsertOutcome>;
}

export class ResultCompletionError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ResultCompletionError";
    this.code = code;
  }
}

function fail(code: string): never { throw new ResultCompletionError(code); }

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function exactSet(left: readonly string[], right: readonly string[]): boolean {
  const sortedRight = [...right].sort();
  return left.length === right.length && [...left].sort().every((value, index) => value === sortedRight[index]);
}

function secureHex(byteLength: number, randomSource: (bytes: Uint8Array) => Uint8Array): string {
  const bytes = new Uint8Array(byteLength);
  if (randomSource(bytes) !== bytes) return fail("secure_random_unavailable");
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateResultCompletionRequest(value: unknown): Readonly<{
  anonymousSessionCredential: string;
  idempotencyKey: string;
  avatarId: string;
  answers: readonly ChallengeAnswerSubmission[];
}> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("completion_request_invalid");
  const candidate = value as Record<string, unknown>;
  if (!exactKeys(candidate, ["anonymousSessionCredential", "idempotencyKey", "avatarId", "answers"])) {
    return fail("completion_request_field_not_allowed");
  }
  if (typeof candidate.anonymousSessionCredential !== "string" || !/^[0-9a-f]{32}$/.test(candidate.anonymousSessionCredential)) {
    return fail("completion_owner_invalid");
  }
  if (typeof candidate.idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(candidate.idempotencyKey)) {
    return fail("completion_idempotency_invalid");
  }
  if (!isApprovedAvatarId(candidate.avatarId)) return fail("completion_avatar_invalid");
  if (!Array.isArray(candidate.answers) || candidate.answers.length !== 12) return fail("completion_answers_invalid");
  const answers: ChallengeAnswerSubmission[] = [];
  const seen = new Set<string>();
  for (const value of candidate.answers) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("completion_answers_invalid");
    const answer = value as Record<string, unknown>;
    if (!exactKeys(answer, ["questionStableId", "selectedOptionIds"])
      || typeof answer.questionStableId !== "string"
      || !QUESTION_ID_PATTERN.test(answer.questionStableId)
      || seen.has(answer.questionStableId)
      || !Array.isArray(answer.selectedOptionIds)
      || answer.selectedOptionIds.length < 1
      || answer.selectedOptionIds.length > 3
      || new Set(answer.selectedOptionIds).size !== answer.selectedOptionIds.length
      || answer.selectedOptionIds.some((id) => typeof id !== "string" || !OPTION_ID_PATTERN.test(id))) {
      return fail("completion_answers_invalid");
    }
    seen.add(answer.questionStableId);
    answers.push(Object.freeze({
      questionStableId: answer.questionStableId,
      selectedOptionIds: Object.freeze([...(answer.selectedOptionIds as string[])]),
    }));
  }
  return Object.freeze({
    anonymousSessionCredential: candidate.anonymousSessionCredential,
    idempotencyKey: candidate.idempotencyKey,
    avatarId: candidate.avatarId,
    answers: Object.freeze(answers),
  });
}

export class ResultCompletionService {
  private readonly repository: ResultCompletionRepository;
  private readonly options: Readonly<{
    now?: () => number;
    randomSource?: (bytes: Uint8Array) => Uint8Array;
  }>;

  constructor(repository: ResultCompletionRepository, options: ResultCompletionService["options"] = {}) {
    this.repository = repository;
    this.options = options;
  }

  async complete(value: unknown): Promise<ResultCompletionProjection> {
    if (!this.repository.storageAvailable) return fail("completion_storage_unavailable");
    const request = validateResultCompletionRequest(value);
    const ownerHash = await deriveCommerceOwnerHash(request.anonymousSessionCredential);
    const idempotencyHash = await sha256(`wybp:result-completion-idempotency:v1\u0000${ownerHash}\u0000${request.idempotencyKey}`);
    const existing = await this.repository.getByIdempotencyHash(idempotencyHash);
    if (existing) {
      if (existing.anonymousOwnerHash !== ownerHash) return fail("completion_idempotency_conflict");
      return Object.freeze({ resultSlug: existing.publicSlug });
    }
    const now = this.options.now?.() ?? Date.now();
    const authority = await this.repository.getAuthority(request.answers.map((answer) => answer.questionStableId), now);
    if (!authority || authority.questions.length !== 12) return fail("completion_authority_unavailable");
    const submitted = new Map(request.answers.map((answer) => [answer.questionStableId, answer]));
    const answerRows: NewCompletedResult["answers"][number][] = [];
    const selectedQuestions: Array<{ stableId: string; version: number }> = [];
    let score = 0;
    let total = 0;
    for (const question of authority.questions) {
      const answer = submitted.get(question.stableId);
      if (!answer || question.scoringWeight !== 1 || !answer.selectedOptionIds.every((id) => question.optionIds.includes(id))) {
        return fail("completion_answers_invalid");
      }
      const correct = (question.acceptedOptionSets || [question.correctOptionIds]).some((accepted) => exactSet(answer.selectedOptionIds, accepted));
      score += correct ? question.scoringWeight : 0;
      total += question.scoringWeight;
      selectedQuestions.push({ stableId: question.stableId, version: question.version });
      answerRows.push(Object.freeze({
        id: "",
        questionId: question.id,
        questionVersion: question.version,
        selectedOptionIdsJson: JSON.stringify(answer.selectedOptionIds),
        isCorrect: correct,
        scoreAwarded: correct ? question.scoringWeight : 0,
      }));
    }
    if (submitted.size !== authority.questions.length || total !== 12) return fail("completion_authority_unavailable");
    const randomSource = this.options.randomSource ?? crypto.getRandomValues.bind(crypto);
    for (let attempt = 0; attempt < RESULT_COMPLETION_COLLISION_LIMIT; attempt += 1) {
      const nonce = () => secureHex(16, randomSource);
      const record: NewCompletedResult = Object.freeze({
        attemptId: `attempt_${nonce()}`,
        resultId: `result_${nonce()}`,
        resultPublicSlug: secureHex(24, randomSource),
        editionId: authority.editionId,
        edition: authority.edition,
        anonymousOwnerHash: ownerHash,
        idempotencyHash,
        safeAvatarId: request.avatarId,
        answers: Object.freeze(answerRows.map((answer) => Object.freeze({ ...answer, id: `answer_${nonce()}` }))),
        selectedQuestionVersionsJson: JSON.stringify(selectedQuestions),
        score,
        total,
        tier: calculateResultTier(score),
        scoringSnapshotJson: JSON.stringify({
          scoringWeightPolicy: CHALLENGE_SCORING_WEIGHT_POLICY,
          difficultyPolicy: CHALLENGE_DIFFICULTY_POLICY,
        }),
        completedAt: now,
        expiresAt: now + RESULT_COMPLETION_RETENTION_MS,
      });
      if (await this.repository.completeAtomically(record) === "created") {
        return Object.freeze({ resultSlug: record.resultPublicSlug });
      }
      const concurrent = await this.repository.getByIdempotencyHash(idempotencyHash);
      if (concurrent) {
        if (concurrent.anonymousOwnerHash !== ownerHash) return fail("completion_idempotency_conflict");
        return Object.freeze({ resultSlug: concurrent.publicSlug });
      }
    }
    return fail("completion_collision_exhausted");
  }
}

type AuthorityRow = Readonly<{
  edition_id: string;
  id: string;
  stable_id: string;
  version: number;
  answer_options_json: string;
  correct_answer_json: string;
  accepted_answers_json: string;
  scoring_weight: number;
}>;

export class D1ResultCompletionRepository implements ResultCompletionRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;
  constructor(database: AtomicD1Database) { this.database = database; }

  async getByIdempotencyHash(idempotencyHash: string): Promise<ExistingCompletedResult | null> {
    const row = await this.database.prepare(`SELECT r.public_slug, qe.edition_key, qa.anonymous_subject_hash
      FROM quiz_attempts qa
      JOIN results r ON r.attempt_id = qa.id
      JOIN quiz_editions qe ON qe.id = qa.edition_id
      WHERE qa.idempotency_key_hash = ?1 AND qa.status = 'completed' AND r.state = 'active'
      LIMIT 1`).bind(idempotencyHash).first<{
        public_slug: string;
        edition_key: RegionKey;
        anonymous_subject_hash: string;
      }>();
    return row ? Object.freeze({
      publicSlug: row.public_slug,
      edition: row.edition_key,
      anonymousOwnerHash: row.anonymous_subject_hash,
    }) : null;
  }

  async getAuthority(questionStableIds: readonly string[], now = Date.now()): Promise<Readonly<{ editionId: string; edition: RegionKey; questions: readonly AuthoritativeResultQuestion[] }> | null> {
    if (questionStableIds.length !== 12 || new Set(questionStableIds).size !== 12) return null;
    const placeholders = questionStableIds.map((_, index) => `?${index + 1}`).join(", ");
    const result = await this.database.prepare(`SELECT qe.id AS edition_id, qe.edition_key, q.id, q.stable_id, q.version,
      q.answer_options_json, q.correct_answer_json, q.accepted_answers_json, q.scoring_weight
      FROM quiz_editions qe
      JOIN questions q ON q.edition_id = qe.id
      WHERE q.stable_id IN (${placeholders}) AND qe.status = 'active'
        AND q.publication_status = 'published' AND q.source_review_status = 'approved'
        AND q.published_at <= ?${questionStableIds.length + 1} AND q.retired_at IS NULL
        AND (q.valid_from IS NULL OR q.valid_from <= ?${questionStableIds.length + 1})
        AND (q.valid_until IS NULL OR q.valid_until > ?${questionStableIds.length + 1})
        AND q.version = (SELECT max(latest.version) FROM questions latest
          WHERE latest.stable_id=q.stable_id AND latest.edition_id=q.edition_id
            AND latest.publication_status='published' AND latest.source_review_status='approved'
            AND latest.published_at <= ?${questionStableIds.length + 1} AND latest.retired_at IS NULL
            AND (latest.valid_from IS NULL OR latest.valid_from <= ?${questionStableIds.length + 1})
            AND (latest.valid_until IS NULL OR latest.valid_until > ?${questionStableIds.length + 1}))
      ORDER BY q.stable_id`).bind(...questionStableIds, now).all<AuthorityRow & { edition_key: RegionKey }>();
    if (!result.success || result.results.length !== 12) return null;
    const edition = result.results[0].edition_key;
    if (!(edition in regions) || result.results.some((row) => row.edition_key !== edition || row.edition_id !== result.results[0].edition_id)) return null;
    const questions: AuthoritativeResultQuestion[] = [];
    for (const row of result.results) {
      try {
        const options = JSON.parse(row.answer_options_json) as Array<{ id?: unknown }>;
        const correct = JSON.parse(row.correct_answer_json) as unknown;
        const alternatives = JSON.parse(row.accepted_answers_json) as unknown;
        if (!Array.isArray(options) || !Array.isArray(correct)
          || !Array.isArray(alternatives)
          || options.some((option) => typeof option?.id !== "string")
          || correct.some((id) => typeof id !== "string")
          || alternatives.some((set) => !Array.isArray(set) || set.some((id) => typeof id !== "string"))) return null;
        const acceptedOptionSets = alternatives.length ? alternatives as string[][] : [correct as string[]];
        questions.push(Object.freeze({
          id: row.id,
          stableId: row.stable_id,
          version: row.version,
          optionIds: Object.freeze(options.map((option) => option.id as string)),
          correctOptionIds: Object.freeze(correct as string[]),
          acceptedOptionSets: Object.freeze(acceptedOptionSets.map((set) => Object.freeze([...set]))),
          scoringWeight: row.scoring_weight,
        }));
      } catch { return null; }
    }
    return Object.freeze({ editionId: result.results[0].edition_id, edition, questions: Object.freeze(questions) });
  }

  async completeAtomically(record: NewCompletedResult): Promise<ResultCompletionInsertOutcome> {
    const statements: BoundStatement[] = [
      this.database.prepare(`INSERT INTO quiz_attempts (
        id, edition_id, anonymous_subject_hash, question_set_version, scoring_version,
        selected_question_versions_json, status, idempotency_key_hash, started_at,
        completed_at, expires_at, version, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'completed', ?7, ?8, ?8, ?9, 1, ?8, ?8)`).bind(
        record.attemptId, record.editionId, record.anonymousOwnerHash, QUESTION_SET_VERSION,
        SCORING_VERSION, record.selectedQuestionVersionsJson, record.idempotencyHash,
        record.completedAt, record.expiresAt,
      ),
    ];
    for (const answer of record.answers) {
      statements.push(this.database.prepare(`INSERT INTO answers (
        id, attempt_id, question_id, question_version, selected_option_ids_json,
        is_correct, score_awarded, answered_at, version, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?8, ?8)`).bind(
        answer.id, record.attemptId, answer.questionId, answer.questionVersion,
        answer.selectedOptionIdsJson, answer.isCorrect ? 1 : 0, answer.scoreAwarded,
        record.completedAt,
      ));
    }
    statements.push(this.database.prepare(`INSERT INTO results (
      id, public_slug, attempt_id, edition_id, score, total, tier, scoring_version,
      question_set_version, scoring_snapshot_json, safe_avatar_id, reviewed_display_name,
      safeguard_version, visibility, state, expires_at, version, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL,
      'culture-score-v1', 'private', 'active', ?12, 1, ?13, ?13)`).bind(
      record.resultId, record.resultPublicSlug, record.attemptId, record.editionId,
      record.score, record.total, record.tier, SCORING_VERSION, QUESTION_SET_VERSION,
      record.scoringSnapshotJson, record.safeAvatarId, record.expiresAt, record.completedAt,
    ));
    try {
      await this.database.batch(statements);
      const created = await this.getByIdempotencyHash(record.idempotencyHash);
      return created?.publicSlug === record.resultPublicSlug ? "created" : "collision";
    } catch {
      return "collision";
    }
  }
}
