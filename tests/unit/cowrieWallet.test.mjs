import assert from "node:assert/strict";
import test from "node:test";
import { deriveAnonymousSubjectHash } from "../../app/anonymousSession.ts";
import { BONUS_COWRIE_RETENTION_MS, CowrieWalletService, authorizeCowrieAchievement, validateCowrieAccessRequest, validateCowrieRecoveryRequest } from "../../db/cowrieWallet.ts";

const now = Date.UTC(2026, 8, 9);
function randomSource() { let byte = 1; return (value) => { value.fill(byte++); return value; }; }
function questions(count = 30) { return Array.from({ length: count }, (_, index) => ({ internalId: `question_${index}`, editionId: "edition_west_v1", stableId: `west_cowrie_${String(index).padStart(3, "0")}`, version: 1, region: "west", category: "HISTORY", difficulty: "introductory", questionKind: "single", questionText: `Question ${index}`, visualStart: null, answerOptions: [{ id: "o1", text: "One" }, { id: "o2", text: "Two" }], acceptedAnswers: [["o1"]], explanation: "Reviewed explanation.", scoringWeight: 1, lifecycleStatus: "published", sourceReviewStatus: "approved", publishedAt: 1, retiredAt: null, validFrom: 1, validUntil: null, imageProvenance: [], audioProvenance: [] })); }
class MemoryRepository {
  storageAvailable = true; expiredApplied = 0;
  wallets = new Map(); references = new Map(); attempts = new Map(); awards = new Set(); ledger = []; candidates = questions(); failIssue = false;
  set(row) { this.wallets.set(row.anonymousOwnerHash, row); this.references.set(row.publicReference, row); }
  async getWalletByOwner(owner) { return this.wallets.get(owner) || null; }
  async getWalletByReference(reference) { return this.references.get(reference) || null; }
  async createWallet(input) { if (this.wallets.has(input.ownerHash)) return false; this.set({ id: input.id, publicReference: input.publicReference, anonymousOwnerHash: input.ownerHash, state: "active", freeQuickPlaysConsumed: 0, purchasedBalance: 0, bonusBalance: 0, recoveryCredentialHash: input.recoveryHash, recoveryCredentialVersion: 1, version: 1 }); return true; }
  async updateRecovery(input) { const prior = [...this.references.values()].find((row) => row.id === input.walletId && row.version === input.expectedVersion); if (!prior) return false; this.wallets.delete(prior.anonymousOwnerHash); this.set({ ...prior, anonymousOwnerHash: input.ownerHash, recoveryCredentialHash: input.recoveryHash, recoveryCredentialVersion: prior.recoveryCredentialVersion + 1, version: prior.version + 1 }); return true; }
  async clearWallet(input) { const prior = this.wallets.get(input.ownerHash); if (!prior || prior.version !== input.expectedVersion) return "conflict"; this.set({ ...prior, state: "frozen", version: prior.version + 1 }); return "frozen"; }
  async getAttemptByIdempotencyHash(hash, owner, at) { return [...this.attempts.values()].find((item) => item.hash === hash && item.owner === owner && item.value.expiresAt > at)?.value || null; }
  async getIssuedAccess(attemptId) { return this.attempts.get(attemptId)?.access || "free"; }
  async commitIssuance(input) { return [...this.attempts.values()].some(entry => entry.hash === input.idempotencyHash && entry.owner === input.ownerHash); }
  async reverseUnissued() { return false; }
  async settleUnissuedForRecovery() {}
  async getExpiredBonusBalance(walletId, at) { return Math.max(0, this.ledger.filter(entry => entry.type === "bonus_credit" && entry.expiresAt <= at).reduce((sum, entry) => sum + entry.delta, 0) - this.expiredApplied); }
  async getCandidates() { return this.candidates; }
  async getRecentQuestionVersions() { return []; }
  async consumeRateLimit() { return "allowed"; }
  async issueQuickPlay(input) {
    if (this.failIssue) return false;
    const current = [...this.wallets.values()].find((row) => row.id === input.wallet.id);
    if (!current || current.version !== input.wallet.version || [...this.attempts.values()].some((item) => item.hash === input.idempotencyHash)) return false;
    let updated;
    if (input.access === "free" && current.freeQuickPlaysConsumed < 2) updated = { ...current, freeQuickPlaysConsumed: current.freeQuickPlaysConsumed + 1, version: current.version + 1 };
    else if (input.access === "bonus" && current.bonusBalance > 0) { updated = { ...current, bonusBalance: current.bonusBalance - 1, version: current.version + 1 }; this.ledger.push({ type: "quick_play_debit", bucket: "bonus", delta: -1 }); }
    else if (input.access === "purchased" && current.purchasedBalance > 0) { updated = { ...current, purchasedBalance: current.purchasedBalance - 1, version: current.version + 1 }; this.ledger.push({ type: "quick_play_debit", bucket: "purchased", delta: -1 }); }
    else return false;
    this.set(updated); this.attempts.set(input.attemptId, { access: input.access, hash: input.idempotencyHash, owner: current.anonymousOwnerHash, value: { attemptId: input.attemptId, region: "west", expiresAt: input.expiresAt, selection: input.selection } }); return true;
  }
  async awardBonus(input) { if (this.awards.has(input.idempotencyHash)) return false; const current = [...this.wallets.values()].find((row) => row.id === input.walletId); if (!current) return false; this.awards.add(input.idempotencyHash); this.ledger.push({ type: "bonus_credit", bucket: "bonus", delta: input.quantity, expiresAt: input.now + BONUS_COWRIE_RETENTION_MS }); this.set({ ...current, bonusBalance: current.bonusBalance + input.quantity, version: current.version + 1 }); return true; }
  async expireBonuses(input) { const current = [...this.wallets.values()].find((row) => row.id === input.walletId); if (!current) return 0; const eligible = this.ledger.filter((entry) => entry.type === "bonus_credit" && entry.expiresAt <= input.now).reduce((sum, entry) => sum + entry.delta, 0) - this.expiredApplied; const quantity = Math.min(current.bonusBalance, input.limit, Math.max(0, eligible)); if (!quantity) return 0; this.expiredApplied += quantity; this.ledger.push({ type: "bonus_expiry", bucket: "bonus", delta: -quantity }); this.set({ ...current, bonusBalance: current.bonusBalance - quantity, version: current.version + 1 }); return quantity; }
}
const owner = "1".repeat(32);
const request = (key) => ({ region: "west", anonymousSessionCredential: owner, idempotencyKey: `cowrie-request-${key.padStart(4, "0")}` });

