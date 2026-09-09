import { regionOrder, type RegionKey } from "../app/publicGameData.ts";
import { deriveAnonymousSubjectHash } from "../app/anonymousSession.ts";
import {
  D1QuestionSelectionRepository,
  MINIMUM_RANDOM_QUICK_PLAY_BANK,
  selectQuestionSet,
  toPublicSelectedQuestion,
  type PublicSelectedQuestion,
  type StoredQuestionSelection,
} from "./questionSelection.ts";

const HASH = /^[0-9a-f]{64}$/;
const IDEMPOTENCY = /^[A-Za-z0-9._~-]{16,128}$/;
export const QUESTION_ATTEMPT_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type PublicQuestionSelection = Readonly<{
  attemptId: string;
  questions: readonly PublicSelectedQuestion[];
  questionSetVersion: string;
  scoringVersion: string;
  selectionPolicyVersion: string;
  expiresAt: number;
}>;

export type QuestionSelectionRepository = Pick<D1QuestionSelectionRepository,
  "storageAvailable" | "getCandidates" | "getRecentQuestionVersions" | "getAttemptByIdempotencyHash" | "getAttempt" | "createAttempt" | "judgeAttemptAnswer" | "consumeRateLimit">;

export class QuestionSelectionRequestError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "QuestionSelectionRequestError"; this.code = code; }
}

function fail(code: string): never { throw new QuestionSelectionRequestError(code); }
function hex(bytes: Uint8Array): string { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function sha256(value: string): Promise<string> { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }

export function validatePublicSelectionRequest(value: unknown): Readonly<{ region: RegionKey; anonymousSessionCredential: string; idempotencyKey: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("selection_request_invalid");
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).sort().join(",") !== "anonymousSessionCredential,idempotencyKey,region") return fail("selection_request_field_not_allowed");
  if (typeof candidate.region !== "string" || !regionOrder.includes(candidate.region as RegionKey)) return fail("selection_region_invalid");
  if (typeof candidate.anonymousSessionCredential !== "string" || !/^[0-9a-f]{32}$/.test(candidate.anonymousSessionCredential)) return fail("selection_subject_invalid");
  if (typeof candidate.idempotencyKey !== "string" || !IDEMPOTENCY.test(candidate.idempotencyKey)) return fail("selection_idempotency_invalid");
  return Object.freeze({ region: candidate.region as RegionKey, anonymousSessionCredential: candidate.anonymousSessionCredential, idempotencyKey: candidate.idempotencyKey });
}

export function validatePublicRecoveryRequest(value: unknown): Readonly<{ attemptId: string; anonymousSessionCredential: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("selection_recovery_invalid");
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).sort().join(",") !== "anonymousSessionCredential,attemptId") return fail("selection_request_field_not_allowed");
  if (typeof candidate.attemptId !== "string" || !/^attempt_[0-9a-f]{48}$/.test(candidate.attemptId)) return fail("selection_attempt_invalid");
  if (typeof candidate.anonymousSessionCredential !== "string" || !/^[0-9a-f]{32}$/.test(candidate.anonymousSessionCredential)) return fail("selection_subject_invalid");
  return Object.freeze({ attemptId: candidate.attemptId, anonymousSessionCredential: candidate.anonymousSessionCredential });
}

export function validatePublicAnswerRequest(value: unknown): Readonly<{ attemptId: string; anonymousSessionCredential: string; questionRef: string; selectedOptionIds: readonly string[] }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("selection_answer_invalid");
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).sort().join(",") !== "anonymousSessionCredential,attemptId,questionRef,selectedOptionIds") return fail("selection_request_field_not_allowed");
  if (typeof candidate.attemptId !== "string" || !/^attempt_[0-9a-f]{48}$/.test(candidate.attemptId)) return fail("selection_attempt_invalid");
  if (typeof candidate.anonymousSessionCredential !== "string" || !/^[0-9a-f]{32}$/.test(candidate.anonymousSessionCredential)) return fail("selection_subject_invalid");
  if (typeof candidate.questionRef !== "string" || !/^(west|east|central|north|south)_[a-z0-9][a-z0-9_-]{2,55}$/.test(candidate.questionRef)) return fail("selection_question_invalid");
  if (!Array.isArray(candidate.selectedOptionIds) || candidate.selectedOptionIds.length < 1 || candidate.selectedOptionIds.length > 3
    || new Set(candidate.selectedOptionIds).size !== candidate.selectedOptionIds.length
    || candidate.selectedOptionIds.some((id) => typeof id !== "string" || !/^o[1-9][0-9]?$/.test(id))) return fail("selection_answer_invalid");
  return Object.freeze({
    attemptId: candidate.attemptId,
    anonymousSessionCredential: candidate.anonymousSessionCredential,
    questionRef: candidate.questionRef,
    selectedOptionIds: Object.freeze([...(candidate.selectedOptionIds as string[])]),
  });
}

function publicSelection(stored: StoredQuestionSelection): PublicQuestionSelection {
  return Object.freeze({
    attemptId: stored.attemptId,
    questions: Object.freeze(stored.selection.questions.map((question, index) => toPublicSelectedQuestion(question, stored.selection.optionOrders[index]))),
    questionSetVersion: stored.selection.questionSetVersion,
    scoringVersion: stored.selection.scoringVersion,
    selectionPolicyVersion: stored.selection.selectionPolicyVersion,
    expiresAt: stored.expiresAt,
  });
}

