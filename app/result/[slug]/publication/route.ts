import { activeFeatureFlags } from "../../../featureFlags";
import { createResultPreviewUrl } from "../../../publicAppOrigin";
import { getReviewResultRuntime } from "../../../resultReviewRuntime";
import { ResultPublicationError } from "../../../../db/resultPublication";

type PublicationRouteContext = Readonly<{ params: Promise<{ slug: string }> | { slug: string } }>;
const neutralMessage = "This result is no longer available."; const temporaryMessage = "We could not update this result right now.";
function json(body: Record<string, unknown>, status: number): Response { return Response.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function sameOrigin(request: Request): boolean { const url = new URL(request.url); const origin = request.headers.get("origin"); const fetchSite = request.headers.get("sec-fetch-site"); return origin === url.origin && (!fetchSite || fetchSite === "same-origin"); }

export async function POST(request: Request, context: PublicationRouteContext): Promise<Response> {
  const { slug } = await Promise.resolve(context.params);
  if (!activeFeatureFlags.dynamic_results || !/^[0-9a-f]{48}$/.test(slug)) return json({ updated: false, message: neutralMessage }, 404);
  if (!sameOrigin(request)) return json({ updated: false, message: temporaryMessage }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ updated: false, message: temporaryMessage }, 415);
  const declaredLength = Number(request.headers.get("content-length") || "0"); if (Number.isFinite(declaredLength) && declaredLength > 1024) return json({ updated: false, message: temporaryMessage }, 413);
  const raw = await request.text(); if (!raw || raw.length > 1024) return json({ updated: false, message: temporaryMessage }, 400);
  let body: unknown; try { body = JSON.parse(raw); } catch { return json({ updated: false, message: temporaryMessage }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ updated: false, message: temporaryMessage }, 400);
  const candidate = body as Record<string, unknown>; if (Object.keys(candidate).sort().join(",") !== "action,anonymousSessionCredential") return json({ updated: false, message: temporaryMessage }, 400);
  const runtime = await getReviewResultRuntime(); if (!runtime) return json({ updated: false, message: neutralMessage }, 404);
  try {
    const before = await runtime.repository.getOwnedResult(slug);
    const response = await runtime.publicationService.setVisibility({ resultSlug: slug, anonymousSessionCredential: candidate.anonymousSessionCredential, action: candidate.action });
    if (!response.published) { if (before) await runtime.mediaService.revoke(before.id, slug); return json({ updated: true, published: false, visibility: "private", resultUrl: null, previewUrl: null }, 200); }
    const resolved = await runtime.resultService.getPublic(slug); if (!resolved) throw new Error("public_result_missing_after_publication");
    const media = await runtime.mediaService.prepare(resolved.internalResultId, resolved.data);
    return json({ updated: true, published: true, visibility: "public", resultUrl: response.resultUrl, previewUrl: createResultPreviewUrl(slug, media.contentHash), result: response.result }, 200);
  } catch (error) {
    if (error instanceof ResultPublicationError) { if (["result_unavailable", "storage_unavailable"].includes(error.code)) return json({ updated: false, message: neutralMessage }, 404); if (error.code === "rate_limited") return json({ updated: false, message: error.publicMessage }, 429); }
    return json({ updated: false, message: temporaryMessage }, 503);
  }
}