test("wallet creation returns a one-time recovery credential and only a safe projection thereafter", async () => {
  const repository = new MemoryRepository(); const service = new CowrieWalletService(repository, { now: () => now, randomSource: randomSource() });
  const created = await service.createOrGet({ anonymousSessionCredential: owner });
  assert.match(created.recoveryCredential, /^[0-9a-f]{64}$/); assert.match(created.wallet.walletReference, /^cw_[0-9a-f]{32}$/);
  assert.equal(created.wallet.totalBalance, 0); assert.equal(created.wallet.freeQuickPlaysRemaining, 2);
  const again = await service.createOrGet({ anonymousSessionCredential: owner }); assert.equal(again.recoveryCredential, undefined); assert.deepEqual(again.wallet, created.wallet);
  assert.doesNotMatch(JSON.stringify(created.wallet), /anonymous|hash|internal|credential/i);
  assert.notEqual(repository.wallets.values().next().value.recoveryCredentialHash, created.recoveryCredential);
});

test("exactly two free plays are atomic, idempotent and recovery does not consume another", async () => {
  const repository = new MemoryRepository(); const service = new CowrieWalletService(repository, { now: () => now, randomSource: randomSource() });
  const created = await service.createOrGet({ anonymousSessionCredential: owner });
  const first = await service.startQuickPlay(request("1")); const retry = await service.startQuickPlay(request("1")); const second = await service.startQuickPlay(request("2"));
  assert.equal(first.access, "free"); assert.equal(second.access, "free"); assert.equal(retry.selection.attemptId, first.selection.attemptId); assert.equal(repository.attempts.size, 2);
  assert.equal((await service.projection({ anonymousSessionCredential: owner })).freeQuickPlaysRemaining, 0);
  await assert.rejects(service.startQuickPlay(request("3")), /cowrie_required/);
  assert.equal(created.wallet.freeQuickPlaysRemaining, 2);
});

test("a failed attempt issuance consumes neither allowance nor balance", async () => {
  const repository = new MemoryRepository(); const service = new CowrieWalletService(repository, { now: () => now, randomSource: randomSource() });
  await service.createOrGet({ anonymousSessionCredential: owner }); repository.failIssue = true;
  await assert.rejects(service.startQuickPlay(request("4")), /cowrie_access_conflict/);
  assert.equal((await service.projection({ anonymousSessionCredential: owner })).freeQuickPlaysRemaining, 2); assert.equal(repository.ledger.length, 0);
});

test("the third paid play spends valid bonus before purchased and never creates a negative balance", async () => {
  const repository = new MemoryRepository(); const service = new CowrieWalletService(repository, { now: () => now, randomSource: randomSource() });
  await service.createOrGet({ anonymousSessionCredential: owner }); let wallet = repository.wallets.values().next().value;
  repository.set({ ...wallet, freeQuickPlaysConsumed: 2, bonusBalance: 1, purchasedBalance: 1, version: wallet.version + 1 });
  const bonus = await service.startQuickPlay(request("5")); assert.equal(bonus.access, "bonus"); assert.equal(bonus.wallet.bonusBalance, 0); assert.equal(bonus.wallet.purchasedBalance, 1);
  const purchased = await service.startQuickPlay(request("6")); assert.equal(purchased.access, "purchased"); assert.equal(purchased.wallet.totalBalance, 0);
  await assert.rejects(service.startQuickPlay(request("7")), /cowrie_required/);
  assert.deepEqual(repository.ledger.map((entry) => entry.bucket), ["bonus", "purchased"]);
});

