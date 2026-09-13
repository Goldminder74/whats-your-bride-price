import type { RegionKey } from "../app/gameData.ts";
import { imageAnswerPresentations } from "../app/imageQuestionPresentation.ts";
import type { AtomicD1Database } from "./repositories.ts";
import type { QuestionDifficulty, QuestionKind, QuestionMediaProvenance, QuestionOption } from "./questionBankContracts.ts";
import { QUESTION_SET_VERSION, SCORING_VERSION } from "./seeds/development.ts";

export const QUESTION_SELECTION_POLICY_VERSION = "balanced-v1" as const;
export const RANDOM_QUICK_PLAY_POLICY_VERSION = "balanced-random-v2" as const;
export const DEFAULT_GAME_QUESTION_COUNT = 12;
export const MINIMUM_RANDOM_QUICK_PLAY_BANK = 30;
export const PREFERRED_RANDOM_QUICK_PLAY_BANK = 50;
export const RECENT_QUESTION_AVOIDANCE_TARGET = 24;
export const MAX_RECENT_QUESTION_REFERENCES = 100;
export const RECENT_QUESTION_HISTORY_MS = 90 * 86_400_000;

export type QuestionVersionReference = Readonly<{ stableId: string; version: number }>;
export type SelectableQuestion = Readonly<{
  internalId: string;
  editionId: string;
  stableId: string;
  version: number;
  region: RegionKey;
  category: string;
  difficulty: QuestionDifficulty;
  questionKind: QuestionKind;
  questionText: string;
  visualStart: number | null;
  answerOptions: readonly QuestionOption[];
  acceptedAnswers: readonly (readonly string[])[];
  explanation: string;
  scoringWeight: number;
  lifecycleStatus: "published";
  sourceReviewStatus: "approved";
  publishedAt: number;
  retiredAt: number | null;
  validFrom: number | null;
  validUntil: number | null;
  imageProvenance: readonly QuestionMediaProvenance[];
  audioProvenance: readonly QuestionMediaProvenance[];
}>;

export type PublicSelectedQuestion = Readonly<{
  questionRef: string;
  version: number;
  kind: QuestionKind;
  text: string;
  options: readonly QuestionOption[];
  imageAssets: readonly string[];
  imageDescriptions: readonly string[];
  audioAssets: readonly string[];
}>;

export type QuestionSelection = Readonly<{
  questions: readonly SelectableQuestion[];
  optionOrders: readonly (readonly string[])[];
  questionSetVersion: string;
  scoringVersion: string;
  selectionPolicyVersion: typeof QUESTION_SELECTION_POLICY_VERSION | typeof RANDOM_QUICK_PLAY_POLICY_VERSION;
  seedReference: string;
  usedRecentQuestions: boolean;
}>;

export type StoredQuestionSelection = Readonly<{
  attemptId: string;
  region: RegionKey;
  expiresAt: number;
  selection: QuestionSelection;
}>;
export type QuestionAnswerJudgement = Readonly<{ correct: boolean; correctOptionIds: readonly string[]; explanation: string }>;

export class QuestionSelectionError extends Error {
  readonly code: string;
  readonly available?: number;
  readonly required?: number;
  constructor(code: string, details: Readonly<{ available?: number; required?: number }> = {}) {
    super(code);
    this.name = "QuestionSelectionError";
    this.code = code;
    this.available = details.available;
    this.required = details.required;
  }
}

const AUTHORIZED_SEED = Symbol("authorised question selection seed");
export type AuthorizedSelectionSeed = Readonly<{ bytes: Uint8Array; purpose: "challenge" | "comparison" | "daily"; [AUTHORIZED_SEED]: true }>;

function fail(code: string, details?: Readonly<{ available?: number; required?: number }>): never { throw new QuestionSelectionError(code, details); }

export function authorizeReproducibleSelectionSeed(
  bytes: Uint8Array,
  authority: Readonly<{ authorized: true; purpose: "challenge" | "comparison" | "daily" }>,
): AuthorizedSelectionSeed {
  if (authority.authorized !== true || bytes.byteLength !== 32) return fail("reproducible_seed_unauthorized");
  return Object.freeze({ bytes: new Uint8Array(bytes), purpose: authority.purpose, [AUTHORIZED_SEED]: true as const });
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(value: Uint8Array | string): Promise<Uint8Array> {
  const input = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const bytes = new Uint8Array(input.byteLength);
  bytes.set(input);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.buffer));
}

