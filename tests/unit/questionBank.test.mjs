import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { classicBank } from "../../question-bank/classic.ts";
import { scopeFitsRegion } from "../../question-bank/regions.ts";
import { sensitivityReasons } from "../../question-bank/sensitivity.ts";
import { jaccard, normalizeText } from "../../question-bank/text.ts";

const regions = ["west", "east", "central", "north", "south"];

async function published(region) {
  const file = new URL(`../../data/question-bank/published/${region}.json`, import.meta.url);
  return JSON.parse(await readFile(file, "utf8")).questions;
}

test("every region publishes at least 200 gated questions", async () => {
  const seen = new Set();
  const prompts = [];
  for (const region of regions) {
    const questions = await published(region);
    assert.ok(questions.length >= 200, `${region} published ${questions.length}`);
    assert.ok(questions.some((question) => question.kind === "multi"), `${region} needs a multi-answer question`);
    assert.ok(questions.some((question) => question.kind === "complete"), `${region} needs a sentence completion`);
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
      const source = question.sources[0];
      assert.match(source.url, /^https:\/\//);
      assert.equal(question.gateReport.source.status, "pass");
      assert.ok(question.gateReport.source.http >= 200 && question.gateReport.source.http < 400);
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
