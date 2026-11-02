import { advanceStreak, earnEntitlement, MIN_BOARD_MS, rankBoard, streakGrantId, type BoardRow, type DailyFinish, type DailyPlay, type DailyStreak } from "./daily.ts";
import type { PaidEntitlement } from "./repository.ts";

export type DailyApi = {
  start(input: { playerId: string; edition: string; day: string; roundId: string; at: number }): Promise<
    { status: "open"; startedAt: number; resumed: boolean } | { status: "finished"; score: number; durationMs: number; streak: number }
  >;
  finish(input: { playerId: string; edition: string; day: string; score: number; at: number }): Promise<DailyFinish>;
  status(playerId: string, day: string): Promise<DailyStreak>;
  setNickname(playerId: string, nickname: string, at: number): Promise<void>;
  nickname(playerId: string): Promise<string | null>;
  board(input: { edition: string; day: string; playerId: string }): Promise<{ top: BoardRow[]; rank: number | null; total: number }>;
};

export function createMemoryDaily(grant: (playerId: string, grantId: string, cowries: number, at: number) => void): DailyApi {
  const plays = new Map<string, DailyPlay>();
  const streaks = new Map<string, DailyStreak>();
  const names = new Map<string, string>();
  const grants = new Set<string>();
  const key = (playerId: string, edition: string, day: string) => `${playerId}|${edition}|${day}`;

  return {
    async start({ playerId, edition, day, roundId, at }) {
      const existing = plays.get(key(playerId, edition, day));
      const streak = streaks.get(playerId)?.streak ?? 0;
      if (existing?.finishedAt !== null && existing?.finishedAt !== undefined) {
        return { status: "finished", score: existing.score ?? 0, durationMs: existing.durationMs ?? 0, streak };
      }
      if (existing) return { status: "open", startedAt: existing.startedAt, resumed: true };
      plays.set(key(playerId, edition, day), {
        playerId, edition, day, roundId, score: null, durationMs: null, startedAt: at, finishedAt: null,
      });
      return { status: "open", startedAt: at, resumed: false };
    },
    async finish({ playerId, edition, day, score, at }) {
      const play = plays.get(key(playerId, edition, day));
      if (!play) throw new Error("missing");
      if (play.finishedAt !== null) {
        return { already: true, score: play.score ?? 0, durationMs: play.durationMs ?? 0, streak: streaks.get(playerId)?.streak ?? 0, bonus: 0, milestone: null };
      }
      const durationMs = Math.max(0, at - play.startedAt);
      play.score = score;
      play.durationMs = durationMs;
      play.finishedAt = at;
      const next = advanceStreak(streaks.get(playerId) ?? null, day);
      streaks.set(playerId, next.streak);
      let bonus = 0;
      let milestone: 3 | 7 | null = null;
      if (next.advanced && (next.streak.streak === 3 || next.streak.streak === 7) && durationMs >= MIN_BOARD_MS) {
        milestone = next.streak.streak;
        const grantId = streakGrantId(playerId, next.streak.startedDay || day, milestone);
        if (!grants.has(grantId)) {
          grants.add(grantId);
          grant(playerId, grantId, 1, at);
          bonus = 1;
        }
      }
      return { already: false, score, durationMs, streak: next.streak.streak, bonus, milestone: bonus ? milestone : null };
    },
    async status(playerId) {
      return streaks.get(playerId) ?? { streak: 0, lastDay: null, startedDay: null };
    },
    async setNickname(playerId, nickname) {
      names.set(playerId, nickname);
    },
    async nickname(playerId) {
      return names.get(playerId) ?? null;
    },
    async board({ edition, day, playerId }) {
      const rows = [...plays.values()]
        .filter((play) => play.edition === edition && play.day === day && play.finishedAt !== null && (play.durationMs ?? 0) >= MIN_BOARD_MS)
        .map((play) => ({ playerId: play.playerId, nickname: names.get(play.playerId) ?? null, score: play.score ?? 0, durationMs: play.durationMs ?? 0 }));
      return rankBoard(rows, playerId);
    },
  };
}

