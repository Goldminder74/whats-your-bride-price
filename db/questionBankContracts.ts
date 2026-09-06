import { regionOrder, type RegionKey } from "../app/gameData.ts";

export const QUESTION_BANK_CATEGORIES = Object.freeze([
  "ART", "ART & HISTORY", "FOOD", "GEOGRAPHY", "HISTORY", "LANGUAGE",
  "MODERN HISTORY", "MUSIC", "ORAL HISTORY", "PEOPLES & LANGUAGE",
  "PHILOSOPHY", "PROVERBS", "SYMBOLS", "TEXTILES", "TRADITION",
] as const);
export const QUESTION_DIFFICULTIES = Object.freeze(["introductory", "intermediate", "advanced"] as const);
export const QUESTION_LIFECYCLE_STATUSES = Object.freeze(["draft", "review", "approved", "published", "retired"] as const);
export const QUESTION_KINDS = Object.freeze(["single", "multi", "complete", "image"] as const);
export const QUESTION_SOURCE_TYPES = Object.freeze(["primary", "academic", "museum", "heritage", "book", "article", "oral_history", "other"] as const);

export type QuestionCategory = (typeof QUESTION_BANK_CATEGORIES)[number];
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];
export type QuestionLifecycleStatus = (typeof QUESTION_LIFECYCLE_STATUSES)[number];
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export type QuestionSourceType = (typeof QUESTION_SOURCE_TYPES)[number];

export type QuestionOption = Readonly<{ id: string; text: string }>;
export type QuestionSource = Readonly<{
  title: string;
  organisationOrAuthor: string;
  urlOrReference: string;
  publicationDate: string | null;
  accessDate: string;
  sourceType: QuestionSourceType;
  reviewStatus: "approved";
  relevantClaim: string;
}>;
export type QuestionMediaProvenance = Readonly<{
  assetRef: string;
  creator: string;
  source: string;
  licence: string;
  reviewedAt: string;
}>;

export type QuestionBankQuestion = Readonly<{
  stableId: string;
  version: number;
  region: RegionKey;
  countryScope: string | null;
  subregionScope: string | null;
  communityScope: string | null;
  category: QuestionCategory;
  difficulty: QuestionDifficulty;
  questionKind: QuestionKind;
  questionText: string;
  answerOptions: readonly QuestionOption[];
  acceptedAnswers: readonly (readonly string[])[];
  explanation: string;
  sources: readonly QuestionSource[];
  reviewer: string | null;
  reviewDate: string | null;
  sensitivityNotes: string | null;
  language: string;
  locale: string;
  lifecycleStatus: QuestionLifecycleStatus;
  publishedAt: string | null;
  retiredAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  scoringWeight: number;
  imageProvenance: readonly QuestionMediaProvenance[];
  audioProvenance: readonly QuestionMediaProvenance[];
}>;

export type QuestionBankDocument = Readonly<{
  schemaVersion: "question-bank-v1";
  questions: readonly QuestionBankQuestion[];
}>;

export class QuestionBankValidationError extends Error {
  readonly code: string;
  readonly path: string;
  constructor(code: string, path: string) {
    super(`${path}: ${code}`);
    this.name = "QuestionBankValidationError";
    this.code = code;
    this.path = path;
  }
}

const TOP_LEVEL_KEYS = Object.freeze([
  "stableId", "version", "region", "countryScope", "subregionScope", "communityScope",
  "category", "difficulty", "questionKind", "questionText", "answerOptions", "acceptedAnswers",
  "explanation", "sources", "reviewer", "reviewDate", "sensitivityNotes", "language", "locale",
  "lifecycleStatus", "publishedAt", "retiredAt", "validFrom", "validUntil", "scoringWeight",
  "imageProvenance", "audioProvenance",
]);
const SOURCE_KEYS = Object.freeze([
  "title", "organisationOrAuthor", "urlOrReference", "publicationDate", "accessDate",
  "sourceType", "reviewStatus", "relevantClaim",
]);
const MEDIA_KEYS = Object.freeze(["assetRef", "creator", "source", "licence", "reviewedAt"]);
const OPTION_KEYS = Object.freeze(["id", "text"]);
const STABLE_ID = /^(west|east|central|north|south)_[a-z0-9][a-z0-9_-]{2,55}$/;
const OPTION_ID = /^o[1-9][0-9]?$/;
const LANGUAGE = /^[a-z]{2,3}$/;
const LOCALE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const FORMULA = /^[=+\-@]/;

