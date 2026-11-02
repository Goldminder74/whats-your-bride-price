import { regions, type RegionKey } from "../app/gameData.ts";
import { loadPublished } from "../question-bank/loader.ts";
import type { BankQuestion } from "../question-bank/types.ts";
import { sensitivityReasons } from "../question-bank/sensitivity.ts";
import { PaidError } from "./errors.ts";
import { isEdition } from "./games.ts";
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  SHARE_STORY_HEIGHT,
  resultTier,
  type ShareFrame,
} from "./shareCard.ts";

export type RoyalFact = {
  id: string;
  category: string;
  answer: string;
  quote: string;
};

export type DecreeInput = {
  edition: RegionKey;
  score: number;
  displayName: string;
  certificate: string;
  frame?: ShareFrame;
  artwork?: string | null;
};

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" })[char] ?? char);
}

function rank(salt: string, id: string): number {
  let hash = 2166136261;
  const value = `${salt}:${id}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function answerOf(question: BankQuestion): string | null {
  const index = question.correct[0];
  const answer = question.options[index];
  return typeof answer === "string" && answer.trim() ? answer.trim() : null;
}

/** Keep a readable passage. The excerpt stays inside the stored evidence quote. */
export function quoteExcerpt(quote: string, answer: string): string {
  let clean = quote.replace(/[\u2014\u2013]/g, ", ").replace(/\s+/g, " ").trim();
  const doubled = `${answer} ${answer}`;
  if (clean.toLowerCase().startsWith(doubled.toLowerCase())) clean = clean.slice(answer.length).trim();
  const needed = answer.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 5);
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const hit = sentences.find((sentence) => {
    const hay = sentence.toLowerCase();
    return needed.length > 0 && needed.every((word) => hay.includes(word));
  });
  const chosen = (hit || clean).trim();
  if (chosen.length <= 420) return chosen;
  const slice = chosen.slice(0, 420);
  const end = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  return (end >= 80 ? slice.slice(0, end + 1) : slice).trim();
}

export function factCountForScore(score: number): number {
  if (score >= 9) return 5;
  if (score >= 3) return 4;
  return 3;
}

export async function factsForReveal(edition: RegionKey, score: number, salt: string): Promise<RoyalFact[]> {
  const questions = await loadPublished(edition);
  const ready: RoyalFact[] = [];
  for (const question of questions) {
    const quote = question.gateReport?.evidenceQuote || "";
    const answer = answerOf(question);
    if (!answer || quote.length < 40) continue;
    const excerpt = quoteExcerpt(quote, answer);
    if (sensitivityReasons(`${excerpt}\n${answer}`).length > 0) continue;
    const source = quote.replace(/[\u2014\u2013]/g, ", ").replace(/\s+/g, " ").trim();
    const probe = excerpt.slice(0, Math.min(40, excerpt.length));
    if (!source.includes(probe)) continue;
    ready.push({ id: question.id, category: question.category, answer, quote: excerpt });
  }
  ready.sort((left, right) => rank(salt, left.id) - rank(salt, right.id) || left.id.localeCompare(right.id));
  return ready.slice(0, factCountForScore(score));
}

export function tierExplanation(input: { displayName: string; edition: RegionKey; score: number; factCount: number }): string {
  const tier = resultTier(input.score);
  const region = regions[input.edition].name;
  return `${input.displayName}, this Royal Decree records your ${region} edition result. You scored ${input.score} out of 12. That band is ${tier.title}, a playful bride price of ${tier.cowries} cowries. The score is a culture quiz result. It is not a measure of a person, and it is not a wedding custom. The ${input.factCount} notes below are quoted from the published ${region} question bank. Each note is the source passage for a checked question. Nothing here is added beyond that passage.`;
}

/** Certificate card. Same poster sizes as the share card, with the buyer's decree instead of a public challenge. */
export function royalDecreeSvg(input: DecreeInput): string {
  const frame = input.frame === "story" ? "story" : "card";
  const width = SHARE_CARD_WIDTH;
  const height = frame === "story" ? SHARE_STORY_HEIGHT : SHARE_CARD_HEIGHT;
  const story = frame === "story";
  const region = regions[input.edition];
  const [base, accent, dark] = region.palette;
  const tier = resultTier(input.score);
  const nameSize = input.displayName.length > 18 ? 54 : 72;
  const art = input.artwork
    ? `<image href="${xml(input.artwork)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.55"/>`
    : "";
  const titleY = story ? 430 : 280;
  const nameY = story ? 620 : 430;
  const tierY = story ? 760 : 540;
  const priceY = story ? 900 : 640;
  const sealY = story ? 1240 : 860;
  const certY = story ? 1560 : 1080;
  const noteY = story ? 1700 : 1180;
  const footY = story ? 1820 : 1270;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${base}" stop-opacity="0.2"/>
      <stop offset="0.45" stop-color="${dark}" stop-opacity="0.78"/>
      <stop offset="1" stop-color="#120a07" stop-opacity="0.96"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${dark}"/>
  ${art}
  <rect width="${width}" height="${height}" fill="url(#veil)"/>
  <rect x="36" y="36" width="${width - 72}" height="${height - 72}" fill="none" stroke="#f0a11a" stroke-width="8"/>
  <rect x="54" y="54" width="${width - 108}" height="${height - 108}" fill="none" stroke="${accent}" stroke-width="2"/>
  <text x="540" y="${story ? 180 : 140}" fill="#f0a11a" font-family="Anton, Impact, Arial Black, sans-serif" font-size="28" letter-spacing="8" text-anchor="middle">ROYAL DECREE</text>
  <text x="540" y="${story ? 230 : 184}" fill="#f3e7cc" font-family="Anton, Impact, Arial Black, sans-serif" font-size="20" letter-spacing="4" text-anchor="middle">${xml(region.name.toUpperCase())} EDITION</text>
  <text x="540" y="${titleY}" fill="#fff6d8" font-family="Anton, Impact, Arial Black, sans-serif" font-size="22" letter-spacing="3" text-anchor="middle">THIS DECREE NAMES</text>
  <text x="540" y="${nameY}" fill="#f0a11a" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${nameSize}" text-anchor="middle">${xml(input.displayName.toUpperCase())}</text>
  <text x="540" y="${tierY}" fill="#fff6d8" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${story ? 64 : 52}" text-anchor="middle">${xml(tier.title.toUpperCase())}</text>
  <rect x="210" y="${priceY}" width="660" height="${story ? 120 : 100}" rx="16" fill="#f0a11a"/>
  <text x="540" y="${priceY + (story ? 78 : 66)}" fill="#1d120b" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${story ? 42 : 36}" text-anchor="middle">BRIDE PRICE ${tier.cowries} COWRIES</text>
  <circle cx="540" cy="${sealY}" r="${story ? 130 : 100}" fill="#1a0e09" stroke="#f0a11a" stroke-width="12"/>
  <text x="540" y="${sealY + (story ? 18 : 14)}" fill="#f0a11a" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${story ? 72 : 58}" text-anchor="middle">${input.score}</text>
  <text x="540" y="${sealY + (story ? 58 : 48)}" fill="#f3e7cc" font-family="Anton, Impact, Arial Black, sans-serif" font-size="18" letter-spacing="3" text-anchor="middle">OUT OF 12</text>
  <text x="540" y="${certY}" fill="#f0a11a" font-family="Anton, Impact, Arial Black, sans-serif" font-size="28" letter-spacing="3" text-anchor="middle">CERTIFICATE ${xml(input.certificate)}</text>
  <text x="540" y="${noteY}" fill="#f3e7cc" font-family="Anton, Impact, Arial Black, sans-serif" font-size="20" text-anchor="middle">A PLAYFUL CULTURE SCORE. NOT A MEASURE OF A PERSON.</text>
  <text x="540" y="${footY}" fill="#f3e7cc" font-family="Anton, Impact, Arial Black, sans-serif" font-size="18" letter-spacing="2" text-anchor="middle">WHAT'S YOUR BRIDE PRICE?</text>
</svg>`;
}

