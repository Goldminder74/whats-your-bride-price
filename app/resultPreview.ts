import { isApprovedAvatarId } from "./avatarRegistry.ts";
import { regions, type RegionKey } from "./gameData.ts";
import { PRODUCT_SAFEGUARD, RESULT_TIER_TITLES } from "./productSafeguards.ts";
import { buildMediaObjectKey, type PublicResultData } from "../db/dataContracts.ts";

export const RESULT_PREVIEW_WIDTH = 1200;
export const RESULT_PREVIEW_HEIGHT = 630;
export const RESULT_PREVIEW_MIME = "image/png";
export const RESULT_PREVIEW_MAX_BYTES = 1_000_000;
export const RESULT_PREVIEW_GENERATION = "og1";
export const RESULT_PREVIEW_FALLBACK_PATH = "/og-v2.png";

export const approvedResultPreviewArtwork = Object.freeze({
  west: "woven-diamond",
  east: "horizon-wave",
  central: "forest-river",
  north: "courtyard-star",
  south: "beaded-constellation",
} satisfies Record<RegionKey, string>);

type RGB = readonly [number, number, number];

export type ResultPreviewContract = Readonly<{
  edition: RegionKey;
  editionLabel: string;
  displayName: "A challenger";
  score: number;
  total: number;
  resultTitle: string;
  masterySeal: string | null;
  avatarId: string | null;
  artwork: (typeof approvedResultPreviewArtwork)[RegionKey];
  safeguard: typeof PRODUCT_SAFEGUARD;
  branding: "What’s Your Bride Price? · Classes for Culture";
}>;

export type RenderedResultPreview = Readonly<{
  bytes: Uint8Array;
  width: typeof RESULT_PREVIEW_WIDTH;
  height: typeof RESULT_PREVIEW_HEIGHT;
  mimeType: typeof RESULT_PREVIEW_MIME;
  contentHash: string;
  objectKey: string;
  generationVersion: typeof RESULT_PREVIEW_GENERATION;
  contract: ResultPreviewContract;
}>;

const glyphRows: Record<string, string> = {
  " ": "00000/00000/00000/00000/00000/00000/00000",
  A: "01110/10001/10001/11111/10001/10001/10001", B: "11110/10001/10001/11110/10001/10001/11110",
  C: "01111/10000/10000/10000/10000/10000/01111", D: "11110/10001/10001/10001/10001/10001/11110",
  E: "11111/10000/10000/11110/10000/10000/11111", F: "11111/10000/10000/11110/10000/10000/10000",
  G: "01111/10000/10000/10111/10001/10001/01111", H: "10001/10001/10001/11111/10001/10001/10001",
  I: "11111/00100/00100/00100/00100/00100/11111", J: "00111/00010/00010/00010/10010/10010/01100",
  K: "10001/10010/10100/11000/10100/10010/10001", L: "10000/10000/10000/10000/10000/10000/11111",
  M: "10001/11011/10101/10101/10001/10001/10001", N: "10001/11001/10101/10011/10001/10001/10001",
  O: "01110/10001/10001/10001/10001/10001/01110", P: "11110/10001/10001/11110/10000/10000/10000",
  Q: "01110/10001/10001/10001/10101/10010/01101", R: "11110/10001/10001/11110/10100/10010/10001",
  S: "01111/10000/10000/01110/00001/00001/11110", T: "11111/00100/00100/00100/00100/00100/00100",
  U: "10001/10001/10001/10001/10001/10001/01110", V: "10001/10001/10001/10001/10001/01010/00100",
  W: "10001/10001/10001/10101/10101/11011/10001", X: "10001/10001/01010/00100/01010/10001/10001",
  Y: "10001/10001/01010/00100/00100/00100/00100", Z: "11111/00001/00010/00100/01000/10000/11111",
  "0": "01110/10001/10011/10101/11001/10001/01110", "1": "00100/01100/00100/00100/00100/00100/01110",
  "2": "01110/10001/00001/00010/00100/01000/11111", "3": "11110/00001/00001/01110/00001/00001/11110",
  "4": "00010/00110/01010/10010/11111/00010/00010", "5": "11111/10000/10000/11110/00001/00001/11110",
  "6": "01110/10000/10000/11110/10001/10001/01110", "7": "11111/00001/00010/00100/01000/01000/01000",
  "8": "01110/10001/10001/01110/10001/10001/01110", "9": "01110/10001/10001/01111/00001/00001/01110",
  "'": "00100/00100/00000/00000/00000/00000/00000", ".": "00000/00000/00000/00000/00000/00110/00110",
  ",": "00000/00000/00000/00000/00110/00110/00100", "?": "01110/10001/00001/00010/00100/00000/00100",
  "/": "00001/00010/00100/01000/10000/00000/00000", "-": "00000/00000/00000/11111/00000/00000/00000",
  ":": "00000/00110/00110/00000/00110/00110/00000", "&": "01100/10010/10100/01000/10101/10010/01101",
};

