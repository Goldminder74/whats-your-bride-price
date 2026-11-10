import type { RegionKey } from "../app/gameData.ts";
import { fixedOptionOrder } from "./text.ts";
import { GAME_SIZE, HUMOUR_CATEGORY, RECENT_AVOID, ROUND_HUMOUR, type BankQuestion, type PlayQuestion } from "./types.ts";

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

function dedupe(pool: readonly BankQuestion[]): BankQuestion[] {
  const byId = new Map<string, BankQuestion>();
  for (const question of pool) if (!byId.has(question.id)) byId.set(question.id, question);
  return [...byId.values()];
}

function eligiblePool(pool: readonly BankQuestion[], region: RegionKey): BankQuestion[] {
  return dedupe(pool.filter((question) => question.region === region && question.lifecycleStatus !== "held"));
}

/** 8 humour and 4 knowledge in a 12-question round. Other sizes keep the same ratio. */
export function mixTargets(count: number): { humour: number; knowledge: number } {
  const humour = Math.min(count, Math.round((count * ROUND_HUMOUR) / GAME_SIZE));
  return { humour, knowledge: count - humour };
}

function pickBalanced(input: {
  eligible: readonly BankQuestion[];
  count: number;
  rng: Rng;
  recent: readonly string[];
}): { picked: BankQuestion[]; usedRecent: boolean; rank: Map<string, number> } {
  const recent = input.recent.slice(0, 100);
  const avoid = new Set(recent.slice(0, RECENT_AVOID));
  const recentRank = new Map(recent.map((id, index) => [id, index]));
  const rank = new Map(input.eligible.map((question) => [question.id, input.rng()]));
  const categories = new Map<string, number>();
  const difficulties = new Map<string, number>();
  const remaining = [...input.eligible];
  const picked: BankQuestion[] = [];
  let usedRecent = false;
  while (picked.length < input.count) {
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
  return { picked, usedRecent, rank };
}

function present(ordered: readonly BankQuestion[], rng: Rng): PlayQuestion[] {
  return ordered.map((question) => {
    const play = toPlayQuestion(question);
    if (play.orderMatters) return play;
    const order = play.options.map((_, index) => index);
    const optionRank = order.map((index) => [index, rng()] as const);
    optionRank.sort((left, right) => left[1] - right[1] || left[0] - right[0]);
    return applyOrder(play, optionRank.map(([index]) => index));
  });
}

function selectBalanced(input: {
  pool: readonly BankQuestion[];
  region: RegionKey;
  recentIds?: readonly string[];
  count?: number;
  rng?: Rng;
}): { questions: PlayQuestion[]; usedRecent: boolean } {
  const count = input.count ?? GAME_SIZE;
  const rng = input.rng ?? Math.random;
  const eligible = eligiblePool(input.pool, input.region);
  const recent = input.recentIds || [];
  const { picked, usedRecent, rank } = pickBalanced({ eligible, count, rng, recent });
  const ordered = [...picked].sort((left, right) => (rank.get(left.id) || 0) - (rank.get(right.id) || 0));
  return { questions: present(ordered, rng), usedRecent };
}

/** Shuffle, then break a block that would put every humour question before every knowledge question. */
function mixOrder(picked: readonly BankQuestion[], rng: Rng): BankQuestion[] {
  const items = [...picked];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    const current = items[index];
    items[index] = items[swap];
    items[swap] = current;
  }
  const humour = (question: BankQuestion) => question.category === HUMOUR_CATEGORY;
  const humourCount = items.filter(humour).length;
  const knowledgeCount = items.length - humourCount;
  if (humourCount === 0 || knowledgeCount === 0) return items;
  const humourFirst = items.slice(0, humourCount).every(humour);
  const knowledgeFirst = items.slice(0, knowledgeCount).every((question) => !humour(question));
  if (humourFirst || knowledgeFirst) {
    const from = humourFirst ? humourCount : knowledgeCount;
    const into = Math.floor(rng() * from);
    const next = items[from];
    items[from] = items[into];
    items[into] = next;
  }
  return items;
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
  const eligible = eligiblePool(input.pool, input.region);
  const humourPool = eligible.filter((question) => question.category === HUMOUR_CATEGORY);
  if (humourPool.length === 0) return selectBalanced(input);

  const knowledgePool = eligible.filter((question) => question.category !== HUMOUR_CATEGORY);
  const targets = mixTargets(count);
  const recent = input.recentIds || [];
  const humourPick = pickBalanced({ eligible: humourPool, count: Math.min(targets.humour, humourPool.length), rng, recent });
  const knowledgePick = pickBalanced({ eligible: knowledgePool, count: Math.min(targets.knowledge, knowledgePool.length), rng, recent });
  let picked = [...humourPick.picked, ...knowledgePick.picked];
  let usedRecent = humourPick.usedRecent || knowledgePick.usedRecent;
  const taken = () => new Set(picked.map((question) => question.id));
  let shortfall = count - picked.length;
  if (shortfall > 0) {
    const used = taken();
    const extra = pickBalanced({
      eligible: knowledgePool.filter((question) => !used.has(question.id)),
      count: shortfall,
      rng,
      recent,
    });
    picked = [...picked, ...extra.picked];
    usedRecent = usedRecent || extra.usedRecent;
    shortfall = count - picked.length;
  }
  if (shortfall > 0) {
    const used = taken();
    const extra = pickBalanced({
      eligible: humourPool.filter((question) => !used.has(question.id)),
      count: shortfall,
      rng,
      recent,
    });
    picked = [...picked, ...extra.picked];
    usedRecent = usedRecent || extra.usedRecent;
  }
  return { questions: present(mixOrder(picked, rng), rng), usedRecent };
}
