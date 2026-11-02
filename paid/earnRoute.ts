import { regions, type RegionKey } from "../app/gameData.ts";
import { answersMatch } from "../app/gameLogic.ts";
import { GAME_SIZE } from "../question-bank/types.ts";
import { readRound } from "../question-bank/scoreRound.ts";
import { CANONICAL_ORIGIN } from "./catalog.ts";
import { isReferralCode } from "./earn.ts";
import { PaidError } from "./errors.ts";
import { isEdition } from "./games.ts";
import type { EarnDecision } from "./repository.ts";
import type { PaidServices } from "./serve.ts";
import { normalizeShareCardQuery, readCachedSharePng, storeCachedSharePng } from "./shareCardCache.ts";
import { canonicalHost, CHALLENGE_LINE, shareCardSvg } from "./shareCard.ts";
import { renderShareCardPng } from "./shareCardPng.ts";

const PLAYER_ID = /^[A-Za-z0-9_-]{16,64}$/;
const ATTEMPT_ID = /^[A-Za-z0-9_-]{16,80}$/;
const ROUND_ID = /^[a-f0-9]{32}$/;

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

async function readJson(request: Request, limit: number): Promise<unknown> {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > limit) throw new PaidError("body_too_large", 413);
  const text = await request.text();
  if (text.length > limit) throw new PaidError("body_too_large", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new PaidError("json_invalid", 400);
  }
}

function requireEarn(services: PaidServices): void {
  if (!services.earnPaths) throw new PaidError("earn_disabled", 404);
}

function parseAnswers(value: unknown, expected: number): number[][] {
  if (!Array.isArray(value) || value.length !== expected) throw new PaidError("answers_incomplete", 400);
  return value.map((answer) => {
    if (!Array.isArray(answer) || answer.length < 1 || answer.length > 8) throw new PaidError("answers_invalid", 400);
    return answer.map((choice) => {
      if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice > 20) throw new PaidError("answers_invalid", 400);
      return choice;
    });
  });
}

async function stat(services: PaidServices, event: string, detail: string) {
  try {
    await services.repository.recordStat(event, detail, services.now());
  } catch { /* a stats miss must not undo a grant */ }
}

export async function handlePerfect(request: Request, services: PaidServices): Promise<Response> {
  sameOrigin(request);
  requireEarn(services);
  await services.ensureSchema?.();
  const body = await readJson(request, 20_000) as Record<string, unknown>;
  if (typeof body.playerId !== "string" || !PLAYER_ID.test(body.playerId)) throw new PaidError("player_invalid", 400);
  if (typeof body.attemptId !== "string" || !ATTEMPT_ID.test(body.attemptId)) throw new PaidError("attempt_invalid", 400);
  if (!isEdition(body.edition)) throw new PaidError("edition_invalid", 400);
  const edition = body.edition;
  let questions: readonly { correct: readonly number[] }[];
  if (services.randomBank) {
    const roundId = typeof body.roundId === "string" ? body.roundId : "";
    if (!ROUND_ID.test(roundId)) throw new PaidError("round_invalid", 400);
    const stored = await readRound(services.kv, roundId);
    if (!stored || stored.player !== body.playerId || stored.edition !== edition || stored.attemptId !== body.attemptId) {
      throw new PaidError("round_not_found", 404);
    }
    questions = stored.questions;
  } else {
    questions = regions[edition].questions;
  }
  const answers = parseAnswers(body.answers, questions.length);
  const score = answers.reduce((sum, answer, index) => sum + (answersMatch(answer, questions[index].correct) ? 1 : 0), 0);
  const total = questions.length;
  if (score !== GAME_SIZE || total !== GAME_SIZE) {
    await stat(services, "earn_perfect", "miss");
    return json({ ok: false, reason: "miss", cowries: 0, score, total });
  }
  const decision = await services.repository.grantPerfect({ playerId: body.playerId, attemptId: body.attemptId, edition, at: services.now() });
  await stat(services, "earn_perfect", decision.reason);
  return json({ ...decision, score, total });
}

