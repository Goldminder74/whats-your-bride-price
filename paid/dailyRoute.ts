import type { RegionKey } from "../app/gameData.ts";
import { answersMatch } from "../app/gameLogic.ts";
import { selectDailyRound } from "../question-bank/daily.ts";
import { loadEligible } from "../question-bank/loader.ts";
import type { PlayQuestion } from "../question-bank/types.ts";
import { countdownToNextUtcDay, DAILY_RATE_LIMIT } from "./daily.ts";
import { earnDay } from "./earn.ts";
import { PaidError } from "./errors.ts";
import { isEdition, type KvStore } from "./games.ts";
import { validateNickname } from "./nickname.ts";
import type { PaidServices } from "./serve.ts";

const PLAYER_ID = /^[A-Za-z0-9_-]{16,64}$/;
const ROUND_KEY = (day: string, edition: string) => `daily-round:v1:${day}:${edition}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function sameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin !== new URL(request.url).origin) throw new PaidError("origin_rejected", 403);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 20_000) throw new PaidError("body_too_large", 413);
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    return parsed as Record<string, unknown>;
  } catch {
    throw new PaidError("json_invalid", 400);
  }
}

function requireDaily(services: PaidServices): void {
  if (!services.dailyChallenge) throw new PaidError("daily_disabled", 404);
}

function playerId(value: unknown): string {
  if (typeof value !== "string" || !PLAYER_ID.test(value)) throw new PaidError("player_invalid", 400);
  return value;
}

async function rateLimit(kv: KvStore, player: string, at: number): Promise<void> {
  const key = `daily-rl:${player}:${Math.floor(at / 60_000)}`;
  const current = Number(await kv.get(key) || "0");
  if (Number.isFinite(current) && current >= DAILY_RATE_LIMIT) throw new PaidError("rate_limited", 429);
  await kv.put(key, String((Number.isFinite(current) ? current : 0) + 1));
}

async function dailyRound(services: PaidServices, edition: RegionKey, day: string): Promise<{ id: string; questions: PlayQuestion[] }> {
  const key = ROUND_KEY(day, edition);
  const existing = await services.kv.get(key);
  if (existing) {
    const stored = JSON.parse(existing) as { id: string; questions: PlayQuestion[] };
    if (stored?.id && Array.isArray(stored.questions) && stored.questions.length === 12) return stored;
  }
  const pool = await loadEligible(edition);
  const round = selectDailyRound(pool, edition, day);
  const stored = { id: `daily${day.replaceAll("-", "")}${edition}`, questions: round.questions };
  await services.kv.put(key, JSON.stringify(stored));
  return stored;
}

function parseAnswers(value: unknown): number[][] {
  if (!Array.isArray(value) || value.length !== 12) throw new PaidError("answers_incomplete", 400);
  return value.map((answer) => {
    if (!Array.isArray(answer) || answer.length < 1 || answer.length > 8) throw new PaidError("answers_invalid", 400);
    return answer.map((choice) => {
      if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice > 20) throw new PaidError("answers_invalid", 400);
      return choice;
    });
  });
}

export async function handleDailyStatus(url: URL, services: PaidServices): Promise<Response> {
  requireDaily(services);
  const player = playerId(url.searchParams.get("player"));
  const edition = url.searchParams.get("edition");
  if (!isEdition(edition)) throw new PaidError("edition_invalid", 400);
  await rateLimit(services.kv, player, services.now());
  const day = earnDay(services.now());
  const streak = await services.repository.daily.status(player, day);
  return json({
    day,
    countdownMs: countdownToNextUtcDay(services.now()),
    streak: streak.streak,
    lastDay: streak.lastDay,
    edition,
  });
}

export async function handleDailyBegin(request: Request, services: PaidServices): Promise<Response> {
  sameOrigin(request);
  requireDaily(services);
  await services.ensureSchema?.();
  const body = await readJson(request);
  const player = playerId(body.playerId);
  if (!isEdition(body.edition)) throw new PaidError("edition_invalid", 400);
  await rateLimit(services.kv, player, services.now());
  if (body.nickname !== undefined) await services.repository.daily.setNickname(player, validateNickname(body.nickname), services.now());
  const day = earnDay(services.now());
  const round = await dailyRound(services, body.edition, day);
  const started = await services.repository.daily.start({ playerId: player, edition: body.edition, day, roundId: round.id, at: services.now() });
  const streak = await services.repository.daily.status(player, day);
  return json({
    ...started,
    day,
    roundId: round.id,
    countdownMs: countdownToNextUtcDay(services.now()),
    streak: started.status === "finished" ? started.streak : streak.streak,
    questions: round.questions,
  });
}

export async function handleDailyFinish(request: Request, services: PaidServices): Promise<Response> {
  sameOrigin(request);
  requireDaily(services);
  await services.ensureSchema?.();
  const body = await readJson(request);
  const player = playerId(body.playerId);
  if (!isEdition(body.edition)) throw new PaidError("edition_invalid", 400);
  await rateLimit(services.kv, player, services.now());
  const day = earnDay(services.now());
  const round = await dailyRound(services, body.edition, day);
  const answers = parseAnswers(body.answers);
  const score = answers.reduce((sum, answer, index) => sum + (answersMatch(answer, round.questions[index].correct) ? 1 : 0), 0);
  let result;
  try {
    result = await services.repository.daily.finish({ playerId: player, edition: body.edition, day, score, at: services.now() });
  } catch (error) {
    if (error instanceof Error && error.message === "missing") throw new PaidError("daily_not_started", 404);
    throw error;
  }
  if (!result.already) await services.repository.recordStat("daily_play", body.edition, services.now());
  if (result.bonus > 0) await services.repository.recordStat("streak_bonus", String(result.milestone), services.now());
  const nickname = await services.repository.daily.nickname(player);
  return json({ ...result, day, countdownMs: countdownToNextUtcDay(services.now()), roundId: round.id, nickname });
}

export async function handleDailyBoard(url: URL, services: PaidServices): Promise<Response> {
  requireDaily(services);
  const player = playerId(url.searchParams.get("player"));
  const edition = url.searchParams.get("edition");
  if (!isEdition(edition)) throw new PaidError("edition_invalid", 400);
  await rateLimit(services.kv, player, services.now());
  await services.repository.recordStat("leaderboard_views", edition, services.now());
  const day = earnDay(services.now());
  const board = await services.repository.daily.board({ edition, day, playerId: player });
  return json({ day, countdownMs: countdownToNextUtcDay(services.now()), ...board });
}

export async function handleDailyNickname(request: Request, services: PaidServices): Promise<Response> {
  sameOrigin(request);
  requireDaily(services);
  await services.ensureSchema?.();
  const body = await readJson(request);
  const player = playerId(body.playerId);
  await rateLimit(services.kv, player, services.now());
  const nickname = validateNickname(body.nickname);
  await services.repository.daily.setNickname(player, nickname, services.now());
  return json({ nickname });
}
