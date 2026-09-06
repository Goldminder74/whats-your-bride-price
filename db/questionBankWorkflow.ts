import { sourceCollections } from "../app/gameData.ts";
import {
  isFormulaInjectionValue,
  neutralizeCsvFormula,
  validateQuestionBankDocument,
  type QuestionBankDocument,
  type QuestionBankQuestion,
  type QuestionSource,
} from "./questionBankContracts.ts";
import { buildDevelopmentSeed, SEED_TIMESTAMP_UTC_MS } from "./seeds/development.ts";

export const QUESTION_BANK_MAX_IMPORT_BYTES = 1_048_576;
export const QUESTION_BANK_MAX_IMPORT_ROWS = 1000;
export const QUESTION_BANK_CSV_COLUMNS = Object.freeze([
  "stableId", "version", "region", "countryScope", "subregionScope", "communityScope",
  "category", "difficulty", "questionKind", "questionText", "answerOptionsJson", "acceptedAnswersJson",
  "explanation", "sourcesJson", "reviewer", "reviewDate", "sensitivityNotes", "language", "locale",
  "lifecycleStatus", "publishedAt", "retiredAt", "validFrom", "validUntil", "scoringWeight",
  "imageProvenanceJson", "audioProvenanceJson",
] as const);

export class QuestionBankImportError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "QuestionBankImportError";
    this.code = code;
  }
}

export type QuestionBankChange = Readonly<{
  stableId: string;
  version: number;
  action: "unchanged" | "create_draft" | "prepare_review" | "prepare_approval" | "prepare_publication" | "prepare_retirement";
}>;
export type QuestionBankValidationReport = Readonly<{
  valid: true;
  questionCount: number;
  changes: readonly QuestionBankChange[];
  exactDuplicates: readonly string[];
  nearDuplicates: readonly Readonly<{ left: string; right: string; similarity: number }>[];
  sourceComplete: true;
  culturalReviewComplete: boolean;
  writesPerformed: false;
}>;

function fail(code: string): never { throw new QuestionBankImportError(code); }
function day(timestamp: number): string { return new Date(timestamp).toISOString().slice(0, 10); }

function legacySources(): readonly QuestionSource[] {
  return Object.freeze(sourceCollections.map((source) => Object.freeze({
    title: source.label,
    organisationOrAuthor: source.label.split(" | ")[0],
    urlOrReference: source.href,
    publicationDate: null,
    accessDate: day(SEED_TIMESTAMP_UTC_MS),
    sourceType: source.label.startsWith("UNESCO") ? "heritage" as const : "museum" as const,
    reviewStatus: "approved" as const,
    relevantClaim: "Collection-level reference retained from the verified pre-engine catalogue.",
  })));
}

export async function buildLegacyQuestionBankDocument(): Promise<QuestionBankDocument> {
  const seed = await buildDevelopmentSeed();
  const editionById = new Map(seed.editions.map((edition) => [edition.id, edition.editionKey]));
  const questions: QuestionBankQuestion[] = seed.questions.map((question) => ({
    stableId: question.stableId,
    version: question.version,
    region: editionById.get(question.editionId)!,
    countryScope: null,
    subregionScope: null,
    communityScope: null,
    category: question.category as QuestionBankQuestion["category"],
    difficulty: "introductory",
    questionKind: question.questionKind,
    questionText: question.questionText,
    answerOptions: JSON.parse(question.answerOptionsJson),
    acceptedAnswers: [JSON.parse(question.correctAnswerJson)],
    explanation: question.explanation,
    sources: legacySources(),
    reviewer: "pre-engine verified catalogue",
    reviewDate: day(SEED_TIMESTAMP_UTC_MS),
    sensitivityNotes: null,
    language: "en",
    locale: "en",
    lifecycleStatus: "published",
    publishedAt: day(SEED_TIMESTAMP_UTC_MS),
    retiredAt: null,
    validFrom: day(SEED_TIMESTAMP_UTC_MS),
    validUntil: null,
    scoringWeight: question.scoringWeight,
    imageProvenance: [],
    audioProvenance: [],
  }));
  return validateQuestionBankDocument({ schemaVersion: "question-bank-v1", questions });
}

