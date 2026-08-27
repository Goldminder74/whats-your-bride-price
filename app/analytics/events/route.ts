import { ANALYTICS_MAX_BODY_BYTES } from "../../../db/analytics.ts";
import { AnalyticsValidationError } from "../../../db/analyticsContracts.ts";
import { getAnalyticsService } from "../../analyticsRuntime.ts";
import { activeFeatureFlags } from "../../featureFlags.ts";

function json(body: Readonly<Record<string, unknown>>, status: number): Response {
  return Response.json(body, { status, headers: {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  } });
}

function safeRequest(request: Request): boolean {
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) return false;
  if (request.headers.get("origin") !== url.origin) return false;
  if (request.headers.get("sec-fetch-site") !== "same-origin") return false;
  const mode = request.headers.get("sec-fetch-mode");
  return mode === "cors" || mode === "same-origin";
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

export async function POST(request: Request): Promise<Response> {
  if (!activeFeatureFlags.first_party_analytics) return json({ accepted: false }, 404);
  if (!safeRequest(request)) return json({ accepted: false }, 403);
  if ((request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") return json({ accepted: false }, 415);
  const length = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(length) && length > ANALYTICS_MAX_BODY_BYTES) return json({ accepted: false }, 413);
  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > ANALYTICS_MAX_BODY_BYTES) return json({ accepted: false }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ accepted: false }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ accepted: false }, 400);
  const candidate = body as Record<string, unknown>;
  const service = await getAnalyticsService();
  if (!service) return json({ accepted: false }, 503);
  try {
    if (candidate.action === "accept" && exactKeys(candidate, ["action", "analyticsSessionCredential", "event"])) {
      const result = await service.accept(candidate.analyticsSessionCredential, candidate.event);
      return json(result, 202);
    }
    if (candidate.action === "events" && exactKeys(candidate, ["action", "analyticsSessionCredential", "events"])) {
      const result = await service.ingest(candidate.analyticsSessionCredential, candidate.events);
      return json(result, 202);
    }
    if (candidate.action === "withdraw" && exactKeys(candidate, ["action", "analyticsSessionCredential"])) {
      const result = await service.withdraw(candidate.analyticsSessionCredential);
      return json(result, 202);
    }
    return json({ accepted: false }, 400);
  } catch (error) {
    if (error instanceof AnalyticsValidationError) {
      if (error.code === "analytics_rate_limited") return json({ accepted: false }, 429);
      if (["analytics_storage_unavailable", "analytics_rate_limit_unavailable", "consent_persistence_failed"].includes(error.code)) return json({ accepted: false }, 503);
      if (error.code === "referral_unavailable") return json({ accepted: false }, 404);
      return json({ accepted: false }, 400);
    }
    return json({ accepted: false }, 503);
  }
}
