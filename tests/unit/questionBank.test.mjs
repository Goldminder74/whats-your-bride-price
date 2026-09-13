import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authorizeOwnerDashboardSubject } from "../../app/ownerDashboardAccess.ts";
import { loadQuestionBankAfterOwnerAuthorization } from "../../app/questionBankOwner.ts";
import { validatePublicSelectionRequest } from "../../db/questionSelectionService.ts";
import {
  authorizeReproducibleSelectionSeed,
  selectQuestionSet,
  toPublicSelectedQuestion,
} from "../../db/questionSelection.ts";
import { validateQuestionBankDocument, validateQuestionContract } from "../../db/questionBankContracts.ts";
import {
  buildLegacyQuestionBankDocument,
  parseQuestionBankCsv,
  parseQuestionBankJson,
  previewQuestionBankImport,
  questionBankCsv,
  questionBankJson,
} from "../../db/questionBankWorkflow.ts";
import { APPROVED_GAME_DATA_FILE_SHA256, buildDevelopmentSeed } from "../../db/seeds/development.ts";

const now = Date.UTC(2026, 8, 1);
const publishedAt = now - 86_400_000;

function selectable(index, overrides = {}) {
  const difficulty = ["introductory", "intermediate", "advanced"][index % 3];
  const category = ["HISTORY", "LANGUAGE", "FOOD", "MUSIC", "GEOGRAPHY", "ART"][index % 6];
  return Object.freeze({
    internalId: `question_internal_${index}`,
    editionId: "edition_west_v1",
    stableId: `west_synthetic_${String(index).padStart(3, "0")}`,
    version: 1,
    region: "west",
    category,
    difficulty,
    questionKind: "single",
    questionText: `Synthetic selection prompt ${index}`,
    visualStart: null,
    answerOptions: Object.freeze([{ id: "o1", text: "First" }, { id: "o2", text: "Second" }]),
    acceptedAnswers: Object.freeze([Object.freeze(["o1"])]),
    explanation: "Synthetic explanation used only by tests.",
    scoringWeight: 1,
    lifecycleStatus: "published",
    sourceReviewStatus: "approved",
    publishedAt,
    retiredAt: null,
    validFrom: publishedAt,
    validUntil: null,
    imageProvenance: Object.freeze([]),
    audioProvenance: Object.freeze([]),
    ...overrides,
  });
}

function seed(byte) {
  return authorizeReproducibleSelectionSeed(new Uint8Array(32).fill(byte), { authorized: true, purpose: "challenge" });
}

test("the verified 60 questions enter the typed contract without content or scoring changes", async () => {
  const gameData = await readFile(new URL("../../app/gameData.ts", import.meta.url));
  assert.equal(createHash("sha256").update(gameData).digest("hex"), APPROVED_GAME_DATA_FILE_SHA256);
  const legacy = await buildLegacyQuestionBankDocument();
  const seedData = await buildDevelopmentSeed();
  assert.equal(legacy.questions.length, 60);
  for (const question of legacy.questions) {
    const original = seedData.questions.find((row) => row.stableId === question.stableId);
    assert.ok(original);
    assert.equal(question.questionText, original.questionText);
    assert.deepEqual(question.answerOptions, JSON.parse(original.answerOptionsJson));
    assert.deepEqual(question.acceptedAnswers, [JSON.parse(original.correctAnswerJson)]);
    assert.equal(question.explanation, original.explanation);
    assert.equal(question.scoringWeight, 1);
    assert.equal(question.lifecycleStatus, "published");
  }
});

