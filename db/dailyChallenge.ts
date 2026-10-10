import { isApprovedAvatarId } from "../app/avatarRegistry.ts";
import { deriveAnonymousSubjectHash } from "../app/anonymousSession.ts";
import { calculateResultTier } from "../app/gameLogic.ts";
import { regionOrder, type RegionKey } from "../app/publicGameData.ts";
import type { AtomicD1Database, BoundStatement } from "./repositories.ts";
import {
  authorizeReproducibleSelectionSeed,
  D1QuestionSelectionRepository,
  QUESTION_SELECTION_POLICY_VERSION,
  selectQuestionSet,
  toPublicSelectedQuestion,
  type PublicSelectedQuestion,
  type QuestionVersionReference,
  type SelectableQuestion,
} from "./questionSelection.ts";
import { QUESTION_SET_VERSION, SCORING_VERSION } from "./seeds/development.ts";

export const DAILY_STREAK_RETENTION_MS = 180 * 86_400_000;
export const DAILY_STREAK_PURGE_GRACE_MS = 7 * 86_400_000;
export const DAILY_ATTEMPT_LIMIT = 12;
export const DAILY_RULE_VERSION = "daily-streak-v1" as const;
export const DAILY_SECRET_MINIMUM_LENGTH = 32;
export const DAILY_REQUEST_BODY_LIMIT = 16_384;

const RAW_CREDENTIAL = /^[0-9a-f]{32}$/;
const HASH = /^[0-9a-f]{64}$/;
const IDEMPOTENCY = /^[A-Za-z0-9._~-]{16,128}$/;
const OPTION_ID = /^o[1-9][0-9]?$/;
const UTC_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type DailyPlayMode = "official" | "practice";
export type DailyOperation = "start" | "complete" | "clear";
export type DailyStreak = Readonly<{
  current: number;
  best: number;
  lastDate: string;
  expiresAt: number;
  milestone: "first-step" | "woven-three" | "baobab-week" | "heritage-month";
  masterySeal: boolean;
}>;

export type DailyChallengeRecord = Readonly<{
  id: string;
  challengeDate: string;
  editionId: string;
  region: RegionKey;
  questionSetVersion: string;
  scoringVersion: string;
  selectionPolicyVersion: string;
  deterministicSeedHash: string;
  selectedQuestionVersions: readonly QuestionVersionReference[];
  state: "active";
  expiresAt: number;
  createdAt: number;
}>;

export type DailyAttemptRecord = Readonly<{
  id: string;
  dailyChallengeId: string;
  editionId: string;
  ownerHash: string;
  mode: DailyPlayMode;
  questionSetVersion: string;
  scoringVersion: string;
  selectionPolicyVersion: string;
  selectedQuestionVersions: readonly QuestionVersionReference[];
  status: "in_progress" | "completed";
  expiresAt: number;
}>;

export type DailyOfficialCompletion = Readonly<{
  resultSlug: string;
  resultId: string;
  score: number;
  total: number;
  completedAt: number;
}>;

export type DailyStartProjection = Readonly<{
  date: string;
  region: RegionKey;
  mode: DailyPlayMode;
  attemptId: string | null;
  questions: readonly PublicSelectedQuestion[];
  questionSetVersion: string;
  scoringVersion: string;
  selectionPolicyVersion: string;
  expiresAt: number;
  sharePath: string;
  officialAlreadyCompleted: boolean;
}>;

export type DailyCompletionProjection = Readonly<{
  date: string;
  region: RegionKey;
  official: boolean;
  score: number;
  total: number;
  resultSlug: string;
  streak: DailyStreak | null;
}>;

type DailyAnswerSubmission = Readonly<{ questionStableId: string; selectedOptionIds: readonly string[] }>;

type NewDailyCompletion = Readonly<{
  attempt: DailyAttemptRecord;
  daily: DailyChallengeRecord;
  ownerHash: string;
  score: number;
  total: number;
  tier: number;
  avatarId: string;
  completedAt: number;
  resultId: string;
  resultSlug: string;
  completionId: string;
  streakId: string;
  answers: readonly Readonly<{
    id: string;
    questionId: string;
    questionVersion: number;
    selectedOptionIdsJson: string;
    isCorrect: boolean;
    scoreAwarded: number;
  }>[];
  streaksEnabled: boolean;
}>;

export interface DailyChallengeRepository {
  readonly storageAvailable: boolean;
  getCandidates(region: RegionKey, now: number): Promise<readonly SelectableQuestion[]>;
  getDaily(region: RegionKey, challengeDate: string): Promise<DailyChallengeRecord | null>;
  getDailyById(id: string): Promise<DailyChallengeRecord | null>;
  insertDaily(record: DailyChallengeRecord): Promise<boolean>;
  getQuestions(record: DailyChallengeRecord): Promise<readonly SelectableQuestion[]>;
  getAttemptByIdempotencyHash(hash: string): Promise<DailyAttemptRecord | null>;
  getAttempt(id: string): Promise<DailyAttemptRecord | null>;
  insertAttempt(record: DailyAttemptRecord, idempotencyHash: string, startedAt: number): Promise<boolean>;
  getResultByAttempt(attemptId: string): Promise<DailyOfficialCompletion | null>;
  getOfficialCompletion(dailyId: string, ownerHash: string): Promise<DailyOfficialCompletion | null>;
  completeAtomically(record: NewDailyCompletion): Promise<boolean>;
  getStreak(ownerHash: string, region: RegionKey, now: number): Promise<DailyStreak | null>;
  clearStreaks(ownerHash: string): Promise<void>;
  purgeExpiredStreaks(now: number, limit: number): Promise<number>;
  consumeRateLimit(rateKeyHash: string, action: DailyOperation, now: number, limit: number): Promise<"allowed" | "limited" | "unavailable">;
}