async function domainRank(seed: Uint8Array, domain: string, value: string): Promise<number> {
  const digest = await sha256Bytes(`${domain}\u0000${bytesToHex(seed)}\u0000${value}`);
  return new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getUint32(0, false);
}

function current(question: SelectableQuestion, now: number): boolean {
  return question.lifecycleStatus === "published"
    && question.sourceReviewStatus === "approved"
    && question.publishedAt <= now
    && question.retiredAt === null
    && (question.validFrom === null || question.validFrom <= now)
    && (question.validUntil === null || question.validUntil > now);
}

function referenceKey(question: Pick<SelectableQuestion, "stableId" | "version">): string {
  return `${question.stableId}@${question.version}`;
}

function safeAssetRefs(value: readonly unknown[]): readonly string[] {
  return Object.freeze(value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const assetRef = (entry as Record<string, unknown>).assetRef;
    return typeof assetRef === "string" && assetRef.startsWith("/") && !assetRef.startsWith("//") && !assetRef.includes("..") ? [assetRef] : [];
  }));
}

function exactOptionOrder(question: SelectableQuestion, optionOrder?: readonly string[]): readonly string[] {
  const canonical = question.answerOptions.map((option) => option.id);
  const order = optionOrder || canonical;
  if (order.length !== canonical.length || new Set(order).size !== order.length || order.some((id) => !canonical.includes(id))) {
    return fail("invalid_option_order");
  }
  return Object.freeze([...order]);
}

export function questionRequiresFixedOptionOrder(question: SelectableQuestion): boolean {
  return /\b(?:first|second|third|fourth|numbered|ordered|sequence|following order|from left|from right)\b/i.test(question.questionText)
    || /\b(?:first|second|third|fourth|former|latter)\b/i.test(question.explanation);
}

export function toPublicSelectedQuestion(question: SelectableQuestion): PublicSelectedQuestion;
export function toPublicSelectedQuestion(question: SelectableQuestion, optionOrder: readonly string[]): PublicSelectedQuestion;
export function toPublicSelectedQuestion(question: SelectableQuestion, optionOrder?: readonly string[] | number): PublicSelectedQuestion {
  const orderedIds = exactOptionOrder(question, Array.isArray(optionOrder) ? optionOrder : undefined);
  const byId = new Map(question.answerOptions.map((option) => [option.id, option]));
  const orderedOptions = orderedIds.map((id) => byId.get(id) as QuestionOption);
  const imagePresentation = question.questionKind === "image" ? imageAnswerPresentations({
    stableId: question.stableId,
    region: question.region,
    visualStart: question.visualStart,
    answerOptions: question.answerOptions,
    imageProvenance: question.imageProvenance,
  }) : Object.freeze([]);
  return Object.freeze({
    questionRef: question.stableId,
    version: question.version,
    kind: question.questionKind,
    text: question.questionText,
    options: Object.freeze(orderedOptions.map((option, index) => Object.freeze({
      id: option.id,
      text: question.questionKind === "image" ? imagePresentation[index].marker : option.text,
    }))),
    imageAssets: question.questionKind === "image"
      ? Object.freeze(orderedIds.map((id) => imagePresentation[question.answerOptions.findIndex((option) => option.id === id)].assetRef))
      : safeAssetRefs(question.imageProvenance),
    imageDescriptions: question.questionKind === "image"
      ? Object.freeze(orderedIds.map((id) => imagePresentation[question.answerOptions.findIndex((option) => option.id === id)].accessibilityDescription))
      : Object.freeze([]),
    audioAssets: safeAssetRefs(question.audioProvenance),
  });
}

