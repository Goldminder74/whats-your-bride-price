import type { FeatureFlagName } from "../app/featureFlags.ts";
import type {
  DeletionOrAnonymisationOperation,
  OwnerAnalyticsData,
  PartyHostData,
  PartyPlayerPublicData,
  PrivateAttemptData,
  PublicResultData,
  TrustedChallengeEntryData,
} from "./dataContracts.ts";

export interface BoundStatement {
  bind(...values: unknown[]): BoundStatement;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface AtomicD1Database {
  prepare(query: string): BoundStatement;
  batch<T = Record<string, unknown>>(statements: BoundStatement[]): Promise<D1Result<T>[]>;
}

export type AtomicOperation =
  | "complete_quiz_and_create_result"
  | "accept_challenge"
  | "complete_challenge_and_compare"
  | "update_streak"
  | "award_mastery_seal"
  | "join_party_with_capacity";

export interface DurableRepository {
  readonly storageActive: boolean;
  readonly bindingName: string | null;
  getPrivateAttempt(attemptId: string, authorization: unknown): Promise<PrivateAttemptData | null>;
  getPublicResult(publicSlug: string): Promise<PublicResultData | null>;
  getTrustedChallengeEntry(publicCode: string): Promise<TrustedChallengeEntryData | null>;
  getOwnerAnalytics(ownerAuthorization: unknown): Promise<readonly OwnerAnalyticsData[]>;
  getPartyHost(partyCode: string, hostToken: string): Promise<PartyHostData | null>;
  getPartyPlayers(partyCode: string): Promise<readonly PartyPlayerPublicData[]>;
  applyDeletionOrAnonymisation(operation: DeletionOrAnonymisationOperation, authorization: unknown): Promise<void>;
  getFeatureFlagOverride(flag: FeatureFlagName, ownerAuthorization: unknown): Promise<boolean | null>;
}

export const ATOMICITY_CONTRACT: Readonly<Record<AtomicOperation, string>> = Object.freeze({
  complete_quiz_and_create_result: "Validate the authoritative answer rows, mark one attempt completed and insert exactly one immutable result in one D1 batch.",
  accept_challenge: "Consume at most one challenge use and insert one idempotent challenge-attempt record in one D1 batch.",
  complete_challenge_and_compare: "Verify matching scoring versions, complete the recipient attempt and persist the comparison outcome in one D1 batch.",
  update_streak: "Read the current deterministic streak state and apply one compare-and-set update guarded by version in one D1 batch.",
  award_mastery_seal: "Verify the qualifying result and insert the subject/edition/rule-version seal once in one D1 batch.",
  join_party_with_capacity: "Insert only when the party is open, unexpired and below max_players; the capacity guard and player insert must share one D1 batch.",
});

export const PARTY_JOIN_CAPACITY_SQL = `INSERT INTO party_players (
  id, party_id, player_public_id, safe_avatar_id, reviewed_display_name, rank_tie_breaker,
  state, joined_at, version, created_at, updated_at
)
SELECT ?1, p.id, ?3, ?4, ?5, ?6, 'joined', ?7, 1, ?7, ?7
FROM parties p
WHERE p.id = ?2
  AND p.state = 'open'
  AND p.expires_at > ?7
  AND (SELECT count(*) FROM party_players existing WHERE existing.party_id = p.id AND existing.state IN ('joined','playing','completed')) < p.max_players`;

export async function runAtomicBatch(
  database: AtomicD1Database,
  statements: readonly BoundStatement[],
): Promise<readonly D1Result[]> {
  if (statements.length === 0) throw new Error("An atomic D1 batch must contain at least one prepared statement.");
  return database.batch([...statements]);
}

export class UnboundDurableRepository implements DurableRepository {
  readonly storageActive = false;
  readonly bindingName = null;

  private unavailable(): never {
    throw new Error("Durable storage is not configured. No browser-storage fallback is permitted for authoritative records.");
  }

  getPrivateAttempt(): Promise<PrivateAttemptData | null> { return this.unavailable(); }
  getPublicResult(): Promise<PublicResultData | null> { return this.unavailable(); }
  getTrustedChallengeEntry(): Promise<TrustedChallengeEntryData | null> { return this.unavailable(); }
  getOwnerAnalytics(): Promise<readonly OwnerAnalyticsData[]> { return this.unavailable(); }
  getPartyHost(): Promise<PartyHostData | null> { return this.unavailable(); }
  getPartyPlayers(): Promise<readonly PartyPlayerPublicData[]> { return this.unavailable(); }
  applyDeletionOrAnonymisation(): Promise<void> { return this.unavailable(); }
  getFeatureFlagOverride(): Promise<boolean | null> { return this.unavailable(); }
}
