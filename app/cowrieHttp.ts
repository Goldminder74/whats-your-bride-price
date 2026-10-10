import { activeFeatureFlags } from "./featureFlags.ts";
import { PUBLIC_APP_ORIGIN } from "./publicAppOrigin.ts";

const headers = Object.freeze({
  "cache-control": "private, no-store, max-age=0, must-revalidate",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

export function cowrieResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers });
}

export async function readCowriePost(request: Request): Promise<unknown> {
  if (!activeFeatureFlags.cowrie_economy || !activeFeatureFlags.random_quick_play) throw Object.assign(new Error("disabled"), { status: 404 });
  const url = new URL(request.url);
  if (request.method !== "POST") throw Object.assign(new Error("method"), { status: 405 });
  const mode = request.headers.get("sec-fetch-mode");
  if (url.protocol !== "https:" || url.origin !== PUBLIC_APP_ORIGIN || request.headers.get("origin") !== PUBLIC_APP_ORIGIN || request.headers.get("sec-fetch-site") !== "same-origin" || (mode !== "cors" && mode !== "same-origin")) throw Object.assign(new Error("origin"), { status: 403 });
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw Object.assign(new Error("content"), { status: 415 });
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > 4096) throw Object.assign(new Error("large"), { status: 413 });
  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > 4096) throw Object.assign(new Error("invalid"), { status: 400 });
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error("invalid"), { status: 400 }); }
}

export function cowrieError(error: unknown): Response {
  const candidate = error as { status?: number; code?: string };
  const status = candidate.status || (candidate.code === "cowrie_rate_limited" ? 429 : candidate.code === "cowrie_required" ? 402 : candidate.code?.includes("unavailable") ? 503 : candidate.code?.includes("conflict") ? 409 : 400);
  return cowrieResponse({ available: false }, status);
}
