import { isApprovedAvatarId } from "./avatarRegistry.ts";
import { validateDisplayName } from "./displayNames.ts";
import { regions, type RegionKey } from "./gameData.ts";
import type { SafeNominationChallenge } from "./nominationExperience.ts";
import { createChallengeUrl, createPublicAppUrl, type PublicAppOrigin } from "./publicAppOrigin.ts";
import { RESULT_TIER_TITLES } from "./productSafeguards.ts";
import { calculateResultTier } from "./gameLogic.ts";

export const shareSurfaces = ["result", "comparison", "challenge_landing"] as const;
export type ShareSurface = (typeof shareSurfaces)[number];

export type SafeShareProjection = Readonly<{
  surface: ShareSurface;
  edition: RegionKey;
  editionLabel: string;
  canonicalUrl: string;
  personalised: boolean;
  displayName: string | null;
  score: number | null;
  maximumScore: number;
  resultTitle: string | null;
  avatarId: string | null;
}>;

export function shareProjectionFromChallenge(
  surface: ShareSurface,
  challenge: SafeNominationChallenge,
  origin: PublicAppOrigin,
): SafeShareProjection | null {
  const { projection, challengeUrl } = challenge;
  const region = regions[projection.edition];
  const name = validateDisplayName(projection.displayName);
  if (
    !shareSurfaces.includes(surface)
    || !region
    || projection.status !== "active"
    || projection.editionLabel !== region.name
    || projection.maximumScore !== region.questions.length
    || !Number.isInteger(projection.scoreToBeat)
    || projection.scoreToBeat < 0
    || projection.scoreToBeat > projection.maximumScore
    || !name.valid
    || !name.value
    || name.value !== projection.displayName
    || !isApprovedAvatarId(projection.avatarId)
    || challengeUrl !== createChallengeUrl(projection.challengeCode, origin)
  ) return null;

  return Object.freeze({
    surface,
    edition: projection.edition,
    editionLabel: region.name,
    canonicalUrl: challengeUrl,
    personalised: true,
    displayName: name.value,
    score: projection.scoreToBeat,
    maximumScore: projection.maximumScore,
    resultTitle: RESULT_TIER_TITLES[calculateResultTier(projection.scoreToBeat)],
    avatarId: projection.avatarId,
  });
}

export function genericShareProjection(
  surface: ShareSurface,
  edition: RegionKey,
  origin: PublicAppOrigin,
): SafeShareProjection {
  const region = regions[edition];
  return Object.freeze({
    surface,
    edition,
    editionLabel: region.name,
    canonicalUrl: createPublicAppUrl("/", { edition }, origin),
    personalised: false,
    displayName: null,
    score: null,
    maximumScore: region.questions.length,
    resultTitle: null,
    avatarId: null,
  });
}

export function isSafeShareProjection(value: unknown, origin: PublicAppOrigin): value is SafeShareProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!shareSurfaces.includes(candidate.surface as ShareSurface) || !(candidate.edition as string in regions)) return false;
  const region = regions[candidate.edition as RegionKey];
  if (candidate.editionLabel !== region.name || candidate.maximumScore !== region.questions.length) return false;
  if (candidate.personalised === false) {
    return candidate.displayName === null
      && candidate.score === null
      && candidate.resultTitle === null
      && candidate.avatarId === null
      && candidate.canonicalUrl === createPublicAppUrl("/", { edition: candidate.edition as RegionKey }, origin);
  }
  if (candidate.personalised !== true || typeof candidate.canonicalUrl !== "string" || typeof candidate.displayName !== "string") return false;
  let match: RegExpMatchArray | null;
  try {
    match = new URL(candidate.canonicalUrl as string).pathname.match(/^\/challenge\/([0-9a-f]{48})$/);
  } catch {
    return false;
  }
  const name = validateDisplayName(candidate.displayName);
  return Boolean(
    match
    && candidate.canonicalUrl === createChallengeUrl(match[1], origin)
    && name.valid
    && name.value === candidate.displayName
    && Number.isInteger(candidate.score)
    && (candidate.score as number) >= 0
    && (candidate.score as number) <= region.questions.length
    && candidate.resultTitle === RESULT_TIER_TITLES[calculateResultTier(candidate.score as number)]
    && isApprovedAvatarId(candidate.avatarId),
  );
}
