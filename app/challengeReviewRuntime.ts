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
import {
  CHALLENGE_DIFFICULTY_POLICY,
  CHALLENGE_SCORING_WEIGHT_POLICY,
  ChallengeCompletionService,
  type ChallengeComparisonProjection,
  type ChallengeCompletionAuthority,
  type ChallengeCompletionInsertOutcome,
  type ChallengeCompletionRepository,
  type NewChallengeCompletion,
} from "../db/challengeCompletion.ts";
import { QUESTION_SET_VERSION, SCORING_VERSION } from "../db/seeds/development.ts";

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

class ReviewCompletionStore {
  readonly accepted: NewChallengeAcceptance[] = [];
  readonly official = new Map<string, ChallengeComparisonProjection>();
}

class ReviewChallengeAcceptanceRepository implements ChallengeAcceptanceRepository {
  readonly storageAvailable = true;
  private readonly acceptances = new Map<string, StoredChallengeAcceptance>();
  private readonly completionStore: ReviewCompletionStore;

  constructor(completionStore: ReviewCompletionStore) {
    this.completionStore = completionStore;
  }

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
      questionSetVersion: QUESTION_SET_VERSION,
      selectedQuestionVersionsJson: JSON.stringify(regions[fixture.entry.edition].questions.map((_, index) => ({ stableId: `${fixture.entry.edition}_q${String(index + 1).padStart(2, "0")}`, version: 1 }))),
      selectionPolicyVersion: "balanced-v1",
      selectionSeedReference: null,
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
    this.completionStore.accepted.push(record);
    return Object.freeze({ kind: "created", record: stored });
  }
}

class ReviewChallengeCompletionRepository implements ChallengeCompletionRepository {
  readonly storageAvailable = true;
  private readonly store: ReviewCompletionStore;

  constructor(store: ReviewCompletionStore) { this.store = store; }

  async getOfficialCompletion(publicCode: string, subjectHash: string): Promise<ChallengeComparisonProjection | null> {
    return this.store.official.get(`${publicCode}:${subjectHash}`) || null;
  }

  async getAcceptedAuthority(publicCode: string, subjectHash: string, now: number): Promise<ChallengeCompletionAuthority | null> {
    const accepted = [...this.store.accepted].reverse().find((record) =>
      record.challengePublicCode === publicCode && record.anonymousSubjectHash === subjectHash,
    );
    const fixture = resolveReviewChallengeFixtureByCode(publicCode);
    if (!accepted || !fixture || !["valid", "unicode"].includes(fixture.scenario)) return null;
    const region = regions[fixture.entry.edition];
    return Object.freeze({
      challengeId: accepted.challengeId,
      publicCode,
      challengeAttemptId: accepted.challengeAttemptId,
      recipientAttemptId: accepted.quizAttemptId,
      recipientSubjectHash: accepted.anonymousSubjectHash,
      editionId: accepted.editionId,
      edition: fixture.entry.edition,
      editionLabel: region.name,
      scoringVersion: SCORING_VERSION,
      questionSetVersion: QUESTION_SET_VERSION,
      questions: Object.freeze(region.questions.map((question, index) => Object.freeze({
        id: `question_${fixture.entry.edition}_q${String(index + 1).padStart(2, "0")}_v1`,
        stableId: `${fixture.entry.edition}_q${String(index + 1).padStart(2, "0")}`,
        version: 1,
        optionIds: Object.freeze(question.options.map((_, optionIndex) => `o${optionIndex + 1}`)),
        correctOptionIds: Object.freeze(question.correct.map((optionIndex) => `o${optionIndex + 1}`)),
        scoringWeight: 1,
        difficulty: null,
      }))),
      inviterDisplayName: fixture.entry.inviterDisplayName,
      inviterScore: fixture.entry.verifiedScore,
      inviterCompatibility: Object.freeze({
        edition: fixture.entry.edition,
        scoringVersion: SCORING_VERSION,
        total: fixture.entry.total,
        questionSetVersion: QUESTION_SET_VERSION,
        scoringWeightPolicy: CHALLENGE_SCORING_WEIGHT_POLICY,
        difficultyPolicy: CHALLENGE_DIFFICULTY_POLICY,
        state: "active",
        expiresAt: now + 86_400_000,
      }),
      expiresAt: now + 86_400_000,
    });
  }

  async completeAtomically(record: NewChallengeCompletion): Promise<ChallengeCompletionInsertOutcome> {
    const key = `${record.authority.publicCode}:${record.authority.recipientSubjectHash}`;
    const existing = this.store.official.get(key);
    if (record.official && existing) return Object.freeze({ kind: "official-conflict", comparison: existing });
    if (record.official) this.store.official.set(key, record.comparison);
    return Object.freeze({ kind: "created", comparison: this.store.official.get(key) || record.comparison });
  }
}

type ReviewChallengeRuntime = Readonly<{
  challengeService: ChallengeService;
  acceptanceService: ChallengeAcceptanceService;
  completionService: ChallengeCompletionService;
}>;

let runtime: ReviewChallengeRuntime | null = null;

export function getReviewChallengeRuntime(): ReviewChallengeRuntime | null {
  if (!reviewChallengeFixturesEnabled) return null;
  if (!runtime) {
    const completionStore = new ReviewCompletionStore();
    runtime = Object.freeze({
      challengeService: new ChallengeService(
        new ReviewChallengeRepository(),
        new InMemoryChallengeRateLimiter(20),
      ),
      acceptanceService: new ChallengeAcceptanceService(
        new ReviewChallengeAcceptanceRepository(completionStore),
        new InMemoryChallengeRateLimiter(20),
      ),
      completionService: new ChallengeCompletionService(
        new ReviewChallengeCompletionRepository(completionStore),
      ),
    });
  }
  return runtime;
}
