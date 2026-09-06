import { getQuestionSelectionRuntime } from "../../questionSelectionRuntime.ts";
import { QuestionSelectionError } from "../../../db/questionSelection.ts";
import { QuestionSelectionRequestError } from "../../../db/questionSelectionService.ts";

const responseHeaders = Object.freeze({
  "cache-control": "private, no-store, max-age=0, must-revalidate",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});
function response(body: Record<string, unknown>, status: number): Response { return Response.json(body, { status, headers: responseHeaders }); }
function sameOrigin(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === "https:" && request.headers.get("origin") === url.origin && request.headers.get("sec-fetch-site") === "same-origin";
}

export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return response({ available: false }, 403);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return response({ available: false }, 415);
  const length = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(length) && length > 16_384) return response({ available: false }, 413);
  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > 16_384) return response({ available: false }, 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return response({ available: false }, 400); }
  try {
    const runtime = await getQuestionSelectionRuntime();
    if (!runtime) return response({ available: false }, 503);
    const selection = await runtime.start(body);
    return response({ available: true, ...selection }, 201);
  } catch (error) {
    if (error instanceof QuestionSelectionRequestError) return response({ available: false }, 400);
    if (error instanceof QuestionSelectionError && error.code === "insufficient_published_bank") return response({ available: false, reason: "insufficient_published_bank" }, 409);
    return response({ available: false }, 503);
  }
}