export function createD1Daily(database: D1Database): DailyApi {
  return {
    async start({ playerId, edition, day, roundId, at }) {
      await database.prepare(
        "INSERT INTO paid_daily_plays (player_id, edition, day, round_id, started_at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(player_id, edition, day) DO NOTHING",
      ).bind(playerId, edition, day, roundId, at).run();
      const row = await database.prepare(
        "SELECT started_at, finished_at, score, duration_ms FROM paid_daily_plays WHERE player_id=?1 AND edition=?2 AND day=?3",
      ).bind(playerId, edition, day).first<{ started_at: number; finished_at: number | null; score: number | null; duration_ms: number | null }>();
      if (!row) throw new Error("daily_play_missing");
      if (row.finished_at !== null) {
        const streak = await database.prepare("SELECT streak FROM paid_streaks WHERE player_id=?1").bind(playerId).first<{ streak: number }>();
        return { status: "finished", score: row.score ?? 0, durationMs: row.duration_ms ?? 0, streak: streak?.streak ?? 0 };
      }
      return { status: "open", startedAt: row.started_at, resumed: row.started_at !== at };
    },
    async finish({ playerId, edition, day, score, at }) {
      const open = await database.prepare(
        "SELECT started_at, finished_at, score, duration_ms FROM paid_daily_plays WHERE player_id=?1 AND edition=?2 AND day=?3",
      ).bind(playerId, edition, day).first<{ started_at: number; finished_at: number | null; score: number | null; duration_ms: number | null }>();
      if (!open) throw new Error("missing");
      if (open.finished_at !== null) {
        const streak = await database.prepare("SELECT streak FROM paid_streaks WHERE player_id=?1").bind(playerId).first<{ streak: number }>();
        return { already: true, score: open.score ?? 0, durationMs: open.duration_ms ?? 0, streak: streak?.streak ?? 0, bonus: 0, milestone: null };
      }
      const durationMs = Math.max(0, at - open.started_at);
      const updated = await database.prepare(
        "UPDATE paid_daily_plays SET score=?1, duration_ms=?2, finished_at=?3 WHERE player_id=?4 AND edition=?5 AND day=?6 AND finished_at IS NULL",
      ).bind(score, durationMs, at, playerId, edition, day).run();
      if ((updated.meta.changes ?? 0) < 1) {
        const streak = await database.prepare("SELECT streak FROM paid_streaks WHERE player_id=?1").bind(playerId).first<{ streak: number }>();
        const current = await database.prepare(
          "SELECT score, duration_ms FROM paid_daily_plays WHERE player_id=?1 AND edition=?2 AND day=?3",
        ).bind(playerId, edition, day).first<{ score: number | null; duration_ms: number | null }>();
        return { already: true, score: current?.score ?? score, durationMs: current?.duration_ms ?? durationMs, streak: streak?.streak ?? 0, bonus: 0, milestone: null };
      }
      const prior = await database.prepare("SELECT streak, last_day, started_day FROM paid_streaks WHERE player_id=?1").bind(playerId).first<{ streak: number; last_day: string | null; started_day: string | null }>();
      const next = advanceStreak(prior ? { streak: prior.streak, lastDay: prior.last_day, startedDay: prior.started_day } : null, day);
      await database.prepare(
        "INSERT INTO paid_streaks (player_id, streak, last_day, started_day) VALUES (?1,?2,?3,?4) ON CONFLICT(player_id) DO UPDATE SET streak=?2, last_day=?3, started_day=?4",
      ).bind(playerId, next.streak.streak, next.streak.lastDay, next.streak.startedDay).run();
      let bonus = 0;
      let milestone: 3 | 7 | null = null;
      if (next.advanced && (next.streak.streak === 3 || next.streak.streak === 7) && durationMs >= MIN_BOARD_MS) {
        milestone = next.streak.streak;
        const grantId = streakGrantId(playerId, next.streak.startedDay || day, milestone);
        const inserted = await database.prepare(
          "INSERT INTO paid_streak_grants (grant_id, player_id, milestone, day, cowries, created_at) VALUES (?1,?2,?3,?4,1,?5) ON CONFLICT(grant_id) DO NOTHING",
        ).bind(grantId, playerId, milestone, day, at).run();
        if ((inserted.meta.changes ?? 0) > 0) {
          const entitlement: PaidEntitlement = earnEntitlement(playerId, grantId, 1, at);
          await database.prepare(
            "INSERT INTO paid_entitlements (id, order_id, player_id, product_key, quantity, remaining, state, created_at, updated_at) VALUES (?1,?2,?3,'cowrie_earn_v1',1,1,'active',?4,?4)",
          ).bind(entitlement.id, entitlement.orderId, playerId, at).run();
          bonus = 1;
        }
      }
      return { already: false, score, durationMs, streak: next.streak.streak, bonus, milestone: bonus ? milestone : null };
    },
    async status(playerId) {
      const row = await database.prepare("SELECT streak, last_day, started_day FROM paid_streaks WHERE player_id=?1").bind(playerId).first<{ streak: number; last_day: string | null; started_day: string | null }>();
      return row ? { streak: row.streak, lastDay: row.last_day, startedDay: row.started_day } : { streak: 0, lastDay: null, startedDay: null };
    },
    async setNickname(playerId, nickname, at) {
      await database.prepare(
        "INSERT INTO paid_nicknames (player_id, nickname, updated_at) VALUES (?1,?2,?3) ON CONFLICT(player_id) DO UPDATE SET nickname=?2, updated_at=?3",
      ).bind(playerId, nickname, at).run();
    },
    async nickname(playerId) {
      const row = await database.prepare("SELECT nickname FROM paid_nicknames WHERE player_id=?1").bind(playerId).first<{ nickname: string }>();
      return row?.nickname ?? null;
    },
    async board({ edition, day, playerId }) {
      const rows = await database.prepare(
        `SELECT p.player_id, p.score, p.duration_ms, n.nickname
         FROM paid_daily_plays p LEFT JOIN paid_nicknames n ON n.player_id = p.player_id
         WHERE p.edition=?1 AND p.day=?2 AND p.finished_at IS NOT NULL AND p.duration_ms >= ?3`,
      ).bind(edition, day, MIN_BOARD_MS).all<{ player_id: string; score: number; duration_ms: number; nickname: string | null }>();
      return rankBoard(rows.results.map((row) => ({
        playerId: row.player_id, nickname: row.nickname, score: row.score, durationMs: row.duration_ms,
      })), playerId);
    },
  };
}
