import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { selectQuestionSet } from "../../db/questionSelection.ts";
import { validateQuestionBankDocument } from "../../db/questionBankContracts.ts";
import { buildLegacyQuestionBankDocument, parseQuestionBankCsv, parseQuestionBankJson, previewQuestionBankImport, questionBankCsv } from "../../db/questionBankWorkflow.ts";

const importFile = new URL("../../data/question-bank/central-africa/central-africa-draft-v1.json", import.meta.url);
const reviewFile = new URL("../../data/question-bank/central-africa/central-africa-cultural-review.csv", import.meta.url);
const sourceFile = new URL("../../data/question-bank/central-africa/central-africa-source-register.csv", import.meta.url);
const priorFiles = ["west-africa/west-africa-draft-v1.json", "east-africa/east-africa-draft-v1.json", "north-africa/north-africa-draft-v1.json"].map((path) => new URL(`../../data/question-bank/${path}`, import.meta.url));

async function loadDocument() { return parseQuestionBankJson(await readFile(importFile, "utf8")); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

test("Central Africa import contains 82 schema-valid draft candidates with unique answers and versions", async () => {
  const document = await loadDocument();
  assert.equal(document.questions.length, 82);
  assert.equal(validateQuestionBankDocument(document).questions.length, 82);
  const versions = new Set();
  for (const question of document.questions) {
    assert.equal(question.region, "central");
    assert.equal(question.lifecycleStatus, "draft");
    assert.equal(question.publishedAt, null);
    assert.equal(question.retiredAt, null);
    assert.equal(question.validFrom, null);
    assert.equal(question.validUntil, null);
    assert.equal(question.scoringWeight, 1);
    assert.equal(question.answerOptions.length, 4);
    assert.equal(new Set(question.answerOptions.map((option) => option.text.toLocaleLowerCase("en"))).size, 4);
    assert.ok(question.acceptedAnswers.flat().every((answer) => question.answerOptions.some((option) => option.id === answer)));
    const versionRef = `${question.stableId}@${question.version}`;
    assert.equal(versions.has(versionRef), false);
    versions.add(versionRef);
  }
});

test("difficulty, topic, country and specialist-review coverage matches the research brief", async () => {
  const document = await loadDocument();
  const difficulty = Object.fromEntries(Object.entries(Object.groupBy(document.questions, (question) => question.difficulty)).map(([key, value]) => [key, value.length]));
  assert.deepEqual(difficulty, { introductory: 33, intermediate: 33, advanced: 16 });
  const categories = new Set(document.questions.map((question) => question.category));
  for (const required of ["FOOD", "TRADITION", "MUSIC", "ART", "ART & HISTORY", "HISTORY", "GEOGRAPHY", "LANGUAGE", "ORAL HISTORY", "MODERN HISTORY"]) assert.ok(categories.has(required));
  const countries = new Set(document.questions.flatMap((question) => question.countryScope.split("; ")));
  for (const country of ["Angola", "Cameroon", "Central African Republic", "Chad", "Congo", "Democratic Republic of the Congo", "Equatorial Guinea", "Gabon", "Sao Tome and Principe"]) assert.ok(countries.has(country));
  assert.ok(document.questions.every((question) => question.communityScope));
  assert.equal(document.questions.filter((question) => question.sensitivityNotes).length, 82);
  assert.ok(document.questions.every((question) => question.reviewer?.includes("not cultural approval") && question.reviewDate === "2026-09-06"));
});

test("every candidate has a question-specific high-authority source and source-register entry", async () => {
  const document = await loadDocument();
  const sourceUrls = new Set();
  for (const question of document.questions) {
    assert.equal(question.sources.length, 1);
    const source = question.sources[0];
    assert.match(source.urlOrReference, /^https:\/\/(?:ich|whc)\.unesco\.org\/|^https:\/\/www\.metmuseum\.org\/|^https:\/\/www\.fao\.org\/|^https:\/\/doi\.org\//);
    assert.equal(source.accessDate, "2026-09-06");
    assert.equal(source.reviewStatus, "approved");
    assert.ok(source.relevantClaim.length >= 40);
    sourceUrls.add(source.urlOrReference);
  }
  assert.equal(sourceUrls.size, 21);
  const sourceLines = (await readFile(sourceFile, "utf8")).trimEnd().split(/\r?\n/);
  assert.equal(sourceLines.length, 22);
  assert.match(sourceLines[0], /^sourceId,title,organisationOrAuthor,urlOrReference,/);
});

test("draft candidates cannot enter public selection", async () => {
  const document = await loadDocument();
  const candidates = document.questions.map((question, index) => ({ ...question, internalId: `draft_${index}`, editionId: "edition_central_v1", sourceReviewStatus: "approved" }));
  await assert.rejects(selectQuestionSet({ candidates, region: "central", now: Date.UTC(2026, 8, 6) }), /insufficient_published_bank/);
});

test("Central candidates have no exact or configured near duplicates against all earlier catalogues", async () => {
  const document = await loadDocument();
  const legacy = await buildLegacyQuestionBankDocument();
  const prior = await Promise.all(priorFiles.map(async (file) => parseQuestionBankJson(await readFile(file, "utf8"))));
  const comparisonCatalogue = validateQuestionBankDocument({ schemaVersion: "question-bank-v1", questions: [...legacy.questions, ...prior.flatMap((item) => item.questions)] });
  const report = previewQuestionBankImport(document, comparisonCatalogue);
  assert.equal(report.questionCount, 82);
  assert.deepEqual(report.exactDuplicates, []);
  assert.deepEqual(report.nearDuplicates, []);
  assert.ok(report.changes.every((change) => change.action === "create_draft"));
  assert.equal(report.writesPerformed, false);
});

test("JSON and CSV formats round-trip while review decisions stay pending", async () => {
  const document = await loadDocument();
  const csv = questionBankCsv(document);
  assert.equal(parseQuestionBankCsv(csv).questions.length, 82);
  assert.equal(parseQuestionBankJson(JSON.stringify(document)).questions.length, 82);
  const injected = csv.replace(document.questions[0].questionText, "=WEBSERVICE(\"https://example.invalid\")");
  assert.throws(() => parseQuestionBankCsv(injected), /formula_injection|malformed_csv/);
  const review = await readFile(reviewFile, "utf8");
  assert.equal(review.trimEnd().split(/\r?\n/).length, 83);
  assert.equal((review.match(/,pending,,,/g) || []).length, 82);
  assert.doesNotMatch(review, /(?:^|,)\s*[=+@]/m);
});

test("prior packs, protected files and migrations retain approved hashes", async () => {
  const protectedFiles = new Map([
    [new URL("../../app/gameData.ts", import.meta.url), "3ce3474de2e6b072bf4e893fc2760c8b9ba996a889697ec5ac15f631cc05c74d"],
    [new URL("../../.openai/hosting.json", import.meta.url), "757e9a6341e9b78488a0d053875fd148be1c07b3ec00c7b7c2cb5ee3eb44cf7e"],
    [new URL("../../package-lock.json", import.meta.url), "2d31d7ae177fd0fec55044c069c86109ad92c3baceb79b85c7c05508de60646a"],
    [priorFiles[0], "74ad3ce51666c010fb7e82e4f0539f5af8d57b68efb19b1dd0f02c96282c6871"],
    [priorFiles[1], "51142019e2ee3926c2baca666508b451b017724175a9fbca3206b9000288a2cc"],
    [priorFiles[2], "88abc07b04832b530930e422960a90e8bcd88b0b4e49010c1e19c6a9007c17e2"],
  ]);
  for (const [file, expected] of protectedFiles) assert.equal(sha256(await readFile(file)), expected);
  const expectedMigrations = {
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
  assert.deepEqual(migrations, Object.keys(expectedMigrations));
  for (const migration of migrations) assert.equal(sha256(await readFile(new URL(migration, migrationDir))), expectedMigrations[migration]);
});
