import { products } from "./catalog.ts";
import { PaidError } from "./errors.ts";
import { isEdition, type KvStore } from "./games.ts";
import type { PaidOrder, PaidRepository, RoyalRevealRecord } from "./repository.ts";

const RESULT_ID = /^[a-f0-9]{32}$/;

export type RevealHold = {
  playerId: string;
  resultId: string;
  edition: string;
  score: number;
  displayName: string;
};

export function sanitizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z '-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 1 || text.length > 32) return null;
  if (!/[A-Za-z]/.test(text)) return null;
  return text;
}

export function revealHoldKey(orderId: string): string {
  return `royal-hold:${orderId}`;
}

export async function revealHoldFromPurchase(kv: KvStore, playerId: string, body: Record<string, unknown>): Promise<RevealHold> {
  const resultId = typeof body.resultId === "string" ? body.resultId : "";
  if (!RESULT_ID.test(resultId)) throw new PaidError("result_invalid", 400);
  const displayName = sanitizeDisplayName(body.displayName);
  if (!displayName) throw new PaidError("name_invalid", 400);
  const raw = await kv.get(`result:${resultId}`);
  if (!raw) throw new PaidError("result_not_found", 404);
  let parsed: { edition?: unknown; score?: unknown; total?: unknown; player?: unknown };
  try {
    parsed = JSON.parse(raw) as { edition?: unknown; score?: unknown; total?: unknown; player?: unknown };
  } catch {
    throw new PaidError("result_not_found", 404);
  }
  if (!isEdition(parsed.edition) || parsed.total !== 12 || typeof parsed.score !== "number" || !Number.isInteger(parsed.score) || parsed.score < 0 || parsed.score > 12) {
    throw new PaidError("result_invalid", 400);
  }
  if (parsed.player !== playerId) throw new PaidError("result_unowned", 403);
  return { playerId, resultId, edition: parsed.edition, score: parsed.score, displayName };
}

export async function writeRevealHold(kv: KvStore, orderId: string, hold: RevealHold): Promise<void> {
  const key = revealHoldKey(orderId);
  if (await kv.get(key)) return;
  await kv.put(key, JSON.stringify(hold));
}

export async function certificateFor(orderId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`wybp-royal:${orderId}`));
  const hex = [...new Uint8Array(digest)].slice(0, 5).map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `RR-${hex}`;
}

export function newRevealToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Create the decree row once the Stripe payment has fulfilled this order. */
export async function mintRoyalReveal(input: {
  repository: PaidRepository;
  kv: KvStore;
  order: PaidOrder;
  at: number;
}): Promise<RoyalRevealRecord | null> {
  if (products[input.order.productKey].kind !== "royal_reveal") return null;
  const existing = await input.repository.getRevealByOrder(input.order.id);
  if (existing) return existing;
  const raw = await input.kv.get(revealHoldKey(input.order.id));
  if (!raw) throw new PaidError("reveal_hold_missing", 409);
  let hold: RevealHold;
  try {
    hold = JSON.parse(raw) as RevealHold;
  } catch {
    throw new PaidError("reveal_hold_missing", 409);
  }
  if (hold.playerId !== input.order.playerId || !isEdition(hold.edition)) throw new PaidError("reveal_hold_missing", 409);
  return input.repository.saveReveal({
    orderId: input.order.id,
    playerId: input.order.playerId,
    resultId: hold.resultId,
    edition: hold.edition,
    score: hold.score,
    displayName: hold.displayName,
    certificate: await certificateFor(input.order.id),
    token: newRevealToken(),
    createdAt: input.at,
  });
}
