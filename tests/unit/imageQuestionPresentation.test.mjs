import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { imageAnswerPresentations, legacyImageQuestionStableId, publishedImageQuestionIds } from "../../app/imageQuestionPresentation.ts";
import { judgeImageAnswer, imageAnswerAuthorityQuestionCount } from "../../app/imageAnswerAuthority.ts";
import { POST as checkImageAnswer } from "../../app/questions/image-answer/route.ts";
import { regionOrder, regions } from "../../app/gameData.ts";
import { regions as publicRegions } from "../../app/publicGameData.ts";
import { toPublicSelectedQuestion } from "../../db/questionSelection.ts";
import { validateQuestionContract } from "../../db/questionBankContracts.ts";
import { buildLegacyQuestionBankDocument, previewQuestionBankImport } from "../../db/questionBankWorkflow.ts";

const publishedAt = Date.UTC(2026, 7, 22);

function selectable(region, questionIndex) {
  const question = regions[region].questions[questionIndex];
  return Object.freeze({
    internalId: `question_${region}_${questionIndex}`,
    editionId: `edition_${region}_v1`,
    stableId: legacyImageQuestionStableId(region, questionIndex),
    version: 1,
    region,
    category: question.topic,
    difficulty: "introductory",
    questionKind: question.kind,
    questionText: question.prompt,
    visualStart: question.visualStart ?? null,
    answerOptions: Object.freeze(question.options.map((text, index) => Object.freeze({ id: `o${index + 1}`, text }))),
    acceptedAnswers: Object.freeze([Object.freeze(question.correct.map((index) => `o${index + 1}`))]),
    explanation: question.explanation,
    scoringWeight: 1,
    lifecycleStatus: "published",
    sourceReviewStatus: "approved",
    publishedAt,
    retiredAt: null,
    validFrom: null,
    validUntil: null,
    imageProvenance: Object.freeze([]),
    audioProvenance: Object.freeze([]),
  });
}

const imageQuestions = regionOrder.flatMap((region) => regions[region].questions
  .map((question, index) => ({ region, question, index }))
  .filter(({ question }) => question.kind === "image"));

test("all published image answers use neutral markers, meaningful descriptions and opaque asset paths", () => {
  assert.equal(imageQuestions.length, 10);
  assert.deepEqual(new Set(imageQuestions.map(({ region, index }) => legacyImageQuestionStableId(region, index))), new Set(publishedImageQuestionIds));
  for (const { region, question, index } of imageQuestions) {
    const presentations = imageAnswerPresentations({
      stableId: legacyImageQuestionStableId(region, index),
      region,
      visualStart: question.visualStart ?? null,
      answerOptions: question.options.map((text, optionIndex) => ({ id: `o${optionIndex + 1}`, text })),
      imageProvenance: [],
    });
    assert.equal(presentations.length, 4);
    assert.deepEqual(presentations.map((item) => item.marker), ["A", "B", "C", "D"]);
    for (const [optionIndex, presentation] of presentations.entries()) {
      assert.ok(presentation.accessibilityDescription.length >= 24);
      assert.ok(presentation.accessibilityDescription.split(/\s+/).length >= 5);
      assert.doesNotMatch(presentation.accessibilityDescription.toLocaleLowerCase("en"), new RegExp(question.options[optionIndex].replace(/[.*+?^${}()|[\]\\]/g, "\\$&").toLocaleLowerCase("en")));
      assert.match(presentation.assetRef, new RegExp(`^/quiz-art/${region}-[0-7]\\.webp$`));
      const assetName = presentation.assetRef.split("/").at(-1).toLocaleLowerCase("en");
      assert.ok(question.options.every((answer) => !assetName.includes(answer.toLocaleLowerCase("en").replaceAll(" ", "-"))));
    }
  }
});

test("public image projections omit canonical labels and answer authority while text options are unchanged", () => {
  for (const { region, question, index } of imageQuestions) {
    const projection = toPublicSelectedQuestion(selectable(region, index));
    assert.deepEqual(projection.options.map((option) => option.text), ["A", "B", "C", "D"]);
    assert.equal(projection.imageAssets.length, 4);
    assert.equal(projection.imageDescriptions.length, 4);
    const serialized = JSON.stringify(projection).toLocaleLowerCase("en");
    for (const canonical of question.options) assert.ok(!serialized.includes(`"${canonical.toLocaleLowerCase("en")}"`));
    assert.doesNotMatch(serialized, /acceptedanswers|correctanswer|correctoption|explanation|internalid/);
  }
  const textQuestion = selectable("west", 0);
  const projection = toPublicSelectedQuestion(textQuestion);
  assert.deepEqual(projection.options, textQuestion.answerOptions);
  assert.deepEqual(projection.imageAssets, []);
  assert.deepEqual(projection.imageDescriptions, []);
});

test("the browser catalogue keeps all 60 questions but strips image authority only", () => {
  assert.equal(regionOrder.reduce((total, region) => total + publicRegions[region].questions.length, 0), 60);
  for (const region of regionOrder) {
    for (const [index, canonical] of regions[region].questions.entries()) {
      const publicQuestion = publicRegions[region].questions[index];
      assert.equal(publicQuestion.prompt, canonical.prompt);
      assert.equal(publicQuestion.topic, canonical.topic);
      assert.equal(publicQuestion.visualStart, canonical.visualStart);
      if (canonical.kind === "image") {
        assert.deepEqual(publicQuestion.options, ["A", "B", "C", "D"]);
        assert.deepEqual(publicQuestion.correct, []);
        assert.equal(publicQuestion.explanation, "");
      } else {
        assert.equal(publicQuestion.kind, canonical.kind);
        assert.deepEqual(publicQuestion.options, canonical.options);
        assert.deepEqual(publicQuestion.correct, canonical.correct);
        assert.equal(publicQuestion.explanation, canonical.explanation);
      }
    }
  }
});

