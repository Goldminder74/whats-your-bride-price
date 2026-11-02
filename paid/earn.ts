export const PERFECT_BONUS = 1;
export const SHARE_BONUS = 1;
export const REFERRER_BONUS = 2;
export const NEW_PLAYER_BONUS = 1;
export const REFERRAL_DAILY_CAP = 10;
export const PERFECT_DAILY_CAP = 1;

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function earnDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** Missing, blank, and any value other than on/true/1/yes stay off. */
export function envFlagOn(value: string | undefined): boolean {
  return ["1", "true", "on", "yes"].includes((value || "").trim().toLowerCase());
}

export function referralCodeFromBytes(bytes: Uint8Array): string {
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function newReferralCode(): string {
  return referralCodeFromBytes(crypto.getRandomValues(new Uint8Array(8)));
}

export function isReferralCode(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^[${CODE_ALPHABET}]{8}$`).test(value);
}
