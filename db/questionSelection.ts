import type { RegionKey } from "../app/gameData.ts";
import type { AtomicD1Database } from "./repositories.ts";
import type { QuestionDifficulty, QuestionKind, QuestionOption } from "./questionBankContracts.ts";
import { QUESTION_SET_VERSION, SCORING_VERSION } from "./seeds/development.ts";

export const QUESTION_SELECTION_POLICY_VERSION = "balanced-v1" as const;
export const DEFAULT_GAME_QUESTION_COUNT = 12;
export const MAX_RECENT_QUESTION_REFERENCES = 100;

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
  imageProvenance: readonly unknown[];
  audioProvenance: readonly unknown[];
}>;

export type PublicSelectedQuestion = Readonly<{
  questionRef: string;
  version: number;
  kind: QuestionKind;
  text: string;
  options: readonly QuestionOption[];
  imageAssets: readonly string[];
  audioAssets: readonly string[];
}>;

export type QuestionSelection = Readonly<{
  questions: readonly SelectableQuestion[];
  questionSetVersion: string;
  scoringVersion: string;
  selectionPolicyVersion: typeof QUESTION_SELECTION_POLICY_VERSION;
  seedReference: string;
  usedRecentQuestions: boolean;
}>;

export class QuestionSelectionError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "QuestionSelectionError";
    this.code = code;
  }
}

const AUTHORIZED_SEED = Symbol("authorised question selection seed");
export type AuthorizedSelectionSeed = Readonly<{ bytes: Uint8Array; purpose: "challenge" | "comparison"; [AUTHORIZED_SEED]: true }>;

function fail(code: string): never { throw new QuestionSelectionError(code); }