export class DailyChallengeError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "DailyChallengeError"; this.code = code; }
}

function fail(code: string): never { throw new DailyChallengeError(code); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function bytesToHex(bytes: Uint8Array): string { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function sha256(value: string | Uint8Array): Promise<string> {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array([...value]);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", input)));
}
async function hmac(secret: string, value: string): Promise<Uint8Array> {
  if (typeof secret !== "string" || secret.length < DAILY_SECRET_MINIMUM_LENGTH || secret.length > 512) return fail("daily_secret_unavailable");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
function secureHex(bytes: number, randomSource: (value: Uint8Array) => Uint8Array): string {
  const value = new Uint8Array(bytes);
  if (randomSource(value) !== value) return fail("secure_random_unavailable");
  return bytesToHex(value);
}
function parseReferences(raw: string): readonly QuestionVersionReference[] {
  try {
    const values = JSON.parse(raw) as unknown;
    if (!Array.isArray(values) || values.length !== DAILY_ATTEMPT_LIMIT) return fail("daily_snapshot_invalid");
    const references = values.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return fail("daily_snapshot_invalid");
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.stableId !== "string" || !Number.isInteger(candidate.version) || Number(candidate.version) < 1) return fail("daily_snapshot_invalid");
      return Object.freeze({ stableId: candidate.stableId, version: Number(candidate.version) });
    });
    if (new Set(references.map((item) => `${item.stableId}@${item.version}`)).size !== references.length) return fail("daily_snapshot_invalid");
    return Object.freeze(references);
  } catch (error) {
    if (error instanceof DailyChallengeError) throw error;
    return fail("daily_snapshot_invalid");
  }
}

export function utcChallengeDate(now: number): string {
  if (!Number.isFinite(now) || now < 0) return fail("daily_time_invalid");
  return new Date(now).toISOString().slice(0, 10);
}

export function nextUtcChallengeBoundary(now: number): number {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) return fail("daily_time_invalid");
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function previousUtcDate(date: string): string {
  if (!UTC_DATE.test(date)) return fail("daily_date_invalid");
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== date) return fail("daily_date_invalid");
  return new Date(parsed - 86_400_000).toISOString().slice(0, 10);
}

export function dailySharePath(region: RegionKey, date: string): string {
  if (!regionOrder.includes(region) || !UTC_DATE.test(date)) return fail("daily_share_invalid");
  return `/daily/${region}/${date}`;
}

export function streakMilestone(count: number): DailyStreak["milestone"] {
  if (count >= 30) return "heritage-month";
  if (count >= 7) return "baobab-week";
  if (count >= 3) return "woven-three";
  return "first-step";
}

export function calculateStreak(input: Readonly<{
  previous: DailyStreak | null;
  challengeDate: string;
  completedAt: number;
}>): DailyStreak {
  const prior = input.previous && input.previous.expiresAt > input.completedAt ? input.previous : null;
  const current = !prior ? 1 : prior.lastDate === input.challengeDate ? prior.current
    : prior.lastDate === previousUtcDate(input.challengeDate) ? prior.current + 1 : 1;
  const best = Math.max(prior?.best || 0, current);
  return Object.freeze({
    current,
    best,
    lastDate: input.challengeDate,
    expiresAt: input.completedAt + DAILY_STREAK_RETENTION_MS,
    milestone: streakMilestone(current),
    masterySeal: current === 7 || current === 30 || current === 90 || current === 180,
  });
}

export async function deriveDailyOwnerHash(rawCredential: unknown): Promise<string> {
  if (typeof rawCredential !== "string" || !RAW_CREDENTIAL.test(rawCredential)) return fail("daily_owner_invalid");
  const value = await deriveAnonymousSubjectHash(rawCredential);
  if (!value) return fail("daily_owner_invalid");
  return value;
}

export function validateDailyStartRequest(value: unknown): Readonly<{ region: RegionKey; mode: DailyPlayMode; anonymousSessionCredential: string; idempotencyKey: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("daily_start_invalid");
  const candidate = value as Record<string, unknown>;
  if (!exactKeys(candidate, ["region", "mode", "anonymousSessionCredential", "idempotencyKey"])) return fail("daily_start_field_not_allowed");
  if (typeof candidate.region !== "string" || !regionOrder.includes(candidate.region as RegionKey)) return fail("daily_region_invalid");
  if (candidate.mode !== "official" && candidate.mode !== "practice") return fail("daily_mode_invalid");
  if (typeof candidate.anonymousSessionCredential !== "string" || !RAW_CREDENTIAL.test(candidate.anonymousSessionCredential)) return fail("daily_owner_invalid");
  if (typeof candidate.idempotencyKey !== "string" || !IDEMPOTENCY.test(candidate.idempotencyKey)) return fail("daily_idempotency_invalid");
  return Object.freeze(candidate as { region: RegionKey; mode: DailyPlayMode; anonymousSessionCredential: string; idempotencyKey: string });
}

