import { PaidError } from "./errors.ts";
import type { KvStore } from "./games.ts";
import { muxResultMp4 } from "./mp4Mux.ts";
import { parseResultVideoQuery, resultVideoCacheKey, resultVideoStory, VIDEO_HEIGHT, VIDEO_WIDTH } from "./resultVideo.ts";
import type { PaidServices } from "./serve.ts";

const MAX_UPLOAD = 4_000_000;

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

function requireFlag(services: PaidServices): void {
  if (!services.resultVideo) throw new PaidError("result_video_disabled", 404);
}

export function mp4IsResultTemplate(bytes: Uint8Array): boolean {
  if (bytes.length < 1_000 || bytes.length > MAX_UPLOAD) return false;
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 64));
  if (!head.includes("ftyp")) return false;
  const body = new TextDecoder("latin1").decode(bytes);
  if (!body.includes("avc1") || !body.includes("mp4a")) return false;
  for (let index = 0; index + 88 < bytes.length; index += 1) {
    if (bytes[index] !== 0x74 || bytes[index + 1] !== 0x6b || bytes[index + 2] !== 0x68 || bytes[index + 3] !== 0x64) continue;
    if (bytes[index + 4] !== 0) continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset + index + 4, 84);
    const width = view.getUint32(76) >>> 16;
    const height = view.getUint32(80) >>> 16;
    if (width === VIDEO_WIDTH && height === VIDEO_HEIGHT) return true;
  }
  return false;
}

async function readCached(kv: KvStore, key: string): Promise<Uint8Array | null> {
  try {
    const stored = await kv.get(key);
    return stored ? base64ToBytes(stored) : null;
  } catch {
    return null;
  }
}

async function storeCached(kv: KvStore, key: string, bytes: Uint8Array): Promise<void> {
  try {
    await kv.put(key, bytesToBase64(bytes));
  } catch { /* the caller still has the bytes */ }
}

/** A phone that cannot encode H.264 still receives a playable file. */
async function bakedResultMp4(services: PaidServices, edition: string, score: number): Promise<Uint8Array | null> {
  if (!services.assets) return null;
  const asset = await services.assets.fetch(new Request(`https://assets.local/result-videos/${edition}-${score}.mp4`));
  if (!asset.ok) return null;
  const bytes = new Uint8Array(await asset.arrayBuffer());
  if (bytes.length < 1_000 || bytes.length > MAX_UPLOAD) return null;
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 32));
  if (!head.includes("ftyp")) return null;
  return bytes;
}

function mp4Response(bytes: Uint8Array, cache: "hit" | "miss" | "baked"): Response {
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-type": "video/mp4",
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
      "x-result-video-cache": cache,
    },
  });
}

export async function handleResultVideoStory(url: URL, services: PaidServices): Promise<Response> {
  requireFlag(services);
  const query = parseResultVideoQuery(url);
  const story = resultVideoStory(query.edition, query.score, query.referral);
  return Response.json(story, {
    headers: {
      "cache-control": "public, max-age=3600",
      "x-result-video-key": resultVideoCacheKey(query.edition, query.score, story.title),
    },
  });
}

export async function handleResultVideoFile(request: Request, url: URL, services: PaidServices): Promise<Response> {
  requireFlag(services);
  const query = parseResultVideoQuery(url);
  const story = resultVideoStory(query.edition, query.score, null);
  const key = resultVideoCacheKey(query.edition, query.score, story.title);
  if (request.method === "GET") {
    const cached = await readCached(services.kv, key);
    if (cached && mp4IsResultTemplate(cached)) return mp4Response(cached, "hit");
    const baked = await bakedResultMp4(services, query.edition, query.score);
    if (baked) return mp4Response(baked, "baked");
    return Response.json({ mode: "client", story }, {
      status: 404,
      headers: { "cache-control": "no-store", "x-result-video-mode": "client" },
    });
  }
  if (request.method !== "POST") throw new PaidError("method_not_allowed", 405);
  const existing = await readCached(services.kv, key);
  if (existing && mp4IsResultTemplate(existing)) return mp4Response(existing, "hit");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!mp4IsResultTemplate(bytes)) throw new PaidError("video_invalid", 400);
  await storeCached(services.kv, key, bytes);
  return mp4Response(bytes, "miss");
}

/** Used by tests to prove the muxer stamps the story size and a silent audio track. */
export function sampleTemplateMp4(): Uint8Array {
  const avcC = Uint8Array.from([0x01, 0x42, 0x00, 0x1f, 0xff, 0xe1, 0x00, 0x03, 0x67, 0x42, 0x00, 0x01, 0x00, 0x03, 0x68, 0xce, 0x06]);
  const sample = Uint8Array.from([0x00, 0x00, 0x00, 0x04, 0x65, 0x88, 0x84, 0x00]);
  return muxResultMp4({
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    fps: 30,
    seconds: 5,
    avcC,
    samples: Array.from({ length: 150 }, (_, index) => ({ data: sample, key: index % 30 === 0 })),
  });
}
