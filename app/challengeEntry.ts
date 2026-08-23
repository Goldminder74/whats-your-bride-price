import { isApprovedAvatarId } from "./avatarRegistry.ts";
import { validateDisplayName } from "./displayNames.ts";
import { regionOrder, type RegionKey } from "./gameData.ts";

declare const __WYBP_REVIEW_CHALLENGE_FIXTURES__: boolean | undefined;

export const reviewChallengeFixturesEnabled =
  typeof __WYBP_REVIEW_CHALLENGE_FIXTURES__ === "boolean" &&
  __WYBP_REVIEW_CHALLENGE_FIXTURES__;

export type TrustedChallengeEntry = Readonly<{
  code: string;
  inviterDisplayName: string;
  edition: RegionKey;
  verifiedScore: number;
  total: 12;
  avatarId: string;
  validity: "valid" | "expired" | "revoked" | "unavailable";
}>;

export type SafeguardReviewFixture = Readonly<{
  screen: "quiz" | "result";
  score: 0 | 12;
  reducedMotion: boolean;
}>;

const codePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/;
const regionSet = new Set<string>(regionOrder);
const validitySet = new Set(["valid", "expired", "revoked", "unavailable"]);

export function validateTrustedChallengeEntry(value: unknown): TrustedChallengeEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const inviterResult = typeof candidate.inviterDisplayName === "string"
    ? validateDisplayName(candidate.inviterDisplayName)
    : null;
  const inviter = inviterResult?.valid ? inviterResult.value : null;
  if (
    typeof candidate.code !== "string" ||
    !codePattern.test(candidate.code) ||
    !inviter ||
    typeof candidate.edition !== "string" ||
    !regionSet.has(candidate.edition) ||
    !Number.isInteger(candidate.verifiedScore) ||
    (candidate.verifiedScore as number) < 0 ||
    (candidate.verifiedScore as number) > 12 ||
    candidate.total !== 12 ||
    typeof candidate.avatarId !== "string" ||
    !isApprovedAvatarId(candidate.avatarId) ||
    typeof candidate.validity !== "string" ||
    !validitySet.has(candidate.validity)
  ) return null;

  return Object.freeze({
    code: candidate.code,
    inviterDisplayName: inviter,
    edition: candidate.edition as RegionKey,
    verifiedScore: candidate.verifiedScore as number,
    total: 12,
    avatarId: candidate.avatarId,
    validity: candidate.validity as TrustedChallengeEntry["validity"],
  });
}

export function resolveReviewChallengeFixture(fixtureId: string | undefined): TrustedChallengeEntry | undefined {
  if (!reviewChallengeFixturesEnabled || fixtureId !== "trusted-west") return undefined;
  return validateTrustedChallengeEntry({
    code: "ReviewWest_2026",
    inviterDisplayName: "Ayo",
    edition: "west",
    verifiedScore: 10,
    total: 12,
    avatarId: "adjoa",
    validity: "valid",
  }) || undefined;
}

export function resolveSafeguardReviewFixture(fixtureId: string | undefined): SafeguardReviewFixture | undefined {
  if (!reviewChallengeFixturesEnabled) return undefined;
  if (fixtureId === "safeguard-question") return Object.freeze({ screen: "quiz", score: 0, reducedMotion: false });
  if (fixtureId === "safeguard-low-result") return Object.freeze({ screen: "result", score: 0, reducedMotion: false });
  if (fixtureId === "safeguard-high-result") return Object.freeze({ screen: "result", score: 12, reducedMotion: false });
  if (fixtureId === "safeguard-reduced-result") return Object.freeze({ screen: "result", score: 12, reducedMotion: true });
  return undefined;
}
