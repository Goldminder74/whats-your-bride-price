import { activeFeatureFlags } from "./featureFlags.ts";
import { getReviewChallengeRuntime } from "./challengeReviewRuntime.ts";
import { resolveReviewChallengeFixtureByCode } from "./challengeEntry.ts";
import { isChallengePublicCode } from "../db/challengeAcceptance.ts";
import type { PublicChallengeProjection } from "../db/challengeService.ts";

export const CHALLENGE_UNAVAILABLE_COPY = "This challenge is no longer available.";
export const CHALLENGE_TEMPORARY_COPY = "We could not load this challenge right now.";

export type ChallengeLandingState =
  | Readonly<{ kind: "active"; challenge: PublicChallengeProjection }>
  | Readonly<{ kind: "unavailable"; message: typeof CHALLENGE_UNAVAILABLE_COPY }>
  | Readonly<{ kind: "temporary_failure"; message: typeof CHALLENGE_TEMPORARY_COPY }>;

export type ChallengeProjectionReader = Readonly<{
  storageAvailable: boolean;
  getPublic(publicCode: string): Promise<PublicChallengeProjection | null>;
}>;

const unavailableState = Object.freeze({
  kind: "unavailable" as const,
  message: CHALLENGE_UNAVAILABLE_COPY,
});

export async function loadChallengeLanding(
  code: unknown,
  options: Readonly<{
    enabled?: boolean;
    reader?: ChallengeProjectionReader | null;
  }> = {},
): Promise<ChallengeLandingState> {
  if (!isChallengePublicCode(code)) return unavailableState;
  const enabled = options.enabled ?? activeFeatureFlags.challenges;
  if (!enabled) return unavailableState;
  const reviewFixture = options.reader === undefined
    ? resolveReviewChallengeFixtureByCode(code)
    : undefined;
  if (reviewFixture?.scenario === "temporary") {
    return Object.freeze({
      kind: "temporary_failure",
      message: CHALLENGE_TEMPORARY_COPY,
    });
  }
  const runtime = options.reader === undefined ? getReviewChallengeRuntime() : null;
  const reader = options.reader === undefined
    ? runtime && { storageAvailable: true, getPublic: runtime.challengeService.getPublic.bind(runtime.challengeService) }
    : options.reader;
  if (!reader?.storageAvailable) return unavailableState;
  try {
    const challenge = await reader.getPublic(code);
    return challenge?.status === "active"
      ? Object.freeze({ kind: "active", challenge })
      : unavailableState;
  } catch {
    return Object.freeze({
      kind: "temporary_failure",
      message: CHALLENGE_TEMPORARY_COPY,
    });
  }
}