function hexColour(value: string): RGB {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error("unsafe_result_preview_palette");
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)];
}

function safeContract(result: PublicResultData): ResultPreviewContract {
  const region = regions[result.edition];
  if (
    !region
    || result.displayName !== "A challenger"
    || !Number.isInteger(result.score)
    || !Number.isInteger(result.total)
    || result.total !== region.questions.length
    || result.score < 0
    || result.score > result.total
    || result.tier < 0
    || result.tier > 3
    || (result.safeAvatarId !== null && !isApprovedAvatarId(result.safeAvatarId))
    || result.safeguard !== PRODUCT_SAFEGUARD
  ) throw new Error("unsafe_result_preview_contract");
  return Object.freeze({
    edition: result.edition,
    editionLabel: region.name,
    displayName: "A challenger",
    score: result.score,
    total: result.total,
    resultTitle: RESULT_TIER_TITLES[result.tier],
    masterySeal: result.score >= 9 ? `${region.name} mastery` : null,
    avatarId: result.safeAvatarId,
    artwork: approvedResultPreviewArtwork[result.edition],
    safeguard: PRODUCT_SAFEGUARD,
    branding: "What’s Your Bride Price? · Classes for Culture",
  });
}

class Canvas {
  readonly pixels = new Uint8Array(RESULT_PREVIEW_WIDTH * RESULT_PREVIEW_HEIGHT * 3);

  set(x: number, y: number, colour: RGB): void {
    if (x < 0 || y < 0 || x >= RESULT_PREVIEW_WIDTH || y >= RESULT_PREVIEW_HEIGHT) return;
    const offset = (Math.floor(y) * RESULT_PREVIEW_WIDTH + Math.floor(x)) * 3;
    this.pixels[offset] = colour[0]; this.pixels[offset + 1] = colour[1]; this.pixels[offset + 2] = colour[2];
  }

  rect(x: number, y: number, width: number, height: number, colour: RGB): void {
    const left = Math.max(0, Math.floor(x)); const top = Math.max(0, Math.floor(y));
    const right = Math.min(RESULT_PREVIEW_WIDTH, Math.ceil(x + width)); const bottom = Math.min(RESULT_PREVIEW_HEIGHT, Math.ceil(y + height));
    for (let row = top; row < bottom; row += 1) {
      for (let column = left; column < right; column += 1) this.set(column, row, colour);
    }
  }

  circle(cx: number, cy: number, radius: number, colour: RGB): void {
    const squared = radius * radius;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= squared) this.set(x, y, colour);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, width: number, colour: RGB): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let step = 0; step <= steps; step += 1) {
      const progress = steps === 0 ? 0 : step / steps;
      this.circle(x0 + (x1 - x0) * progress, y0 + (y1 - y0) * progress, width / 2, colour);
    }
  }

  diamond(cx: number, cy: number, radius: number, colour: RGB): void {
    for (let y = -radius; y <= radius; y += 1) {
      const half = radius - Math.abs(y);
      this.rect(cx - half, cy + y, half * 2 + 1, 1, colour);
    }
  }
}

function drawText(canvas: Canvas, text: string, x: number, y: number, scale: number, colour: RGB): void {
  const safe = text.normalize("NFKC").replace(/[’‘]/g, "'").toUpperCase().slice(0, 96);
  let cursor = x;
  for (const character of safe) {
    const rows = (glyphRows[character] || glyphRows["?"]).split("/");
    rows.forEach((row, rowIndex) => [...row].forEach((pixel, columnIndex) => {
      if (pixel === "1") canvas.rect(cursor + columnIndex * scale, y + rowIndex * scale, scale, scale, colour);
    }));
    cursor += scale * 6;
  }
}

