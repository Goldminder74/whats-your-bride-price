import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { selectQuestionSet } from "../../db/questionSelection.ts";
import { validateQuestionBankDocument } from "../../db/questionBankContracts.ts";
import {
  buildLegacyQuestionBankDocument,
  parseQuestionBankCsv,
  parseQuestionBankJson,
  previewQuestionBankImport,
  questionBankCsv,
} from "../../db/questionBankWorkflow.ts";

const importFile = new URL("../../data/question-bank/west-africa/west-africa-draft-v1.json", import.meta.url);
const reviewFile = new URL("../../data/question-bank/west-africa/west-africa-cultural-review.csv", import.meta.url);
const sourceFile = new URL("../../data/question-bank/west-africa/west-africa-source-register.csv", import.meta.url);
const gameDataFile = new URL("../../app/gameData.ts", import.meta.url);

async function loadDocument() {
  return parseQuestionBankJson(await readFile(importFile, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("West Africa import contains 67 schema-valid draft candidates with unique answers and versions", async () => {
  const document = await loadDocument();
  assert.equal(document.questions.length, 67);
  assert.equal(validateQuestionBankDocument(document).questions.length, 67);
  const versions = new Set();
  for (const question of document.questions) {
    assert.equal(question.region, "west");
    assert.equal(question.lifecycleStatus, "draft");
    assert.equal(question.publishedAt, null);
    assert.equal(question.retiredAt, null);
    assert.equal(question.scoringWeight, 1);
    assert.equal(question.answerOptions.length, 4);
    assert.equal(new Set(question.answerOptions.map((option) => option.id)).size, 4);
    assert.equal(new Set(question.answerOptions.map((option) => option.text.toLocaleLowerCase("en"))).size, 4);
    const optionIds = new Set(question.answerOptions.map((option) => option.id));
    assert.ok(question.acceptedAnswers.flat().every((answer) => optionIds.has(answer)));
    const versionRef = `${question.stableId}@${question.version}`;
    assert.equal(versions.has(versionRef), false);
    versions.add(versionRef);
  }
});

test("difficulty, category, scope and specialist-review coverage matches the generated reports", async () => {
  const document = await loadDocument();
  const difficulty = Object.fromEntries(Object.entries(Object.groupBy(document.questions, (question) => question.difficulty)).map(([key, value]) => [key, value.length]));
  assert.deepEqual(difficulty, { introductory: 27, intermediate: 27, advanced: 13 });
  const categories = new Set(document.questions.map((question) => question.category));
  for (const required of ["FOOD", "TRADITION", "MUSIC", "TEXTILES", "ART", "HISTORY", "GEOGRAPHY", "LANGUAGE", "PROVERBS", "ORAL HISTORY"]) assert.ok(categories.has(required));
  assert.ok(document.questions.every((question) => question.countryScope));
  assert.ok(document.questions.some((question) => question.countryScope.includes(";")));
  assert.ok(document.questions.some((question) => question.communityScope));
  const specialist = document.questions.filter((question) => question.sensitivityNotes);
  assert.equal(specialist.length, 18);
  assert.ok(specialist.every((question) => question.reviewer?.includes("not cultural approval") && question.reviewDate));
});

test("every candidate has a question-specific authoritative source and source register entry", async () => {
  const document = await loadDocument();
  const sourceUrls = new Set();
  for (const question of document.questions) {
    assert.ok(question.sources.length >= 1);
    for (const source of question.sources) {
      assert.match(source.urlOrReference, /^https:\/\//);
      assert.equal(source.accessDate, "2026-09-03");
      assert.equal(source.reviewStatus, "approved");
      assert.ok(["heritage", "museum", "academic"].includes(source.sourceType));
      assert.ok(source.relevantClaim.length >= 20);
      sourceUrls.add(source.urlOrReference);
    }
  }
  assert.equal(sourceUrls.size, 34);
  const sourceLines = (await readFile(sourceFile, "utf8")).trimEnd().split(/\r?\n/);
  assert.equal(sourceLines.length, 35);
  assert.match(sourceLines[0], /^sourceId,title,organisationOrAuthor,urlOrReference,/);
});

test("draft candidates cannot enter public selection", async () => {
  const document = await loadDocument();
  const candidates = document.questions.map((question, index) => ({
    ...question,
    internalId: `draft_${index}`,
    editionId: "edition_west_v1",
    sourceReviewStatus: "approved",
  }));
  await assert.rejects(selectQuestionSet({ candidates, region: "west", now: Date.UTC(2026, 8, 3) }), /insufficient_published_bank/);
});

test("new candidates have no exact or configured near duplicates against themselves or the existing 60", async () => {
  const document = await loadDocument();
  const legacy = await buildLegacyQuestionBankDocument();
  const report = previewQuestionBankImport(document, legacy);
  assert.equal(report.questionCount, 67);
  assert.deepEqual(report.exactDuplicates, []);
  assert.deepEqual(report.nearDuplicates, []);
  assert.ok(report.changes.every((change) => change.action === "create_draft"));
  assert.equal(report.writesPerformed, false);
});

test("JSON and CSV import formats round-trip and CSV neutralisation remains active", async () => {
  const document = await loadDocument();
  const csv = questionBankCsv(document);
  assert.equal(parseQuestionBankCsv(csv).questions.length, 67);
  assert.equal(parseQuestionBankJson(JSON.stringify(document)).questions.length, 67);
  const injected = csv.replace(document.questions[0].questionText, "=WEBSERVICE(\"https://example.invalid\")");
  assert.throws(() => parseQuestionBankCsv(injected), /formula_injection|malformed_csv/);
  const review = await readFile(reviewFile, "utf8");
  assert.equal(review.trimEnd().split(/\r?\n/).length, 68);
  assert.doesNotMatch(review, /(?:^|,)\s*[=+@]/m);
});

test("existing cultural content and all eight migrations retain their approved hashes", async () => {
  assert.equal(sha256(await readFile(gameDataFile)), "3ce3474de2e6b072bf4e893fc2760c8b9ba996a889697ec5ac15f631cc05c74d");
  const expected = {
    "0000_loving_stepford_cuckoos.sql": "3de5ecdbeb6f60cea664f10dcd5f95144d63bf343b9dd9c22d68c764cc1cdf6a",
    "0001_same_vertigo.sql": "8f311c1b0da59394e03811270a67e9b593ca39cef2dd9b964a51d8668675a816",
    "0002_little_inertia.sql": "16750df69b0f23cc2f6c2b2e8c55689fd6a2473d7a0c4665a8b2ee4f7e1f64a7",
    "0003_clever_joshua_kane.sql": "3eb81a835dcff39f8bc796483b2ca7de1a8f1c29dd218e5c43779f7edcc31fdb",
    "0004_yellow_bill_hollister.sql": "c649185f96cdce28aca0522330649b4688c9f1da93ea6eab0c08842b163b65bc",
    "0005_special_gamma_corps.sql": "a13ac6180fa745732266fc922f89d2cd1e10f5f9c88d90e4f310ff833b09701d",
    "0006_regular_paibok.sql": "a34516dbc54f58557dcebd37f31a5a9c212905865bc57fffd9ab56f95e38e52e",
    "0007_ancient_yellow_claw.sql": "10be0f218f97d556a5af73d29481eafce8a5ca3a0bfc56d22e1b33c4de119076",
  };
  const migrationDir = new URL("../../drizzle/", import.meta.url);
  const migrations = (await readdir(migrationDir)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  assert.deepEqual(migrations, Object.keys(expected));
  for (const migration of migrations) assert.equal(sha256(await readFile(new URL(migration, migrationDir))), expected[migration]);
});
