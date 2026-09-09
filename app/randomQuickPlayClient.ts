import type { RegionKey } from "./publicGameData.ts";
import type { PublicQuestionSelection } from "../db/questionSelectionService.ts";

const attempt = /^attempt_[0-9a-f]{48}$/;
const questionRef = /^(west|east|central|north|south)_[a-z0-9][a-z0-9_-]{2,55}$/;
const optionId = /^o[1-9][0-9]?$/;

function parseSelection(value: unknown): PublicQuestionSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("quick_play_unavailable");
  const candidate = value as Record<string, unknown>;
  if (candidate.available !== true || typeof candidate.attemptId !== "string" || !attempt.test(candidate.attemptId)
    || !Array.isArray(candidate.questions) || candidate.questions.length !== 12
    || typeof candidate.questionSetVersion !== "string" || typeof candidate.scoringVersion !== "string"
    || typeof candidate.selectionPolicyVersion !== "string" || !Number.isFinite(candidate.expiresAt)) throw new Error("quick_play_unavailable");
  const questions = candidate.questions.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("quick_play_unavailable");
    const question = value as Record<string, unknown>;
    if (Object.keys(question).sort().join(",") !== "audioAssets,imageAssets,imageDescriptions,kind,options,questionRef,text,version"
      || typeof question.questionRef !== "string" || !questionRef.test(question.questionRef)
      || !Number.isInteger(question.version) || typeof question.text !== "string"
      || !["single", "multi", "complete", "image"].includes(String(question.kind)) || !Array.isArray(question.options)
      || !Array.isArray(question.imageAssets) || !Array.isArray(question.imageDescriptions) || !Array.isArray(question.audioAssets)) throw new Error("quick_play_unavailable");
    const options = question.options.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("quick_play_unavailable");
      const option = value as Record<string, unknown>;
      if (Object.keys(option).sort().join(",") !== "id,text" || typeof option.id !== "string" || !optionId.test(option.id) || typeof option.text !== "string") throw new Error("quick_play_unavailable");
      return Object.freeze({ id: option.id, text: option.text });
    });
    if (new Set(options.map((option) => option.id)).size !== options.length) throw new Error("quick_play_unavailable");
    const imageAssets = (question.imageAssets as unknown[]).map(String);
    const imageDescriptions = (question.imageDescriptions as unknown[]).map(String);
    const audioAssets = (question.audioAssets as unknown[]).map(String);
    if ([...imageAssets, ...audioAssets].some((asset) => !/^\/[A-Za-z0-9/_-]+\.[A-Za-z0-9]+$/.test(asset) || asset.includes(".."))
      || (question.kind === "image" && (imageAssets.length !== options.length || imageDescriptions.length !== options.length || imageDescriptions.some((description) => description.length < 24)))) throw new Error("quick_play_unavailable");
    return Object.freeze({
      questionRef: question.questionRef,
      version: Number(question.version),
      kind: question.kind as "single" | "multi" | "complete" | "image",
      text: question.text,
      options: Object.freeze(options),
      imageAssets: Object.freeze(imageAssets),
      imageDescriptions: Object.freeze(imageDescriptions),
      audioAssets: Object.freeze(audioAssets),
    });
  });
  if (new Set(questions.map((question) => `${question.questionRef}@${question.version}`)).size !== 12) throw new Error("quick_play_unavailable");
  return Object.freeze({
    attemptId: candidate.attemptId,
    questions: Object.freeze(questions),
    questionSetVersion: candidate.questionSetVersion,
    scoringVersion: candidate.scoringVersion,
    selectionPolicyVersion: candidate.selectionPolicyVersion,
    expiresAt: Number(candidate.expiresAt),
  });
}

async function post(path: string, body: Record<string, unknown>, fetcher: typeof fetch): Promise<Response> {
  return fetcher(path, { method: "POST", mode: "same-origin", credentials: "omit", referrerPolicy: "no-referrer", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export async function startRandomQuickPlay(region: RegionKey, anonymousSessionCredential: string, idempotencyKey: string, fetcher: typeof fetch = fetch): Promise<PublicQuestionSelection> {
  const response = await post("/questions/select", { region, anonymousSessionCredential, idempotencyKey }, fetcher);
  const body = await response.json() as Record<string, unknown>;
  if (response.status === 409 && body.reason === "insufficient_published_bank") {
    const error = new Error("quick_play_bank_not_ready") as Error & { shortfall?: number };
    error.shortfall = Number(body.shortfall || 0);
    throw error;
  }
  if (!response.ok) throw new Error("quick_play_unavailable");
  return parseSelection(body);
}

export async function resumeRandomQuickPlay(attemptId: string, anonymousSessionCredential: string, fetcher: typeof fetch = fetch): Promise<PublicQuestionSelection> {
  const response = await post("/questions/resume", { attemptId, anonymousSessionCredential }, fetcher);
  if (!response.ok) throw new Error("quick_play_recovery_unavailable");
  return parseSelection(await response.json());
}

export async function judgeRandomQuickPlayAnswer(input: Readonly<{ attemptId: string; anonymousSessionCredential: string; questionRef: string; selectedOptionIds: readonly string[] }>, fetcher: typeof fetch = fetch): Promise<Readonly<{ correct: boolean; correctOptionIds: readonly string[]; explanation: string }>> {
  const response = await post("/questions/answer", { ...input }, fetcher);
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok || body.accepted !== true || typeof body.correct !== "boolean" || typeof body.explanation !== "string"
    || !Array.isArray(body.correctOptionIds) || body.correctOptionIds.some((id) => typeof id !== "string" || !optionId.test(id))) throw new Error("quick_play_answer_unavailable");
  return Object.freeze({ correct: body.correct, correctOptionIds: Object.freeze([...(body.correctOptionIds as string[])]), explanation: body.explanation });
}

export function createQuickPlayIdempotencyKey(cryptoApi: Pick<Crypto, "getRandomValues"> = crypto): string {
  const bytes = new Uint8Array(16);
  if (cryptoApi.getRandomValues(bytes) !== bytes) throw new Error("secure_random_unavailable");
  return `quick-play-${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