test("server image authority preserves every approved score and reveals it only after a valid submission", async () => {
  assert.equal(imageAnswerAuthorityQuestionCount, 10);
  for (const { region, question, index } of imageQuestions) {
    const stableId = legacyImageQuestionStableId(region, index);
    const selected = question.correct.map((optionIndex) => `o${optionIndex + 1}`);
    assert.deepEqual(judgeImageAnswer(stableId, selected), {
      correct: true,
      correctOptionIds: selected,
      explanation: question.explanation,
    });
    assert.equal(judgeImageAnswer(stableId, [selected[0] === "o1" ? "o2" : "o1"])?.correct, false);
  }

  const body = JSON.stringify({ questionStableId: "west_q04", selectedOptionIds: ["o1"] });
  const valid = await checkImageAnswer(new Request("https://quiz.example/questions/image-answer", {
    method: "POST",
    headers: { origin: "https://quiz.example", "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "content-type": "application/json" },
    body,
  }));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { accepted: true, correct: true, correctOptionIds: ["o1"], explanation: regions.west.questions[3].explanation });
  const hostile = await checkImageAnswer(new Request("https://quiz.example/questions/image-answer", {
    method: "POST",
    headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site", "sec-fetch-mode": "cors", "content-type": "application/json" },
    body,
  }));
  assert.equal(hostile.status, 403);
  assert.deepEqual(await hostile.json(), { accepted: false });
});

test("renderers expose descriptions without captions, titles or tooltips", async () => {
  const [game, daily] = await Promise.all([
    readFile(new URL("../../app/BridePriceGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/DailyChallengeClient.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(game, /alt=\{imagePresentation\.accessibilityDescription\}/);
  assert.match(game, /Option \$\{imagePresentation\.marker\}: \$\{imagePresentation\.accessibilityDescription\}/);
  assert.doesNotMatch(game, /alt=\{option\}|title=\{option\}/);
  assert.match(daily, /alt=\{imageDescription\}/);
  assert.doesNotMatch(daily, /title=\{(?:option|imageDescription)/);
});

test("owner import preview and every regional draft remain non-publishing and contain no image option payload", async () => {
  const legacy = await buildLegacyQuestionBankDocument();
  const preview = previewQuestionBankImport(legacy, legacy);
  assert.equal(preview.writesPerformed, false);
  assert.doesNotMatch(JSON.stringify(preview), /Jollof rice|Sankofa bird|acceptedAnswers|correctAnswer/);
  for (const slug of ["west-africa", "east-africa", "central-africa", "north-africa", "southern-africa"]) {
    const document = JSON.parse(await readFile(new URL(`../../data/question-bank/${slug}/${slug}-draft-v1.json`, import.meta.url), "utf8"));
    assert.ok(document.questions.every((question) => question.lifecycleStatus === "draft"));
    assert.ok(document.questions.every((question) => question.questionKind !== "image" && question.imageProvenance.length === 0));
  }
});

test("unknown or mismatched image presentations fail closed instead of returning labelled options", () => {
  const question = selectable("west", 3);
  assert.throws(() => imageAnswerPresentations({ ...question, stableId: "west_unknown_image", imageProvenance: [] }), /unsafe_image_question_presentation/);
  assert.throws(() => imageAnswerPresentations({ ...question, visualStart: 4, imageProvenance: [] }), /unsafe_image_question_presentation/);
  assert.throws(() => imageAnswerPresentations({
    ...question,
    imageProvenance: question.answerOptions.map((option, index) => ({
      assetRef: index === 0 ? "/quiz-art/jollof-rice.webp" : `/quiz-art/opaque-${index}.webp`,
      accessibilityDescription: index === 0 ? "A clearly labelled Jollof rice answer image." : "An objective description of the visible answer image.",
    })),
  }), /unsafe_image_question_presentation/);
});

test("question contracts require non-spoiler descriptions and filenames for future image options", async () => {
  const legacy = await buildLegacyQuestionBankDocument();
  const question = legacy.questions.find((item) => item.stableId === "west_q04");
  assert.ok(question);
  const presentation = imageAnswerPresentations({ ...selectable("west", 3), imageProvenance: [] });
  const provenance = presentation.map((item) => ({
    assetRef: item.assetRef,
    accessibilityDescription: item.accessibilityDescription,
    creator: "Reviewed project artwork",
    source: "https://example.org/reviewed-artwork",
    licence: "Project-owned",
    reviewedAt: "2026-09-09",
  }));
  assert.equal(validateQuestionContract({ ...question, imageProvenance: provenance }).imageProvenance.length, 4);
  assert.throws(() => validateQuestionContract({
    ...question,
    imageProvenance: provenance.map((item, index) => index === 0
      ? { ...item, accessibilityDescription: "A clearly labelled Jollof rice answer image." }
      : item),
  }), /image_option_answer_leak/);
  assert.throws(() => validateQuestionContract({
    ...question,
    imageProvenance: provenance.map((item, index) => index === 0
      ? { ...item, assetRef: "/quiz-art/jollof-rice.webp" }
      : item),
  }), /image_option_answer_leak/);
});
