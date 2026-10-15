import { activeFeatureFlags } from "../../../../featureFlags";
import { getReviewResultRuntime } from "../../../../resultReviewRuntime";

type PreviewRouteContext = Readonly<{ params: Promise<{ slug: string; asset: string }> | { slug: string; asset: string } }>;
function unavailable(): Response { return new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } }); }

export async function GET(request: Request, context: PreviewRouteContext): Promise<Response> {
  const { slug, asset } = await Promise.resolve(context.params);
  const match = asset.match(/^([0-9a-f]{64})\.png$/);
  if (!activeFeatureFlags.dynamic_results || !/^[0-9a-f]{48}$/.test(slug) || !match) return unavailable();
  const runtime = await getReviewResultRuntime();
  if (!runtime || !(await runtime.resultService.getPublic(slug))) return unavailable();
  const media = await runtime.mediaService.get(slug, match[1]);
  if (!media) return unavailable();
  const etag = `"${media.record.contentHash}"`;
  const headers = { "cache-control": "public, max-age=31536000, immutable", "content-type": media.record.mimeType, "content-length": String(media.bytes.length), etag, "x-content-type-options": "nosniff" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(media.bytes.slice().buffer, { status: 200, headers });
}
export async function HEAD(request: Request, context: PreviewRouteContext): Promise<Response> { const response = await GET(request, context); return new Response(null, { status: response.status, headers: response.headers }); }
