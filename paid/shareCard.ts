import { frameStyleMarkup, type FrameKey } from "./frameStyle.ts";
import { calculateResultTier } from "../app/gameLogic.ts";
import { regions, type RegionKey } from "../app/gameData.ts";
import { CANONICAL_ORIGIN } from "./catalog.ts";

const PRICES = [5, 15, 30, 50] as const;

const TIERS = [
  { title: "Roots Rookie", cowries: PRICES[0] },
  { title: "Culture Climber", cowries: PRICES[1] },
  { title: "Motherland Scholar", cowries: PRICES[2] },
  { title: "Bride Price Royalty", cowries: PRICES[3] },
] as const;

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;
export const SHARE_STORY_WIDTH = 1080;
export const SHARE_STORY_HEIGHT = 1920;
export const CHALLENGE_LINE = "Can you beat my score?";
export type ShareFrame = "card" | "story";

export function canonicalHost(): string {
  return new URL(CANONICAL_ORIGIN).host;
}

export function resultTier(score: number): { title: string; cowries: number } {
  return TIERS[calculateResultTier(score)];
}

/** Punchy line for WhatsApp. The link is added by the caller. */
export function shareBlurb(score: number): string {
  const tier = resultTier(score);
  return `I'm worth ${tier.cowries} cowries as a ${tier.title} 👑 Can you beat ${score}/12?`;
}

export function challengeUrl(edition: string, score: number, code?: string | null): string {
  const url = new URL("/", CANONICAL_ORIGIN);
  url.searchParams.set("edition", edition);
  url.searchParams.set("score", String(score));
  if (code) url.searchParams.set("ref", code);
  return url.href;
}

export function shareCardImageUrl(edition: string, score: number, frame: ShareFrame = "card"): string {
  const url = new URL("/api/paid/share-card.png", CANONICAL_ORIGIN);
  url.searchParams.set("edition", edition);
  url.searchParams.set("score", String(score));
  if (frame === "story") url.searchParams.set("frame", "story");
  return url.href;
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[char] ?? char);
}

function tierLines(title: string): [string, string] {
  const words = title.toUpperCase().split(" ");
  if (words.length < 2) return [words[0] ?? "", ""];
  return [words.slice(0, -1).join(" "), words.at(-1) ?? ""];
}

function cowries(y: number, count: number): string {
  const gap = 1080 / (count + 1);
  return Array.from({ length: count }, (_, index) => {
    const x = gap * (index + 1);
    const tilt = index % 2 === 0 ? -16 : 12;
    return `<g transform="translate(${x} ${y}) rotate(${tilt})">
      <ellipse cx="0" cy="0" rx="34" ry="20" fill="#f0a11a"/>
      <ellipse cx="0" cy="1" rx="20" ry="11" fill="#fff6d8"/>
      <path d="M-12 3 Q0 16 12 3" fill="none" stroke="#7a3e12" stroke-width="3.2" stroke-linecap="round"/>
    </g>`;
  }).join("");
}