test("selection is deterministic for authorised seeds, varies across seeds and exposes no authority", async () => {
  const candidates = Array.from({ length: 60 }, (_, index) => selectable(index));
  const first = await selectQuestionSet({ candidates, region: "west", now, authorizedSeed: seed(1) });
  const replay = await selectQuestionSet({ candidates, region: "west", now, authorizedSeed: seed(1) });
  const different = await selectQuestionSet({ candidates, region: "west", now, authorizedSeed: seed(2) });
  assert.deepEqual(first.questions.map((question) => question.stableId), replay.questions.map((question) => question.stableId));
  assert.equal(first.seedReference, replay.seedReference);
  assert.notDeepEqual(first.questions.map((question) => question.stableId), different.questions.map((question) => question.stableId));
  assert.equal(new Set(first.questions.map((question) => question.stableId)).size, 12);
  const difficultyCounts = Object.groupBy(first.questions, (question) => question.difficulty);
  assert.ok(Math.max(...Object.values(difficultyCounts).map((items) => items.length)) - Math.min(...Object.values(difficultyCounts).map((items) => items.length)) <= 1);
  const projection = toPublicSelectedQuestion(first.questions[0]);
  assert.deepEqual(Object.keys(projection).sort(), ["audioAssets", "imageAssets", "imageDescriptions", "kind", "options", "questionRef", "text", "version"]);
  assert.doesNotMatch(JSON.stringify(projection), /answer|correct|review|seed|internal|explanation/i);
});

test("the engine supports at least fifty approved candidates in every regional edition", async () => {
  for (const region of ["west", "east", "central", "north", "south"]) {
    const candidates = Array.from({ length: 50 }, (_, index) => selectable(index, {
      region,
      editionId: `edition_${region}_v1`,
      stableId: `${region}_synthetic_${String(index).padStart(3, "0")}`,
    }));
    const selected = await selectQuestionSet({ candidates, region, now, authorizedSeed: seed(10 + region.length) });
    assert.equal(selected.questions.length, 12);
    assert.ok(selected.questions.every((question) => question.region === region));
  }
});

test("selection excludes invalid lifecycle rows, minimises valid recent repetition and fails honestly for a small bank", async () => {
  const eligible = Array.from({ length: 24 }, (_, index) => selectable(index));
  const excluded = [
    selectable(30, { lifecycleStatus: "retired", retiredAt: now - 1 }),
    selectable(31, { lifecycleStatus: "published", validUntil: now }),
    selectable(32, { lifecycleStatus: "review" }),
    selectable(33, { sourceReviewStatus: "pending" }),
    selectable(34, { publishedAt: now + 1 }),
  ];
  const recentQuestionVersions = eligible.slice(0, 12).map(({ stableId, version }) => ({ stableId, version }));
  const selected = await selectQuestionSet({ candidates: [...eligible, ...excluded], region: "west", now, authorizedSeed: seed(3), recentQuestionVersions });
  assert.equal(selected.usedRecentQuestions, false);
  assert.ok(selected.questions.every((question) => !recentQuestionVersions.some((recent) => recent.stableId === question.stableId)));
  await assert.rejects(selectQuestionSet({ candidates: eligible.slice(0, 11), region: "west", now, authorizedSeed: seed(4) }), /insufficient_published_bank/);
});

test("challenge-compatible selection preserves exact versions and refuses an unavailable version", async () => {
  const candidates = Array.from({ length: 12 }, (_, index) => selectable(index));
  const compatible = candidates.map(({ stableId, version }) => ({ stableId, version }));
  const selected = await selectQuestionSet({ candidates, region: "west", now, authorizedSeed: seed(5), compatibleQuestionVersions: compatible });
  assert.deepEqual(selected.questions.map(({ stableId, version }) => ({ stableId, version })), compatible);
  await assert.rejects(selectQuestionSet({ candidates, region: "west", now, authorizedSeed: seed(5), compatibleQuestionVersions: [...compatible.slice(0, 11), { stableId: compatible[11].stableId, version: 2 }] }), /incompatible_question_versions/);
});

test("browser selection input cannot request difficulty, answer keys, counts or raw seeds", () => {
  const valid = { region: "west", anonymousSessionCredential: "a".repeat(32), idempotencyKey: "selection-request-0001" };
  assert.deepEqual(validatePublicSelectionRequest(valid), valid);
  for (const extra of [{ difficulty: "introductory" }, { acceptedAnswers: [["o1"]] }, { count: 1 }, { seed: "easy" }]) {
    assert.throws(() => validatePublicSelectionRequest({ ...valid, ...extra }), /selection_request_field_not_allowed/);
  }
  assert.throws(() => validatePublicSelectionRequest({ ...valid, anonymousSessionCredential: "a".repeat(64) }), /selection_subject_invalid/);
});

