import type { RegionKey } from "../app/gameData.ts";
import { loadEligible } from "../question-bank/loader.ts";
import { readRound } from "../question-bank/scoreRound.ts";
import type { PlayQuestion } from "../question-bank/types.ts";
import {
  BOOSTER_COST,
  BOOSTER_RATE_LIMIT,
  FREEZE_COST,
  FREEZE_MAX,
  fiftyRemove,
  frameCatalog,
  isBoosterKind,
  neutralHint,
  type BoosterKind,
} from "./boosters.ts";
import { earnDay } from "./earn.ts";
import { PaidError } from "./errors.ts";
import { isFrameKey } from "./frameStyle.ts";
import { isEdition, type KvStore } from "./games.ts";
import type { PaidServices } from "./serve.ts";

const PLAYER_ID = /^[A-Za-z0-9_-]{16,64}$/;
const ROUND_ID = /^[A-Za-z0-9_-]{8,80}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function requireBoosters(services: PaidServices): void {
  if (!services.boosters) throw new PaidError("boosters_disabled", 404);
}

function playerId(value: unknown): string {
  if (typeof value !== "string" || !PLAYER_ID.test(value)) throw new PaidError("player_invalid", 400);
  return value;
}

async function rateLimit(kv: KvStore, player: string, at: number): Promise<void> {
  const key = `booster-rl:${player}:${Math.floor(at / 60_000)}`;
  const current = Number(await kv.get(key) || "0");
  if (Number.isFinite(current) && current >= BOOSTER_RATE_LIMIT) throw new PaidError("rate_limited", 429);
  await kv.put(key, String((Number.isFinite(current) ? current : 0) + 1));
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

function sameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin !== new URL(request.url).origin) throw new PaidError("origin_rejected", 403);
}

async function roundQuestions(services: PaidServices, roundKind: string, roundId: string, player: string, edition: RegionKey): Promise<PlayQuestion[]> {
  if (roundKind === "game") {
    const stored = await readRound(services.kv, roundId);
    if (!stored || stored.player !== player || stored.edition !== edition) throw new PaidError("round_not_found", 404);
    return services.repository.boosters.overlay(player, roundId, stored.questions);
  }
  if (roundKind !== "daily") throw new PaidError("round_invalid", 400);
  const day = earnDay(services.now());
  const raw = await services.kv.get(`daily-round:v1:${day}:${edition}`);
  if (!raw) throw new PaidError("round_not_found", 404);
  const stored = JSON.parse(raw) as { id?: string; questions?: PlayQuestion[] };
  if (stored.id !== roundId || !Array.isArray(stored.questions)) throw new PaidError("round_not_found", 404);
  const started = await services.repository.daily.status(player, day);
  void started;
  return services.repository.boosters.overlay(player, roundId, stored.questions);
}

export async function handleBoosterStatus(url: URL, services: PaidServices): Promise<Response> {
  requireBoosters(services);
  const player = playerId(url.searchParams.get("player"));
  await rateLimit(services.kv, player, services.now());
  const [held, frames] = await Promise.all([
    services.repository.boosters.held(player),
    services.repository.boosters.frames(player),
  ]);
  return json({
    held,
    maxHeld: FREEZE_MAX,
    freezeCost: FREEZE_COST,
    costs: BOOSTER_COST,
    frames,
    catalog: frameCatalog(),
  });
}