export function validateDailyCompletionRequest(value: unknown): Readonly<{
  attemptId: string;
  anonymousSessionCredential: string;
  avatarId: string;
  answers: readonly DailyAnswerSubmission[];
}> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("daily_completion_invalid");
  const candidate = value as Record<string, unknown>;
  if (!exactKeys(candidate, ["attemptId", "anonymousSessionCredential", "avatarId", "answers"])) return fail("daily_completion_field_not_allowed");
  if (typeof candidate.attemptId !== "string" || !/^attempt_[0-9a-f]{48}$/.test(candidate.attemptId)) return fail("daily_attempt_invalid");
  if (typeof candidate.anonymousSessionCredential !== "string" || !RAW_CREDENTIAL.test(candidate.anonymousSessionCredential)) return fail("daily_owner_invalid");
  if (!isApprovedAvatarId(candidate.avatarId)) return fail("daily_avatar_invalid");
  if (!Array.isArray(candidate.answers) || candidate.answers.length !== DAILY_ATTEMPT_LIMIT) return fail("daily_answers_invalid");
  const seen = new Set<string>();
  const answers = candidate.answers.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail("daily_answers_invalid");
    const answer = item as Record<string, unknown>;
    if (!exactKeys(answer, ["questionStableId", "selectedOptionIds"])
      || typeof answer.questionStableId !== "string" || seen.has(answer.questionStableId)
      || !Array.isArray(answer.selectedOptionIds) || answer.selectedOptionIds.length < 1 || answer.selectedOptionIds.length > 3
      || new Set(answer.selectedOptionIds).size !== answer.selectedOptionIds.length
      || answer.selectedOptionIds.some((option) => typeof option !== "string" || !OPTION_ID.test(option))) return fail("daily_answers_invalid");
    seen.add(answer.questionStableId);
    return Object.freeze({ questionStableId: answer.questionStableId, selectedOptionIds: Object.freeze([...(answer.selectedOptionIds as string[])]) });
  });
  return Object.freeze({
    attemptId: candidate.attemptId,
    anonymousSessionCredential: candidate.anonymousSessionCredential,
    avatarId: candidate.avatarId as string,
    answers: Object.freeze(answers),
  });
}

export function validateClearStreakRequest(value: unknown): Readonly<{ anonymousSessionCredential: string; idempotencyKey: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("streak_clear_invalid");
  const candidate = value as Record<string, unknown>;
  if (!exactKeys(candidate, ["anonymousSessionCredential", "idempotencyKey"])) return fail("streak_clear_field_not_allowed");
  if (typeof candidate.anonymousSessionCredential !== "string" || !RAW_CREDENTIAL.test(candidate.anonymousSessionCredential)) return fail("daily_owner_invalid");
  if (typeof candidate.idempotencyKey !== "string" || !IDEMPOTENCY.test(candidate.idempotencyKey)) return fail("daily_idempotency_invalid");
  return Object.freeze(candidate as { anonymousSessionCredential: string; idempotencyKey: string });
}

export class DailyChallengeService {
  private readonly repository: DailyChallengeRepository;
  private readonly secret: string;
  private readonly streaksEnabled: boolean;
  private readonly now: () => number;
  private readonly randomSource: (value: Uint8Array) => Uint8Array;

  constructor(repository: DailyChallengeRepository, options: Readonly<{
    secret: string;
    streaksEnabled: boolean;
    now?: () => number;
    randomSource?: (value: Uint8Array) => Uint8Array;
  }>) {
    this.repository = repository;
    this.secret = options.secret;
    this.streaksEnabled = options.streaksEnabled;
    this.now = options.now || Date.now;
    this.randomSource = options.randomSource || crypto.getRandomValues.bind(crypto);
  }

  private async rateLimit(rawCredential: string, action: DailyOperation, now: number): Promise<void> {
    const rateKey = bytesToHex(await hmac(this.secret, `wybp-daily-rate-v1\u0000${action}\u0000${rawCredential}`));
    const limit = action === "clear" ? 6 : 20;
    const decision = await this.repository.consumeRateLimit(rateKey, action, now, limit);
    if (decision !== "allowed") return fail(decision === "limited" ? "daily_rate_limited" : "daily_rate_limit_unavailable");
  }

