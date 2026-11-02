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

export type PaidFeatures = { earnPaths: boolean; shareCards: boolean; dailyChallenge: boolean; royalReveal: boolean; resultVideo: boolean };

const featuresOff: PaidFeatures = { earnPaths: false, shareCards: false, dailyChallenge: false, royalReveal: false, resultVideo: false };

export async function fetchPaidFeatures(): Promise<PaidFeatures> {
  try {
    const response = await fetch("/api/paid/catalog");
    if (!response.ok) return featuresOff;
    const body = await response.json() as { earnPaths?: boolean; shareCards?: boolean; dailyChallenge?: boolean; royalReveal?: boolean; resultVideo?: boolean };
    return {
      earnPaths: body.earnPaths === true,
      shareCards: body.shareCards === true,
      dailyChallenge: body.dailyChallenge === true,
      royalReveal: body.royalReveal === true,
      resultVideo: body.resultVideo === true,
    };
  } catch {
    return featuresOff;
  }
}

export async function recordServerResult(input: { edition: string; answers: number[][]; roundId?: string | null; questionIds?: string[] }): Promise<string | null> {
  const response = await fetch("/api/paid/games/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      edition: input.edition,
      answers: input.answers,
      playerId: readPlayerId(),
      roundId: input.roundId || undefined,
      questionIds: input.questionIds && input.questionIds.length === 12 ? input.questionIds : undefined,
    }),
  });
  if (!response.ok) return null;
  const body = await response.json() as { id?: string };
  return typeof body.id === "string" ? body.id : null;
}

export async function claimPerfect(input: { attemptId: string; edition: string; roundId: string | null; answers: number[][] }): Promise<{ reason?: string; cowries?: number } | null> {
  const response = await fetch("/api/paid/earn/perfect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: readPlayerId(), ...input }),
  });
  if (!response.ok) return null;
  window.dispatchEvent(new Event("wybp-wallet"));
  return response.json() as Promise<{ reason?: string; cowries?: number }>;
}

export async function claimShareReward(): Promise<void> {
  const response = await fetch("/api/paid/earn/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: readPlayerId() }),
  });
  if (response.ok) window.dispatchEvent(new Event("wybp-wallet"));
}

export async function recordArrival(code: string): Promise<void> {
  await fetch("/api/paid/referral/arrive", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: readPlayerId(), code }),
  });
}

export async function fetchReferral(): Promise<{ code: string; url: string } | null> {
  const response = await fetch(`/api/paid/referral?player=${readPlayerId()}`);
  if (!response.ok) return null;
  return response.json() as Promise<{ code: string; url: string }>;
}

export async function finishGame(attemptId: string): Promise<{ ok: boolean; showPaywall: boolean; freeGamesLeft: number }> {
  const response = await fetch("/api/paid/games/finish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: readPlayerId(), attemptId }),
  });
  if (!response.ok) return { ok: false, showPaywall: false, freeGamesLeft: 0 };
  sessionStorage.removeItem(ATTEMPT_KEY);
  window.dispatchEvent(new Event("wybp-wallet"));
  const payload = await response.json() as { showPaywall?: boolean; wallet?: { freeGamesLeft?: number } };
  return { ok: true, showPaywall: payload.showPaywall === true, freeGamesLeft: payload.wallet?.freeGamesLeft ?? 0 };
}
