import type { PrivateChallengeCreationResponse } from "../db/challengeService.ts";

export interface ChallengeCreationClient {
  readonly storageAvailable: boolean;
  create(idempotencyKey: string, displayName: string): Promise<PrivateChallengeCreationResponse>;
}

export type ChallengeActionMode = "personalised" | "generic-nomination";

export function resolveChallengeActionMode(
  challengesEnabled: boolean,
  client: ChallengeCreationClient | undefined,
): ChallengeActionMode {
  return challengesEnabled && client?.storageAvailable === true
    ? "personalised"
    : "generic-nomination";
}

export function createChallengeIdempotencyKey(
  randomValues: (bytes: Uint8Array) => Uint8Array = crypto.getRandomValues.bind(crypto),
): string {
  const bytes = new Uint8Array(24);
  const result = randomValues(bytes);
  if (result !== bytes) throw new Error("Secure challenge creation is unavailable.");
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