  private async ensureDaily(region: RegionKey, now: number): Promise<Readonly<{ record: DailyChallengeRecord; questions: readonly SelectableQuestion[] }>> {
    const challengeDate = utcChallengeDate(now);
    const existing = await this.repository.getDaily(region, challengeDate);
    if (existing) {
      if (existing.expiresAt <= now || existing.scoringVersion !== SCORING_VERSION || existing.questionSetVersion !== QUESTION_SET_VERSION || existing.selectionPolicyVersion !== QUESTION_SELECTION_POLICY_VERSION) return fail("daily_incompatible");
      const questions = await this.repository.getQuestions(existing);
      if (questions.length !== DAILY_ATTEMPT_LIMIT) return fail("daily_questions_unavailable");
      return Object.freeze({ record: existing, questions });
    }
    const seed = await hmac(this.secret, `wybp-daily-selection-v1\u0000${challengeDate}\u0000${region}\u0000${QUESTION_SET_VERSION}\u0000${SCORING_VERSION}`);
    const candidates = await this.repository.getCandidates(region, now);
    const selection = await selectQuestionSet({
      candidates,
      region,
      now,
      count: DAILY_ATTEMPT_LIMIT,
      authorizedSeed: authorizeReproducibleSelectionSeed(seed, { authorized: true, purpose: "daily" }),
    });
    const record = Object.freeze({
      id: `daily_${secureHex(24, this.randomSource)}`,
      challengeDate,
      editionId: selection.questions[0].editionId,
      region,
      questionSetVersion: selection.questionSetVersion,
      scoringVersion: selection.scoringVersion,
      selectionPolicyVersion: selection.selectionPolicyVersion,
      deterministicSeedHash: await sha256(seed),
      selectedQuestionVersions: Object.freeze(selection.questions.map(({ stableId, version }) => Object.freeze({ stableId, version }))),
      state: "active" as const,
      expiresAt: nextUtcChallengeBoundary(now),
      createdAt: now,
    });
    if (await this.repository.insertDaily(record)) return Object.freeze({ record, questions: selection.questions });
    const concurrent = await this.repository.getDaily(region, challengeDate);
    if (!concurrent || concurrent.deterministicSeedHash !== record.deterministicSeedHash) return fail("daily_creation_conflict");
    const questions = await this.repository.getQuestions(concurrent);
    if (questions.length !== DAILY_ATTEMPT_LIMIT) return fail("daily_questions_unavailable");
    return Object.freeze({ record: concurrent, questions });
  }

  async start(value: unknown): Promise<DailyStartProjection> {
    if (!this.repository.storageAvailable) return fail("daily_storage_unavailable");
    const request = validateDailyStartRequest(value);
    const now = this.now();
    await this.rateLimit(request.anonymousSessionCredential, "start", now);
    const ownerHash = await deriveDailyOwnerHash(request.anonymousSessionCredential);
    const { record, questions } = await this.ensureDaily(request.region, now);
    const official = request.mode === "official" ? await this.repository.getOfficialCompletion(record.id, ownerHash) : null;
    let attempt: DailyAttemptRecord | null = null;
    if (!official) {
      const idempotencyHash = await sha256(`wybp-daily-start-v1\u0000${ownerHash}\u0000${record.id}\u0000${request.mode}\u0000${request.idempotencyKey}`);
      attempt = await this.repository.getAttemptByIdempotencyHash(idempotencyHash);
      if (attempt && (attempt.ownerHash !== ownerHash || attempt.dailyChallengeId !== record.id || attempt.mode !== request.mode)) return fail("daily_idempotency_conflict");
      if (!attempt) {
        attempt = Object.freeze({
          id: `attempt_${secureHex(24, this.randomSource)}`,
          dailyChallengeId: record.id,
          editionId: record.editionId,
          ownerHash,
          mode: request.mode,
          questionSetVersion: record.questionSetVersion,
          scoringVersion: record.scoringVersion,
          selectionPolicyVersion: record.selectionPolicyVersion,
          selectedQuestionVersions: record.selectedQuestionVersions,
          status: "in_progress" as const,
          expiresAt: record.expiresAt,
        });
        if (!await this.repository.insertAttempt(attempt, idempotencyHash, now)) {
          attempt = await this.repository.getAttemptByIdempotencyHash(idempotencyHash);
          if (!attempt || attempt.ownerHash !== ownerHash || attempt.dailyChallengeId !== record.id || attempt.mode !== request.mode) return fail("daily_idempotency_conflict");
        }
      }
    }
    return Object.freeze({
      date: record.challengeDate,
      region: request.region,
      mode: request.mode,
      attemptId: attempt?.id || null,
      questions: Object.freeze(questions.map(toPublicSelectedQuestion)),
      questionSetVersion: record.questionSetVersion,
      scoringVersion: record.scoringVersion,
      selectionPolicyVersion: record.selectionPolicyVersion,
      expiresAt: record.expiresAt,
      sharePath: dailySharePath(request.region, record.challengeDate),
      officialAlreadyCompleted: Boolean(official),
    });
  }

