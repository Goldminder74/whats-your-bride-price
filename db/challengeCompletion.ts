import { calculateResultTier } from "../app/gameLogic.ts";
import { regions, type RegionKey } from "../app/publicGameData.ts";
import { publicDisplayNameFallback, validateDisplayName } from "../app/displayNames.ts";
import { PRODUCT_SAFEGUARD } from "../app/productSafeguards.ts";
import type { AtomicD1Database, BoundStatement } from "./repositories.ts";
import { QUESTION_SET_VERSION, SCORING_VERSION } from "./seeds/development.ts";

export const CHALLENGE_COMPLETION_COLLISION_LIMIT = 5;
export const CHALLENGE_MASTERY_RULE_VERSION = "regional-9-of-12-v1";
export const CHALLENGE_SCORING_WEIGHT_POLICY = "uniform-binary-v1";
export const CHALLENGE_DIFFICULTY_POLICY = "approved-mixed-v1";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PUBLIC_CODE_PATTERN = /^[0-9a-f]{48}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const QUESTION_ID_PATTERN = /^(west|east|central|north|south)_[a-z0-9][a-z0-9_-]{2,55}$/;
const OPTION_ID_PATTERN = /^o[1-9][0-9]?$/;

export type ChallengeComparisonOutcome = "beat" | "tied" | "did_not_beat" | "unavailable";
export type ChallengeComparisonUnavailableReason =
  | "inviter_unavailable"
  | "edition"
  | "scoring_version"
  | "question_count"
  | "scoring_weight_policy"
  | "difficulty_policy"
  | "question_set";

export type ComparisonCompatibility = Readonly<{
  compatible: boolean;
  reason: ChallengeComparisonUnavailableReason | null;
}>;

export type ComparableResult = Readonly<{
  edition: RegionKey;
  scoringVersion: string;
  total: number;
  questionSetVersion: string;
  scoringWeightPolicy: string;
  difficultyPolicy: string;
  state: string;
  expiresAt: number | null;
}>;

export type ChallengeComparisonProjection = Readonly<{
  edition: RegionKey;
  editionLabel: string;
  inviterDisplayName: string;
  inviterScore: number | null;
  recipientScore: number;
  maximumScore: number;
  difference: number | null;
  outcome: ChallengeComparisonOutcome;
  explanation: string;
  masterySealAwarded: boolean;
  official: true;
  safeguard: typeof PRODUCT_SAFEGUARD;
}>;

export type ChallengeAnswerSubmission = Readonly<{
  questionStableId: string;
  selectedOptionIds: readonly string[];
}>;

export type AuthoritativeQuestion = Readonly<{
  id: string;
  stableId: string;
  version: number;
  optionIds: readonly string[];
  correctOptionIds: readonly string[];
  acceptedOptionSets?: readonly (readonly string[])[];
  scoringWeight: number;
  difficulty: string | null;
}>;

export type ChallengeCompletionAuthority = Readonly<{
  challengeId: string;
  publicCode: string;
  challengeAttemptId: string;
  recipientAttemptId: string;
  recipientSubjectHash: string;
  editionId: string;
  edition: RegionKey;
  editionLabel: string;
  scoringVersion: string;
  questionSetVersion: string;
  questions: readonly AuthoritativeQuestion[];
  inviterDisplayName: string;
  inviterScore: number | null;
  inviterCompatibility: ComparableResult | null;
  expiresAt: number;
}>;

export type NewChallengeCompletion = Readonly<{
  authority: ChallengeCompletionAuthority;
  answers: readonly Readonly<{
    id: string;
    questionId: string;
    questionVersion: number;
    selectedOptionIdsJson: string;
    isCorrect: boolean;
    scoreAwarded: number;
  }>[];
  resultId: string;
  resultPublicSlug: string;
  completionIdempotencyHash: string;
  score: number;
  maximumScore: number;
  tier: number;
  scoringSnapshotJson: string;
  databaseOutcome: "beat" | "tied" | "not_beat" | "incompatible" | "unavailable";
  comparison: ChallengeComparisonProjection;
  official: boolean;
  masterySealId: string | null;
  completedAt: number;
}>;

