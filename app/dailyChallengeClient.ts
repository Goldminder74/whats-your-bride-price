import type { RegionKey } from "./gameData.ts";
import { getOrCreateAnonymousSession, type AnonymousSessionResult } from "./anonymousSession.ts";

export const DAILY_RECOVERY_STORAGE_KEY = "wybp-daily-recovery-v1";
export const DAILY_RECOVERY_VERSION = 2;
export const DAILY_OWNERSHIP_STORAGE_KEY = "wybp-daily-owner-v1";
export const DAILY_OWNERSHIP_VERSION = 1;
export const DAILY_OWNERSHIP_MAX_LIFETIME_MS = 180 * 86_400_000;
export type DailyRecovery = Readonly<{
  version: 2;
  attemptId: string;
  startIdempotencyKey: string;
  date: string;
  region: RegionKey;
  mode: "official" | "practice";
  questionRefs: readonly string[];
  answerOptionIds: readonly (readonly string[])[];
  expiresAt: number;
}>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const regions = new Set<RegionKey>(["west", "east", "central", "north", "south"]);
const credentialPattern = /^[0-9a-f]{32}$/;

type DailyOwnershipRecord = Readonly<{ version: 1; id: string; expiresAt: number }>;

function parseDailyOwnership(raw: string | null): DailyOwnershipRecord | null {
  if (!raw || raw.length > 192) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (candidate.version !== DAILY_OWNERSHIP_VERSION || typeof candidate.id !== "string"
      || !credentialPattern.test(candidate.id) || typeof candidate.expiresAt !== "number"
      || !Number.isFinite(candidate.expiresAt) || candidate.expiresAt < 0) return null;
    return Object.freeze({ version: 1, id: candidate.id, expiresAt: candidate.expiresAt });
  } catch { return null; }
}

export function readDailyOwnership(storage: Pick<Storage, "getItem">, now = Date.now()): AnonymousSessionResult {
  try {
    const existing = parseDailyOwnership(storage.getItem(DAILY_OWNERSHIP_STORAGE_KEY));
    if (!existing || existing.expiresAt <= now || existing.expiresAt > now + DAILY_OWNERSHIP_MAX_LIFETIME_MS) {
      return Object.freeze({ available: false, reason: "storage_unavailable" });
    }
    return existing
      ? Object.freeze({ available: true, sessionId: existing.id, expiresAt: existing.expiresAt, rotated: false })
      : Object.freeze({ available: false, reason: "storage_unavailable" });
  } catch { return Object.freeze({ available: false, reason: "storage_unavailable" }); }
}

export function readDailyOwnershipForClear(storage: Pick<Storage, "getItem">): AnonymousSessionResult {
  try {
    const existing = parseDailyOwnership(storage.getItem(DAILY_OWNERSHIP_STORAGE_KEY));
    return existing
      ? Object.freeze({ available: true, sessionId: existing.id, expiresAt: existing.expiresAt, rotated: false })
      : Object.freeze({ available: false, reason: "storage_unavailable" });
  } catch { return Object.freeze({ available: false, reason: "storage_unavailable" }); }
}

export function getOrCreateDailyOwnership(
  local: StorageLike,
  session: StorageLike,
  initialExpiresAt: number,
  cryptoApi: Pick<Crypto, "getRandomValues"> | null | undefined = globalThis.crypto,
  now = Date.now(),
): AnonymousSessionResult {
  const existing = readDailyOwnership(local, now);
  if (existing.available) return existing;
  if (!Number.isFinite(initialExpiresAt) || initialExpiresAt <= now || initialExpiresAt > now + DAILY_OWNERSHIP_MAX_LIFETIME_MS) {
    return Object.freeze({ available: false, reason: "storage_unavailable" });
  }
  const sessionCredential = getOrCreateAnonymousSession(session, cryptoApi, now);
  if (!sessionCredential.available) return sessionCredential;
  try {
    local.removeItem(DAILY_OWNERSHIP_STORAGE_KEY);
    local.setItem(DAILY_OWNERSHIP_STORAGE_KEY, JSON.stringify({ version: DAILY_OWNERSHIP_VERSION, id: sessionCredential.sessionId, expiresAt: initialExpiresAt }));
    return Object.freeze({ available: true, sessionId: sessionCredential.sessionId, expiresAt: initialExpiresAt, rotated: sessionCredential.rotated });
  } catch { return Object.freeze({ available: false, reason: "storage_unavailable" }); }
}

export function extendDailyOwnership(storage: StorageLike, sessionId: string, expiresAt: number, now = Date.now()): boolean {
  const existing = readDailyOwnership(storage, now);
  if (!existing.available || existing.sessionId !== sessionId || !Number.isFinite(expiresAt)
    || expiresAt <= now || expiresAt > now + DAILY_OWNERSHIP_MAX_LIFETIME_MS) return false;
  try {
    storage.setItem(DAILY_OWNERSHIP_STORAGE_KEY, JSON.stringify({ version: DAILY_OWNERSHIP_VERSION, id: sessionId, expiresAt }));
    return true;
  } catch { return false; }
}

export function clearDailyOwnership(storage: Pick<Storage, "removeItem">): boolean {
  try { storage.removeItem(DAILY_OWNERSHIP_STORAGE_KEY); return true; } catch { return false; }
}

export function createDailyIdempotencyKey(cryptoApi: Pick<Crypto, "randomUUID"> = crypto): string {
  return `daily-${cryptoApi.randomUUID().toLowerCase()}`;
}

export function writeDailyRecovery(storage: StorageLike, value: DailyRecovery): boolean {
  try { storage.setItem(DAILY_RECOVERY_STORAGE_KEY, JSON.stringify(value)); return true; } catch { return false; }
}

export function readDailyRecovery(storage: StorageLike, now: number): DailyRecovery | null {
  let parsed: unknown;
  try { parsed = JSON.parse(storage.getItem(DAILY_RECOVERY_STORAGE_KEY) || "null"); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (value.version !== DAILY_RECOVERY_VERSION || typeof value.attemptId !== "string" || !/^attempt_[0-9a-f]{48}$/.test(value.attemptId)
    || typeof value.startIdempotencyKey !== "string" || !/^[A-Za-z0-9._~-]{16,128}$/.test(value.startIdempotencyKey)
    || typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)
    || typeof value.region !== "string" || !regions.has(value.region as RegionKey)
    || (value.mode !== "official" && value.mode !== "practice")
    || !Array.isArray(value.questionRefs) || value.questionRefs.length !== 12 || value.questionRefs.some((item) => typeof item !== "string")
    || !Array.isArray(value.answerOptionIds) || value.answerOptionIds.length > 12
    || value.answerOptionIds.some((set) => !Array.isArray(set) || set.some((item) => typeof item !== "string" || !/^o[1-9][0-9]?$/.test(item)))
    || typeof value.expiresAt !== "number" || value.expiresAt <= now) return null;
  return Object.freeze({
    version: 2, attemptId: value.attemptId, startIdempotencyKey: value.startIdempotencyKey, date: value.date, region: value.region as RegionKey,
    mode: value.mode, questionRefs: Object.freeze([...(value.questionRefs as string[])]),
    answerOptionIds: Object.freeze((value.answerOptionIds as string[][]).map((set) => Object.freeze([...set]))), expiresAt: value.expiresAt,
  });
}

export function clearDailyRecovery(storage: Pick<Storage, "removeItem">): boolean {
  try { storage.removeItem(DAILY_RECOVERY_STORAGE_KEY); return true; } catch { return false; }
}

export function formatDailyCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
