import { deriveAnonymousSubjectHash } from "../app/anonymousSession.ts";
import type { RegionKey } from "../app/publicGameData.ts";
import type { AtomicD1Database } from "./repositories.ts";
import {
  DEFAULT_GAME_QUESTION_COUNT,
  MINIMUM_RANDOM_QUICK_PLAY_BANK,
  selectQuestionSet,
  toPublicSelectedQuestion,
  type QuestionSelection,
  type SelectableQuestion,
  type StoredQuestionSelection,
} from "./questionSelection.ts";
import { QUESTION_ATTEMPT_LIFETIME_MS, type PublicQuestionSelection } from "./questionSelectionService.ts";

export const FREE_RANDOM_QUICK_PLAYS = 2;
export const BONUS_COWRIE_RETENTION_MS = 180 * 86_400_000;
const HASH = /^[0-9a-f]{64}$/;
const SESSION = /^[0-9a-f]{32}$/;
const IDEMPOTENCY = /^[A-Za-z0-9._~-]{16,128}$/;
const WALLET_REFERENCE = /^cw_[0-9a-f]{32}$/;

export type CowrieBucket = "bonus" | "purchased";
export type PublicCowrieWallet = Readonly<{
  walletReference: string;
  state: "active" | "frozen";
  totalBalance: number;
  purchasedBalance: number;
  bonusBalance: number;
  freeQuickPlaysRemaining: number;
  bonusExpiresAfterDays: 180;
}>;

export type CowrieAccessResult = Readonly<{
  selection: PublicQuestionSelection;
  access: "free" | "bonus" | "purchased";
  wallet: PublicCowrieWallet;
}>;

export type CowrieWalletRow = Readonly<{
  id: string;
  publicReference: string;
  anonymousOwnerHash: string;
  state: "active" | "frozen" | "deleted";
  freeQuickPlaysConsumed: number;
  purchasedBalance: number;
  bonusBalance: number;
  recoveryCredentialHash: string;
  recoveryCredentialVersion: number;
  version: number;
}>;

export type CowrieIssueInput = Readonly<{
  wallet: CowrieWalletRow;
  idempotencyHash: string;
  ledgerId: string;
  attemptId: string;
  selection: QuestionSelection;
  startedAt: number;
  expiresAt: number;
  access: "free" | CowrieBucket;
}>;

export type CowrieTransitionInput = Readonly<{ walletId: string; ownerHash: string; idempotencyHash: string; now: number; recoveryHash?: string }>;

export interface CowrieWalletRepository {
  readonly storageAvailable: boolean;
  getWalletByOwner(ownerHash: string): Promise<CowrieWalletRow | null>;
  getWalletByReference(reference: string): Promise<CowrieWalletRow | null>;
  createWallet(input: Readonly<{ id: string; publicReference: string; ownerHash: string; recoveryHash: string; now: number }>): Promise<boolean>;
  updateRecovery(input: Readonly<{ walletId: string; ownerHash: string; expectedVersion: number; recoveryHash: string; now: number }>): Promise<boolean>;
  clearWallet(input: Readonly<{ walletId: string; ownerHash: string; expectedVersion: number; now: number }>): Promise<"deleted" | "frozen" | "conflict">;
  getAttemptByIdempotencyHash(hash: string, ownerHash: string, now: number): Promise<StoredQuestionSelection | null>;
  getIssuedAccess(attemptId: string, walletId: string): Promise<"free" | CowrieBucket>;
  getExpiredBonusBalance(walletId: string, now: number): Promise<number>;
  getCandidates(region: RegionKey, now: number): Promise<readonly SelectableQuestion[]>;
  getRecentQuestionVersions(ownerHash: string, now: number): Promise<readonly Readonly<{ stableId: string; version: number }>[]>;
  issueQuickPlay(input: CowrieIssueInput): Promise<boolean>;
  commitIssuance(input: CowrieTransitionInput): Promise<boolean>;
  reverseUnissued(input: CowrieTransitionInput): Promise<boolean>;
  settleUnissuedForRecovery(wallet: CowrieWalletRow, now: number): Promise<void>;
  consumeRateLimit(ownerHash: string, action: "start" | "complete" | "clear", now: number, limit: number): Promise<"allowed" | "limited" | "unavailable">;
  awardBonus(input: Readonly<{ ledgerId: string; walletId: string; achievementKey: string; idempotencyHash: string; quantity: 1 | 2 | 3; now: number; qualificationOwnerHash?: string }>): Promise<boolean>;
  expireBonuses(input: Readonly<{ walletId: string; now: number; limit: number }>): Promise<number>;
}

export class CowrieRequestError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "CowrieRequestError"; this.code = code; }
}

