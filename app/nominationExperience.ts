import type { PublicChallengeProjection } from "../db/challengeService.ts";
import { validateDisplayName } from "./displayNames.ts";
import { regions, type RegionKey } from "./publicGameData.ts";
import {
  createChallengeUrl,
  createPublicAppUrl,
  resolveBrowserPublicAppOrigin,
  type PublicAppOrigin,
} from "./publicAppOrigin.ts";
import { PRODUCT_SAFEGUARD } from "./productSafeguards.ts";

export const nominationSlotNumbers = Object.freeze([1, 2, 3] as const);
export const nominationSnapshotVersion = 1;
export const nominationSnapshotPrefix = "wybp-nomination-v1:";

export type NominationSlotNumber = (typeof nominationSlotNumbers)[number];
export type NominationSlotState = "ready" | "opening" | "handed_off" | "cancelled" | "failed";

export type SafeNominationChallenge = Readonly<{
  projection: PublicChallengeProjection;
  challengeUrl: string;
}>;

export type NominationSnapshot = Readonly<{
  version: typeof nominationSnapshotVersion;
  scope: string;
  challenge: SafeNominationChallenge;
  completedSlots: readonly NominationSlotNumber[];
  savedAt: number;
}>;

const scopePattern = /^[A-Za-z0-9_-]{8,128}$/;
const challengeCodePattern = /^[0-9a-f]{48}$/;

export function validateNominationScope(value: string): string | null {
  return scopePattern.test(value) ? value : null;
}

export function nominationSnapshotKey(scope: string): string | null {
  const validScope = validateNominationScope(scope);
  return validScope ? `${nominationSnapshotPrefix}${validScope}` : null;
}

export function validateSafeNominationChallenge(
  projection: PublicChallengeProjection,
  challengeUrl: string,
  origin: PublicAppOrigin,
): SafeNominationChallenge | null {
  if (!challengeCodePattern.test(projection.challengeCode) || projection.status !== "active") return null;
  if (!(projection.edition in regions)) return null;
  const region = regions[projection.edition];
  if (
    projection.editionLabel !== region.name
    || projection.maximumScore !== region.questions.length
    || !Number.isInteger(projection.scoreToBeat)
    || projection.scoreToBeat < 0
    || projection.scoreToBeat > projection.maximumScore
  ) return null;
  const name = validateDisplayName(projection.displayName);
  if (!name.valid || !name.value || name.value !== projection.displayName) return null;
  const expectedUrl = createChallengeUrl(projection.challengeCode, origin);
  if (challengeUrl !== expectedUrl) return null;
  return Object.freeze({ projection, challengeUrl });
}

export function personalisedChallengeSentence(challenge: SafeNominationChallenge): string {
  const { projection } = challenge;
  return `${projection.displayName} challenged you to beat ${projection.scoreToBeat}/${projection.maximumScore} in the ${projection.editionLabel} Edition. Can you protect the family reputation?`;
}

export function personalisedChallengeShareText(challenge: SafeNominationChallenge): string {
  return `${personalisedChallengeSentence(challenge)}\n${PRODUCT_SAFEGUARD}\n${challenge.challengeUrl}`;
}

export function genericNominationUrl(edition: RegionKey, origin: PublicAppOrigin): string {
  return createPublicAppUrl("/", { edition }, origin);
}

export function genericNominationShareText(edition: RegionKey, url: string): string {
  return `You have been invited to play the ${regions[edition].name} Edition of What’s Your Bride Price? Bring your culture knowledge.\n${PRODUCT_SAFEGUARD}\n${url}`;
}

export function whatsappShareUrl(completeText: string): string {
  const url = new URL("https://wa.me/");
  url.searchParams.set("text", completeText);
  return url.toString();
}

export function isNativeShareCancellation(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

export function writeNominationSnapshot(storage: Storage, snapshot: NominationSnapshot): boolean {
  const key = nominationSnapshotKey(snapshot.scope);
  if (!key) return false;
  try {
    storage.setItem(key, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function readNominationSnapshot(
  storage: Storage,
  scope: string,
  currentOrigin: string,
  now = Date.now(),
): NominationSnapshot | null {
  const key = nominationSnapshotKey(scope);
  if (!key) return null;
  let value: unknown;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== nominationSnapshotVersion || record.scope !== scope || !Number.isSafeInteger(record.savedAt) || (record.savedAt as number) > now) return null;
  if (!Array.isArray(record.completedSlots) || record.completedSlots.some((slot) => !nominationSlotNumbers.includes(slot as NominationSlotNumber))) return null;
  const uniqueSlots = [...new Set(record.completedSlots as NominationSlotNumber[])];
  if (!record.challenge || typeof record.challenge !== "object" || Array.isArray(record.challenge)) return null;
  const rawChallenge = record.challenge as Record<string, unknown>;
  if (!rawChallenge.projection || typeof rawChallenge.challengeUrl !== "string") return null;
  const origin = resolveBrowserPublicAppOrigin(currentOrigin);
  const challenge = validateSafeNominationChallenge(
    rawChallenge.projection as PublicChallengeProjection,
    rawChallenge.challengeUrl,
    origin,
  );
  if (!challenge) return null;
  return Object.freeze({
    version: nominationSnapshotVersion,
    scope,
    challenge,
    completedSlots: Object.freeze(uniqueSlots),
    savedAt: record.savedAt as number,
  });
}