export type ChallengeCompletionInsertOutcome =
  | Readonly<{ kind: "created"; comparison: ChallengeComparisonProjection }>
  | Readonly<{ kind: "official-conflict"; comparison: ChallengeComparisonProjection }>
  | Readonly<{ kind: "collision" }>
  | Readonly<{ kind: "unavailable" }>;

export interface ChallengeCompletionRepository {
  readonly storageAvailable: boolean;
  getOfficialCompletion(publicCode: string, recipientSubjectHash: string, now: number): Promise<ChallengeComparisonProjection | null>;
  getAcceptedAuthority(publicCode: string, recipientSubjectHash: string, now: number): Promise<ChallengeCompletionAuthority | null>;
  completeAtomically(record: NewChallengeCompletion): Promise<ChallengeCompletionInsertOutcome>;
}

export class ChallengeCompletionError extends Error {
  readonly code: string;
  readonly publicMessage: string;
  constructor(code: string, publicMessage = "We could not confirm this comparison right now.") {
    super(code);
    this.name = "ChallengeCompletionError";
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

function fail(code: string, publicMessage?: string): never {
  throw new ChallengeCompletionError(code, publicMessage);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function secureHex(byteLength: number, randomSource: (bytes: Uint8Array) => Uint8Array): string {
  const bytes = new Uint8Array(byteLength);
  if (randomSource(bytes) !== bytes) return fail("secure_random_unavailable");
  return bytesToHex(bytes);
}

function exactSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function safeInviterName(value: string): string {
  const validated = validateDisplayName(value);
  return validated.valid ? validated.value || publicDisplayNameFallback : publicDisplayNameFallback;
}

export function compareResultCompatibility(
  inviter: ComparableResult | null,
  recipient: ComparableResult,
  now = Date.now(),
): ComparisonCompatibility {
  if (!inviter || inviter.state !== "active" || (inviter.expiresAt !== null && inviter.expiresAt <= now)) {
    return Object.freeze({ compatible: false, reason: "inviter_unavailable" });
  }
  const checks: ReadonlyArray<readonly [boolean, ChallengeComparisonUnavailableReason]> = [
    [inviter.edition === recipient.edition, "edition"],
    [inviter.scoringVersion === recipient.scoringVersion, "scoring_version"],
    [inviter.total === recipient.total, "question_count"],
    [inviter.scoringWeightPolicy === recipient.scoringWeightPolicy, "scoring_weight_policy"],
    [inviter.difficultyPolicy === recipient.difficultyPolicy, "difficulty_policy"],
    [inviter.questionSetVersion === recipient.questionSetVersion, "question_set"],
  ];
  const failed = checks.find(([matches]) => !matches);
  return failed
    ? Object.freeze({ compatible: false, reason: failed[1] })
    : Object.freeze({ compatible: true, reason: null });
}

export function comparisonOutcome(recipientScore: number, inviterScore: number): Exclude<ChallengeComparisonOutcome, "unavailable"> {
  if (recipientScore > inviterScore) return "beat";
  if (recipientScore === inviterScore) return "tied";
  return "did_not_beat";
}

export function comparisonExplanation(outcome: ChallengeComparisonOutcome): string {
  if (outcome === "beat") return "You beat the score to protect the family reputation.";
  if (outcome === "tied") return "A perfect tie. The family reputation is safe in both hands.";
  if (outcome === "did_not_beat") return "Not this time, but your culture knowledge still deserves celebration.";
  return "Your result is ready, but a fair comparison is not available.";
}

export function validateChallengeCompletionInput(input: Readonly<{
  publicCode: unknown;
  idempotencyKey: unknown;
  anonymousSubjectHash: unknown;
  answers: unknown;
}>): Readonly<{
  publicCode: string;
  idempotencyKey: string;
  anonymousSubjectHash: string;
  answers: readonly ChallengeAnswerSubmission[];
}> {
  if (typeof input.publicCode !== "string" || !PUBLIC_CODE_PATTERN.test(input.publicCode)) return fail("invalid_challenge_code");
  if (typeof input.idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) return fail("invalid_idempotency_key");
  if (typeof input.anonymousSubjectHash !== "string" || !SHA256_PATTERN.test(input.anonymousSubjectHash)) return fail("invalid_anonymous_subject");
  if (!Array.isArray(input.answers) || input.answers.length !== 12) return fail("invalid_answers");
  const answers: ChallengeAnswerSubmission[] = [];
  const questionIds = new Set<string>();
  for (const value of input.answers) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("invalid_answers");
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(",") !== "questionStableId,selectedOptionIds") return fail("invalid_answers");
    if (typeof record.questionStableId !== "string" || !QUESTION_ID_PATTERN.test(record.questionStableId) || questionIds.has(record.questionStableId)) return fail("invalid_answers");
    if (!Array.isArray(record.selectedOptionIds) || record.selectedOptionIds.length < 1 || record.selectedOptionIds.length > 3) return fail("invalid_answers");
    if (new Set(record.selectedOptionIds).size !== record.selectedOptionIds.length || record.selectedOptionIds.some((id) => typeof id !== "string" || !OPTION_ID_PATTERN.test(id))) return fail("invalid_answers");
    questionIds.add(record.questionStableId);
    answers.push(Object.freeze({
      questionStableId: record.questionStableId,
      selectedOptionIds: Object.freeze([...(record.selectedOptionIds as string[])]),
    }));
  }
  return Object.freeze({
    publicCode: input.publicCode,
    idempotencyKey: input.idempotencyKey,
    anonymousSubjectHash: input.anonymousSubjectHash,
    answers: Object.freeze(answers),
  });
}

function recipientCompatibility(authority: ChallengeCompletionAuthority, maximumScore: number): ComparableResult {
  return Object.freeze({
    edition: authority.edition,
    scoringVersion: authority.scoringVersion,
    total: maximumScore,
    questionSetVersion: authority.questionSetVersion,
    scoringWeightPolicy: CHALLENGE_SCORING_WEIGHT_POLICY,
    difficultyPolicy: CHALLENGE_DIFFICULTY_POLICY,
    state: "active",
    expiresAt: authority.expiresAt,
  });
}

function buildComparison(
  authority: ChallengeCompletionAuthority,
  score: number,
  maximumScore: number,
  masterySealAwarded: boolean,
  now: number,
): Readonly<{ projection: ChallengeComparisonProjection; databaseOutcome: NewChallengeCompletion["databaseOutcome"] }> {
  const compatibility = compareResultCompatibility(authority.inviterCompatibility, recipientCompatibility(authority, maximumScore), now);
  const outcome = compatibility.compatible && authority.inviterScore !== null
    ? comparisonOutcome(score, authority.inviterScore)
    : "unavailable";
  const databaseOutcome = outcome === "did_not_beat"
    ? "not_beat"
    : outcome === "unavailable" && compatibility.reason !== "inviter_unavailable"
      ? "incompatible"
      : outcome;
  return Object.freeze({
    databaseOutcome,
    projection: Object.freeze({
      edition: authority.edition,
      editionLabel: authority.editionLabel,
      inviterDisplayName: safeInviterName(authority.inviterDisplayName),
      inviterScore: outcome === "unavailable" ? null : authority.inviterScore,
      recipientScore: score,
      maximumScore,
      difference: outcome === "unavailable" || authority.inviterScore === null ? null : score - authority.inviterScore,
      outcome,
      explanation: comparisonExplanation(outcome),
      masterySealAwarded,
      official: true,
      safeguard: PRODUCT_SAFEGUARD,
    }),
  });
}

export class ChallengeCompletionService {
  private readonly repository: ChallengeCompletionRepository;
  private readonly options: Readonly<{
    now?: () => number;
    randomSource?: (bytes: Uint8Array) => Uint8Array;
    allowReplay?: boolean;
  }>;