export async function selectQuestionSet(input: Readonly<{
  candidates: readonly SelectableQuestion[];
  region: RegionKey;
  now?: number;
  count?: number;
  recentQuestionVersions?: readonly QuestionVersionReference[];
  authorizedSeed?: AuthorizedSelectionSeed;
  randomSource?: (bytes: Uint8Array) => Uint8Array;
  compatibleQuestionVersions?: readonly QuestionVersionReference[];
  minimumEligibleCount?: number;
}>): Promise<QuestionSelection> {
  const count = input.count ?? DEFAULT_GAME_QUESTION_COUNT;
  if (!Number.isInteger(count) || count < 1 || count > 50) return fail("invalid_selection_count");
  const now = input.now ?? Date.now();
  const latest = new Map<string, SelectableQuestion>();
  for (const candidate of input.candidates) {
    if (candidate.region !== input.region || !current(candidate, now)) continue;
    const existing = latest.get(candidate.stableId);
    if (!existing || existing.version < candidate.version) latest.set(candidate.stableId, candidate);
  }
  const eligible = [...latest.values()];
  if (input.compatibleQuestionVersions) {
    if (input.compatibleQuestionVersions.length !== count) return fail("incompatible_question_versions");
    const byReference = new Map(eligible.map((question) => [referenceKey(question), question]));
    const selected = input.compatibleQuestionVersions.map((reference) => byReference.get(`${reference.stableId}@${reference.version}`));
    if (selected.some((question) => !question)) return fail("incompatible_question_versions");
    const questions = Object.freeze(selected as SelectableQuestion[]);
    const rawSeed = input.authorizedSeed?.bytes;
    if (!rawSeed || input.authorizedSeed?.[AUTHORIZED_SEED] !== true) return fail("reproducible_seed_unauthorized");
    const seedReference = bytesToHex(await sha256Bytes(new Uint8Array([...rawSeed, ...new TextEncoder().encode(QUESTION_SELECTION_POLICY_VERSION)])));
    return Object.freeze({ questions, optionOrders: Object.freeze(questions.map((question) => Object.freeze(question.answerOptions.map((option) => option.id)))), questionSetVersion: QUESTION_SET_VERSION, scoringVersion: SCORING_VERSION, selectionPolicyVersion: QUESTION_SELECTION_POLICY_VERSION, seedReference, usedRecentQuestions: false });
  }
  const minimumEligibleCount = input.minimumEligibleCount ?? count;
  if (!Number.isInteger(minimumEligibleCount) || minimumEligibleCount < count || minimumEligibleCount > 500) return fail("invalid_minimum_bank");
  if (eligible.length < minimumEligibleCount) return fail("insufficient_published_bank", { available: eligible.length, required: minimumEligibleCount });
  const seed = input.authorizedSeed?.[AUTHORIZED_SEED] === true
    ? new Uint8Array(input.authorizedSeed.bytes)
    : (() => {
        const bytes = new Uint8Array(32);
        const source = input.randomSource ?? crypto.getRandomValues.bind(crypto);
        if (source(bytes) !== bytes) return fail("secure_random_unavailable");
        return bytes;
      })();
  const rankByKey = new Map<string, number>();
  for (const question of eligible) rankByKey.set(referenceKey(question), await domainRank(seed, "wybp:quick-play:selection:v2", referenceKey(question)));
  const recentReferences = (input.recentQuestionVersions || []).slice(0, MAX_RECENT_QUESTION_REFERENCES);
  const recentRank = new Map<string, number>();
  for (const [index, item] of recentReferences.entries()) if (!recentRank.has(`${item.stableId}@${item.version}`)) recentRank.set(`${item.stableId}@${item.version}`, index);
  const recent = new Set(recentReferences.slice(0, RECENT_QUESTION_AVOIDANCE_TARGET).map((item) => `${item.stableId}@${item.version}`));
  const remaining = [...eligible];
  const selected: SelectableQuestion[] = [];
  const categories = new Map<string, number>();
  const difficulties = new Map<QuestionDifficulty, number>();
  while (selected.length < count) {
    remaining.sort((left, right) => {
      const leftRecent = recent.has(referenceKey(left)) ? 1 : 0;
      const rightRecent = recent.has(referenceKey(right)) ? 1 : 0;
      if (leftRecent !== rightRecent) return leftRecent - rightRecent;
      if (leftRecent && rightRecent) {
        const recencyDifference = (recentRank.get(referenceKey(right)) ?? -1) - (recentRank.get(referenceKey(left)) ?? -1);
        if (recencyDifference !== 0) return recencyDifference;
      }
      const leftBalance = (categories.get(left.category) || 0) * 3 + (difficulties.get(left.difficulty) || 0) * 2;
      const rightBalance = (categories.get(right.category) || 0) * 3 + (difficulties.get(right.difficulty) || 0) * 2;
      return leftBalance - rightBalance || (rankByKey.get(referenceKey(left)) || 0) - (rankByKey.get(referenceKey(right)) || 0);
    });
    const chosen = remaining.shift();
    if (!chosen) return fail("insufficient_published_bank");
    selected.push(chosen);
    categories.set(chosen.category, (categories.get(chosen.category) || 0) + 1);
    difficulties.set(chosen.difficulty, (difficulties.get(chosen.difficulty) || 0) + 1);
  }
  const orderedRanks = new Map<string, number>();
  for (const question of selected) orderedRanks.set(referenceKey(question), await domainRank(seed, "wybp:quick-play:question-order:v2", referenceKey(question)));
  selected.sort((left, right) => (orderedRanks.get(referenceKey(left)) || 0) - (orderedRanks.get(referenceKey(right)) || 0));
  const optionOrders: string[][] = [];
  for (const question of selected) {
    const ids = question.answerOptions.map((option) => option.id);
    if (!input.authorizedSeed && !questionRequiresFixedOptionOrder(question)) {
      const ranks = new Map<string, number>();
      for (const id of ids) ranks.set(id, await domainRank(seed, `wybp:quick-play:option-order:v2:${referenceKey(question)}`, id));
      ids.sort((left, right) => (ranks.get(left) || 0) - (ranks.get(right) || 0));
    }
    optionOrders.push(ids);
  }
  const selectionPolicyVersion = input.authorizedSeed ? QUESTION_SELECTION_POLICY_VERSION : RANDOM_QUICK_PLAY_POLICY_VERSION;
  const seedReference = bytesToHex(await sha256Bytes(`wybp:quick-play:selection-reference:v2\u0000${bytesToHex(seed)}`));
  return Object.freeze({
    questions: Object.freeze(selected),
    optionOrders: Object.freeze(optionOrders.map((order) => Object.freeze(order))),
    questionSetVersion: QUESTION_SET_VERSION,
    scoringVersion: SCORING_VERSION,
    selectionPolicyVersion,
    seedReference,
    usedRecentQuestions: selected.some((question) => recent.has(referenceKey(question))),
  });
}

