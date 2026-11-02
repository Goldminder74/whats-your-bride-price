import { inflateSync, deflateSync } from "node:zlib";
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
  issuedAt?: number;
  /** Low-resolution sheet preview. Never a paid certificate. */
  preview?: boolean;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function issueDateLabel(at: number): string {
  const date = new Date(at);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

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

function tierLines(title: string): [string, string] {
  const words = title.toUpperCase().split(" ");
  if (words.length < 2) return [words[0] ?? "", ""];
  return [words.slice(0, -1).join(" "), words.at(-1) ?? ""];
}

function cowrieGlyph(x: number, y: number, tilt: number, scale = 1): string {
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt.toFixed(1)}) scale(${scale})">
    <ellipse cx="0" cy="0" rx="34" ry="20" fill="#f0a11a"/>
    <ellipse cx="0" cy="1" rx="20" ry="11" fill="#fff6d8"/>
    <path d="M-12 3 Q0 16 12 3" fill="none" stroke="#7a3e12" stroke-width="3.2" stroke-linecap="round"/>
  </g>`;
}

/** Cowries along a crown arc, richer than the free card's straight row. */
function cowrieArc(centerY: number, radius: number, count: number, scale = 1): string {
  const span = 1.05;
  return Array.from({ length: count }, (_, index) => {
    const t = -span / 2 + (span * index) / (count - 1);
    const x = 540 + Math.sin(t) * radius;
    const y = centerY + radius - Math.cos(t) * radius;
    return cowrieGlyph(x, y, t * 46, scale);
  }).join("");
}

function cornerFlourish(x: number, y: number, sx: number, sy: number): string {
  return `<g transform="translate(${x} ${y}) scale(${sx} ${sy})" fill="none" stroke="#f0a11a" stroke-linecap="round">
    <path d="M0 36 L0 8 Q0 0 8 0 L36 0" stroke-width="5"/>
    <path d="M0 22 L0 12 Q0 8 6 8 L22 0" stroke-width="1.6" opacity="0.85"/>
    <circle cx="16" cy="16" r="3.2" fill="#f0a11a" stroke="none"/>
    <path d="M10 4 Q18 10 12 18" stroke-width="1.4"/>
  </g>`;
}

function waxSeal(cx: number, cy: number, radius: number, score: number): string {
  const scoreSize = Math.round(radius * 0.48);
  return `<g>
    <circle cx="${cx}" cy="${cy + 6}" r="${radius}" fill="#6a3a12" opacity="0.45"/>
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="#c47812" stroke="#f0a11a" stroke-width="8"/>
    <circle cx="${cx}" cy="${cy}" r="${radius - 16}" fill="#8a3d10" stroke="#fff6d8" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="${radius - 28}" fill="#5c240c"/>
    <path d="M${cx - 22} ${cy - Math.round(radius * 0.58)} l7 10 5-8 5 12 5-12 5 8 7-10 -5 16 h-24 z" fill="#f0a11a"/>
    <text x="${cx}" y="${cy + Math.round(radius * 0.28)}" fill="#fff6d8" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${scoreSize}" text-anchor="middle">${score}</text>
    <text x="${cx}" y="${cy + Math.round(radius * 0.5)}" fill="#f0a11a" font-family="Anton, Impact, Arial Black, sans-serif" font-size="15" letter-spacing="3" text-anchor="middle">OF 12</text>
  </g>`;
}

/** Paid decree. Uses the same regional artwork, grain, and cowries as the free share card, with a seal and certificate. */
export function royalDecreeSvg(input: DecreeInput): string {
  const frame = input.frame === "story" ? "story" : "card";
  const width = SHARE_CARD_WIDTH;
  const height = frame === "story" ? SHARE_STORY_HEIGHT : SHARE_CARD_HEIGHT;
  const story = frame === "story";
  const region = regions[input.edition];
  const [base, accent, dark] = region.palette;
  const tier = resultTier(input.score);
  const [lineA, lineB] = tierLines(tier.title);
  const nameSize = input.displayName.length > 22 ? 46 : input.displayName.length > 16 ? 58 : 72;
  const tierSize = lineA.length > 12 ? (story ? 78 : 68) : (story ? 96 : 84);
  const issued = issueDateLabel(input.issuedAt ?? Date.now());
  const art = input.artwork
    ? `<image href="${xml(input.artwork)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.88"/>`
    : "";
  const y = story
    ? { arc: 210, kicker: 360, edition: 408, name: 520, tier: 680, price: 900, seal: 1160, cert: 1408, date: 1456, note: 1660, sign: 1768, byline: 1824 }
    : { arc: 132, kicker: 248, edition: 286, name: 372, tier: 490, price: 668, seal: 860, cert: 1048, date: 1090, note: 1168, sign: 1236, byline: 1284 };
  const sealR = story ? 128 : 96;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="grain" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
      <line x1="0" y1="0" x2="0" y2="46" stroke="#f0a11a" stroke-width="1.6" opacity="0.28"/>
    </pattern>
    <radialGradient id="vignette" cx="50%" cy="42%" r="68%">
      <stop offset="0" stop-color="${dark}" stop-opacity="0.18"/>
      <stop offset="0.62" stop-color="${dark}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#070403" stop-opacity="0.92"/>
    </radialGradient>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${base}" stop-opacity="0.08"/>
      <stop offset="0.34" stop-color="${dark}" stop-opacity="0.42"/>
      <stop offset="0.7" stop-color="#120a07" stop-opacity="0.78"/>
      <stop offset="1" stop-color="#070403" stop-opacity="0.94"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${dark}"/>
  ${art}
  <rect width="${width}" height="${height}" fill="url(#vignette)"/>
  <rect width="${width}" height="${height}" fill="url(#veil)"/>
  <rect width="${width}" height="${height}" fill="url(#grain)"/>
  <rect x="26" y="26" width="${width - 52}" height="${height - 52}" fill="none" stroke="#f0a11a" stroke-width="7"/>
  <rect x="42" y="42" width="${width - 84}" height="${height - 84}" fill="none" stroke="#fff6d8" stroke-width="1.4" opacity="0.8"/>
  <rect x="50" y="50" width="${width - 100}" height="${height - 100}" fill="none" stroke="${accent}" stroke-width="1"/>
  ${cornerFlourish(58, 58, 1, 1)}
  ${cornerFlourish(width - 58, 58, -1, 1)}
  ${cornerFlourish(58, height - 58, 1, -1)}
  ${cornerFlourish(width - 58, height - 58, -1, -1)}
  ${cowrieArc(y.arc, story ? 520 : 460, 7, story ? 1.05 : 0.92)}
  <text x="540" y="${y.kicker}" fill="#f0a11a" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${story ? 34 : 28}" letter-spacing="10" text-anchor="middle">ROYAL DECREE</text>
  <text x="540" y="${y.edition}" fill="#f3e7cc" font-family="Anton, Impact, Arial Black, sans-serif" font-size="20" letter-spacing="6" text-anchor="middle">${xml(region.name.toUpperCase())} EDITION</text>
  <text x="540" y="${y.name}" fill="#fff6d8" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${nameSize}" letter-spacing="2" text-anchor="middle">${xml(input.displayName)}</text>
  <text x="540" y="${y.tier}" fill="#f0a11a" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${tierSize}" text-anchor="middle">${xml(lineA)}</text>
  <text x="540" y="${y.tier + tierSize - 8}" fill="#fff6d8" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${tierSize + 8}" text-anchor="middle">${xml(lineB)}</text>
  <rect x="250" y="${y.price}" width="580" height="${story ? 108 : 92}" rx="8" fill="#f0a11a"/>
  <text x="540" y="${y.price + (story ? 40 : 34)}" fill="#1d120b" font-family="Anton, Impact, Arial Black, sans-serif" font-size="16" letter-spacing="5" text-anchor="middle">BRIDE PRICE</text>
  <text x="540" y="${y.price + (story ? 86 : 74)}" fill="#1d120b" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${story ? 42 : 36}" text-anchor="middle">${tier.cowries} COWRIES</text>
  ${waxSeal(540, y.seal, sealR, input.score)}
  <text x="540" y="${y.cert}" fill="#f0a11a" font-family="Anton, Impact, Arial Black, sans-serif" font-size="24" letter-spacing="3" text-anchor="middle">${input.preview ? "SAMPLE" : `CERTIFICATE ${xml(input.certificate)}`}</text>
  <text x="540" y="${y.date}" fill="#f3e7cc" font-family="Anton, Impact, Arial Black, sans-serif" font-size="18" letter-spacing="2" text-anchor="middle">ISSUED ${xml(issued.toUpperCase())}</text>
  <text x="540" y="${y.note}" fill="#fff6d8" font-family="Anton, Impact, Arial Black, sans-serif" font-size="${story ? 20 : 18}" text-anchor="middle">A playful culture score. Not a measure of a person.</text>
  <line x1="340" y1="${y.sign}" x2="740" y2="${y.sign}" stroke="#f0a11a" stroke-width="1.4"/>
  <text x="540" y="${y.byline}" fill="#f3e7cc" font-family="Anton, Impact, Arial Black, sans-serif" font-size="16" letter-spacing="1.5" text-anchor="middle">Issued by Classes for Culture</text>
  ${input.preview ? `<g transform="rotate(-22 540 ${Math.round(height / 2)})" opacity="0.9">
    <text x="540" y="${Math.round(height / 2)}" fill="#fff6d8" font-family="Anton, Impact, Arial Black, sans-serif" font-size="150" letter-spacing="18" text-anchor="middle">PREVIEW</text>
  </g>` : ""}
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

function latin1(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 255;
  return bytes;
}

function pngRgb(png: Uint8Array): { width: number; height: number; rgb: Uint8Array } {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 2;
  const parts: Uint8Array[] = [];
  while (offset + 8 < png.length) {
    const view = new DataView(png.buffer, png.byteOffset + offset, 8);
    const length = view.getUint32(0);
    const type = String.fromCharCode(png[offset + 4], png[offset + 5], png[offset + 6], png[offset + 7]);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = new DataView(data.buffer, data.byteOffset, 8).getUint32(0);
      height = new DataView(data.buffer, data.byteOffset, 8).getUint32(4);
      colorType = data[9];
    } else if (type === "IDAT") {
      parts.push(data);
    } else if (type === "IEND") break;
    offset += 12 + length;
  }
  const packed = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    packed.set(part, cursor);
    cursor += part.length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const inflated = inflateSync(packed);
  const stride = width * channels;
  const raw = new Uint8Array(height * stride);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src];
    src += 1;
    const row = y * stride;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? raw[row + index - channels] : 0;
      const up = y > 0 ? raw[row - stride + index] : 0;
      const upLeft = y > 0 && index >= channels ? raw[row - stride + index - channels] : 0;
      const value = inflated[src];
      src += 1;
      let next = value;
      if (filter === 1) next = value + left;
      else if (filter === 2) next = value + up;
      else if (filter === 3) next = value + Math.floor((left + up) / 2);
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const pa = Math.abs(estimate - left);
        const pb = Math.abs(estimate - up);
        const pc = Math.abs(estimate - upLeft);
        const predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        next = value + predicted;
      }
      raw[row + index] = next & 255;
    }
  }
  if (channels === 3) return { width, height, rgb: raw };
  const rgb = new Uint8Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgb[pixel * 3] = raw[pixel * 4];
    rgb[pixel * 3 + 1] = raw[pixel * 4 + 1];
    rgb[pixel * 3 + 2] = raw[pixel * 4 + 2];
  }
  return { width, height, rgb };
}

function pdfText(font: "F1" | "F2", size: number, x: number, y: number, text: string, color = "0.11 0.07 0.04"): string {
  return `${color} rg BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(text)}) Tj ET`;
}

/** Page 1 is the decree image. Page 2 is the tier note and the quoted bank facts. */
export function royalDecreePdf(input: {
  displayName: string;
  edition: RegionKey;
  score: number;
  certificate: string;
  facts: readonly RoyalFact[];
  decreePng: Uint8Array;
  issuedAt?: number;
}): Uint8Array {
  const tier = resultTier(input.score);
  const region = regions[input.edition].name;
  const issued = issueDateLabel(input.issuedAt ?? Date.now());
  const image = pngRgb(input.decreePng);
  const imageBytes = deflateSync(image.rgb);
  const imageWidth = 540;
  const imageHeight = Math.round(imageWidth * (image.height / image.width));
  const imageX = Math.round((612 - imageWidth) / 2);
  const imageY = Math.round((792 - imageHeight) / 2);
  const cover = [
    "0.07 0.04 0.02 rg",
    "0 0 612 792 re f",
    "0.94 0.63 0.10 RG",
    "2.2 w",
    "24 24 564 744 re S",
    "0.6 w",
    "32 32 548 728 re S",
    "q",
    `${imageWidth} 0 0 ${imageHeight} ${imageX} ${imageY} cm`,
    "/Im1 Do",
    "Q",
  ].join("\n");
  const notes: string[] = [];
  let cursorY = 742;
  const write = (line: string, size: number, font: "F1" | "F2", gap: number, color?: string) => {
    notes.push(pdfText(font, size, 54, cursorY, line, color));
    cursorY -= gap;
  };
  write("ROYAL DECREE", 22, "F2", 28, "0.54 0.32 0.07");
  write(input.displayName, 16, "F2", 20);
  write(`${tier.title}  ·  ${tier.cowries} cowries  ·  ${input.score} of 12`, 12, "F1", 16);
  write(`${region} edition  ·  ${input.certificate}  ·  ${issued}`, 11, "F1", 22, "0.35 0.25 0.16");
  for (const line of wrapLine(tierExplanation({
    displayName: input.displayName,
    edition: input.edition,
    score: input.score,
    factCount: input.facts.length,
  }), 88)) {
    write(line, 11, "F1", 15);
  }
  cursorY -= 8;
  write("Quoted from the published question bank", 12, "F2", 20, "0.54 0.32 0.07");
  input.facts.forEach((fact, index) => {
    write(`${index + 1}. ${fact.answer}  (${fact.category})`, 12, "F2", 16);
    for (const line of wrapLine(fact.quote, 92)) write(line, 10, "F1", 13, "0.2 0.14 0.1");
    cursorY -= 6;
  });
  const noteStream = notes.join("\n");
  const imageId = 5;
  const coverId = 6;
  const noteId = 7;
  const coverPageId = 3;
  const notePageId = 4;
  const fontId = 8;
  const boldId = 9;
  const catalog = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const pages = `2 0 obj\n<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>\nendobj\n`;
  const coverPage = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${coverId} 0 R /Resources << /XObject << /Im1 ${imageId} 0 R >> >> >>\nendobj\n`;
  const notePage = `4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${noteId} 0 R /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> >>\nendobj\n`;
  const imageDict = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${imageBytes.length} >>\nstream\n`;
  const coverDict = `6 0 obj\n<< /Length ${latin1(cover).length} >>\nstream\n${cover}\nendstream\nendobj\n`;
  const noteDict = `7 0 obj\n<< /Length ${latin1(noteStream).length} >>\nstream\n${noteStream}\nendstream\nendobj\n`;
  const fonts = "8 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n9 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n";
  const chunks: Uint8Array[] = [latin1("%PDF-1.4\n")];
  const offsets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const add = (id: number, bytes: Uint8Array) => {
    offsets[id] = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    chunks.push(latin1(`${id} 0 obj\n`), bytes, id === imageId ? latin1("\nendstream\nendobj\n") : latin1(""));
  };
  add(1, latin1(catalog.replace(/^1 0 obj\n/, "")));
  add(2, latin1(pages.replace(/^2 0 obj\n/, "")));
  add(coverPageId, latin1(coverPage.replace(/^3 0 obj\n/, "")));
  add(notePageId, latin1(notePage.replace(/^4 0 obj\n/, "")));
  offsets[imageId] = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(latin1(imageDict), imageBytes, latin1("\nendstream\nendobj\n"));
  add(coverId, latin1(coverDict.replace(/^6 0 obj\n/, "")));
  add(noteId, latin1(noteDict.replace(/^7 0 obj\n/, "")));
  add(fontId, latin1(fonts.split("9 0 obj")[0].replace(/^8 0 obj\n/, "")));
  add(boldId, latin1(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`));
  const xrefAt = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  let xref = `xref\n0 10\n0000000000 65535 f \n`;
  for (let id = 1; id <= 9; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  chunks.push(latin1(`${xref}trailer\n<< /Size 10 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`));
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let writeAt = 0;
  for (const chunk of chunks) {
    out.set(chunk, writeAt);
    writeAt += chunk.length;
  }
  return out;
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