function textWidth(text: string, scale: number): number { return text.normalize("NFKC").length * scale * 6; }

function fittedScale(text: string, maximumWidth: number, preferred: number, minimum = 2): number {
  let scale = preferred;
  while (scale > minimum && textWidth(text, scale) > maximumWidth) scale -= 1;
  return scale;
}

function regionalArtwork(canvas: Canvas, edition: RegionKey, base: RGB, accent: RGB, dark: RGB): void {
  canvas.rect(760, 0, 440, 630, base);
  if (edition === "west") {
    for (let y = 45; y < 640; y += 115) for (let x = 790; x < 1220; x += 115) {
      canvas.diamond(x + (y % 230 ? 55 : 0), y, 45, accent); canvas.diamond(x + (y % 230 ? 55 : 0), y, 23, dark);
    }
  } else if (edition === "east") {
    for (let y = 90; y < 610; y += 95) canvas.line(760, y, 1200, y - 55, 14, y % 190 ? accent : dark);
    canvas.circle(1030, 180, 85, accent); canvas.circle(1030, 180, 58, base);
  } else if (edition === "central") {
    for (let x = 810; x < 1220; x += 105) for (let y = 65; y < 640; y += 145) {
      canvas.circle(x, y, 46, accent); canvas.circle(x, y, 29, dark); canvas.line(x, y - 38, x, y + 38, 6, base);
    }
    canvas.line(795, 0, 1125, 630, 28, accent);
  } else if (edition === "north") {
    for (let y = 65; y < 640; y += 120) for (let x = 815; x < 1220; x += 120) {
      canvas.diamond(x, y, 50, dark); canvas.diamond(x, y, 34, accent); canvas.circle(x, y, 13, base);
    }
  } else {
    for (let y = 55; y < 640; y += 72) for (let x = 790; x < 1220; x += 72) {
      const colour = (x + y) % 144 === 0 ? dark : accent;
      canvas.circle(x, y, 21, colour); canvas.circle(x, y, 8, base);
    }
    canvas.line(770, 555, 1190, 75, 12, dark);
  }
}

function approvedAvatarMedallion(canvas: Canvas, avatarId: string | null, base: RGB, accent: RGB, dark: RGB, cream: RGB): void {
  if (!avatarId) return;
  const seed = [...avatarId].reduce((sum, character) => sum + character.codePointAt(0)!, 0);
  const centreX = 698; const centreY = 238;
  canvas.circle(centreX, centreY, 53, accent);
  canvas.circle(centreX, centreY, 45, base);
  canvas.circle(centreX, centreY + 27, 28, cream);
  canvas.rect(centreX - 28, centreY + 27, 56, 22, cream);
  canvas.circle(centreX, centreY - 8, 18, cream);
  if (seed % 3 === 0) {
    canvas.circle(centreX, centreY - 17, 23, dark);
    canvas.rect(centreX - 18, centreY - 11, 36, 23, cream);
  } else if (seed % 3 === 1) {
    canvas.line(centreX - 25, centreY - 19, centreX + 25, centreY - 19, 12, dark);
    canvas.circle(centreX, centreY - 8, 17, cream);
    canvas.diamond(centreX, centreY - 28, 10, accent);
  } else {
    canvas.circle(centreX - 15, centreY - 21, 11, dark);
    canvas.circle(centreX, centreY - 27, 12, dark);
    canvas.circle(centreX + 15, centreY - 21, 11, dark);
  }
  for (let bead = 0; bead < 5; bead += 1) canvas.circle(centreX - 20 + bead * 10, centreY + 25, 3, seed % 2 ? accent : dark);
}

