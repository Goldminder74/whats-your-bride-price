import { calculateResultTier } from "../app/gameLogic.ts";
import { regions, type RegionKey } from "../app/gameData.ts";
import { CANONICAL_ORIGIN } from "./catalog.ts";

const TIERS = [
  { title: "Roots Rookie", price: "Bride price: 5 cowries" },
  { title: "Culture Climber", price: "Bride price: 15 cowries" },
  { title: "Motherland Scholar", price: "Bride price: 30 cowries" },
  { title: "Bride Price Royalty", price: "Bride price: 50 cowries" },
] as const;

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;
export const CHALLENGE_LINE = "Can you beat my score?";

export function canonicalHost(): string {
  return new URL(CANONICAL_ORIGIN).host;
}

export function challengeUrl(edition: string, code?: string | null): string {
  const url = new URL("/", CANONICAL_ORIGIN);
  url.searchParams.set("edition", edition);
  if (code) url.searchParams.set("ref", code);
  return url.href;
}

export function resultTier(score: number): { title: string; price: string } {
  return TIERS[calculateResultTier(score)];
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[char] ?? char);
}

/** 1080×1350 result card in the game palette. No answer keys, no player portrait. */
export function shareCardSvg(input: { edition: RegionKey; score: number; challenge: string }): string {
  const region = regions[input.edition];
  const [base, accent, dark] = region.palette;
  const tier = resultTier(input.score);
  const host = canonicalHost();
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_CARD_WIDTH}" height="${SHARE_CARD_HEIGHT}" viewBox="0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}">
  <rect width="1080" height="1350" fill="${base}"/>
  <rect x="55" y="55" width="970" height="1240" fill="${dark}"/>
  <rect x="78" y="78" width="924" height="1194" fill="none" stroke="${accent}" stroke-width="3"/>
  <text x="540" y="160" fill="${accent}" font-family="Arial, sans-serif" font-size="28" font-weight="700" text-anchor="middle">${xml(region.name.toUpperCase())} EDITION</text>
  <text x="540" y="430" fill="${accent}" font-family="Georgia, serif" font-size="120" text-anchor="middle">${xml(region.mark)}</text>
  <text x="540" y="620" fill="${accent}" font-family="Arial, sans-serif" font-size="72" font-weight="700" text-anchor="middle">${xml(tier.title.toUpperCase())}</text>
  <text x="540" y="720" fill="#f3e7cc" font-family="Georgia, serif" font-size="40" text-anchor="middle">${xml(tier.price)}</text>
  <text x="540" y="860" fill="${accent}" font-family="Arial, sans-serif" font-size="32" font-weight="700" text-anchor="middle">KNOWLEDGE SCORE ${input.score}/12</text>
  <text x="540" y="1040" fill="#f3e7cc" font-family="Arial, sans-serif" font-size="48" font-weight="700" text-anchor="middle">WHAT’S YOUR BRIDE PRICE?</text>
  <text x="540" y="1120" fill="#f3e7cc" font-family="Georgia, serif" font-size="36" text-anchor="middle">${CHALLENGE_LINE}</text>
  <text x="540" y="1190" fill="${accent}" font-family="Arial, sans-serif" font-size="28" text-anchor="middle">${xml(host)}</text>
  <text x="540" y="1250" fill="#f3e7cc" font-family="Arial, sans-serif" font-size="22" text-anchor="middle">${xml(input.challenge)}</text>
</svg>`;
}