function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }

export function parseQuestionBankJson(value: string): QuestionBankDocument {
  if (!value || utf8Bytes(value) > QUESTION_BANK_MAX_IMPORT_BYTES) return fail("import_size_invalid");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return fail("malformed_json"); }
  return validateQuestionBankDocument(parsed, { maximumQuestions: QUESTION_BANK_MAX_IMPORT_ROWS });
}

function parseCsvRows(value: string): string[][] {
  if (!value || utf8Bytes(value) > QUESTION_BANK_MAX_IMPORT_BYTES) return fail("import_size_invalid");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') {
      if (cell) return fail("malformed_csv");
      quoted = true;
    } else if (character === ",") {
      row.push(cell); cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (quoted) return fail("malformed_csv");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((candidate) => candidate.some((value) => value !== ""));
}

function jsonCell(value: string, code: string): unknown {
  try { return JSON.parse(value); } catch { return fail(code); }
}

function nullable(value: string): string | null { return value === "" ? null : value; }

export function parseQuestionBankCsv(value: string): QuestionBankDocument {
  const rows = parseCsvRows(value);
  if (rows.length < 1 || rows.length - 1 > QUESTION_BANK_MAX_IMPORT_ROWS) return fail("invalid_csv_row_count");
  if (rows[0].join("\u0000") !== QUESTION_BANK_CSV_COLUMNS.join("\u0000")) return fail("unexpected_csv_columns");
  const questions = rows.slice(1).map((row, rowIndex) => {
    if (row.length !== QUESTION_BANK_CSV_COLUMNS.length) return fail(`invalid_csv_width_row_${rowIndex + 2}`);
    if (row.some(isFormulaInjectionValue)) return fail(`formula_injection_row_${rowIndex + 2}`);
    const item = Object.fromEntries(QUESTION_BANK_CSV_COLUMNS.map((column, index) => [column, row[index]]));
    return {
      stableId: item.stableId,
      version: Number(item.version),
      region: item.region,
      countryScope: nullable(item.countryScope),
      subregionScope: nullable(item.subregionScope),
      communityScope: nullable(item.communityScope),
      category: item.category,
      difficulty: item.difficulty,
      questionKind: item.questionKind,
      questionText: item.questionText,
      answerOptions: jsonCell(item.answerOptionsJson, "invalid_answer_options_json"),
      acceptedAnswers: jsonCell(item.acceptedAnswersJson, "invalid_accepted_answers_json"),
      explanation: item.explanation,
      sources: jsonCell(item.sourcesJson, "invalid_sources_json"),
      reviewer: nullable(item.reviewer),
      reviewDate: nullable(item.reviewDate),
      sensitivityNotes: nullable(item.sensitivityNotes),
      language: item.language,
      locale: item.locale,
      lifecycleStatus: item.lifecycleStatus,
      publishedAt: nullable(item.publishedAt),
      retiredAt: nullable(item.retiredAt),
      validFrom: nullable(item.validFrom),
      validUntil: nullable(item.validUntil),
      scoringWeight: Number(item.scoringWeight),
      imageProvenance: jsonCell(item.imageProvenanceJson, "invalid_image_provenance_json"),
      audioProvenance: jsonCell(item.audioProvenanceJson, "invalid_audio_provenance_json"),
    };
  });
  return validateQuestionBankDocument({ schemaVersion: "question-bank-v1", questions });
}

