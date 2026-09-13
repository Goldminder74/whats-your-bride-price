import { activeFeatureFlags } from "./featureFlags.ts";
import { deriveAnonymousSubjectHash } from "./anonymousSession.ts";
import { regions, type RegionKey } from "./publicGameData.ts";
import { PUBLIC_APP_ORIGIN } from "./publicAppOrigin.ts";
import type { ResultRecord, ResultState, ResultVisibility } from "../db/dataContracts.ts";
import { InMemoryChallengeRateLimiter } from "../db/challengeService.ts";
import {
  InMemoryGeneratedMediaStore,
  InMemoryResultPreviewRepository,
  ResultMediaService,
} from "../db/resultMedia.ts";
import {
  ResultPublicationService,
  type OwnedResultRecord,
  type ResultPublicationRepository,
} from "../db/resultPublication.ts";
import { ResultService, type PublicResultRepository } from "../db/resultService.ts";

declare const __WYBP_REVIEW_RESULT_FIXTURES__: boolean | undefined;
declare const __WYBP_REVIEW_RESULT_DATA__: readonly ReviewResultFixtureInput[] | null | undefined;

type ReviewResultFixtureInput = Readonly<{
  slug: string;
  edition: RegionKey;
  score: number;
  tier: 0 | 1 | 2 | 3;
  avatarId: string;
  visibility: ResultVisibility;
  state: ResultState;
}>;

const fixtureEnabled = typeof __WYBP_REVIEW_RESULT_FIXTURES__ === "boolean" && __WYBP_REVIEW_RESULT_FIXTURES__;
const fixtureData = typeof __WYBP_REVIEW_RESULT_DATA__ === "object" && __WYBP_REVIEW_RESULT_DATA__
  ? __WYBP_REVIEW_RESULT_DATA__
  : [];
export const reviewResultSessionCredential = "01".repeat(16);

class ReviewResultRepository implements PublicResultRepository, ResultPublicationRepository {
  readonly storageAvailable = true;
  readonly records = new Map<string, OwnedResultRecord>();
  readonly writeCount = { visibility: 0 };

  constructor(fixtures: readonly ReviewResultFixtureInput[], now: number) {
    for (const fixture of fixtures) {
      const expired = fixture.state === "expired";
      this.records.set(fixture.slug, Object.freeze({
        id: `review_result_${fixture.slug.slice(0, 8)}`,
        publicSlug: fixture.slug,
        editionKey: fixture.edition,
        score: fixture.score,
        total: regions[fixture.edition].questions.length,
        tier: fixture.tier,
        scoringVersion: "binary-exact-set-v1",
        safeAvatarId: fixture.avatarId,
        reviewedDisplayName: null,
        safeguardVersion: "culture-score-v1",
        visibility: fixture.visibility,
        state: fixture.state,
        createdAt: now - 86_400_000,
        expiresAt: expired ? now - 1 : now + 86_400_000,
        attemptStatus: "completed",
        attemptCompletedAt: now - 85_000_000,
        attemptExpiresAt: now + 86_400_000,
        anonymousSubjectHash: null,
      }));
    }
  }

  async getResultByPublicSlug(publicSlug: string): Promise<ResultRecord | null> { return this.records.get(publicSlug) || null; }
  async getOwnedResult(publicSlug: string): Promise<OwnedResultRecord | null> { return this.records.get(publicSlug) || null; }
  async setVisibility(input: Readonly<{ resultId: string; anonymousSubjectHash: string; visibility: ResultVisibility; now: number }>): Promise<OwnedResultRecord | null> {
    const entry = [...this.records.entries()].find(([, record]) => record.id === input.resultId);
    if (!entry || entry[1].anonymousSubjectHash !== input.anonymousSubjectHash) return null;
    const [slug, current] = entry;
    const updated = Object.freeze({ ...current, visibility: input.visibility });
    this.records.set(slug, updated); this.writeCount.visibility += 1; return updated;
  }
}

export type ReviewResultRuntime = Readonly<{
  resultService: ResultService;
  publicationService: ResultPublicationService;
  mediaService: ResultMediaService;
  repository: ReviewResultRepository;
  mediaRepository: InMemoryResultPreviewRepository;
}>;

async function createRuntime(): Promise<ReviewResultRuntime | null> {
  if (!fixtureEnabled || !activeFeatureFlags.dynamic_results) return null;
  const now = Date.UTC(2026, 7, 24, 12);
  const reviewResultSubjectHash = await deriveAnonymousSubjectHash(reviewResultSessionCredential);
  if (!reviewResultSubjectHash) return null;
  const repository = new ReviewResultRepository(fixtureData, now);
  for (const [slug, record] of repository.records) repository.records.set(slug, Object.freeze({ ...record, anonymousSubjectHash: reviewResultSubjectHash }));
  const mediaRepository = new InMemoryResultPreviewRepository();
  const mediaService = new ResultMediaService(mediaRepository, new InMemoryGeneratedMediaStore());
  const resultService = new ResultService(repository, { now: () => now, publicOrigin: PUBLIC_APP_ORIGIN });
  for (const fixture of fixtureData) {
    const resolved = await resultService.getPublic(fixture.slug);
    if (resolved) await mediaService.prepare(resolved.internalResultId, resolved.data);
  }
  return Object.freeze({
    resultService,
    publicationService: new ResultPublicationService(repository, new InMemoryChallengeRateLimiter(12), { now: () => now, publicOrigin: PUBLIC_APP_ORIGIN }),
    mediaService,
    repository,
    mediaRepository,
  });
}

const runtimePromise = createRuntime();
export async function getReviewResultRuntime(): Promise<ReviewResultRuntime | null> { return runtimePromise; }
