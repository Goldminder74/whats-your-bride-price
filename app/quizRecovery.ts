import { isApprovedAvatarId } from "./avatarRegistry.ts";
import { regionOrder, regions, type RegionKey } from "./publicGameData.ts";
import { imageAnswerPresentations, legacyImageQuestionStableId } from "./imageQuestionPresentation.ts";
import type { ControlledSource, PermittedEntryQuery } from "./entryContext.ts";

export const quizRecoveryStorageKey = "wybp-active-quiz-v1";
export const quizRecoverySessionKey = "wybp-active-quiz-instance-v1";
export const quizRecoveryVersion = 1;
export const quizRecoveryLifetimeMs = 24 * 60 * 60 * 1000;
export const quizRecoveryMaximumBytes = 12_000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SafeRecoveryAttribution = Readonly<{
  source: ControlledSource;
  nominated: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ref?: string;
}>;

export type QuizRecoveryState = Readonly<{
  version: 1;
  instanceId: string;
  edition: RegionKey;
  avatarId: string;
  questionPosition: number;
  answerChoices: readonly (readonly number[])[];
  updatedAt: number;
  attribution: SafeRecoveryAttribution;
  trustedChallengeCode?: string;
  randomAttemptId?: string;
}>;

const instancePattern = /^[A-Za-z0-9-]{16,80}$/;
const challengePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/;
const randomAttemptPattern = /^attempt_[0-9a-f]{48}$/;
const regionKeys = new Set<string>(regionOrder);
const sources = new Set<ControlledSource>(["whatsapp", "facebook", "instagram", "tiktok", "copy", "native", "direct", "unknown"]);
const safeToken = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;
const safeRef = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function optionalToken(value: unknown, limit: number, pattern = safeToken): string | undefined {
  return typeof value === "string" && value.length <= limit && pattern.test(value) ? value : undefined;
}

function parseAttribution(value: unknown): SafeRecoveryAttribution | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.source !== "string" || !sources.has(candidate.source as ControlledSource)) return null;
  if (typeof candidate.nominated !== "boolean") return null;
  const parsed: SafeRecoveryAttribution = {
    source: candidate.source as ControlledSource,
    nominated: candidate.nominated,
    utm_source: optionalToken(candidate.utm_source, 32),
    utm_medium: optionalToken(candidate.utm_medium, 32),
    utm_campaign: optionalToken(candidate.utm_campaign, 80),
    ref: optionalToken(candidate.ref, 64, safeRef),
  };
  for (const field of ["utm_source", "utm_medium", "utm_campaign", "ref"] as const) {
    if (candidate[field] !== undefined && parsed[field] === undefined) return null;
  }
  return Object.freeze(parsed);
}

export function safeRecoveryAttribution(query: PermittedEntryQuery): SafeRecoveryAttribution {
  return Object.freeze({
    source: query.source || "direct",
    nominated: query.nominated === "1",
    utm_source: query.utm_source,
    utm_medium: query.utm_medium,
    utm_campaign: query.utm_campaign,
    ref: query.ref,
  });
}