/** Poster card. The challenge link stays off the artwork; only the domain is printed. */
export function shareCardSvg(input: { edition: RegionKey; score: number; frame?: ShareFrame; artwork?: string | null; style?: FrameKey | null }): string {
  const frame = input.frame === "story" ? "story" : "card";
  const width = SHARE_CARD_WIDTH;
  const height = frame === "story" ? SHARE_STORY_HEIGHT : SHARE_CARD_HEIGHT;
  const region = regions[input.edition];
  const accent = region.palette[1];
  const tier = resultTier(input.score);
  const [lineA, lineB] = tierLines(tier.title);
  const story = frame === "story";
  const host = canonicalHost();
  const art = input.artwork
    ? `<image href="${xml(input.artwork)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.72"/>`
    : "";
  const titleSize = lineA.length > 12 ? 86 : 104;
  const cowrieY = story ? 250 : 118;
  const editionY = story ? 340 : 196;
  const wordY = story ? 392 : 238;
  const titleY = story ? 560 : 370;
  const priceY = story ? 760 : 500;
  const priceH = story ? 160 : 136;
  const sealY = story ? 1180 : 800;
  const sealR = story ? 168 : 112;
  const barY = story ? 1560 : 1048;
  const barH = story ? 120 : 100;
  const domainY = story ? 1788 : 1268;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="textile" width="56" height="56" patternUnits="userSpaceOnUse">
      <path d="M28 4L51 28L28 52L5 28Z" fill="none" stroke="#fff6d8" stroke-width="1"/>
    </pattern>
    <radialGradient id="glow" cx="50%" cy="18%" r="68%">
      <stop offset="0" stop-color="#7141a3" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#211744" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3c275e" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#120d24" stop-opacity="0.82"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#211744"/>
  ${art}
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <rect width="${width}" height="${height}" fill="url(#veil)"/>
  <rect width="${width}" height="${height}" fill="url(#textile)" opacity="0.035"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="36" fill="none" stroke="#f0a11a" stroke-width="4"/>
  <rect x="44" y="44" width="${width - 88}" height="${height - 88}" rx="28" fill="none" stroke="#fff6d8" stroke-width="1.4" opacity="0.7"/>
  ${input.style ? frameStyleMarkup(input.style, width, height) : ""}
  ${cowries(cowrieY, 7)}
  <text x="540" y="${editionY}" fill="#ffd079" font-family="Anton, Impact, Arial Black, sans-serif" font-size="28" letter-spacing="8" text-anchor="middle">${xml(region.name.toUpperCase())} EDITION</text>
  <text x="540" y="${wordY}" fill="#fff6d8" font-family="Anton, Impact, Arial Black, sans-serif" font-size="22" letter-spacing="6" text-anchor="middle">WHAT’S YOUR BRIDE PRICE?</text>
  <text x="540" y="${titleY}" fill="#ffd079" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${titleSize}" text-anchor="middle">${xml(lineA)}</text>
  <text x="540" y="${titleY + titleSize - 6}" fill="#fff6d8" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${titleSize + 10}" text-anchor="middle">${xml(lineB)}</text>
  <rect x="230" y="${priceY}" width="620" height="${priceH}" rx="28" fill="#f0a11a"/>
  <text x="540" y="${priceY + 38}" fill="#2b1a10" font-family="Anton, Impact, Arial Black, sans-serif" font-size="20" letter-spacing="6" text-anchor="middle">I'M WORTH</text>
  <text x="540" y="${priceY + priceH - 24}" fill="#2b1a10" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${story ? 78 : 64}" text-anchor="middle">${tier.cowries} COWRIES</text>
  <circle cx="540" cy="${sealY}" r="${sealR}" fill="none" stroke="#f0a11a" stroke-width="14"/>
  <circle cx="540" cy="${sealY}" r="${sealR - 18}" fill="#24183e" stroke="${accent}" stroke-width="3"/>
  <text x="540" y="${sealY + Math.round(sealR * 0.16)}" fill="#ffd079" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${Math.round(sealR * 0.7)}" text-anchor="middle">${input.score}</text>
  <text x="540" y="${sealY + Math.round(sealR * 0.55)}" fill="#fff6d8" font-family="Anton, Impact, Arial Black, sans-serif" font-size="24" letter-spacing="4" text-anchor="middle">OUT OF 12</text>
  <rect x="70" y="${barY}" width="940" height="${barH}" rx="8" fill="#f0a11a"/>
  <text x="540" y="${barY + Math.round(barH * 0.66)}" fill="#1d120b" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${story ? 48 : 42}" text-anchor="middle">${xml(CHALLENGE_LINE)}</text>
  <text x="540" y="${domainY}" fill="#f3e7cc" font-family="Anton, Impact, Arial Black, sans-serif" font-size="26" letter-spacing="3" text-anchor="middle">${xml(host)}</text>
</svg>`;
}

export function applyChallengeMeta(html: string, input: { title: string; description: string; image: string; url: string }): string {
  const tags = [
    `<meta property="og:title" content="${xml(input.title)}"/>`,
    `<meta property="og:description" content="${xml(input.description)}"/>`,
    `<meta property="og:url" content="${xml(input.url)}"/>`,
    `<meta property="og:image" content="${xml(input.image)}"/>`,
    `<meta property="og:image:type" content="image/png"/>`,
    `<meta property="og:image:width" content="1080"/>`,
    `<meta property="og:image:height" content="1350"/>`,
    `<meta property="og:image:alt" content="${xml(input.description)}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:image" content="${xml(input.image)}"/>`,
  ].join("");
  const stripped = html
    .replace(/<meta[^>]+property=["']og:(?:title|description|url|image)["'][^>]*>/gi, "")
    .replace(/<meta[^>]+name=["']twitter:(?:card|image)["'][^>]*>/gi, "");
  if (stripped.includes("</head>")) return stripped.replace("</head>", `${tags}</head>`);
  return `${tags}${stripped}`;
}
