import type { BankQuestion, PlayQuestion } from "../question-bank/types.ts";
import { mulberry32, toPlayQuestion } from "../question-bank/select.ts";
import { answersMatch } from "../app/gameLogic.ts";
import {
  BOOSTER_COST,
  FREEZE_COST,
  FREEZE_MAX,
  boosterUseId,
  fiftyRemove,
  isBoosterKind,
  neutralHint,
  type BoosterKind,
  type LedgerKind,
} from "./boosters.ts";
import { FRAME_STYLES, isFrameKey, type FrameKey } from "./frameStyle.ts";

export type SpendResult = { cowries: number } | null;

export type BoosterUseRecord = {
  useId: string;
  playerId: string;
  roundId: string;
  roundKind: "game" | "daily";
  kind: BoosterKind;
  edition: string;
  questionIndex: number;
  questionId: string;
  replacement: PlayQuestion | null;
  cowries: number;
  createdAt: number;
};

export type BoosterUseInput = {
  playerId: string;
  roundId: string;
  roundKind: "game" | "daily";
  edition: string;
  kind: BoosterKind;
  questionIndex: number;
  questions: PlayQuestion[];
  pool: readonly BankQuestion[];
  answer?: number[];
  at: number;
};

export type BoosterUseOutcome = {
  already: boolean;
  kind: BoosterKind;
  charged: number;
  ledgerKind: LedgerKind;
  balance: number;
  remove?: number[];
  hint?: string;
  question?: PlayQuestion;
  retry?: boolean;
};

export type BoosterApi = {
  held(playerId: string): Promise<number>;
  setHeld(playerId: string, held: number, at: number): Promise<void>;
  frames(playerId: string): Promise<FrameKey[]>;
  ownsFrame(playerId: string, frame: FrameKey): Promise<boolean>;
  roundBoosted(playerId: string, roundId: string): Promise<boolean>;
  used(playerId: string, roundId: string): Promise<Record<BoosterKind, boolean>>;
  overlay(playerId: string, roundId: string, questions: PlayQuestion[]): Promise<PlayQuestion[]>;
  use(input: BoosterUseInput): Promise<BoosterUseOutcome | "short" | "repeat_kind" | "unavailable" | "not_wrong">;
  buyFreeze(input: { playerId: string; requestId: string; at: number }): Promise<{ already: boolean; held: number; balance: number; charged: number; ledgerKind: LedgerKind } | "short" | "full">;
  buyFrame(input: { playerId: string; frame: FrameKey; requestId: string; at: number }): Promise<{ already: boolean; frame: FrameKey; balance: number; charged: number; ledgerKind: LedgerKind } | "short">;
};

type Spend = (playerId: string, count: number, at: number) => Promise<SpendResult>;
type Balance = (playerId: string, at: number) => Promise<number>;

function slotKey(playerId: string, roundId: string, slot: number): string {
  return `${playerId}|${roundId}|${slot}`;
}

function pickReplacement(pool: readonly BankQuestion[], edition: string, taken: Set<string>, seed: string): PlayQuestion | null {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const rng = mulberry32(hash >>> 0);
  const fresh = pool.filter((question) => question.region === edition && !taken.has(question.id) && question.lifecycleStatus !== "held");
  if (fresh.length < 1) return null;
  const index = Math.floor(rng() * fresh.length);
  return toPlayQuestion(fresh[index] ?? fresh[0]);
}

function applyUse(question: PlayQuestion, kind: BoosterKind, replacement: PlayQuestion | null): Pick<BoosterUseOutcome, "remove" | "hint" | "question" | "retry"> {
  if (kind === "fifty") return { remove: fiftyRemove(question) ?? [] };
  if (kind === "hint") return { hint: neutralHint(question) ?? "" };
  if (kind === "skip" && replacement) return { question: replacement };
  return { retry: true };
}

