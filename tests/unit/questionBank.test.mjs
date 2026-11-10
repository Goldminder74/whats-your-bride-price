import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { classicBank } from "../../question-bank/classic.ts";
import { scopeFitsRegion } from "../../question-bank/regions.ts";
import { sensitivityReasons } from "../../question-bank/sensitivity.ts";
import { jaccard, normalizeText, promptNamesAnswer } from "../../question-bank/text.ts";

const regions = ["west", "east", "central", "north", "south"];

async function published(region) {
  const file = new URL(`../../data/question-bank/published/${region}.json`, import.meta.url);
  return JSON.parse(await readFile(file, "utf8")).questions;
}

test("every region publishes at least 50 gated questions with quotes and editorial scores", async () => {
  const seen = new Set();
  const prompts = [];
  for (const region of regions) {
    const questions = await published(region);
    assert.ok(questions.length >= 50, `${region} published ${questions.length}`);
    const answers = new Map();
    const difficulties = new Set(questions.map((question) => question.difficulty));
    assert.deepEqual([...difficulties].sort(), ["easy", "hard", "medium"]);
    for (const question of questions) {
      assert.equal(question.lifecycleStatus, "published");
      assert.equal(question.region, region);
      assert.equal(seen.has(question.id), false, question.id);
      seen.add(question.id);
      assert.match(question.id, /^(west|east|central|north|south)_[a-z0-9][a-z0-9_-]{2,55}$/);
      assert.equal(question.options.length, 4);
      assert.equal(new Set(question.options.map((option) => normalizeText(option))).size, 4);
      const correct = [...new Set(question.correct)];
      assert.deepEqual(correct, [...question.correct].sort((a, b) => a - b));
      assert.ok(correct.every((index) => index >= 0 && index < 4));
      if (question.kind === "multi") assert.equal(correct.length, 3);
      else assert.equal(correct.length, 1);
      const humour = question.category === "HUMOUR";
      assert.equal(question.gateReport.source.status, "pass");
      assert.ok(question.gateReport.editorial.clarity >= 4, question.id);
      assert.ok(question.gateReport.editorial.fun >= 4, question.id);
      assert.ok(question.gateReport.editorial.accuracy >= 4, question.id);
      assert.equal(question.prompt.trim().endsWith("?"), true, question.id);
      if (humour) {
        assert.equal(question.kind, "single");
        assert.equal(question.origin, "draft");
        assert.equal(question.gateReport.source.method, "manual");
        assert.equal(question.gateReport.evidenceQuote, null);
        assert.equal(question.sources.length, 0);
      } else {
      const source = question.sources[0];
      assert.match(source.url, /^https:\/\//);
      assert.equal(question.gateReport.source.method, "evidence-quote");
      assert.ok(question.gateReport.evidenceQuote && question.gateReport.evidenceQuote.length >= 40, question.id);
      assert.equal(/which (?:language point|popular-culture name|sporting name)|fill the blank|the name to write is|according to unesco|\ba and\b|\b(?:in|of|from|for|at|by|with)\s*\?$/i.test(question.prompt), false, question.prompt);
      }
      for (const index of question.correct) {
        const answer = question.options[index];
        if (!humour) assert.equal(promptNamesAnswer(question.prompt, answer), false, `${question.id} names ${answer}`);
        const key = normalizeText(answer);
        const priorId = answers.get(key);
        assert.equal(priorId, undefined, `${question.id} repeats ${answer} from ${priorId}`);
        answers.set(key, question.id);
      }
      for (const [index, option] of question.options.entries()) {
        if (question.correct.includes(index)) continue;
        assert.equal(question.correct.some((correct) => normalizeText(question.options[correct]) === normalizeText(option)), false, question.id);
      }
      if (!humour) {
      const quoteWords = normalizeText(question.gateReport.evidenceQuote).split(" ");
      for (const index of question.correct) {
        for (const word of normalizeText(question.options[index]).split(" ")) {
          if (word.length < 5) continue;
          const hit = quoteWords.some((quoteWord) => {
            if (quoteWord === word) return true;
            const longer = quoteWord.length >= word.length ? quoteWord : word;
            const shorter = quoteWord.length >= word.length ? word : quoteWord;
            if (shorter.length < 5 || !longer.startsWith(shorter)) return false;
            return /^(?:s|es|ed|ing|er|n|ian)?$/.test(longer.slice(shorter.length));
          });
          assert.equal(hit, true, `${question.id} quote missing ${word}`);
        }
      }
      assert.ok(question.gateReport.source.http >= 200 && question.gateReport.source.http < 400);
      }
      assert.equal(question.gateReport.reasons.length, 0);
      assert.equal(scopeFitsRegion(question.country, region), true, question.id);
      const sensitive = sensitivityReasons(`${question.prompt}\n${question.explanation}\n${question.options.join("\n")}`);
      assert.deepEqual(sensitive, [], question.id);
      assert.equal(/\u2014|\u2013/.test(`${question.prompt} ${question.explanation}`), false);
      prompts.push(question);
    }
  }
  for (const region of regions) {
    const all = [...classicBank(region), ...prompts.filter((question) => question.region === region)];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        if (normalizeText(all[i].prompt) === normalizeText(all[j].prompt)) {
          assert.fail(`duplicate prompt ${all[i].id} ${all[j].id}`);
        }
        if (jaccard(all[i].prompt, all[j].prompt) >= 0.72) {
          assert.fail(`near duplicate ${all[i].id} ${all[j].id}`);
        }
      }
    }
  }
});

test("the publish report matches the files on disk", async () => {
  const report = JSON.parse(await readFile(new URL("../../data/question-bank/reports/summary.json", import.meta.url), "utf8"));
  const names = await readdir(new URL("../../data/question-bank/published/", import.meta.url));
  assert.deepEqual(names.sort(), ["central.json", "east.json", "north.json", "south.json", "west.json"]);
  for (const region of regions) {
    const questions = await published(region);
    assert.equal(report.summary[region].published, questions.length);
    assert.ok(report.summary[region].held > 0);
  }
});
