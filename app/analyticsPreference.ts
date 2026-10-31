export const ANALYTICS_CONSENT_STORAGE_KEY = "wybp-analytics-consent-v1";
export const ANALYTICS_SESSION_STORAGE_KEY = "wybp-analytics-session-v1";
export const ANALYTICS_SEEN_STORAGE_KEY = "wybp-analytics-seen-v1";
export const ANALYTICS_CONSENT_NOTICE_VERSION = "analytics-notice-v1";
export const ANALYTICS_CONSENT_RECORD_VERSION = 1 as const;
export const ANALYTICS_CONSENT_LIFETIME_MS = 180 * 86_400_000;
export const ANALYTICS_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const maximumConsentBytes = 384;
const maximumSessionBytes = 256;
const credentialPattern = /^[0-9a-f]{32}$/;

export type AnalyticsConsentChoice = "accepted" | "rejected";
export type AnalyticsConsentPreference = Readonly<{
  version: typeof ANALYTICS_CONSENT_RECORD_VERSION;
  noticeVersion: typeof ANALYTICS_CONSENT_NOTICE_VERSION;
  choice: AnalyticsConsentChoice;
  decidedAt: number;
  expiresAt: number;
}>;
export type AnalyticsBrowserSession = Readonly<{
  version: 1;
  credential: string;
  createdAt: number;
  expiresAt: number;
}>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type CryptoLike = Pick<Crypto, "getRandomValues">;

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

export function parseAnalyticsConsentPreference(raw: string | null, now = Date.now()): AnalyticsConsentPreference | null {
  if (!raw || new TextEncoder().encode(raw).byteLength > maximumConsentBytes) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (!exactKeys(candidate, ["version", "noticeVersion", "choice", "decidedAt", "expiresAt"])) return null;
    if (candidate.version !== 1 || candidate.noticeVersion !== ANALYTICS_CONSENT_NOTICE_VERSION || !["accepted", "rejected"].includes(candidate.choice as string)) return null;
    if (!Number.isSafeInteger(candidate.decidedAt) || !Number.isSafeInteger(candidate.expiresAt)) return null;
    if ((candidate.decidedAt as number) > now + 60_000 || (candidate.expiresAt as number) <= now || (candidate.expiresAt as number) - (candidate.decidedAt as number) !== ANALYTICS_CONSENT_LIFETIME_MS) return null;
    return Object.freeze(candidate as AnalyticsConsentPreference);
  } catch { return null; }
}

export function readAnalyticsConsentPreference(storage: StorageLike, now = Date.now()): AnalyticsConsentPreference | null {
  try {
    const preference = parseAnalyticsConsentPreference(storage.getItem(ANALYTICS_CONSENT_STORAGE_KEY), now);
    if (!preference) storage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
    return preference;
  } catch { return null; }
}

export function writeAnalyticsConsentPreference(storage: StorageLike, choice: AnalyticsConsentChoice, now = Date.now()): AnalyticsConsentPreference {
  const preference = Object.freeze({ version: 1, noticeVersion: ANALYTICS_CONSENT_NOTICE_VERSION, choice, decidedAt: now, expiresAt: now + ANALYTICS_CONSENT_LIFETIME_MS } as const);
  storage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, JSON.stringify(preference));
  return preference;
}

function secureCredential(cryptoApi: CryptoLike): string {
  const bytes = new Uint8Array(16); cryptoApi.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseSession(raw: string | null, now: number): AnalyticsBrowserSession | null {
  if (!raw || new TextEncoder().encode(raw).byteLength > maximumSessionBytes) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (!exactKeys(candidate, ["version", "credential", "createdAt", "expiresAt"]) || candidate.version !== 1 || typeof candidate.credential !== "string" || !credentialPattern.test(candidate.credential)) return null;
    if (!Number.isSafeInteger(candidate.createdAt) || !Number.isSafeInteger(candidate.expiresAt) || (candidate.createdAt as number) > now + 60_000 || (candidate.expiresAt as number) <= now || (candidate.expiresAt as number) - (candidate.createdAt as number) !== ANALYTICS_SESSION_LIFETIME_MS) return null;
    return Object.freeze(candidate as AnalyticsBrowserSession);
  } catch { return null; }
}

export function getOrCreateAnalyticsSession(storage: StorageLike, cryptoApi: CryptoLike, now = Date.now()): AnalyticsBrowserSession {
  const existing = parseSession(storage.getItem(ANALYTICS_SESSION_STORAGE_KEY), now);
  if (existing) return existing;
  storage.removeItem(ANALYTICS_SESSION_STORAGE_KEY);
  const session = Object.freeze({ version: 1, credential: secureCredential(cryptoApi), createdAt: now, expiresAt: now + ANALYTICS_SESSION_LIFETIME_MS } as const);
  storage.setItem(ANALYTICS_SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearAnalyticsSession(storage: StorageLike): void {
  try { storage.removeItem(ANALYTICS_SESSION_STORAGE_KEY); storage.removeItem(ANALYTICS_SEEN_STORAGE_KEY); } catch { /* fail closed locally */ }
}

export function readSeenAnalyticsKeys(storage: StorageLike): Set<string> {
  try {
    const raw = storage.getItem(ANALYTICS_SEEN_STORAGE_KEY);
    if (!raw || raw.length > 2048) return new Set();
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 40 || value.some((item) => typeof item !== "string" || !/^[a-z0-9:_-]{1,80}$/.test(item))) return new Set();
    return new Set(value);
  } catch { return new Set(); }
}

export function rememberSeenAnalyticsKey(storage: StorageLike, keys: Set<string>, key: string): void {
  if (!/^[a-z0-9:_-]{1,80}$/.test(key)) return;
  keys.add(key);
  const bounded = [...keys].slice(-40);
  try { storage.setItem(ANALYTICS_SEEN_STORAGE_KEY, JSON.stringify(bounded)); } catch { /* dedupe remains in memory */ }
}
