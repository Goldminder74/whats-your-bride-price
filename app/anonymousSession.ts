export const anonymousSessionStorageKey = "wybp-anonymous-session-v1";
export const anonymousSessionVersion = 1;
export const anonymousSessionLifetimeMs = 24 * 60 * 60 * 1000;
export const anonymousSessionEntropyBytes = 16;

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type CryptoLike = Pick<Crypto, "getRandomValues">;

type StoredAnonymousSession = Readonly<{
  version: 1;
  id: string;
  createdAt: number;
  expiresAt: number;
}>;

export type AnonymousSessionResult = Readonly<
  | { available: true; sessionId: string; expiresAt: number; rotated: boolean }
  | { available: false; reason: "crypto_unavailable" | "storage_unavailable" }
>;

const sessionIdPattern = /^[0-9a-f]{32}$/;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function deriveAnonymousSubjectHash(sessionId: string): Promise<string | null> {
  if (!sessionIdPattern.test(sessionId) || !globalThis.crypto?.subtle) return null;
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`wybp-anonymous-subject-v1\u0000${sessionId}`),
    );
    return bytesToHex(new Uint8Array(digest));
  } catch {
    return null;
  }
}

function parseStoredSession(raw: string | null, now: number): StoredAnonymousSession | null {
  if (!raw || raw.length > 256) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== anonymousSessionVersion
    || typeof candidate.id !== "string"
    || !sessionIdPattern.test(candidate.id)
    || !Number.isFinite(candidate.createdAt)
    || !Number.isFinite(candidate.expiresAt)
    || (candidate.createdAt as number) > now + 60_000
    || (candidate.expiresAt as number) <= now
    || (candidate.expiresAt as number) - (candidate.createdAt as number) !== anonymousSessionLifetimeMs
  ) return null;
  return Object.freeze({
    version: 1,
    id: candidate.id,
    createdAt: candidate.createdAt as number,
    expiresAt: candidate.expiresAt as number,
  });
}

function secureSessionId(cryptoApi: CryptoLike | null | undefined): string | null {
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") return null;
  try {
    const bytes = new Uint8Array(anonymousSessionEntropyBytes);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export function getOrCreateAnonymousSession(
  storage: SessionStorageLike,
  cryptoApi: CryptoLike | null | undefined = globalThis.crypto,
  now = Date.now(),
): AnonymousSessionResult {
  try {
    const existing = parseStoredSession(storage.getItem(anonymousSessionStorageKey), now);
    if (existing) return Object.freeze({ available: true, sessionId: existing.id, expiresAt: existing.expiresAt, rotated: false });
    storage.removeItem(anonymousSessionStorageKey);
    const sessionId = secureSessionId(cryptoApi);
    if (!sessionId) return Object.freeze({ available: false, reason: "crypto_unavailable" });
    const record: StoredAnonymousSession = Object.freeze({
      version: 1,
      id: sessionId,
      createdAt: now,
      expiresAt: now + anonymousSessionLifetimeMs,
    });
    storage.setItem(anonymousSessionStorageKey, JSON.stringify(record));
    return Object.freeze({ available: true, sessionId, expiresAt: record.expiresAt, rotated: true });
  } catch {
    return Object.freeze({ available: false, reason: "storage_unavailable" });
  }
}

export function clearAnonymousSession(storage: SessionStorageLike): boolean {
  try {
    storage.removeItem(anonymousSessionStorageKey);
    return true;
  } catch {
    return false;
  }
}