export function authorizeReproducibleSelectionSeed(
  bytes: Uint8Array,
  authority: Readonly<{ authorized: true; purpose: "challenge" | "comparison" }>,
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

async function randomRanks(seed: Uint8Array, count: number): Promise<number[]> {
  const ranks: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const counter = new Uint8Array(seed.length + 4);
    counter.set(seed);
    new DataView(counter.buffer).setUint32(seed.length, index, false);
    const digest = await sha256Bytes(counter);
    ranks.push(new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getUint32(0, false));
  }
  return ranks;
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

export function toPublicSelectedQuestion(question: SelectableQuestion): PublicSelectedQuestion {
  return Object.freeze({
    questionRef: question.stableId,
    version: question.version,
    kind: question.questionKind,
    text: question.questionText,
    options: Object.freeze(question.answerOptions.map((option) => Object.freeze({ ...option }))),
    imageAssets: safeAssetRefs(question.imageProvenance),
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
    return Object.freeze({ questions, questionSetVersion: QUESTION_SET_VERSION, scoringVersion: SCORING_VERSION, selectionPolicyVersion: QUESTION_SELECTION_POLICY_VERSION, seedReference, usedRecentQuestions: false });
  }
  if (eligible.length < count) return fail("insufficient_published_bank");
  const seed = input.authorizedSeed?.[AUTHORIZED_SEED] === true
    ? new Uint8Array(input.authorizedSeed.bytes)
    : (() => {
        const bytes = new Uint8Array(32);
        const source = input.randomSource ?? crypto.getRandomValues.bind(crypto);
        if (source(bytes) !== bytes) return fail("secure_random_unavailable");
        return bytes;
      })();
  const ranks = await randomRanks(seed, eligible.length);
  const rankByKey = new Map(eligible.map((question, index) => [referenceKey(question), ranks[index]]));
  const recent = new Set((input.recentQuestionVersions || []).slice(0, MAX_RECENT_QUESTION_REFERENCES).map((item) => `${item.stableId}@${item.version}`));
  const remaining = [...eligible];
  const selected: SelectableQuestion[] = [];
  const categories = new Map<string, number>();
  const difficulties = new Map<QuestionDifficulty, number>();
  while (selected.length < count) {
    remaining.sort((left, right) => {
      const leftRecent = recent.has(referenceKey(left)) ? 1 : 0;
      const rightRecent = recent.has(referenceKey(right)) ? 1 : 0;
      if (leftRecent !== rightRecent) return leftRecent - rightRecent;
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
  const seedReference = bytesToHex(await sha256Bytes(new Uint8Array([...seed, ...new TextEncoder().encode(QUESTION_SELECTION_POLICY_VERSION)])));
  return Object.freeze({
    questions: Object.freeze(selected),
    questionSetVersion: QUESTION_SET_VERSION,
    scoringVersion: SCORING_VERSION,
    selectionPolicyVersion: QUESTION_SELECTION_POLICY_VERSION,
    seedReference,
    usedRecentQuestions: selected.some((question) => recent.has(referenceKey(question))),
  });
}

type D1QuestionRow = Readonly<{
  internal_id: string; edition_id: string; stable_id: string; version: number; edition_key: RegionKey;
  category: string; difficulty: string | null; question_kind: QuestionKind; question_text: string;
  answer_options_json: string; correct_answer_json: string; accepted_answers_json: string;
  explanation: string; scoring_weight: number; publication_status: string; source_review_status: string;
  published_at: number; retired_at: number | null; valid_from: number | null; valid_until: number | null;
  image_provenance_json: string; audio_provenance_json: string;
}>;

export class D1QuestionSelectionRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;
  constructor(database: AtomicD1Database) { this.database = database; }

  async getCandidates(region: RegionKey, now: number): Promise<readonly SelectableQuestion[]> {
    const result = await this.database.prepare(`SELECT q.id AS internal_id, q.edition_id, q.stable_id, q.version,
      qe.edition_key, q.category, q.difficulty, q.question_kind, q.question_text, q.answer_options_json,
      q.correct_answer_json, q.accepted_answers_json, q.explanation, q.scoring_weight,
      q.publication_status, q.source_review_status, q.published_at, q.retired_at, q.valid_from,
      q.valid_until, q.image_provenance_json, q.audio_provenance_json
    FROM questions q JOIN quiz_editions qe ON qe.id=q.edition_id
    WHERE qe.edition_key=?1 AND qe.status='active' AND q.publication_status='published'
      AND q.source_review_status='approved' AND q.published_at<=?2 AND q.retired_at IS NULL
      AND (q.valid_from IS NULL OR q.valid_from<=?2) AND (q.valid_until IS NULL OR q.valid_until>?2)
    ORDER BY q.stable_id,q.version DESC`).bind(region, now).all<D1QuestionRow>();
    if (!result.success) return fail("question_storage_unavailable");
    const questions: SelectableQuestion[] = [];
    for (const row of result.results) {
      try {
        const answerOptions = JSON.parse(row.answer_options_json) as QuestionOption[];
        const primary = JSON.parse(row.correct_answer_json) as string[];
        const alternatives = JSON.parse(row.accepted_answers_json) as string[][];
        const imageProvenance = JSON.parse(row.image_provenance_json) as unknown[];
        const audioProvenance = JSON.parse(row.audio_provenance_json) as unknown[];
        if (!Array.isArray(answerOptions) || !Array.isArray(primary) || !Array.isArray(alternatives) || !Array.isArray(imageProvenance) || !Array.isArray(audioProvenance)) continue;
        const acceptedAnswers = alternatives.length ? alternatives : [primary];
        questions.push(Object.freeze({
          internalId: row.internal_id, editionId: row.edition_id, stableId: row.stable_id, version: row.version,
          region: row.edition_key, category: row.category,
          difficulty: row.difficulty === "intermediate" || row.difficulty === "advanced" ? row.difficulty : "introductory",
          questionKind: row.question_kind, questionText: row.question_text,
          answerOptions: Object.freeze(answerOptions.map((option) => Object.freeze(option))),
          acceptedAnswers: Object.freeze(acceptedAnswers.map((answer) => Object.freeze([...answer]))),
          explanation: row.explanation, scoringWeight: row.scoring_weight, lifecycleStatus: "published",
          sourceReviewStatus: "approved", publishedAt: row.published_at, retiredAt: row.retired_at,
          validFrom: row.valid_from, validUntil: row.valid_until,
          imageProvenance: Object.freeze(imageProvenance), audioProvenance: Object.freeze(audioProvenance),
        }));
      } catch { continue; }
    }
    return Object.freeze(questions);
  }

  async getRecentQuestionVersions(anonymousSubjectHash: string): Promise<readonly QuestionVersionReference[]> {
    const result = await this.database.prepare(`SELECT selected_question_versions_json
      FROM quiz_attempts WHERE anonymous_subject_hash=?1 AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 8`).bind(anonymousSubjectHash).all<{ selected_question_versions_json: string }>();
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
    const snapshot = JSON.stringify(input.selection.questions.map((question) => ({ stableId: question.stableId, version: question.version })));
    const result = await this.database.prepare(`INSERT INTO quiz_attempts (
      id,edition_id,anonymous_subject_hash,question_set_version,scoring_version,
      selected_question_versions_json,selection_policy_version,selection_seed_reference,status,
      idempotency_key_hash,started_at,expires_at,version,created_at,updated_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'in_progress',?9,?10,?11,1,?10,?10)
    ON CONFLICT(idempotency_key_hash) DO NOTHING`).bind(
      input.id, input.editionId, input.anonymousSubjectHash, input.selection.questionSetVersion,
      input.selection.scoringVersion, snapshot, input.selection.selectionPolicyVersion,
      input.selection.seedReference, input.idempotencyKeyHash, input.startedAt, input.expiresAt,
    ).run();
    return Boolean(result.success && Number(result.meta?.changes || 0) === 1);
  }
}