export class QuestionSelectionService {
  private readonly repository: QuestionSelectionRepository;
  private readonly options: Readonly<{ now?: () => number; randomSource?: (bytes: Uint8Array) => Uint8Array }>;
  constructor(
    repository: QuestionSelectionRepository,
    options: Readonly<{ now?: () => number; randomSource?: (bytes: Uint8Array) => Uint8Array }> = {},
  ) { this.repository = repository; this.options = options; }

  async start(value: unknown): Promise<PublicQuestionSelection> {
    if (!this.repository.storageAvailable) return fail("selection_storage_unavailable");
    const request = validatePublicSelectionRequest(value);
    const now = this.options.now?.() ?? Date.now();
    const anonymousSubjectHash = await deriveAnonymousSubjectHash(request.anonymousSessionCredential);
    if (!anonymousSubjectHash || !HASH.test(anonymousSubjectHash)) return fail("selection_subject_invalid");
    const idempotencyKeyHash = await sha256(`wybp-question-selection-v1\u0000${anonymousSubjectHash}\u0000${request.idempotencyKey}`);
    const existing = await this.repository.getAttemptByIdempotencyHash(idempotencyKeyHash, anonymousSubjectHash, now);
    if (existing) {
      if (existing.region !== request.region) return fail("selection_idempotency_conflict");
      return publicSelection(existing);
    }
    const rateLimit = await this.repository.consumeRateLimit(anonymousSubjectHash, "start", now, 20);
    if (rateLimit !== "allowed") return fail(rateLimit === "limited" ? "selection_rate_limited" : "selection_rate_limit_unavailable");
    const [candidates, recent] = await Promise.all([
      this.repository.getCandidates(request.region, now),
      this.repository.getRecentQuestionVersions(anonymousSubjectHash, now),
    ]);
    const selection = await selectQuestionSet({
      candidates,
      region: request.region,
      now,
      recentQuestionVersions: recent,
      randomSource: this.options.randomSource,
      minimumEligibleCount: MINIMUM_RANDOM_QUICK_PLAY_BANK,
    });
    const internalIdBytes = new Uint8Array(24);
    const randomSource = this.options.randomSource ?? crypto.getRandomValues.bind(crypto);
    if (randomSource(internalIdBytes) !== internalIdBytes) return fail("secure_random_unavailable");
    const attemptId = `attempt_${hex(internalIdBytes)}`;
    const created = await this.repository.createAttempt({
      id: attemptId,
      editionId: selection.questions[0].editionId,
      anonymousSubjectHash,
      idempotencyKeyHash,
      selection,
      startedAt: now,
      expiresAt: now + QUESTION_ATTEMPT_LIFETIME_MS,
    });
    if (!created) {
      const concurrent = await this.repository.getAttemptByIdempotencyHash(idempotencyKeyHash, anonymousSubjectHash, now);
      if (!concurrent || concurrent.region !== request.region) return fail("selection_idempotency_conflict");
      return publicSelection(concurrent);
    }
    return publicSelection(Object.freeze({ attemptId, region: request.region, expiresAt: now + QUESTION_ATTEMPT_LIFETIME_MS, selection }));
  }

  async resume(value: unknown): Promise<PublicQuestionSelection> {
    if (!this.repository.storageAvailable) return fail("selection_storage_unavailable");
    const request = validatePublicRecoveryRequest(value);
    const now = this.options.now?.() ?? Date.now();
    const anonymousSubjectHash = await deriveAnonymousSubjectHash(request.anonymousSessionCredential);
    if (!anonymousSubjectHash || !HASH.test(anonymousSubjectHash)) return fail("selection_subject_invalid");
    const stored = await this.repository.getAttempt(request.attemptId, anonymousSubjectHash, now);
    if (!stored) return fail("selection_attempt_unavailable");
    return publicSelection(stored);
  }

  async answer(value: unknown): Promise<Readonly<{ accepted: true; correct: boolean; correctOptionIds: readonly string[]; explanation: string }>> {
    if (!this.repository.storageAvailable) return fail("selection_storage_unavailable");
    const request = validatePublicAnswerRequest(value);
    const now = this.options.now?.() ?? Date.now();
    const anonymousSubjectHash = await deriveAnonymousSubjectHash(request.anonymousSessionCredential);
    if (!anonymousSubjectHash || !HASH.test(anonymousSubjectHash)) return fail("selection_subject_invalid");
    const rateLimit = await this.repository.consumeRateLimit(anonymousSubjectHash, "complete", now, 100);
    if (rateLimit !== "allowed") return fail(rateLimit === "limited" ? "selection_rate_limited" : "selection_rate_limit_unavailable");
    const judgement = await this.repository.judgeAttemptAnswer(request.attemptId, anonymousSubjectHash, request.questionRef, request.selectedOptionIds, now);
    if (!judgement) return fail("selection_answer_unavailable");
    return Object.freeze({ accepted: true as const, ...judgement });
  }
}