export function createMemoryBoosters(spend: Spend, balanceOf: Balance): BoosterApi {
  const uses = new Map<string, BoosterUseRecord>();
  const slots = new Map<string, PlayQuestion>();
  const freezes = new Map<string, number>();
  const frames = new Map<string, Set<FrameKey>>();
  const ledger = new Set<string>();

  function remember(playerId: string, roundId: string): BoosterUseRecord[] {
    return [...uses.values()].filter((row) => row.playerId === playerId && row.roundId === roundId);
  }

  return {
    async held(playerId) {
      return freezes.get(playerId) ?? 0;
    },
    async setHeld(playerId, held) {
      freezes.set(playerId, Math.max(0, Math.min(FREEZE_MAX, held)));
    },
    async frames(playerId) {
      return [...(frames.get(playerId) ?? [])];
    },
    async ownsFrame(playerId, frame) {
      return frames.get(playerId)?.has(frame) === true;
    },
    async roundBoosted(playerId, roundId) {
      return remember(playerId, roundId).length > 0;
    },
    async used(playerId, roundId) {
      const kinds = { fifty: false, hint: false, skip: false, second: false };
      for (const row of remember(playerId, roundId)) kinds[row.kind] = true;
      return kinds;
    },
    async overlay(playerId, roundId, questions) {
      return questions.map((question, index) => slots.get(slotKey(playerId, roundId, index)) ?? question);
    },
    async use(input) {
      const question = input.questions[input.questionIndex];
      if (!question || !isBoosterKind(input.kind)) return "unavailable";
      const useId = boosterUseId(input.playerId, input.roundId, input.kind);
      const existing = uses.get(useId);
      if (existing) {
        return {
          already: true,
          kind: input.kind,
          charged: 0,
          ledgerKind: "cowrie_spend_booster_v1",
          balance: await balanceOf(input.playerId, input.at),
          ...applyUse(input.kind === "skip" && existing.replacement ? existing.replacement : question, input.kind, existing.replacement),
        };
      }
      if (remember(input.playerId, input.roundId).some((row) => row.kind === input.kind)) return "repeat_kind";
      let replacement: PlayQuestion | null = null;
      if (input.kind === "fifty" && !fiftyRemove(question)) return "unavailable";
      if (input.kind === "hint" && !neutralHint(question)) return "unavailable";
      if (input.kind === "second") {
        if (!input.answer || answersMatch(input.answer, question.correct)) return "not_wrong";
      }
      if (input.kind === "skip") {
        const taken = new Set(input.questions.map((item) => item.id));
        replacement = pickReplacement(input.pool, input.edition, taken, useId);
        if (!replacement) return "unavailable";
      }
      const cost = BOOSTER_COST[input.kind];
      const paid = await spend(input.playerId, cost, input.at);
      if (!paid) return "short";
      uses.set(useId, {
        useId,
        playerId: input.playerId,
        roundId: input.roundId,
        roundKind: input.roundKind,
        kind: input.kind,
        edition: input.edition,
        questionIndex: input.questionIndex,
        questionId: question.id,
        replacement,
        cowries: cost,
        createdAt: input.at,
      });
      if (replacement) slots.set(slotKey(input.playerId, input.roundId, input.questionIndex), replacement);
      ledger.add(useId);
      return {
        already: false,
        kind: input.kind,
        charged: cost,
        ledgerKind: "cowrie_spend_booster_v1",
        balance: paid.cowries,
        ...applyUse(input.kind === "skip" && replacement ? replacement : question, input.kind, replacement),
      };
    },
    async buyFreeze({ playerId, requestId, at }) {
      if (ledger.has(requestId)) {
        return { already: true, held: freezes.get(playerId) ?? 0, balance: await balanceOf(playerId, at), charged: 0, ledgerKind: "cowrie_spend_freeze_v1" };
      }
      const held = freezes.get(playerId) ?? 0;
      if (held >= FREEZE_MAX) return "full";
      const paid = await spend(playerId, FREEZE_COST, at);
      if (!paid) return "short";
      freezes.set(playerId, held + 1);
      ledger.add(requestId);
      return { already: false, held: held + 1, balance: paid.cowries, charged: FREEZE_COST, ledgerKind: "cowrie_spend_freeze_v1" };
    },
    async buyFrame({ playerId, frame, requestId, at }) {
      const owned = frames.get(playerId) ?? new Set<FrameKey>();
      if (owned.has(frame) || ledger.has(requestId)) {
        owned.add(frame);
        frames.set(playerId, owned);
        return { already: true, frame, balance: await balanceOf(playerId, at), charged: 0, ledgerKind: "cowrie_spend_frame_v1" };
      }
      const cost = FRAME_STYLES[frame].cowries;
      const paid = await spend(playerId, cost, at);
      if (!paid) return "short";
      owned.add(frame);
      frames.set(playerId, owned);
      ledger.add(requestId);
      return { already: false, frame, balance: paid.cowries, charged: cost, ledgerKind: "cowrie_spend_frame_v1" };
    },
  };
}