  async complete(value: unknown): Promise<DailyCompletionProjection> {
    if (!this.repository.storageAvailable) return fail("daily_storage_unavailable");
    const request = validateDailyCompletionRequest(value);
    const now = this.now();
    await this.rateLimit(request.anonymousSessionCredential, "complete", now);
    const ownerHash = await deriveDailyOwnerHash(request.anonymousSessionCredential);
    const attempt = await this.repository.getAttempt(request.attemptId);
    if (!attempt || attempt.ownerHash !== ownerHash || attempt.expiresAt <= now || attempt.status === "completed") {
      const replay = attempt?.ownerHash === ownerHash ? await this.repository.getResultByAttempt(request.attemptId) : null;
      if (replay && attempt) return this.completionProjection(attempt, replay, ownerHash, now);
      return fail("daily_attempt_unavailable");
    }
    const daily = await this.repository.getDailyById(attempt.dailyChallengeId);
    if (!daily || daily.expiresAt <= now || daily.challengeDate !== utcChallengeDate(now)
      || daily.scoringVersion !== attempt.scoringVersion || daily.questionSetVersion !== attempt.questionSetVersion
      || daily.selectionPolicyVersion !== attempt.selectionPolicyVersion) return fail("daily_incompatible");
    const questions = await this.repository.getQuestions(daily);
    if (questions.length !== DAILY_ATTEMPT_LIMIT || questions.some((question) => question.scoringWeight !== 1)
      || JSON.stringify(attempt.selectedQuestionVersions) !== JSON.stringify(daily.selectedQuestionVersions)) return fail("daily_questions_unavailable");
    const submitted = new Map(request.answers.map((answer) => [answer.questionStableId, answer]));
    let score = 0;
    const answerRows: NewDailyCompletion["answers"][number][] = [];
    for (const question of questions) {
      const answer = submitted.get(question.stableId);
      if (!answer || !answer.selectedOptionIds.every((id) => question.answerOptions.some((option) => option.id === id))) return fail("daily_answers_invalid");
      const selected = [...answer.selectedOptionIds].sort();
      const correct = question.acceptedAnswers.some((set) => set.length === selected.length && [...set].sort().every((id, index) => id === selected[index]));
      if (correct) score += question.scoringWeight;
      answerRows.push(Object.freeze({
        id: `answer_${secureHex(16, this.randomSource)}`,
        questionId: question.internalId,
        questionVersion: question.version,
        selectedOptionIdsJson: JSON.stringify(answer.selectedOptionIds),
        isCorrect: correct,
        scoreAwarded: correct ? question.scoringWeight : 0,
      }));
    }
    if (submitted.size !== questions.length) return fail("daily_answers_invalid");
    const record: NewDailyCompletion = Object.freeze({
      attempt,
      daily,
      ownerHash,
      score,
      total: questions.reduce((sum, question) => sum + question.scoringWeight, 0),
      tier: calculateResultTier(score),
      avatarId: request.avatarId,
      completedAt: now,
      resultId: `result_${secureHex(16, this.randomSource)}`,
      resultSlug: secureHex(24, this.randomSource),
      completionId: `daily_completion_${secureHex(16, this.randomSource)}`,
      streakId: `streak_${secureHex(16, this.randomSource)}`,
      answers: Object.freeze(answerRows),
      streaksEnabled: this.streaksEnabled && attempt.mode === "official",
    });
    if (!await this.repository.completeAtomically(record)) {
      const replay = attempt.mode === "official"
        ? await this.repository.getOfficialCompletion(daily.id, ownerHash)
        : await this.repository.getResultByAttempt(attempt.id);
      if (!replay) return fail("daily_completion_conflict");
      return this.completionProjection(attempt, replay, ownerHash, now);
    }
    const completion = Object.freeze({ resultSlug: record.resultSlug, resultId: record.resultId, score: record.score, total: record.total, completedAt: now });
    return this.completionProjection(attempt, completion, ownerHash, now);
  }

  private async completionProjection(attempt: DailyAttemptRecord, result: DailyOfficialCompletion, ownerHash: string, now: number): Promise<DailyCompletionProjection> {
    const daily = await this.repository.getDailyById(attempt.dailyChallengeId);
    if (!daily) return fail("daily_incompatible");
    const streak = this.streaksEnabled && attempt.mode === "official" ? await this.repository.getStreak(ownerHash, daily.region, now) : null;
    return Object.freeze({ date: daily.challengeDate, region: daily.region, official: attempt.mode === "official", score: result.score, total: result.total, resultSlug: result.resultSlug, streak });
  }

  async clearStreak(value: unknown): Promise<Readonly<{ available: false }>> {
    if (!this.repository.storageAvailable || !this.streaksEnabled) return fail("streak_unavailable");
    const request = validateClearStreakRequest(value);
    const now = this.now();
    await this.rateLimit(request.anonymousSessionCredential, "clear", now);
    const ownerHash = await deriveDailyOwnerHash(request.anonymousSessionCredential);
    await this.repository.clearStreaks(ownerHash);
    return Object.freeze({ available: false });
  }

  async purgeExpiredStreaks(now: number, limit = 100): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return fail("streak_purge_limit_invalid");
    return this.repository.purgeExpiredStreaks(now, limit);
  }
}

type QuestionRow = Readonly<{
  internal_id: string; edition_id: string; stable_id: string; version: number; edition_key: RegionKey;
  category: string; difficulty: string | null; question_kind: SelectableQuestion["questionKind"]; question_text: string;
  visual_start: number | null;
  answer_options_json: string; correct_answer_json: string; accepted_answers_json: string;
  explanation: string; scoring_weight: number; publication_status: string; source_review_status: string;
  published_at: number | null; retired_at: number | null; valid_from: number | null; valid_until: number | null;
  image_provenance_json: string; audio_provenance_json: string;
}>;