function fail(code: string, path: string): never {
  throw new QuestionBankValidationError(code, path);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("object_required", path);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) fail(`unexpected_field_${unexpected[0]}`, path);
  const missing = allowed.filter((key) => !(key in value));
  if (missing.length) fail(`missing_field_${missing[0]}`, path);
}

function string(value: unknown, path: string, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max || value.trim() !== value) return fail("invalid_text", path);
  return value;
}

function nullableString(value: unknown, path: string, max: number): string | null {
  return value === null ? null : string(value, path, 1, max);
}

function isoDay(value: unknown, path: string, nullable = true): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail("invalid_date", path);
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) return fail("invalid_date", path);
  return value;
}

function enumeration<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) return fail("unknown_value", path);
  return value as T;
}

function validateReference(value: string, path: string): string {
  if (/^(?:doi:|isbn:)[A-Za-z0-9./:_-]{4,180}$/i.test(value)) return value;
  let url: URL;
  try { url = new URL(value); } catch { return fail("unreliable_source_reference", path); }
  if (url.protocol !== "https:" || url.username || url.password) return fail("unreliable_source_reference", path);
  return value;
}

function validateSource(value: unknown, path: string): QuestionSource {
  const item = record(value, path);
  exactKeys(item, SOURCE_KEYS, path);
  const reviewStatus = enumeration(item.reviewStatus, ["approved"] as const, `${path}.reviewStatus`);
  return Object.freeze({
    title: string(item.title, `${path}.title`, 2, 240),
    organisationOrAuthor: string(item.organisationOrAuthor, `${path}.organisationOrAuthor`, 2, 240),
    urlOrReference: validateReference(string(item.urlOrReference, `${path}.urlOrReference`, 5, 300), `${path}.urlOrReference`),
    publicationDate: isoDay(item.publicationDate, `${path}.publicationDate`),
    accessDate: isoDay(item.accessDate, `${path}.accessDate`, false) as string,
    sourceType: enumeration(item.sourceType, QUESTION_SOURCE_TYPES, `${path}.sourceType`),
    reviewStatus,
    relevantClaim: string(item.relevantClaim, `${path}.relevantClaim`, 4, 800),
  });
}

function validateMedia(value: unknown, path: string, approvedRemoteOrigins: ReadonlySet<string>): QuestionMediaProvenance {
  const item = record(value, path);
  exactKeys(item, MEDIA_KEYS, path);
  const assetRef = string(item.assetRef, `${path}.assetRef`, 2, 300);
  if (assetRef.startsWith("//") || assetRef.includes("..") || assetRef.includes("\\")) return fail("unapproved_remote_asset", `${path}.assetRef`);
  if (!assetRef.startsWith("/")) {
    let url: URL;
    try { url = new URL(assetRef); } catch { return fail("unapproved_remote_asset", `${path}.assetRef`); }
    if (url.protocol !== "https:" || !approvedRemoteOrigins.has(url.origin)) return fail("unapproved_remote_asset", `${path}.assetRef`);
  }
  return Object.freeze({
    assetRef,
    creator: string(item.creator, `${path}.creator`, 2, 200),
    source: validateReference(string(item.source, `${path}.source`, 5, 300), `${path}.source`),
    licence: string(item.licence, `${path}.licence`, 2, 120),
    reviewedAt: isoDay(item.reviewedAt, `${path}.reviewedAt`, false) as string,
  });
}

