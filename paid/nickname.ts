import { PaidError } from "./errors.ts";

const BLOCKED = ["fuck", "shit", "bitch", "asshole", "nigger", "nigga", "faggot", "cunt", "slut", "whore", "porn", "nazi"];

export function validateNickname(value: unknown): string {
  if (typeof value !== "string") throw new PaidError("nickname_invalid", 400);
  const nickname = value.trim().replace(/\s+/g, " ");
  if (nickname.length < 2 || nickname.length > 16) throw new PaidError("nickname_invalid", 400);
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '’-]*$/u.test(nickname)) throw new PaidError("nickname_invalid", 400);
  const lowered = nickname.toLowerCase();
  if (lowered.includes("@") || lowered.includes("http") || lowered.includes("www") || lowered.includes("://")) {
    throw new PaidError("nickname_invalid", 400);
  }
  if (/\.(com|net|org|gg|io|co)\b/i.test(lowered)) throw new PaidError("nickname_invalid", 400);
  const folded = lowered.replace(/[^a-z0-9]+/g, "");
  if (BLOCKED.some((word) => folded.includes(word))) throw new PaidError("nickname_rejected", 400);
  return nickname;
}