function csvCell(value: unknown): string {
  const raw = neutralizeCsvFormula(value === null ? "" : typeof value === "string" ? value : String(value));
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

export function questionBankCsv(document: QuestionBankDocument): string {
  const rows = document.questions.map((question) => [
    question.stableId, question.version, question.region, question.countryScope, question.subregionScope,
    question.communityScope, question.category, question.difficulty, question.questionKind, question.questionText,
    JSON.stringify(question.answerOptions), JSON.stringify(question.acceptedAnswers), question.explanation,
    JSON.stringify(question.sources), question.reviewer, question.reviewDate, question.sensitivityNotes,
    question.language, question.locale, question.lifecycleStatus, question.publishedAt, question.retiredAt,
    question.validFrom, question.validUntil, question.scoringWeight, JSON.stringify(question.imageProvenance),
    JSON.stringify(question.audioProvenance),
  ]);
  return `${QUESTION_BANK_CSV_COLUMNS.map(csvCell).join(",")}\r\n${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function questionBankJson(document: QuestionBankDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function normalizedQuestionText(value: string): string {
  return value.normalize("NFKD").toLocaleLowerCase("en").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenSimilarity(left: string, right: string): number {
  const a = new Set(normalizedQuestionText(left).split(" ").filter(Boolean));
  const b = new Set(normalizedQuestionText(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared / (a.size + b.size - shared);
}

function comparable(question: QuestionBankQuestion): string {
  return JSON.stringify(question);
}

export function previewQuestionBankImport(
  proposed: QuestionBankDocument,
  existing: QuestionBankDocument = Object.freeze({ schemaVersion: "question-bank-v1", questions: Object.freeze([]) }),
): QuestionBankValidationReport {
  const existingByVersion = new Map(existing.questions.map((question) => [`${question.stableId}@${question.version}`, question]));
  const maximumVersion = new Map<string, number>();
  for (const question of existing.questions) maximumVersion.set(question.stableId, Math.max(maximumVersion.get(question.stableId) || 0, question.version));
  const changes: QuestionBankChange[] = [];
  const exactDuplicates: string[] = [];
  for (const question of proposed.questions) {
    const key = `${question.stableId}@${question.version}`;
    const current = existingByVersion.get(key);
    if (current) {
      if (comparable(current) !== comparable(question) && current.lifecycleStatus === "published") return fail(`published_version_overwrite_${key}`);
      if (comparable(current) === comparable(question)) { exactDuplicates.push(key); changes.push(Object.freeze({ stableId: question.stableId, version: question.version, action: "unchanged" })); continue; }
    } else {
      const max = maximumVersion.get(question.stableId) || 0;
      if ((max === 0 && question.version !== 1) || (max > 0 && question.version !== max + 1)) return fail(`invalid_version_sequence_${key}`);
    }
    const action: QuestionBankChange["action"] = question.lifecycleStatus === "retired" ? "prepare_retirement"
      : question.lifecycleStatus === "published" ? "prepare_publication"
      : question.lifecycleStatus === "approved" ? "prepare_approval"
      : question.lifecycleStatus === "review" ? "prepare_review" : "create_draft";
    changes.push(Object.freeze({ stableId: question.stableId, version: question.version, action }));
  }
  const nearDuplicates: Array<{ left: string; right: string; similarity: number }> = [];
  const combined = [...existing.questions, ...proposed.questions];
  for (let left = 0; left < combined.length; left += 1) {
    for (let right = left + 1; right < combined.length; right += 1) {
      if (combined[left].stableId === combined[right].stableId) continue;
      const similarity = tokenSimilarity(combined[left].questionText, combined[right].questionText);
      if (similarity >= 0.82) nearDuplicates.push({ left: `${combined[left].stableId}@${combined[left].version}`, right: `${combined[right].stableId}@${combined[right].version}`, similarity: Number(similarity.toFixed(3)) });
    }
  }
  return Object.freeze({
    valid: true,
    questionCount: proposed.questions.length,
    changes: Object.freeze(changes),
    exactDuplicates: Object.freeze(exactDuplicates),
    nearDuplicates: Object.freeze(nearDuplicates.map((duplicate) => Object.freeze(duplicate))),
    sourceComplete: true,
    culturalReviewComplete: proposed.questions.every((question) => !["approved", "published", "retired"].includes(question.lifecycleStatus) || Boolean(question.reviewer && question.reviewDate)),
    writesPerformed: false,
  });
}
