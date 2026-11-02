import type { RegionKey } from "../app/gameData.ts";
import { PaidError } from "./errors.ts";
import type { KvStore } from "./games.ts";
import type { ShareFrame } from "./shareCard.ts";

const EDITIONS = new Set<RegionKey>(["west", "east", "central", "north", "south"]);
const SCORE = /^(0|[1-9]|1[0-2])$/;

export type ShareCardParams = { edition: RegionKey; score: number; frame: ShareFrame };

/** Only the 5 editions, scores 0–12, and the two frames are real cards. Extra query keys are ignored. */
export function normalizeShareCardQuery(url: URL): ShareCardParams {
  const edition = url.searchParams.get("edition") ?? "";
  if (!EDITIONS.has(edition as RegionKey)) throw new PaidError("edition_invalid", 400);
  const scoreText = url.searchParams.get("score") ?? "";
  if (!SCORE.test(scoreText)) throw new PaidError("score_invalid", 400);
  const frameText = url.searchParams.get("frame");
  if (frameText !== null && frameText !== "card" && frameText !== "story") throw new PaidError("frame_invalid", 400);
  return { edition: edition as RegionKey, score: Number(scoreText), frame: frameText === "story" ? "story" : "card" };
}

export function shareCardKvKey(params: ShareCardParams): string {
  return `share-png:v1:${params.edition}:${params.score}:${params.frame}`;
}

export function shareCardCacheRequest(params: ShareCardParams): Request {
  return new Request(`https://share-card.wybp/png/v1/${params.edition}/${params.score}/${params.frame}`);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
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

export async function readCachedSharePng(kv: KvStore, params: ShareCardParams): Promise<Uint8Array | null> {
  const request = shareCardCacheRequest(params);
  const cache = await edgeCache();
  if (cache) {
    try {
      const hit = await cache.match(request);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
    } catch { /* the edge cache is optional */ }
  }
  try {
    const stored = await kv.get(shareCardKvKey(params));
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

export async function storeCachedSharePng(kv: KvStore, params: ShareCardParams, png: Uint8Array): Promise<void> {
  const request = shareCardCacheRequest(params);
  const cache = await edgeCache();
  if (cache) {
    try {
      await cache.put(request, new Response(Buffer.from(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } }));
    } catch { /* a cache miss next time still has KV */ }
  }
  try {
    await kv.put(shareCardKvKey(params), bytesToBase64(png));
  } catch { /* the rendered bytes are still returned */ }
}
