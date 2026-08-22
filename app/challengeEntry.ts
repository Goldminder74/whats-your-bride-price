import { avatarChoices, regionOrder, type RegionKey } from "./gameData.ts";

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

const codePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/;
const safeDisplayNamePattern = /^[\p{L}\p{M}\p{N} .,'’-]+$/u;
const regionSet = new Set<string>(regionOrder);
const avatarIdSet = new Set(avatarChoices.map((avatar) => avatar.id));
const validitySet = new Set(["valid", "expired", "revoked", "unavailable"]);

export function validateTrustedChallengeEntry(value: unknown): TrustedChallengeEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const inviter = typeof candidate.inviterDisplayName === "string"
    ? candidate.inviterDisplayName.trim()
    : "";
  if (
    typeof candidate.code !== "string" ||
    !codePattern.test(candidate.code) ||
    !inviter ||
    inviter.length > 40 ||
    !safeDisplayNamePattern.test(inviter) ||
    typeof candidate.edition !== "string" ||
    !regionSet.has(candidate.edition) ||
    !Number.isInteger(candidate.verifiedScore) ||
    (candidate.verifiedScore as number) < 0 ||
    (candidate.verifiedScore as number) > 12 ||
    candidate.total !== 12 ||
    typeof candidate.avatarId !== "string" ||
    !avatarIdSet.has(candidate.avatarId) ||
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
