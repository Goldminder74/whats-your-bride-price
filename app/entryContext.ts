import { regionOrder, type RegionKey } from "./gameData.ts";

export const controlledSources = [
  "whatsapp",
  "facebook",
  "instagram",
  "tiktok",
  "copy",
  "native",
  "direct",
  "unknown",
] as const;

export type ControlledSource = (typeof controlledSources)[number];
export type EntryContextField =
  | "edition"
  | "nominated"
  | "challenge"
  | "source"
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "ref";

type EntryQueryValues = {
    edition: RegionKey;
    nominated: "1";
    challenge: string;
    source: ControlledSource;
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    ref: string;
};

export type PermittedEntryQuery = Readonly<Partial<EntryQueryValues>>;

export type EntryContext = PermittedEntryQuery &
  Readonly<{
    source: ControlledSource;
    invalidFields: readonly EntryContextField[];
  }>;

const fieldNames: readonly EntryContextField[] = [
  "edition",
  "nominated",
  "challenge",
  "source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "ref",
];
const sourceSet = new Set<string>(controlledSources);
const regionSet = new Set<string>(regionOrder);
const tokenPattern = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;
const referencePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const challengePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/;

const limits: Readonly<Record<EntryContextField, number>> = {
  edition: 16,
  nominated: 1,
  challenge: 64,
  source: 24,
  utm_source: 32,
  utm_medium: 32,
  utm_campaign: 80,
  ref: 64,
};

function isSafeToken(value: string, limit: number, pattern = tokenPattern): boolean {
  return value.length > 0 && value.length <= limit && pattern.test(value);
}

function singleValue(params: URLSearchParams, field: EntryContextField): string | undefined {
  const values = params.getAll(field);
  return values.length === 1 ? values[0] : undefined;
}

export function inferControlledSource(referrer: string): ControlledSource {
  if (!referrer) return "direct";
  try {
    const hostname = new URL(referrer).hostname.toLowerCase();
    if (hostname === "wa.me" || hostname.endsWith(".whatsapp.com")) return "whatsapp";
    if (hostname === "fb.com" || hostname.endsWith(".facebook.com")) return "facebook";
    if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) return "instagram";
    if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) return "tiktok";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function parseEntryContext(
  input: URLSearchParams | string,
  referrer = "",
): EntryContext {
  const params = input instanceof URLSearchParams
    ? new URLSearchParams(input)
    : new URLSearchParams(input.startsWith("?") ? input.slice(1) : input);
  const invalid = new Set<EntryContextField>();
  const values: Partial<EntryQueryValues> = {};

  for (const field of fieldNames) {
    if (params.getAll(field).length > 1) invalid.add(field);
  }

  const editionRaw = singleValue(params, "edition");
  if (editionRaw !== undefined) {
    const edition = editionRaw.toLowerCase();
    if (editionRaw.length <= limits.edition && regionSet.has(edition)) values.edition = edition as RegionKey;
    else invalid.add("edition");
  }

  const nominated = singleValue(params, "nominated");
  if (nominated !== undefined) {
    if (nominated === "1") values.nominated = "1";
    else invalid.add("nominated");
  }

  const challenge = singleValue(params, "challenge");
  if (challenge !== undefined) {
    if (challengePattern.test(challenge)) values.challenge = challenge;
    else invalid.add("challenge");
  }

  const campaignFields = ["utm_source", "utm_medium", "utm_campaign", "ref"] as const;
  for (const field of campaignFields) {
    const raw = singleValue(params, field);
    if (raw === undefined) continue;
    const pattern = field === "ref" ? referencePattern : tokenPattern;
    if (isSafeToken(raw, limits[field], pattern)) values[field] = raw;
    else invalid.add(field);
  }

  const sourceRaw = singleValue(params, "source");
  const sourceCandidate = sourceRaw ?? values.utm_source;
  let source: ControlledSource;
  if (sourceCandidate) {
    const normalised = sourceCandidate.toLowerCase();
    source = sourceSet.has(normalised) ? normalised as ControlledSource : "unknown";
    if (sourceRaw !== undefined && !isSafeToken(sourceRaw, limits.source)) invalid.add("source");
  } else {
    source = inferControlledSource(referrer);
  }

  return Object.freeze({
    ...values,
    source,
    invalidFields: Object.freeze([...invalid]),
  });
}

export function entryContextToQuery(
  context: EntryContext | PermittedEntryQuery,
  overrides: PermittedEntryQuery = {},
): URLSearchParams {
  const merged = { ...context, ...overrides };
  const params = new URLSearchParams();
  for (const field of fieldNames) {
    const value = merged[field];
    if (typeof value === "string" && value) params.set(field, value);
  }
  return params;
}

export function entryContextFromRecord(
  record: Readonly<Record<string, string | string[] | undefined>>,
): EntryContext {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (typeof value === "string") params.append(key, value);
  }
  return parseEntryContext(params);
}