type D1QuestionRow = Readonly<{
  internal_id: string; edition_id: string; stable_id: string; version: number; edition_key: RegionKey;
  category: string; difficulty: string | null; question_kind: QuestionKind; question_text: string;
  visual_start: number | null;
  answer_options_json: string; correct_answer_json: string; accepted_answers_json: string;
  explanation: string; scoring_weight: number; publication_status: string; source_review_status: string;
  published_at: number; retired_at: number | null; valid_from: number | null; valid_until: number | null;
  image_provenance_json: string; audio_provenance_json: string;
}>;

function selectableFromRow(row: D1QuestionRow): SelectableQuestion | null {
  try {
    const answerOptions = JSON.parse(row.answer_options_json) as QuestionOption[];
    const primary = JSON.parse(row.correct_answer_json) as string[];
    const alternatives = JSON.parse(row.accepted_answers_json) as string[][];
    const imageProvenance = JSON.parse(row.image_provenance_json) as QuestionMediaProvenance[];
    const audioProvenance = JSON.parse(row.audio_provenance_json) as QuestionMediaProvenance[];
    if (!Array.isArray(answerOptions) || !Array.isArray(primary) || !Array.isArray(alternatives) || !Array.isArray(imageProvenance) || !Array.isArray(audioProvenance)) return null;
    const acceptedAnswers = alternatives.length ? alternatives : [primary];
    return Object.freeze({
      internalId: row.internal_id, editionId: row.edition_id, stableId: row.stable_id, version: row.version,
      region: row.edition_key, category: row.category,
      difficulty: row.difficulty === "intermediate" || row.difficulty === "advanced" ? row.difficulty : "introductory",
      questionKind: row.question_kind, questionText: row.question_text, visualStart: row.visual_start,
      answerOptions: Object.freeze(answerOptions.map((option) => Object.freeze(option))),
      acceptedAnswers: Object.freeze(acceptedAnswers.map((answer) => Object.freeze([...answer]))),
      explanation: row.explanation, scoringWeight: row.scoring_weight, lifecycleStatus: "published",
      sourceReviewStatus: "approved", publishedAt: row.published_at, retiredAt: row.retired_at,
      validFrom: row.valid_from, validUntil: row.valid_until,
      imageProvenance: Object.freeze(imageProvenance), audioProvenance: Object.freeze(audioProvenance),
    });
  } catch { return null; }
}