test("strict JSON and CSV workflows round-trip, reject unsafe imports and never perform writes", async () => {
  const legacy = await buildLegacyQuestionBankDocument();
  assert.equal(parseQuestionBankJson(questionBankJson(legacy)).questions.length, 60);
  assert.equal(parseQuestionBankCsv(questionBankCsv(legacy)).questions.length, 60);
  const report = previewQuestionBankImport(legacy, legacy);
  assert.equal(report.valid, true);
  assert.equal(report.writesPerformed, false);
  assert.equal(report.exactDuplicates.length, 60);
  assert.throws(() => parseQuestionBankJson("{bad"), /malformed_json/);
  assert.throws(() => parseQuestionBankJson(JSON.stringify({ schemaVersion: "question-bank-v1", questions: [], unexpected: true })), /unexpected_field/);
  const injected = questionBankCsv({ schemaVersion: "question-bank-v1", questions: [legacy.questions[0]] }).replace(legacy.questions[0].questionText, "=1+1");
  assert.throws(() => parseQuestionBankCsv(injected), /formula_injection/);
});

test("contracts reject missing sources, review gaps, duplicates, unknown controls and unapproved assets", async () => {
  const question = (await buildLegacyQuestionBankDocument()).questions[0];
  assert.throws(() => validateQuestionContract({ ...question, sources: [] }), /sources_required/);
  assert.throws(() => validateQuestionContract({ ...question, reviewer: null }), /cultural_review_required/);
  assert.throws(() => validateQuestionContract({ ...question, answerOptions: [question.answerOptions[0], question.answerOptions[0]] }), /duplicate/);
  assert.throws(() => validateQuestionContract({ ...question, category: "UNKNOWN" }), /unknown_value/);
  assert.throws(() => validateQuestionContract({ ...question, difficulty: "easy" }), /unknown_value/);
  assert.throws(() => validateQuestionContract({ ...question, lifecycleStatus: "live" }), /unknown_value/);
  assert.throws(() => validateQuestionContract({ ...question, imageProvenance: [{ assetRef: "https://unapproved.invalid/image.png", accessibilityDescription: "A neutral description of the visible subject.", creator: "Creator", source: "https://example.org/source", licence: "CC BY", reviewedAt: "2026-08-22" }] }), /unapproved_remote_asset/);
});

test("published versions cannot be overwritten and near duplicates are reported", async () => {
  const legacy = await buildLegacyQuestionBankDocument();
  const changed = { ...legacy.questions[0], questionText: `${legacy.questions[0].questionText} changed` };
  assert.throws(() => previewQuestionBankImport({ schemaVersion: "question-bank-v1", questions: [changed] }, legacy), /published_version_overwrite/);
  const draft = { ...legacy.questions[0], stableId: "west_near_duplicate_001", version: 1, lifecycleStatus: "draft", publishedAt: null, questionText: legacy.questions[1].questionText };
  const report = previewQuestionBankImport(validateQuestionBankDocument({ schemaVersion: "question-bank-v1", questions: [draft] }), legacy);
  assert.ok(report.nearDuplicates.length >= 1);
  assert.equal(report.changes[0].action, "create_draft");
});

test("owner authorization fails closed before a question-bank loader can touch D1", async () => {
  let loads = 0;
  const loader = async () => { loads += 1; return { schemaVersion: "question-bank-v1", questions: [] }; };
  const denied = authorizeOwnerDashboardSubject("owner_subject", undefined);
  await assert.rejects(loadQuestionBankAfterOwnerAuthorization(denied, loader), /owner_access_required/);
  assert.equal(loads, 0);
  const allowed = authorizeOwnerDashboardSubject("owner_subject", "owner_subject");
  assert.equal((await loadQuestionBankAfterOwnerAuthorization(allowed, loader)).schemaVersion, "question-bank-v1");
  assert.equal(loads, 1);
});
