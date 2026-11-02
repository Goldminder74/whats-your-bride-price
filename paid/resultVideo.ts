import { regions, type RegionKey } from "../app/gameData.ts";
import { isReferralCode } from "./earn.ts";
import { PaidError } from "./errors.ts";
import { canonicalHost, resultTier } from "./shareCard.ts";

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_SECONDS = 5;
export const VIDEO_FPS = 30;
/** TikTok and Reels cover the top, the right rail, and the caption band. */
export const VIDEO_SAFE = Object.freeze({ top: 250, bottom: 420, side: 140 });

const EDITIONS = new Set<RegionKey>(["west", "east", "central", "north", "south"]);
const SCORE = /^(0|[1-9]|1[0-2])$/;

export type ResultVideoBeat = {
  id: "hook" | "reveal" | "cta";
  start: number;
  end: number;
  lines: string[];
};

export type ResultVideoStory = {
  width: number;
  height: number;
  seconds: number;
  fps: number;
  edition: RegionKey;
  region: string;
  score: number;
  title: string;
  cowries: number;
  referral: string | null;
  hook: string;
  cta: string;
  host: string;
  safe: { top: number; bottom: number; side: number };
  beats: ResultVideoBeat[];
};

export function resultVideoCacheKey(edition: string, score: number, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `result-video:v1:${edition}:${score}:${slug}`;
}

export function parseResultVideoQuery(url: URL): { edition: RegionKey; score: number; referral: string | null } {
  const edition = url.searchParams.get("edition") ?? "";
  if (!EDITIONS.has(edition as RegionKey)) throw new PaidError("edition_invalid", 400);
  const scoreText = url.searchParams.get("score") ?? "";
  if (!SCORE.test(scoreText)) throw new PaidError("score_invalid", 400);
  const ref = url.searchParams.get("ref");
  return {
    edition: edition as RegionKey,
    score: Number(scoreText),
    referral: isReferralCode(ref) ? ref : null,
  };
}

/** Three beats. The referral code is drawn on the CTA and is not part of the cache key. */
export function resultVideoStory(edition: RegionKey, score: number, referral?: string | null): ResultVideoStory {
  const region = regions[edition];
  const tier = resultTier(score);
  const host = canonicalHost();
  const code = isReferralCode(referral) ? referral : null;
  const cta = ["Can you beat me?", host];
  if (code) cta.push(code);
  return {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    seconds: VIDEO_SECONDS,
    fps: VIDEO_FPS,
    edition,
    region: region.name,
    score,
    title: tier.title,
    cowries: tier.cowries,
    referral: code,
    hook: "So. What's your bride price?",
    cta: "Can you beat me?",
    host,
    safe: { ...VIDEO_SAFE },
    beats: [
      { id: "hook", start: 0, end: 1.7, lines: ["SO.", "WHAT'S YOUR", "BRIDE PRICE?"] },
      { id: "reveal", start: 1.7, end: 3.4, lines: [region.name.toUpperCase(), `${score} / 12`, tier.title.toUpperCase(), `${tier.cowries} COWRIES`] },
      { id: "cta", start: 3.4, end: VIDEO_SECONDS, lines: cta },
    ],
  };
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[char] ?? char);
}

/** One still for a beat. Text sits inside the Reels safe area. Anton is the font we ship. */
export function resultVideoFrameSvg(story: ResultVideoStory, beatId: ResultVideoBeat["id"]): string {
  const beat = story.beats.find((item) => item.id === beatId);
  if (!beat) throw new PaidError("frame_invalid", 400);
  const region = regions[story.edition];
  const [base, accent, dark] = region.palette;
  const top = story.safe.top;
  const bottom = story.height - story.safe.bottom;
  const lines = beat.lines.map((line, index) => {
    const y = top + 180 + index * 150;
    const size = index === 0 && beat.id !== "cta" ? 92 : 72;
    return `<text x="540" y="${y}" fill="${index % 2 === 0 ? "#f0a11a" : "#fff6d8"}" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${size}" text-anchor="middle">${xml(line)}</text>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${story.width}" height="${story.height}" viewBox="0 0 ${story.width} ${story.height}">
  <rect width="${story.width}" height="${story.height}" fill="${dark}"/>
  <rect width="${story.width}" height="${story.height}" fill="${base}" opacity="0.25"/>
  <rect x="${story.safe.side}" y="${top}" width="${story.width - story.safe.side * 2}" height="${bottom - top}" fill="none" stroke="${accent}" stroke-width="8"/>
  <rect x="${story.safe.side + 16}" y="${top + 16}" width="${story.width - (story.safe.side + 16) * 2}" height="${bottom - top - 32}" fill="none" stroke="#fff6d8" stroke-width="2"/>
  ${lines}
  <text x="540" y="${bottom - 48}" fill="#f3e7cc" font-family="Anton, Impact, Arial Black, sans-serif" font-size="28" letter-spacing="4" text-anchor="middle">A PLAYFUL CULTURE SCORE</text>
</svg>`;
}
