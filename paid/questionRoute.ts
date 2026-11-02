import type { RegionKey } from "../app/gameData.ts";
import { loadEligible } from "../question-bank/loader.ts";
import { toPublicQuestion } from "../question-bank/present.ts";
import { attemptRoundKey, completeStoredRound, readRound, recentKey, roundKey, type StoredRound } from "../question-bank/scoreRound.ts";
import { selectRound } from "../question-bank/select.ts";
import { RECENT_AVOID, RECENT_KEEP } from "../question-bank/types.ts";
import { PaidError } from "./errors.ts";
import { completeGame, isEdition, publicQuestions, type KvStore } from "./games.ts";
import type { PaidServices } from "./serve.ts";

const ROUND_ID = /^[a-f0-9]{32}$/;
const PLAYER_ID = /^[A-Za-z0-9_-]{16,64}$/;
const ATTEMPT_ID = /^[A-Za-z0-9_-]{16,80}$/;

function playableRound(stored: StoredRound) {
  return {
    roundId: stored.id,
    questions: stored.questions.map((question, index) => ({
      ...toPublicQuestion(question, index, stored.edition),
      correct: [...question.correct],
      explanation: question.explanation,
      visualStart: question.visualStart,
    })),
  };
}

function randomBankOn(services: PaidServices): boolean {
  return services.randomBank === true;
}

function newId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function remember(kv: KvStore, player: string | null, edition: RegionKey, ids: readonly string[]) {
  if (!player) return;
  const key = recentKey(player, edition);
  const current = JSON.parse(await kv.get(key) || "[]") as unknown;
  const previous = Array.isArray(current) ? current.filter((item): item is string => typeof item === "string") : [];
  const next = [...ids, ...previous.filter((id) => !ids.includes(id))].slice(0, RECENT_KEEP);
  await kv.put(key, JSON.stringify(next));
}

async function recentIds(kv: KvStore, player: string | null, edition: RegionKey): Promise<string[]> {
  if (!player) return [];
  const current = JSON.parse(await kv.get(recentKey(player, edition)) || "[]") as unknown;
  const ids = Array.isArray(current) ? current.filter((item): item is string => typeof item === "string") : [];
  return ids.slice(0, RECENT_AVOID);
}

export async function handleQuestionGet(url: URL, services: PaidServices): Promise<Response> {
  const edition = url.searchParams.get("edition");
  if (!isEdition(edition)) throw new PaidError("edition_invalid", 400);
  if (!randomBankOn(services)) {
    return Response.json(publicQuestions(edition), { headers: { "cache-control": "public, max-age=86400" } });
  }
  const roundId = url.searchParams.get("round");
  if (roundId) {
    if (!ROUND_ID.test(roundId)) throw new PaidError("round_invalid", 400);
    const stored = await readRound(services.kv, roundId);
    if (!stored || stored.edition !== edition) throw new PaidError("round_not_found", 404);
    return Response.json({
      roundId: stored.id,
      questions: stored.questions.map((question, index) => toPublicQuestion(question, index, edition)),
    }, { headers: { "cache-control": "no-store" } });
  }
  const playerParam = url.searchParams.get("player");
  const player = playerParam && PLAYER_ID.test(playerParam) ? playerParam : null;
  const attemptParam = url.searchParams.get("attempt");
  if (services.earnPaths && attemptParam) {
    if (!ATTEMPT_ID.test(attemptParam)) throw new PaidError("attempt_invalid", 400);
    if (!player) throw new PaidError("player_invalid", 400);
    const wallet = await services.repository.wallet(player, services.now());
    if (!wallet.openAttempt || wallet.openAttempt.attemptId !== attemptParam || wallet.openAttempt.edition !== edition) {
      throw new PaidError("attempt_unavailable", 404);
    }
    const bound = await services.kv.get(attemptRoundKey(attemptParam));
    if (bound && ROUND_ID.test(bound)) {
      const stored = await readRound(services.kv, bound);
      if (stored && stored.edition === edition && stored.player === player) return Response.json(playableRound(stored), { headers: { "cache-control": "no-store" } });
    }
    const pool = await loadEligible(edition);
    const round = selectRound({ pool, region: edition, recentIds: await recentIds(services.kv, player, edition) });
    const stored: StoredRound = { id: newId(), edition, player, questions: round.questions, createdAt: services.now(), attemptId: attemptParam };
    await services.kv.put(roundKey(stored.id), JSON.stringify(stored));
    await services.kv.put(attemptRoundKey(attemptParam), stored.id);
    await remember(services.kv, player, edition, round.questions.map((question) => question.id));
    return Response.json(playableRound(stored), { headers: { "cache-control": "no-store" } });
  }
  const pool = await loadEligible(edition);
  const round = selectRound({ pool, region: edition, recentIds: await recentIds(services.kv, player, edition) });
  const stored: StoredRound = { id: newId(), edition, player, questions: round.questions, createdAt: services.now() };
  await services.kv.put(roundKey(stored.id), JSON.stringify(stored));
  await remember(services.kv, player, edition, round.questions.map((question) => question.id));
  return Response.json({
    roundId: stored.id,
    questions: stored.questions.map((question, index) => toPublicQuestion(question, index, edition)),
  }, { headers: { "cache-control": "no-store" } });
}

export async function handleQuestionComplete(request: Request, services: PaidServices, body: unknown): Promise<Response> {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const roundId = record && typeof record.roundId === "string" ? record.roundId : "";
  if (randomBankOn(services) && roundId) {
    if (!ROUND_ID.test(roundId)) throw new PaidError("round_invalid", 400);
    const stored = await readRound(services.kv, roundId);
    if (!stored) throw new PaidError("round_not_found", 404);
    if (!isEdition(record?.edition) || record.edition !== stored.edition) throw new PaidError("edition_invalid", 400);
    if (!Array.isArray(record.answers)) throw new PaidError("answers_incomplete", 400);
    const answers = record.answers.map((answer) => {
      if (!Array.isArray(answer) || answer.length < 1 || answer.length > 8) throw new PaidError("answers_invalid", 400);
      return answer.map((choice) => {
        if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice > 20) throw new PaidError("answers_invalid", 400);
        return choice;
      });
    });
    return Response.json(await completeStoredRound(services.kv, stored, answers, services.now()));
  }
  return Response.json(await completeGame(services.kv, body, services.now()));
}
