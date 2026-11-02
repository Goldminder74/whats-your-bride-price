import assert from "node:assert/strict";
import test from "node:test";
import { classicBank } from "../../question-bank/classic.ts";
import { mulberry32, selectRound } from "../../question-bank/select.ts";
import { correctTexts } from "../../question-bank/text.ts";

function fixturePool() {
  const pool = [];
  const categories = ["FOOD", "MUSIC", "FASHION", "LANGUAGE", "FESTIVALS", "WEDDINGS", "GEOGRAPHY", "HISTORY", "PEOPLE", "POP", "SPORT", "PROVERBS"];
  const difficulties = ["easy", "medium", "hard"];
  for (const category of categories) {
    for (const difficulty of difficulties) {
      for (let copy = 0; copy < 2; copy += 1) {
        pool.push({
          id: `west_${category}_${difficulty}_${copy}`.toLowerCase(),
          region: "west",
          country: "Nigeria",
          category,
          difficulty,
          kind: "single",
          prompt: `${category} ${difficulty} ${copy} question for the west bank`,
          options: ["Alpha", "Beta", "Gamma", "Delta"],
          correct: [0],
          explanation: "Fixture explanation long enough for the selector.",
          sources: [],
          origin: "generated",
          lifecycleStatus: "published",
        });
      }
    }
  }
  return pool;
}

test("a round has 12 unique questions spread across categories and difficulties", () => {
  const round = selectRound({ pool: fixturePool(), region: "west", rng: mulberry32(7) });
  assert.equal(round.questions.length, 12);
  assert.equal(new Set(round.questions.map((question) => question.id)).size, 12);
  assert.equal(new Set(round.questions.map((question) => question.category)).size, 12);
  assert.equal(new Set(round.questions.map((question) => question.difficulty)).size, 3);
});

test("recent questions are avoided while the bank still has 12 fresh ones", () => {
  const pool = fixturePool();
  const recent = pool.slice(0, 24).map((question) => question.id);
  const round = selectRound({ pool, region: "west", recentIds: recent, rng: mulberry32(3) });
  assert.equal(round.usedRecent, false);
  for (const question of round.questions) assert.equal(recent.includes(question.id), false);
});

test("option labels stay a complete set and fixed-order questions do not shuffle", () => {
  const pool = fixturePool();
  pool[0].kind = "image";
  pool[0].orderMatters = true;
  pool[0].visualStart = 0;
  const first = selectRound({ pool, region: "west", rng: mulberry32(11) });
  const again = selectRound({ pool, region: "west", rng: mulberry32(11) });
  assert.deepEqual(first.questions.map((question) => question.id), again.questions.map((question) => question.id));
  assert.deepEqual(first.questions.map((question) => question.options), again.questions.map((question) => question.options));
  const image = first.questions.find((question) => question.kind === "image");
  if (image) assert.deepEqual(image.options, ["Alpha", "Beta", "Gamma", "Delta"]);
  let shuffled = false;
  for (let seed = 1; seed < 30; seed += 1) {
    const round = selectRound({ pool, region: "west", rng: mulberry32(seed) });
    for (const question of round.questions) {
      assert.deepEqual(correctTexts(question.options, question.correct), ["alpha"]);
      if (!question.orderMatters && question.options[0] !== "Alpha") shuffled = true;
    }
  }
  assert.equal(shuffled, true);
});

test("classic questions stay in the eligible pool", () => {
  const classic = classicBank("west");
  assert.equal(classic.length, 12);
  assert.equal(classic.some((question) => question.kind === "image"), true);
  const round = selectRound({
    pool: [...classic, ...fixturePool()],
    region: "west",
    rng: mulberry32(99),
  });
  assert.equal(round.questions.length, 12);
  assert.equal(round.questions.every((question) => question.prompt.length > 0), true);
});
