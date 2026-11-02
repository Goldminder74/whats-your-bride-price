import type { KvStore } from "./games.ts";

export type RevealFile = "card" | "story" | "pdf" | "zip";

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

export function revealCacheKey(orderId: string, file: RevealFile): string {
  return `royal-file:v1:${orderId}:${file}`;
}

export function revealCacheRequest(orderId: string, file: RevealFile): Request {
  return new Request(`https://royal-reveal.wybp/v1/${orderId}/${file}`);
}

async function edgeCache(): Promise<Cache | null> {
  try {
    const storage = caches as CacheStorage & { default?: Cache };
    return storage.default ?? null;
  } catch {
    return null;
  }
}

/** Rendered bytes only. Callers must already have checked the paid entitlement. */
export async function readCachedReveal(kv: KvStore, orderId: string, file: RevealFile): Promise<Uint8Array | null> {
  const request = revealCacheRequest(orderId, file);
  const cache = await edgeCache();
  if (cache) {
    try {
      const hit = await cache.match(request);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
    } catch { /* the edge cache is optional */ }
  }
  try {
    const stored = await kv.get(revealCacheKey(orderId, file));
    if (!stored) return null;
    const bytes = base64ToBytes(stored);
    if (cache) {
      try {
        await cache.put(request, new Response(Buffer.from(bytes), { headers: { "cache-control": "private, max-age=86400" } }));
      } catch { /* refill is optional */ }
    }
    return bytes;
  } catch {
    return null;
  }
}

export async function storeCachedReveal(kv: KvStore, orderId: string, file: RevealFile, bytes: Uint8Array): Promise<void> {
  const request = revealCacheRequest(orderId, file);
  const cache = await edgeCache();
  if (cache) {
    try {
      await cache.put(request, new Response(Buffer.from(bytes), { headers: { "cache-control": "private, max-age=86400" } }));
    } catch { /* KV still holds the bytes */ }
  }
  try {
    await kv.put(revealCacheKey(orderId, file), bytesToBase64(bytes));
  } catch { /* the response is still returned */ }
}