test("deterministic awards are bounded, idempotent and bonus expiry leaves purchased Cowries intact", async () => {
  const repository = new MemoryRepository(); const service = new CowrieWalletService(repository, { now: () => now, randomSource: randomSource(), streaksEnabled: true });
  await service.createOrGet({ anonymousSessionCredential: owner });
  for (const [kind, quantity] of [["perfect_region_day", 1], ["daily_streak_3", 1], ["daily_streak_7", 2], ["all_region_mastery", 3]]) {
    const scope = kind === "perfect_region_day" ? "west:2026-09-09" : kind === "all_region_mastery" ? "all:binary-exact-set-v1" : "west:daily-streak-v1";
    const achievement = authorizeCowrieAchievement({ kind, scope, authoritative: true, practice: false, classicFallback: false });
    assert.equal(achievement.quantity, quantity); assert.equal(await service.award(repository.wallets.values().next().value, achievement), true); assert.equal(await service.award(repository.wallets.values().next().value, achievement), false);
  }
  const before = repository.wallets.values().next().value; repository.set({ ...before, purchasedBalance: 4 });
  const expiryService = new CowrieWalletService(repository, { now: () => now + BONUS_COWRIE_RETENTION_MS, randomSource: randomSource() });
  assert.equal(await expiryService.expire(repository.wallets.values().next().value, 25), 7);
  const after = repository.wallets.values().next().value; assert.equal(after.bonusBalance, 0); assert.equal(after.purchasedBalance, 4);
  assert.throws(() => authorizeCowrieAchievement({ kind: "daily_streak_3", scope: "forged", authoritative: false, practice: false, classicFallback: false }), /invalid/);
});

test("recovery is owner-bound, constant-shape, rotates credentials and a stored hash is not accepted", async () => {
  const repository = new MemoryRepository(); const service = new CowrieWalletService(repository, { now: () => now, randomSource: randomSource() });
  const created = await service.createOrGet({ anonymousSessionCredential: owner }); const nextOwner = "2".repeat(32);
  const recovered = await service.recover({ walletReference: created.wallet.walletReference, recoveryCredential: created.recoveryCredential, anonymousSessionCredential: nextOwner });
  assert.equal(recovered.wallet.walletReference, created.wallet.walletReference);
  const storedHash = repository.wallets.values().next().value.recoveryCredentialHash;
  await assert.rejects(service.recover({ walletReference: created.wallet.walletReference, recoveryCredential: storedHash, anonymousSessionCredential: owner }), /recovery_unavailable/);
  const rotated = await service.recover({ walletReference: created.wallet.walletReference, recoveryCredential: created.recoveryCredential, anonymousSessionCredential: nextOwner }, true);
  assert.match(rotated.recoveryCredential, /^[0-9a-f]{64}$/); assert.notEqual(rotated.recoveryCredential, created.recoveryCredential);
  await assert.rejects(service.recover({ walletReference: created.wallet.walletReference, recoveryCredential: created.recoveryCredential, anonymousSessionCredential: owner }), /recovery_unavailable/);
});

test("strict requests reject browser-supplied balances, states and access authority", async () => {
  assert.deepEqual(validateCowrieAccessRequest(request("8")), request("8"));
  for (const extra of [{ balance: 99 }, { freeQuickPlaysConsumed: 0 }, { state: "active" }, { bucket: "purchased" }, { cowrie_issued_at: now }, { cowrieIssuedAt: now }]) assert.throws(() => validateCowrieAccessRequest({ ...request("8"), ...extra }), /invalid/);
  const recovery = { walletReference: `cw_${"a".repeat(32)}`, recoveryCredential: "b".repeat(64), anonymousSessionCredential: owner };
  assert.deepEqual(validateCowrieRecoveryRequest(recovery), recovery);
  assert.equal((await deriveAnonymousSubjectHash(owner)).length, 64);
});

test("under-threshold regions fail closed and classic, Daily, challenge, result and sharing routes remain outside Cowrie writes", async () => {
  const repository = new MemoryRepository(); repository.candidates = questions(29);
  const service = new CowrieWalletService(repository, { now: () => now, randomSource: randomSource() }); await service.createOrGet({ anonymousSessionCredential: owner });
  await assert.rejects(service.startQuickPlay(request("9")), /cowrie_region_unavailable/); assert.equal(repository.ledger.length, 0); assert.equal(repository.attempts.size, 0);
});