function fail(code: string): never { throw new CowrieRequestError(code); }
function hex(bytes: Uint8Array): string { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function sha256(value: string): Promise<string> { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
function randomHex(bytes: number, randomSource: (value: Uint8Array) => Uint8Array): string {
  const value = new Uint8Array(bytes);
  if (randomSource(value) !== value) return fail("cowrie_secure_random_unavailable");
  return hex(value);
}
function sameBytes(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
function project(row: CowrieWalletRow): PublicCowrieWallet {
  if (row.state === "deleted") return fail("cowrie_wallet_unavailable");
  return Object.freeze({
    walletReference: row.publicReference,
    state: row.state,
    totalBalance: row.purchasedBalance + row.bonusBalance,
    purchasedBalance: row.purchasedBalance,
    bonusBalance: row.bonusBalance,
    freeQuickPlaysRemaining: Math.max(0, FREE_RANDOM_QUICK_PLAYS - row.freeQuickPlaysConsumed),
    bonusExpiresAfterDays: 180 as const,
  });
}
function publicSelection(stored: StoredQuestionSelection): PublicQuestionSelection {
  return Object.freeze({
    attemptId: stored.attemptId,
    questions: Object.freeze(stored.selection.questions.map((question, index) => toPublicSelectedQuestion(question, stored.selection.optionOrders[index]))),
    questionSetVersion: stored.selection.questionSetVersion,
    scoringVersion: stored.selection.scoringVersion,
    selectionPolicyVersion: stored.selection.selectionPolicyVersion,
    expiresAt: stored.expiresAt,
  });
}

export function validateCowrieOwnerRequest(value: unknown): Readonly<{ anonymousSessionCredential: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("cowrie_request_invalid");
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).join(",") !== "anonymousSessionCredential" || typeof candidate.anonymousSessionCredential !== "string" || !SESSION.test(candidate.anonymousSessionCredential)) return fail("cowrie_request_invalid");
  return Object.freeze({ anonymousSessionCredential: candidate.anonymousSessionCredential });
}

export function validateCowrieAccessRequest(value: unknown): Readonly<{ region: RegionKey; anonymousSessionCredential: string; idempotencyKey: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("cowrie_request_invalid");
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).sort().join(",") !== "anonymousSessionCredential,idempotencyKey,region"
    || !["west", "east", "central", "north", "south"].includes(String(candidate.region))
    || typeof candidate.anonymousSessionCredential !== "string" || !SESSION.test(candidate.anonymousSessionCredential)
    || typeof candidate.idempotencyKey !== "string" || !IDEMPOTENCY.test(candidate.idempotencyKey)) return fail("cowrie_request_invalid");
  return Object.freeze({ region: candidate.region as RegionKey, anonymousSessionCredential: candidate.anonymousSessionCredential, idempotencyKey: candidate.idempotencyKey });
}

export function validateCowrieRecoveryRequest(value: unknown): Readonly<{ walletReference: string; recoveryCredential: string; anonymousSessionCredential: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("cowrie_request_invalid");
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).sort().join(",") !== "anonymousSessionCredential,recoveryCredential,walletReference"
    || typeof candidate.walletReference !== "string" || !WALLET_REFERENCE.test(candidate.walletReference)
    || typeof candidate.recoveryCredential !== "string" || !HASH.test(candidate.recoveryCredential)
    || typeof candidate.anonymousSessionCredential !== "string" || !SESSION.test(candidate.anonymousSessionCredential)) return fail("cowrie_request_invalid");
  return Object.freeze(candidate as { walletReference: string; recoveryCredential: string; anonymousSessionCredential: string });
}

