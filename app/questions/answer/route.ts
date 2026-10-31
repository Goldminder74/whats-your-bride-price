import { activeFeatureFlags } from "../../featureFlags.ts";
import { getQuestionSelectionRuntime } from "../../questionSelectionRuntime.ts";
import { QuestionSelectionRequestError } from "../../../db/questionSelectionService.ts";

const headers = Object.freeze({
  "cache-control": "private, no-store, max-age=0, must-revalidate",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});
const json = (body: Record<string, unknown>, status: number) => Response.json(body, { status, headers });
function safe(request: Request): boolean {
  const url = new URL(request.url);
  return request.method === "POST" && url.protocol === "https:" && request.headers.get("origin") === url.origin
    && request.headers.get("sec-fetch-site") === "same-origin"
    && request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

export async function POST(request: Request): Promise<Response> {
  if (!activeFeatureFlags.random_quick_play) return json({ accepted: false }, 404);
  if (!safe(request)) return json({ accepted: false }, 403);
  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > 4096) return json({ accepted: false }, 400);
  try {
    const runtime = await getQuestionSelectionRuntime();
    if (!runtime) return json({ accepted: false }, 503);
    return json(await runtime.answer(JSON.parse(raw)), 200);
  } catch (error) {
    if (error instanceof QuestionSelectionRequestError) return json({ accepted: false }, error.code === "selection_rate_limited" ? 429 : error.code === "selection_rate_limit_unavailable" ? 503 : error.code.includes("unavailable") ? 404 : 400);
    return json({ accepted: false }, 400);
  }
}
