import { DAILY_REQUEST_BODY_LIMIT } from "../db/dailyChallenge.ts";

export const dailyResponseHeaders = Object.freeze({
  "cache-control": "private, no-store, max-age=0, must-revalidate",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

export function dailyJson(body: Readonly<Record<string, unknown>>, status: number): Response {
  return Response.json(body, { status, headers: dailyResponseHeaders });
}

export function safeDailyRequest(request: Request): boolean {
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) return false;
  if (request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") !== "same-origin") return false;
  const mode = request.headers.get("sec-fetch-mode");
  return mode === "cors" || mode === "same-origin";
}

export async function readDailyJson(request: Request): Promise<unknown> {
  if ((request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new Error("daily_content_type");
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > DAILY_REQUEST_BODY_LIMIT) throw new Error("daily_size");
  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > DAILY_REQUEST_BODY_LIMIT) throw new Error("daily_size");
  return JSON.parse(raw);
}
