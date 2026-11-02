const PLAYER_KEY = "wybp-player";
const ATTEMPT_KEY = "wybp-attempt";

export type Wallet = {
  cowries: number;
  freeGamesLeft: number;
  royal: boolean;
  gameCost?: number;
};

export function readPlayerId(): string {
  const existing = localStorage.getItem(PLAYER_KEY) || "";
  if (/^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
  const created = crypto.randomUUID().replaceAll("-", "");
  localStorage.setItem(PLAYER_KEY, created);
  return created;
}

export async function fetchWallet(): Promise<Wallet | null> {
  const response = await fetch(`/api/paid/access?player=${readPlayerId()}`);
  if (!response.ok) return null;
  return response.json() as Promise<Wallet>;
}

export async function beginGame(edition: string): Promise<
  { ok: true; attemptId: string; edition: string; mode: "free" | "paid"; resumed: boolean; freeGamesLeft: number; cowries: number }
  | { ok: false; paywall: true }
> {
  let attemptId = sessionStorage.getItem(ATTEMPT_KEY) || "";
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(attemptId)) {
    attemptId = crypto.randomUUID().replaceAll("-", "");
    sessionStorage.setItem(ATTEMPT_KEY, attemptId);
  }
  const response = await fetch("/api/paid/games/begin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: readPlayerId(), attemptId, edition }),
  });
  const payload = await response.json() as { error?: string; attemptId?: string; edition?: string; mode?: "free" | "paid"; resumed?: boolean; freeGamesLeft?: number; cowries?: number };
  if (response.status === 402 || payload.error === "cowries_required") return { ok: false, paywall: true };
  if (!response.ok || !payload.attemptId || !payload.edition || !payload.mode) throw new Error("begin_failed");
  sessionStorage.setItem(ATTEMPT_KEY, payload.attemptId);
  window.dispatchEvent(new Event("wybp-wallet"));
  return { ok: true, attemptId: payload.attemptId, edition: payload.edition, mode: payload.mode, resumed: payload.resumed === true, freeGamesLeft: payload.freeGamesLeft ?? 0, cowries: payload.cowries ?? 0 };
}

export async function finishGame(attemptId: string): Promise<{ showPaywall: boolean; freeGamesLeft: number }> {
  const response = await fetch("/api/paid/games/finish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: readPlayerId(), attemptId }),
  });
  if (!response.ok) return { showPaywall: false, freeGamesLeft: 0 };
  sessionStorage.removeItem(ATTEMPT_KEY);
  window.dispatchEvent(new Event("wybp-wallet"));
  const payload = await response.json() as { showPaywall?: boolean; wallet?: { freeGamesLeft?: number } };
  return { showPaywall: payload.showPaywall === true, freeGamesLeft: payload.wallet?.freeGamesLeft ?? 0 };
}
