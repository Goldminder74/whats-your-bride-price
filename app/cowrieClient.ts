import type { PublicCowrieWallet } from "../db/cowrieWallet.ts";

const walletReference = /^cw_[0-9a-f]{32}$/;
const recoveryCredential = /^[0-9a-f]{64}$/;
function parseWallet(value: unknown): PublicCowrieWallet {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("cowrie_wallet_unavailable");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.walletReference !== "string" || !walletReference.test(candidate.walletReference)
    || !["active", "frozen"].includes(String(candidate.state))
    || !Number.isInteger(candidate.totalBalance) || Number(candidate.totalBalance) < 0
    || !Number.isInteger(candidate.purchasedBalance) || Number(candidate.purchasedBalance) < 0
    || !Number.isInteger(candidate.bonusBalance) || Number(candidate.bonusBalance) < 0
    || !Number.isInteger(candidate.freeQuickPlaysRemaining) || Number(candidate.freeQuickPlaysRemaining) < 0 || Number(candidate.freeQuickPlaysRemaining) > 2
    || candidate.bonusExpiresAfterDays !== 180
    || Number(candidate.totalBalance) !== Number(candidate.purchasedBalance) + Number(candidate.bonusBalance)) throw new Error("cowrie_wallet_unavailable");
  return Object.freeze(candidate as PublicCowrieWallet);
}
async function post(path: string, body: Record<string, unknown>, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  const response = await fetcher(path, { method: "POST", mode: "same-origin", credentials: "omit", referrerPolicy: "no-referrer", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const value = await response.json() as Record<string, unknown>;
  if (!response.ok || value.available !== true) throw new Error("cowrie_wallet_unavailable");
  return value;
}
export async function openCowrieWallet(anonymousSessionCredential: string, fetcher: typeof fetch = fetch): Promise<Readonly<{ wallet: PublicCowrieWallet; recoveryCredential?: string }>> {
  const value = await post("/cowries/wallet", { anonymousSessionCredential }, fetcher);
  const credential = value.recoveryCredential;
  if (credential !== undefined && (typeof credential !== "string" || !recoveryCredential.test(credential))) throw new Error("cowrie_wallet_unavailable");
  return Object.freeze({ wallet: parseWallet(value.wallet), ...(credential ? { recoveryCredential: credential } : {}) });
}
export async function readCowrieWallet(anonymousSessionCredential: string, fetcher: typeof fetch = fetch): Promise<PublicCowrieWallet> {
  const value = await post("/cowries/projection", { anonymousSessionCredential }, fetcher);
  return parseWallet(value.wallet);
}
export async function recoverCowrieWallet(input: Readonly<{ walletReference: string; recoveryCredential: string; anonymousSessionCredential: string }>, rotate = false, fetcher: typeof fetch = fetch): Promise<Readonly<{ wallet: PublicCowrieWallet; recoveryCredential?: string }>> {
  const value = await post(rotate ? "/cowries/rotate" : "/cowries/recover", { ...input }, fetcher);
  const credential = value.recoveryCredential;
  if (credential !== undefined && (typeof credential !== "string" || !recoveryCredential.test(credential))) throw new Error("cowrie_wallet_unavailable");
  return Object.freeze({ wallet: parseWallet(value.wallet), ...(credential ? { recoveryCredential: credential } : {}) });
}

export async function clearCowrieWallet(anonymousSessionCredential: string, fetcher: typeof fetch = fetch): Promise<"deleted" | "frozen"> {
  const response = await fetcher("/cowries/clear", { method: "POST", mode: "same-origin", credentials: "omit", referrerPolicy: "no-referrer", headers: { "content-type": "application/json" }, body: JSON.stringify({ anonymousSessionCredential }) });
  const value = await response.json() as Record<string, unknown>;
  if (!response.ok || value.unavailable !== true || !["deleted", "frozen"].includes(String(value.state))) throw new Error("cowrie_wallet_unavailable");
  return value.state as "deleted" | "frozen";
}
