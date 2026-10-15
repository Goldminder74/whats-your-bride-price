import { regions, regionOrder, type Question, type RegionKey } from "../../app/gameData.ts";

export const APPROVED_GAME_DATA_FILE_SHA256 = "3ce3474de2e6b072bf4e893fc2760c8b9ba996a889697ec5ac15f631cc05c74d";
export const QUESTION_SET_VERSION = "approved-60-v1";
export const SCORING_VERSION = "binary-exact-set-v1";
export const SEED_TIMESTAMP_UTC_MS = Date.UTC(2026, 7, 22);

export interface SeedEditionRow {
  id: string;
  editionKey: RegionKey;
  name: string;
  region: string;
  version: 1;
}

export interface SeedQuestionRow {
  id: string;
  stableId: string;
  version: 1;
  editionId: string;
  category: string;
  questionKind: Question["kind"];
  questionText: string;
  answerOptionsJson: string;
  correctAnswerJson: string;
  explanation: string;
  visualStart: number | null;
  scoringWeight: 1;
  locale: "en";
  publicationStatus: "published";
  sourceReviewStatus: "approved";
  contentHash: string;
}

function editionId(region: RegionKey): string {
  return `edition_${region}_v1`;
}

function stableQuestionId(region: RegionKey, index: number): string {
  return `${region}_q${String(index + 1).padStart(2, "0")}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalQuestion(question: Question): string {
  return JSON.stringify({
    kind: question.kind,
    prompt: question.prompt,
    options: question.options,
    correct: question.correct,
    explanation: question.explanation,
    topic: question.topic,
    visualStart: question.visualStart ?? null,
  });
}

function assertNoSeedDuplicates(rows: readonly Omit<SeedQuestionRow, "contentHash">[]): void {
  const ids = new Set<string>();
  const prompts = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.stableId)) throw new Error(`Duplicate stable question ID: ${row.stableId}`);
    if (prompts.has(row.questionText)) throw new Error(`Duplicate question text: ${row.questionText}`);
    ids.add(row.stableId);
    prompts.add(row.questionText);
    const options = JSON.parse(row.answerOptionsJson) as Array<{ id: string; text: string }>;
    const optionIds = new Set(options.map((option) => option.id));
    const optionText = new Set(options.map((option) => option.text));
    if (optionIds.size !== options.length || optionText.size !== options.length) {
      throw new Error(`Duplicate option ID or wording in ${row.stableId}`);
    }
  }
}

export async function buildDevelopmentSeed(): Promise<{
  editions: readonly SeedEditionRow[];
  questions: readonly SeedQuestionRow[];
  contentChecksum: string;
}> {
  const editions: SeedEditionRow[] = regionOrder.map((region) => ({
    id: editionId(region),
    editionKey: region,
    name: regions[region].name,
    region: regions[region].place,
    version: 1,
  }));
  const questionsWithoutHash: Omit<SeedQuestionRow, "contentHash">[] = regionOrder.flatMap((region) =>
    regions[region].questions.map((question, index) => {
      const stableId = stableQuestionId(region, index);
      const options = question.options.map((text, optionIndex) => ({
        id: `o${optionIndex + 1}`,
        text,
      }));
      return {
        id: `question_${stableId}_v1`,
        stableId,
        version: 1,
        editionId: editionId(region),
        category: question.topic,
        questionKind: question.kind,
        questionText: question.prompt,
        answerOptionsJson: JSON.stringify(options),
        correctAnswerJson: JSON.stringify(question.correct.map((optionIndex) => `o${optionIndex + 1}`)),
        explanation: question.explanation,
        visualStart: question.visualStart ?? null,
        scoringWeight: 1,
        locale: "en",
        publicationStatus: "published",
        sourceReviewStatus: "approved",
      };
    }),
  );
  assertNoSeedDuplicates(questionsWithoutHash);
  if (questionsWithoutHash.length !== 60 || editions.length !== 5) {
    throw new Error(`Expected 5 editions and 60 approved questions, received ${editions.length} and ${questionsWithoutHash.length}`);
  }
  const questions = await Promise.all(questionsWithoutHash.map(async (row) => ({
    ...row,
    contentHash: await sha256Hex(canonicalQuestion({
      kind: row.questionKind,
      prompt: row.questionText,
      options: (JSON.parse(row.answerOptionsJson) as Array<{ text: string }>).map((option) => option.text),
      correct: (JSON.parse(row.correctAnswerJson) as string[]).map((id) => Number(id.slice(1)) - 1),
      explanation: row.explanation,
      topic: row.category,
      visualStart: row.visualStart ?? undefined,
    })),
  })));
  const contentChecksum = await sha256Hex(JSON.stringify({ editions, questions }));
  return Object.freeze({
    editions: Object.freeze(editions),
    questions: Object.freeze(questions),
    contentChecksum,
  });
}

export function developmentSeedStatements(seed: Awaited<ReturnType<typeof buildDevelopmentSeed>>): ReadonlyArray<{ sql: string; params: readonly unknown[] }> {
  const statements: Array<{ sql: string; params: readonly unknown[] }> = [];
  for (const row of seed.editions) {
    statements.push({
      sql: `INSERT INTO quiz_editions (id, edition_key, name, region, version, status, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6)
            ON CONFLICT(id) DO NOTHING`,
      params: [row.id, row.editionKey, row.name, row.region, row.version, SEED_TIMESTAMP_UTC_MS],
    });
  }
  for (const row of seed.questions) {
    statements.push({
      sql: `INSERT INTO questions (
              id, stable_id, version, edition_id, category, question_kind, question_text,
              answer_options_json, correct_answer_json, explanation, visual_start, scoring_weight, locale,
              publication_status, source_review_status, content_hash, published_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17, ?17)
            ON CONFLICT(id) DO NOTHING`,
      params: [
        row.id, row.stableId, row.version, row.editionId, row.category, row.questionKind,
        row.questionText, row.answerOptionsJson, row.correctAnswerJson, row.explanation,
        row.visualStart, row.scoringWeight, row.locale, row.publicationStatus, row.sourceReviewStatus,
        row.contentHash, SEED_TIMESTAMP_UTC_MS,
      ],
    });
  }
  return Object.freeze(statements);
}

export function assertDevelopmentSeedMatches(
  storedRows: readonly { stable_id: string; question_text: string; answer_options_json: string; correct_answer_json: string; explanation: string; visual_start: number | null; scoring_weight: number; content_hash: string }[],
  seed: Awaited<ReturnType<typeof buildDevelopmentSeed>>,
): void {
  if (storedRows.length !== seed.questions.length) {
    throw new Error(`Seed verification expected ${seed.questions.length} questions but found ${storedRows.length}.`);
  }
  const expectedById = new Map(seed.questions.map((question) => [question.stableId, question]));
  for (const stored of storedRows) {
    const expected = expectedById.get(stored.stable_id);
    if (
      !expected
      || stored.question_text !== expected.questionText
      || stored.answer_options_json !== expected.answerOptionsJson
      || stored.correct_answer_json !== expected.correctAnswerJson
      || stored.explanation !== expected.explanation
      || stored.visual_start !== expected.visualStart
      || stored.scoring_weight !== expected.scoringWeight
      || stored.content_hash !== expected.contentHash
    ) {
      throw new Error(`Seed integrity mismatch for ${stored.stable_id}.`);
    }
  }
}