export function createD1Boosters(database: D1Database, spend: Spend, balanceOf: Balance): BoosterApi {
  return {
    async held(playerId) {
      const row = await database.prepare("SELECT held FROM paid_streak_freezes WHERE player_id=?1").bind(playerId).first<{ held: number }>();
      return row?.held ?? 0;
    },
    async setHeld(playerId, held, at) {
      const next = Math.max(0, Math.min(FREEZE_MAX, held));
      await database.prepare(
        "INSERT INTO paid_streak_freezes (player_id, held, updated_at) VALUES (?1,?2,?3) ON CONFLICT(player_id) DO UPDATE SET held=?2, updated_at=?3",
      ).bind(playerId, next, at).run();
    },
    async frames(playerId) {
      const rows = await database.prepare("SELECT frame_key FROM paid_frame_grants WHERE player_id=?1").bind(playerId).all<{ frame_key: string }>();
      return rows.results.map((row) => row.frame_key).filter(isFrameKey);
    },
    async ownsFrame(playerId, frame) {
      const row = await database.prepare("SELECT grant_id FROM paid_frame_grants WHERE player_id=?1 AND frame_key=?2").bind(playerId, frame).first();
      return Boolean(row);
    },
    async roundBoosted(playerId, roundId) {
      const row = await database.prepare("SELECT use_id FROM paid_booster_uses WHERE player_id=?1 AND round_id=?2 LIMIT 1").bind(playerId, roundId).first();
      return Boolean(row);
    },
    async used(playerId, roundId) {
      const rows = await database.prepare("SELECT kind FROM paid_booster_uses WHERE player_id=?1 AND round_id=?2").bind(playerId, roundId).all<{ kind: BoosterKind }>();
      const kinds = { fifty: false, hint: false, skip: false, second: false };
      for (const row of rows.results) if (isBoosterKind(row.kind)) kinds[row.kind] = true;
      return kinds;
    },
    async overlay(playerId, roundId, questions) {
      const rows = await database.prepare("SELECT slot, question_json FROM paid_round_slots WHERE player_id=?1 AND round_id=?2").bind(playerId, roundId).all<{ slot: number; question_json: string }>();
      const bySlot = new Map(rows.results.map((row) => [row.slot, JSON.parse(row.question_json) as PlayQuestion]));
      return questions.map((question, index) => bySlot.get(index) ?? question);
    },
    async use(input) {
      const question = input.questions[input.questionIndex];
      if (!question) return "unavailable";
      const useId = boosterUseId(input.playerId, input.roundId, input.kind);
      const existing = await database.prepare("SELECT replacement_json FROM paid_booster_uses WHERE use_id=?1").bind(useId).first<{ replacement_json: string | null }>();
      if (existing) {
        const replacement = existing.replacement_json ? JSON.parse(existing.replacement_json) as PlayQuestion : null;
        return {
          already: true,
          kind: input.kind,
          charged: 0,
          ledgerKind: "cowrie_spend_booster_v1" as const,
          balance: await balanceOf(input.playerId, input.at),
          ...applyUse(input.kind === "skip" && replacement ? replacement : question, input.kind, replacement),
        };
      }
      let replacement: PlayQuestion | null = null;
      if (input.kind === "fifty" && !fiftyRemove(question)) return "unavailable";
      if (input.kind === "hint" && !neutralHint(question)) return "unavailable";
      if (input.kind === "second" && (!input.answer || answersMatch(input.answer, question.correct))) return "not_wrong";
      if (input.kind === "skip") {
        const taken = new Set(input.questions.map((item) => item.id));
        replacement = pickReplacement(input.pool, input.edition, taken, useId);
        if (!replacement) return "unavailable";
      }
      const cost = BOOSTER_COST[input.kind];
      const paid = await spend(input.playerId, cost, input.at);
      if (!paid) return "short";
      await database.prepare(
        "INSERT INTO paid_booster_uses (use_id, player_id, round_id, round_kind, kind, edition, question_index, question_id, replacement_json, cowries, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
      ).bind(useId, input.playerId, input.roundId, input.roundKind, input.kind, input.edition, input.questionIndex, question.id, replacement ? JSON.stringify(replacement) : null, cost, input.at).run();
      await database.prepare(
        "INSERT INTO paid_cowrie_ledger (id, player_id, kind, ref_id, cowries, created_at) VALUES (?1,?2,'cowrie_spend_booster_v1',?3,?4,?5)",
      ).bind(`ledger_${useId}`, input.playerId, useId, cost, input.at).run();
      if (replacement) {
        await database.prepare(
          "INSERT INTO paid_round_slots (player_id, round_id, slot, question_json) VALUES (?1,?2,?3,?4) ON CONFLICT(player_id, round_id, slot) DO UPDATE SET question_json=?4",
        ).bind(input.playerId, input.roundId, input.questionIndex, JSON.stringify(replacement)).run();
      }
      return {
        already: false,
        kind: input.kind,
        charged: cost,
        ledgerKind: "cowrie_spend_booster_v1",
        balance: paid.cowries,
        ...applyUse(input.kind === "skip" && replacement ? replacement : question, input.kind, replacement),
      };
    },
    async buyFreeze({ playerId, requestId, at }) {
      const prior = await database.prepare("SELECT id FROM paid_cowrie_ledger WHERE ref_id=?1").bind(requestId).first();
      const heldRow = await database.prepare("SELECT held FROM paid_streak_freezes WHERE player_id=?1").bind(playerId).first<{ held: number }>();
      const held = heldRow?.held ?? 0;
      if (prior) {
        return { already: true, held, balance: await balanceOf(playerId, at), charged: 0, ledgerKind: "cowrie_spend_freeze_v1" };
      }
      if (held >= FREEZE_MAX) return "full";
      const paid = await spend(playerId, FREEZE_COST, at);
      if (!paid) return "short";
      await database.prepare(
        "INSERT INTO paid_streak_freezes (player_id, held, updated_at) VALUES (?1,?2,?3) ON CONFLICT(player_id) DO UPDATE SET held=?2, updated_at=?3",
      ).bind(playerId, held + 1, at).run();
      await database.prepare(
        "INSERT INTO paid_cowrie_ledger (id, player_id, kind, ref_id, cowries, created_at) VALUES (?1,?2,'cowrie_spend_freeze_v1',?3,?4,?5)",
      ).bind(`ledger_${requestId}`, playerId, requestId, FREEZE_COST, at).run();
      return { already: false, held: held + 1, balance: paid.cowries, charged: FREEZE_COST, ledgerKind: "cowrie_spend_freeze_v1" };
    },
    async buyFrame({ playerId, frame, requestId, at }) {
      const owned = await database.prepare("SELECT grant_id FROM paid_frame_grants WHERE player_id=?1 AND frame_key=?2").bind(playerId, frame).first();
      const prior = await database.prepare("SELECT id FROM paid_cowrie_ledger WHERE ref_id=?1").bind(requestId).first();
      if (owned || prior) {
        return { already: true, frame, balance: await balanceOf(playerId, at), charged: 0, ledgerKind: "cowrie_spend_frame_v1" };
      }
      const cost = FRAME_STYLES[frame].cowries;
      const paid = await spend(playerId, cost, at);
      if (!paid) return "short";
      await database.prepare(
        "INSERT INTO paid_frame_grants (grant_id, player_id, frame_key, cowries, created_at) VALUES (?1,?2,?3,?4,?5)",
      ).bind(requestId, playerId, frame, cost, at).run();
      await database.prepare(
        "INSERT INTO paid_cowrie_ledger (id, player_id, kind, ref_id, cowries, created_at) VALUES (?1,?2,'cowrie_spend_frame_v1',?3,?4,?5)",
      ).bind(`ledger_${requestId}`, playerId, requestId, cost, at).run();
      return { already: false, frame, balance: paid.cowries, charged: cost, ledgerKind: "cowrie_spend_frame_v1" };
    },
  };
}
