import type { RegionKey } from "../app/gameData.ts";
import { fixedOptionOrder } from "./text.ts";
import { GAME_SIZE, RECENT_AVOID, type BankQuestion, type PlayQuestion } from "./types.ts";

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function toPlayQuestion(question: BankQuestion): PlayQuestion {
  return {
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    options: [...question.options],
    correct: [...question.correct],
    explanation: question.explanation,
    topic: question.category,
    difficulty: question.difficulty,
    category: question.category,
    orderMatters: question.orderMatters ?? fixedOptionOrder(question.prompt, question.explanation, question.kind),
    visualStart: question.visualStart,
  };
}

function applyOrder(question: PlayQuestion, order: readonly number[]): PlayQuestion {
  const options = order.map((index) => question.options[index]);
  const correct = question.correct.map((index) => order.indexOf(index)).sort((a, b) => a - b);
  return { ...question, options, correct };
}

export function selectRound(input: {
  pool: readonly BankQuestion[];
  region: RegionKey;
  recentIds?: readonly string[];
  count?: number;
  rng?: Rng;
}): { questions: PlayQuestion[]; usedRecent: boolean } {
  const count = input.count ?? GAME_SIZE;
  const rng = input.rng ?? Math.random;
  const regionPool = input.pool.filter((question) => question.region === input.region && question.lifecycleStatus !== "held");
  const byId = new Map<string, BankQuestion>();
  for (const question of regionPool) if (!byId.has(question.id)) byId.set(question.id, question);
  const eligible = [...byId.values()];
  const recent = (input.recentIds || []).slice(0, 100);
  const avoid = new Set(recent.slice(0, RECENT_AVOID));
  const recentRank = new Map(recent.map((id, index) => [id, index]));
  const rank = new Map(eligible.map((question) => [question.id, rng()]));
  const categories = new Map<string, number>();
  const difficulties = new Map<string, number>();
  const remaining = [...eligible];
  const picked: BankQuestion[] = [];
  let usedRecent = false;
  while (picked.length < count) {
    remaining.sort((left, right) => {
      const leftRecent = avoid.has(left.id) ? 1 : 0;
      const rightRecent = avoid.has(right.id) ? 1 : 0;
      if (leftRecent !== rightRecent) return leftRecent - rightRecent;
      if (leftRecent && rightRecent) {
        const recency = (recentRank.get(right.id) ?? 99) - (recentRank.get(left.id) ?? 99);
        if (recency !== 0) return recency;
      }
      const leftBalance = (categories.get(left.category) || 0) * 3 + (difficulties.get(left.difficulty) || 0) * 2;
      const rightBalance = (categories.get(right.category) || 0) * 3 + (difficulties.get(right.difficulty) || 0) * 2;
      return leftBalance - rightBalance || (rank.get(left.id) || 0) - (rank.get(right.id) || 0);
    });
    const chosen = remaining.shift();
    if (!chosen) break;
    if (avoid.has(chosen.id)) usedRecent = true;
    picked.push(chosen);
    categories.set(chosen.category, (categories.get(chosen.category) || 0) + 1);
    difficulties.set(chosen.difficulty, (difficulties.get(chosen.difficulty) || 0) + 1);
  }
  const ordered = [...picked].sort((left, right) => (rank.get(left.id) || 0) - (rank.get(right.id) || 0));
  const questions = ordered.map((question) => {
    const play = toPlayQuestion(question);
    if (play.orderMatters) return play;
    const order = play.options.map((_, index) => index);
    const optionRank = order.map((index) => [index, rng()] as const);
    optionRank.sort((left, right) => left[1] - right[1] || left[0] - right[0]);
    return applyOrder(play, optionRank.map(([index]) => index));
  });
  return { questions, usedRecent };
}
