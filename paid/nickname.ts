import { PaidError } from "./errors.ts";

const BLOCKED = ["fuck", "shit", "bitch", "asshole", "nigger", "nigga", "faggot", "cunt", "slut", "whore", "porn", "nazi"];

export const DISPLAY_NAME_MESSAGE = "Choose a name of 2–32 letters. No email, link, or profanity.";

/** Shared public-name checks: links, emails, mangled addresses, and the profanity list. */
export function assertSafePublicName(value: string, invalidCode: string, rejectedCode: string): void {
  const lowered = value.toLowerCase();
  if (lowered.includes("@") || lowered.includes("http") || lowered.includes("www") || lowered.includes("://")) {
    throw new PaidError(invalidCode, 400);
  }
  if (/\.(com|net|org|gg|io|co)\b/i.test(lowered)) throw new PaidError(invalidCode, 400);
  if (/\bdot\s+(?:com|net|org|gg|io|co)\b/i.test(lowered)) throw new PaidError(invalidCode, 400);
  if (/\bat\s+(?:gmail|yahoo|outlook|hotmail|icloud)\b/i.test(lowered)) throw new PaidError(invalidCode, 400);
  const folded = lowered.replace(/[^a-z0-9]+/g, "");
  if (/dot(?:com|net|org|gg|io|co)/.test(folded) || /at(?:gmail|yahoo|outlook|hotmail|icloud)/.test(folded)) {
    throw new PaidError(invalidCode, 400);
  }
  if (BLOCKED.some((word) => folded.includes(word))) throw new PaidError(rejectedCode, 400);
}

export function validateNickname(value: unknown): string {
  if (typeof value !== "string") throw new PaidError("nickname_invalid", 400);
  const nickname = value.trim().replace(/\s+/g, " ");
  if (nickname.length < 2 || nickname.length > 16) throw new PaidError("nickname_invalid", 400);
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '’-]*$/u.test(nickname)) throw new PaidError("nickname_invalid", 400);
  assertSafePublicName(nickname, "nickname_invalid", "nickname_rejected");
  return nickname;
}

/** Decree name: letters, spaces, apostrophes, and hyphens, including accents. */
export function validateDisplayName(value: unknown): string {
  if (typeof value !== "string") throw new PaidError("name_invalid", 400);
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 32 || /^\d+$/.test(name)) throw new PaidError("name_invalid", 400);
  if (!/^[\p{L}][\p{L} '’-]*$/u.test(name)) throw new PaidError("name_invalid", 400);
  assertSafePublicName(name, "name_invalid", "name_rejected");
  return name;
}