function previewPixels(contract: ResultPreviewContract): Uint8Array {
  const region = regions[contract.edition];
  const [base, accent, dark] = region.palette.map(hexColour);
  const cream: RGB = [250, 239, 217];
  const canvas = new Canvas();
  canvas.rect(0, 0, 1200, 630, dark);
  regionalArtwork(canvas, contract.edition, base, accent, dark);
  canvas.rect(0, 0, 780, 630, dark);
  canvas.rect(44, 38, 8, 554, accent);
  drawText(canvas, "WHAT'S YOUR BRIDE PRICE?", 82, 55, 4, accent);
  drawText(canvas, "CLASSES FOR CULTURE", 82, 94, 3, cream);
  const editionHeading = `${contract.editionLabel} edition`;
  drawText(canvas, editionHeading, 82, 145, fittedScale(editionHeading, 650, 7, 3), cream);
  drawText(canvas, contract.displayName, 82, 226, 4, accent);
  approvedAvatarMedallion(canvas, contract.avatarId, base, accent, dark, cream);
  drawText(canvas, `${contract.score}/${contract.total}`, 78, 284, 18, cream);
  const titleScale = fittedScale(contract.resultTitle, 640, 7, 4);
  drawText(canvas, contract.resultTitle, 82, 445, titleScale, accent);
  if (contract.masterySeal) drawText(canvas, "REGIONAL MASTERY SEAL", 82, 500, 3, cream);
  const [safeguardLead, safeguardClose] = contract.safeguard.split(", ");
  drawText(canvas, `${safeguardLead},`, 82, 552, fittedScale(`${safeguardLead},`, 650, 3), cream);
  drawText(canvas, safeguardClose, 82, 579, fittedScale(safeguardClose, 650, 3), cream);
  return canvas.pixels;
}

function applyPublicSlugSalt(pixels: Uint8Array, resultSlug: string): Uint8Array {
  if (!/^[0-9a-f]{48}$/.test(resultSlug)) throw new Error("unsafe_result_preview_contract");
  const salted = pixels.slice();
  const bits = [...resultSlug].flatMap((character) => {
    const value = Number.parseInt(character, 16);
    return [3, 2, 1, 0].map((shift) => (value >>> shift) & 1);
  });
  const firstPixel = RESULT_PREVIEW_WIDTH - bits.length;
  bits.forEach((bit, index) => {
    const blue = ((RESULT_PREVIEW_HEIGHT - 1) * RESULT_PREVIEW_WIDTH + firstPixel + index) * 3 + 2;
    salted[blue] = (salted[blue] & 0xfe) | bit;
  });
  return salted;
}

function uint32(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const name = new TextEncoder().encode(type);
  return concatenate([uint32(data.length), name, data, uint32(crc32(concatenate([name, data])))]);
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== "function") throw new Error("result_preview_compression_unavailable");
  const compressed = new CompressionStream("deflate");
  const output = new Response(compressed.readable).arrayBuffer();
  const writer = compressed.writable.getWriter();
  await writer.write(bytes.slice().buffer);
  await writer.close();
  return new Uint8Array(await output);
}

async function encodePng(pixels: Uint8Array): Promise<Uint8Array> {
  const scanlines = new Uint8Array(RESULT_PREVIEW_HEIGHT * (RESULT_PREVIEW_WIDTH * 3 + 1));
  for (let y = 0; y < RESULT_PREVIEW_HEIGHT; y += 1) {
    const target = y * (RESULT_PREVIEW_WIDTH * 3 + 1);
    scanlines[target] = 0;
    scanlines.set(pixels.subarray(y * RESULT_PREVIEW_WIDTH * 3, (y + 1) * RESULT_PREVIEW_WIDTH * 3), target + 1);
  }
  const ihdr = concatenate([uint32(RESULT_PREVIEW_WIDTH), uint32(RESULT_PREVIEW_HEIGHT), Uint8Array.of(8, 2, 0, 0, 0)]);
  return concatenate([
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", await deflate(scanlines)),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function renderResultPreview(result: PublicResultData): Promise<RenderedResultPreview> {
  const contract = safeContract(result);
  const bytes = await encodePng(applyPublicSlugSalt(previewPixels(contract), result.resultSlug));
  if (bytes.length > RESULT_PREVIEW_MAX_BYTES) throw new Error("result_preview_too_large");
  const contentHash = await sha256Hex(bytes);
  return Object.freeze({
    bytes,
    width: RESULT_PREVIEW_WIDTH,
    height: RESULT_PREVIEW_HEIGHT,
    mimeType: RESULT_PREVIEW_MIME,
    contentHash,
    objectKey: buildMediaObjectKey({
      edition: result.edition,
      contentHash,
      generationVersion: RESULT_PREVIEW_GENERATION,
      extension: "png",
      createdAt: new Date(result.createdAt),
    }),
    generationVersion: RESULT_PREVIEW_GENERATION,
    contract,
  });
}
