import { regionOrder, type RegionKey } from "../app/publicGameData.ts";
import { deriveAnonymousSubjectHash } from "../app/anonymousSession.ts";
import {
  D1QuestionSelectionRepository,
  selectQuestionSet,
  toPublicSelectedQuestion,
  type PublicSelectedQuestion,
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

export class QuestionSelectionService {
  private readonly repository: D1QuestionSelectionRepository;
  private readonly options: Readonly<{ now?: () => number; randomSource?: (bytes: Uint8Array) => Uint8Array }>;
  constructor(
    repository: D1QuestionSelectionRepository,
    options: Readonly<{ now?: () => number; randomSource?: (bytes: Uint8Array) => Uint8Array }> = {},
  ) { this.repository = repository; this.options = options; }

  async start(value: unknown): Promise<PublicQuestionSelection> {
    if (!this.repository.storageAvailable) return fail("selection_storage_unavailable");
    const request = validatePublicSelectionRequest(value);
    const now = this.options.now?.() ?? Date.now();
    const anonymousSubjectHash = await deriveAnonymousSubjectHash(request.anonymousSessionCredential);
    if (!anonymousSubjectHash || !HASH.test(anonymousSubjectHash)) return fail("selection_subject_invalid");
    const [candidates, recent] = await Promise.all([
      this.repository.getCandidates(request.region, now),
      this.repository.getRecentQuestionVersions(anonymousSubjectHash),
    ]);
    const selection = await selectQuestionSet({ candidates, region: request.region, now, recentQuestionVersions: recent, randomSource: this.options.randomSource });
    const internalIdBytes = new Uint8Array(24);
    const randomSource = this.options.randomSource ?? crypto.getRandomValues.bind(crypto);
    if (randomSource(internalIdBytes) !== internalIdBytes) return fail("secure_random_unavailable");
    const attemptId = `attempt_${hex(internalIdBytes)}`;
    const created = await this.repository.createAttempt({
      id: attemptId,
      editionId: selection.questions[0].editionId,
      anonymousSubjectHash,
      idempotencyKeyHash: await sha256(`wybp-question-selection-v1\u0000${anonymousSubjectHash}\u0000${request.idempotencyKey}`),
      selection,
      startedAt: now,
      expiresAt: now + QUESTION_ATTEMPT_LIFETIME_MS,
    });
    if (!created) return fail("selection_idempotency_conflict");
    return Object.freeze({
      attemptId,
      questions: Object.freeze(selection.questions.map(toPublicSelectedQuestion)),
      questionSetVersion: selection.questionSetVersion,
      scoringVersion: selection.scoringVersion,
      selectionPolicyVersion: selection.selectionPolicyVersion,
      expiresAt: now + QUESTION_ATTEMPT_LIFETIME_MS,
    });
  }
}
