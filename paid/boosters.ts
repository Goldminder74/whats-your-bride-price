import type { PlayQuestion } from "../question-bank/types.ts";
import type { DailyStreak } from "./daily.ts";
import { previousUtcDay } from "./daily.ts";
import { FRAME_STYLES, type FrameKey } from "./frameStyle.ts";

export const BOOSTER_RATE_LIMIT = 20;
export const FREEZE_COST = 2;
export const FREEZE_MAX = 2;

export const BOOSTER_COST = Object.freeze({
  fifty: 1,
  hint: 1,
  skip: 2,
  second: 3,
});

export type BoosterKind = keyof typeof BOOSTER_COST;
export type LedgerKind = "cowrie_spend_booster_v1" | "cowrie_spend_freeze_v1" | "cowrie_spend_frame_v1";

export function isBoosterKind(value: unknown): value is BoosterKind {
  return value === "fifty" || value === "hint" || value === "skip" || value === "second";
}

export function boosterUseId(playerId: string, roundId: string, kind: BoosterKind): string {
  return `${playerId}:${roundId}:${kind}`;
}

export function missedUtcDays(lastDay: string, day: string): number {
  const last = Date.parse(`${lastDay}T00:00:00.000Z`);
  const next = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(last) || !Number.isFinite(next)) return 0;
  return Math.max(0, Math.round((next - last) / 86_400_000) - 1);
}

/** One freeze covers one missed UTC day. A gap larger than the held freezes resets the streak and keeps the freezes. */
export function streakWithFreeze(current: DailyStreak | null, day: string, held: number): {
  streak: DailyStreak;
  advanced: boolean;
  freezesUsed: number;
  freezeHeld: number;
} {
  const safeHeld = Math.max(0, Math.min(FREEZE_MAX, held));
  if (current?.lastDay === day) return { streak: current, advanced: false, freezesUsed: 0, freezeHeld: safeHeld };
  if (!current?.lastDay || current.lastDay === previousUtcDay(day)) {
    const streak = current?.lastDay === previousUtcDay(day)
      ? { streak: current.streak + 1, lastDay: day, startedDay: current.startedDay }
      : { streak: 1, lastDay: day, startedDay: day };
    return { streak, advanced: true, freezesUsed: 0, freezeHeld: safeHeld };
  }
  const missed = missedUtcDays(current.lastDay, day);
  if (missed > 0 && missed <= safeHeld) {
    return {
      streak: { streak: current.streak + 1, lastDay: day, startedDay: current.startedDay },
      advanced: true,
      freezesUsed: missed,
      freezeHeld: safeHeld - missed,
    };
  }
  return { streak: { streak: 1, lastDay: day, startedDay: day }, advanced: true, freezesUsed: 0, freezeHeld: safeHeld };
}

export function fiftyRemove(question: PlayQuestion): number[] | null {
  const correct = new Set(question.correct);
  const wrong = question.options.map((_, index) => index).filter((index) => !correct.has(index));
  if (wrong.length < 2) return null;
  return wrong.slice(0, 2);
}

/** A short clue that does not name an option. Empty explanations are not offered. */
export function neutralHint(question: Pick<PlayQuestion, "explanation" | "options">): string | null {
  const text = question.explanation.replace(/\s+/g, " ").trim();
  if (text.length < 24) return null;
  const sentence = text.split(/(?<=[.!?])\s/)[0] || text;
  let clue = sentence;
  for (const option of [...question.options].sort((left, right) => right.length - left.length)) {
    if (option.trim().length < 4) continue;
    clue = clue.replace(new RegExp(option.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "this");
  }
  clue = clue.replace(/\s+/g, " ").trim();
  if (clue.length < 24) return null;
  if (clue.length > 90) clue = `${clue.slice(0, 87).trim()}...`;
  return clue;
}

export function frameCatalog(): { key: FrameKey; name: string; cowries: number }[] {
  return (Object.keys(FRAME_STYLES) as FrameKey[]).map((key) => ({ key, name: FRAME_STYLES[key].name, cowries: FRAME_STYLES[key].cowries }));
}
