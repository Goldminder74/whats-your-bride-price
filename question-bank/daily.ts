import type { RegionKey } from "../app/gameData.ts";
import { mulberry32, selectRound } from "./select.ts";
import type { BankQuestion, PlayQuestion } from "./types.ts";

export function dailySeed(day: string, region: string): number {
  let hash = 2166136261;
  const text = `${day}:${region}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** One fixed 12-question set for a region and UTC day. The seed is the only source of randomness. */
export function selectDailyRound(pool: readonly BankQuestion[], region: RegionKey, day: string): { questions: PlayQuestion[] } {
  const selected = selectRound({ pool, region, recentIds: [], rng: mulberry32(dailySeed(day, region)) });
  return { questions: selected.questions };
}
