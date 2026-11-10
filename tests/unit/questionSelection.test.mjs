import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classicBank } from "../../question-bank/classic.ts";
import { selectDailyRound } from "../../question-bank/daily.ts";
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

function humourPool(humourCount, knowledgeCount) {
  const pool = [];
  for (let index = 0; index < humourCount; index += 1) {
    pool.push({
      id: `west_humour_${index}`,
      region: "west",
      country: "Nigeria",
      category: "HUMOUR",
      difficulty: index % 2 === 0 ? "easy" : "medium",
      kind: "single",
      prompt: `Humour setup ${index} for the west bank round?`,
      options: ["Alpha", "Beta", "Gamma", "Delta"],
      correct: [0],
      explanation: "The punchline is the authored funny answer.",
      sources: [],
      origin: "draft",
      lifecycleStatus: "published",
    });
  }
  const categories = ["FOOD", "MUSIC", "FASHION", "LANGUAGE", "HISTORY", "GEOGRAPHY"];
  for (let index = 0; index < knowledgeCount; index += 1) {
    pool.push({
      id: `west_knowledge_${index}`,
      region: "west",
      country: "Nigeria",
      category: categories[index % categories.length],
      difficulty: ["easy", "medium", "hard"][index % 3],
      kind: "single",
      prompt: `Knowledge question ${index} for the west bank round?`,
      options: ["Alpha", "Beta", "Gamma", "Delta"],
      correct: [0],
      explanation: "Fixture explanation long enough for the selector.",
      sources: [],
      origin: "generated",
      lifecycleStatus: "published",
    });
  }
  return pool;
}

function counts(round) {
  const humour = round.questions.filter((question) => question.category === "HUMOUR").length;
  return { humour, knowledge: round.questions.length - humour };
}

function grouped(round) {
  const flags = round.questions.map((question) => question.category === "HUMOUR");
  const humourCount = flags.filter(Boolean).length;
  const knowledgeCount = flags.length - humourCount;
  if (humourCount === 0 || knowledgeCount === 0) return false;
  return flags.slice(0, humourCount).every(Boolean) || flags.slice(0, knowledgeCount).every((flag) => !flag);
}

test("a stocked bank deals 8 humour and 4 knowledge, shuffled", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const round = selectRound({ pool: humourPool(24, 40), region: "west", rng: mulberry32(seed) });
    assert.deepEqual(counts(round), { humour: 8, knowledge: 4 });
    assert.equal(new Set(round.questions.map((question) => question.id)).size, 12);
    assert.equal(grouped(round), false, `seed ${seed} kept one type in a block`);
  }
});

test("the same seed repeats the mix, including the daily challenge", () => {
  const pool = humourPool(24, 40);
  const first = selectRound({ pool, region: "west", rng: mulberry32(11) });
  const again = selectRound({ pool, region: "west", rng: mulberry32(11) });
  assert.deepEqual(first.questions.map((question) => question.id), again.questions.map((question) => question.id));
  const day = selectDailyRound(pool, "west", "2026-11-10");
  const sameDay = selectDailyRound(pool, "west", "2026-11-10");
  assert.deepEqual(counts(day), { humour: 8, knowledge: 4 });
  assert.deepEqual(day.questions.map((question) => [question.id, ...question.options]), sameDay.questions.map((question) => [question.id, ...question.options]));
  assert.notDeepEqual(day.questions.map((question) => question.id), selectDailyRound(pool, "west", "2026-11-11").questions.map((question) => question.id));
});

test("a short pool fills from the other side and still reaches 12 when it can", () => {
  const shortHumour = selectRound({ pool: humourPool(5, 20), region: "west", rng: mulberry32(4) });
  assert.deepEqual(counts(shortHumour), { humour: 5, knowledge: 7 });
  const shortKnowledge = selectRound({ pool: humourPool(20, 2), region: "west", rng: mulberry32(4) });
  assert.deepEqual(counts(shortKnowledge), { humour: 10, knowledge: 2 });
  const tiny = selectRound({ pool: humourPool(3, 3), region: "west", rng: mulberry32(4) });
  assert.equal(tiny.questions.length, 6);
  assert.deepEqual(counts(tiny), { humour: 3, knowledge: 3 });
});

test("recent humour is skipped while eight fresh punchlines remain", () => {
  const pool = humourPool(24, 20);
  const recent = pool.filter((question) => question.category === "HUMOUR").slice(0, 16).map((question) => question.id);
  const round = selectRound({ pool, region: "west", recentIds: recent, rng: mulberry32(8) });
  assert.equal(round.usedRecent, false);
  assert.deepEqual(counts(round), { humour: 8, knowledge: 4 });
  for (const question of round.questions) assert.equal(recent.includes(question.id), false);
});

test("each published region bank deals 8 humour and 4 knowledge", async () => {
  for (const region of ["west", "east", "central", "north", "south"]) {
    const file = JSON.parse(await readFile(new URL(`../../data/question-bank/published/${region}.json`, import.meta.url), "utf8"));
    assert.equal(file.questions.filter((question) => question.category === "HUMOUR").length, 24);
    const round = selectRound({ pool: file.questions, region, rng: mulberry32(21) });
    assert.deepEqual(counts(round), { humour: 8, knowledge: 4 });
    assert.equal(grouped(round), false);
    const daily = selectDailyRound(file.questions, region, "2026-11-10");
    const repeat = selectDailyRound(file.questions, region, "2026-11-10");
    assert.deepEqual(counts(daily), { humour: 8, knowledge: 4 });
    assert.deepEqual(daily.questions.map((question) => question.id), repeat.questions.map((question) => question.id));
  }
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