export class D1DailyChallengeRepository implements DailyChallengeRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;
  private readonly questions: D1QuestionSelectionRepository;
  constructor(database: AtomicD1Database) { this.database = database; this.questions = new D1QuestionSelectionRepository(database); }

  getCandidates(region: RegionKey, now: number): Promise<readonly SelectableQuestion[]> { return this.questions.getCandidates(region, now); }

  private dailyFromRow(row: Record<string, unknown> | null): DailyChallengeRecord | null {
    if (!row || Number(row.version) < 2) return null;
    try {
      const region = String(row.edition_key) as RegionKey;
      if (!regionOrder.includes(region) || row.state !== "active") return null;
      return Object.freeze({
        id: String(row.id), challengeDate: String(row.challenge_date), editionId: String(row.edition_id), region,
        questionSetVersion: String(row.question_set_version), scoringVersion: String(row.scoring_version),
        selectionPolicyVersion: String(row.selection_policy_version), deterministicSeedHash: String(row.deterministic_seed_hash),
        selectedQuestionVersions: parseReferences(String(row.selected_question_versions_json)), state: "active" as const,
        expiresAt: Number(row.expires_at), createdAt: Number(row.created_at),
      });
    } catch { return null; }
  }

  async getDaily(region: RegionKey, challengeDate: string): Promise<DailyChallengeRecord | null> {
    const row = await this.database.prepare(`SELECT dc.*,qe.edition_key FROM daily_challenges dc JOIN quiz_editions qe ON qe.id=dc.edition_id
      WHERE qe.edition_key=?1 AND dc.challenge_date=?2 AND dc.state='active' LIMIT 1`).bind(region, challengeDate).first<Record<string, unknown>>();
    return this.dailyFromRow(row);
  }

  async getDailyById(id: string): Promise<DailyChallengeRecord | null> {
    const row = await this.database.prepare(`SELECT dc.*,qe.edition_key FROM daily_challenges dc JOIN quiz_editions qe ON qe.id=dc.edition_id
      WHERE dc.id=?1 AND dc.state='active' LIMIT 1`).bind(id).first<Record<string, unknown>>();
    return this.dailyFromRow(row);
  }

  async insertDaily(record: DailyChallengeRecord): Promise<boolean> {
    try {
      const result = await this.database.prepare(`INSERT INTO daily_challenges
        (id,challenge_date,edition_id,question_set_version,scoring_version,selection_policy_version,deterministic_seed_hash,selected_question_versions_json,state,expires_at,version,created_at,updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'active',?9,2,?10,?10)
        ON CONFLICT(challenge_date,edition_id) DO NOTHING`).bind(
        record.id, record.challengeDate, record.editionId, record.questionSetVersion, record.scoringVersion,
        record.selectionPolicyVersion, record.deterministicSeedHash, JSON.stringify(record.selectedQuestionVersions),
        record.expiresAt, record.createdAt,
      ).run();
      return Boolean(result.success && Number(result.meta?.changes || 0) === 1);
    } catch { return false; }
  }

  async getQuestions(record: DailyChallengeRecord): Promise<readonly SelectableQuestion[]> {
    const result = await this.database.prepare(`SELECT q.id AS internal_id,q.edition_id,q.stable_id,q.version,qe.edition_key,q.category,q.difficulty,q.question_kind,q.question_text,
      q.visual_start,q.answer_options_json,q.correct_answer_json,q.accepted_answers_json,q.explanation,q.scoring_weight,q.publication_status,q.source_review_status,
      q.published_at,q.retired_at,q.valid_from,q.valid_until,q.image_provenance_json,q.audio_provenance_json
      FROM questions q JOIN quiz_editions qe ON qe.id=q.edition_id WHERE q.edition_id=?1 AND q.publication_status IN ('published','retired') AND q.source_review_status='approved'`).bind(record.editionId).all<QuestionRow>();
    if (!result.success) return [];
    const byReference = new Map<string, QuestionRow>(result.results.map((row) => [`${row.stable_id}@${row.version}`, row]));
    const questions: SelectableQuestion[] = [];
    for (const reference of record.selectedQuestionVersions) {
      const row = byReference.get(`${reference.stableId}@${reference.version}`);
      if (!row) return [];
      try {
        const options = JSON.parse(row.answer_options_json);
        const correct = JSON.parse(row.correct_answer_json);
        const alternatives = JSON.parse(row.accepted_answers_json);
        const images = JSON.parse(row.image_provenance_json);
        const audio = JSON.parse(row.audio_provenance_json);
        if (!Array.isArray(options) || !Array.isArray(correct) || !Array.isArray(alternatives) || !Array.isArray(images) || !Array.isArray(audio)) return [];
        questions.push(Object.freeze({
          internalId: row.internal_id, editionId: row.edition_id, stableId: row.stable_id, version: row.version,
          region: row.edition_key, category: row.category,
          difficulty: row.difficulty === "advanced" || row.difficulty === "intermediate" ? row.difficulty : "introductory",
          questionKind: row.question_kind, questionText: row.question_text, visualStart: row.visual_start, answerOptions: Object.freeze(options),
          acceptedAnswers: Object.freeze((alternatives.length ? alternatives : [correct]).map((set: string[]) => Object.freeze(set))),
          explanation: row.explanation, scoringWeight: row.scoring_weight, lifecycleStatus: "published",
          sourceReviewStatus: "approved", publishedAt: Number(row.published_at || 0), retiredAt: row.retired_at,
          validFrom: row.valid_from, validUntil: row.valid_until, imageProvenance: Object.freeze(images), audioProvenance: Object.freeze(audio),
        }));
      } catch { return []; }
    }
    return Object.freeze(questions);
  }

  private attemptFromRow(row: Record<string, unknown> | null): DailyAttemptRecord | null {
    if (!row || (row.play_mode !== "daily_official" && row.play_mode !== "daily_practice") || !row.daily_challenge_id) return null;
    try {
      return Object.freeze({
        id: String(row.id), dailyChallengeId: String(row.daily_challenge_id), editionId: String(row.edition_id),
        ownerHash: String(row.anonymous_subject_hash), mode: row.play_mode === "daily_official" ? "official" : "practice",
        questionSetVersion: String(row.question_set_version), scoringVersion: String(row.scoring_version),
        selectionPolicyVersion: String(row.selection_policy_version), selectedQuestionVersions: parseReferences(String(row.selected_question_versions_json)),
        status: row.status === "completed" ? "completed" : "in_progress", expiresAt: Number(row.expires_at),
      });
    } catch { return null; }
  }

  async getAttemptByIdempotencyHash(hash: string): Promise<DailyAttemptRecord | null> {
    return this.attemptFromRow(await this.database.prepare(`SELECT * FROM quiz_attempts WHERE idempotency_key_hash=?1 LIMIT 1`).bind(hash).first<Record<string, unknown>>());
  }
  async getAttempt(id: string): Promise<DailyAttemptRecord | null> {
    return this.attemptFromRow(await this.database.prepare(`SELECT * FROM quiz_attempts WHERE id=?1 LIMIT 1`).bind(id).first<Record<string, unknown>>());
  }

  async insertAttempt(record: DailyAttemptRecord, idempotencyHash: string, startedAt: number): Promise<boolean> {
    try {
      const result = await this.database.prepare(`INSERT INTO quiz_attempts
        (id,edition_id,anonymous_subject_hash,question_set_version,scoring_version,selected_question_versions_json,selection_policy_version,
         selection_seed_reference,play_mode,daily_challenge_id,status,idempotency_key_hash,started_at,expires_at,version,created_at,updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,?8,?9,'in_progress',?10,?11,?12,1,?11,?11)
        ON CONFLICT(idempotency_key_hash) DO NOTHING`).bind(
        record.id, record.editionId, record.ownerHash, record.questionSetVersion, record.scoringVersion,
        JSON.stringify(record.selectedQuestionVersions), record.selectionPolicyVersion,
        record.mode === "official" ? "daily_official" : "daily_practice", record.dailyChallengeId,
        idempotencyHash, startedAt, record.expiresAt,
      ).run();
      return Boolean(result.success && Number(result.meta?.changes || 0) === 1);
    } catch { return false; }
  }

  async getResultByAttempt(attemptId: string): Promise<DailyOfficialCompletion | null> {
    const row = await this.database.prepare(`SELECT r.public_slug,r.id,r.score,r.total,qa.completed_at FROM results r JOIN quiz_attempts qa ON qa.id=r.attempt_id
      WHERE qa.id=?1 AND qa.status='completed' AND r.state='active' LIMIT 1`).bind(attemptId).first<Record<string, unknown>>();
    return row ? Object.freeze({ resultSlug: String(row.public_slug), resultId: String(row.id), score: Number(row.score), total: Number(row.total), completedAt: Number(row.completed_at) }) : null;
  }

  async getOfficialCompletion(dailyId: string, ownerHash: string): Promise<DailyOfficialCompletion | null> {
    const row = await this.database.prepare(`SELECT r.public_slug,r.id,r.score,r.total,dcc.completed_at FROM daily_challenge_completions dcc
      JOIN results r ON r.id=dcc.result_id WHERE dcc.daily_challenge_id=?1 AND dcc.anonymous_subject_hash=?2 LIMIT 1`).bind(dailyId, ownerHash).first<Record<string, unknown>>();
    return row ? Object.freeze({ resultSlug: String(row.public_slug), resultId: String(row.id), score: Number(row.score), total: Number(row.total), completedAt: Number(row.completed_at) }) : null;
  }

  async completeAtomically(record: NewDailyCompletion): Promise<boolean> {
    const statements: BoundStatement[] = [
      this.database.prepare(`UPDATE quiz_attempts SET status='completed',completed_at=?1,updated_at=?1,version=version+1
        WHERE id=?2 AND anonymous_subject_hash=?3 AND daily_challenge_id=?4 AND play_mode=?5 AND status='in_progress' AND expires_at>?1`).bind(
        record.completedAt, record.attempt.id, record.ownerHash, record.daily.id,
        record.attempt.mode === "official" ? "daily_official" : "daily_practice",
      ),
    ];
    for (const answer of record.answers) statements.push(this.database.prepare(`INSERT INTO answers
      (id,attempt_id,question_id,question_version,selected_option_ids_json,is_correct,score_awarded,answered_at,version,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?8,?8)`).bind(
      answer.id, record.attempt.id, answer.questionId, answer.questionVersion, answer.selectedOptionIdsJson,
      answer.isCorrect ? 1 : 0, answer.scoreAwarded, record.completedAt,
    ));
    statements.push(this.database.prepare(`INSERT INTO results
      (id,public_slug,attempt_id,edition_id,score,total,tier,scoring_version,question_set_version,scoring_snapshot_json,
       safe_avatar_id,reviewed_display_name,safeguard_version,visibility,state,expires_at,version,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,NULL,'culture-score-v1','private','active',?12,1,?13,?13)`).bind(
      record.resultId, record.resultSlug, record.attempt.id, record.attempt.editionId, record.score, record.total,
      record.tier, record.attempt.scoringVersion, record.attempt.questionSetVersion,
      JSON.stringify({ mode: record.attempt.mode, dailyChallengeDate: record.daily.challengeDate, ruleVersion: DAILY_RULE_VERSION }),
      record.avatarId, record.completedAt + 90 * 86_400_000, record.completedAt,
    ));
    if (record.attempt.mode === "official") {
      statements.push(this.database.prepare(`INSERT INTO daily_challenge_completions
        (id,daily_challenge_id,attempt_id,result_id,anonymous_subject_hash,edition_id,challenge_date,scoring_version,completed_at,version,created_at,updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?9,?9)`).bind(
        record.completionId, record.daily.id, record.attempt.id, record.resultId, record.ownerHash,
        record.attempt.editionId, record.daily.challengeDate, record.attempt.scoringVersion, record.completedAt,
      ));
      if (record.streaksEnabled) {
        statements.push(this.database.prepare(`DELETE FROM streaks
          WHERE anonymous_subject_hash=?1 AND streak_type=?2 AND (expires_at<=?3 OR version<2 OR rule_version!=?4)`).bind(
          record.ownerHash, `daily:${record.daily.region}`, record.completedAt, DAILY_RULE_VERSION,
        ));
        statements.push(this.database.prepare(`INSERT INTO streaks
        (id,anonymous_subject_hash,streak_type,current_count,longest_count,last_qualifying_date,last_qualified_at,rule_version,expires_at,version,created_at,updated_at)
        VALUES (?1,?2,?3,1,1,?4,?5,?6,?7,2,?5,?5)
        ON CONFLICT(anonymous_subject_hash,streak_type) DO UPDATE SET
          current_count=CASE WHEN streaks.expires_at<=excluded.last_qualified_at THEN 1 WHEN streaks.last_qualifying_date=?4 THEN streaks.current_count
            WHEN streaks.last_qualifying_date=?8 THEN streaks.current_count+1 ELSE 1 END,
          longest_count=max(streaks.longest_count,CASE WHEN streaks.expires_at<=excluded.last_qualified_at THEN 1 WHEN streaks.last_qualifying_date=?4 THEN streaks.current_count
            WHEN streaks.last_qualifying_date=?8 THEN streaks.current_count+1 ELSE 1 END),
          last_qualifying_date=?4,last_qualified_at=?5,rule_version=?6,expires_at=?7,anonymized_at=NULL,deleted_at=NULL,version=streaks.version+1,updated_at=?5`).bind(
        record.streakId, record.ownerHash, `daily:${record.daily.region}`,
        record.daily.challengeDate, record.completedAt, DAILY_RULE_VERSION,
        record.completedAt + DAILY_STREAK_RETENTION_MS, previousUtcDate(record.daily.challengeDate),
      ));
      }
    }
    try {
      await this.database.batch(statements);
      return Boolean(await this.getResultByAttempt(record.attempt.id));
    } catch { return false; }
  }

  async getStreak(ownerHash: string, region: RegionKey, now: number): Promise<DailyStreak | null> {
    const row = await this.database.prepare(`SELECT current_count,longest_count,last_qualifying_date,expires_at FROM streaks
      WHERE anonymous_subject_hash=?1 AND streak_type=?2 AND rule_version=?3 AND version>=2
        AND deleted_at IS NULL AND anonymized_at IS NULL AND expires_at>?4 LIMIT 1`).bind(ownerHash, `daily:${region}`, DAILY_RULE_VERSION, now).first<Record<string, unknown>>();
    if (!row) return null;
    const current = Number(row.current_count); const best = Number(row.longest_count);
    return Object.freeze({ current, best, lastDate: String(row.last_qualifying_date), expiresAt: Number(row.expires_at), milestone: streakMilestone(current), masterySeal: current === 7 || current === 30 || current === 90 || current === 180 });
  }

  async clearStreaks(ownerHash: string): Promise<void> {
    if (!HASH.test(ownerHash)) return fail("daily_owner_invalid");
    const result = await this.database.prepare(`DELETE FROM streaks WHERE anonymous_subject_hash=?1`).bind(ownerHash).run();
    if (!result.success) return fail("streak_clear_unavailable");
  }

  async purgeExpiredStreaks(now: number, limit: number): Promise<number> {
    const result = await this.database.prepare(`DELETE FROM streaks WHERE id IN
      (SELECT id FROM streaks WHERE expires_at<=?1 ORDER BY expires_at LIMIT ?2)`).bind(now, limit).run();
    if (!result.success) return fail("streak_purge_unavailable");
    return Number(result.meta?.changes || 0);
  }

  async consumeRateLimit(rateKeyHash: string, action: DailyOperation, now: number, limit: number): Promise<"allowed" | "limited" | "unavailable"> {
    if (!HASH.test(rateKeyHash)) return "unavailable";
    const windowStartedAt = Math.floor(now / 60_000) * 60_000;
    const id = `daily_limit_${(await sha256(`${rateKeyHash}\u0000${action}\u0000${windowStartedAt}`)).slice(0, 32)}`;
    try {
      const write = await this.database.prepare(`INSERT INTO daily_operation_limits
        (id,rate_key_hash,action,window_started_at,request_count,expires_at,created_at,updated_at)
        VALUES (?1,?2,?3,?4,1,?5,?6,?6)
        ON CONFLICT(rate_key_hash,action,window_started_at) DO UPDATE SET request_count=request_count+1,updated_at=excluded.updated_at`).bind(
        id, rateKeyHash, action, windowStartedAt, windowStartedAt + 86_400_000, now,
      ).run();
      if (!write.success) return "unavailable";
      const count = await this.database.prepare(`SELECT request_count FROM daily_operation_limits WHERE rate_key_hash=?1 AND action=?2 AND window_started_at=?3`).bind(rateKeyHash, action, windowStartedAt).first<number>("request_count");
      return typeof count === "number" && count <= limit ? "allowed" : "limited";
    } catch { return "unavailable"; }
  }
}