const ACHIEVEMENT = Symbol("authoritative cowrie achievement");
export type CowrieAchievement = Readonly<{
  key: string;
  quantity: 1 | 2 | 3;
  [ACHIEVEMENT]: true;
}>;
export function authorizeCowrieAchievement(input: Readonly<{
  kind: "perfect_region_day" | "daily_streak_3" | "daily_streak_7" | "all_region_mastery";
  scope: string;
  authoritative: true;
  practice: false;
  classicFallback: false;
}>): CowrieAchievement {
  if (input.authoritative !== true || input.practice !== false || input.classicFallback !== false || !/^[a-z0-9:_-]{8,120}$/.test(input.scope)) return fail("cowrie_achievement_invalid");
  const regionalDay = /^(west|east|central|north|south):[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  const regionalStreak = /^(west|east|central|north|south):daily-streak-v1$/;
  if (input.kind === "perfect_region_day" ? !regionalDay.test(input.scope)
    : input.kind === "all_region_mastery" ? input.scope !== "all:binary-exact-set-v1"
    : !regionalStreak.test(input.scope)) return fail("cowrie_achievement_invalid");
  const quantity = input.kind === "daily_streak_7" ? 2 : input.kind === "all_region_mastery" ? 3 : 1;
  return Object.freeze({ key: `${input.kind}:${input.scope}`, quantity, [ACHIEVEMENT]: true as const });
}

export class CowrieWalletService {
  private readonly repository: CowrieWalletRepository;
  private readonly now: () => number;
  private readonly randomSource: (value: Uint8Array) => Uint8Array;
  private readonly streaksEnabled: boolean;
  constructor(repository: CowrieWalletRepository, options: Readonly<{ now?: () => number; randomSource?: (value: Uint8Array) => Uint8Array; streaksEnabled?: boolean }> = {}) {
    this.repository = repository;
    this.now = options.now ?? Date.now;
    this.randomSource = options.randomSource ?? crypto.getRandomValues.bind(crypto);
    this.streaksEnabled = options.streaksEnabled === true;
  }
  private async owner(raw: string): Promise<string> {
    const value = await deriveAnonymousSubjectHash(raw);
    return value && HASH.test(value) ? value : fail("cowrie_owner_invalid");
  }
  private async recoveryHash(raw: string): Promise<string> { return sha256(`wybp-cowrie-recovery-v1\u0000${raw}`); }
  private async rate(ownerHash: string, action: "start" | "complete" | "clear", limit: number): Promise<void> {
    const outcome = await this.repository.consumeRateLimit(ownerHash, action, this.now(), limit);
    if (outcome !== "allowed") return fail(outcome === "limited" ? "cowrie_rate_limited" : "cowrie_storage_unavailable");
  }
  private async available(wallet: CowrieWalletRow): Promise<PublicCowrieWallet> {
    const expired = await this.repository.getExpiredBonusBalance(wallet.id, this.now());
    if (!Number.isInteger(expired) || expired < 0 || expired > wallet.bonusBalance) return fail("cowrie_storage_unavailable");
    return project({ ...wallet, bonusBalance: wallet.bonusBalance - expired });
  }
  async createOrGet(value: unknown): Promise<Readonly<{ wallet: PublicCowrieWallet; recoveryCredential?: string }>> {
    if (!this.repository.storageAvailable) return fail("cowrie_storage_unavailable");
    const request = validateCowrieOwnerRequest(value); const ownerHash = await this.owner(request.anonymousSessionCredential);
    await this.rate(ownerHash, "start", 12);
    const existing = await this.repository.getWalletByOwner(ownerHash);
    if (existing) return Object.freeze({ wallet: await this.available(existing) });
    const rawRecovery = randomHex(32, this.randomSource);
    const created = await this.repository.createWallet({
      id: `wallet_${randomHex(16, this.randomSource)}`,
      publicReference: `cw_${randomHex(16, this.randomSource)}`,
      ownerHash,
      recoveryHash: await this.recoveryHash(rawRecovery),
      now: this.now(),
    });
    const wallet = await this.repository.getWalletByOwner(ownerHash);
    if (!wallet) return fail("cowrie_storage_unavailable");
    return Object.freeze(created ? { wallet: await this.available(wallet), recoveryCredential: rawRecovery } : { wallet: await this.available(wallet) });
  }
  async projection(value: unknown): Promise<PublicCowrieWallet> {
    if (!this.repository.storageAvailable) return fail("cowrie_storage_unavailable");
    const request = validateCowrieOwnerRequest(value); const ownerHash = await this.owner(request.anonymousSessionCredential);
    await this.rate(ownerHash, "start", 30);
    const wallet = await this.repository.getWalletByOwner(ownerHash);
    return wallet ? this.available(wallet) : fail("cowrie_wallet_unavailable");
  }
  async startQuickPlay(value: unknown): Promise<CowrieAccessResult> {
    if (!this.repository.storageAvailable) return fail("cowrie_storage_unavailable");
    const request = validateCowrieAccessRequest(value); const now = this.now(); const ownerHash = await this.owner(request.anonymousSessionCredential);
    const idempotencyHash = await sha256(`wybp-cowrie-quick-play-v1\u0000${ownerHash}\u0000${request.idempotencyKey}`);
    await this.rate(ownerHash, "start", 20);
    const existing = await this.repository.getAttemptByIdempotencyHash(idempotencyHash, ownerHash, now);
    let wallet = await this.repository.getWalletByOwner(ownerHash);
    if (!wallet || wallet.state !== "active") return fail("cowrie_wallet_unavailable");
    if (existing) {
      if (existing.region !== request.region) return fail("cowrie_access_conflict");
      return this.finishQuickPlay({ walletId: wallet.id, ownerHash, idempotencyHash, now }, request.region);
    }
    // Ordinary play never runs retention. Expired value is unavailable immediately.
    const expired = await this.repository.getExpiredBonusBalance(wallet.id, now);
    if (expired > 0 && wallet.freeQuickPlaysConsumed >= FREE_RANDOM_QUICK_PLAYS) return fail("cowrie_bonus_maintenance_unavailable");
    wallet = await this.repository.getWalletByOwner(ownerHash);
    if (!wallet || wallet.state !== "active") return fail("cowrie_wallet_unavailable");
    const [candidates, recent] = await Promise.all([this.repository.getCandidates(request.region, now), this.repository.getRecentQuestionVersions(ownerHash, now)]);
    if (candidates.length < MINIMUM_RANDOM_QUICK_PLAY_BANK) return fail("cowrie_region_unavailable");
    const selection = await selectQuestionSet({ candidates, region: request.region, now, recentQuestionVersions: recent, minimumEligibleCount: MINIMUM_RANDOM_QUICK_PLAY_BANK, randomSource: this.randomSource });
    const access = wallet.freeQuickPlaysConsumed < FREE_RANDOM_QUICK_PLAYS ? "free" : wallet.bonusBalance > 0 ? "bonus" : wallet.purchasedBalance > 0 ? "purchased" : fail("cowrie_required");
    const attemptId = `attempt_${randomHex(24, this.randomSource)}`;
    await this.repository.issueQuickPlay({ wallet, idempotencyHash, ledgerId: `ledger_${randomHex(16, this.randomSource)}`, attemptId, selection, startedAt: now, expiresAt: now + QUESTION_ATTEMPT_LIFETIME_MS, access });
    return this.finishQuickPlay({ walletId: wallet.id, ownerHash, idempotencyHash, now }, request.region);
  }
  private async finishQuickPlay(input: CowrieTransitionInput, region: RegionKey): Promise<CowrieAccessResult> {
    try {
      const stored = await this.repository.getAttemptByIdempotencyHash(input.idempotencyHash, input.ownerHash, input.now);
      const wallet = await this.repository.getWalletByOwner(input.ownerHash);
      if (!stored || stored.region !== region || !wallet || wallet.id !== input.walletId || wallet.state !== "active") return fail("cowrie_access_conflict");
      // Build the complete safe response before committing its return. There are
      // no fallible database/projection operations after the issuance commit.
      const response = Object.freeze({ selection: publicSelection(stored), access: await this.repository.getIssuedAccess(stored.attemptId, wallet.id), wallet: await this.available(wallet) });
      if (!await this.repository.commitIssuance(input)) return fail("cowrie_access_conflict");
      return response;
    } catch {
      try { await this.repository.reverseUnissued(input); }
      catch { /* A persisted pending attempt remains recoverable by the same key. */ }
      return fail("cowrie_access_conflict");
    }
  }
  async recover(value: unknown, rotate = false): Promise<Readonly<{ wallet: PublicCowrieWallet; recoveryCredential?: string }>> {
    if (!this.repository.storageAvailable) return fail("cowrie_storage_unavailable");
    const request = validateCowrieRecoveryRequest(value); const ownerHash = await this.owner(request.anonymousSessionCredential);
    await this.rate(ownerHash, "complete", 6);
    const wallet = await this.repository.getWalletByReference(request.walletReference);
    if (!wallet || wallet.state === "deleted") return fail("cowrie_recovery_unavailable");
    const suppliedHash = await this.recoveryHash(request.recoveryCredential);
    if (!sameBytes(suppliedHash, wallet.recoveryCredentialHash)) return fail("cowrie_recovery_unavailable");
    await this.repository.settleUnissuedForRecovery(wallet, this.now());
    const current = await this.repository.getWalletByReference(request.walletReference);
    if (!current || current.state !== "active" || !sameBytes(suppliedHash, current.recoveryCredentialHash)) return fail("cowrie_recovery_unavailable");
    const rawRecovery = rotate ? randomHex(32, this.randomSource) : request.recoveryCredential;
    const updated = await this.repository.updateRecovery({ walletId: current.id, ownerHash, expectedVersion: current.version, recoveryHash: await this.recoveryHash(rawRecovery), now: this.now() });
    if (!updated) return fail("cowrie_recovery_conflict");
    const recovered = await this.repository.getWalletByOwner(ownerHash);
    if (!recovered) return fail("cowrie_recovery_unavailable");
    return Object.freeze(rotate ? { wallet: await this.available(recovered), recoveryCredential: rawRecovery } : { wallet: await this.available(recovered) });
  }
  async clear(value: unknown): Promise<Readonly<{ unavailable: true; state: "deleted" | "frozen" }>> {
    if (!this.repository.storageAvailable) return fail("cowrie_storage_unavailable");
    const request = validateCowrieOwnerRequest(value); const ownerHash = await this.owner(request.anonymousSessionCredential);
    await this.rate(ownerHash, "clear", 3);
    const wallet = await this.repository.getWalletByOwner(ownerHash);
    if (!wallet) return fail("cowrie_wallet_unavailable");
    const state = await this.repository.clearWallet({ walletId: wallet.id, ownerHash, expectedVersion: wallet.version, now: this.now() });
    if (state === "conflict") return fail("cowrie_access_conflict");
    return Object.freeze({ unavailable: true as const, state });
  }
  async award(wallet: CowrieWalletRow, achievement: CowrieAchievement): Promise<boolean> {
    if (achievement[ACHIEVEMENT] !== true || wallet.state !== "active") return fail("cowrie_achievement_invalid");
    if (achievement.key.startsWith("daily_streak_") && !this.streaksEnabled) return fail("cowrie_streak_unavailable");
    const idempotencyHash = await sha256(`wybp-cowrie-achievement-v1\u0000${wallet.id}\u0000${achievement.key}`);
    return this.repository.awardBonus({ ledgerId: `ledger_${randomHex(16, this.randomSource)}`, walletId: wallet.id, achievementKey: achievement.key, idempotencyHash, quantity: achievement.quantity, now: this.now() });
  }
  /** Internal completion hook: possession of both independent raw credentials is
   * required. No reusable owner linkage is created and streak retention is untouched. */
  async awardOfficialDaily(walletCredential: string, dailyCredential: string): Promise<void> {
    if (!this.streaksEnabled || !SESSION.test(walletCredential) || !SESSION.test(dailyCredential)) return fail("cowrie_streak_unavailable");
    const owner = await this.owner(walletCredential);
    const dailyOwner = await this.owner(dailyCredential);
    await this.rate(owner, "complete", 12);
    const wallet = await this.repository.getWalletByOwner(owner);
    if (!wallet || wallet.state !== "active") return fail("cowrie_wallet_unavailable");
    for (const [kind, quantity] of [["daily_streak_3", 1], ["daily_streak_7", 2]] as const) {
      const key = `${kind}:all:daily-streak-v1`;
      // One milestone per daily ownership relationship, across all regions and
      // wallets. Recovery cannot distribute the same achievement a second time.
      const idempotencyHash = await sha256(`wybp-cowrie-official-streak-v1\u0000${dailyOwner}\u0000${kind}`);
      await this.repository.awardBonus({ ledgerId: `ledger_${randomHex(16, this.randomSource)}`, walletId: wallet.id, achievementKey: key, idempotencyHash, quantity, now: this.now(), qualificationOwnerHash: dailyOwner });
    }
  }
  async expire(wallet: CowrieWalletRow, limit = 25): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || wallet.state !== "active") return fail("cowrie_expiry_invalid");
    return this.repository.expireBonuses({ walletId: wallet.id, now: this.now(), limit });
  }
}

