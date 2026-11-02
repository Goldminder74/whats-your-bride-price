import type { Question, RegionKey } from "../app/gameData.ts";
import { loadEligible } from "./loader.ts";
import { selectRound } from "./select.ts";
import { RECENT_KEEP, type PlayQuestion } from "./types.ts";

export type SavedRound = {
  questions: Question[];
  index: number;
  answers: number[];
};

const roundKey = (region: RegionKey) => `wybp-round:${region}`;
const recentKey = (region: RegionKey) => `wybp-recent:${region}`;

function toQuestion(question: PlayQuestion): Question {
  return {
    id: question.id,
    kind: question.kind,
    prompt: question.prompt,
    options: [...question.options],
    correct: [...question.correct],
    explanation: question.explanation,
    topic: question.topic,
    visualStart: question.visualStart,
  };
}

function readRecent(region: RegionKey): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentKey(region)) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function readSavedRound(region: RegionKey): SavedRound | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(roundKey(region)) || "null") as SavedRound | null;
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length !== 12) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSavedRound(region: RegionKey, round: SavedRound): void {
  sessionStorage.setItem(roundKey(region), JSON.stringify(round));
}

export function finishRound(region: RegionKey): void {
  sessionStorage.removeItem(roundKey(region));
}

export async function playRandomRound(region: RegionKey): Promise<SavedRound & { resumed: boolean }> {
  const saved = readSavedRound(region);
  if (saved) return { ...saved, resumed: true };
  const pool = await loadEligible(region);
  const recent = readRecent(region);
  const round = selectRound({ pool, region, recentIds: recent });
  const questions = round.questions.map(toQuestion);
  const ids = questions.map((question) => question.id);
  const nextRecent = [...ids, ...recent.filter((id) => !ids.includes(id))].slice(0, RECENT_KEEP);
  localStorage.setItem(recentKey(region), JSON.stringify(nextRecent));
  const fresh: SavedRound = { questions, index: 0, answers: [] };
  writeSavedRound(region, fresh);
  return { ...fresh, resumed: false };
}