function validateOptions(value: unknown, path: string): readonly QuestionOption[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 10) return fail("invalid_answer_options", path);
  const ids = new Set<string>();
  const texts = new Set<string>();
  return Object.freeze(value.map((candidate, index) => {
    const itemPath = `${path}[${index}]`;
    const item = record(candidate, itemPath);
    exactKeys(item, OPTION_KEYS, itemPath);
    const id = string(item.id, `${itemPath}.id`, 2, 3);
    const text = string(item.text, `${itemPath}.text`, 1, 300);
    if (!OPTION_ID.test(id) || ids.has(id)) fail("duplicate_or_invalid_option_id", `${itemPath}.id`);
    const normalizedText = text.toLocaleLowerCase("en");
    if (texts.has(normalizedText)) fail("duplicate_answer_option", `${itemPath}.text`);
    ids.add(id); texts.add(normalizedText);
    return Object.freeze({ id, text });
  }));
}

function validateAcceptedAnswers(value: unknown, options: readonly QuestionOption[], path: string): readonly (readonly string[])[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return fail("accepted_answer_required", path);
  const optionIds = new Set(options.map((option) => option.id));
  const answerSets = new Set<string>();
  return Object.freeze(value.map((candidate, index) => {
    if (!Array.isArray(candidate) || candidate.length < 1 || candidate.length > options.length) return fail("invalid_accepted_answer", `${path}[${index}]`);
    if (candidate.some((id) => typeof id !== "string" || !optionIds.has(id))) return fail("invalid_accepted_answer", `${path}[${index}]`);
    const normalized = [...new Set(candidate as string[])].sort();
    if (normalized.length !== candidate.length) fail("duplicate_accepted_option", `${path}[${index}]`);
    const key = normalized.join("\u0000");
    if (answerSets.has(key)) fail("duplicate_accepted_answer", `${path}[${index}]`);
    answerSets.add(key);
    return Object.freeze(normalized);
  }));
}

