import type { ChallengeCreationClient } from "./challengeCreation.ts";
import { resolveReviewNominationFixture } from "./challengeEntry.ts";
import { publicDisplayNameFallback, validateDisplayName } from "./displayNames.ts";
import { regions } from "./publicGameData.ts";
import { createChallengeUrl, resolveBrowserPublicAppOrigin } from "./publicAppOrigin.ts";
import type { PrivateChallengeCreationResponse } from "../db/challengeService.ts";

const responses = new Map<string, PrivateChallengeCreationResponse>();

export function createReviewNominationClient(): ChallengeCreationClient | undefined {
  const fixture = resolveReviewNominationFixture();
  if (!fixture || typeof window === "undefined") return undefined;
  return Object.freeze({
    storageAvailable: true,
    async create(idempotencyKey: string, displayName: string) {
      const existing = responses.get(idempotencyKey);
      if (existing) return existing;
      const validation = validateDisplayName(displayName);
      if (!validation.valid) throw new Error("invalid_display_name");
      const safeName = validation.value || publicDisplayNameFallback;
      const now = Date.now();
      const response: PrivateChallengeCreationResponse = Object.freeze({
        challenge: Object.freeze({
          challengeCode: fixture.code,
          displayName: safeName,
          avatarId: fixture.avatarId,
          edition: fixture.edition,
          editionLabel: regions[fixture.edition].name,
          scoreToBeat: fixture.verifiedScore,
          maximumScore: fixture.total,
          createdAt: now,
          expiresAt: now + 86_400_000,
          status: "active",
        }),
        challengeUrl: createChallengeUrl(fixture.code, resolveBrowserPublicAppOrigin(window.location.origin)),
        revocationToken: null,
        revocationTokenIssued: false,
      });
      responses.set(idempotencyKey, response);
      return response;
    },
  });
}
