import { isApprovedAvatarId } from "./avatarRegistry.ts";
import { validateDisplayName } from "./displayNames.ts";
import { regionOrder, type RegionKey } from "./gameData.ts";

declare const __WYBP_REVIEW_CHALLENGE_FIXTURES__: boolean | undefined;
declare const __WYBP_REVIEW_CHALLENGE_DATA__: unknown;

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
  nomination: boolean;
}>;

const codePattern = /^[0-9a-f]{48}$/;
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
  return reviewChallengeFixtures.find((fixture) => fixture.scenario === "valid")?.entry;
}

export type ReviewChallengeScenario = "valid" | "expired" | "revoked" | "removed" | "temporary" | "unicode" | "nomination";
export type ReviewChallengeFixture = Readonly<{
  scenario: ReviewChallengeScenario;
  entry: TrustedChallengeEntry;
}>;

const reviewScenarios = new Set<ReviewChallengeScenario>([
  "valid", "expired", "revoked", "removed", "temporary", "unicode", "nomination",
]);

function parseReviewChallengeFixtures(value: unknown): readonly ReviewChallengeFixture[] {
  if (!reviewChallengeFixturesEnabled || !Array.isArray(value)) return Object.freeze([]);
  const fixtures: ReviewChallengeFixture[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const entry = validateTrustedChallengeEntry(record);
    if (
      !entry
      || typeof record.scenario !== "string"
      || !reviewScenarios.has(record.scenario as ReviewChallengeScenario)
    ) continue;
    fixtures.push(Object.freeze({
      scenario: record.scenario as ReviewChallengeScenario,
      entry,
    }));
  }
  return Object.freeze(fixtures);
}

export const reviewChallengeFixtures = parseReviewChallengeFixtures(
  typeof __WYBP_REVIEW_CHALLENGE_DATA__ === "undefined" ? null : __WYBP_REVIEW_CHALLENGE_DATA__,
);

export function resolveReviewChallengeFixtureByCode(code: string): ReviewChallengeFixture | undefined {
  if (!codePattern.test(code)) return undefined;
  return reviewChallengeFixtures.find((fixture) => fixture.entry.code === code);
}

export function resolveSafeguardReviewFixture(fixtureId: string | undefined): SafeguardReviewFixture | undefined {
  if (!reviewChallengeFixturesEnabled) return undefined;
  if (fixtureId === "safeguard-question") return Object.freeze({ screen: "quiz", score: 0, reducedMotion: false, nomination: false });
  if (fixtureId === "safeguard-low-result") return Object.freeze({ screen: "result", score: 0, reducedMotion: false, nomination: false });
  if (fixtureId === "safeguard-high-result") return Object.freeze({ screen: "result", score: 12, reducedMotion: false, nomination: false });
  if (fixtureId === "safeguard-reduced-result") return Object.freeze({ screen: "result", score: 12, reducedMotion: true, nomination: false });
  if (fixtureId === "nomination-result") return Object.freeze({ screen: "result", score: 12, reducedMotion: false, nomination: true });
  return undefined;
}

export function resolveReviewNominationFixture(): TrustedChallengeEntry | undefined {
  if (!reviewChallengeFixturesEnabled) return undefined;
  return reviewChallengeFixtures.find((fixture) => fixture.scenario === "nomination")?.entry;
}