export function parseQuizRecovery(
  raw: string | null,
  expectedInstanceId: string | null,
  now = Date.now(),
): QuizRecoveryState | null {
  if (!raw || !expectedInstanceId || raw.length > quizRecoveryMaximumBytes) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== quizRecoveryVersion ||
    typeof candidate.instanceId !== "string" ||
    candidate.instanceId !== expectedInstanceId ||
    !instancePattern.test(candidate.instanceId) ||
    typeof candidate.edition !== "string" ||
    !regionKeys.has(candidate.edition) ||
    typeof candidate.avatarId !== "string" ||
    !isApprovedAvatarId(candidate.avatarId) ||
    !Number.isInteger(candidate.questionPosition) ||
    (candidate.questionPosition as number) < 0 ||
    (candidate.questionPosition as number) > 12 ||
    !Number.isFinite(candidate.updatedAt) ||
    (candidate.updatedAt as number) > now + 60_000 ||
    now - (candidate.updatedAt as number) > quizRecoveryLifetimeMs ||
    !Array.isArray(candidate.answerChoices) ||
    candidate.answerChoices.length !== candidate.questionPosition
  ) return null;

  const edition = candidate.edition as RegionKey;
  const choices: number[][] = [];
  const randomAttemptId = candidate.randomAttemptId === undefined
    ? undefined
    : optionalToken(candidate.randomAttemptId, 56, randomAttemptPattern);
  if (candidate.randomAttemptId !== undefined && !randomAttemptId) return null;
  for (let questionIndex = 0; questionIndex < candidate.answerChoices.length; questionIndex += 1) {
    const choice = candidate.answerChoices[questionIndex];
    const question = regions[edition].questions[questionIndex];
    const required = randomAttemptId ? null : question.kind === "multi" ? 3 : 1;
    if (
      !Array.isArray(choice) ||
      (required === null ? choice.length < 1 || choice.length > 3 : choice.length !== required) ||
      new Set(choice).size !== choice.length ||
      choice.some((option) => !Number.isInteger(option) || option < 0 || option >= (randomAttemptId ? 10 : question.options.length))
    ) return null;
    choices.push([...choice]);
  }

  const attribution = parseAttribution(candidate.attribution);
  if (!attribution) return null;
  const trustedChallengeCode = candidate.trustedChallengeCode === undefined
    ? undefined
    : optionalToken(candidate.trustedChallengeCode, 64, challengePattern);
  if (candidate.trustedChallengeCode !== undefined && !trustedChallengeCode) return null;

  return Object.freeze({
    version: 1,
    instanceId: candidate.instanceId,
    edition,
    avatarId: candidate.avatarId,
    questionPosition: candidate.questionPosition as number,
    answerChoices: Object.freeze(choices.map((choice) => Object.freeze(choice))),
    updatedAt: candidate.updatedAt as number,
    attribution,
    trustedChallengeCode,
    randomAttemptId,
  });
}

export function createQuizInstanceId(cryptoApi: Pick<Crypto, "getRandomValues" | "randomUUID"> | null | undefined = globalThis.crypto): string | null {
  if (!cryptoApi?.getRandomValues) return null;
  try {
    if (typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export function writeQuizRecovery(
  local: StorageLike,
  session: StorageLike,
  state: QuizRecoveryState,
): boolean {
  try {
    const serialised = JSON.stringify(state);
    if (serialised.length > quizRecoveryMaximumBytes) return false;
    session.setItem(quizRecoverySessionKey, state.instanceId);
    local.setItem(quizRecoveryStorageKey, serialised);
    return true;
  } catch { return false; }
}

export function readQuizRecovery(
  local: StorageLike,
  session: StorageLike,
  now = Date.now(),
): QuizRecoveryState | null {
  try {
    const instanceId = session.getItem(quizRecoverySessionKey);
    const recovery = parseQuizRecovery(local.getItem(quizRecoveryStorageKey), instanceId, now);
    if (!recovery) clearQuizRecovery(local, session);
    return recovery;
  } catch { return null; }
}

export function clearQuizRecovery(local: StorageLike, session: StorageLike): boolean {
  try {
    local.removeItem(quizRecoveryStorageKey);
    session.removeItem(quizRecoverySessionKey);
    return true;
  } catch { return false; }
}

export async function recoveryAnswerResults(
  state: QuizRecoveryState,
  fetcher: typeof fetch = fetch,
): Promise<number[]> {
  return Promise.all(state.answerChoices.map(async (choice, questionIndex) => {
    const question = regions[state.edition].questions[questionIndex];
    if (question.kind !== "image") {
      const expected = question.correct;
      return choice.length === expected.length && [...choice].sort().every((value, index) => value === [...expected].sort()[index]) ? 1 : 0;
    }
    const response = await fetcher("/questions/image-answer", {
      method: "POST", mode: "same-origin", credentials: "omit", referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        questionStableId: legacyImageQuestionStableId(state.edition, questionIndex),
        selectedOptionIds: choice.map((optionIndex) => `o${optionIndex + 1}`),
      }),
    });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok || body.accepted !== true || typeof body.correct !== "boolean") throw new Error("image_answer_recovery_unavailable");
    return body.correct ? 1 : 0;
  }));
}

export function questionImageAssets(edition: RegionKey, questionIndexes: readonly number[]): string[] {
  return questionIndexes.flatMap((questionIndex) => {
    const question = regions[edition].questions[questionIndex];
    if (!question || question.kind !== "image") return [];
    return imageAnswerPresentations({
      stableId: legacyImageQuestionStableId(edition, questionIndex),
      region: edition,
      visualStart: question.visualStart ?? null,
      answerOptions: question.options.map((text, optionIndex) => ({ id: `o${optionIndex + 1}`, text })),
      imageProvenance: [],
    }).map((item) => item.assetRef);
  });
}