  constructor(repository: ChallengeCompletionRepository, options: ChallengeCompletionService["options"] = {}) {
    this.repository = repository;
    this.options = options;
  }

  async complete(input: Readonly<{
    publicCode: unknown;
    idempotencyKey: unknown;
    anonymousSubjectHash: unknown;
    answers: unknown;
  }>): Promise<ChallengeComparisonProjection> {
    if (!this.repository.storageAvailable) return fail("storage_unavailable");
    const validated = validateChallengeCompletionInput(input);
    const now = this.options.now?.() ?? Date.now();
    const existingOfficial = await this.repository.getOfficialCompletion(validated.publicCode, validated.anonymousSubjectHash, now);
    if (existingOfficial && !this.options.allowReplay) return existingOfficial;
    const authority = await this.repository.getAcceptedAuthority(validated.publicCode, validated.anonymousSubjectHash, now);
    if (!authority) {
      if (existingOfficial) return existingOfficial;
      return fail("challenge_attempt_unavailable");
    }
    if (authority.recipientSubjectHash !== validated.anonymousSubjectHash) return fail("challenge_attempt_unavailable");
    if (authority.scoringVersion !== SCORING_VERSION || authority.questionSetVersion !== QUESTION_SET_VERSION || authority.questions.length !== 12) {
      return fail("authoritative_scoring_unavailable");
    }
    const submitted = new Map(validated.answers.map((answer) => [answer.questionStableId, answer]));
    const answerRows: NewChallengeCompletion["answers"][number][] = [];
    let score = 0;
    let maximumScore = 0;
    for (const question of authority.questions) {
      const answer = submitted.get(question.stableId);
      if (!answer || question.scoringWeight !== 1 || !answer.selectedOptionIds.every((id) => question.optionIds.includes(id))) return fail("invalid_answers");
      const correct = (question.acceptedOptionSets || [question.correctOptionIds]).some((accepted) => exactSet(answer.selectedOptionIds, accepted));
      score += correct ? question.scoringWeight : 0;
      maximumScore += question.scoringWeight;
      answerRows.push(Object.freeze({
        id: "",
        questionId: question.id,
        questionVersion: question.version,
        selectedOptionIdsJson: JSON.stringify(answer.selectedOptionIds),
        isCorrect: correct,
        scoreAwarded: correct ? question.scoringWeight : 0,
      }));
    }
    if (submitted.size !== authority.questions.length || maximumScore !== 12) return fail("authoritative_scoring_unavailable");
    const mastery = score >= 9;
    const comparison = buildComparison(authority, score, maximumScore, mastery, now);
    const randomSource = this.options.randomSource ?? crypto.getRandomValues.bind(crypto);
    const completionIdempotencyHash = await sha256Hex(`wybp-challenge-complete-v1\u0000${validated.idempotencyKey}`);
    const official = !existingOfficial;
    for (let attempt = 0; attempt < CHALLENGE_COMPLETION_COLLISION_LIMIT; attempt += 1) {
      const resultId = `result_${secureHex(24, randomSource)}`;
      const populatedAnswers = answerRows.map((answer, index) => Object.freeze({
        ...answer,
        id: `answer_${secureHex(24, randomSource)}_${String(index + 1).padStart(2, "0")}`,
      }));
      const record: NewChallengeCompletion = Object.freeze({
        authority,
        answers: Object.freeze(populatedAnswers),
        resultId,
        resultPublicSlug: secureHex(24, randomSource),
        completionIdempotencyHash,
        score,
        maximumScore,
        tier: calculateResultTier(score),
        scoringSnapshotJson: JSON.stringify({
          scoringVersion: authority.scoringVersion,
          questionSetVersion: authority.questionSetVersion,
          scoringWeightPolicy: CHALLENGE_SCORING_WEIGHT_POLICY,
          difficultyPolicy: CHALLENGE_DIFFICULTY_POLICY,
          total: maximumScore,
        }),
        databaseOutcome: comparison.databaseOutcome,
        comparison: comparison.projection,
        official,
        masterySealId: mastery ? `mastery_${secureHex(24, randomSource)}` : null,
        completedAt: now,
      });
      const outcome = await this.repository.completeAtomically(record);
      if (outcome.kind === "collision") continue;
      if (outcome.kind === "unavailable") return fail("completion_unavailable");
      return outcome.comparison;
    }
    return fail("collision_exhausted");
  }
}

type CompletionAuthorityRow = {
  challenge_id: string;
  public_code: string;
  challenge_attempt_id: string;
  recipient_attempt_id: string;
  recipient_subject_hash: string;
  edition_id: string;
  edition_key: string;
  edition_label: string;
  scoring_version: string;
  question_set_version: string;
  selected_question_versions_json: string;
  reviewed_inviter_name: string | null;
  verified_score_to_beat: number;
  challenge_expires_at: number;
  inviter_state: string | null;
  inviter_expires_at: number | null;
  inviter_score: number | null;
  inviter_total: number | null;
  inviter_scoring_version: string | null;
  inviter_question_set_version: string | null;
  inviter_scoring_snapshot_json: string | null;
};

function parseSnapshot(value: string | null): Readonly<{ scoringWeightPolicy: string; difficultyPolicy: string }> | null {
  if (!value || value.length > 4_000) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return typeof parsed.scoringWeightPolicy === "string" && typeof parsed.difficultyPolicy === "string"
      ? Object.freeze({ scoringWeightPolicy: parsed.scoringWeightPolicy, difficultyPolicy: parsed.difficultyPolicy })
      : null;
  } catch { return null; }
}

