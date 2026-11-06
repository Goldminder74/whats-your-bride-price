import type { RegionKey } from "../app/gameData.ts";
import { CANONICAL_ORIGIN } from "./catalog.ts";
import { PaidError } from "./errors.ts";
import type { KvStore } from "./games.ts";
import { DECREE_PREVIEW_HEIGHT, DECREE_PREVIEW_WIDTH, previewDisplayName } from "./decreePreviewName.ts";
import { isFrameKey, type FrameKey } from "./frameStyle.ts";
import { royalDecreeSvg } from "./royalDecree.ts";
import { pngSize, renderShareCardPng } from "./shareCardPng.ts";
import type { PaidServices } from "./serve.ts";

const PREVIEW_ISSUED_AT = Date.UTC(2026, 10, 2);

const EDITIONS = new Set<RegionKey>(["west", "east", "central", "north", "south"]);
const SCORE = /^(0|[1-9]|1[0-2])$/;
const ART_FILE: Record<RegionKey, string> = {
  west: "west.jpg",
  east: "east.jpg",
  central: "central.jpg",
  north: "north.jpg",
  south: "south.jpg",
};

export type DecreePreviewParams = { edition: RegionKey; score: number; name: string; style?: FrameKey | null };

function cacheKey(params: DecreePreviewParams): string {
  const style = params.style ? `:${params.style}` : "";
  return `decree-preview:v1:${params.edition}:${params.score}:${encodeURIComponent(params.name)}${style}`;
}

function cacheRequest(params: DecreePreviewParams): Request {
  const style = params.style ? `/${params.style}` : "";
  return new Request(`https://decree-preview.wybp/v1/${params.edition}/${params.score}/${encodeURIComponent(params.name)}${style}`);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function edgeCache(): Promise<Cache | null> {
  try {
    const storage = caches as CacheStorage & { default?: Cache };
    return storage.default ?? null;
  } catch {
    return null;
  }
}

async function readCached(kv: KvStore, params: DecreePreviewParams): Promise<Uint8Array | null> {
  const request = cacheRequest(params);
  const cache = await edgeCache();
  if (cache) {
    try {
      const hit = await cache.match(request);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
    } catch { /* the edge cache is optional */ }
  }
  try {
    const stored = await kv.get(cacheKey(params));
    if (!stored) return null;
    const bytes = base64ToBytes(stored);
    if (cache) {
      try {
        await cache.put(request, new Response(Buffer.from(bytes), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } }));
      } catch { /* refill is optional */ }
    }
    return bytes;
  } catch {
    return null;
  }
}

async function storeCached(kv: KvStore, params: DecreePreviewParams, png: Uint8Array): Promise<void> {
  const request = cacheRequest(params);
  const cache = await edgeCache();
  if (cache) {
    try {
      await cache.put(request, new Response(Buffer.from(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } }));
    } catch { /* a cache miss next time still has KV */ }
  }
  try {
    await kv.put(cacheKey(params), bytesToBase64(png));
  } catch { /* the rendered bytes are still returned */ }
}

async function artwork(services: PaidServices, edition: RegionKey): Promise<string | null> {
  if (!services.assets) return null;
  try {
    const asset = await services.assets.fetch(new Request(new URL(`/share-art/${ART_FILE[edition]}`, CANONICAL_ORIGIN)));
    if (!asset.ok) return null;
    const bytes = new Uint8Array(await asset.arrayBuffer());
    if (bytes.length < 32) return null;
    return `data:image/jpeg;base64,${bytesToBase64(bytes)}`;
  } catch {
    return null;
  }
}

function pngResponse(bytes: Uint8Array, cache: "hit" | "miss"): Response {
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
      "x-decree-preview-cache": cache,
    },
  });
}

export async function handleDecreePreview(url: URL, services: PaidServices): Promise<Response> {
  if (!services.royalRevealEnabled) throw new PaidError("royal_reveal_unavailable", 404);
  const edition = url.searchParams.get("edition") ?? "";
  if (!EDITIONS.has(edition as RegionKey)) throw new PaidError("edition_invalid", 400);
  const scoreText = url.searchParams.get("score") ?? "";
  if (!SCORE.test(scoreText)) throw new PaidError("score_invalid", 400);
  const styleText = url.searchParams.get("style");
  if (styleText !== null && !isFrameKey(styleText)) throw new PaidError("frame_invalid", 400);
  if (styleText && !services.boosters) throw new PaidError("boosters_disabled", 404);
  const style = styleText && isFrameKey(styleText) ? styleText : null;
  if (style) {
    const player = url.searchParams.get("player") || "";
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(player) || !(await services.repository.boosters.ownsFrame(player, style))) {
      throw new PaidError("frame_not_owned", 403);
    }
  }
  const params: DecreePreviewParams = {
    edition: edition as RegionKey,
    score: Number(scoreText),
    name: previewDisplayName(url.searchParams.get("name")),
    style,
  };
  const cached = await readCached(services.kv, params);
  if (cached) return pngResponse(cached, "hit");
  const svg = royalDecreeSvg({
    edition: params.edition,
    score: params.score,
    displayName: params.name,
    certificate: "PREVIEW",
    artwork: await artwork(services, params.edition),
    issuedAt: PREVIEW_ISSUED_AT,
    preview: true,
    style: params.style,
  });
  if (!svg.includes(">PREVIEW<")) throw new PaidError("preview_unavailable", 500);
  const png = await renderShareCardPng(svg, DECREE_PREVIEW_WIDTH);
  const size = pngSize(png);
  if (size.width !== DECREE_PREVIEW_WIDTH || size.height !== DECREE_PREVIEW_HEIGHT) {
    throw new PaidError("preview_unavailable", 500);
  }
  await storeCached(services.kv, params, png);
  return pngResponse(png, "miss");
}