export async function handleShareReward(request: Request, services: PaidServices): Promise<Response> {
  sameOrigin(request);
  requireEarn(services);
  await services.ensureSchema?.();
  const body = await readJson(request, 2_000) as Record<string, unknown>;
  if (typeof body.playerId !== "string" || !PLAYER_ID.test(body.playerId)) throw new PaidError("player_invalid", 400);
  const decision = await services.repository.grantShare({ playerId: body.playerId, at: services.now() });
  await stat(services, "earn_share", decision.reason);
  return json(decision);
}

export async function handleReferralGet(url: URL, services: PaidServices): Promise<Response> {
  requireEarn(services);
  await services.ensureSchema?.();
  const playerId = url.searchParams.get("player") || "";
  if (!PLAYER_ID.test(playerId)) throw new PaidError("player_invalid", 400);
  const { code } = await services.repository.ensureReferralCode(playerId, services.now());
  return json({ code, url: `${CANONICAL_ORIGIN}/?ref=${code}` });
}

export async function handleReferralArrive(request: Request, services: PaidServices): Promise<Response> {
  sameOrigin(request);
  requireEarn(services);
  await services.ensureSchema?.();
  const body = await readJson(request, 2_000) as Record<string, unknown>;
  if (typeof body.playerId !== "string" || !PLAYER_ID.test(body.playerId)) throw new PaidError("player_invalid", 400);
  if (!isReferralCode(body.code)) throw new PaidError("referral_invalid", 400);
  const decision = await services.repository.recordReferralArrival({ playerId: body.playerId, code: body.code, at: services.now() });
  if (decision.reason === "self" || decision.reason === "not_new") await stat(services, "earn_referral", decision.reason);
  return json(decision);
}

export async function claimReferralIfFirstGame(services: PaidServices, playerId: string, completedGames: number, already: boolean): Promise<{ player: EarnDecision; referrer: EarnDecision } | null> {
  if (!services.earnPaths || already || completedGames !== 1) return null;
  const reward = await services.repository.claimReferralRewards(playerId, services.now());
  if (!reward) return null;
  if (reward.player.reason === "granted") await stat(services, "earn_referral", "new");
  if (reward.referrer.reason === "granted") await stat(services, "earn_referral", "referrer");
  if (reward.referrer.reason === "capped") await stat(services, "earn_referral", "capped");
  return reward;
}

const ART_FILE: Record<RegionKey, string> = {
  west: "west.jpg",
  east: "east.jpg",
  central: "central.jpg",
  north: "north.jpg",
  south: "south.jpg",
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function regionArtwork(services: PaidServices, edition: RegionKey): Promise<string | null> {
  if (!services.assets) return null;
  try {
    const asset = await services.assets.fetch(new Request(new URL(`/share-art/${ART_FILE[edition]}`, CANONICAL_ORIGIN)));
    if (!asset.ok) return null;
    const bytes = new Uint8Array(await asset.arrayBuffer());
    if (bytes.length < 32) return null;
    return `data:image/jpeg;base64,${bytesToBase64(bytes)}`;
  } catch {
    return null;
  }
}

function pngResponse(bytes: Uint8Array, cache: "hit" | "miss"): Response {
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
      "x-share-card-cache": cache,
    },
  });
}

export async function handleShareCard(url: URL, services: PaidServices, format: "svg" | "png" = "svg"): Promise<Response> {
  if (!services.shareCards) throw new PaidError("share_card_disabled", 404);
  const { edition, score, frame } = normalizeShareCardQuery(url);
  if (format === "png") {
    const cached = await readCachedSharePng(services.kv, { edition, score, frame });
    if (cached) return pngResponse(cached, "hit");
  }
  const artwork = await regionArtwork(services, edition);
  const svg = shareCardSvg({ edition, score, frame, artwork });
  if (!svg.includes(CHALLENGE_LINE) || !svg.includes(canonicalHost())) {
    throw new PaidError("share_card_unavailable", 500);
  }
  if (format === "svg") {
    return new Response(svg, {
      status: 200,
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" },
    });
  }
  const png = await renderShareCardPng(svg);
  await storeCachedSharePng(services.kv, { edition, score, frame }, png);
  return pngResponse(png, "miss");
}
