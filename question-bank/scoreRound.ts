import { answersMatch } from "../app/gameLogic.ts";
import type { RegionKey } from "../app/gameData.ts";
import { regions } from "../app/gameData.ts";
import type { KvStore } from "../paid/games.ts";
import { PaidError } from "../paid/errors.ts";
import type { PlayQuestion } from "./types.ts";

export type StoredRound = {
  id: string;
  edition: RegionKey;
  player: string | null;
  questions: PlayQuestion[];
  createdAt: number;
  attemptId?: string | null;
};

export function attemptRoundKey(attemptId: string) {
  return `attempt-round:${attemptId}`;
}

const SHARDS = 256;

export function roundKey(id: string) {
  return `round:${id}`;
}

export function recentKey(player: string, edition: RegionKey) {
  return `recent:${player}:${edition}`;
}

export async function readRound(kv: KvStore, id: string): Promise<StoredRound | null> {
  const raw = await kv.get(roundKey(id));
  if (!raw) return null;
  const parsed = JSON.parse(raw) as StoredRound;
  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length < 1) return null;
  return parsed;
}

export async function completeStoredRound(kv: KvStore, round: StoredRound, answers: readonly (readonly number[])[], now: number) {
  if (answers.length !== round.questions.length) throw new PaidError("answers_incomplete", 400);
  const explanations = round.questions.map((question, index) => ({
    index,
    correct: answersMatch(answers[index], question.correct),
    explanation: question.explanation,
  }));
  const score = explanations.filter((item) => item.correct).length;
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const day = new Date(now).toISOString().slice(0, 10);
  const shard = crypto.getRandomValues(new Uint8Array(1))[0] % SHARDS;
  await kv.put(`result:${id}`, JSON.stringify({ edition: round.edition, score, total: round.questions.length, roundId: round.id, player: round.player ?? null, at: now }));
  const counterKey = `count:${day}:${shard}`;
  const current = Number(await kv.get(counterKey) || "0");
  await kv.put(counterKey, String((Number.isSafeInteger(current) ? current : 0) + 1));
  return {
    id,
    edition: round.edition,
    editionName: regions[round.edition].name,
    score,
    total: round.questions.length,
    explanations,
    roundId: round.id,
  };
}
