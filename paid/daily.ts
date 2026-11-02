import type { PaidEntitlement } from "./repository.ts";

export const MIN_BOARD_MS = 8_000;
export const DAILY_RATE_LIMIT = 30;
export const STREAK_MILESTONES = [3, 7] as const;

export type DailyPlay = {
  playerId: string;
  edition: string;
  day: string;
  roundId: string;
  score: number | null;
  durationMs: number | null;
  startedAt: number;
  finishedAt: number | null;
};

export type DailyStreak = { streak: number; lastDay: string | null; startedDay: string | null };

export type DailyFinish = {
  already: boolean;
  score: number;
  durationMs: number;
  streak: number;
  bonus: number;
  milestone: 3 | 7 | null;
};

export type BoardRow = { nickname: string; score: number; durationMs: number; you: boolean };

const GUEST_TITLES = [
  "Cowrie Seeker",
  "Kente Walker",
  "Gold Weaver",
  "Baobab Guest",
  "Drum Keeper",
  "Market Poet",
  "Coral Diver",
  "Sahel Story",
  "Indigo Hand",
  "Palm Keeper",
] as const;

/** Stable public name for a board row that has no chosen nickname. It does not contain the player id. */
export function guestNickname(playerId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < playerId.length; index += 1) {
    hash ^= playerId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const mixed = hash >>> 0;
  return `${GUEST_TITLES[mixed % GUEST_TITLES.length]} ${String(mixed % 1000).padStart(3, "0")}`;
}

export function previousUtcDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date) - 86_400_000).toISOString().slice(0, 10);
}

export function countdownToNextUtcDay(at: number): number {
  const now = new Date(at);
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(0, next - at);
}

export function advanceStreak(current: DailyStreak | null, day: string): { streak: DailyStreak; advanced: boolean } {
  if (current?.lastDay === day) return { streak: current, advanced: false };
  if (current?.lastDay === previousUtcDay(day)) {
    return { streak: { streak: current.streak + 1, lastDay: day, startedDay: current.startedDay }, advanced: true };
  }
  return { streak: { streak: 1, lastDay: day, startedDay: day }, advanced: true };
}

export function rankBoard(rows: readonly { playerId: string; nickname: string | null; score: number; durationMs: number }[], playerId: string): {
  top: BoardRow[];
  rank: number | null;
  total: number;
} {
  const ordered = [...rows].sort((left, right) => right.score - left.score || left.durationMs - right.durationMs || left.playerId.localeCompare(right.playerId));
  const mine = ordered.findIndex((row) => row.playerId === playerId);
  return {
    top: ordered.slice(0, 20).map((row) => ({
      nickname: row.nickname || guestNickname(row.playerId),
      score: row.score,
      durationMs: row.durationMs,
      you: row.playerId === playerId,
    })),
    rank: mine === -1 ? null : mine + 1,
    total: ordered.length,
  };
}

export function streakGrantId(playerId: string, startedDay: string, milestone: number): string {
  return `streak:${playerId}:${startedDay}:${milestone}`;
}

export function earnEntitlement(playerId: string, grantId: string, cowries: number, at: number): PaidEntitlement {
  return {
    id: `earn_${grantId}`,
    orderId: `earn_${grantId}`,
    playerId,
    productKey: "cowrie_earn_v1",
    quantity: cowries,
    remaining: cowries,
    state: "active",
    expiresAt: null,
    createdAt: at,
    updatedAt: at,
  };
}