export class D1QuestionSelectionRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;
  constructor(database: AtomicD1Database) { this.database = database; }

  async getCandidates(region: RegionKey, now: number): Promise<readonly SelectableQuestion[]> {
    const result = await this.database.prepare(`SELECT q.id AS internal_id, q.edition_id, q.stable_id, q.version,
      qe.edition_key, q.category, q.difficulty, q.question_kind, q.question_text, q.visual_start, q.answer_options_json,
      q.correct_answer_json, q.accepted_answers_json, q.explanation, q.scoring_weight,
      q.publication_status, q.source_review_status, q.published_at, q.retired_at, q.valid_from,
      q.valid_until, q.image_provenance_json, q.audio_provenance_json
    FROM questions q JOIN quiz_editions qe ON qe.id=q.edition_id
    WHERE qe.edition_key=?1 AND qe.status='active' AND q.publication_status='published'
      AND q.source_review_status='approved' AND q.published_at<=?2 AND q.retired_at IS NULL
      AND (q.valid_from IS NULL OR q.valid_from<=?2) AND (q.valid_until IS NULL OR q.valid_until>?2)
    ORDER BY q.stable_id,q.version DESC`).bind(region, now).all<D1QuestionRow>();
    if (!result.success) return fail("question_storage_unavailable");
    const questions = result.results.map(selectableFromRow).filter((question): question is SelectableQuestion => Boolean(question));
    return Object.freeze(questions);
  }

  private async getStoredAttempt(where: "id" | "idempotency_key_hash", value: string, anonymousSubjectHash: string, now: number, allowUnissuedCowrie = false): Promise<StoredQuestionSelection | null> {
    const row = await this.database.prepare(`SELECT qa.id,qa.selected_question_versions_json,qa.question_set_version,
      qa.scoring_version,qa.selection_policy_version,qa.selection_seed_reference,qa.expires_at,qe.edition_key
      FROM quiz_attempts qa JOIN quiz_editions qe ON qe.id=qa.edition_id
      WHERE qa.${where}=?1 AND qa.anonymous_subject_hash=?2 AND qa.status='in_progress'
          AND qa.deleted_at IS NULL AND qa.expires_at>?3
          AND (?4=1 OR qa.cowrie_issued_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM cowrie_ledger debit WHERE debit.related_attempt_id=qa.id AND debit.entry_type='quick_play_debit'))
          LIMIT 1`).bind(value, anonymousSubjectHash, now, allowUnissuedCowrie ? 1 : 0).first<{
        id: string; selected_question_versions_json: string; question_set_version: string; scoring_version: string;
        selection_policy_version: typeof QUESTION_SELECTION_POLICY_VERSION | typeof RANDOM_QUICK_PLAY_POLICY_VERSION; selection_seed_reference: string;
        expires_at: number; edition_key: RegionKey;
      }>();
    if (!row || row.selection_policy_version !== RANDOM_QUICK_PLAY_POLICY_VERSION || !/^[0-9a-f]{64}$/.test(row.selection_seed_reference)) return null;
    let snapshot: Array<{ stableId: string; version: number; optionOrder: string[] }>;
    try {
      const parsed = JSON.parse(row.selected_question_versions_json) as unknown;
      if (!Array.isArray(parsed) || parsed.length !== DEFAULT_GAME_QUESTION_COUNT) return null;
      snapshot = parsed.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return fail("selection_snapshot_invalid");
        const candidate = item as Record<string, unknown>;
        if (typeof candidate.stableId !== "string" || !Number.isInteger(candidate.version) || !Array.isArray(candidate.optionOrder)
          || candidate.optionOrder.some((id) => typeof id !== "string")) return fail("selection_snapshot_invalid");
        return { stableId: candidate.stableId, version: Number(candidate.version), optionOrder: [...candidate.optionOrder] as string[] };
      });
    } catch { return null; }
    const questions: SelectableQuestion[] = [];
    for (const reference of snapshot) {
      const questionRow = await this.database.prepare(`SELECT q.id AS internal_id,q.edition_id,q.stable_id,q.version,
        qe.edition_key,q.category,q.difficulty,q.question_kind,q.question_text,q.visual_start,q.answer_options_json,
        q.correct_answer_json,q.accepted_answers_json,q.explanation,q.scoring_weight,q.publication_status,
        q.source_review_status,q.published_at,q.retired_at,q.valid_from,q.valid_until,q.image_provenance_json,q.audio_provenance_json
        FROM questions q JOIN quiz_editions qe ON qe.id=q.edition_id
        WHERE q.stable_id=?1 AND q.version=?2 AND qe.edition_key=?3 LIMIT 1`).bind(reference.stableId, reference.version, row.edition_key).first<D1QuestionRow>();
      const question = questionRow && selectableFromRow(questionRow);
      if (!question) return null;
      exactOptionOrder(question, reference.optionOrder);
      questions.push(question);
    }
    return Object.freeze({
      attemptId: row.id,
      region: row.edition_key,
      expiresAt: row.expires_at,
      selection: Object.freeze({
        questions: Object.freeze(questions),
        optionOrders: Object.freeze(snapshot.map((item) => Object.freeze(item.optionOrder))),
        questionSetVersion: row.question_set_version,
        scoringVersion: row.scoring_version,
        selectionPolicyVersion: row.selection_policy_version,
        seedReference: row.selection_seed_reference,
        usedRecentQuestions: false,
      }),
    });
  }

  async getAttemptByIdempotencyHash(hash: string, anonymousSubjectHash: string, now: number): Promise<StoredQuestionSelection | null> {
    return this.getStoredAttempt("idempotency_key_hash", hash, anonymousSubjectHash, now);
  }

  /** Internal preparation only; public resume/answer paths require paid issuance. */
  async getCowriePreparedAttemptByIdempotencyHash(hash: string, anonymousSubjectHash: string, now: number): Promise<StoredQuestionSelection | null> {
    return this.getStoredAttempt("idempotency_key_hash", hash, anonymousSubjectHash, now, true);
  }

  async getAttempt(attemptId: string, anonymousSubjectHash: string, now: number): Promise<StoredQuestionSelection | null> {
    return this.getStoredAttempt("id", attemptId, anonymousSubjectHash, now);
  }

  async judgeAttemptAnswer(attemptId: string, anonymousSubjectHash: string, questionRef: string, selectedOptionIds: readonly string[], now: number): Promise<QuestionAnswerJudgement | null> {
    const stored = await this.getAttempt(attemptId, anonymousSubjectHash, now);
    if (!stored) return null;
    const question = stored.selection.questions.find((item) => item.stableId === questionRef);
    if (!question || selectedOptionIds.length < 1 || selectedOptionIds.length > 3 || new Set(selectedOptionIds).size !== selectedOptionIds.length
      || selectedOptionIds.some((id) => !question.answerOptions.some((option) => option.id === id))) return null;
    const chosen = [...selectedOptionIds].sort();
    const correct = question.acceptedAnswers.some((answer) => answer.length === chosen.length
      && [...answer].sort().every((id, index) => id === chosen[index]));
    return Object.freeze({
      correct,
      correctOptionIds: Object.freeze([...(question.acceptedAnswers[0] || [])]),
      explanation: question.explanation,
    });
  }

  async consumeRateLimit(ownerHash: string, action: "start" | "complete", now: number, limit: number): Promise<"allowed" | "limited" | "unavailable"> {
    if (!/^[0-9a-f]{64}$/.test(ownerHash) || !Number.isInteger(limit) || limit < 1 || limit > 100) return "unavailable";
    const windowStartedAt = Math.floor(now / 60_000) * 60_000;
    const idHash = bytesToHex(await sha256Bytes(`wybp:quick-play-rate:v1\u0000${ownerHash}\u0000${action}\u0000${windowStartedAt}`));
    try {
      const write = await this.database.prepare(`INSERT INTO daily_operation_limits
        (id,rate_key_hash,action,window_started_at,request_count,expires_at,created_at,updated_at)
        VALUES (?1,?2,?3,?4,1,?5,?6,?6)
        ON CONFLICT(rate_key_hash,action,window_started_at) DO UPDATE SET request_count=request_count+1,updated_at=excluded.updated_at`).bind(
        `quick_play_limit_${idHash.slice(0, 32)}`, ownerHash, action, windowStartedAt, windowStartedAt + 86_400_000, now,
      ).run();
      if (!write.success) return "unavailable";
      const count = await this.database.prepare(`SELECT request_count FROM daily_operation_limits
        WHERE rate_key_hash=?1 AND action=?2 AND window_started_at=?3`).bind(ownerHash, action, windowStartedAt).first<number>("request_count");
      return typeof count === "number" && count <= limit ? "allowed" : "limited";
    } catch { return "unavailable"; }
  }

  async getRecentQuestionVersions(anonymousSubjectHash: string, now = Date.now()): Promise<readonly QuestionVersionReference[]> {
    const result = await this.database.prepare(`SELECT selected_question_versions_json
      FROM quiz_attempts WHERE anonymous_subject_hash=?1 AND deleted_at IS NULL AND created_at>=?2
      ORDER BY created_at DESC LIMIT 9`).bind(anonymousSubjectHash, now - RECENT_QUESTION_HISTORY_MS).all<{ selected_question_versions_json: string }>();
    if (!result.success) return [];
    const references: QuestionVersionReference[] = [];
    for (const row of result.results) {
      try {
        const parsed = JSON.parse(row.selected_question_versions_json) as unknown[];
        if (!Array.isArray(parsed)) continue;
        for (const item of parsed) {
          if (item && typeof item === "object" && typeof (item as Record<string, unknown>).stableId === "string" && Number.isInteger((item as Record<string, unknown>).version)) {
            references.push(Object.freeze({ stableId: String((item as Record<string, unknown>).stableId), version: Number((item as Record<string, unknown>).version) }));
          }
        }
      } catch { /* invalid historical snapshots are ignored */ }
    }
    return Object.freeze(references.slice(0, MAX_RECENT_QUESTION_REFERENCES));
  }

  async createAttempt(input: Readonly<{
    id: string; editionId: string; anonymousSubjectHash: string; idempotencyKeyHash: string;
    selection: QuestionSelection; startedAt: number; expiresAt: number;
  }>): Promise<boolean> {
    const snapshot = JSON.stringify(input.selection.questions.map((question, index) => ({
      stableId: question.stableId,
      version: question.version,
      optionOrder: input.selection.optionOrders[index],
    })));
    const result = await this.database.prepare(`INSERT INTO quiz_attempts (
      id,edition_id,anonymous_subject_hash,question_set_version,scoring_version,
      selected_question_versions_json,selection_policy_version,selection_seed_reference,play_mode,status,
      idempotency_key_hash,started_at,expires_at,version,created_at,updated_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'random','in_progress',?9,?10,?11,1,?10,?10)
    ON CONFLICT(idempotency_key_hash) DO NOTHING`).bind(
      input.id, input.editionId, input.anonymousSubjectHash, input.selection.questionSetVersion,
      input.selection.scoringVersion, snapshot, input.selection.selectionPolicyVersion,
      input.selection.seedReference, input.idempotencyKeyHash, input.startedAt, input.expiresAt,
    ).run();
    return Boolean(result.success && Number(result.meta?.changes || 0) === 1);
  }
}