async function first<T extends Record<string, unknown>>(database: AtomicD1Database, query: string, values: readonly unknown[]): Promise<T | null> {
  return database.prepare(query).bind(...values).first<T>();
}

function outcomeFromDatabase(value: string): ChallengeComparisonOutcome {
  if (value === "beat" || value === "tied") return value;
  if (value === "not_beat") return "did_not_beat";
  return "unavailable";
}

export class D1ChallengeCompletionRepository implements ChallengeCompletionRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;
  constructor(database: AtomicD1Database) { this.database = database; }

  async getOfficialCompletion(publicCode: string, subjectHash: string, now: number): Promise<ChallengeComparisonProjection | null> {
    const row = await first<{
      edition_key: string; edition_label: string; reviewed_inviter_name: string | null;
      verified_score_to_beat: number; inviter_state: string | null; inviter_expires_at: number | null;
      recipient_result_id: string | null; recipient_state: string | null; recipient_expires_at: number | null;
      recipient_score: number; recipient_total: number; outcome: string; mastery_count: number;
    }>(this.database, `SELECT
      qe.edition_key, qe.name AS edition_label, c.reviewed_inviter_name,
      c.verified_score_to_beat, ir.state AS inviter_state, ir.expires_at AS inviter_expires_at,
      rr.id AS recipient_result_id, rr.state AS recipient_state, rr.expires_at AS recipient_expires_at,
      COALESCE(rr.score, (
        SELECT COALESCE(sum(a.score_awarded), 0) FROM answers a
        WHERE a.attempt_id = ca.recipient_attempt_id
      )) AS recipient_score,
      COALESCE(rr.total, c.total) AS recipient_total, ca.outcome,
      (SELECT count(*) FROM mastery_seals ms WHERE ms.result_id = rr.id AND ms.state = 'active') AS mastery_count
    FROM challenge_attempts ca
    JOIN challenges c ON c.id = ca.challenge_id
    JOIN quiz_editions qe ON qe.id = c.edition_id
    LEFT JOIN results rr ON rr.id = ca.official_result_id AND rr.attempt_id = ca.recipient_attempt_id
    LEFT JOIN results ir ON ir.id = c.inviter_result_id
    WHERE c.public_code = ?1 AND ca.recipient_subject_hash = ?2
      AND ca.is_official_comparison = 1 AND ca.state = 'completed'
    LIMIT 1`, [publicCode, subjectHash]);
    if (!row || !(row.edition_key in regions)) return null;
    const inviterAvailable = row.inviter_state === "active" && (row.inviter_expires_at === null || row.inviter_expires_at > now);
    const recipientAvailable = row.recipient_result_id !== null && row.recipient_state === "active"
      && (row.recipient_expires_at === null || row.recipient_expires_at > now);
    const storedOutcome = inviterAvailable && recipientAvailable ? outcomeFromDatabase(row.outcome) : "unavailable";
    const inviterScore = storedOutcome === "unavailable" ? null : row.verified_score_to_beat;
    return Object.freeze({
      edition: row.edition_key as RegionKey,
      editionLabel: row.edition_label,
      inviterDisplayName: safeInviterName(row.reviewed_inviter_name || publicDisplayNameFallback),
      inviterScore,
      recipientScore: row.recipient_score,
      maximumScore: row.recipient_total,
      difference: inviterScore === null ? null : row.recipient_score - inviterScore,
      outcome: storedOutcome,
      explanation: comparisonExplanation(storedOutcome),
      masterySealAwarded: row.mastery_count > 0,
      official: true,
      safeguard: PRODUCT_SAFEGUARD,
    });
  }

  async getAcceptedAuthority(publicCode: string, subjectHash: string, now: number): Promise<ChallengeCompletionAuthority | null> {
    const row = await first<CompletionAuthorityRow>(this.database, `SELECT
      c.id AS challenge_id, c.public_code, ca.id AS challenge_attempt_id,
      ca.recipient_attempt_id, qa.anonymous_subject_hash AS recipient_subject_hash,
      c.edition_id, qe.edition_key, qe.name AS edition_label, qa.scoring_version,
      qa.question_set_version, qa.selected_question_versions_json, c.reviewed_inviter_name,
      c.verified_score_to_beat, c.expires_at AS challenge_expires_at,
      ir.state AS inviter_state, ir.expires_at AS inviter_expires_at, ir.score AS inviter_score,
      ir.total AS inviter_total, ir.scoring_version AS inviter_scoring_version,
      ir.question_set_version AS inviter_question_set_version,
      ir.scoring_snapshot_json AS inviter_scoring_snapshot_json
    FROM challenge_attempts ca
    JOIN challenges c ON c.id = ca.challenge_id
    JOIN quiz_attempts qa ON qa.id = ca.recipient_attempt_id
    JOIN quiz_editions qe ON qe.id = qa.edition_id AND qe.id = c.edition_id
    LEFT JOIN results ir ON ir.id = c.inviter_result_id
    WHERE c.public_code = ?1 AND qa.anonymous_subject_hash = ?2
      AND (ca.recipient_subject_hash = ?2 OR ca.recipient_subject_hash IS NULL)
      AND ca.state = 'accepted' AND qa.status = 'in_progress'
      AND ca.expires_at > ?3 AND qa.expires_at > ?3
      AND c.state = 'active' AND c.expires_at > ?3
    ORDER BY ca.accepted_at DESC
    LIMIT 1`, [publicCode, subjectHash, now]);
    if (!row || !(row.edition_key in regions) || !SHA256_PATTERN.test(row.recipient_subject_hash)) return null;
    let selected: unknown;
    try { selected = JSON.parse(row.selected_question_versions_json); } catch { return null; }
    if (!Array.isArray(selected) || selected.length !== 12) return null;
    const questions: AuthoritativeQuestion[] = [];
    for (const item of selected) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const stableId = (item as Record<string, unknown>).stableId;
      const version = (item as Record<string, unknown>).version;
      if (typeof stableId !== "string" || !Number.isInteger(version)) return null;
      const question = await first<{
        id: string; stable_id: string; version: number; answer_options_json: string;
        correct_answer_json: string; accepted_answers_json: string; scoring_weight: number; difficulty: string | null;
      }>(this.database, `SELECT id, stable_id, version, answer_options_json,
        correct_answer_json, accepted_answers_json, scoring_weight, difficulty FROM questions
        WHERE stable_id = ?1 AND version = ?2 AND edition_id = ?3
        LIMIT 1`, [stableId, version, row.edition_id]);
      if (!question) return null;
      try {
        const options = JSON.parse(question.answer_options_json) as Array<{ id?: unknown }>;
        const correct = JSON.parse(question.correct_answer_json) as unknown;
        const alternatives = JSON.parse(question.accepted_answers_json) as unknown;
        if (!Array.isArray(options) || !Array.isArray(correct) || !Array.isArray(alternatives)
          || !correct.every((id) => typeof id === "string")
          || alternatives.some((set) => !Array.isArray(set) || set.some((id) => typeof id !== "string"))) return null;
        questions.push(Object.freeze({
          id: question.id,
          stableId: question.stable_id,
          version: question.version,
          optionIds: Object.freeze(options.map((option) => String(option.id))),
          correctOptionIds: Object.freeze(correct as string[]),
          acceptedOptionSets: Object.freeze((alternatives.length ? alternatives as string[][] : [correct as string[]]).map((set) => Object.freeze([...set]))),
          scoringWeight: question.scoring_weight,
          difficulty: question.difficulty,
        }));
      } catch { return null; }
    }
    const snapshot = parseSnapshot(row.inviter_scoring_snapshot_json);
    const inviterCompatibility = snapshot && row.inviter_score !== null && row.inviter_total !== null
      && typeof row.inviter_scoring_version === "string" && typeof row.inviter_question_set_version === "string"
      ? Object.freeze({
          edition: row.edition_key as RegionKey,
          scoringVersion: row.inviter_scoring_version,
          total: row.inviter_total,
          questionSetVersion: row.inviter_question_set_version,
          scoringWeightPolicy: snapshot.scoringWeightPolicy,
          difficultyPolicy: snapshot.difficultyPolicy,
          state: row.inviter_state || "unavailable",
          expiresAt: row.inviter_expires_at,
        })
      : null;
    return Object.freeze({
      challengeId: row.challenge_id,
      publicCode: row.public_code,
      challengeAttemptId: row.challenge_attempt_id,
      recipientAttemptId: row.recipient_attempt_id,
      recipientSubjectHash: row.recipient_subject_hash,
      editionId: row.edition_id,
      edition: row.edition_key as RegionKey,
      editionLabel: row.edition_label,
      scoringVersion: row.scoring_version,
      questionSetVersion: row.question_set_version,
      questions: Object.freeze(questions),
      inviterDisplayName: row.reviewed_inviter_name || publicDisplayNameFallback,
      inviterScore: row.inviter_score,
      inviterCompatibility,
      expiresAt: row.challenge_expires_at,
    });
  }

  async completeAtomically(record: NewChallengeCompletion): Promise<ChallengeCompletionInsertOutcome> {
    const a = record.authority;
    const gate = record.official
      ? `AND NOT EXISTS (
          SELECT 1 FROM challenge_attempts official
          WHERE official.challenge_id = ?3 AND official.recipient_subject_hash = ?2
            AND official.is_official_comparison = 1
        )`
      : `AND EXISTS (
          SELECT 1 FROM challenge_attempts official
          WHERE official.challenge_id = ?3 AND official.recipient_subject_hash = ?2
            AND official.is_official_comparison = 1
        )`;
    const statements: BoundStatement[] = [
      this.database.prepare(`UPDATE quiz_attempts SET
        status = 'completed', completed_at = ?4, updated_at = ?4, version = version + 1
      WHERE id = ?1 AND anonymous_subject_hash = ?2 AND status = 'in_progress'
        AND challenge_code = ?5 AND expires_at > ?4 ${gate}`).bind(
        a.recipientAttemptId, a.recipientSubjectHash, a.challengeId, record.completedAt, a.publicCode,
      ),
    ];
    for (const answer of record.answers) {
      statements.push(this.database.prepare(`INSERT INTO answers (
        id, attempt_id, question_id, question_version, selected_option_ids_json,
        is_correct, score_awarded, answered_at, version, created_at, updated_at
      ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?8, ?8
      WHERE EXISTS (
        SELECT 1 FROM quiz_attempts qa WHERE qa.id = ?2 AND qa.status = 'completed'
          AND qa.completed_at = ?8 AND qa.anonymous_subject_hash = ?9
      )`).bind(
        answer.id, a.recipientAttemptId, answer.questionId, answer.questionVersion,
        answer.selectedOptionIdsJson, answer.isCorrect ? 1 : 0, answer.scoreAwarded,
        record.completedAt, a.recipientSubjectHash,
      ));
    }
    statements.push(this.database.prepare(`INSERT INTO results (
      id, public_slug, attempt_id, edition_id, score, total, tier, scoring_version,
      question_set_version, scoring_snapshot_json, safe_avatar_id, reviewed_display_name,
      safeguard_version, state, expires_at, version, created_at, updated_at
    ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL,
      'culture-score-v1', 'active', ?11, 1, ?12, ?12
    WHERE EXISTS (
      SELECT 1 FROM quiz_attempts qa WHERE qa.id = ?3 AND qa.status = 'completed'
        AND qa.completed_at = ?12 AND qa.anonymous_subject_hash = ?13
    )`).bind(
      record.resultId, record.resultPublicSlug, a.recipientAttemptId, a.editionId,
      record.score, record.maximumScore, record.tier, a.scoringVersion,
      a.questionSetVersion, record.scoringSnapshotJson, a.expiresAt,
      record.completedAt, a.recipientSubjectHash,
    ));
    statements.push(this.database.prepare(`UPDATE challenge_attempts SET
      recipient_subject_hash = (
        SELECT qa.anonymous_subject_hash FROM quiz_attempts qa WHERE qa.id = recipient_attempt_id
      ),
      official_result_id = ?2,
      is_official_comparison = ?7,
      outcome = ?3, state = 'completed', completed_at = ?4,
      updated_at = ?4, version = version + 1
    WHERE id = ?1 AND recipient_attempt_id = ?5 AND state = 'accepted'
      AND EXISTS (
        SELECT 1 FROM results r WHERE r.id = ?6 AND r.attempt_id = recipient_attempt_id
      )`).bind(
      a.challengeAttemptId,
      record.official ? record.resultId : null,
      record.databaseOutcome,
      record.completedAt,
      a.recipientAttemptId,
      record.resultId,
      record.official ? 1 : 0,
    ));
    if (record.masterySealId) {
      statements.push(this.database.prepare(`INSERT INTO mastery_seals (
        id, anonymous_subject_hash, edition_id, result_id, rule_version, earned_at,
        state, version, created_at, updated_at
      ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'active', 1, ?6, ?6
      WHERE EXISTS (
        SELECT 1 FROM results r WHERE r.id = ?4 AND r.attempt_id = ?7 AND r.score >= 9
      ) ON CONFLICT(anonymous_subject_hash, edition_id, rule_version) DO NOTHING`).bind(
        record.masterySealId, a.recipientSubjectHash, a.editionId, record.resultId,
        CHALLENGE_MASTERY_RULE_VERSION, record.completedAt, a.recipientAttemptId,
      ));
    }
    try {
      await this.database.batch(statements);
    } catch {
      const official = await this.getOfficialCompletion(a.publicCode, a.recipientSubjectHash, record.completedAt);
      if (official) return Object.freeze({ kind: "official-conflict", comparison: official });
      return Object.freeze({ kind: "collision" });
    }
    const comparison = await this.getOfficialCompletion(a.publicCode, a.recipientSubjectHash, record.completedAt);
    if (comparison) return Object.freeze({ kind: "created", comparison });
    return Object.freeze({ kind: "unavailable" });
  }
}

export function isSafeChallengeComparisonProjection(value: unknown): value is ChallengeComparisonProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.edition === "string" && record.edition in regions
    && typeof record.editionLabel === "string" && record.editionLabel === regions[record.edition as RegionKey].name
    && typeof record.inviterDisplayName === "string"
    && (record.inviterScore === null || Number.isInteger(record.inviterScore))
    && Number.isInteger(record.recipientScore) && Number.isInteger(record.maximumScore)
    && (record.difference === null || Number.isInteger(record.difference))
    && ["beat", "tied", "did_not_beat", "unavailable"].includes(String(record.outcome))
    && typeof record.explanation === "string" && record.official === true
    && typeof record.masterySealAwarded === "boolean" && record.safeguard === PRODUCT_SAFEGUARD;
}