function pdfEscape(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(value: string, width: number): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/** Text PDF of the decree and the quoted bank notes. Built-in Helvetica, no external font. */
export function royalDecreePdf(input: {
  displayName: string;
  edition: RegionKey;
  score: number;
  certificate: string;
  facts: readonly RoyalFact[];
}): Uint8Array {
  const tier = resultTier(input.score);
  const region = regions[input.edition].name;
  const pages: string[][] = [];
  const intro = wrapLine(tierExplanation({
    displayName: input.displayName,
    edition: input.edition,
    score: input.score,
    factCount: input.facts.length,
  }), 86);
  pages.push([
    "ROYAL DECREE",
    `${region} edition`,
    input.displayName,
    tier.title,
    `Bride price: ${tier.cowries} cowries`,
    `Score: ${input.score} out of 12`,
    `Certificate ${input.certificate}`,
    "",
    ...intro,
  ]);
  const factLines: string[] = ["QUOTED NOTES FROM THE PUBLISHED QUESTION BANK", ""];
  input.facts.forEach((fact, index) => {
    factLines.push(`${index + 1}. ${fact.answer} (${fact.category})`);
    factLines.push(...wrapLine(fact.quote, 86));
    factLines.push("");
  });
  for (let index = 0; index < factLines.length; index += 42) pages.push(factLines.slice(index, index + 42));
  return buildPdf(pages);
}

function buildPdf(pages: string[][]): Uint8Array {
  const objects: string[] = [];
  const pageIds: number[] = [];
  let next = 3;
  const fontId = 3 + pages.length * 2;
  for (const lines of pages) {
    const contentId = next;
    const pageId = next + 1;
    next += 2;
    pageIds.push(pageId);
    const commands = ["BT", "/F1 12 Tf", "54 760 Td", "16 TL"];
    for (const line of lines.slice(0, 44)) commands.push(`(${pdfEscape(line)}) Tj`, "T*");
    commands.push("ET");
    const stream = commands.join("\n");
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
  }
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[fontId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  let table = `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id += 1) table += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  body += `${table}trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    table[index] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(at: number): { time: number; date: number } {
  const date = new Date(at);
  const time = ((date.getUTCHours() & 31) << 11) | ((date.getUTCMinutes() & 63) << 5) | ((date.getUTCSeconds() / 2) & 31);
  const day = ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, date: day };
}

/** Uncompressed zip so the buyer can save both decree sizes and the PDF together. */
export function zipStored(files: readonly { name: string; bytes: Uint8Array }[], at = Date.now()): Uint8Array {
  const stamp = dosTime(at);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.bytes);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, stamp.time, true);
    view.setUint16(12, stamp.date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, file.bytes.length, true);
    view.setUint32(22, file.bytes.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, stamp.time, true);
    centralView.setUint16(14, stamp.date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, file.bytes.length, true);
    centralView.setUint32(24, file.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, file.bytes);
    centrals.push(central);
    offset += local.length + file.bytes.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

export function editionOf(value: string): RegionKey {
  if (!isEdition(value)) throw new PaidError("reveal_unavailable", 503);
  return value;
}
