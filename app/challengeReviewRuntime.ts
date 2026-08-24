import {
  resolveReviewChallengeFixtureByCode,
  reviewChallengeFixturesEnabled,
  type ReviewChallengeFixture,
} from "./challengeEntry.ts";
import { regions, type RegionKey } from "./gameData.ts";
import {
  ChallengeAcceptanceService,
  type ChallengeAcceptanceInsertOutcome,
  type ChallengeAcceptanceRepository,
  type ChallengeForAcceptance,
  type NewChallengeAcceptance,
  type StoredChallengeAcceptance,
} from "../db/challengeAcceptance.ts";
import {
  ChallengeService,
  InMemoryChallengeRateLimiter,
  type ChallengeInsertOutcome,
  type ChallengeRepository,
  type ChallengeResultRecord,
  type StoredChallengeRecord,
} from "../db/challengeService.ts";
import { SCORING_VERSION } from "../db/seeds/development.ts";

const INVITER_SUBJECT_HASH = "a".repeat(64);

function fixtureStoredChallenge(fixture: ReviewChallengeFixture, now: number): StoredChallengeRecord {
  const { entry, scenario } = fixture;
  const removed = scenario === "removed";
  const expiresAt = scenario === "expired" ? now - 1 : now + 24 * 60 * 60 * 1000;
  return Object.freeze({
    id: `review_challenge_${scenario}`,
    publicCode: entry.code,
    inviterResultId: removed ? null : `review_result_${scenario}`,
    inviterResultState: removed ? null : "active",
    inviterResultExpiresAt: removed ? null : now + 24 * 60 * 60 * 1000,
    anonymousSubjectHash: removed ? null : INVITER_SUBJECT_HASH,
    creationIdempotencyKeyHash: "b".repeat(64),
    revocationTokenHash: "c".repeat(64),
    editionKey: entry.edition,
    editionLabel: regions[entry.edition].name,
    verifiedScoreToBeat: entry.verifiedScore,
    total: entry.total,
    scoringVersion: SCORING_VERSION,
    safeInviterAvatarId: entry.avatarId,
    reviewedInviterName: entry.inviterDisplayName,
    state: scenario === "revoked" ? "revoked" : "active",
    createdAt: now - 1_000,
    expiresAt,
    revokedAt: scenario === "revoked" ? now - 500 : null,
  });
}

class ReviewChallengeRepository implements ChallengeRepository {
  readonly storageAvailable = true;

  async getCompletedResultByReference(): Promise<ChallengeResultRecord | null> { return null; }
  async getChallengeByIdempotencyHash(): Promise<StoredChallengeRecord | null> { return null; }
  async insertChallenge(): Promise<ChallengeInsertOutcome> { return Object.freeze({ kind: "public-code-collision" }); }
  async revokeChallenge(): Promise<StoredChallengeRecord | null> { return null; }

  async getChallengeByPublicCode(publicCode: string): Promise<StoredChallengeRecord | null> {
    const fixture = resolveReviewChallengeFixtureByCode(publicCode);
    if (!fixture) return null;
    if (fixture.scenario === "temporary") throw new Error("review storage temporarily unavailable");
    return fixtureStoredChallenge(fixture, Date.now());
  }
}

class ReviewChallengeAcceptanceRepository implements ChallengeAcceptanceRepository {
  readonly storageAvailable = true;
  private readonly acceptances = new Map<string, StoredChallengeAcceptance>();

  async getActiveChallenge(publicCode: string, now: number): Promise<ChallengeForAcceptance | null> {
    const fixture = resolveReviewChallengeFixtureByCode(publicCode);
    if (!fixture || !["valid", "unicode"].includes(fixture.scenario)) return null;
    const record = fixtureStoredChallenge(fixture, now);
    return Object.freeze({
      id: record.id,
      publicCode: record.publicCode,
      editionId: `edition_${fixture.entry.edition}_v1`,
      editionKey: fixture.entry.edition,
      editionLabel: regions[fixture.entry.edition].name,
      scoringVersion: SCORING_VERSION,
      total: fixture.entry.total,
      expiresAt: record.expiresAt,
    });
  }

  async getAcceptanceByIdempotencyHash(idempotencyHash: string): Promise<StoredChallengeAcceptance | null> {
    return this.acceptances.get(idempotencyHash) || null;
  }

  async insertAcceptance(record: NewChallengeAcceptance): Promise<ChallengeAcceptanceInsertOutcome> {
    const existing = this.acceptances.get(record.acceptanceIdempotencyHash);
    if (existing) return Object.freeze({ kind: "idempotency-conflict", record: existing });
    const fixture = resolveReviewChallengeFixtureByCode(record.challengePublicCode);
    if (!fixture || !["valid", "unicode"].includes(fixture.scenario)) {
      return Object.freeze({ kind: "unavailable" });
    }
    const stored: StoredChallengeAcceptance = Object.freeze({
      challengePublicCode: record.challengePublicCode,
      anonymousSubjectHash: record.anonymousSubjectHash,
      editionKey: fixture.entry.edition as RegionKey,
      editionLabel: regions[fixture.entry.edition].name,
      state: "accepted",
      expiresAt: record.expiresAt,
    });
    this.acceptances.set(record.acceptanceIdempotencyHash, stored);
    return Object.freeze({ kind: "created", record: stored });
  }
}

type ReviewChallengeRuntime = Readonly<{
  challengeService: ChallengeService;
  acceptanceService: ChallengeAcceptanceService;
}>;

let runtime: ReviewChallengeRuntime | null = null;

export function getReviewChallengeRuntime(): ReviewChallengeRuntime | null {
  if (!reviewChallengeFixturesEnabled) return null;
  if (!runtime) {
    runtime = Object.freeze({
      challengeService: new ChallengeService(
        new ReviewChallengeRepository(),
        new InMemoryChallengeRateLimiter(20),
      ),
      acceptanceService: new ChallengeAcceptanceService(
        new ReviewChallengeAcceptanceRepository(),
        new InMemoryChallengeRateLimiter(20),
      ),
    });
  }
  return runtime;
}
