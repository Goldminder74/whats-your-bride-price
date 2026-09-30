import { CowrieWalletService, BONUS_COWRIE_RETENTION_MS, type CowrieIssueInput, type CowrieWalletRepository, type CowrieWalletRow } from "../db/cowrieWallet.ts";
import type { QuestionSelection, SelectableQuestion, StoredQuestionSelection } from "../db/questionSelection.ts";
import type { RegionKey } from "./publicGameData.ts";

const wallets = new Map<string, CowrieWalletRow>();
const references = new Map<string, CowrieWalletRow>();
const attempts = new Map<string, Readonly<{ hash: string; owner: string; value: StoredQuestionSelection }>>();
function candidates(region: RegionKey): readonly SelectableQuestion[] {
  return Object.freeze(Array.from({ length: 30 }, (_, index) => Object.freeze({
    internalId: `review_${region}_${index}`, editionId: `edition_${region}_review`, stableId: `${region}_cowrie_${String(index + 1).padStart(2, "0")}`,
    version: 1, region, category: ["HISTORY", "FOOD", "MUSIC", "ART"][index % 4], difficulty: "introductory" as const,
    questionKind: "single" as const, questionText: `Cowrie Wallet review question ${index + 1}`,
    visualStart: null, answerOptions: Object.freeze([1, 2, 3, 4].map((option) => Object.freeze({ id: `o${option}`, text: `Review choice ${option}` }))),
    acceptedAnswers: Object.freeze([Object.freeze(["o1"])]), explanation: "Authorised local review fixture explanation.", scoringWeight: 1,
    lifecycleStatus: "published" as const, sourceReviewStatus: "approved" as const, publishedAt: 1, retiredAt: null, validFrom: 1, validUntil: null,
    imageProvenance: Object.freeze([]), audioProvenance: Object.freeze([]),
  })));
}
function replace(row: CowrieWalletRow): void { wallets.set(row.anonymousOwnerHash, row); references.set(row.publicReference, row); }

const repository: CowrieWalletRepository = {
  storageAvailable: true,
  async getWalletByOwner(owner) { return wallets.get(owner) || null; },
  async getWalletByReference(reference) { return references.get(reference) || null; },
  async createWallet(input) { if (wallets.has(input.ownerHash)) return false; replace(Object.freeze({ id: input.id, publicReference: input.publicReference, anonymousOwnerHash: input.ownerHash, state: "active", freeQuickPlaysConsumed: 0, purchasedBalance: 1, bonusBalance: 2, recoveryCredentialHash: input.recoveryHash, recoveryCredentialVersion: 1, version: 1 })); return true; },
  async updateRecovery(input) { const prior = [...references.values()].find((row) => row.id === input.walletId && row.version === input.expectedVersion); if (!prior || wallets.has(input.ownerHash) && wallets.get(input.ownerHash)?.id !== prior.id) return false; wallets.delete(prior.anonymousOwnerHash); replace(Object.freeze({ ...prior, anonymousOwnerHash: input.ownerHash, recoveryCredentialHash: input.recoveryHash, recoveryCredentialVersion: prior.recoveryCredentialVersion + 1, version: prior.version + 1 })); return true; },
  async clearWallet(input) { const prior = wallets.get(input.ownerHash); if (!prior || prior.id !== input.walletId || prior.version !== input.expectedVersion) return "conflict"; replace(Object.freeze({ ...prior, state: "frozen", version: prior.version + 1 })); return "frozen"; },
  async getAttemptByIdempotencyHash(hash, owner, now) { const value = [...attempts.values()].find((entry) => entry.hash === hash && entry.owner === owner && entry.value.expiresAt > now); return value?.value || null; },
  async getIssuedAccess() { return "free"; },
  async commitIssuance(input) { return [...attempts.values()].some(entry => entry.hash === input.idempotencyHash && entry.owner === input.ownerHash) && wallets.get(input.ownerHash)?.state === "active"; },
  async reverseUnissued() { return false; },
  async settleUnissuedForRecovery() {},
  async getExpiredBonusBalance() { return 0; },
  async getCandidates(region) { return candidates(region); },
  async getRecentQuestionVersions() { return []; },
  async issueQuickPlay(input: CowrieIssueInput) { const current = [...wallets.values()].find((row) => row.id === input.wallet.id); if (!current || current.version !== input.wallet.version || current.state !== "active") return false; if ([...attempts.values()].some((entry) => entry.hash === input.idempotencyHash)) return false; let updated = current; if (input.access === "free" && current.freeQuickPlaysConsumed < 2) updated = Object.freeze({ ...current, freeQuickPlaysConsumed: current.freeQuickPlaysConsumed + 1, version: current.version + 1 }); else if (input.access === "bonus" && current.bonusBalance > 0) updated = Object.freeze({ ...current, bonusBalance: current.bonusBalance - 1, version: current.version + 1 }); else if (input.access === "purchased" && current.purchasedBalance > 0) updated = Object.freeze({ ...current, purchasedBalance: current.purchasedBalance - 1, version: current.version + 1 }); else return false; replace(updated); attempts.set(input.attemptId, Object.freeze({ hash: input.idempotencyHash, owner: current.anonymousOwnerHash, value: Object.freeze({ attemptId: input.attemptId, region: input.selection.questions[0].region, expiresAt: input.expiresAt, selection: input.selection as QuestionSelection }) })); return true; },
  async consumeRateLimit() { return "allowed"; },
  async awardBonus(input) { const current = [...wallets.values()].find((row) => row.id === input.walletId); if (!current) return false; replace(Object.freeze({ ...current, bonusBalance: current.bonusBalance + input.quantity, version: current.version + 1 })); return true; },
  async expireBonuses(input) { const current = [...wallets.values()].find((row) => row.id === input.walletId); if (!current || current.bonusBalance === 0 || input.now < BONUS_COWRIE_RETENTION_MS) return 0; const quantity = Math.min(current.bonusBalance, input.limit); replace(Object.freeze({ ...current, bonusBalance: current.bonusBalance - quantity, version: current.version + 1 })); return quantity; },
};

let service: CowrieWalletService | null = null;
export function getCowrieReviewRuntime(): CowrieWalletService { return service ||= new CowrieWalletService(repository); }

// Imported only by the explicitly authorised, server-side commerce review runtime.
export function getReviewCowrieWallet(reference: string): CowrieWalletRow | null { return references.get(reference) || null; }
export function getReviewCowrieWalletById(id: string): CowrieWalletRow | null { return [...references.values()].find(row => row.id === id) || null; }
