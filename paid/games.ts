import { regionOrder, regions, type RegionKey } from "../app/gameData.ts";
import { answersMatch } from "../app/gameLogic.ts";
import { PaidError } from "./errors.ts";

export interface KvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const SHARDS = 256;

export type PublicQuestion = Readonly<{
  index: number;
  kind: string;
  prompt: string;
  options: readonly string[];
  topic: string;
  image: string | null;
  images: readonly string[] | null;
}>;

export function isEdition(value: unknown): value is RegionKey {
  return typeof value === "string" && Object.hasOwn(regions, value);
}

export function publicQuestions(edition: RegionKey): readonly PublicQuestion[] {
  return regions[edition].questions.map((question, index) => Object.freeze({
    index,
    kind: question.kind,
    prompt: question.prompt,
    options: question.options,
    topic: question.topic,
    image: question.visualStart === undefined ? null : `/quiz-art/${edition}-${question.visualStart}.webp`,
    images: question.visualStart === undefined ? null : question.options.map((_, optionIndex) => `/quiz-art/${edition}-${(question.visualStart ?? 0) + optionIndex}.webp`),
  }));
}

export function editions() {
  return regionOrder.map((key) => ({ key, name: regions[key].name, hello: regions[key].hello }));
}

function parseAnswers(value: unknown, expected: number): number[][] {
  if (!Array.isArray(value) || value.length !== expected) throw new PaidError("answers_incomplete", 400);
  return value.map((answer) => {
    if (!Array.isArray(answer) || answer.length < 1 || answer.length > 8) throw new PaidError("answers_invalid", 400);
    return answer.map((choice) => {
      if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice > 20) {
        throw new PaidError("answers_invalid", 400);
      }
      return choice;
    });
  });
}

/**
 * Scoring runs in the Worker. The only storage write is KV, fanned out across
 * 256 daily shards so a 100/second peak stays under KV's per-key write limit.
 * Purchases are not on this path.
 */
export async function completeGame(kv: KvStore, input: unknown, now: number): Promise<{
  id: string;
  edition: RegionKey;
  editionName: string;
  score: number;
  total: number;
  explanations: readonly { index: number; correct: boolean; explanation: string }[];
}> {
  if (!input || typeof input !== "object") throw new PaidError("completion_invalid", 400);
  const body = input as Record<string, unknown>;
  if (!isEdition(body.edition)) throw new PaidError("edition_invalid", 400);
  const questions = regions[body.edition].questions;
  const answers = parseAnswers(body.answers, questions.length);
  const explanations = questions.map((question, index) => {
    const correct = answersMatch(answers[index], question.correct);
    return { index, correct, explanation: question.explanation };
  });
  const score = explanations.filter((item) => item.correct).length;
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const day = new Date(now).toISOString().slice(0, 10);
  const shard = crypto.getRandomValues(new Uint8Array(1))[0] % SHARDS;
  const player = typeof body.playerId === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(body.playerId) ? body.playerId : null;
  await kv.put(`result:${id}`, JSON.stringify({ edition: body.edition, score, total: questions.length, player, at: now }));
  const counterKey = `count:${day}:${shard}`;
  const current = Number(await kv.get(counterKey) || "0");
  await kv.put(counterKey, String((Number.isSafeInteger(current) ? current : 0) + 1));
  return {
    id,
    edition: body.edition,
    editionName: regions[body.edition].name,
    score,
    total: questions.length,
    explanations,
  };
}