export async function handleBoosterOffer(url: URL, services: PaidServices): Promise<Response> {
  requireBoosters(services);
  const player = playerId(url.searchParams.get("player"));
  const roundKind = url.searchParams.get("roundKind") || "";
  const roundId = url.searchParams.get("round") || "";
  const edition = url.searchParams.get("edition");
  const index = Number(url.searchParams.get("index"));
  if (!ROUND_ID.test(roundId) || (roundKind !== "game" && roundKind !== "daily")) throw new PaidError("round_invalid", 400);
  if (!isEdition(edition) || !Number.isInteger(index) || index < 0 || index > 11) throw new PaidError("edition_invalid", 400);
  await rateLimit(services.kv, player, services.now());
  const questions = await roundQuestions(services, roundKind, roundId, player, edition);
  const question = questions[index];
  if (!question) throw new PaidError("round_not_found", 404);
  const used = await services.repository.boosters.used(player, roundId);
  return json({
    costs: BOOSTER_COST,
    used,
    fifty: !used.fifty && fiftyRemove(question) !== null,
    hint: !used.hint && neutralHint(question) !== null,
    skip: !used.skip,
    second: !used.second,
  });
}

export async function handleBoosterUse(request: Request, services: PaidServices): Promise<Response> {
  sameOrigin(request);
  requireBoosters(services);
  await services.ensureSchema?.();
  const body = await readJson(request);
  const player = playerId(body.playerId);
  if (body.roundKind !== "game" && body.roundKind !== "daily") throw new PaidError("round_invalid", 400);
  if (typeof body.roundId !== "string" || !ROUND_ID.test(body.roundId)) throw new PaidError("round_invalid", 400);
  if (!isEdition(body.edition) || !isBoosterKind(body.kind)) throw new PaidError("booster_invalid", 400);
  const index = body.questionIndex;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > 11) throw new PaidError("booster_invalid", 400);
  await rateLimit(services.kv, player, services.now());
  const questions = await roundQuestions(services, body.roundKind, body.roundId, player, body.edition);
  const pool = body.kind === "skip" ? await loadEligible(body.edition) : [];
  const answer = Array.isArray(body.answer) ? body.answer.filter((choice): choice is number => typeof choice === "number" && Number.isInteger(choice)) : undefined;
  const result = await services.repository.boosters.use({
    playerId: player,
    roundId: body.roundId,
    roundKind: body.roundKind,
    edition: body.edition,
    kind: body.kind as BoosterKind,
    questionIndex: index,
    questions,
    pool,
    answer,
    at: services.now(),
  });
  if (result === "short") throw new PaidError("cowries_required", 402);
  if (result === "unavailable" || result === "repeat_kind") throw new PaidError("booster_unavailable", 400);
  if (result === "not_wrong") throw new PaidError("booster_not_wrong", 400);
  if (!result.already) await services.repository.recordStat("booster_use", result.kind, services.now());
  return json(result);
}

export async function handleBoosterFreeze(request: Request, services: PaidServices): Promise<Response> {
  sameOrigin(request);
  requireBoosters(services);
  await services.ensureSchema?.();
  const body = await readJson(request);
  const player = playerId(body.playerId);
  if (typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) throw new PaidError("idempotency_key_required", 400);
  await rateLimit(services.kv, player, services.now());
  const result = await services.repository.boosters.buyFreeze({ playerId: player, requestId: `freeze:${player}:${body.requestId}`, at: services.now() });
  if (result === "short") throw new PaidError("cowries_required", 402);
  if (result === "full") throw new PaidError("freeze_full", 400);
  if (!result.already) await services.repository.recordStat("streak_freeze", "buy", services.now());
  return json(result);
}

export async function handleBoosterFrame(request: Request, services: PaidServices): Promise<Response> {
  sameOrigin(request);
  requireBoosters(services);
  await services.ensureSchema?.();
  const body = await readJson(request);
  const player = playerId(body.playerId);
  if (!isFrameKey(body.frame)) throw new PaidError("frame_invalid", 400);
  if (typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) throw new PaidError("idempotency_key_required", 400);
  await rateLimit(services.kv, player, services.now());
  const result = await services.repository.boosters.buyFrame({
    playerId: player,
    frame: body.frame,
    requestId: `frame:${player}:${body.frame}:${body.requestId}`,
    at: services.now(),
  });
  if (result === "short") throw new PaidError("cowries_required", 402);
  if (!result.already) await services.repository.recordStat("frame_buy", body.frame, services.now());
  return json(result);
}
