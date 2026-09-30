import { isApprovedAvatarId, resolveApprovedAvatar } from "./avatarRegistry.ts";
import { regions, type RegionKey } from "./publicGameData.ts";
import { calculateResultTier } from "./gameLogic.ts";
import { PRODUCT_SAFEGUARD, RESULT_TIER_TITLES } from "./productSafeguards.ts";
import { isSafeShareProjection, type SafeShareProjection } from "./shareProjection.ts";
import type { PublicAppOrigin } from "./publicAppOrigin.ts";

export type StoryVideoProjection = Readonly<{
  edition: RegionKey;
  editionLabel: string;
  score: number;
  maximumScore: number;
  resultTitle: string;
  avatarId: string;
  avatarAsset: string;
  regionalArtwork: string;
  theme: Readonly<{ base: string; accent: string; dark: string; mark: string }>;
  mastery: boolean;
  safeguard: typeof PRODUCT_SAFEGUARD;
  publicResultUrl: string | null;
}>;

function approvedArtwork(edition: RegionKey): string {
  return `/regions/${edition === "south" ? "southern" : edition}-africa.webp`;
}

function publicResultUrl(projection: SafeShareProjection): string | null {
  if (projection.surface !== "result" || !projection.personalised) return null;
  try {
    const parsed = new URL(projection.canonicalUrl);
    return /^\/result\/[0-9a-f]{48}$/.test(parsed.pathname) && !parsed.search && !parsed.hash
      ? projection.canonicalUrl
      : null;
  } catch {
    return null;
  }
}

export function storyVideoProjectionFromShare(
  value: unknown,
  origin: PublicAppOrigin,
): StoryVideoProjection | null {
  if (!isSafeShareProjection(value, origin)) return null;
  const projection = value as SafeShareProjection;
  const region = regions[projection.edition];
  if (
    !projection.personalised
    || projection.score === null
    || projection.resultTitle === null
    || !isApprovedAvatarId(projection.avatarId)
    || projection.maximumScore !== region.questions.length
    || projection.resultTitle !== RESULT_TIER_TITLES[calculateResultTier(projection.score)]
  ) return null;
  const avatar = resolveApprovedAvatar(projection.avatarId);
  return Object.freeze({
    edition: projection.edition,
    editionLabel: region.name,
    score: projection.score,
    maximumScore: projection.maximumScore,
    resultTitle: projection.resultTitle,
    avatarId: avatar.id,
    avatarAsset: avatar.src,
    regionalArtwork: approvedArtwork(projection.edition),
    theme: Object.freeze({ base: region.palette[0], accent: region.palette[1], dark: region.palette[2], mark: region.mark }),
    mastery: projection.score >= 9,
    safeguard: PRODUCT_SAFEGUARD,
    publicResultUrl: publicResultUrl(projection),
  });
}

export function isStoryVideoProjection(value: unknown): value is StoryVideoProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const edition = candidate.edition as RegionKey;
  const region = regions[edition];
  if (!region || !Number.isInteger(candidate.score) || candidate.maximumScore !== region.questions.length) return false;
  const score = candidate.score as number;
  const expectedTitle = RESULT_TIER_TITLES[calculateResultTier(score)];
  const expectedArtwork = approvedArtwork(edition);
  const avatar = isApprovedAvatarId(candidate.avatarId) ? resolveApprovedAvatar(candidate.avatarId) : null;
  const theme = candidate.theme as Record<string, unknown> | null;
  return Boolean(
    score >= 0 && score <= region.questions.length
    && candidate.editionLabel === region.name
    && candidate.resultTitle === expectedTitle
    && avatar && candidate.avatarAsset === avatar.src
    && candidate.regionalArtwork === expectedArtwork
    && candidate.mastery === (score >= 9)
    && candidate.safeguard === PRODUCT_SAFEGUARD
    && theme && theme.base === region.palette[0] && theme.accent === region.palette[1] && theme.dark === region.palette[2] && theme.mark === region.mark
    && (candidate.publicResultUrl === null || (typeof candidate.publicResultUrl === "string" && /^https?:\/\/[^/]+\/result\/[0-9a-f]{48}$/.test(candidate.publicResultUrl)))
  );
}