export function validateQuestionContract(
  value: unknown,
  options: Readonly<{ approvedRemoteAssetOrigins?: ReadonlySet<string> }> = {},
  path = "questions[0]",
): QuestionBankQuestion {
  const item = record(value, path);
  exactKeys(item, TOP_LEVEL_KEYS, path);
  const stableId = string(item.stableId, `${path}.stableId`, 7, 64);
  const region = enumeration(item.region, regionOrder, `${path}.region`);
  if (!STABLE_ID.test(stableId) || !stableId.startsWith(`${region}_`)) fail("invalid_stable_id", `${path}.stableId`);
  if (!Number.isInteger(item.version) || Number(item.version) < 1 || Number(item.version) > 9999) fail("invalid_version", `${path}.version`);
  const answerOptions = validateOptions(item.answerOptions, `${path}.answerOptions`);
  const acceptedAnswers = validateAcceptedAnswers(item.acceptedAnswers, answerOptions, `${path}.acceptedAnswers`);
  const sources = Array.isArray(item.sources)
    ? Object.freeze(item.sources.map((source, index) => validateSource(source, `${path}.sources[${index}]`)))
    : fail("sources_required", `${path}.sources`);
  if (!sources.length) fail("sources_required", `${path}.sources`);
  const lifecycleStatus = enumeration(item.lifecycleStatus, QUESTION_LIFECYCLE_STATUSES, `${path}.lifecycleStatus`);
  const reviewer = nullableString(item.reviewer, `${path}.reviewer`, 200);
  const reviewDate = isoDay(item.reviewDate, `${path}.reviewDate`);
  if (["approved", "published", "retired"].includes(lifecycleStatus) && (!reviewer || !reviewDate)) fail("cultural_review_required", path);
  const sensitivityNotes = nullableString(item.sensitivityNotes, `${path}.sensitivityNotes`, 1000);
  if (sensitivityNotes && (!reviewer || !reviewDate)) fail("sensitivity_review_required", path);
  const publishedAt = isoDay(item.publishedAt, `${path}.publishedAt`);
  const retiredAt = isoDay(item.retiredAt, `${path}.retiredAt`);
  const validFrom = isoDay(item.validFrom, `${path}.validFrom`);
  const validUntil = isoDay(item.validUntil, `${path}.validUntil`);
  if (lifecycleStatus === "published" && !publishedAt) fail("publication_date_required", `${path}.publishedAt`);
  if (lifecycleStatus === "retired" && !retiredAt) fail("retirement_date_required", `${path}.retiredAt`);
  if (validFrom && validUntil && validFrom >= validUntil) fail("invalid_validity_window", path);
  if (publishedAt && retiredAt && publishedAt > retiredAt) fail("invalid_lifecycle_dates", path);
  if (!Number.isInteger(item.scoringWeight) || Number(item.scoringWeight) < 1 || Number(item.scoringWeight) > 100) fail("invalid_scoring_weight", `${path}.scoringWeight`);
  if (typeof item.language !== "string" || !LANGUAGE.test(item.language)) fail("invalid_language", `${path}.language`);
  if (typeof item.locale !== "string" || !LOCALE.test(item.locale)) fail("invalid_locale", `${path}.locale`);
  const approvedRemoteOrigins = options.approvedRemoteAssetOrigins || new Set<string>();
  const media = (value: unknown, mediaPath: string) => Array.isArray(value)
    ? Object.freeze(value.map((entry, index) => validateMedia(entry, `${mediaPath}[${index}]`, approvedRemoteOrigins)))
    : fail("invalid_media_provenance", mediaPath);
  return Object.freeze({
    stableId,
    version: Number(item.version),
    region,
    countryScope: nullableString(item.countryScope, `${path}.countryScope`, 160),
    subregionScope: nullableString(item.subregionScope, `${path}.subregionScope`, 160),
    communityScope: nullableString(item.communityScope, `${path}.communityScope`, 160),
    category: enumeration(item.category, QUESTION_BANK_CATEGORIES, `${path}.category`),
    difficulty: enumeration(item.difficulty, QUESTION_DIFFICULTIES, `${path}.difficulty`),
    questionKind: enumeration(item.questionKind, QUESTION_KINDS, `${path}.questionKind`),
    questionText: string(item.questionText, `${path}.questionText`, 4, 1000),
    answerOptions,
    acceptedAnswers,
    explanation: string(item.explanation, `${path}.explanation`, 4, 2000),
    sources,
    reviewer,
    reviewDate,
    sensitivityNotes,
    language: item.language,
    locale: item.locale,
    lifecycleStatus,
    publishedAt,
    retiredAt,
    validFrom,
    validUntil,
    scoringWeight: Number(item.scoringWeight),
    imageProvenance: media(item.imageProvenance, `${path}.imageProvenance`),
    audioProvenance: media(item.audioProvenance, `${path}.audioProvenance`),
  });
}

export function validateQuestionBankDocument(
  value: unknown,
  options: Readonly<{ approvedRemoteAssetOrigins?: ReadonlySet<string>; maximumQuestions?: number }> = {},
): QuestionBankDocument {
  const document = record(value, "document");
  exactKeys(document, ["schemaVersion", "questions"], "document");
  if (document.schemaVersion !== "question-bank-v1") fail("unknown_schema_version", "document.schemaVersion");
  if (!Array.isArray(document.questions) || document.questions.length > (options.maximumQuestions ?? 1000)) fail("invalid_question_count", "document.questions");
  const questions = Object.freeze(document.questions.map((question, index) => validateQuestionContract(question, options, `questions[${index}]`)));
  const versions = new Set<string>();
  for (const question of questions) {
    const key = `${question.stableId}@${question.version}`;
    if (versions.has(key)) fail("duplicate_question_version", "document.questions");
    versions.add(key);
  }
  return Object.freeze({ schemaVersion: "question-bank-v1", questions });
}

export function isFormulaInjectionValue(value: string): boolean {
  return FORMULA.test(value);
}

export function neutralizeCsvFormula(value: string): string {
  return FORMULA.test(value) ? `'${value}` : value;
}