function selectionSnapshot(selection: QuestionSelection): string {
  return JSON.stringify(selection.questions.map((question, index) => ({ stableId: question.stableId, version: question.version, optionOrder: selection.optionOrders[index] })));
}

export class D1CowrieWalletRepository implements CowrieWalletRepository {
  readonly storageAvailable = true;
  private readonly database: AtomicD1Database;
  private readonly selectionRepository: Readonly<{
    getCandidates(region: RegionKey, now: number): Promise<readonly SelectableQuestion[]>;
    getRecentQuestionVersions(ownerHash: string, now: number): Promise<readonly Readonly<{ stableId: string; version: number }>[]>;
    getAttemptByIdempotencyHash(hash: string, ownerHash: string, now: number): Promise<StoredQuestionSelection | null>;
    getCowriePreparedAttemptByIdempotencyHash(hash: string, ownerHash: string, now: number): Promise<StoredQuestionSelection | null>;
    consumeRateLimit(ownerHash: string, action: "start" | "complete", now: number, limit: number): Promise<"allowed" | "limited" | "unavailable">;
  }>;
  constructor(database: AtomicD1Database, selectionRepository: D1CowrieWalletRepository["selectionRepository"]) { this.database = database; this.selectionRepository = selectionRepository; }
  private row(value: Record<string, unknown> | null): CowrieWalletRow | null {
    if (!value) return null;
    return Object.freeze({ id: String(value.id), publicReference: String(value.public_reference), anonymousOwnerHash: String(value.anonymous_owner_hash), state: String(value.state) as CowrieWalletRow["state"], freeQuickPlaysConsumed: Number(value.free_quick_plays_consumed), purchasedBalance: Number(value.purchased_balance), bonusBalance: Number(value.bonus_balance), recoveryCredentialHash: String(value.recovery_credential_hash), recoveryCredentialVersion: Number(value.recovery_credential_version), version: Number(value.version) });
  }
  async getWalletByOwner(ownerHash: string) { return this.row(await this.database.prepare("SELECT * FROM cowrie_wallets WHERE anonymous_owner_hash=?1 AND state IN ('active','frozen') LIMIT 1").bind(ownerHash).first<Record<string, unknown>>()); }
  async getWalletByReference(reference: string) { return this.row(await this.database.prepare("SELECT * FROM cowrie_wallets WHERE public_reference=?1 LIMIT 1").bind(reference).first<Record<string, unknown>>()); }
  async createWallet(input: Readonly<{ id: string; publicReference: string; ownerHash: string; recoveryHash: string; now: number }>) {
    const result = await this.database.prepare(`INSERT INTO cowrie_wallets (id,public_reference,anonymous_owner_hash,state,free_quick_plays_consumed,purchased_balance,bonus_balance,recovery_credential_hash,recovery_credential_version,version,created_at,updated_at) VALUES (?1,?2,?3,'active',0,0,0,?4,1,1,?5,?5) ON CONFLICT DO NOTHING`).bind(input.id, input.publicReference, input.ownerHash, input.recoveryHash, input.now).run();
    return Boolean(result.success && Number(result.meta?.changes || 0) === 1);
  }
  async updateRecovery(input: Readonly<{ walletId: string; ownerHash: string; expectedVersion: number; recoveryHash: string; now: number }>) {
    const result = await this.database.prepare(`UPDATE cowrie_wallets SET anonymous_owner_hash=?2,recovery_credential_hash=?3,recovery_credential_version=recovery_credential_version+1,version=version+1,updated_at=?4 WHERE id=?1 AND state='active' AND version=?5 AND NOT EXISTS (SELECT 1 FROM cowrie_ledger debit JOIN quiz_attempts qa ON qa.id=debit.related_attempt_id WHERE debit.wallet_id=?1 AND debit.entry_type='quick_play_debit' AND qa.cowrie_issued_at IS NULL AND qa.status='in_progress' AND NOT EXISTS (SELECT 1 FROM cowrie_ledger reversal WHERE reversal.reversal_of_ledger_id=debit.id))`).bind(input.walletId, input.ownerHash, input.recoveryHash, input.now, input.expectedVersion).run();
    return Boolean(result.success && Number(result.meta?.changes || 0) === 1);
  }
  async clearWallet(input: Readonly<{ walletId: string; ownerHash: string; expectedVersion: number; now: number }>) {
    // Financial deletion periods are not yet approved. Freeze immediately,
    // preserve the immutable ledger and counter, and do not issue a replacement
    // allowance for this same owner relationship.
    const result = await this.database.prepare(`UPDATE cowrie_wallets SET state='frozen',frozen_at=?3,version=version+1,updated_at=?3 WHERE id=?1 AND anonymous_owner_hash=?2 AND state='active' AND version=?4`).bind(input.walletId, input.ownerHash, input.now, input.expectedVersion).run();
    if (!result.success || Number(result.meta?.changes || 0) !== 1) return "conflict" as const;
    const row = await this.getWalletByReference((await this.database.prepare("SELECT public_reference FROM cowrie_wallets WHERE id=?1").bind(input.walletId).first<string>("public_reference")) || "");
    return row?.state === "deleted" ? "deleted" as const : "frozen" as const;
  }
  getAttemptByIdempotencyHash(hash: string, ownerHash: string, now: number) { return this.selectionRepository.getCowriePreparedAttemptByIdempotencyHash(hash, ownerHash, now); }
  private validTransition(input: CowrieTransitionInput): boolean {
    return /^wallet_[0-9a-f]{32}$/.test(input.walletId) && HASH.test(input.ownerHash) && HASH.test(input.idempotencyHash)
      && (input.recoveryHash === undefined || HASH.test(input.recoveryHash)) && Number.isSafeInteger(input.now) && input.now > 0 && input.now <= 8640000000000000;
  }
  async commitIssuance(input: CowrieTransitionInput): Promise<boolean> {
    if (!this.validTransition(input)) return false;
    const results = await this.database.batch([
      this.database.prepare(`UPDATE quiz_attempts SET cowrie_issued_at=?4 WHERE idempotency_key_hash=?3 AND anonymous_subject_hash=?2 AND status='in_progress' AND deleted_at IS NULL AND expires_at>?4 AND started_at<=?4 AND cowrie_issued_at IS NULL AND EXISTS (SELECT 1 FROM cowrie_ledger debit JOIN cowrie_wallets wallet ON wallet.id=debit.wallet_id WHERE debit.related_attempt_id=quiz_attempts.id AND debit.wallet_id=?1 AND debit.entry_type='quick_play_debit' AND debit.idempotency_domain='quick_play' AND debit.idempotency_hash=?3 AND wallet.state='active' AND wallet.anonymous_owner_hash=?2 AND NOT EXISTS (SELECT 1 FROM cowrie_ledger reversal WHERE reversal.reversal_of_ledger_id=debit.id))`).bind(input.walletId, input.ownerHash, input.idempotencyHash, input.now),
      this.database.prepare(`SELECT qa.id FROM quiz_attempts qa JOIN cowrie_wallets wallet ON wallet.anonymous_owner_hash=qa.anonymous_subject_hash WHERE wallet.id=?1 AND wallet.state='active' AND qa.anonymous_subject_hash=?2 AND qa.idempotency_key_hash=?3 AND qa.status='in_progress' AND qa.play_mode='random' AND qa.selection_policy_version='balanced-random-v2' AND qa.deleted_at IS NULL AND qa.expires_at>?4 AND (NOT EXISTS (SELECT 1 FROM cowrie_ledger debit WHERE debit.related_attempt_id=qa.id AND debit.entry_type='quick_play_debit') OR (qa.cowrie_issued_at IS NOT NULL AND EXISTS (SELECT 1 FROM cowrie_ledger debit WHERE debit.related_attempt_id=qa.id AND debit.wallet_id=?1 AND debit.entry_type='quick_play_debit' AND debit.idempotency_domain='quick_play' AND debit.idempotency_hash=?3 AND NOT EXISTS (SELECT 1 FROM cowrie_ledger reversal WHERE reversal.reversal_of_ledger_id=debit.id)))) LIMIT 1`).bind(input.walletId, input.ownerHash, input.idempotencyHash, input.now),
    ]);
    return results.every(result => result.success) && results[1]?.results?.length === 1;
  }
  async reverseUnissued(input: CowrieTransitionInput): Promise<boolean> {
    if (!this.validTransition(input)) return false;
    const reversalHash = await sha256(`wybp-cowrie-technical-reversal-v1\u0000${input.walletId}\u0000${input.idempotencyHash}`);
    const results = await this.database.batch(cowrieTechnicalReversalStatements(this.database, input, reversalHash));
    return results.every(result => result.success) && Number(results[1]?.meta?.changes || 0) === 1;
  }
  async settleUnissuedForRecovery(wallet: CowrieWalletRow, now: number): Promise<void> {
    const pending = await this.database.prepare(`SELECT qa.idempotency_key_hash FROM quiz_attempts qa JOIN cowrie_ledger debit ON debit.related_attempt_id=qa.id JOIN cowrie_wallets wallet ON wallet.id=debit.wallet_id WHERE debit.wallet_id=?1 AND wallet.recovery_credential_hash=?2 AND wallet.state='active' AND qa.cowrie_issued_at IS NULL AND qa.status='in_progress' AND debit.entry_type='quick_play_debit' AND NOT EXISTS (SELECT 1 FROM cowrie_ledger reversal WHERE reversal.reversal_of_ledger_id=debit.id) LIMIT 101`).bind(wallet.id, wallet.recoveryCredentialHash).all<{ idempotency_key_hash: string }>();
    if (!pending.success || pending.results.length > 100) return fail("cowrie_recovery_unavailable");
    for (const attempt of pending.results) await this.reverseUnissued({ walletId: wallet.id, ownerHash: wallet.anonymousOwnerHash, idempotencyHash: attempt.idempotency_key_hash, now, recoveryHash: wallet.recoveryCredentialHash });
  }
  async getIssuedAccess(attemptId: string, walletId: string): Promise<"free" | CowrieBucket> {
    const bucket = await this.database.prepare("SELECT bucket FROM cowrie_ledger WHERE related_attempt_id=?1 AND wallet_id=?2 AND entry_type='quick_play_debit' LIMIT 1").bind(attemptId, walletId).first<string>("bucket");
    return bucket === "bonus" || bucket === "purchased" ? bucket : "free";
  }
  async getExpiredBonusBalance(walletId: string, now: number): Promise<number> {
    const amount = await this.database.prepare(`WITH credits AS (SELECT delta,bonus_expires_at,SUM(delta) OVER (ORDER BY created_at,id ROWS UNBOUNDED PRECEDING) cumulative FROM cowrie_ledger WHERE wallet_id=?1 AND bucket='bonus' AND entry_type='bonus_credit'), debits AS (SELECT COALESCE(-SUM(delta),0) used FROM cowrie_ledger WHERE wallet_id=?1 AND bucket='bonus' AND entry_type!='bonus_credit') SELECT COALESCE(SUM(MIN(delta,MAX(0,cumulative-used))),0) amount FROM credits CROSS JOIN debits WHERE bonus_expires_at<=?2`).bind(walletId, now).first<number>("amount");
    return amount ?? 0;
  }
  getCandidates(region: RegionKey, now: number) { return this.selectionRepository.getCandidates(region, now); }
  getRecentQuestionVersions(ownerHash: string, now: number) { return this.selectionRepository.getRecentQuestionVersions(ownerHash, now); }
  consumeRateLimit(ownerHash: string, action: "start" | "complete" | "clear", now: number, limit: number) { return this.selectionRepository.consumeRateLimit(ownerHash, action === "clear" ? "complete" : action, now, limit); }
  async issueQuickPlay(input: CowrieIssueInput): Promise<boolean> {
    const accessHash = await sha256(`wybp-cowrie-access-marker-v1\u0000${input.wallet.id}\u0000${input.idempotencyHash}`);
    const update = input.access === "free"
      ? this.database.prepare(`UPDATE cowrie_wallets SET free_quick_plays_consumed=free_quick_plays_consumed+1,last_access_idempotency_hash=?2,version=version+1,updated_at=?3 WHERE id=?1 AND state='active' AND version=?4 AND free_quick_plays_consumed<2`).bind(input.wallet.id, accessHash, input.startedAt, input.wallet.version)
      : this.database.prepare(`UPDATE cowrie_wallets SET last_access_idempotency_hash=?2,version=version+1,updated_at=?3 WHERE id=?1 AND state='active' AND version=?4 AND ${input.access === "bonus" ? "bonus_balance" : "purchased_balance"}>0 ${input.access === "purchased" ? "AND bonus_balance=0 AND EXISTS (SELECT 1 FROM cowrie_purchase_allocations WHERE wallet_id=?1 AND state='active' AND remaining_quantity>0)" : ""}`).bind(input.wallet.id, accessHash, input.startedAt, input.wallet.version);
    const statements = [update];
    statements.push(this.database.prepare(`INSERT INTO quiz_attempts (id,edition_id,anonymous_subject_hash,question_set_version,scoring_version,selected_question_versions_json,selection_policy_version,selection_seed_reference,play_mode,status,idempotency_key_hash,started_at,expires_at,version,created_at,updated_at) SELECT ?1,?2,anonymous_owner_hash,?3,?4,?5,?6,?7,'random','in_progress',?8,?9,?10,1,?9,?9 FROM cowrie_wallets WHERE id=?11 AND state='active' AND last_access_idempotency_hash=?12`).bind(input.attemptId, input.selection.questions[0].editionId, input.selection.questionSetVersion, input.selection.scoringVersion, selectionSnapshot(input.selection), input.selection.selectionPolicyVersion, input.selection.seedReference, input.idempotencyHash, input.startedAt, input.expiresAt, input.wallet.id, accessHash));
    if (input.access !== "free") statements.push(this.database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_attempt_id,related_allocation_id,reason_code,created_at) SELECT ?1,id,?2,'quick_play_debit',-1,'quick_play',?3,?4,${input.access === "purchased" ? "(SELECT id FROM cowrie_purchase_allocations WHERE wallet_id=?6 AND state='active' AND remaining_quantity>0 ORDER BY fulfilled_at,id LIMIT 1)" : "NULL"},'random_quick_play',?5 FROM cowrie_wallets WHERE id=?6 AND state='active' AND last_access_idempotency_hash=?7`).bind(input.ledgerId, input.access, input.idempotencyHash, input.attemptId, input.startedAt, input.wallet.id, accessHash));
    if (input.access === "purchased") statements.push(this.database.prepare(`UPDATE cowrie_purchase_allocations SET remaining_quantity=remaining_quantity-1,version=version+1,updated_at=?2 WHERE id=(SELECT related_allocation_id FROM cowrie_ledger WHERE id=?1) AND state='active' AND remaining_quantity>0`).bind(input.ledgerId, input.startedAt));
    try {
      const results = await this.database.batch(statements);
      return results.every((result) => result.success) && Number(results[1]?.meta?.changes || 0) === 1;
    } catch { return false; }
  }
  async awardBonus(input: Readonly<{ ledgerId: string; walletId: string; achievementKey: string; idempotencyHash: string; quantity: 1 | 2 | 3; now: number; qualificationOwnerHash?: string }>) {
    const [kind, region, date] = input.achievementKey.split(":");
    const wallet = await this.database.prepare("SELECT anonymous_owner_hash FROM cowrie_wallets WHERE id=?1 AND state='active'").bind(input.walletId).first<string>("anonymous_owner_hash");
    if (!wallet) return false;
    let qualified = false;
    if (kind === "perfect_region_day" && input.quantity === 1 && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date || "")) {
      const start = Date.parse(`${date}T00:00:00Z`);
      qualified = Boolean(await this.database.prepare(`SELECT r.id FROM results r JOIN quiz_attempts qa ON qa.id=r.attempt_id JOIN quiz_editions qe ON qe.id=r.edition_id WHERE qa.anonymous_subject_hash=?1 AND qe.edition_key=?2 AND qa.play_mode='random' AND qa.selection_policy_version='balanced-random-v2' AND qa.status='completed' AND r.state='active' AND r.score=12 AND r.total=12 AND r.scoring_version=qa.scoring_version AND r.created_at>=?3 AND r.created_at<?4 AND (SELECT COUNT(*) FROM answers a WHERE a.attempt_id=qa.id AND a.is_correct=1 AND a.score_awarded=1)=12 LIMIT 1`).bind(wallet, region, start, start + 86400000).first());
    } else if ((kind === "daily_streak_3" && input.quantity === 1) || (kind === "daily_streak_7" && input.quantity === 2)) {
      const threshold = kind === "daily_streak_3" ? 3 : 7;
      const qualificationOwner = input.qualificationOwnerHash || wallet;
      if (!HASH.test(qualificationOwner)) return false;
      qualified = Boolean(await this.database.prepare(`SELECT id FROM streaks WHERE anonymous_subject_hash=?1 AND (?2='all' OR streak_type=?3) AND rule_version='daily-streak-v1' AND longest_count>=?4 AND expires_at>?5 AND deleted_at IS NULL AND anonymized_at IS NULL AND last_qualified_at>=?6 AND last_qualified_at<=?5 LIMIT 1`).bind(qualificationOwner, region, `daily:${region}`, threshold, input.now, Date.parse(`${new Date(input.now).toISOString().slice(0, 10)}T00:00:00Z`)).first());
    } else if (kind === "all_region_mastery" && input.quantity === 3) {
      const count = await this.database.prepare(`SELECT COUNT(DISTINCT qe.edition_key) count FROM results r JOIN quiz_attempts qa ON qa.id=r.attempt_id JOIN quiz_editions qe ON qe.id=r.edition_id WHERE qa.anonymous_subject_hash=?1 AND qa.play_mode='random' AND qa.selection_policy_version='balanced-random-v2' AND qa.status='completed' AND r.state='active' AND r.score>=9 AND r.total=12 AND r.scoring_version='binary-exact-set-v1' AND r.question_set_version='approved-60-v1' AND r.expires_at>?2 AND (SELECT COUNT(*) FROM answers a WHERE a.attempt_id=qa.id)=12`).bind(wallet, input.now).first<number>("count");
      qualified = count === 5;
    }
    if (!qualified) return false;
    const result = await this.database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_achievement_key,reason_code,bonus_expires_at,created_at) VALUES (?1,?2,'bonus','bonus_credit',?3,'bonus',?4,?5,?8,?6,?7) ON CONFLICT(idempotency_domain,idempotency_hash) DO NOTHING`).bind(input.ledgerId, input.walletId, input.quantity, input.idempotencyHash, input.achievementKey, input.now + BONUS_COWRIE_RETENTION_MS, input.now, kind).run();
    return Boolean(result.success && Number(result.meta?.changes || 0) === 1);
  }
  async expireBonuses(input: Readonly<{ walletId: string; now: number; limit: number }>): Promise<number> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100 || !Number.isSafeInteger(input.now) || input.now <= 0) return fail("cowrie_expiry_invalid");
    let expired = 0;
    for (let index = 0; index < input.limit; index += 1) {
      const wallet = await this.database.prepare("SELECT bonus_balance,version FROM cowrie_wallets WHERE id=?1 AND state='active'").bind(input.walletId).first<{ bonus_balance: number; version: number }>();
      if (!wallet || wallet.bonus_balance === 0) break;
      const row = await this.database.prepare(`WITH credits AS (
        SELECT id,delta,bonus_expires_at,created_at,SUM(delta) OVER (ORDER BY created_at,id ROWS UNBOUNDED PRECEDING) cumulative
        FROM cowrie_ledger WHERE wallet_id=?1 AND bucket='bonus' AND entry_type='bonus_credit'
      ), debits AS (SELECT COALESCE(-SUM(delta),0) used FROM cowrie_ledger WHERE wallet_id=?1 AND bucket='bonus' AND entry_type!='bonus_credit')
      SELECT id,MIN(delta,MAX(0,cumulative-used)) remaining FROM credits CROSS JOIN debits
      WHERE bonus_expires_at<=?2 AND MIN(delta,MAX(0,cumulative-used))>0 ORDER BY created_at,id LIMIT 1`).bind(input.walletId, input.now).first<{ id: string; remaining: number }>();
      if (!row) break;
      const quantity = Math.min(wallet.bonus_balance, row.remaining);
      const hash = await sha256(`wybp-cowrie-expiry-v1\u0000${row.id}\u0000${wallet.version}`);
      const result = await this.database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,reason_code,reversal_of_ledger_id,created_at) SELECT ?1,id,'bonus','bonus_expiry',?3,'expiry',?4,'bonus_retention_expiry',?5,?6 FROM cowrie_wallets WHERE id=?2 AND state='active' AND version=?7 ON CONFLICT(idempotency_domain,idempotency_hash) DO NOTHING`).bind(`ledger_${hash.slice(0, 32)}`, input.walletId, -quantity, hash, row.id, input.now, wallet.version).run();
      if (result.success && Number(result.meta?.changes || 0) === 1) expired += quantity;
      else return fail("cowrie_expiry_conflict");
    }
    return expired;
  }
}

export const COWRIE_GAME_QUESTION_COUNT = DEFAULT_GAME_QUESTION_COUNT;

// Shared with allocation-specific adverse reconciliation; callers retain the same transaction guards.
export function cowrieTechnicalReversalStatements(database: AtomicD1Database, input: CowrieTransitionInput, reversalHash: string) {
  return [
      database.prepare(`UPDATE quiz_attempts SET status='abandoned',updated_at=?4,version=version+1 WHERE idempotency_key_hash=?3 AND anonymous_subject_hash=?2 AND status='in_progress' AND cowrie_issued_at IS NULL AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM cowrie_ledger debit JOIN cowrie_wallets wallet ON wallet.id=debit.wallet_id WHERE debit.related_attempt_id=quiz_attempts.id AND debit.wallet_id=?1 AND debit.entry_type='quick_play_debit' AND debit.idempotency_domain='quick_play' AND debit.idempotency_hash=?3 AND wallet.state='active' AND wallet.anonymous_owner_hash=?2 AND (?5 IS NULL OR wallet.recovery_credential_hash=?5) AND NOT EXISTS (SELECT 1 FROM cowrie_ledger reversal WHERE reversal.reversal_of_ledger_id=debit.id))`).bind(input.walletId, input.ownerHash, input.idempotencyHash, input.now, input.recoveryHash ?? null),
      database.prepare(`INSERT INTO cowrie_ledger (id,wallet_id,bucket,entry_type,delta,idempotency_domain,idempotency_hash,related_attempt_id,related_allocation_id,reason_code,reversal_of_ledger_id,created_at) SELECT ?5,debit.wallet_id,debit.bucket,'technical_reversal',1,'reversal',?6,qa.id,debit.related_allocation_id,'delivery_failure',debit.id,?4 FROM cowrie_ledger debit JOIN quiz_attempts qa ON qa.id=debit.related_attempt_id JOIN cowrie_wallets wallet ON wallet.id=debit.wallet_id WHERE debit.wallet_id=?1 AND debit.entry_type='quick_play_debit' AND debit.idempotency_domain='quick_play' AND debit.idempotency_hash=?3 AND qa.idempotency_key_hash=?3 AND qa.anonymous_subject_hash=?2 AND qa.cowrie_issued_at IS NULL AND qa.status='abandoned' AND qa.updated_at=?4 AND wallet.state='active' AND wallet.anonymous_owner_hash=?2 AND (?7 IS NULL OR wallet.recovery_credential_hash=?7) AND NOT EXISTS (SELECT 1 FROM cowrie_ledger reversal WHERE reversal.reversal_of_ledger_id=debit.id) ON CONFLICT DO NOTHING`).bind(input.walletId, input.ownerHash, input.idempotencyHash, input.now, `ledger_${reversalHash.slice(0, 32)}`, reversalHash, input.recoveryHash ?? null),
      database.prepare(`UPDATE cowrie_purchase_allocations SET remaining_quantity=original_quantity-(SELECT COUNT(*) FROM cowrie_ledger debit WHERE debit.related_allocation_id=cowrie_purchase_allocations.id AND debit.entry_type='quick_play_debit' AND NOT EXISTS (SELECT 1 FROM cowrie_ledger reversal WHERE reversal.reversal_of_ledger_id=debit.id)),updated_at=MAX(updated_at,?2),version=version+1 WHERE id=(SELECT related_allocation_id FROM cowrie_ledger WHERE id=?1) AND state='active' AND remaining_quantity!=original_quantity-(SELECT COUNT(*) FROM cowrie_ledger debit WHERE debit.related_allocation_id=cowrie_purchase_allocations.id AND debit.entry_type='quick_play_debit' AND NOT EXISTS (SELECT 1 FROM cowrie_ledger reversal WHERE reversal.reversal_of_ledger_id=debit.id))`).bind(`ledger_${reversalHash.slice(0, 32)}`, input.now),
  ];
}
